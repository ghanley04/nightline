const AWS = require("aws-sdk");
const dynamo = new AWS.DynamoDB.DocumentClient();
const express = require('express');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(bodyParser.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const TABLE = process.env.SUBSCRIPTIONS_TABLE || 'SubscriptionsTable';

// -----------------------------
// Route: Create Subscription
// -----------------------------
app.post('/create-subscription', async (req, res) => {
  try {
    const { userId, email, planType } = req.body;

    const priceId =
      planType === 'individual'
        ? process.env.PRICE_ID_INDIVIDUAL
        : planType === 'group'
        ? process.env.PRICE_ID_GROUP
        : process.env.PRICE_ID_ORG;

    // 1️⃣ Create Stripe customer
    const customer = await stripe.customers.create({ email });

    // 2️⃣ Create Stripe subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      metadata: { userId, planType },
    });

    // 3️⃣ Build subscription object with all necessary fields
    const item = {
      id: uuidv4(),                   // unique subscription record
      ownerId: userId,                // owner of the subscription
      planType,                       // individual / group / org
      stripeSubscriptionId: subscription.id,
      maxMembers: planType === 'group' ? 50 : 1, // max members
      memberEmails: [],               // list of invited emails
      memberIds: [],                  // list of confirmed user IDs
      status: 'active',               // active / canceled
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 4️⃣ Save to DynamoDB
    await dynamo.put({ TableName: TABLE, Item: item }).promise();

    // 5️⃣ Return Stripe checkout link and subscription info
    res.json({ checkoutUrl: subscription.latest_invoice.hosted_invoice_url, subscription: item });
  } catch (err) {
    console.error('Error creating subscription:', err);
    res.status(500).json({ error: 'Error creating subscription' });
  }
});

// -----------------------------
// Route: Invite Member
// -----------------------------
app.post('/invite-member', async (req, res) => {
  try {
    const { subscriptionId, email } = req.body;

    // 1️⃣ Fetch subscription
    const { Item: subscription } = await dynamo.get({
      TableName: TABLE,
      Key: { id: subscriptionId },
    }).promise();

    if (!subscription) return res.status(404).json({ error: 'Subscription not found' });

    // 2️⃣ Check max members
    if (subscription.memberEmails.length >= subscription.maxMembers) {
      return res.status(400).json({ error: 'Subscription has reached max members' });
    }

    // 3️⃣ Add new email
    subscription.memberEmails.push(email);
    subscription.updatedAt = new Date().toISOString();

    await dynamo.update({
      TableName: TABLE,
      Key: { id: subscriptionId },
      UpdateExpression: 'SET memberEmails = :emails, updatedAt = :updated',
      ExpressionAttributeValues: {
        ':emails': subscription.memberEmails,
        ':updated': subscription.updatedAt,
      },
    }).promise();

    // 4️⃣ (Optional) send invite email with join link
    // const inviteLink = `https://yourapp.com/join?subscriptionId=${subscriptionId}&email=${encodeURIComponent(email)}`;

    res.json({ message: `Invite sent to ${email}` });
  } catch (err) {
    console.error('Error inviting member:', err);
    res.status(500).json({ error: 'Failed to invite member' });
  }
});

app.get('/subscription/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { Item } = await dynamo.get({
      TableName: TABLE,
      Key: { id }
    }).promise();

    if (!Item) return res.status(404).json({ error: 'Not found' });
    res.json(Item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});


// -----------------------------
// Lambda handler
// -----------------------------
exports.handler = app;
