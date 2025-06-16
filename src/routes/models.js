// backend/src/routes/models.js
const express = require('express');
const router = express.Router();
const modelManager = require('../services/modelManager');
const mcpBridge = require('../services/mcpBridge');
const logger = require('../utils/logger');

// Get available models
router.get('/available', async (req, res) => {
  try {
    const models = await modelManager.getAvailableModels();
    const currentModel = modelManager.getCurrentModel();

    res.json({
      models,
      currentModel: currentModel ? currentModel.id : null,
      totalModels: models.length
    });

  } catch (error) {
    logger.error('Error getting available models:', error);
    res.status(500).json({ error: 'Failed to get available models' });
  }
});

// Switch to a different model
router.post('/switch', async (req, res) => {
  try {
    const { modelId } = req.body;

    if (!modelId) {
      return res.status(400).json({ error: 'Model ID is required' });
    }

    logger.info(`Switching to model: ${modelId}`);

    // Switch model in model manager
    const model = await modelManager.switchModel(modelId);

    // Update MCP bridge to use new model
    await mcpBridge.switchModel(modelId);

    res.json({
      message: 'Model switched successfully',
      currentModel: {
        id: model.id,
        name: model.name,
        type: model.type
      }
    });

  } catch (error) {
    logger.error('Error switching model:', error);
    res.status(500).json({ 
      error: 'Failed to switch model',
      details: error.message 
    });
  }
});

// Get current model
router.get('/current', (req, res) => {
  try {
    const currentModel = modelManager.getCurrentModel();

    if (!currentModel) {
      return res.status(404).json({ error: 'No model currently selected' });
    }

    res.json({
      id: currentModel.id,
      name: currentModel.name,
      type: currentModel.type,
      config: currentModel.config
    });

  } catch (error) {
    logger.error('Error getting current model:', error);
    res.status(500).json({ error: 'Failed to get current model' });
  }
});

// Set API key for API-based models
router.post('/api-key', async (req, res) => {
  try {
    const { modelId, apiKey } = req.body;

    if (!modelId || !apiKey) {
      return res.status(400).json({ error: 'Model ID and API key are required' });
    }

    // Validate API key
    const isValid = await modelManager.validateApiKey(modelId, apiKey);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Set API key
    await modelManager.setApiKey(modelId, apiKey);

    logger.info(`API key set for model: ${modelId}`);

    res.json({
      message: 'API key set successfully',
      modelId
    });

  } catch (error) {
    logger.error('Error setting API key:', error);
    res.status(500).json({ 
      error: 'Failed to set API key',
      details: error.message 
    });
  }
});

// Test model connection
router.post('/test/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { testPrompt = 'Hello, please respond with "OK"' } = req.body;

    logger.info(`Testing model: ${modelId}`);

    const model = await modelManager.getModel(modelId);
    
    // Test the model with a simple prompt
    const response = await model.generateResponse(testPrompt, 'Respond briefly.');

    res.json({
      success: true,
      modelId,
      testPrompt,
      response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`Error testing model ${req.params.modelId}:`, error);
    res.status(500).json({
      success: false,
      modelId: req.params.modelId,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get model health status
router.get('/health', async (req, res) => {
  try {
    const healthStatus = await modelManager.healthCheck();
    
    res.json({
      ...healthStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting model health:', error);
    res.status(500).json({ 
      error: 'Failed to get model health status',
      timestamp: new Date().toISOString()
    });
  }
});

// Get model capabilities
router.get('/:modelId/capabilities', async (req, res) => {
  try {
    const { modelId } = req.params;
    const models = await modelManager.getAvailableModels();
    const model = models.find(m => m.id === modelId);

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    res.json({
      modelId,
      name: model.name,
      capabilities: model.capabilities,
      mcp_support: model.mcp_support,
      type: model.type,
      requires_api_key: model.requires_api_key
    });

  } catch (error) {
    logger.error('Error getting model capabilities:', error);
    res.status(500).json({ error: 'Failed to get model capabilities' });
  }
});

// Get model statistics
router.get('/stats/usage', (req, res) => {
  try {
    // In production, implement usage tracking
    res.json({
      message: 'Model usage statistics - implement with usage tracking',
      placeholder: true
    });

  } catch (error) {
    logger.error('Error getting model stats:', error);
    res.status(500).json({ error: 'Failed to get model statistics' });
  }
});

module.exports = router;