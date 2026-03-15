const SUPABASE_URL = "https://nagflmrbugvxxndbwiws.supabase.co";
const SUPABASE_KEY = "sb_publishable_FCmhlRVy2e98Q8FixCB3LQ_d_-n0Qnl";
const MP_ACCESS_TOKEN = "APP_USR-3538392104141062-031515-3f9092a405164d5e0de933e13ea0a779-3269903160";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { type, data } = req.body;

    // Only process payment notifications
    if (type !== "payment") {
      return res.status(200).json({ status: "ignored" });
    }

    // Fetch payment details from Mercado Pago
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` }
    });
    const payment = await mpRes.json();

    // Only process approved payments
    if (payment.status !== "approved") {
      return res.status(200).json({ status: "not approved" });
    }

    // Get items from payment
    const items = payment.additional_info?.items || [];

    // Update stock for each item
    for (const item of items) {
      const productId = item.id;
      const qty = parseInt(item.quantity) || 1;

      if (!productId) continue;

      // Get current stock
      const rows = await sbFetch(`/rest/v1/products?id=eq.${productId}&select=stock`);
      if (!rows || rows.length === 0) continue;

      const currentStock = rows[0].stock;
      if (currentStock === null) continue; // unlimited stock

      const newStock = Math.max(0, currentStock - qty);

      // Update stock
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
