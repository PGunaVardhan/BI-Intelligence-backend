// backend/src/services/modelManager.js
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

// Import model clients
const QwenClient = require('../models/qwen/qwenClient');
const OpenAIClient = require('../models/openai/openaiClient');
const ClaudeClient = require('../models/claude/claudeClient');
const DeepSeekClient = require('../models/deepseek/deepseekClient');

class ModelManager {
  constructor() {
    this.availableModels = [];
    this.modelClients = new Map();
    this.currentModel = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Load model configurations
      const configPath = path.join(__dirname, '../config/models.json');
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);

      this.availableModels = config.available_models;

      // Update Qwen model path if environment variable exists
      const qwenModel = this.availableModels.find(m => m.id === 'qwen-3-1.7b');
      if (qwenModel && process.env.QWEN_MODEL_PATH) {
        qwenModel.config.model_path = process.env.QWEN_MODEL_PATH;
        logger.info(`Qwen model path: ${qwenModel.config.model_path}`);
      }

      // Initialize model clients
      await this.initializeModelClients();

      // Set default model
      const defaultModel = this.availableModels.find(m => m.default) || this.availableModels[0];
      this.currentModel = await this.getModel(defaultModel.id);

      this.isInitialized = true;
      logger.info('Model Manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Model Manager:', error);
      throw error;
    }
  }

  async initializeModelClients() {
    for (const modelConfig of this.availableModels) {
      try {
        let client;

        switch (modelConfig.id) {
          case 'qwen-3-1.7b':
            client = new QwenClient(modelConfig);
            break;
          case 'gpt-4':
            client = new OpenAIClient(modelConfig);
            break;
          case 'claude-3-sonnet':
            client = new ClaudeClient(modelConfig);
            break;
          case 'deepseek-coder':
            client = new DeepSeekClient(modelConfig);
            break;
          default:
            logger.warn(`Unknown model type: ${modelConfig.id}`);
            continue;
        }

        // Initialize the client
        await client.initialize();
        this.modelClients.set(modelConfig.id, client);

        logger.info(`Initialized model client: ${modelConfig.id}`);
      } catch (error) {
        logger.error(`Failed to initialize model ${modelConfig.id}:`, error);
        // Continue with other models
      }
    }
  }

  async getModel(modelId) {
    if (!this.modelClients.has(modelId)) {
      throw new Error(`Model ${modelId} not available`);
    }

    const client = this.modelClients.get(modelId);
    const config = this.availableModels.find(m => m.id === modelId);

    return {
      id: modelId,
      name: config.name,
      type: config.type,
      client,
      config,
      generateResponse: async (prompt, systemPrompt = '') => {
        return await client.generateResponse(prompt, systemPrompt);
      },
      healthCheck: async () => {
        return await client.healthCheck();
      }
    };
  }

  async getDefaultModel() {
    const defaultModelConfig = this.availableModels.find(m => m.default);
    if (!defaultModelConfig) {
      throw new Error('No default model configured');
    }

    return await this.getModel(defaultModelConfig.id);
  }

  getAvailableModels() {
    return this.availableModels.map(model => ({
      id: model.id,
      name: model.name,
      type: model.type,
      description: model.description,
      capabilities: model.capabilities,
      mcp_support: model.mcp_support,
      requires_api_key: model.requires_api_key || false,
      available: this.modelClients.has(model.id)
    }));
  }

  async switchModel(modelId) {
    const model = await this.getModel(modelId);
    this.currentModel = model;
    logger.info(`Switched to model: ${modelId}`);
    return model;
  }

  getCurrentModel() {
    return this.currentModel;
  }

  async validateApiKey(modelId, apiKey) {
    try {
      const model = await this.getModel(modelId);
      if (model.type === 'local') {
        return true; // Local models don't need API keys
      }

      // Validate API key with the model
      return await model.client.validateApiKey(apiKey);
    } catch (error) {
      logger.error(`Failed to validate API key for ${modelId}:`, error);
      return false;
    }
  }

  async setApiKey(modelId, apiKey) {
    try {
      const client = this.modelClients.get(modelId);
      if (!client) {
        throw new Error(`Model ${modelId} not found`);
      }

      await client.setApiKey(apiKey);
      logger.info(`API key set for model: ${modelId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to set API key for ${modelId}:`, error);
      throw error;
    }
  }

  async healthCheck() {
    const modelStatuses = {};

    for (const [modelId, client] of this.modelClients) {
      try {
        modelStatuses[modelId] = await client.healthCheck();
      } catch (error) {
        modelStatuses[modelId] = false;
      }
    }

    return {
      initialized: this.isInitialized,
      current_model: this.currentModel ? this.currentModel.id : null,
      available_models: Object.keys(modelStatuses).length,
      model_statuses: modelStatuses
    };
  }
}

module.exports = new ModelManager();