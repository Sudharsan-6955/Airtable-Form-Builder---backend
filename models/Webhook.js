const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema({
  formId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Form',
    required: true,
    index: true
  },
  airtableWebhookId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  airtableBaseId: {
    type: String,
    required: true
  },
  airtableTableId: {
    type: String,
    required: true
  },
  notificationUrl: {
    type: String,
    required: true
  },
  cursor: {
    type: Number,
    default: 1
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastPingAt: {
    type: Date,
    default: Date.now
  },
  lastNotificationAt: {
    type: Date
  },
  expiresAt: {
    type: Date
  },
  errorCount: {
    type: Number,
    default: 0
  },
  lastError: {
    message: String,
    timestamp: Date
  }
}, {
  timestamps: true
});

webhookSchema.index({ formId: 1 });
webhookSchema.index({ airtableWebhookId: 1 });
webhookSchema.index({ isActive: 1, lastPingAt: 1 });
webhookSchema.index({ airtableBaseId: 1, airtableTableId: 1 });

webhookSchema.methods.needsRefresh = function() {
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  return this.lastPingAt < sixDaysAgo;
};

module.exports = mongoose.model('Webhook', webhookSchema);
