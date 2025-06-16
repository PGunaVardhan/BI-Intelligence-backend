// backend/src/services/mcpClient.js
const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');
const logger = require('../utils/logger');

class MCPClient {
  constructor(serverConfig) {
    this.serverConfig = serverConfig;
    this.serverProcess = null;
    this.isInitialized = false;
    this.isConnected = false;
    this.apiEndpoint = serverConfig.api_endpoint;
    this.timeout = serverConfig.timeout || 300000; // 5 minutes default
  }

  async initialize() {
    try {
      logger.info(`Initializing MCP client for ${this.serverConfig.name}`);

      // First check if the API endpoint is already running
      const isRunning = await this.checkServerHealth();
      
      if (isRunning) {
        logger.info(`MCP server ${this.serverConfig.name} is already running`);
        
        // Try to discover available endpoints
        await this.discoverEndpoints();
        
        this.isConnected = true;
        this.isInitialized = true;
        return true;
      }

      // Try to start the MCP server process
      await this.startServerProcess();
      
      // Wait for server to be ready
      await this.waitForServerReady();
      
      // Discover available endpoints
      await this.discoverEndpoints();
      
      this.isInitialized = true;
      logger.info(`MCP client ${this.serverConfig.name} initialized successfully`);
      return true;

    } catch (error) {
      logger.error(`Failed to initialize MCP client ${this.serverConfig.name}:`, error);
      this.isInitialized = false;
      return false;
    }
  }

  async discoverEndpoints() {
    try {
      // Try to get available endpoints from the FastAPI server
      const possibleDiscoveryEndpoints = [
        '/docs',           // FastAPI docs
        '/openapi.json',   // OpenAPI spec
        '/endpoints',      // Custom endpoint
        '/',              // Root endpoint
        '/health'         // Health endpoint
      ];

      for (const endpoint of possibleDiscoveryEndpoints) {
        try {
          const response = await axios.get(`${this.apiEndpoint}${endpoint}`, { timeout: 5000 });
          if (response.status === 200) {
            logger.info(`Found working endpoint: ${this.apiEndpoint}${endpoint}`);
            if (endpoint === '/openapi.json') {
              // Parse OpenAPI spec to find available endpoints
              const spec = response.data;
              if (spec.paths) {
                const availablePaths = Object.keys(spec.paths);
                logger.info(`Available API paths: ${availablePaths.join(', ')}`);
              }
            }
            break;
          }
        } catch (endpointError) {
          // Continue trying other endpoints
        }
      }
    } catch (error) {
      logger.warn('Could not discover MCP server endpoints:', error.message);
    }
  }

  async startServerProcess() {
    return new Promise((resolve, reject) => {
      try {
        const { command, args } = this.serverConfig;
        
        logger.info(`Starting MCP server: ${command} ${args.join(' ')}`);
        
        this.serverProcess = spawn(command, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: path.dirname(args[0]) // Set working directory to script directory
        });

        this.serverProcess.stdout.on('data', (data) => {
          const output = data.toString();
          logger.info(`MCP Server Output: ${output.trim()}`);
        });

        this.serverProcess.stderr.on('data', (data) => {
          const error = data.toString();
          logger.warn(`MCP Server Error: ${error.trim()}`);
        });

        this.serverProcess.on('error', (error) => {
          logger.error(`MCP Server Process Error:`, error);
          reject(error);
        });

        this.serverProcess.on('exit', (code) => {
          logger.warn(`MCP Server Process exited with code: ${code}`);
          this.isConnected = false;
        });

        // Give the server some time to start
        setTimeout(() => {
          resolve();
        }, 5000);

      } catch (error) {
        reject(error);
      }
    });
  }

  async waitForServerReady(maxAttempts = 30, interval = 2000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const isReady = await this.checkServerHealth();
        if (isReady) {
          this.isConnected = true;
          logger.info(`MCP server ${this.serverConfig.name} is ready after ${attempt} attempts`);
          return true;
        }
      } catch (error) {
        // Continue trying
      }

      logger.info(`Waiting for MCP server to be ready... (attempt ${attempt}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`MCP server ${this.serverConfig.name} failed to become ready after ${maxAttempts} attempts`);
  }

  async checkServerHealth() {
    try {
      const healthEndpoint = `${this.apiEndpoint}${this.serverConfig.health_check}`;
      const response = await axios.get(healthEndpoint, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async executeTool(toolId, parameters) {
    try {
      if (!this.isConnected) {
        throw new Error(`MCP server ${this.serverConfig.name} is not connected`);
      }

      logger.info(`Executing MCP tool: ${toolId}`);

      // Convert parameters for MCP tools
      const mcpParams = this.convertParametersForMCP(toolId, parameters);

      // Try different endpoint patterns based on your MCP server structure
      const possibleEndpoints = [
        // Direct tool endpoints
        `${this.apiEndpoint}/${toolId}`,
        `${this.apiEndpoint}/tools/${toolId}`,
        
        // MCP protocol endpoints
        `${this.apiEndpoint}/mcp/call-tool`,
        `${this.apiEndpoint}/call-tool`,
        
        // FastAPI auto-generated endpoints
        `${this.apiEndpoint}/${toolId.replace(/_/g, '-')}`,
        
        // Based on your Python script structure
        `${this.apiEndpoint}/extract-figures`,
        `${this.apiEndpoint}/extract-tables`,
        `${this.apiEndpoint}/extract-text`,
        `${this.apiEndpoint}/extract-formulas`,
        `${this.apiEndpoint}/get-document-stats`,
        `${this.apiEndpoint}/analyze-layout`,
        `${this.apiEndpoint}/extract-all`
      ];

      // Map tool IDs to likely endpoints based on your Python script
      const toolEndpointMap = {
        'extract_figures_from_pdf': '/extract-figures',
        'extract_tables_from_pdf': '/extract-tables', 
        'extract_text_from_pdf': '/extract-text',
        'extract_formulas_from_pdf': '/extract-formulas',
        'get_pdf_document_stats': '/get-document-stats',
        'analyze_pdf_layout': '/analyze-layout',
        'extract_all_from_pdf': '/extract-all'
      };

      const specificEndpoint = toolEndpointMap[toolId];
      let response;

      if (specificEndpoint) {
        // Try the specific endpoint first
        try {
          const endpoint = `${this.apiEndpoint}${specificEndpoint}`;
          logger.info(`Trying specific endpoint: ${endpoint}`);
          
          // For document analysis tools, send as multipart/form-data
          const formData = new FormData();
          
          if (mcpParams.pdf_path) {
            // Read the PDF file and add it to form data
            const fs = require('fs');
            const fileBuffer = fs.readFileSync(mcpParams.pdf_path);
            formData.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), 'document.pdf');
          }
          
          if (mcpParams.confidence) {
            formData.append('confidence', mcpParams.confidence.toString());
          }

          response = await axios.post(endpoint, formData, {
            timeout: this.timeout,
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          });

        } catch (specificError) {
          logger.warn(`Specific endpoint failed: ${specificError.message}`);
          
          // Fallback to MCP protocol call
          try {
            const mcpEndpoint = `${this.apiEndpoint}/mcp/call-tool`;
            logger.info(`Trying MCP protocol endpoint: ${mcpEndpoint}`);
            
            response = await axios.post(mcpEndpoint, {
              tool_name: toolId,
              arguments: mcpParams
            }, {
              timeout: this.timeout,
              headers: {
                'Content-Type': 'application/json'
              }
            });
          } catch (mcpError) {
            logger.error(`MCP protocol also failed: ${mcpError.message}`);
            throw specificError; // Throw the original error
          }
        }
      } else {
        // Generic MCP call for unknown tools
        const mcpEndpoint = `${this.apiEndpoint}/mcp/call-tool`;
        response = await axios.post(mcpEndpoint, {
          tool_name: toolId,
          arguments: mcpParams
        }, {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }

      if (response.status !== 200) {
        throw new Error(`MCP tool execution failed with status: ${response.status}`);
      }

      logger.info(`MCP tool ${toolId} executed successfully`);
      return response.data;

    } catch (error) {
      logger.error(`Error executing MCP tool ${toolId}:`, error);
      
      if (error.response) {
        logger.error(`Response status: ${error.response.status}`);
        logger.error(`Response data:`, error.response.data);
      }
      
      if (error.code === 'ECONNREFUSED') {
        this.isConnected = false;
        throw new Error(`MCP server ${this.serverConfig.name} is not accessible`);
      } else if (error.code === 'ETIMEDOUT') {
        throw new Error(`MCP tool ${toolId} execution timed out`);
      } else {
        throw error;
      }
    }
  }

  convertParametersForMCP(toolId, parameters) {
    // Convert our internal parameters to what the MCP tools expect
    const mcpParams = {};

    // All document analysis tools expect pdf_path
    if (parameters.files && parameters.files.length > 0) {
      // Use the first PDF file
      const pdfFile = parameters.files.find(f => f.type === 'application/pdf');
      if (pdfFile) {
        mcpParams.pdf_path = pdfFile.path;
      }
    }

    // Add confidence parameter if specified
    if (parameters.parameters && parameters.parameters.confidence !== undefined) {
      mcpParams.confidence = parameters.parameters.confidence;
    } else {
      mcpParams.confidence = 0.2; // Default confidence
    }

    logger.info(`Converted parameters for ${toolId}:`, mcpParams);
    return mcpParams;
  }

  async listAvailableTools() {
    try {
      if (!this.isConnected) {
        return [];
      }

      // For now, return the tools we know are available
      // In a full MCP implementation, we would query the server for available tools
      return [
        'extract_figures_from_pdf',
        'extract_tables_from_pdf', 
        'extract_text_from_pdf',
        'extract_formulas_from_pdf',
        'get_pdf_document_stats',
        'analyze_pdf_layout',
        'extract_all_from_pdf'
      ];

    } catch (error) {
      logger.error(`Error listing MCP tools:`, error);
      return [];
    }
  }

  async healthCheck() {
    try {
      const isHealthy = await this.checkServerHealth();
      return {
        server: this.serverConfig.name,
        endpoint: this.apiEndpoint,
        connected: this.isConnected,
        healthy: isHealthy,
        process_running: this.serverProcess && !this.serverProcess.killed
      };
    } catch (error) {
      return {
        server: this.serverConfig.name,
        endpoint: this.apiEndpoint,
        connected: false,
        healthy: false,
        error: error.message
      };
    }
  }

  async shutdown() {
    try {
      if (this.serverProcess && !this.serverProcess.killed) {
        logger.info(`Shutting down MCP server ${this.serverConfig.name}`);
        this.serverProcess.kill();
        this.serverProcess = null;
      }
      this.isConnected = false;
      this.isInitialized = false;
    } catch (error) {
      logger.error(`Error shutting down MCP client:`, error);
    }
  }
}

module.exports = MCPClient;