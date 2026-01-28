const Stripe = require('stripe');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  console.log('📥 Delete account event received:', JSON.stringify(event, null, 2));

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    
    const userId = body?.userId;
    const reason = body?.reason || 'user_deleted_account';

    if (!userId) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          success: false, 
          error: 'Missing userId' 
        })
      };
    }

    const tableName = 'GroupData-dev';
    const deletedAt = new Date().toISOString();

    console.log('🔍 Processing account deletion for user:', userId);

    // 1️⃣ Find ALL memberships for this user across all groups
    const membershipsResponse = await dynamo.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'user_id = :userId AND begins_with(group_data_members, :memberPrefix)',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':memberPrefix': 'MEMBER#USER#',
      },
    }));

    const memberships = membershipsResponse.Items || [];
    console.log(`📋 Found ${memberships.length} membership(s) for user ${userId}`);

    if (memberships.length === 0) {
      console.log('⚠️ No memberships found for user');
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ 
          success: true,
          message: 'No active memberships found to delete',
          details: {
            membershipsDeactivated: 0,
            groupsAffected: 0,
            stripeCancellations: {
              successful: 0,
              failed: 0,
              subscriptions: [],
              errors: [],
            },
          },
          timestamp: deletedAt,
        })
      };
    }

    let allCanceledSubscriptions = [];
    let allStripeErrors = [];
    let stripeCustomerIds = new Set();
    let successfulDeactivations = 0;
    let failedDeactivations = 0;

    // 2️⃣ Process each membership
    for (const membership of memberships) {
      const groupId = membership.group_id;
      const stripeCustomerId = membership.stripe_customer_id;
      
      console.log(`\n📦 Processing membership in group: ${groupId}`);

      // Track unique Stripe customer IDs
      if (stripeCustomerId) {
        stripeCustomerIds.add(stripeCustomerId);
      }

      // Calculate membership duration
      const createdAt = membership.created_at;
      const durationDays = createdAt 
        ? Math.floor((new Date(deletedAt) - new Date(createdAt)) / (1000 * 60 * 60 * 24))
        : null;

      // 3️⃣ Cancel ALL active Stripe subscriptions for this membership
      if (stripeCustomerId) {
        try {
          console.log(`   🔍 Checking Stripe subscriptions for customer ${stripeCustomerId}`);
          
          const subscriptions = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            status: 'active',
            limit: 100,
          });

          console.log(`   Found ${subscriptions.data.length} active subscription(s)`);

          // Cancel each subscription immediately
          for (const sub of subscriptions.data) {
            try {
              const canceledSub = await stripe.subscriptions.cancel(sub.id);
              
              allCanceledSubscriptions.push({
                subscriptionId: sub.id,
                groupId: groupId,
                customerId: stripeCustomerId,
                canceledAt: canceledSub.canceled_at,
                status: canceledSub.status,
              });
              
              console.log(`   ✅ Canceled subscription ${sub.id}`);
            } catch (cancelError) {
              console.error(`   ❌ Failed to cancel subscription ${sub.id}:`, cancelError.message);
              allStripeErrors.push({
                subscriptionId: sub.id,
                groupId: groupId,
                customerId: stripeCustomerId,
                error: cancelError.message,
              });
            }
          }
        } catch (stripeError) {
          console.error(`   ❌ Stripe API error for customer ${stripeCustomerId}:`, stripeError.message);
          allStripeErrors.push({
            customerId: stripeCustomerId,
            groupId: groupId,
            error: stripeError.message,
          });
        }
      } else {
        console.log(`   ⚠️ No Stripe customer ID found for this membership`);
      }

      // 4️⃣ Mark membership as inactive/deleted (matching deleteMembership pattern)
      try {
        const canceledSubscriptionIds = allCanceledSubscriptions
          .filter(sub => sub.groupId === groupId)
          .map(sub => sub.subscriptionId);

        await dynamo.send(new UpdateCommand({
          TableName: tableName,
          Key: { 
            group_id: groupId,
            group_data_members: `MEMBER#USER#${userId}`
          },
          UpdateExpression: `
            SET 
              active = :inactive,
              isCancelled = :cancelled,
              accountDeleted = :deleted,
              deletedAt = :deletedAt,
              canceledAt = :canceledAt,
              deletionReason = :reason,
              membershipDurationDays = :duration,
              canceledSubscriptions = :subs,
              update_at = :updateAt
          `,
          ExpressionAttributeValues: {
            ':inactive': false,
            ':cancelled': true,
            ':deleted': true,
            ':deletedAt': deletedAt,
            ':canceledAt': deletedAt,
            ':reason': reason,
            ':duration': durationDays,
            ':subs': canceledSubscriptionIds,
            ':updateAt': deletedAt,
          },
        }));

        successfulDeactivations++;
        console.log(`   ✅ Marked membership as deleted in group ${groupId}`);
      } catch (updateError) {
        failedDeactivations++;
        console.error(`   ❌ Failed to update membership in ${groupId}:`, updateError.message);
      }
    }

    // 5️⃣ Deactivate ALL invites created by this user
    let deactivatedInvites = 0;
    try {
      const invitesResponse = await dynamo.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: 'created_by = :userId AND begins_with(group_data_members, :invitePrefix)',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':invitePrefix': 'INVITE#',
        },
      }));

      const invites = invitesResponse.Items || [];
      console.log(`\n📋 Found ${invites.length} invite(s) created by user`);

      for (const invite of invites) {
        try {
          await dynamo.send(new UpdateCommand({
            TableName: tableName,
            Key: { 
              group_id: invite.group_id,
              group_data_members: invite.group_data_members
            },
            UpdateExpression: 'SET active = :inactive, deactivatedAt = :timestamp, deactivatedReason = :reason',
            ExpressionAttributeValues: {
              ':inactive': false,
              ':timestamp': deletedAt,
              ':reason': 'account_deleted',
            },
          }));
          deactivatedInvites++;
        } catch (inviteError) {
          console.error(`   ❌ Failed to deactivate invite:`, inviteError.message);
        }
      }

      console.log(`✅ Deactivated ${deactivatedInvites} invite(s)`);
    } catch (inviteError) {
      console.error('⚠️ Error processing invites:', inviteError.message);
    }

    // 6️⃣ Update group metadata for each affected group
    const uniqueGroupIds = [...new Set(memberships.map(m => m.group_id))];
    
    for (const groupId of uniqueGroupIds) {
      try {
        await dynamo.send(new UpdateCommand({
          TableName: tableName,
          Key: { 
            group_id: groupId,
            group_data_members: 'METADATA'
          },
          UpdateExpression: 'SET update_at = :timestamp',
          ExpressionAttributeValues: {
            ':timestamp': deletedAt,
          },
        }));
        console.log(`✅ Updated metadata for group ${groupId}`);
      } catch (metadataError) {
        console.error(`⚠️ Failed to update metadata for ${groupId}:`, metadataError.message);
      }
    }

    // Summary
    console.log('\n✅ Account deletion complete');
    console.log(`   - Memberships deactivated: ${successfulDeactivations}/${memberships.length}`);
    console.log(`   - Invites deactivated: ${deactivatedInvites}`);
    console.log(`   - Stripe subscriptions canceled: ${allCanceledSubscriptions.length}`);
    console.log(`   - Stripe errors: ${allStripeErrors.length}`);
    console.log(`   - Unique Stripe customers: ${stripeCustomerIds.size}`);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        success: true,
        message: 'Account successfully deleted and all memberships deactivated',
        details: {
          membershipsDeactivated: successfulDeactivations,
          membershipsFailed: failedDeactivations,
          groupsAffected: uniqueGroupIds.length,
          invitesDeactivated: deactivatedInvites,
          stripeCancellations: {
            successful: allCanceledSubscriptions.length,
            failed: allStripeErrors.length,
            subscriptions: allCanceledSubscriptions,
            errors: allStripeErrors,
          },
          uniqueStripeCustomers: stripeCustomerIds.size,
        },
        timestamp: deletedAt,
      })
    };

  } catch (err) {
    console.error('❌ Error deleting account:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        success: false, 
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      })
    };
  }
};