const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const cognito = new CognitoIdentityProviderClient({ region: 'us-east-2' });
const USER_POOL_ID = process.env.USER_POOL_ID;

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

    // 1️⃣ Fetch Cognito user by sub (userId is the Cognito sub, not the username)
    let stripeCustomerId = null;
    let userEmail = null;
    let cognitoUsername = null; // the actual username needed for AdminUpdateUserAttributes

    try {
      const { ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
      const listResult = await cognito.send(new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Filter: `sub = "${userId}"`,
        Limit: 1,
      }));

      const cognitoUser = listResult.Users?.[0];
      if (cognitoUser) {
        cognitoUsername = cognitoUser.Username;
        const attrs = {};
        cognitoUser.Attributes.forEach(a => attrs[a.Name] = a.Value);
        stripeCustomerId = attrs['custom:stripe_customer_id'] || null;
        userEmail = attrs['email'] || null;
        console.log('👤 Cognito user found. Username:', cognitoUsername, '| Existing stripe_customer_id:', stripeCustomerId);
      } else {
        console.warn('⚠️ No Cognito user found for sub:', userId);
      }
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

      if (cognitoUsername) {
        try {
          await cognito.send(new AdminUpdateUserAttributesCommand({
            UserPoolId: USER_POOL_ID,
            Username: cognitoUsername,
            UserAttributes: [
              { Name: 'custom:stripe_customer_id', Value: stripeCustomerId },
            ],
          }));
          console.log('✅ Saved stripe_customer_id to Cognito:', stripeCustomerId);
        } catch (err) {
          console.error('⚠️ Failed to save stripe_customer_id to Cognito:', err.message);
        }
      } else {
        console.warn('⚠️ No cognitoUsername available — cannot save stripe_customer_id to Cognito');
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
    const isSubscription = !!price.recurring;
    const lineItem = { price: priceId };
    if (price.recurring?.usage_type !== 'metered') {
      lineItem.quantity = 1;
    }

    // 5️⃣ Create Stripe Checkout session
    const sessionParams = {
      customer: stripeCustomerId,
      mode: isSubscription ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: [lineItem],
      success_url: `https://nightline.app/payment/success?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `https://nightline.app/payment/cancel?status=cancel`,
      metadata: {
        userId,
        groupId,
        groupType,
      },
    };

    // ✅ In payment mode, Stripe does NOT attach the customer to the session by default.
    // customer_update forces it to save the payment method to the customer object,
    // which also ensures session.customer is populated in the webhook.
    if (!isSubscription) {
      sessionParams.customer_update = { name: 'auto' };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

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