const {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand,
  GetItemCommand,
} = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const Stripe = require('stripe');
const crypto = require('crypto');
// Was: require('../../_shared/src/greek'). Amplify Gen 1 only uploads each
// lambda's own src/ at deploy time, so the sibling _shared path resolves
// locally but fails at runtime with Runtime.ImportModuleError. The shared
// helpers are now co-located under src/shared/ in every consumer lambda.
const { computeGreekTermDates } = require('./shared/greek');
const {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const rawClient = new DynamoDBClient({});
const dynamo = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(rawClient);
const cognito = new CognitoIdentityProviderClient({ region: 'us-east-2' });

const USER_POOL_ID = process.env.USER_POOL_ID;
const PROCESSED_EVENTS_TABLE = 'ProcessedStripeEvents';
const GROUP_TABLE = 'GroupData-dev';
const TOKEN_TABLE = 'Tokens';

async function getCognitoUsernameBySub(userId) {
  const result = await cognito.send(
    new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `sub = "${userId}"`,
      Limit: 1,
    })
  );

  const user = result.Users?.[0];
  return user?.Username || null;
}

async function updateIfExists({ table, key, update, values }) {
  const exists = await dynamo.send(
    new GetItemCommand({
      TableName: table,
      Key: key,
    })
  );

  if (!exists.Item) {
    console.log('ℹ️ Skipping update — record does not exist:', key);
    return false;
  }

  await dynamo.send(
    new UpdateItemCommand({
      TableName: table,
      Key: key,
      UpdateExpression: update,
      ExpressionAttributeValues: values,
    })
  );

  console.log('✅ Updated record:', key);
  return true;
}

async function cancelAndRefundSubscription(subscriptionId) {
  if (!subscriptionId) {
    throw new Error('No subscriptionId available for rollback');
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice.payment_intent'],
  });

  await stripe.subscriptions.cancel(subscriptionId);
  console.log(`✅ Canceled subscription: ${subscriptionId}`);

  const paymentIntent = subscription.latest_invoice?.payment_intent;
  if (paymentIntent?.id) {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntent.id,
      reason: 'requested_by_customer',
    });
    console.log(`✅ Refunded payment intent: ${paymentIntent.id}`, refund.id);
    return {
      canceledSubscriptionId: subscriptionId,
      refundedPaymentIntentId: paymentIntent.id,
      refundId: refund.id,
    };
  }

  console.log('ℹ️ No payment intent found to refund for subscription:', subscriptionId);
  return {
    canceledSubscriptionId: subscriptionId,
    refundedPaymentIntentId: null,
    refundId: null,
  };
}

// Cancel the Stripe subscription tied to a specific (customer, group) pair.
//
// We DO NOT cancel by customer alone — a customer may own multiple
// subscriptions (Greek + Individual, for example) and acting on all of
// them would silently end unrelated memberships. Targeting always goes:
//   1. Use storedSubscriptionId if provided (canonical mapping).
//   2. Else list customer's active subs and filter by
//      sub.metadata.groupId === groupId.
//   3. Else skip Stripe and log — better to leave a sub running than to
//      cancel the wrong one.
async function cancelStripeSubscriptionForGroup({
  customerId,
  groupId,
  storedSubscriptionId,
}) {
  if (!customerId || customerId.startsWith('guest_')) {
    console.log('ℹ️ Skipping Stripe cancellation — guest or missing customer');
    return [];
  }
  if (!groupId && !storedSubscriptionId) {
    console.warn(
      '⚠️ cancelStripeSubscriptionForGroup called without groupId AND without storedSubscriptionId — refusing to act'
    );
    return [];
  }
  try {
    let targetSubId = null;
    if (storedSubscriptionId) {
      targetSubId = storedSubscriptionId;
    } else {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
        limit: 10,
      });
      const matches = (subscriptions.data || []).filter(
        (s) => s?.metadata?.groupId === groupId
      );
      if (matches.length === 1) {
        targetSubId = matches[0].id;
      } else if (matches.length > 1) {
        console.warn(
          `⚠️ Multiple subs matched groupId=${groupId} via metadata fallback — refusing to guess`
        );
        return [];
      } else {
        console.log(
          `ℹ️ No subscription matched groupId=${groupId} — nothing to cancel`
        );
        return [];
      }
    }
    await stripe.subscriptions.cancel(targetSubId);
    console.log(`✅ Canceled Stripe subscription: ${targetSubId}`);
    return [targetSubId];
  } catch (err) {
    console.error('❌ Error canceling Stripe subscription:', err);
    return [];
  }
}

function getPlanTier(groupId) {
  const id = (groupId || '').toLowerCase();
  if (id.includes('individual')) return { type: 'individual', tier: 1 };
  if (id.includes('group')) return { type: 'group', tier: 2 };
  if (id.includes('greek')) return { type: 'greek', tier: 3 };
  return { type: 'unknown', tier: 0 };
}

async function deactivateGroupInvites(groupId, createdAt) {
  try {
    const inviteQuery = await dynamo.send(
      new QueryCommand({
        TableName: GROUP_TABLE,
        KeyConditionExpression: 'group_id = :gid AND begins_with(group_data_members, :prefix)',
        FilterExpression: 'active = :true',
        ExpressionAttributeValues: {
          ':gid': { S: groupId },
          ':prefix': { S: 'INVITE#' },
          ':true': { BOOL: true },
        },
      })
    );

    for (const invite of inviteQuery.Items || []) {
      await dynamo.send(
        new UpdateItemCommand({
          TableName: GROUP_TABLE,
          Key: {
            group_id: invite.group_id,
            group_data_members: invite.group_data_members,
          },
          UpdateExpression: 'SET active = :false, update_at = :now',
          ExpressionAttributeValues: {
            ':false': { BOOL: false },
            ':now': { S: createdAt },
          },
        })
      );
    }

    console.log(`✅ Deactivated ${inviteQuery.Items?.length || 0} invite record(s) for group: ${groupId}`);
  } catch (err) {
    console.warn('⚠️ Could not deactivate invite records:', err.message);
  }
}

exports.handler = async (event) => {
  console.log('📢 Received event:', JSON.stringify(event, null, 2));

  if (!event.headers) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No headers received' }),
    };
  }

  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

  let bodyRaw = event.body;
  if (event.isBase64Encoded) {
    bodyRaw = Buffer.from(bodyRaw || '', 'base64').toString('utf8');
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      bodyRaw,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log('🟢 Stripe webhook verified:', stripeEvent.type);
  } catch (err) {
    console.error('❌ Invalid Stripe signature:', err.message);
    return { statusCode: 400, body: 'Webhook Error' };
  }

  if (stripeEvent.type !== 'checkout.session.completed') {
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true }),
    };
  }

  try {
    await docClient.send(
      new PutCommand({
        TableName: PROCESSED_EVENTS_TABLE,
        Item: {
          event_id: stripeEvent.id,
          processed_at: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 172800,
        },
        ConditionExpression: 'attribute_not_exists(event_id)',
      })
    );
    console.log('✅ Idempotency record written for event:', stripeEvent.id);
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log('⚠️ Duplicate webhook event — already processed:', stripeEvent.id);
      return {
        statusCode: 200,
        body: JSON.stringify({ received: true, duplicate: true }),
      };
    }

    console.error('❌ Failed to write idempotency record:', err);
    return { statusCode: 500, body: 'Internal error' };
  }

  const session = stripeEvent.data.object;
  const userId = session.metadata?.userId;
  const groupId = session.metadata?.groupId;
  const customerId = session.customer;
  const newSubscriptionId = session.subscription || null;

  if (!userId || !groupId) {
    console.error('❌ Missing userId or groupId in metadata');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing metadata' }),
    };
  }

  let maxUsers = '1';
  try {
    const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items'],
    });

    const priceId = fullSession.line_items?.data?.[0]?.price?.id;
    if (priceId) {
      const price = await stripe.prices.retrieve(priceId);
      maxUsers = price.metadata?.max_members || '1';
      console.log(`🔸 max_members from price ${priceId}:`, maxUsers);
    }
  } catch (err) {
    console.error('⚠️ Could not fetch line_items — defaulting max_users to 1:', err.message);
  }

  const groupIdLower = groupId.toLowerCase();
  const isNightPass = groupIdLower.includes('night');
  const isBusPass = groupIdLower.includes('bus');
  const isOneTimePass = isNightPass || isBusPass;
  const isGreekPlan = groupIdLower.startsWith('greek');

  let finalCustomerId = customerId;
  if (!finalCustomerId && session.payment_intent) {
    try {
      const pi = await stripe.paymentIntents.retrieve(session.payment_intent);
      finalCustomerId = pi.customer;
    } catch (err) {
      console.warn('⚠️ Could not retrieve customer from payment_intent:', err.message);
    }
  }

  if (!finalCustomerId) {
    finalCustomerId = `guest_${crypto.randomBytes(8).toString('hex')}`;
    console.log('⚠️ Using guest placeholder:', finalCustomerId);
  }

  try {
    if (userId && finalCustomerId && !finalCustomerId.startsWith('guest_')) {
      const cognitoUsername = await getCognitoUsernameBySub(userId);
      if (cognitoUsername) {
        await cognito.send(
          new AdminUpdateUserAttributesCommand({
            UserPoolId: USER_POOL_ID,
            Username: cognitoUsername,
            UserAttributes: [{ Name: 'custom:stripe_customer_id', Value: finalCustomerId }],
          })
        );
        console.log('✅ Saved stripe_customer_id to Cognito');
      } else {
        console.warn('⚠️ Could not find Cognito username for user sub:', userId);
      }
    }

    const createdAt = new Date().toISOString();
    const inviteCode = crypto.randomBytes(6).toString('hex');
    const inviteLink = `https://nightline.app/invite/${inviteCode}`;
    const newPlan = getPlanTier(groupId);

    const membershipsQuery = await dynamo.send(
      new QueryCommand({
        TableName: GROUP_TABLE,
        IndexName: 'user_id-index',
        KeyConditionExpression: 'user_id = :userId',
        FilterExpression: 'active = :true',
        ExpressionAttributeValues: {
          ':userId': { S: userId },
          ':true': { BOOL: true },
        },
      })
    );

    const activeMemberships = membershipsQuery.Items || [];
    const membershipsToDeactivate = [];

    for (const membership of activeMemberships) {
      const existingGroupId = membership.group_id.S;
      const existingPlan = getPlanTier(existingGroupId);
      const existingGroupIdLower = existingGroupId.toLowerCase();
      const isExistingOneTimePass =
        existingGroupIdLower.includes('night') || existingGroupIdLower.includes('bus');
      const isExistingGreek = existingGroupIdLower.startsWith('greek');
      const existingStripeCustomerId = membership.stripe_customer_id?.S;

      if (existingGroupId === groupId) continue;
      if (isOneTimePass) continue;
      if (isExistingOneTimePass) continue;

      if (isGreekPlan && isExistingGreek) {
        membershipsToDeactivate.push({ existingGroupId, existingStripeCustomerId });
        continue;
      }

      if (newPlan.tier >= existingPlan.tier) {
        membershipsToDeactivate.push({ existingGroupId, existingStripeCustomerId });
      } else {
        const metadataItem = await dynamo.send(
          new GetItemCommand({
            TableName: GROUP_TABLE,
            Key: {
              group_id: { S: existingGroupId },
              group_data_members: { S: 'METADATA' },
            },
          })
        );

        const currentMaxUsers = metadataItem.Item?.max_users?.S || '1';
        const newMaxUsers = String(Math.max(1, parseInt(currentMaxUsers, 10) - 1));

        await updateIfExists({
          table: GROUP_TABLE,
          key: {
            group_id: { S: existingGroupId },
            group_data_members: { S: 'METADATA' },
          },
          update: 'SET max_users = :newMax, update_at = :now',
          values: {
            ':newMax': { S: newMaxUsers },
            ':now': { S: createdAt },
          },
        });
      }
    }

    // MEMBER record. Purchaser is both admin and billing owner at creation;
    // is_billing_owner is the new flag used by reminder emails + deleteGroup.
    // stripe_subscription_id is the canonical group→sub mapping used by
    // deleteMembership to target ONLY this group's subscription instead of
    // every active sub on the customer.
    const memberItem = {
      group_id: { S: groupId },
      group_data_members: { S: `MEMBER#USER#${userId}` },
      user_id: { S: userId },
      stripe_customer_id: { S: finalCustomerId },
      created_at: { S: createdAt },
      update_at: { S: createdAt },
      active: { BOOL: true },
      is_owner: { BOOL: true },
      is_billing_owner: { BOOL: true },
      isCancelled: { BOOL: false },
      manually_added: { BOOL: false },
    };
    if (newSubscriptionId) {
      memberItem.stripe_subscription_id = { S: newSubscriptionId };
    }
    await dynamo.send(
      new PutItemCommand({
        TableName: GROUP_TABLE,
        Item: memberItem,
      })
    );
    console.log('✅ New MEMBER record written');

    let planType = newPlan.type;
    if (isNightPass) planType = 'night';
    if (isBusPass) planType = 'bus';

    // METADATA: for Greek plans, also stamp the lifecycle fields (expires_at
    // and friends) plus split ownership. See manualAddMembership for the
    // matching rationale.
    const metadataItem = {
      group_id: { S: groupId },
      group_data_members: { S: 'METADATA' },
      created_at: { S: createdAt },
      update_at: { S: createdAt },
      active: { BOOL: true },
      status: { S: 'active' },
      max_users: { S: isOneTimePass ? '1' : maxUsers },
      plan_type: { S: planType },
      stripe_customer_id: { S: finalCustomerId },
      owner_user_id: { S: userId },
      admin_owner_user_id: { S: userId },
      billing_owner_user_id: { S: userId },
      opt_out_reminders: { BOOL: false },
    };
    if (newSubscriptionId) {
      // Canonical group → Stripe subscription mapping. deleteMembership
      // reads this first so it can act on exactly the right sub even if
      // the customer has unrelated subscriptions.
      metadataItem.stripe_subscription_id = { S: newSubscriptionId };
    }

    if (planType === 'greek') {
      const term = computeGreekTermDates(createdAt);
      metadataItem.expires_at = { S: term.expiresAt };
      metadataItem.read_only_at = { S: term.readOnlyAt };
      metadataItem.suspended_at = { S: term.suspendedAt };
      metadataItem.purge_at = { S: term.purgeAt };
      metadataItem.reminders_sent = { L: [] };
    }

    await dynamo.send(
      new PutItemCommand({
        TableName: GROUP_TABLE,
        Item: metadataItem,
      })
    );
    console.log(
      '✅ New METADATA record written',
      planType === 'greek' ? `(Greek, expires ${metadataItem.expires_at.S})` : ''
    );

    const tokenId = crypto.randomBytes(16).toString('hex');
    await dynamo.send(
      new PutItemCommand({
        TableName: TOKEN_TABLE,
        Item: {
          token_id: { S: tokenId },
          user_id: { S: userId },
          group_id: { S: groupId },
          stripe_customer_id: { S: finalCustomerId },
          created_at: { S: createdAt },
          update_at: { S: createdAt },
          active: { BOOL: true },
          is_owner: { BOOL: true },
        },
      })
    );
    console.log('✅ New TOKEN record written');

    if (!isOneTimePass && (groupIdLower.includes('greek') || groupIdLower.includes('group'))) {
      await dynamo.send(
        new PutItemCommand({
          TableName: GROUP_TABLE,
          Item: {
            group_id: { S: groupId },
            group_data_members: { S: `INVITE#${inviteCode}` },
            invite_code: { S: inviteCode },
            created_by: { S: userId },
            created_at: { S: createdAt },
            update_at: { S: createdAt },
            used: { BOOL: false },
            invite_link: { S: inviteLink },
            active: { BOOL: true },
            stripe_customer_id: { S: finalCustomerId },
            current_uses: { N: '0' },
          },
        })
      );
      console.log('✅ Invite record written');
    }

    for (const { existingGroupId, existingStripeCustomerId } of membershipsToDeactivate) {
      console.log(`🔄 Deactivating old membership: ${existingGroupId}`);

      await updateIfExists({
        table: GROUP_TABLE,
        key: {
          group_id: { S: existingGroupId },
          group_data_members: { S: `MEMBER#USER#${userId}` },
        },
        update: 'SET active = :false, isCancelled = :true, update_at = :now',
        values: {
          ':false': { BOOL: false },
          ':true': { BOOL: true },
          ':now': { S: createdAt },
        },
      });

      await updateIfExists({
        table: GROUP_TABLE,
        key: {
          group_id: { S: existingGroupId },
          group_data_members: { S: 'METADATA' },
        },
        update: 'SET active = :false, update_at = :now',
        values: {
          ':false': { BOOL: false },
          ':now': { S: createdAt },
        },
      });

      await deactivateGroupInvites(existingGroupId, createdAt);

      const oldTokensQuery = await dynamo.send(
        new QueryCommand({
          TableName: TOKEN_TABLE,
          IndexName: 'user_id-index',
          KeyConditionExpression: 'user_id = :userId',
          FilterExpression:
            'group_id = :oldGroup AND NOT contains(group_id, :nightStr) AND NOT contains(group_id, :busStr) AND active = :true',
          ExpressionAttributeValues: {
            ':userId': { S: userId },
            ':oldGroup': { S: existingGroupId },
            ':nightStr': { S: 'night' },
            ':busStr': { S: 'bus' },
            ':true': { BOOL: true },
          },
        })
      );

      for (const token of oldTokensQuery.Items || []) {
        await updateIfExists({
          table: TOKEN_TABLE,
          key: {
            token_id: token.token_id,
            user_id: token.user_id,
          },
          update: 'SET active = :false, ended_at = :now',
          values: {
            ':false': { BOOL: false },
            ':now': { S: createdAt },
          },
        });
      }

      if (existingStripeCustomerId) {
        // Look up the OLD group's stored stripe_subscription_id before
        // touching Stripe. We must only cancel the sub tied to this
        // specific old group — never the customer's full subscription list.
        let existingSubId = null;
        try {
          const existingMeta = await dynamo.send(
            new GetItemCommand({
              TableName: GROUP_TABLE,
              Key: {
                group_id: { S: existingGroupId },
                group_data_members: { S: 'METADATA' },
              },
            })
          );
          existingSubId = existingMeta.Item?.stripe_subscription_id?.S || null;
        } catch (e) {
          console.warn(
            `⚠️ Could not read METADATA for ${existingGroupId}:`,
            e.message
          );
        }
        const canceled = await cancelStripeSubscriptionForGroup({
          customerId: existingStripeCustomerId,
          groupId: existingGroupId,
          storedSubscriptionId: existingSubId,
        });
        console.log(`✅ Canceled ${canceled.length} Stripe subscription(s)`);
      }
    }

    console.log('✅ Successfully processed subscription change');
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, inviteLink }),
    };
  } catch (err) {
    console.error('❌ Error processing subscription:', err);

    try {
      if (newSubscriptionId) {
        const rollback = await cancelAndRefundSubscription(newSubscriptionId);
        console.log('✅ Rolled back failed fulfillment:', rollback);

        return {
          statusCode: 200,
          body: JSON.stringify({
            rolledBack: true,
            message: 'Membership fulfillment failed; subscription canceled and payment refunded.',
          }),
        };
      }

      console.error('⚠️ No new subscription ID available for rollback');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Fulfillment failed and rollback could not start' }),
      };
    } catch (rollbackErr) {
      console.error('❌ Rollback failed:', rollbackErr);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Fulfillment failed and rollback failed',
        }),
      };
    }
  }
};