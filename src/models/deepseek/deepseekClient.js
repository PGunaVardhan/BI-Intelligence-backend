// backend/src/models/deepseek/deepseekClient.js
const axios = require('axios');
const logger = require('../../utils/logger');

class DeepSeekClient {
  constructor(config) {
    this.config = config;
    this.apiKey = process.env.DEEPSEEK_API_KEY || null;
    this.apiEndpoint = config.config.api_endpoint;
    this.model = config.config.model;
    this.maxTokens = config.config.max_tokens || 4096;
    this.temperature = config.config.temperature || 0.7;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Check if API key is available
      if (!this.apiKey) {
        logger.warn('DeepSeek API key not provided. API key will need to be set before use.');
      }

      this.isInitialized = true;
      logger.info('DeepSeek client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize DeepSeek client:', error);
      throw error;
    }
  }

  async generateResponse(prompt, systemPrompt = '') {
    try {
      if (!this.apiKey) {
        throw new Error('DeepSeek API key not set');
      }

      const messages = [];
      
      if (systemPrompt) {
        messages.push({
          role: 'system',
          content: systemPrompt
        });
      }
      
      messages.push({
        role: 'user',
        content: prompt
      });

      const requestData = {
        model: this.model,
        messages: messages,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        top_p: 0.95,
        frequency_penalty: 0,
        presence_penalty: 0,
        stream: false
      };

      const response = await axios.post(this.apiEndpoint, requestData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        return response.data.choices[0].message.content.trim();
      } else {
        throw new Error('Invalid response format from DeepSeek API');
      }

    } catch (error) {
      logger.error('Error generating DeepSeek response:', error);
      
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 401) {
          throw new Error('Invalid DeepSeek API key');
        } else if (status === 429) {
          throw new Error('DeepSeek API rate limit exceeded');
        } else if (status === 400) {
          throw new Error(`DeepSeek API error: ${data.error?.message || 'Bad request'}`);
        } else {
          throw new Error(`DeepSeek API error: ${status} - ${data.error?.message || 'Unknown error'}`);
        }
      }
      
      throw error;
    }
  }

  async healthCheck() {
    try {
      if (!this.apiKey) {
        return false;
      }

      // Test with a simple completion
      const testResponse = await this.generateResponse('Say "OK"', 'Respond with exactly "OK"');
      return testResponse.toLowerCase().includes('ok');
    } catch (error) {
      logger.error('DeepSeek health check failed:', error);
      return false;
    }
  }

  async validateApiKey(apiKey) {
    try {
      const tempApiKey = this.apiKey;
      this.apiKey = apiKey;
      
      const isValid = await this.healthCheck();
      
      if (!isValid) {
        this.apiKey = tempApiKey; // Restore original key
      }
      
      return isValid;
    } catch (error) {
      logger.error('DeepSeek API key validation failed:', error);
      return false;
    }
  }

  async setApiKey(apiKey) {
    if (!apiKey) {
      throw new Error('API key is required');
    }
    
    this.apiKey = apiKey;
    logger.info('DeepSeek API key updated');
  }

  getUsage() {
    // In production, implement usage tracking
    return {
      requests: 0,
      tokens: 0,
      cost: 0
    };
  }

  getModelInfo() {
    return {
      id: this.config.id,
      name: this.config.name,
      model: this.model,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      provider: 'DeepSeek'
    };
  }

  // DeepSeek-specific methods for code generation
  async generateCode(prompt, language = 'python', systemPrompt = '') {
    const codeSystemPrompt = systemPrompt || 
      `You are an expert programmer. Generate clean, efficient, and well-documented ${language} code. 
       Provide only the code without explanations unless specifically asked.`;
    
    return await this.generateResponse(prompt, codeSystemPrompt);
  }

  async explainCode(code, language = 'auto') {
    const prompt = `Please explain this ${language} code:\n\n${code}`;
    const systemPrompt = 'You are a code explanation expert. Provide clear, detailed explanations of code functionality.';
    
    return await this.generateResponse(prompt, systemPrompt);
  }

  async optimizeCode(code, language = 'auto') {
    const prompt = `Please optimize this ${language} code for better performance and readability:\n\n${code}`;
    const systemPrompt = 'You are a code optimization expert. Suggest improvements for performance, readability, and best practices.';
    
    return await this.generateResponse(prompt, systemPrompt);
  }
}

module.exports = DeepSeekClient;