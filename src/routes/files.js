// backend/src/routes/files.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const logger = require('../utils/logger');
const fileProcessor = require('../services/fileProcessor');
const { validateFileUpload } = require('../middleware/validation');

// Ensure uploads directory exists
const ensureUploadsDir = async () => {
  const uploadsDir = path.join(__dirname, '../../uploads');
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    logger.info(`Uploads directory ensured: ${uploadsDir}`);
  } catch (error) {
    logger.error('Failed to create uploads directory:', error);
  }
};

// Initialize uploads directory
ensureUploadsDir();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const timestamp = Date.now();
    const uploadPath = path.join(__dirname, '../../uploads', `uploaded_content_${timestamp}`);
    
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      logger.info(`Created upload directory: ${uploadPath}`);
      cb(null, uploadPath);
    } catch (error) {
      logger.error('Failed to create upload directory:', error);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Sanitize filename
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    logger.info(`Saving file as: ${sanitizedName}`);
    cb(null, sanitizedName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
    files: 1000 // Max 1000 files
  },
  fileFilter: (req, file, cb) => {
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

    logger.info(`Validating file: ${file.originalname} (${file.mimetype})`);

    if (allowedTypes.includes(file.mimetype) || 
        file.mimetype.startsWith('image/') || 
        file.mimetype.startsWith('video/') || 
        file.mimetype.startsWith('audio/')) {
      logger.info(`File type accepted: ${file.mimetype}`);
      cb(null, true);
    } else {
      logger.warn(`File type rejected: ${file.mimetype}`);
      cb(new Error(`File type ${file.mimetype} not supported`), false);
    }
  }
});

// File upload endpoint
router.post('/upload', upload.array('files', 1000), async (req, res) => {
  try {
    logger.info(`File upload request received. Files count: ${req.files ? req.files.length : 0}`);

    if (!req.files || req.files.length === 0) {
      logger.warn('No files uploaded in request');
      return res.status(400).json({ error: 'No files uploaded' });
    }

    logger.info(`Processing ${req.files.length} uploaded files`);

    const uploadedFiles = [];

    for (const file of req.files) {
      try {
        logger.info(`Processing file: ${file.originalname}`);
        
        // Verify file was actually saved
        const fileExists = await fs.access(file.path).then(() => true).catch(() => false);
        if (!fileExists) {
          logger.error(`File not found after upload: ${file.path}`);
          continue;
        }

        // Process file metadata
        const fileInfo = await fileProcessor.processFile(file);
        
        const processedFile = {
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: file.originalname,
          filename: file.filename,
          size: file.size,
          type: file.mimetype,
          path: file.path,
          uploadedAt: new Date().toISOString(),
          ...fileInfo
        };

        uploadedFiles.push(processedFile);
        logger.info(`Successfully processed file: ${file.originalname} -> ${file.path}`);

      } catch (fileError) {
        logger.error(`Error processing file ${file.originalname}:`, fileError);
        // Continue with other files
      }
    }

    if (uploadedFiles.length === 0) {
      logger.error('No files could be processed successfully');
      return res.status(500).json({ error: 'No files could be processed' });
    }

    logger.info(`Upload complete. Successfully processed ${uploadedFiles.length} files`);

    res.json({
      message: 'Files uploaded successfully',
      files: uploadedFiles,
      totalFiles: uploadedFiles.length,
      totalSize: uploadedFiles.reduce((sum, file) => sum + file.size, 0)
    });

  } catch (error) {
    logger.error('File upload error:', error);
    
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large (max 100MB per file)' });
      } else if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Too many files (max 1000 files)' });
      }
    }

    res.status(500).json({ error: 'File upload failed' });
  }
});

// Get file metadata
router.get('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // In production, store this in a database
    // For now, this is a placeholder response
    res.json({
      message: 'File metadata endpoint - implement with database storage',
      fileId
    });

  } catch (error) {
    logger.error('Error getting file metadata:', error);
    res.status(500).json({ error: 'Failed to get file metadata' });
  }
});

// Download file
router.get('/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // In production, retrieve file path from database
    // For now, this is a placeholder
    res.json({
      message: 'File download endpoint - implement with database storage',
      fileId
    });

  } catch (error) {
    logger.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Delete file
router.delete('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // In production, remove file from storage and database
    // For now, this is a placeholder
    res.json({
      message: 'File deleted successfully',
      fileId
    });

  } catch (error) {
    logger.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Get upload statistics
router.get('/stats/uploads', async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, '../../uploads');
    
    try {
      const uploadFolders = await fs.readdir(uploadsDir);
      const uploadSessionFolders = uploadFolders.filter(folder => folder.startsWith('uploaded_content_'));
      
      // Get detailed stats for each folder
      const folderStats = [];
      for (const folder of uploadSessionFolders) {
        try {
          const folderPath = path.join(uploadsDir, folder);
          const files = await fs.readdir(folderPath);
          folderStats.push({
            folder,
            fileCount: files.length,
            files: files
          });
        } catch (folderError) {
          logger.warn(`Error reading folder ${folder}:`, folderError);
        }
      }

      const stats = {
        totalUploadSessions: uploadSessionFolders.length,
        uploadFolders: folderStats,
        uploadsDirectory: uploadsDir
      };

      logger.info(`Upload stats: ${uploadSessionFolders.length} sessions found`);
      res.json(stats);
    } catch (error) {
      logger.warn('Uploads directory not found or empty');
      res.json({
        totalUploadSessions: 0,
        uploadFolders: [],
        uploadsDirectory: uploadsDir,
        note: 'No uploads found yet'
      });
    }

  } catch (error) {
    logger.error('Error getting upload stats:', error);
    res.status(500).json({ error: 'Failed to get upload statistics' });
  }
});

// Test file upload endpoint
router.post('/test-upload', upload.single('testFile'), async (req, res) => {
  try {
    logger.info('Test file upload endpoint called');

    if (!req.file) {
      return res.status(400).json({ 
        error: 'No test file uploaded',
        message: 'Please select a file for testing'
      });
    }

    logger.info(`Test file received: ${req.file.originalname}`);
    logger.info(`File saved to: ${req.file.path}`);
    logger.info(`File size: ${req.file.size} bytes`);
    logger.info(`File type: ${req.file.mimetype}`);

    // Verify file was actually saved
    const fileExists = await fs.access(req.file.path).then(() => true).catch(() => false);
    
    res.json({
      success: true,
      message: 'Test file uploaded successfully',
      file: {
        originalName: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        type: req.file.mimetype,
        path: req.file.path,
        fileExists: fileExists
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Test file upload error:', error);
    res.status(500).json({ 
      error: 'Test file upload failed',
      details: error.message
    });
  }
});

module.exports = router;