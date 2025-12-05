const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { generatePKCE, generateState } = require('../utils/pkce');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const AppError = require('../utils/AppError');

// Store PKCE verifiers temporarily (in production, use Redis or session store)
const pkceStore = new Map();

// Airtable OAuth endpoints
const AIRTABLE_AUTH_URL = 'https://airtable.com/oauth2/v1/authorize';
const AIRTABLE_TOKEN_URL = 'https://airtable.com/oauth2/v1/token';

/**
 * @route   GET /api/auth/airtable
 * @desc    Initiate Airtable OAuth flow
 * @access  Public
 */
router.get('/airtable', (req, res) => {
  try {
    // Generate PKCE parameters
    const { codeVerifier, codeChallenge, codeChallengeMethod } = generatePKCE();
    const state = generateState();

    // Store code verifier with state as key
    pkceStore.set(state, codeVerifier);

    // Clean up old entries after 10 minutes
    setTimeout(() => pkceStore.delete(state), 10 * 60 * 1000);

    // Build authorization URL
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

/**
 * @route   GET /api/auth/airtable/callback
 * @desc    Handle Airtable OAuth callback
 * @access  Public
 */
router.get('/airtable/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        message: 'Missing authorization code or state'
      });
    }

    // Retrieve code verifier
    const codeVerifier = pkceStore.get(state);
    if (!codeVerifier) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired state parameter'
      });
    }

    // Clean up
    pkceStore.delete(state);

    // Exchange authorization code for access token
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

    // Fetch user info from Airtable
    const userResponse = await axios.get('https://api.airtable.com/v0/meta/whoami', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const airtableUser = userResponse.data;

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    // Find or create user
    let user = await User.findOne({ airtableUserId: airtableUser.id });

    if (user) {
      // Update existing user
      user.accessToken = access_token;
      user.refreshToken = refresh_token;
      user.tokenExpiresAt = tokenExpiresAt;
      user.scopes = scope ? scope.split(' ') : [];
      user.email = airtableUser.email || user.email;
      user.name = airtableUser.name || user.name;
      user.profileData = airtableUser;
    } else {
      // Create new user
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

    // Generate JWT for our application
    const token = jwt.sign(
      { userId: user._id, airtableUserId: user.airtableUserId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/callback?token=${token}`);

  } catch (error) {
    console.error('OAuth callback error:', error.response?.data || error.message);
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current authenticated user
 * @access  Private
 */
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

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', authenticate, (req, res) => {
  try {
    // Clear cookie
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

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh Airtable access token
 * @access  Private
 */
router.post('/refresh', authenticate, async (req, res) => {
  try {
    const user = req.user;

    if (!user.refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'No refresh token available'
      });
    }

    // Request new access token
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

    // Update user tokens
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
