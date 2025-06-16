// backend/src/services/mcpBridge.js
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const toolManager = require('./toolManager');
const modelManager = require('./modelManager');

class MCPBridge {
  constructor() {
    this.config = null;
    this.currentModel = null;
    this.isInitialized = false;
    this.activeConversations = new Map();
  }

  async initialize() {
    try {
      // Load MCP configuration
      const configPath = path.join(__dirname, '../config/mcp.json');
      const configData = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(configData);

      // Initialize tool manager first
      const toolManagerInitialized = await toolManager.initialize();
      if (!toolManagerInitialized) {
        logger.warn('Tool Manager initialization failed, but continuing...');
      }

      // Set default model (should be Claude now)
      this.currentModel = await modelManager.getDefaultModel();
      if (!this.currentModel) {
        throw new Error('No default model available');
      }

      // Test model health
      const modelHealthy = await this.currentModel.healthCheck();
      if (!modelHealthy) {
        logger.warn(`Default model ${this.currentModel.id} health check failed`);
      }

      this.isInitialized = true;
      logger.info(`MCP Bridge initialized successfully with model: ${this.currentModel.id}`);
    } catch (error) {
      logger.error('Failed to initialize MCP Bridge:', error);
      throw error;
    }
  }

  async switchModel(modelId) {
    try {
      const model = await modelManager.getModel(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }
      
      this.currentModel = model;
      logger.info(`Switched to model: ${modelId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to switch model to ${modelId}:`, error);
      throw error;
    }
  }

  async processUserRequest(conversationId, userMessage, uploadedFiles = []) {
    try {
      if (!this.isInitialized) {
        throw new Error('MCP Bridge not initialized');
      }

      if (!this.currentModel) {
        throw new Error('No model available');
      }

      logger.info(`Processing request for conversation ${conversationId}`);
      logger.info(`User message: ${userMessage}`);
      logger.info(`Uploaded files: ${uploadedFiles.map(f => f.name).join(', ')}`);

      // Get conversation context
      const context = this.activeConversations.get(conversationId) || [];

      // Step 1: Use Claude's enhanced orchestration if available
      let toolSelection;
      if (this.currentModel.id === 'claude-3-sonnet' && this.currentModel.client.orchestrateTools) {
        toolSelection = await this.selectToolsWithClaude(userMessage, uploadedFiles, context);
      } else {
        toolSelection = await this.selectTools(userMessage, uploadedFiles, context);
      }

      logger.info(`Tool selection result:`, toolSelection);

      // Step 2: Execute selected tools
      const toolResults = await this.executeTools(toolSelection, uploadedFiles, userMessage);

      logger.info(`Tool execution results:`, toolResults.map(r => ({ toolId: r.toolId, success: r.success })));

      // Step 3: Synthesize response using Claude if available
      let response;
      if (this.currentModel.id === 'claude-3-sonnet' && this.currentModel.client.synthesizeResponse) {
        response = await this.synthesizeResponseWithClaude(userMessage, toolResults, context);
      } else {
        response = await this.synthesizeResponse(userMessage, toolResults, context);
      }

      // Step 4: Update conversation context
      this.updateConversationContext(conversationId, {
        userMessage,
        toolsUsed: toolSelection.selected_tools,
        toolResults,
        response,
        timestamp: new Date().toISOString()
      });

      return {
        response,
        toolsUsed: toolSelection.selected_tools,
        confidence: this.calculateConfidence(toolResults),
        conversationId
      };

    } catch (error) {
      logger.error(`Error processing user request:`, error);
      
      // Return a more informative error response
      return {
        response: `I encountered an error while processing your request: ${error.message}. Please check that your files are valid and the system is properly configured.`,
        toolsUsed: [],
        confidence: 0,
        conversationId,
        error: error.message
      };
    }
  }

  async selectToolsWithClaude(userMessage, uploadedFiles, context) {
    try {
      const availableTools = await toolManager.getAvailableTools();
      
      // Filter to only available tools
      const activeTools = availableTools.filter(tool => tool.available);
      
      if (activeTools.length === 0) {
        logger.warn('No tools are currently available');
        return {
          selected_tools: [],
          reasoning: 'No tools are currently available',
          execution_order: [],
          tool_parameters: {},
          file_requirements: {}
        };
      }

      logger.info(`Using Claude orchestration with ${activeTools.length} available tools`);

      const toolSelection = await this.currentModel.client.orchestrateTools(
        userMessage,
        activeTools,
        uploadedFiles,
        context
      );

      // Validate that selected tools are actually available
      toolSelection.selected_tools = toolSelection.selected_tools.filter(toolId => 
        activeTools.some(t => t.id === toolId)
      );

      return toolSelection;

    } catch (error) {
      logger.error('Error in Claude tool orchestration:', error);
      return this.fallbackToolSelection(uploadedFiles);
    }
  }

  async selectTools(userMessage, uploadedFiles, context) {
    try {
      const availableTools = await toolManager.getAvailableTools();
      
      // Filter to only available tools
      const activeTools = availableTools.filter(tool => tool.available);
      
      if (activeTools.length === 0) {
        logger.warn('No tools are currently available');
        return this.fallbackToolSelection(uploadedFiles);
      }

      const filesList = uploadedFiles.map(f => `${f.name} (${f.type})`).join(', ');
      const toolsList = activeTools.map(t => `${t.name}: ${t.description}`).join('\n');

      const prompt = this.config.prompts.tool_selection.template
        .replace('{user_message}', userMessage)
        .replace('{files_list}', filesList || 'No files uploaded')
        .replace('{tools_list}', toolsList);

      const modelResponse = await this.currentModel.generateResponse(
        prompt,
        this.config.prompts.tool_selection.system
      );

      // Parse the model's tool selection
      let toolSelection;
      try {
        // Try to extract JSON from response
        const jsonMatch = modelResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          toolSelection = JSON.parse(jsonMatch[0]);
        } else {
          toolSelection = JSON.parse(modelResponse);
        }
      } catch (parseError) {
        logger.warn('Failed to parse tool selection JSON, using fallback');
        return this.fallbackToolSelection(uploadedFiles);
      }

      // Validate selected tools exist and are available
      toolSelection.selected_tools = toolSelection.selected_tools.filter(toolId => 
        activeTools.some(t => t.id === toolId)
      );

      logger.info(`Selected tools: ${toolSelection.selected_tools.join(', ')}`);
      return toolSelection;

    } catch (error) {
      logger.error('Error in tool selection:', error);
      return this.fallbackToolSelection(uploadedFiles);
    }
  }

  async executeTools(toolSelection, uploadedFiles, userMessage) {
    const toolResults = [];
    const executionOrder = toolSelection.execution_order || toolSelection.selected_tools;

    if (executionOrder.length === 0) {
      logger.warn('No tools selected for execution');
      return toolResults;
    }

    for (const toolId of executionOrder) {
      try {
        logger.info(`Executing tool: ${toolId}`);

        // Filter files relevant to this tool
        const relevantFiles = this.filterFilesForTool(toolId, uploadedFiles);
        
        if (relevantFiles.length === 0 && uploadedFiles.length > 0) {
          logger.warn(`No relevant files found for tool ${toolId}`);
        }

        // Get tool parameters
        const parameters = {
          files: relevantFiles,
          userRequest: userMessage,
          parameters: this.getToolParameters(toolId, userMessage, toolSelection)
        };

        logger.info(`Tool ${toolId} parameters:`, {
          fileCount: relevantFiles.length,
          fileNames: relevantFiles.map(f => f.name)
        });

        const result = await toolManager.executeTool(toolId, parameters);

        toolResults.push({
          toolId,
          success: true,
          result,
          executedAt: new Date().toISOString()
        });

        logger.info(`Tool ${toolId} executed successfully`);

      } catch (error) {
        logger.error(`Error executing tool ${toolId}:`, error);
        toolResults.push({
          toolId,
          success: false,
          error: error.message,
          executedAt: new Date().toISOString()
        });
      }
    }

    return toolResults;
  }

  async synthesizeResponseWithClaude(userMessage, toolResults, context) {
    try {
      logger.info('Using Claude response synthesis');
      return await this.currentModel.client.synthesizeResponse(
        userMessage,
        toolResults,
        context
      );
    } catch (error) {
      logger.error('Error in Claude response synthesis:', error);
      return this.synthesizeResponse(userMessage, toolResults, context);
    }
  }

  async synthesizeResponse(userMessage, toolResults, context) {
    try {
      const successfulResults = toolResults.filter(r => r.success);
      const failedResults = toolResults.filter(r => !r.success);

      if (successfulResults.length === 0) {
        if (failedResults.length > 0) {
          const errorMessages = failedResults.map(r => `${r.toolId}: ${r.error}`).join('; ');
          return `I encountered errors while processing your request: ${errorMessages}. Please check your files and try again.`;
        }
        return "I apologize, but I couldn't process your request. No tools were successfully executed.";
      }

      // Use the configured template for response synthesis
      const toolResultsText = JSON.stringify(successfulResults, null, 2);
      const contextText = JSON.stringify(context.slice(-3), null, 2);

      const prompt = this.config.prompts.response_synthesis.template
        .replace('{user_message}', userMessage)
        .replace('{tool_results}', toolResultsText)
        .replace('{conversation_context}', contextText);

      const response = await this.currentModel.generateResponse(
        prompt,
        this.config.prompts.response_synthesis.system
      );

      return response;

    } catch (error) {
      logger.error('Error synthesizing response:', error);
      return this.generateFallbackResponse(toolResults);
    }
  }

  fallbackToolSelection(uploadedFiles) {
    const tools = [];
    
    uploadedFiles.forEach(file => {
      if (file.type.includes('pdf')) {
        // Prefer MCP tools for PDF analysis
        tools.push('extract_all_from_pdf');
      } else if (file.type.includes('excel') || file.type.includes('spreadsheet')) {
        tools.push('excel_processor');
      } else if (file.type.includes('image')) {
        tools.push('image_analyzer');
      } else if (file.type.includes('text') || file.type.includes('word')) {
        tools.push('text_processor');
      } else if (file.type.includes('video')) {
        tools.push('video_processor');
      } else if (file.type.includes('audio')) {
        tools.push('audio_processor');
      }
    });

    return {
      selected_tools: [...new Set(tools)],
      reasoning: 'Automatic tool selection based on file types',
      file_requirements: uploadedFiles.map(f => f.name),
      execution_order: [...new Set(tools)],
      tool_parameters: {}
    };
  }

  filterFilesForTool(toolId, uploadedFiles) {
    const toolConfig = toolManager.getToolConfig(toolId);
    if (!toolConfig) {
      logger.warn(`Tool config not found for ${toolId}`);
      return uploadedFiles;
    }

    const filteredFiles = uploadedFiles.filter(file => 
      toolConfig.input_types.some(type => {
        // Handle both exact matches and partial matches
        return file.type === type || file.type.includes(type.split('/')[1]);
      })
    );

    logger.info(`Filtered ${filteredFiles.length}/${uploadedFiles.length} files for tool ${toolId}`);
    return filteredFiles;
  }

  getToolParameters(toolId, userMessage, toolSelection) {
    // Get default parameters from tool config
    const toolConfig = toolManager.getToolConfig(toolId);
    const params = {};

    if (toolConfig && toolConfig.parameters) {
      Object.keys(toolConfig.parameters).forEach(key => {
        params[key] = toolConfig.parameters[key].default;
      });
    }

    // Override with parameters from tool selection if available
    if (toolSelection.tool_parameters && toolSelection.tool_parameters[toolId]) {
      Object.assign(params, toolSelection.tool_parameters[toolId]);
    }

    // Extract confidence from user message if mentioned
    const confidenceMatch = userMessage.match(/confidence[:\s]*([0-9.]+)/i);
    if (confidenceMatch) {
      params.confidence = parseFloat(confidenceMatch[1]);
    }

    return params;
  }

  calculateConfidence(toolResults) {
    const successfulTools = toolResults.filter(r => r.success).length;
    const totalTools = toolResults.length;
    
    if (totalTools === 0) return 0.5;
    return successfulTools / totalTools;
  }

  generateFallbackResponse(toolResults) {
    const successfulResults = toolResults.filter(r => r.success);
    const failedResults = toolResults.filter(r => !r.success);
    
    if (successfulResults.length === 0) {
      if (failedResults.length > 0) {
        const errors = failedResults.map(r => `${r.toolId}: ${r.error}`).join('\n');
        return `I encountered the following errors while processing your request:\n\n${errors}\n\nPlease check your files and system configuration.`;
      }
      return "I apologize, but I couldn't process your request. Please ensure your files are valid and the system is properly configured.";
    }

    let response = "I've analyzed your files. Here's what I found:\n\n";
    successfulResults.forEach(result => {
      const preview = JSON.stringify(result.result).substring(0, 200);
      response += `**${result.toolId}**: ${preview}${preview.length === 200 ? '...' : ''}\n\n`;
    });

    if (failedResults.length > 0) {
      response += `\nNote: Some tools encountered errors: ${failedResults.map(r => r.toolId).join(', ')}`;
    }

    return response;
  }

  updateConversationContext(conversationId, interaction) {
    if (!this.activeConversations.has(conversationId)) {
      this.activeConversations.set(conversationId, []);
    }

    const context = this.activeConversations.get(conversationId);
    context.push(interaction);

    // Keep only last 20 interactions
    if (context.length > 20) {
      context.splice(0, context.length - 20);
    }
  }

  getConversationContext(conversationId) {
    return this.activeConversations.get(conversationId) || [];
  }

  async getAvailableModels() {
    return await modelManager.getAvailableModels();
  }

  getCurrentModel() {
    return this.currentModel ? this.currentModel.id : null;
  }

  async healthCheck() {
    try {
      const toolsHealth = await toolManager.healthCheck();
      const modelHealthy = this.currentModel ? await this.currentModel.healthCheck() : false;

      return {
        status: this.isInitialized && toolsHealth.status === 'healthy' && modelHealthy ? 'healthy' : 'unhealthy',
        mcp_bridge: this.isInitialized,
        tools: toolsHealth,
        current_model: this.currentModel ? this.currentModel.id : null,
        model_healthy: modelHealthy,
        available_tools: toolsHealth.available_tools || 0
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = new MCPBridge();