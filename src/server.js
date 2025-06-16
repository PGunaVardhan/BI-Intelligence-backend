// backend/src/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import routes
const filesRoutes = require('./routes/files');
const chatRoutes = require('./routes/chat');
const modelsRoutes = require('./routes/models');
const healthRoutes = require('./routes/health');
const mcpRoutes = require('./routes/mcp');

// Import middleware
const corsMiddleware = require('./middleware/cors');
const { globalErrorHandler } = require('./utils/errorHandler');
const logger = require('./utils/logger');

// Import services
const mcpBridge = require('./services/mcpBridge');
const modelManager = require('./services/modelManager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Configuration
const PORT = process.env.PORT || 3001;
const UPLOAD_DIR = path.join(__dirname, '../uploads');

// Middleware
app.use(corsMiddleware);
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Make io accessible to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/files', filesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/models', modelsRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/mcp', mcpRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
  
  socket.on('join_conversation', (conversationId) => {
    socket.join(conversationId);
    logger.info(`Socket ${socket.id} joined conversation ${conversationId}`);
  });
});

// Error handling middleware
app.use(globalErrorHandler);

// Initialize services
async function initializeServices() {
  try {
    // Initialize model manager
    await modelManager.initialize();
    logger.info('Model Manager initialized');
    
    // Initialize MCP bridge with default model
    await mcpBridge.initialize();
    logger.info('MCP Bridge initialized');
    
    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Start server
server.listen(PORT, async () => {
  logger.info(`Backend server running on port ${PORT}`);
  await initializeServices();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
  });
});

module.exports = { app, server, io };