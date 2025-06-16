// backend/src/models/claude/claudeClient.js
const axios = require('axios');
const logger = require('../../utils/logger');

class ClaudeClient {
  constructor(config) {
    this.config = config;
    this.apiKey = process.env.ANTHROPIC_API_KEY || null;
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
        logger.warn('Anthropic API key not provided. API key will need to be set before use.');
        return false;
      }

      // Test API key validity
      const isValid = await this.healthCheck();
      if (!isValid) {
        logger.error('Claude API key validation failed');
        return false;
      }

      this.isInitialized = true;
      logger.info('Claude client initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Claude client:', error);
      throw error;
    }
  }

  async generateResponse(prompt, systemPrompt = '') {
    try {
      if (!this.apiKey) {
        throw new Error('Anthropic API key not set');
      }

      const requestData = {
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      };

      // Add system prompt if provided
      if (systemPrompt) {
        requestData.system = systemPrompt;
      }

      const response = await axios.post(this.apiEndpoint, requestData, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        timeout: 120000 // Increased timeout for complex orchestration
      });

      if (response.data && response.data.content && response.data.content.length > 0) {
        return response.data.content[0].text.trim();
      } else {
        throw new Error('Invalid response format from Claude API');
      }

    } catch (error) {
      logger.error('Error generating Claude response:', error);
      
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 401) {
          throw new Error('Invalid Anthropic API key');
        } else if (status === 429) {
          throw new Error('Claude API rate limit exceeded');
        } else if (status === 400) {
          throw new Error(`Claude API error: ${data.error?.message || 'Bad request'}`);
        } else {
          throw new Error(`Claude API error: ${status} - ${data.error?.message || 'Unknown error'}`);
        }
      }
      
      throw error;
    }
  }

  // Enhanced method for tool orchestration with structured responses
  async generateStructuredResponse(prompt, systemPrompt = '', responseFormat = 'json') {
    try {
      const enhancedSystemPrompt = `${systemPrompt}

IMPORTANT: You must respond in valid JSON format. Always provide your response in the exact JSON structure requested. Never include explanatory text outside the JSON structure.`;

      const structuredPrompt = `${prompt}

Please respond in valid JSON format only. Do not include any text outside the JSON structure.`;

      const response = await this.generateResponse(structuredPrompt, enhancedSystemPrompt);
      
      // Try to parse as JSON if requested
      if (responseFormat === 'json') {
        try {
          return JSON.parse(response);
        } catch (parseError) {
          logger.warn('Failed to parse Claude response as JSON, returning raw text');
          // Extract JSON from the response if it's wrapped in text
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              return JSON.parse(jsonMatch[0]);
            } catch (extractError) {
              logger.error('Failed to extract JSON from response');
              throw new Error('Claude response is not valid JSON');
            }
          }
          throw new Error('No valid JSON found in Claude response');
        }
      }
      
      return response;
    } catch (error) {
      logger.error('Error generating structured Claude response:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      if (!this.apiKey) {
        return false;
      }

      // Test with a simple prompt
      const testResponse = await this.generateResponse(
        'Please respond with exactly "OK" to confirm the connection.', 
        'You are a test assistant. Respond briefly and exactly as requested.'
      );
      
      return testResponse.toLowerCase().includes('ok');
    } catch (error) {
      logger.error('Claude health check failed:', error);
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
      logger.error('Claude API key validation failed:', error);
      return false;
    }
  }

  async setApiKey(apiKey) {
    if (!apiKey) {
      throw new Error('API key is required');
    }
    
    // Validate the new API key
    const isValid = await this.validateApiKey(apiKey);
    if (!isValid) {
      throw new Error('Invalid API key provided');
    }
    
    this.apiKey = apiKey;
    this.isInitialized = true;
    logger.info('Claude API key updated and validated');
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
      provider: 'Anthropic',
      supportsToolCalling: true,
      supportsStructuredOutput: true
    };
  }

  // Claude-specific method for better tool orchestration
  async orchestrateTools(userRequest, availableTools, uploadedFiles, conversationContext = []) {
    try {
      const systemPrompt = `You are an expert tool orchestrator. Analyze the user request and available tools to determine:
1. Which tools are needed to fulfill the request
2. The optimal execution order
3. Required parameters for each tool
4. Which files are needed for each tool

Available tools: ${JSON.stringify(availableTools, null, 2)}
Uploaded files: ${JSON.stringify(uploadedFiles.map(f => ({name: f.name, type: f.type, size: f.size})), null, 2)}

Always respond in valid JSON format with this exact structure:
{
  "selected_tools": ["tool_id_1", "tool_id_2"],
  "reasoning": "explanation of tool selection",
  "execution_order": ["tool_id_1", "tool_id_2"],
  "tool_parameters": {
    "tool_id_1": {"param1": "value1"},
    "tool_id_2": {"param2": "value2"}
  },
  "file_requirements": {
    "tool_id_1": ["file1.pdf"],
    "tool_id_2": ["file2.xlsx"]
  },
  "expected_workflow": "brief description of the workflow"
}`;

      const prompt = `User request: "${userRequest}"

Context from conversation: ${JSON.stringify(conversationContext.slice(-3), null, 2)}

Please analyze this request and provide the optimal tool orchestration strategy.`;

      return await this.generateStructuredResponse(prompt, systemPrompt, 'json');
    } catch (error) {
      logger.error('Error in Claude tool orchestration:', error);
      throw error;
    }
  }

  // Method to synthesize final response from tool results
  async synthesizeResponse(userRequest, toolResults, conversationContext = []) {
    try {
      const systemPrompt = `You are an expert data analyst and report synthesizer. Your job is to:
1. Analyze the results from various tools
2. Create a comprehensive, well-structured response
3. Highlight key findings and insights
4. Organize information in a clear, readable format
5. Reference specific data points and findings

Be thorough but concise. Use formatting like bullet points, headers, and emphasis where appropriate.`;

      const prompt = `User request: "${userRequest}"

Tool execution results:
${JSON.stringify(toolResults, null, 2)}

Previous conversation context:
${JSON.stringify(conversationContext.slice(-3), null, 2)}

Please synthesize these results into a comprehensive response that directly addresses the user's request.`;

      return await this.generateResponse(prompt, systemPrompt);
    } catch (error) {
      logger.error('Error in Claude response synthesis:', error);
      throw error;
    }
  }
}

module.exports = ClaudeClient;