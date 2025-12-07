const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { generatePKCE, generateState } = require('../utils/pkce');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const AppError = require('../utils/AppError');

const pkceStore = new Map();

const AIRTABLE_AUTH_URL = 'https://airtable.com/oauth2/v1/authorize';
const AIRTABLE_TOKEN_URL = 'https://airtable.com/oauth2/v1/token';

router.get('/airtable', (req, res) => {
  try {
    const { codeVerifier, codeChallenge, codeChallengeMethod } = generatePKCE();
    const state = generateState();

    pkceStore.set(state, codeVerifier);

    // Increase timeout to 30 minutes to handle slower redirects
    setTimeout(() => pkceStore.delete(state), 30 * 60 * 1000);

    // Also store in cookie as backup
    res.cookie(`oauth_state_${state}`, codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 60 * 1000 // 30 minutes
    });

    const params = new URLSearchParams({
      client_id: process.env.AIRTABLE_CLIENT_ID,
      redirect_uri: process.env.AIRTABLE_REDIRECT_URI,
      response_type: 'code',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      scope: 'data.records:read data.records:write schema.bases:read webhook:manage'
    });

    const authUrl = `${AIRTABLE_AUTH_URL}?${params.toString()}`;

    res.json({
      success: true,
      authUrl,
      state
    });
  } catch (error) {
    console.error('Error initiating OAuth:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate OAuth flow'
    });
  }
});

router.get('/airtable/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle Airtable errors
    if (error) {
      console.error('Airtable OAuth error:', error, error_description);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/login?error=${error}&error_description=${encodeURIComponent(error_description || '')}`);
    }

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        message: 'Missing authorization code or state'
      });
    }

    // Try to get codeVerifier from pkceStore or cookie
    let codeVerifier = pkceStore.get(state);
    
    if (!codeVerifier) {
      // Fallback to cookie
      codeVerifier = req.cookies[`oauth_state_${state}`];
    }

    if (!codeVerifier) {
      console.error('State parameter not found. State:', state);
      console.error('Available states in pkceStore:', Array.from(pkceStore.keys()));
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/login?error=auth_failed&error_description=Session%20expired.%20Please%20try%20logging%20in%20again.`);
    }

    pkceStore.delete(state);
    res.clearCookie(`oauth_state_${state}`);

    const credentials = Buffer.from(
      `${process.env.AIRTABLE_CLIENT_ID}:${process.env.AIRTABLE_CLIENT_SECRET}`
    ).toString('base64');

    const tokenResponse = await axios.post(
      AIRTABLE_TOKEN_URL,
      new URLSearchParams({
        code_verifier: codeVerifier,
        redirect_uri: process.env.AIRTABLE_REDIRECT_URI,
        code: code,
        grant_type: 'authorization_code'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        }
      }
    );

    const {
      access_token,
      refresh_token,
      expires_in,
      scope
    } = tokenResponse.data;

    const userResponse = await axios.get('https://api.airtable.com/v0/meta/whoami', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const airtableUser = userResponse.data;

    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    let user = await User.findOne({ airtableUserId: airtableUser.id });

    if (user) {
      user.accessToken = access_token;
      user.refreshToken = refresh_token;
      user.tokenExpiresAt = tokenExpiresAt;
      user.scopes = scope ? scope.split(' ') : [];
      user.email = airtableUser.email || user.email;
      user.name = airtableUser.name || user.name;
      user.profileData = airtableUser;
    } else {
      user = new User({
        airtableUserId: airtableUser.id,
        email: airtableUser.email,
        name: airtableUser.name,
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: tokenExpiresAt,
        scopes: scope ? scope.split(' ') : [],
        profileData: airtableUser
      });
    }

    await user.save();

    const token = jwt.sign(
      { userId: user._id, airtableUserId: user.airtableUserId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/callback?token=${token}`);

  } catch (error) {
    console.error('OAuth callback error:', error.response?.data || error.message);
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user data'
    });
  }
});

router.post('/logout', authenticate, (req, res) => {
  try {
    res.clearCookie('token');
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

router.post('/refresh', authenticate, async (req, res) => {
  try {
    const user = req.user;

    if (!user.refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'No refresh token available'
      });
    }

    const credentials = Buffer.from(
      `${process.env.AIRTABLE_CLIENT_ID}:${process.env.AIRTABLE_CLIENT_SECRET}`
    ).toString('base64');

    const tokenResponse = await axios.post(
      AIRTABLE_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: user.refreshToken
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    user.accessToken = access_token;
    if (refresh_token) {
      user.refreshToken = refresh_token;
    }
    user.tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    await user.save();

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      expiresAt: user.tokenExpiresAt
    });

  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    res.status(400).json({
      success: false,
      message: 'Failed to refresh token',
      requiresReauth: true
    });
  }
});

module.exports = router;
