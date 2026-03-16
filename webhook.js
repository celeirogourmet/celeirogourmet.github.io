const SUPABASE_URL = "https://nagflmrbugvxxndbwiws.supabase.co";
const SUPABASE_KEY = "sb_publishable_FCmhlRVy2e98Q8FixCB3LQ_d_-n0Qnl";
const MP_ACCESS_TOKEN = "APP_USR-3538392104141062-031515-3f9092a405164d5e0de933e13ea0a779-3269903160";
const MP_WEBHOOK_SECRET = "cc167b11b6ae1460396ed0deaa52cab6546dc6ca42cb1bbb58a1c53c2fa5b2cd";

import crypto from "crypto";

async function sbFetch(path, opts = {}) {
  const res = await fetch(SUPABASE_URL + path, {
    ...opts,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function verifySignature(req, body) {
  try {
    const xSignature = req.headers["x-signature"];
    const xRequestId = req.headers["x-request-id"];
    const dataId = req.query?.["data.id"] || req.body?.data?.id;
    if (!xSignature) return false;
    const parts = xSignature.split(",");
    let ts, hash;
    for (const part of parts) {
      const [key, val] = part.trim().split("=");
      if (key === "ts") ts = val;
      if (key === "v1") hash = val;
    }
    if (!ts || !hash) return false;
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const hmac = crypto.createHmac("sha256", MP_WEBHOOK_SECRET).update(manifest).digest("hex");
    return hmac === hash;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifySignature(req, req.body)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  try {
    const { type, data } = req.body;

    if (type !== "payment") {
      return res.status(200).json({ status: "ignored" });
    }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` }
    });
    const payment = await mpRes.json();

    if (payment.status !== "approved") {
      return res.status(200).json({ status: "not approved" });
    }

    const items = payment.additional_info?.items || [];

    for (const item of items) {
      const productId = item.id;
      const qty = parseInt(item.quantity) || 1;
      if (!productId) continue;

      const rows = await sbFetch(`/rest/v1/products?id=eq.${productId}&select=stock`);
      if (!rows || rows.length === 0) continue;

      const currentStock = rows[0].stock;
      if (currentStock === null) continue;

      const newStock = Math.max(0, currentStock - qty);
      await sbFetch(`/rest/v1/products?id=eq.${productId}`, {
        method: "PATCH",
        body: JSON.stringify({ stock: newStock })
      });
    }

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message });
  }
}

