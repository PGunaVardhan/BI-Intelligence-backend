// backend/src/utils/helpers.js
const crypto = require('crypto');
const path = require('path');

/**
 * Generate a unique ID
 */
const generateId = (prefix = '') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
};

/**
 * Generate conversation ID
 */
const generateConversationId = () => {
  return generateId('conv');
};

/**
 * Format file size in human readable format
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Get file extension
 */
const getFileExtension = (filename) => {
  return path.extname(filename).toLowerCase();
};

/**
 * Get file icon based on extension
 */
const getFileIcon = (filename) => {
  const extension = getFileExtension(filename);
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
    '.bmp': '🖼️',
    '.mp4': '🎥',
    '.avi': '🎥',
    '.mov': '🎥',
    '.wmv': '🎥',
    '.mp3': '🎵',
    '.wav': '🎵',
    '.flac': '🎵',
    '.aac': '🎵',
    '.txt': '📄',
    '.json': '📋',
    '.js': '💻',
    '.py': '🐍',
    '.html': '🌐',
    '.css': '🎨'
  };
  return iconMap[extension] || '📄';
};

/**
 * Sanitize filename for safe storage
 */
const sanitizeFilename = (filename) => {
  // Remove or replace dangerous characters
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
};

/**
 * Calculate file hash
 */
const calculateFileHash = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

/**
 * Validate email format
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Delay execution for specified milliseconds
 */
const delay = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry function with exponential backoff
 */
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i === maxRetries - 1) {
        throw lastError;
      }
      
      const delayTime = baseDelay * Math.pow(2, i);
      await delay(delayTime);
    }
  }
};

/**
 * Deep clone an object
 */
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }
  
  if (typeof obj === 'object') {
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
};

/**
 * Check if object is empty
 */
const isEmpty = (obj) => {
  if (obj === null || obj === undefined) return true;
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  if (typeof obj === 'string') return obj.trim().length === 0;
  return false;
};

/**
 * Truncate text to specified length
 */
const truncateText = (text, maxLength = 100, suffix = '...') => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
};

/**
 * Convert bytes to human readable format
 */
const bytesToSize = (bytes) => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Byte';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Get current timestamp in ISO format
 */
const getCurrentTimestamp = () => {
  return new Date().toISOString();
};

/**
 * Validate URL format
 */
const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

/**
 * Generate random string
 */
const generateRandomString = (length = 10) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

/**
 * Check if string is JSON
 */
const isJsonString = (str) => {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Safe JSON parse
 */
const safeJsonParse = (str, defaultValue = null) => {
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultValue;
  }
};

module.exports = {
  generateId,
  generateConversationId,
  formatFileSize,
  getFileExtension,
  getFileIcon,
  sanitizeFilename,
  calculateFileHash,
  isValidEmail,
  delay,
  retryWithBackoff,
  deepClone,
  isEmpty,
  truncateText,
  bytesToSize,
  getCurrentTimestamp,
  isValidUrl,
  generateRandomString,
  isJsonString,
  safeJsonParse
};