const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const Form = require('../models/Form');
const Response = require('../models/Response');
const User = require('../models/User');
const { shouldShowQuestion } = require('../utils/conditionalLogic');
const { createRecord } = require('../utils/airtableService');
const { upload, formatFilesForAirtable } = require('../utils/fileUpload');
const AppError = require('../utils/AppError');

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

router.post('/:formId/submit',
  authenticate,
  upload.array('files', 10),
  param('formId').isMongoId().withMessage('Invalid form ID'),
  async (req, res, next) => {
    try {
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

      const answers = JSON.parse(req.body.answers || '{}');

      const owner = await User.findById(form.ownerId);
      if (!owner) {
        throw new AppError('Form owner not found', 500);
      }

      const visibleQuestions = [];
      const answersSoFar = {};

      for (const question of form.questions) {
        const isVisible = shouldShowQuestion(question.conditionalRules, answersSoFar);
        
        if (isVisible) {
          visibleQuestions.push(question);
          
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

          if (answers[question.questionKey] !== undefined) {
            answersSoFar[question.questionKey] = answers[question.questionKey];
          }
        }
      }

      const airtableFields = {};
      
      for (const question of form.questions) {
        const answer = answers[question.questionKey];
        
        if (answer === undefined || answer === null) continue;

        const fieldName = question.airtableFieldName;

        switch (question.type) {
          case 'singleLineText':
          case 'multilineText':
            airtableFields[fieldName] = String(answer);
            break;

          case 'singleSelect':
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

      const airtableRecord = await createRecord(
        owner.accessToken,
        form.airtableBaseId,
        form.airtableTableId,
        airtableFields
      );

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

router.get('/:formId/responses',
  authenticate,
  param('formId').isMongoId().withMessage('Invalid form ID'),
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const form = await Form.findById(req.params.formId);

      if (!form) {
        throw new AppError('Form not found', 404);
      }

      if (form.ownerId.toString() !== req.userId.toString()) {
        throw new AppError('Not authorized to view responses', 403);
      }

      const { includeDeleted } = req.query;
      
      const filter = { formId: form._id };
      if (includeDeleted !== 'true') {
        filter.deletedInAirtable = false;
      }

      const responses = await Response.find(filter)
        .sort({ createdAt: -1 })
        .select('-__v');

      res.json({
        success: true,
        count: responses.length,
        data: responses
      });

    } catch (error) {
      next(error);
    }
  }
);

router.get('/:responseId',
  authenticate,
  param('responseId').isMongoId().withMessage('Invalid response ID'),
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const response = await Response.findById(req.params.responseId)
        .populate('formId', 'title ownerId');

      if (!response) {
        throw new AppError('Response not found', 404);
      }

      if (response.formId.ownerId.toString() !== req.userId.toString()) {
        throw new AppError('Not authorized to view this response', 403);
      }

      res.json({
        success: true,
        data: response
      });

    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
