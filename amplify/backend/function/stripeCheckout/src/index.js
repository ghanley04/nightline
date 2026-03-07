const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const cognito = new CognitoIdentityProviderClient({ region: 'us-east-2' });
const USER_POOL_ID = process.env.USER_POOL_ID; // set in Lambda environment variables

exports.handler = async (event) => {
  try {
    console.log('Stripe key is set?', !!process.env.STRIPE_SECRET_KEY_TEST);
    console.log('📦 FULL EVENT:', JSON.stringify(event, null, 2));
    console.log('🟣 isBase64Encoded:', event.isBase64Encoded);

    let body = {};
    try {
      if (event.isBase64Encoded) {
        const decodedBody = Buffer.from(event.body, 'base64').toString('utf-8');
        console.log('🔓 Decoded body:', decodedBody);
        body = JSON.parse(decodedBody);
      } else {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      }
    } catch (e) {
      console.error('❌ Failed to parse event body:', e, event.body);
    }

    console.log('🟢 Parsed body:', body);
    const { priceId, userId, groupType } = body || {};
    console.log('🔸 Final extracted values:', { priceId, userId, groupType });

    // 1️⃣ Fetch Cognito user to get existing stripe_customer_id and email
    let stripeCustomerId = null;
    let userEmail = null;

    try {
      const cognitoUser = await cognito.send(new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: userId,
      }));

      const attrs = {};
      cognitoUser.UserAttributes.forEach(a => attrs[a.Name] = a.Value);
      stripeCustomerId = attrs['custom:stripe_customer_id'] || null;
      userEmail = attrs['email'] || null;
      console.log('👤 Cognito user fetched. Existing stripe_customer_id:', stripeCustomerId);
    } catch (err) {
      console.error('⚠️ Failed to fetch Cognito user:', err.message);
    }

    // 2️⃣ If no existing Stripe customer, create one and save back to Cognito
    if (!stripeCustomerId) {
      console.log('🆕 No existing Stripe customer, creating one...');
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { userId },
      });
      stripeCustomerId = customer.id;
      console.log('✅ Created Stripe customer:', stripeCustomerId);

      try {
        await cognito.send(new AdminUpdateUserAttributesCommand({
          UserPoolId: USER_POOL_ID,
          Username: userId,
          UserAttributes: [
            { Name: 'custom:stripe_customer_id', Value: stripeCustomerId },
          ],
        }));
        console.log('✅ Saved stripe_customer_id to Cognito:', stripeCustomerId);
      } catch (err) {
        console.error('⚠️ Failed to save stripe_customer_id to Cognito:', err.message);
      }
    } else {
      console.log('♻️ Reusing existing Stripe customer:', stripeCustomerId);
    }

    // 3️⃣ Generate a new unique groupId
    const generateGroupId = (type = 'group') => {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substr(2, 6);
      return `${type}_${timestamp}${random}`;
    };
    const groupId = generateGroupId(groupType);

    // 4️⃣ Retrieve price and build line item
    const price = await stripe.prices.retrieve(priceId);
    const lineItem = { price: priceId };
    if (price.recurring?.usage_type !== 'metered') {
      lineItem.quantity = 1;
    }

    // 5️⃣ Create Stripe Checkout session with existing/new customer
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: price.recurring ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: [lineItem],
      success_url: `nightlineapp://payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `nightlineapp://payment/cancel`,
      metadata: {
        userId,
        groupId,
        groupType,
      },
    });

    console.log('✅ Stripe session created:', session.id);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: session.url, groupId }),
    };
  } catch (error) {
    console.error('Stripe error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};