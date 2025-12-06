const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const airtableService = require('../utils/airtableService');
const AppError = require('../utils/AppError');

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

router.get('/bases/:baseId/tables/:tableId/fields', authenticate, async (req, res, next) => {
  try {
    const { baseId, tableId } = req.params;
    const fields = await airtableService.getTableFields(
      req.user.accessToken,
      baseId,
      tableId
    );
    
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
