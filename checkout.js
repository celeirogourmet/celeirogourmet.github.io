const MP_ACCESS_TOKEN = "APP_USR-3538392104141062-031515-3f9092a405164d5e0de933e13ea0a779-3269903160";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { items, payer } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Nenhum item no pedido" });
    }

    const preference = {
      items: items.map(item => ({
        id: String(item.id),
        title: item.name,
        quantity: item.qty,
        unit_price: Number(item.price),
        currency_id: "BRL"
      })),
      payer: {
        name: payer?.name || "",
        phone: { number: payer?.phone || "" }
      },
      back_urls: {
        success: "https://celeirogourmet.net.br?pagamento=aprovado",
        failure: "https://celeirogourmet.net.br?pagamento=falhou",
        pending: "https://celeirogourmet.net.br?pagamento=pendente"
      },
      auto_return: "approved",
      notification_url: "https://celeirogourmet.net.br/api/webhook"
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(preference)
    });

    const data = await mpRes.json();

    if (!mpRes.ok) {
      return res.status(500).json({ error: data.message || "Erro ao criar preferência" });
    }

    return res.status(200).json({ url: data.init_point });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({ error: err.message });
  }
}
