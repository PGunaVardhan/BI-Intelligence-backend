// backend/src/services/fileProcessor.js
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class FileProcessor {
  async processFile(file) {
    try {
      const fileInfo = {
        metadata: await this.extractMetadata(file),
        preview: await this.generatePreview(file),
        hash: await this.calculateHash(file)
      };

      return fileInfo;
    } catch (error) {
      logger.error(`Error processing file ${file.originalname}:`, error);
      return {
        metadata: null,
        preview: null,
        hash: null,
        error: error.message
      };
    }
  }

  async extractMetadata(file) {
    try {
      const stats = await fs.stat(file.path);
      
      const metadata = {
        size: file.size,
        type: file.mimetype,
        extension: path.extname(file.originalname).toLowerCase(),
        created: stats.birthtime,
        modified: stats.mtime,
        encoding: file.encoding || 'unknown'
      };

      // Add specific metadata based on file type
      if (file.mimetype.startsWith('image/')) {
        metadata.category = 'image';
      } else if (file.mimetype.startsWith('video/')) {
        metadata.category = 'video';
      } else if (file.mimetype.startsWith('audio/')) {
        metadata.category = 'audio';
      } else if (file.mimetype.includes('pdf')) {
        metadata.category = 'document';
        metadata.subtype = 'pdf';
      } else if (file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet')) {
        metadata.category = 'spreadsheet';
      } else if (file.mimetype.includes('word') || file.mimetype.includes('document')) {
        metadata.category = 'document';
        metadata.subtype = 'word';
      } else if (file.mimetype.includes('text')) {
        metadata.category = 'text';
      } else {
        metadata.category = 'other';
      }

      return metadata;
    } catch (error) {
      logger.error('Error extracting metadata:', error);
      return null;
    }
  }

  async generatePreview(file) {
    try {
      const maxPreviewSize = 1024; // 1KB preview for text files
      
      if (file.mimetype.startsWith('text/')) {
        const content = await fs.readFile(file.path, 'utf8');
        return {
          type: 'text',
          content: content.substring(0, maxPreviewSize),
          truncated: content.length > maxPreviewSize
        };
      } else if (file.mimetype.includes('json')) {
        const content = await fs.readFile(file.path, 'utf8');
        try {
          const parsed = JSON.parse(content);
          return {
            type: 'json',
            content: JSON.stringify(parsed, null, 2).substring(0, maxPreviewSize),
            truncated: content.length > maxPreviewSize,
            valid: true
          };
        } catch (jsonError) {
          return {
            type: 'json',
            content: content.substring(0, maxPreviewSize),
            truncated: content.length > maxPreviewSize,
            valid: false,
            error: 'Invalid JSON'
          };
        }
      } else {
        return {
          type: 'binary',
          content: 'Binary file - no preview available',
          truncated: false
        };
      }
    } catch (error) {
      logger.error('Error generating preview:', error);
      return null;
    }
  }

  async calculateHash(file) {
    try {
      const crypto = require('crypto');
      const content = await fs.readFile(file.path);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      return hash;
    } catch (error) {
      logger.error('Error calculating hash:', error);
      return null;
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  isFileTypeSupported(mimeType) {
    const supportedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
      'application/json'
    ];

    return supportedTypes.includes(mimeType) || 
           mimeType.startsWith('image/') || 
           mimeType.startsWith('video/') || 
           mimeType.startsWith('audio/');
  }

  getFileIcon(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    const iconMap = {
      '.pdf': '📄',
      '.doc': '📝',
      '.docx': '📝',
      '.xls': '📊',
      '.xlsx': '📊',
      '.csv': '📊',
      '.ppt': '📊',
      '.pptx': '📊',
      '.jpg': '🖼️',
      '.jpeg': '🖼️',
      '.png': '🖼️',
      '.gif': '🖼️',
      '.mp4': '🎥',
      '.avi': '🎥',
      '.mov': '🎥',
      '.mp3': '🎵',
      '.wav': '🎵',
      '.txt': '📄',
      '.json': '📋'
    };
    return iconMap[extension] || '📄';
  }
}

module.exports = new FileProcessor();