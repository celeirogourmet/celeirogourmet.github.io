const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

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
      id: String(item.id),
      title: item.name,
      quantity: item.qty,
      unit_price: Number(item.price),
      currency_id: 'BRL',
    })),
    payer: {
      name: payer?.name || '',
      phone: { number: payer?.phone || '' },
      identification: {
        type: 'CPF',
        number: payer?.cpf || '',
      },
    },
    payment_methods: {
      installments: 1,
    },
    back_urls: {
      success: 'https://www.celeirogourmet.net.br?pagamento=sucesso',
      failure: 'https://www.celeirogourmet.net.br?pagamento=erro',
      pending: 'https://www.celeirogourmet.net.br?pagamento=sucesso',
    },
    auto_return: 'all',
    statement_descriptor: 'Celeiro Gourmet',
    binary_mode: false,
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

    // Salvar pedido com status 'pending' — webhook vai atualizar para 'paid' quando confirmado
    await sbFetch('/rest/v1/Orders', {
      method: 'POST',
      body: JSON.stringify({
        preference_id: data.id,
        payer_name: payer?.name || '',
        payer_phone: payer?.phone || '',
        payer_address: payer?.address || '',
        items: JSON.stringify(items),
        status: 'pending',
      })
    });

    return res.status(200).json({ url: data.init_point, preference_id: data.id });

  } catch (err) {
    console.error('Erro interno:', err);
    return res.status(500).json({ error: err.message });
  }
}
