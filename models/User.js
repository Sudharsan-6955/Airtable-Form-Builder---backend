const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');

const userSchema = new mongoose.Schema({
  airtableUserId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  name: {
    type: String,
    trim: true
  },
  // OAuth tokens (stored as-is, protected by DB access control)
  accessToken: {
    type: String,
    required: true
  },
  refreshToken: {
    type: String
  },
  tokenExpiresAt: {
    type: Date,
    required: true
  },
  // OAuth scopes granted
  scopes: [{
    type: String
  }],
  // Profile metadata
  profileData: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Index for quick lookups
userSchema.index({ airtableUserId: 1 });
userSchema.index({ email: 1 });

// Method to check if token is expired
userSchema.methods.isTokenExpired = function() {
  return new Date() >= this.tokenExpiresAt;
};

// Don't expose sensitive data in JSON responses
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.accessToken;
  delete obj.refreshToken;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
