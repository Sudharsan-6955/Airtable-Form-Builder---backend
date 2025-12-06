const mongoose = require('mongoose');

const conditionSchema = new mongoose.Schema({
  questionKey: {
    type: String,
    required: true
  },
  operator: {
    type: String,
    enum: ['equals', 'notEquals', 'contains'],
    required: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  }
}, { _id: false });

const conditionalRulesSchema = new mongoose.Schema({
  logic: {
    type: String,
    enum: ['AND', 'OR'],
    required: true
  },
  conditions: [conditionSchema]
}, { _id: false });

const questionSchema = new mongoose.Schema({
  questionKey: {
    type: String,
    required: true,
    trim: true
  },
  airtableFieldId: {
    type: String,
    required: true
  },
  airtableFieldName: {
    type: String,
    required: true
  },
  label: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['singleLineText', 'multilineText', 'singleSelect', 'multipleSelects', 'multipleAttachments'],
    required: true
  },
  required: {
    type: Boolean,
    default: false
  },
  options: [{
    type: String
  }],
  conditionalRules: {
    type: conditionalRulesSchema,
    default: null
  },
  order: {
    type: Number,
    default: 0
  }
}, { _id: false });

const formSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  airtableBaseId: {
    type: String,
    required: true
  },
  airtableTableId: {
    type: String,
    required: true
  },
  airtableBaseName: {
    type: String,
    trim: true
  },
  airtableTableName: {
    type: String,
    trim: true
  },
  questions: [questionSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  submissionCount: {
    type: Number,
    default: 0
  },
  lastSubmissionAt: {
    type: Date
  }
}, {
  timestamps: true
});

formSchema.index({ ownerId: 1, createdAt: -1 });
formSchema.index({ airtableBaseId: 1, airtableTableId: 1 });
formSchema.index({ isActive: 1 });

formSchema.pre('save', function(next) {
  const questionKeys = this.questions.map(q => q.questionKey);
  const uniqueKeys = new Set(questionKeys);
  
  if (questionKeys.length !== uniqueKeys.size) {
    next(new Error('Question keys must be unique within a form'));
  }
  
  next();
});

module.exports = mongoose.model('Form', formSchema);
