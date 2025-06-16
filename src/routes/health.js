// backend/src/routes/health.js
const express = require('express');
const router = express.Router();
const mcpBridge = require('../services/mcpBridge');
const modelManager = require('../services/modelManager');
const toolManager = require('../services/toolManager');
const logger = require('../utils/logger');

// Main health check endpoint
router.get('/', async (req, res) => {
  try {
    const startTime = Date.now();

    // Check all services
    const [mcpHealth, modelHealth, toolHealth] = await Promise.allSettled([
      mcpBridge.healthCheck(),
      modelManager.healthCheck(),
      toolManager.healthCheck()
    ]);

    const responseTime = Date.now() - startTime;

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: `${responseTime}ms`,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        mcp_bridge: mcpHealth.status === 'fulfilled' ? mcpHealth.value : { status: 'unhealthy', error: mcpHealth.reason?.message },
        models: modelHealth.status === 'fulfilled' ? modelHealth.value : { status: 'unhealthy', error: modelHealth.reason?.message },
        tools: toolHealth.status === 'fulfilled' ? { status: toolHealth.value ? 'healthy' : 'unhealthy' } : { status: 'unhealthy', error: toolHealth.reason?.message }
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024)
      },
      cpu: process.cpuUsage()
    };

    // Determine overall health status
    const allServicesHealthy = Object.values(health.services).every(service => 
      service.status === 'healthy' || service.initialized === true
    );

    if (!allServicesHealthy) {
      health.status = 'degraded';
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);

  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Detailed health check
router.get('/detailed', async (req, res) => {
  try {
    const health = {
      timestamp: new Date().toISOString(),
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        arch: process.arch,
        node_version: process.version,
        pid: process.pid
      },
      services: {}
    };

    // Get detailed service health
    try {
      health.services.mcp_bridge = await mcpBridge.healthCheck();
    } catch (error) {
      health.services.mcp_bridge = { status: 'unhealthy', error: error.message };
    }

    try {
      health.services.models = await modelManager.healthCheck();
    } catch (error) {
      health.services.models = { status: 'unhealthy', error: error.message };
    }

    try {
      const toolsHealthy = await toolManager.healthCheck();
      health.services.tools = {
        status: toolsHealthy ? 'healthy' : 'unhealthy',
        docker_endpoint: toolManager.dockerEndpoint,
        available_tools: toolManager.getAvailableTools().length
      };
    } catch (error) {
      health.services.tools = { status: 'unhealthy', error: error.message };
    }

    res.json(health);

  } catch (error) {
    logger.error('Detailed health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Service-specific health checks
router.get('/mcp', async (req, res) => {
  try {
    const health = await mcpBridge.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

router.get('/models', async (req, res) => {
  try {
    const health = await modelManager.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

router.get('/tools', async (req, res) => {
  try {
    const healthy = await toolManager.healthCheck();
    const containerInfo = await toolManager.getContainerInfo();
    
    res.json({
      status: healthy ? 'healthy' : 'unhealthy',
      docker_endpoint: toolManager.dockerEndpoint,
      container_info: containerInfo,
      available_tools: toolManager.getAvailableTools().length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

// Readiness probe (Kubernetes-style)
router.get('/ready', async (req, res) => {
  try {
    const isReady = mcpBridge.isInitialized && 
                   modelManager.isInitialized && 
                   toolManager.isInitialized;

    if (isReady) {
      res.json({ status: 'ready', timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({ status: 'not ready', timestamp: new Date().toISOString() });
    }
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});

// Liveness probe (Kubernetes-style)
router.get('/live', (req, res) => {
  res.json({ 
    status: 'alive', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;