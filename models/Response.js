const mongoose = require('mongoose');

const responseSchema = new mongoose.Schema({
  formId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Form',
    required: true,
    index: true
  },
  airtableRecordId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Store answers as key-value pairs
  answers: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    required: true
  },
  // Metadata about submission
  metadata: {
    submittedBy: String,
    ipAddress: String,
    userAgent: String,
    submissionSource: {
      type: String,
      default: 'web'
    }
  },
  // Sync status
  deletedInAirtable: {
    type: Boolean,
    default: false,
    index: true
  },
  lastSyncedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
responseSchema.index({ formId: 1, createdAt: -1 });
responseSchema.index({ airtableRecordId: 1 });
responseSchema.index({ deletedInAirtable: 1, formId: 1 });

// Convert Map to plain object for JSON responses
responseSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.answers = Object.fromEntries(obj.answers);
  return obj;
};

module.exports = mongoose.model('Response', responseSchema);
