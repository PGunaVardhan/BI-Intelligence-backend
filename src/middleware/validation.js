// backend/src/middleware/validation.js
const Joi = require('joi');

// Validation schemas
const schemas = {
  chatMessage: Joi.object({
    message: Joi.string().required().min(1).max(10000),
    conversationId: Joi.string().required(),
    files: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required(),
      size: Joi.number().required(),
      type: Joi.string().required(),
      path: Joi.string(),
      uploadedAt: Joi.string()
    })).optional()
  }),

  modelSwitch: Joi.object({
    modelId: Joi.string().required()
  }),

  apiKey: Joi.object({
    modelId: Joi.string().required(),
    apiKey: Joi.string().required().min(10)
  }),

  conversationId: Joi.object({
    conversationId: Joi.string().required()
  })
};

// Generic validation middleware factory
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error } = schema.validate(req[property]);
    
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      return res.status(400).json({
        error: 'Validation error',
        message: errorMessage,
        details: error.details
      });
    }
    
    next();
  };
};

// Specific validation middlewares
const validateChatMessage = validate(schemas.chatMessage);
const validateModelSwitch = validate(schemas.modelSwitch);
const validateApiKey = validate(schemas.apiKey);
const validateConversationId = validate(schemas.conversationId, 'params');

// Custom validation functions
const validateFileUpload = (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      error: 'No files uploaded',
      message: 'At least one file is required'
    });
  }

  // Validate file count
  if (req.files.length > 1000) {
    return res.status(400).json({
      error: 'Too many files',
      message: 'Maximum 1000 files allowed'
    });
  }

  // Validate individual files
  for (const file of req.files) {
    if (file.size > 100 * 1024 * 1024) { // 100MB
      return res.status(400).json({
        error: 'File too large',
        message: `File ${file.originalname} exceeds 100MB limit`
      });
    }
  }

  next();
};

const validateConversationExists = (conversations) => {
  return (req, res, next) => {
    const { conversationId } = req.params;
    
    if (!conversations.has(conversationId)) {
      return res.status(404).json({
        error: 'Conversation not found',
        message: `Conversation ${conversationId} does not exist`
      });
    }
    
    next();
  };
};

// Request sanitization
const sanitizeInput = (req, res, next) => {
  // Remove any potential XSS or injection attempts
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/javascript:/gi, '')
              .replace(/on\w+\s*=/gi, '');
  };

  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = sanitizeString(obj[key]);
      } else if (typeof obj[key] === 'object') {
        obj[key] = sanitizeObject(obj[key]);
      }
    }
    
    return obj;
  };

  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
};

module.exports = {
  validate,
  validateChatMessage,
  validateModelSwitch,
  validateApiKey,
  validateConversationId,
  validateFileUpload,
  validateConversationExists,
  sanitizeInput,
  schemas
};