import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { items, payer } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ error: 'Nenhum item no pedido' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: items.map(item => ({
        price_data: {
          currency: 'brl',
          product_data: {
            name: item.name,
          },
          unit_amount: Math.round(Number(item.price) * 100),
        },
        quantity: item.qty,
      })),
      mode: 'payment',
      metadata: {
        payer_name: payer?.name || '',
        payer_phone: payer?.phone || '',
        payer_address: payer?.address || '',
        items: JSON.stringify(items.map(i => ({ id: i.id, qty: i.qty }))),
      },
      success_url: 'https://www.celeirogourmet.net.br?pagamento=sucesso',
      cancel_url: 'https://www.celeirogourmet.net.br?pagamento=cancelado',
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Erro Stripe:', err);
    return res.status(500).json({ error: err.message });
  }
}
