const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);

exports.handler = async () => {
  try {
    // Fetch all active products & prices
    const prices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
    });

    // Simplify structure
    const plans = prices.data.map(p => ({
      id: p.id,
      name: p.product.name,
      description: p.product.description,
      amount: (p.unit_amount / 100).toFixed(2),
      currency: p.currency.toUpperCase(),
      interval: p.recurring?.interval ?? 'one-time',
      active: p.product.active
    }));

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(plans)
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
