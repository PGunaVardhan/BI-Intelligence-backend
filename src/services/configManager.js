// backend/src/services/configManager.js
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class ConfigManager {
  constructor() {
    this.configs = {
      models: null,
      tools: null,
      mcp: null
    };
    this.configPaths = {
      models: path.join(__dirname, '../config/models.json'),
      tools: path.join(__dirname, '../config/tools.json'),
      mcp: path.join(__dirname, '../config/mcp.json')
    };
  }

  async loadConfig(configName) {
    try {
      const configPath = this.configPaths[configName];
      if (!configPath) {
        throw new Error(`Unknown config: ${configName}`);
      }

      const configData = await fs.readFile(configPath, 'utf8');
      const parsedConfig = JSON.parse(configData);
      
      this.configs[configName] = parsedConfig;
      logger.info(`Loaded ${configName} configuration`);
      
      return parsedConfig;
    } catch (error) {
      logger.error(`Failed to load ${configName} config:`, error);
      throw error;
    }
  }

  async loadAllConfigs() {
    try {
      await Promise.all([
        this.loadConfig('models'),
        this.loadConfig('tools'),
        this.loadConfig('mcp')
      ]);
      
      logger.info('All configurations loaded successfully');
      return this.configs;
    } catch (error) {
      logger.error('Failed to load configurations:', error);
      throw error;
    }
  }

  getConfig(configName) {
    return this.configs[configName];
  }

  async saveConfig(configName, config) {
    try {
      const configPath = this.configPaths[configName];
      if (!configPath) {
        throw new Error(`Unknown config: ${configName}`);
      }

      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      this.configs[configName] = config;
      
      logger.info(`Saved ${configName} configuration`);
      return true;
    } catch (error) {
      logger.error(`Failed to save ${configName} config:`, error);
      throw error;
    }
  }

  async reloadConfig(configName) {
    return await this.loadConfig(configName);
  }

  async validateConfig(configName, config) {
    // Basic validation - can be extended
    if (!config || typeof config !== 'object') {
      throw new Error(`Invalid ${configName} config: must be an object`);
    }

    switch (configName) {
      case 'models':
        if (!config.available_models || !Array.isArray(config.available_models)) {
          throw new Error('Models config must have available_models array');
        }
        break;
      case 'tools':
        if (!config.available_tools || !Array.isArray(config.available_tools)) {
          throw new Error('Tools config must have available_tools array');
        }
        break;
      case 'mcp':
        if (!config.mcp_bridge) {
          throw new Error('MCP config must have mcp_bridge object');
        }
        break;
    }

    return true;
  }

  getConfigStatus() {
    return {
      models: this.configs.models !== null,
      tools: this.configs.tools !== null,
      mcp: this.configs.mcp !== null
    };
  }
}

module.exports = new ConfigManager();