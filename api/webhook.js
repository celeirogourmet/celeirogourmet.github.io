import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;
const WPP_NUM = process.env.WPP_NUM; // seu número, ex: 5532984682311

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

async function sendWhatsApp(payment) {
  try {
    const payer = payment.payer;
    const items = payment.additional_info?.items || [];
    const total = (payment.transaction_amount || 0).toFixed(2).replace(".", ",");

    const itens = items.map(i =>
      `• ${i.quantity}x ${i.title} — R$ ${(parseFloat(i.unit_price) * parseInt(i.quantity)).toFixed(2).replace(".", ",")}`
    ).join("\n");

    const msg = `✅ *Pagamento confirmado!*\n\n*Cliente:* ${payer?.first_name || ""} ${payer?.last_name || ""}\n*Telefone:* ${payer?.phone?.number || "-"}\n\n*Itens:*\n${itens}\n\n*Total: R$ ${total}*\n\n*ID do pagamento:* ${payment.id}`;

    const encoded = encodeURIComponent(msg);
    const url = `https://api.whatsapp.com/send?phone=${WPP_NUM}&text=${encoded}`;

    // Loga o link no console da Vercel (aparece nos logs do deploy)
    console.log("WhatsApp notificação:", url);

    // Alternativa: se tiver a API do WhatsApp Business configurada, chame ela aqui
  } catch (err) {
    console.error("Erro ao montar mensagem WhatsApp:", err);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifySignature(req)) {
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

    // Baixa estoque
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

    // Notifica WhatsApp
    await sendWhatsApp(payment);

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message });
  }
}
