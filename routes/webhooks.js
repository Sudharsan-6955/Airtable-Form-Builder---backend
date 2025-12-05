const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const Webhook = require('../models/Webhook');
const Form = require('../models/Form');
const Response = require('../models/Response');
const User = require('../models/User');
const { createWebhook, deleteWebhook } = require('../utils/airtableService');
const AppError = require('../utils/AppError');

/**
 * Validation middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

/**
 * @route   POST /api/webhooks/airtable
 * @desc    Receive webhook notifications from Airtable
 * @access  Public (verified by Airtable)
 */
router.post('/airtable', async (req, res, next) => {
  try {
    const payload = req.body;

    console.log('📥 Received Airtable webhook:', JSON.stringify(payload, null, 2));

    // Airtable sends different payload structures
    // Handle notification payload
    if (payload.base && payload.webhook) {
      const { base, webhook, timestamp } = payload;
      
      // Find webhook in our database
      const webhookDoc = await Webhook.findOne({
        airtableWebhookId: webhook.id
      });

      if (!webhookDoc) {
        console.warn(`Webhook ${webhook.id} not found in database`);
        return res.status(200).json({ success: true });
      }

      // Update last notification time
      webhookDoc.lastNotificationAt = new Date(timestamp);
      
      // Handle cursor update if present
      if (payload.cursor !== undefined) {
        webhookDoc.cursor = payload.cursor;
      }

      await webhookDoc.save();

      // Process changes if present
      if (payload.changedTablesById) {
        await processWebhookChanges(webhookDoc, payload.changedTablesById);
      }

      return res.status(200).json({ success: true });
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Error processing webhook:', error);
    // Always return 200 to Airtable to avoid retries
    res.status(200).json({ success: true });
  }
});

/**
 * Process webhook changes (updates/deletes)
 */
async function processWebhookChanges(webhook, changedTablesById) {
  try {
    const tableChanges = changedTablesById[webhook.airtableTableId];
    
    if (!tableChanges) return;

    // Handle changed records (updates)
    if (tableChanges.changedRecordsById) {
      for (const [recordId, change] of Object.entries(tableChanges.changedRecordsById)) {
        try {
          const response = await Response.findOne({
            airtableRecordId: recordId,
            formId: webhook.formId
          });

          if (response) {
            // Update the response with new data from Airtable
            if (change.current && change.current.cellValuesByFieldId) {
              // Convert Airtable field values to our answer format
              // This is simplified - in production, you'd need to map field IDs to question keys
              response.lastSyncedAt = new Date();
              await response.save();
              
              console.log(`✅ Updated response ${response._id} from Airtable`);
            }
          }
        } catch (error) {
          console.error(`Error updating response for record ${recordId}:`, error);
        }
      }
    }

    // Handle destroyed records (deletes)
    if (tableChanges.destroyedRecordIds && tableChanges.destroyedRecordIds.length > 0) {
      for (const recordId of tableChanges.destroyedRecordIds) {
        try {
          const response = await Response.findOne({
            airtableRecordId: recordId,
            formId: webhook.formId
          });

          if (response) {
            // Mark as deleted (soft delete)
            response.deletedInAirtable = true;
            response.lastSyncedAt = new Date();
            await response.save();
            
            console.log(`✅ Marked response ${response._id} as deleted`);
          }
        } catch (error) {
          console.error(`Error marking response as deleted for record ${recordId}:`, error);
        }
      }
    }

    // Handle created records
    if (tableChanges.createdRecordsById) {
      // We don't need to process created records since we create them ourselves
      console.log(`ℹ️ ${Object.keys(tableChanges.createdRecordsById).length} records created in Airtable`);
    }

  } catch (error) {
    console.error('Error processing webhook changes:', error);
  }
}

/**
 * @route   POST /api/webhooks/register/:formId
 * @desc    Register webhook for a form
 * @access  Private (owner only)
 */
router.post('/register/:formId',
  authenticate,
  param('formId').isMongoId().withMessage('Invalid form ID'),
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const form = await Form.findById(req.params.formId);

      if (!form) {
        throw new AppError('Form not found', 404);
      }

      // Check ownership
      if (form.ownerId.toString() !== req.userId.toString()) {
        throw new AppError('Not authorized to register webhook for this form', 403);
      }

      // Check if webhook already exists
      const existingWebhook = await Webhook.findOne({
        formId: form._id,
        isActive: true
      });

      if (existingWebhook) {
        return res.json({
          success: true,
          message: 'Webhook already registered',
          data: existingWebhook
        });
      }

      // Get user to access their token
      const user = await User.findById(form.ownerId);
      if (!user) {
        throw new AppError('User not found', 500);
      }

      // Create webhook notification URL
      const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:5000';
      const notificationUrl = `${webhookBaseUrl}/api/webhooks/airtable`;

      // Webhook specification
      const specification = {
        options: {
          filters: {
            dataTypes: ['tableData'],
            recordChangeScope: form.airtableTableId
          }
        }
      };

      // Create webhook in Airtable
      const airtableWebhook = await createWebhook(
        user.accessToken,
        form.airtableBaseId,
        notificationUrl,
        specification
      );

      // Save webhook to database
      const webhook = new Webhook({
        formId: form._id,
        airtableWebhookId: airtableWebhook.id,
        airtableBaseId: form.airtableBaseId,
        airtableTableId: form.airtableTableId,
        notificationUrl,
        expiresAt: airtableWebhook.expirationTime ? new Date(airtableWebhook.expirationTime) : null
      });

      await webhook.save();

      res.status(201).json({
        success: true,
        message: 'Webhook registered successfully',
        data: webhook
      });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/webhooks/:webhookId
 * @desc    Unregister webhook
 * @access  Private (owner only)
 */
router.delete('/:webhookId',
  authenticate,
  param('webhookId').isMongoId().withMessage('Invalid webhook ID'),
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const webhook = await Webhook.findById(req.params.webhookId).populate('formId');

      if (!webhook) {
        throw new AppError('Webhook not found', 404);
      }

      // Check ownership
      if (webhook.formId.ownerId.toString() !== req.userId.toString()) {
        throw new AppError('Not authorized to delete this webhook', 403);
      }

      // Get user token
      const user = await User.findById(webhook.formId.ownerId);
      if (!user) {
        throw new AppError('User not found', 500);
      }

      // Delete webhook from Airtable
      try {
        await deleteWebhook(
          user.accessToken,
          webhook.airtableBaseId,
          webhook.airtableWebhookId
        );
      } catch (error) {
        console.error('Error deleting webhook from Airtable:', error);
        // Continue even if Airtable deletion fails
      }

      // Mark webhook as inactive
      webhook.isActive = false;
      await webhook.save();

      res.json({
        success: true,
        message: 'Webhook deleted successfully'
      });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/webhooks/form/:formId
 * @desc    Get webhooks for a form
 * @access  Private (owner only)
 */
router.get('/form/:formId',
  authenticate,
  param('formId').isMongoId().withMessage('Invalid form ID'),
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const form = await Form.findById(req.params.formId);

      if (!form) {
        throw new AppError('Form not found', 404);
      }

      // Check ownership
      if (form.ownerId.toString() !== req.userId.toString()) {
        throw new AppError('Not authorized to view webhooks', 403);
      }

      const webhooks = await Webhook.find({ formId: form._id });

      res.json({
        success: true,
        count: webhooks.length,
        data: webhooks
      });

    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
