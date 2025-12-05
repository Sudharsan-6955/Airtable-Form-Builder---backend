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
  // Webhook notification spec
  notificationUrl: {
    type: String,
    required: true
  },
  // Cursor for incremental updates
  cursor: {
    type: Number,
    default: 1
  },
  // Status tracking
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
  // Error tracking
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

// Indexes
webhookSchema.index({ formId: 1 });
webhookSchema.index({ airtableWebhookId: 1 });
webhookSchema.index({ isActive: 1, lastPingAt: 1 });
webhookSchema.index({ airtableBaseId: 1, airtableTableId: 1 });

// Method to check if webhook needs refresh (ping)
webhookSchema.methods.needsRefresh = function() {
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  return this.lastPingAt < sixDaysAgo;
};

module.exports = mongoose.model('Webhook', webhookSchema);
