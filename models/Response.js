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
  answers: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    required: true
  },
  metadata: {
    submittedBy: String,
    ipAddress: String,
    userAgent: String,
    submissionSource: {
      type: String,
      default: 'web'
    }
  },
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

responseSchema.index({ formId: 1, createdAt: -1 });
responseSchema.index({ airtableRecordId: 1 });
responseSchema.index({ deletedInAirtable: 1, formId: 1 });

responseSchema.methods.toJSON = function() {
  const obj = this.toObject();
  obj.answers = Object.fromEntries(obj.answers);
  return obj;
};

module.exports = mongoose.model('Response', responseSchema);
