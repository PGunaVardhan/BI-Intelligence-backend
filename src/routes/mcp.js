// backend/src/routes/mcp.js
const express = require('express');
const router = express.Router();
const toolManager = require('../services/toolManager');
const logger = require('../utils/logger');
const axios = require('axios');

// Test MCP server connectivity
router.get('/test-connection', async (req, res) => {
  try {
    const mcpEndpoint = process.env.MCP_DOCUMENT_ANALYSIS_ENDPOINT || 'http://192.168.1.29:8000';
    
    const tests = [
      { name: 'Health Check', endpoint: '/health' },
      { name: 'Root Endpoint', endpoint: '/' },
      { name: 'Docs', endpoint: '/docs' },
      { name: 'OpenAPI Spec', endpoint: '/openapi.json' },
      { name: 'Extract Figures', endpoint: '/extract-figures' },
      { name: 'Extract Tables', endpoint: '/extract-tables' },
      { name: 'Extract Text', endpoint: '/extract-text' },
      { name: 'Extract All', endpoint: '/extract-all' }
    ];

    const results = [];

    for (const test of tests) {
      try {
        const response = await axios.get(`${mcpEndpoint}${test.endpoint}`, { 
          timeout: 5000,
          validateStatus: () => true // Accept any status code
        });
        
        results.push({
          name: test.name,
          endpoint: test.endpoint,
          status: response.status,
          success: response.status < 400,
          url: `${mcpEndpoint}${test.endpoint}`
        });
      } catch (error) {
        results.push({
          name: test.name,
          endpoint: test.endpoint,
          status: 'ERROR',
          success: false,
          error: error.message,
          url: `${mcpEndpoint}${test.endpoint}`
        });
      }
    }

    res.json({
      mcpEndpoint,
      timestamp: new Date().toISOString(),
      results,
      summary: {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    });

  } catch (error) {
    logger.error('MCP connection test failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test specific MCP tool
router.post('/test-tool/:toolId', async (req, res) => {
  try {
    const { toolId } = req.params;
    const { testFile } = req.body;

    logger.info(`Testing MCP tool: ${toolId}`);

    // Get tool configuration
    const tools = toolManager.getAvailableTools();
    const tool = tools.find(t => t.id === toolId && t.source === 'mcp');

    if (!tool) {
      return res.status(404).json({ error: `MCP tool ${toolId} not found` });
    }

    // Test with a sample file path or the provided test file
    const testParams = {
      files: testFile ? [{ path: testFile, type: 'application/pdf', name: 'test.pdf' }] : [],
      parameters: { confidence: 0.2 },
      userRequest: `Test ${toolId}`
    };

    const result = await toolManager.executeTool(toolId, testParams);

    res.json({
      toolId,
      success: true,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`MCP tool test failed:`, error);
    res.status(500).json({
      toolId: req.params.toolId,
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get MCP tool status
router.get('/tools/status', async (req, res) => {
  try {
    const tools = toolManager.getAvailableTools();
    const mcpTools = tools.filter(t => t.source === 'mcp');
    
    const healthStatus = await toolManager.healthCheck();

    res.json({
      mcpTools: mcpTools.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        server: t.server
      })),
      totalMcpTools: mcpTools.length,
      health: healthStatus.mcp_servers,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('MCP tools status error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;