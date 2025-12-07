const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const Form = require('../models/Form');
const Response = require('../models/Response');
const User = require('../models/User');
const { validateConditionalRules, shouldShowQuestion } = require('../utils/conditionalLogic');
const { isSupportedFieldType, createRecord } = require('../utils/airtableService');
const { upload, formatFilesForAirtable } = require('../utils/fileUpload');
const AppError = require('../utils/AppError');

/**
 * Validation middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

/**
 * @route   POST /api/forms
 * @desc    Create a new form
 * @access  Private
 */
router.post('/',
  authenticate,
  [
    body('title').notEmpty().trim().withMessage('Title is required'),
    body('airtableBaseId').notEmpty().withMessage('Base ID is required'),
    body('airtableTableId').notEmpty().withMessage('Table ID is required'),
    body('questions').isArray({ min: 1 }).withMessage('At least one question is required'),
    body('questions.*.questionKey').notEmpty().withMessage('Question key is required'),
    body('questions.*.airtableFieldId').notEmpty().withMessage('Field ID is required'),
    body('questions.*.label').notEmpty().withMessage('Label is required'),
    body('questions.*.type').isIn(['singleLineText', 'multilineText', 'singleSelect', 'multipleSelects', 'multipleAttachments', 'number', 'email', 'url', 'phoneNumber', 'date', 'dateTime', 'checkbox', 'rating', 'currency', 'percent'])
      .withMessage('Invalid field type')
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const {
        title,
        description,
        airtableBaseId,
        airtableTableId,
        airtableBaseName,
        airtableTableName,
        questions
      } = req.body;

      // Validate field types are supported
      const unsupportedFields = questions.filter(q => !isSupportedFieldType(q.type));
      if (unsupportedFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Some field types are not supported',
          unsupportedFields: unsupportedFields.map(f => ({ key: f.questionKey, type: f.type }))
        });
      }

      // Validate conditional rules
      const rulesValidation = validateConditionalRules(questions);
      if (!rulesValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid conditional rules',
          errors: rulesValidation.errors
        });
      }

      // Create form
      const form = new Form({
        ownerId: req.userId,
        title,
        description,
        airtableBaseId,
        airtableTableId,
        airtableBaseName,
        airtableTableName,
        questions
      });

      await form.save();

      res.status(201).json({
        success: true,
        message: 'Form created successfully',
        data: form
      });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/forms
 * @desc    Get all forms for authenticated user
 * @access  Private
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { isActive } = req.query;
    
    const filter = { ownerId: req.userId };
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const forms = await Form.find(filter)
      .sort({ createdAt: -1 })
      .select('-questions'); // Exclude questions for list view

    res.json({
      success: true,
      count: forms.length,
      data: forms
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/forms/:formId
 * @desc    Get single form by ID (public for form filling)
 * @access  Public
 */
router.get('/:formId',
  authenticate,
  param('formId').isMongoId().withMessage('Invalid form ID'),
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const form = await Form.findById(req.params.formId);

      if (!form) {
        throw new AppError('Form not found', 404);
      }

      // Only owner can fetch the full form definition for rendering
      if (form.ownerId.toString() !== req.userId.toString()) {
        throw new AppError('Not authorized to view this form', 403);
      }

      if (!form.isActive) {
        throw new AppError('Form is not active', 403);
      }

      res.json({
        success: true,
        data: form
      });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/forms/:formId
 * @desc    Update form
 * @access  Private (owner only)
 */
router.put('/:formId',
  authenticate,
  param('formId').isMongoId().withMessage('Invalid form ID'),
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const form = await Form.findById(req.params.formId);

      if (!form) {
        throw new AppError('Form not found', 404);
      }

      // Check ownership
      if (form.ownerId.toString() !== req.userId.toString()) {
        throw new AppError('Not authorized to update this form', 403);
      }

      // Update allowed fields
      const allowedUpdates = ['title', 'description', 'questions', 'isActive'];
      allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
          form[field] = req.body[field];
        }
      });

      // Validate conditional rules if questions updated
      if (req.body.questions) {
        const rulesValidation = validateConditionalRules(req.body.questions);
        if (!rulesValidation.isValid) {
          return res.status(400).json({
            success: false,
            message: 'Invalid conditional rules',
            errors: rulesValidation.errors
          });
        }
      }

      await form.save();

      res.json({
        success: true,
        message: 'Form updated successfully',
        data: form
      });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/forms/:formId
 * @desc    Delete form
 * @access  Private (owner only)
 */
router.delete('/:formId',
  authenticate,
  param('formId').isMongoId().withMessage('Invalid form ID'),
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const form = await Form.findById(req.params.formId);

      if (!form) {
        throw new AppError('Form not found', 404);
      }

      // Check ownership
      if (form.ownerId.toString() !== req.userId.toString()) {
        throw new AppError('Not authorized to delete this form', 403);
      }

        // Hard delete: remove responses and the form itself
        await Response.deleteMany({ formId: form._id });
        await form.deleteOne();

        // TODO: Cleanup associated webhooks if any

        res.json({
          success: true,
          message: 'Form deleted successfully (and responses removed)'
        });

    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/forms/:formId/submit
 * @desc    Submit form response (creates Airtable record + saves to DB)
 * @access  Public
 */
router.post('/:formId/submit',
  upload.array('files', 10), // Support up to 10 files
  param('formId').isMongoId().withMessage('Invalid form ID'),
  async (req, res, next) => {
    try {
      // Validate form ID
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const form = await Form.findById(req.params.formId);

      if (!form || !form.isActive) {
        throw new AppError('Form not found or inactive', 404);
      }

      // Parse answers from request body
      const answers = JSON.parse(req.body.answers || '{}');

      // Get form owner to use their Airtable token
      const owner = await User.findById(form.ownerId);
      if (!owner) {
        throw new AppError('Form owner not found', 500);
      }

      // Validate answers against form definition
      const visibleQuestions = [];
      const answersSoFar = {};

      for (const question of form.questions) {
        // Check if question should be visible
        const isVisible = shouldShowQuestion(question.conditionalRules, answersSoFar);
        
        if (isVisible) {
          visibleQuestions.push(question);
          
          // Check required fields
          if (question.required) {
            const answer = answers[question.questionKey];
            if (answer === undefined || answer === null || answer === '') {
              return res.status(400).json({
                success: false,
                message: `Required field missing: ${question.label}`,
                field: question.questionKey
              });
            }
          }

          // Add to answersSoFar for next conditional checks
          if (answers[question.questionKey] !== undefined) {
            answersSoFar[question.questionKey] = answers[question.questionKey];
          }
        }
      }

      // Prepare fields for Airtable
      const airtableFields = {};
      
      for (const question of form.questions) {
        const answer = answers[question.questionKey];
        
        if (answer === undefined || answer === null) continue;

        // Map answer to Airtable field by name
        const fieldName = question.airtableFieldName;

        switch (question.type) {
          case 'singleLineText':
          case 'multilineText':
            airtableFields[fieldName] = String(answer);
            break;

          case 'singleSelect':
            // Validate option
            if (question.options && !question.options.includes(answer)) {
              return res.status(400).json({
                success: false,
                message: `Invalid option for ${question.label}`,
                field: question.questionKey
              });
            }
            airtableFields[fieldName] = answer;
            break;

          case 'multipleSelects':
            // Validate options
            if (!Array.isArray(answer)) {
              return res.status(400).json({
                success: false,
                message: `${question.label} must be an array`,
                field: question.questionKey
              });
            }
            if (question.options) {
              const invalidOptions = answer.filter(opt => !question.options.includes(opt));
              if (invalidOptions.length > 0) {
                return res.status(400).json({
                  success: false,
                  message: `Invalid options for ${question.label}: ${invalidOptions.join(', ')}`,
                  field: question.questionKey
                });
              }
            }
            airtableFields[fieldName] = answer;
            break;

          case 'multipleAttachments':
            // Handle file uploads
            const files = req.files?.filter(f => 
              f.fieldname === `file_${question.questionKey}`
            );
            if (files && files.length > 0) {
              airtableFields[fieldName] = formatFilesForAirtable(files);
            }
            break;

          default:
            airtableFields[fieldName] = answer;
        }
      }

      // Create record in Airtable
      const airtableRecord = await createRecord(
        owner.accessToken,
        form.airtableBaseId,
        form.airtableTableId,
        airtableFields
      );

      // Save response to MongoDB
      const response = new Response({
        formId: form._id,
        airtableRecordId: airtableRecord.id,
        answers: answers,
        metadata: {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          submissionSource: 'web'
        }
      });

      await response.save();

      // Update form stats
      form.submissionCount += 1;
      form.lastSubmissionAt = new Date();
      await form.save();

      res.status(201).json({
        success: true,
        message: 'Form submitted successfully',
        data: {
          responseId: response._id,
          airtableRecordId: airtableRecord.id
        }
      });

    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
