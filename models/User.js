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
  scopes: [{
    type: String
  }],
  profileData: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

userSchema.index({ airtableUserId: 1 });
userSchema.index({ email: 1 });

userSchema.methods.isTokenExpired = function() {
  return new Date() >= this.tokenExpiresAt;
};

userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.accessToken;
  delete obj.refreshToken;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
