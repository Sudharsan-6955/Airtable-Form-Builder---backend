const crypto = require('crypto');

/**
 * Generate PKCE code verifier and challenge for OAuth
 */
function generatePKCE() {
  // Generate random code verifier (43-128 characters)
  const codeVerifier = base64URLEncode(crypto.randomBytes(32));
  
  // Create SHA256 hash of code verifier
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = base64URLEncode(hash);
  
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256'
  };
}

/**
 * Base64 URL encode (without padding)
 */
function base64URLEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate random state parameter for OAuth
 */
function generateState() {
  return base64URLEncode(crypto.randomBytes(32));
}

module.exports = {
  generatePKCE,
  generateState,
  base64URLEncode
};
