const crypto = require('crypto');

function generatePKCE() {
  const codeVerifier = base64URLEncode(crypto.randomBytes(32));
  
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = base64URLEncode(hash);
  
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256'
  };
}

function base64URLEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateState() {
  return base64URLEncode(crypto.randomBytes(32));
}

module.exports = {
  generatePKCE,
  generateState,
  base64URLEncode
};
