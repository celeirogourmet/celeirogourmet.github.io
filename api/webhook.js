import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;

async function sbFetch(path, opts = {}) {
  const res = await fetch(SUPABASE_URL + path, {
    ...opts,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function verifySignature(req) {
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

  if (!verifySignature(req)) {
    console.log("Assinatura inválida");
    return res.status(401).json({ error: "Invalid signature" });
  }

  try {
    const { type, data } = req.body;
    console.log("Tipo:", type, "Data:", JSON.stringify(data));

    if (type !== "payment") {
      return res.status(200).json({ status: "ignored" });
    }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` }
    });
    const payment = await mpRes.json();
    console.log("Status pagamento:", payment.status);
    console.log("Preference ID:", payment.preference_id);
    console.log("Order ID:", payment.order?.id);
    console.log("External ref:", payment.external_reference);
    console.log("Keys:", Object.keys(payment).join(', '));

    if (payment.status !== "approved") {
      return res.status(200).json({ status: "not approved" });
    }

    // Baixar estoque
    const items = payment.additional_info?.items || [];
    console.log("Itens:", JSON.stringify(items));
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
      console.log("Estoque atualizado produto", productId, "para", newStock);
    }

    // Buscar preference_id via order_id
    let prefId = payment.preference_id;
    if (!prefId && payment.order?.id) {
      const orderRes = await fetch(`https://api.mercadopago.com/merchant_orders/${payment.order.id}`, {
        headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` }
      });
      const orderData = await orderRes.json();
      prefId = orderData.preference_id;
      console.log("Preference ID via order:", prefId);
    }

    if (prefId) {
      const updateResult = await sbFetch(`/rest/v1/Orders?preference_id=eq.${prefId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: 'paid' })
      });
      console.log("Update Orders resultado:", JSON.stringify(updateResult));
    } else {
      console.log("Preference ID não encontrado, pulando update");
    }

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
