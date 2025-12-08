const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);

exports.handler = async (event) => {
    try {
        console.log('Stripe key is set?', !!process.env.STRIPE_SECRET_KEY_TEST);
        console.log('📦 FULL EVENT:', JSON.stringify(event, null, 2));
        console.log('🔵 event.body:', event.body);
        console.log('🟣 typeof event.body:', typeof event.body);
        console.log('🔶 event.headers:', JSON.stringify(event.headers));
        console.log('🔷 event.requestContext:', JSON.stringify(event.requestContext));
        console.log('🔵 Raw event.body:', event.body);
        console.log('🟣 Type of event.body:', typeof event.body);
        console.log('🟣 isBase64Encoded:', event.isBase64Encoded);

        let body = {};
        try {
            if (event.isBase64Encoded) {
                const decodedBody = Buffer.from(event.body, 'base64').toString('utf-8');
                console.log('🔓 Decoded body:', decodedBody);
                body = JSON.parse(decodedBody);
            } else {
                body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
            }        } catch (e) {
            console.error('❌ Failed to parse event body:', e, event.body);
        }

        console.log('🟢 Parsed body:', body);
        const { priceId, userId, groupType } = body || {};
        console.log('🔸 Final extracted values:', { priceId, userId, groupType });


        // 1️⃣ Generate a new unique groupId if needed
        const generateGroupId = (type = 'group') => {
            const timestamp = Date.now().toString(36);
            const random = Math.random().toString(36).substr(2, 6);
            return `${type}_${timestamp}${random}`;
        };
        const groupId = generateGroupId(groupType); // e.g., 'greek_x123abc' 
        const price = await stripe.prices.retrieve(priceId);
        const lineItem = { price: priceId }; //creates metered if it's a one time perchase vs subscription 
        if (price.recurring?.usage_type !== 'metered') {
            lineItem.quantity = 1;
        }
        // 2️⃣ Create a Stripe Checkout session
        const session = await stripe.checkout.sessions.create({
            mode: price.recurring ? 'subscription' : 'payment',
            payment_method_types: ['card'],
            line_items: [lineItem],
            success_url: `https://yourapp.com/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: 'https://yourapp.com/cancel',
            metadata: {
                userId,   // store Cognito user ID
                groupId,  // store the new group ID
                groupType // optional: store the type ('greek' or 'group')
            }
        });

        console.log('Stripe session object:', session);

        // 3️⃣ Return the session URL to the frontend
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

