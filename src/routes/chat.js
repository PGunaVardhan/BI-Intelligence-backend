// backend/src/routes/chat.js
const express = require('express');
const router = express.Router();
const mcpBridge = require('../services/mcpBridge');
const logger = require('../utils/logger');

// Store conversation history (in production, use a database)
const conversations = new Map();

// Process chat message
router.post('/message', async (req, res) => {
  try {
    const { message, conversationId, files } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID is required' });
    }

    logger.info(`Processing chat message for conversation: ${conversationId}`);

    // Get or create conversation
    if (!conversations.has(conversationId)) {
      conversations.set(conversationId, []);
    }

    const conversation = conversations.get(conversationId);

    // Add user message to conversation
    const userMessage = {
      id: Date.now(),
      text: message,
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    conversation.push(userMessage);

    try {
      // Process request through MCP Bridge
      const result = await mcpBridge.processUserRequest(
        conversationId,
        message,
        files || []
      );

      // Create AI response message
      const aiMessage = {
        id: Date.now() + 1,
        text: result.response,
        sender: 'ai',
        timestamp: new Date().toISOString(),
        toolsUsed: result.toolsUsed,
        confidence: result.confidence
      };

      conversation.push(aiMessage);

      // Emit to WebSocket clients
      if (req.io) {
        req.io.to(conversationId).emit('new_message', {
          conversationId,
          message: aiMessage
        });
      }

      res.json({
        message: aiMessage,
        toolsUsed: result.toolsUsed,
        confidence: result.confidence
      });

    } catch (mcpError) {
      logger.error('MCP Bridge error:', mcpError);

      // Create error response
      const errorMessage = {
        id: Date.now() + 1,
        text: 'I apologize, but I encountered an error processing your request. Please try again.',
        sender: 'ai',
        timestamp: new Date().toISOString(),
        error: true
      };

      conversation.push(errorMessage);

      res.status(500).json({
        message: errorMessage,
        error: 'Processing failed'
      });
    }

  } catch (error) {
    logger.error('Chat route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get conversation history
router.get('/history/:conversationId', (req, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = conversations.get(conversationId) || [];

    res.json({
      conversationId,
      messages: conversation,
      messageCount: conversation.length
    });

  } catch (error) {
    logger.error('Error getting conversation history:', error);
    res.status(500).json({ error: 'Failed to get conversation history' });
  }
});

// Clear conversation history
router.delete('/history/:conversationId', (req, res) => {
  try {
    const { conversationId } = req.params;
    
    if (conversations.has(conversationId)) {
      conversations.delete(conversationId);
      logger.info(`Cleared conversation: ${conversationId}`);
    }

    res.json({ message: 'Conversation history cleared' });

  } catch (error) {
    logger.error('Error clearing conversation history:', error);
    res.status(500).json({ error: 'Failed to clear conversation history' });
  }
});

// Get all conversations
router.get('/conversations', (req, res) => {
  try {
    const conversationList = Array.from(conversations.entries()).map(([id, messages]) => ({
      conversationId: id,
      messageCount: messages.length,
      lastMessage: messages[messages.length - 1],
      createdAt: messages[0]?.timestamp,
      updatedAt: messages[messages.length - 1]?.timestamp
    }));

    res.json({
      conversations: conversationList,
      total: conversationList.length
    });

  } catch (error) {
    logger.error('Error getting conversations:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

module.exports = router;