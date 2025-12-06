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

router.post('/airtable', async (req, res, next) => {
  try {
    const payload = req.body;

    console.log('📥 Received Airtable webhook:', JSON.stringify(payload, null, 2));

    if (payload.base && payload.webhook) {
      const { base, webhook, timestamp } = payload;
      
      const webhookDoc = await Webhook.findOne({
        airtableWebhookId: webhook.id
      });

      if (!webhookDoc) {
        console.warn(`Webhook ${webhook.id} not found in database`);
        return res.status(200).json({ success: true });
      }

      webhookDoc.lastNotificationAt = new Date(timestamp);
      
      if (payload.cursor !== undefined) {
        webhookDoc.cursor = payload.cursor;
      }

      await webhookDoc.save();

      if (payload.changedTablesById) {
        await processWebhookChanges(webhookDoc, payload.changedTablesById);
      }

      return res.status(200).json({ success: true });
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(200).json({ success: true });
  }
});

async function processWebhookChanges(webhook, changedTablesById) {
  try {
    const tableChanges = changedTablesById[webhook.airtableTableId];
    
    if (!tableChanges) return;

    if (tableChanges.changedRecordsById) {
      for (const [recordId, change] of Object.entries(tableChanges.changedRecordsById)) {
        try {
          const response = await Response.findOne({
            airtableRecordId: recordId,
            formId: webhook.formId
          });

          if (response) {
            if (change.current && change.current.cellValuesByFieldId) {
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

    if (tableChanges.destroyedRecordIds && tableChanges.destroyedRecordIds.length > 0) {
      for (const recordId of tableChanges.destroyedRecordIds) {
        try {
          const response = await Response.findOne({
            airtableRecordId: recordId,
            formId: webhook.formId
          });

          if (response) {
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

    if (tableChanges.createdRecordsById) {
      console.log(`ℹ️ ${Object.keys(tableChanges.createdRecordsById).length} records created in Airtable`);
    }

  } catch (error) {
    console.error('Error processing webhook changes:', error);
  }
}

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

      if (form.ownerId.toString() !== req.userId.toString()) {
        throw new AppError('Not authorized to register webhook for this form', 403);
      }

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

      const user = await User.findById(form.ownerId);
      if (!user) {
        throw new AppError('User not found', 500);
      }

      const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:5000';
      const notificationUrl = `${webhookBaseUrl}/api/webhooks/airtable`;

      const specification = {
        options: {
          filters: {
            dataTypes: ['tableData'],
            recordChangeScope: form.airtableTableId
          }
        }
      };

      const airtableWebhook = await createWebhook(
        user.accessToken,
        form.airtableBaseId,
        notificationUrl,
        specification
      );

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

      if (webhook.formId.ownerId.toString() !== req.userId.toString()) {
        throw new AppError('Not authorized to delete this webhook', 403);
      }

      const user = await User.findById(webhook.formId.ownerId);
      if (!user) {
        throw new AppError('User not found', 500);
      }

      try {
        await deleteWebhook(
          user.accessToken,
          webhook.airtableBaseId,
          webhook.airtableWebhookId
        );
      } catch (error) {
        console.error('Error deleting webhook from Airtable:', error);
      }

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
