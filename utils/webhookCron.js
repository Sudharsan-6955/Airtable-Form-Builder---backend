const cron = require('node-cron');
const Webhook = require('../models/Webhook');
const User = require('../models/User');
const { refreshWebhook } = require('./airtableService');

function setupWebhookCron() {
  cron.schedule('0 2 * * *', async () => {
    console.log('🔄 Running webhook refresh cron job...');
    
    try {
      const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      
      const webhooks = await Webhook.find({
        isActive: true,
        lastPingAt: { $lt: sixDaysAgo }
      }).populate('formId');

      console.log(`Found ${webhooks.length} webhooks to refresh`);

      for (const webhook of webhooks) {
        try {
          const form = webhook.formId;
          if (!form) {
            console.warn(`Form not found for webhook ${webhook._id}`);
            continue;
          }

          const user = await User.findById(form.ownerId);
          if (!user) {
            console.warn(`User not found for webhook ${webhook._id}`);
            continue;
          }

          await refreshWebhook(
            user.accessToken,
            webhook.airtableBaseId,
            webhook.airtableWebhookId
          );

          webhook.lastPingAt = new Date();
          webhook.errorCount = 0;
          await webhook.save();

          console.log(`✅ Refreshed webhook ${webhook.airtableWebhookId}`);
        } catch (error) {
          console.error(`❌ Error refreshing webhook ${webhook._id}:`, error.message);
          
          webhook.errorCount += 1;
          webhook.lastError = {
            message: error.message,
            timestamp: new Date()
          };

          if (webhook.errorCount >= 3) {
            webhook.isActive = false;
            console.warn(`⚠️ Deactivated webhook ${webhook._id} after 3 failures`);
          }

          await webhook.save();
        }
      }

      console.log('✅ Webhook refresh cron job completed');
    } catch (error) {
      console.error('❌ Error in webhook refresh cron job:', error);
    }
  });

  console.log('⏰ Webhook refresh cron job scheduled (daily at 2 AM)');
}

module.exports = setupWebhookCron;
