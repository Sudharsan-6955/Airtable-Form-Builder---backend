const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const airtableService = require('../utils/airtableService');
const AppError = require('../utils/AppError');

/**
 * @route   GET /api/airtable/bases
 * @desc    Get list of user's Airtable bases
 * @access  Private
 */
router.get('/bases', authenticate, async (req, res, next) => {
  try {
    const bases = await airtableService.getBases(req.user.accessToken);
    
    res.json({
      success: true,
      data: bases
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/airtable/bases/:baseId/tables
 * @desc    Get tables in a specific base
 * @access  Private
 */
router.get('/bases/:baseId/tables', authenticate, async (req, res, next) => {
  try {
    const { baseId } = req.params;
    const tables = await airtableService.getBaseSchema(req.user.accessToken, baseId);
    
    res.json({
      success: true,
      data: tables
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/airtable/bases/:baseId/tables/:tableId/fields
 * @desc    Get fields for a specific table (only supported types)
 * @access  Private
 */
router.get('/bases/:baseId/tables/:tableId/fields', authenticate, async (req, res, next) => {
  try {
    const { baseId, tableId } = req.params;
    const fields = await airtableService.getTableFields(
      req.user.accessToken,
      baseId,
      tableId
    );
    
    // Filter to only supported field types
    const supportedFields = airtableService.filterSupportedFields(fields);
    
    res.json({
      success: true,
      data: {
        total: fields.length,
        supported: supportedFields.length,
        fields: supportedFields
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
