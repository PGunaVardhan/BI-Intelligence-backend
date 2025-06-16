// backend/src/services/toolManager.js
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const MCPClient = require('./mcpClient');
const axios = require('axios');

class ToolManager {
  constructor() {
    this.config = null;
    this.availableTools = [];
    this.mcpClients = new Map();
    this.dockerEndpoint = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Load tools configuration
      const configPath = path.join(__dirname, '../config/tools.json');
      const configData = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(configData);

      this.availableTools = this.config.available_tools;
      this.dockerEndpoint = this.config.docker_container.api_endpoint;

      // Initialize MCP clients
      await this.initializeMCPClients();

      // Health check Docker container
      await this.checkDockerHealth();

      this.isInitialized = true;
      logger.info('Tool Manager initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Tool Manager:', error);
      return false;
    }
  }

  async initializeMCPClients() {
    try {
      if (this.config.mcp_servers) {
        for (const [serverName, serverConfig] of Object.entries(this.config.mcp_servers)) {
          try {
            const mcpClient = new MCPClient(serverConfig);
            const initialized = await mcpClient.initialize();
            
            if (initialized) {
              this.mcpClients.set(serverName, mcpClient);
              logger.info(`MCP client ${serverName} initialized successfully`);
            } else {
              logger.warn(`Failed to initialize MCP client ${serverName}`);
            }
          } catch (error) {
            logger.error(`Error initializing MCP client ${serverName}:`, error);
            // Continue with other clients
          }
        }
      }
    } catch (error) {
      logger.error('Error initializing MCP clients:', error);
    }
  }

  async checkDockerHealth() {
    try {
      if (this.dockerEndpoint) {
        const response = await axios.get(`${this.dockerEndpoint}${this.config.docker_container.health_check}`, {
          timeout: 5000
        });
        
        if (response.status === 200) {
          logger.info('Docker container is healthy');
          return true;
        }
      }
    } catch (error) {
      logger.warn('Docker container health check failed:', error.message);
    }
    return false;
  }

  async executeTool(toolId, parameters) {
    try {
      const toolConfig = this.getToolConfig(toolId);
      if (!toolConfig) {
        throw new Error(`Tool ${toolId} not found`);
      }

      logger.info(`Executing tool: ${toolId} (source: ${toolConfig.source})`);

      if (toolConfig.source === 'mcp') {
        return await this.executeMCPTool(toolConfig, parameters);
      } else if (toolConfig.source === 'docker') {
        return await this.executeDockerTool(toolConfig, parameters);
      } else {
        throw new Error(`Unknown tool source: ${toolConfig.source}`);
      }

    } catch (error) {
      logger.error(`Error executing tool ${toolId}:`, error);
      throw error;
    }
  }

  async executeMCPTool(toolConfig, parameters) {
    try {
      const serverName = toolConfig.server || 'document_analysis';
      const mcpClient = this.mcpClients.get(serverName);

      if (!mcpClient) {
        throw new Error(`MCP client ${serverName} not available`);
      }

      // Convert file objects to include full paths
      if (parameters.files && parameters.files.length > 0) {
        parameters.files = parameters.files.map(file => ({
          ...file,
          path: path.join(__dirname, '../../uploads', file.name)
        }));
      }

      const result = await mcpClient.executeTool(toolConfig.id, parameters);
      
      logger.info(`MCP tool ${toolConfig.id} executed successfully`);
      return result;

    } catch (error) {
      logger.error(`Error executing MCP tool ${toolConfig.id}:`, error);
      throw error;
    }
  }

  async executeDockerTool(toolConfig, parameters) {
    try {
      if (!this.dockerEndpoint) {
        throw new Error('Docker endpoint not configured');
      }

      const endpoint = `${this.dockerEndpoint}${toolConfig.endpoint}`;
      
      // Prepare form data for file uploads
      const FormData = require('form-data');
      const formData = new FormData();

      // Add files
      if (parameters.files && parameters.files.length > 0) {
        for (const file of parameters.files) {
          const filePath = path.join(__dirname, '../../uploads', file.name);
          try {
            const fileBuffer = await fs.readFile(filePath);
            formData.append('file', fileBuffer, {
              filename: file.name,
              contentType: file.type
            });
          } catch (fileError) {
            logger.error(`Error reading file ${file.name}:`, fileError);
            throw new Error(`File ${file.name} not found or not readable`);
          }
        }
      }

      // Add other parameters
      if (parameters.parameters) {
        Object.keys(parameters.parameters).forEach(key => {
          formData.append(key, parameters.parameters[key]);
        });
      }

      // Execute tool
      const response = await axios.post(endpoint, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: this.config.tool_selection.timeout_per_tool || 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      logger.info(`Docker tool ${toolConfig.id} executed successfully`);
      return response.data;

    } catch (error) {
      logger.error(`Error executing Docker tool ${toolConfig.id}:`, error);
      if (error.response) {
        logger.error(`Docker tool response:`, error.response.data);
      }
      throw error;
    }
  }

  getAvailableTools() {
    return this.availableTools.map(tool => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      capabilities: tool.capabilities,
      input_types: tool.input_types,
      source: tool.source,
      available: this.isToolAvailable(tool)
    }));
  }

  getToolConfig(toolId) {
    return this.availableTools.find(tool => tool.id === toolId);
  }

  getToolsForFileType(fileType) {
    return this.availableTools.filter(tool => 
      tool.input_types.includes(fileType)
    );
  }

  isToolAvailable(tool) {
    if (tool.source === 'mcp') {
      const serverName = tool.server || 'document_analysis';
      const mcpClient = this.mcpClients.get(serverName);
      return mcpClient && mcpClient.isConnected;
    } else if (tool.source === 'docker') {
      // Check if docker container is accessible
      return this.dockerEndpoint !== null;
    }
    return false;
  }

  async healthCheck() {
    try {
      const toolStatus = {
        total_tools: this.availableTools.length,
        available_tools: 0,
        mcp_status: {},
        docker_status: false
      };

      // Check MCP clients
      for (const [serverName, mcpClient] of this.mcpClients) {
        try {
          const health = await mcpClient.healthCheck();
          toolStatus.mcp_status[serverName] = health;
          if (health.healthy) {
            toolStatus.available_tools += this.availableTools.filter(
              t => t.source === 'mcp' && (t.server || 'document_analysis') === serverName
            ).length;
          }
        } catch (error) {
          toolStatus.mcp_status[serverName] = { healthy: false, error: error.message };
        }
      }

      // Check Docker status
      try {
        toolStatus.docker_status = await this.checkDockerHealth();
        if (toolStatus.docker_status) {
          toolStatus.available_tools += this.availableTools.filter(t => t.source === 'docker').length;
        }
      } catch (error) {
        toolStatus.docker_status = false;
      }

      return {
        status: toolStatus.available_tools > 0 ? 'healthy' : 'unhealthy',
        ...toolStatus
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  async shutdown() {
    try {
      // Shutdown MCP clients
      for (const [serverName, mcpClient] of this.mcpClients) {
        try {
          await mcpClient.shutdown();
          logger.info(`MCP client ${serverName} shut down`);
        } catch (error) {
          logger.error(`Error shutting down MCP client ${serverName}:`, error);
        }
      }

      this.mcpClients.clear();
      this.isInitialized = false;
      logger.info('Tool Manager shut down');
    } catch (error) {
      logger.error('Error shutting down Tool Manager:', error);
    }
  }
}

module.exports = new ToolManager();