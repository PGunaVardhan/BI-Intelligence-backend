// backend/src/middleware/fileUpload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

// Create upload directory if it doesn't exist
const createUploadDir = async (dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    logger.error('Failed to create upload directory:', error);
    throw error;
  }
};

// Configure storage
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const timestamp = Date.now();
    const uploadPath = path.join(__dirname, '../../uploads', `uploaded_content_${timestamp}`);
    
    try {
      await createUploadDir(uploadPath);
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Sanitize filename
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, sanitizedName);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Basic file type validation
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'application/json',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/bmp',
    'video/mp4',
    'video/avi',
    'video/mov',
    'video/wmv',
    'audio/mp3',
    'audio/wav',
    'audio/flac',
    'audio/aac'
  ];

  if (allowedTypes.includes(file.mimetype) || 
      file.mimetype.startsWith('image/') || 
      file.mimetype.startsWith('video/') || 
      file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not supported`), false);
  }
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
    files: 1000 // Max 1000 files
  }
});

// Error handling middleware for multer
const handleMulterErrors = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File too large',
        message: 'Maximum file size is 100MB'
      });
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ 
        error: 'Too many files',
        message: 'Maximum 1000 files allowed'
      });
    } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ 
        error: 'Unexpected file field',
        message: 'Unexpected file upload field'
      });
    }
  }
  
  if (error.message && error.message.includes('not supported')) {
    return res.status(400).json({ 
      error: 'File type not supported',
      message: error.message
    });
  }
  
  next(error);
};

module.exports = {
  upload,
  handleMulterErrors
};