export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { items, payer } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ error: 'Nenhum item no pedido' });
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

  const preference = {
    items: items.map(item => ({
      title: item.name,
      quantity: item.qty,
      unit_price: Number(item.price),
      currency_id: 'BRL',
    })),
    payer: {
      name: payer?.name || '',
      phone: { number: payer?.phone || '' },
    },
    payment_methods: {
      installments: 1,
    },
    statement_descriptor: 'Celeiro Gourmet',
  };

  try {
    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preference),
    });

    const data = await mpRes.json();

    if (!mpRes.ok) {
      console.error('Erro MP:', data);
      return res.status(500).json({ error: data.message || 'Erro ao criar preferência' });
    }

    // init_point = produção | sandbox_init_point = testes
    return res.status(200).json({ url: data.init_point });

  } catch (err) {
    console.error('Erro interno:', err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}
