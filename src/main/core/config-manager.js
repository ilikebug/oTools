const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const BaseManager = require('./base-manager');
const logger = require('../utils/logger');

/**
 * Configuration Manager
 * Responsible for loading, validating, and hot-reloading application configurations
 */
class ConfigManager extends BaseManager {
  constructor() {
    super('ConfigManager');
    this.configs = new Map();
    this.watchers = new Map();
    this.validators = new Map();
    this.configDir = null;
  }

  /**
   * Initialize the configuration manager
   */
  async onInitialize(options) {
    this.configDir = options.configDir || path.join(__dirname, '../../config');
    
    // Ensure the configuration directory exists
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // Load all configurations
    await this.loadAllConfigurations();
    
    // Set up configuration watchers
    this.setupConfigWatchers();
    
    logger.info('Configuration manager initialized');
  }

  /**
   * Destroy the configuration manager
   */
  async onDestroy() {
    // Close all file watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    
    logger.info('Configuration manager destroyed');
  }

  /**
   * Load all configuration files
   */
  async loadAllConfigurations() {
    try {
      // Load main configuration
      await this.loadMainConfig();
      
      // Load plugin configurations
      await this.loadPluginConfigs();
      
      // Validate all configurations
      this.validateAllConfigurations();
      
      logger.info(`Loaded ${this.configs.size} configuration files`);
    } catch (error) {
      logger.error(`Failed to load configuration: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load main configuration file
   */
  async loadMainConfig() {
    const mainConfigPath = path.join(this.configDir, 'main.json');
    const defaultConfig = this.getDefaultMainConfig();
    
    let config;
    if (fs.existsSync(mainConfigPath)) {
      config = JSON.parse(fs.readFileSync(mainConfigPath, 'utf-8'));
      // Merge with default configuration
      config = this.mergeConfigs(defaultConfig, config);
    } else {
      config = defaultConfig;
      // Save default configuration
      this.saveConfig('main', config);
    }
    
    this.configs.set('main', config);
    logger.info('Main configuration loaded');
  }

  /**
   * Get default main configuration
   */
  getDefaultMainConfig() {
    return {
      app: {
        name: 'oTools',
        version: '1.0.0',
        debug: false
      },
      window: {
        width: 480,
        height: 420,
        alwaysOnTop: true,
        skipTaskbar: true
      },
      plugins: {
        autoLoad: true,
        maxProcesses: 5,
        timeout: 30000
      },
      logging: {
        level: 'info',
        enableFile: true,
        logFile: 'logs/otools.log'
      },
      shortcuts: {
        toggle: 'Alt+Space'
      }
    };
  }

  /**
   * Load plugin configurations
   */
  async loadPluginConfigs() {
    const pluginsConfigDir = path.join(this.configDir, 'plugins');
    
    if (!fs.existsSync(pluginsConfigDir)) {
      fs.mkdirSync(pluginsConfigDir, { recursive: true });
      return;
    }
    
    const files = fs.readdirSync(pluginsConfigDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const pluginName = path.basename(file, '.json');
        const configPath = path.join(pluginsConfigDir, file);
        
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          this.configs.set(`plugin:${pluginName}`, config);
          logger.info(`Plugin configuration loaded: ${pluginName}`);
        } catch (error) {
          logger.error(`Failed to load plugin configuration ${pluginName}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Set up configuration file watchers
   */
  setupConfigWatchers() {
    // Watch a single configuration file
    const mainConfigPath = path.join(this.configDir, 'main.json');
    this.watchConfigFile('main', mainConfigPath);
  }

  /**
   * Watch a single configuration file
   */
  watchConfigFile(configName, filePath) {
    if (!fs.existsSync(filePath)) {
      return;
    }
    
    const watcher = chokidar.watch(filePath);
    
    watcher.on('change', () => {
      this.reloadConfig(configName);
    });
    
    this.watchers.set(configName, watcher);
  }

  /**
   * Reload configuration
   */
  async reloadConfig(configName) {
    try {
      if (configName === 'main') {
        await this.loadMainConfig();
      } else if (configName.startsWith('plugin:')) {
        const pluginName = configName.replace('plugin:', '');
        await this.reloadPluginConfig(pluginName);
      }
      
      logger.info(`Configuration reloaded: ${configName}`);
      
      // Notify configuration change
      this.notifyConfigChange(configName);
    } catch (error) {
      logger.error(`Failed to reload configuration ${configName}: ${error.message}`);
    }
  }

  /**
   * Reload plugin configuration
   */
  async reloadPluginConfig(pluginName) {
    const configPath = path.join(this.configDir, 'plugins', `${pluginName}.json`);
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      this.configs.set(`plugin:${pluginName}`, config);
    }
  }

  /**
   * Get configuration
   */
  getConfig(configName, defaultValue = null) {
    return this.configs.get(configName) || defaultValue;
  }

  /**
   * Set configuration
   */
  setConfig(configName, config) {
    this.configs.set(configName, config);
    this.saveConfig(configName, config);
  }

  /**
   * Save configuration to file
   */
  saveConfig(configName, config) {
    try {
      let filePath;
      if (configName === 'main') {
        filePath = path.join(this.configDir, 'main.json');
      } else if (configName.startsWith('plugin:')) {
        const pluginName = configName.replace('plugin:', '');
        const pluginsDir = path.join(this.configDir, 'plugins');
        if (!fs.existsSync(pluginsDir)) {
          fs.mkdirSync(pluginsDir, { recursive: true });
        }
        filePath = path.join(pluginsDir, `${pluginName}.json`);
      }
      
      if (filePath) {
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
        logger.info(`Configuration saved: ${configName}`);
      }
    } catch (error) {
      logger.error(`Failed to save configuration ${configName}: ${error.message}`);
    }
  }

  /**
   * Merge configurations
   */
  mergeConfigs(defaultConfig, userConfig) {
    const merged = { ...defaultConfig };
    
    for (const [key, value] of Object.entries(userConfig)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        merged[key] = this.mergeConfigs(merged[key] || {}, value);
      } else {
        merged[key] = value;
      }
    }
    
    return merged;
  }

  /**
   * Validate configuration
   */
  validateConfiguration(config, schema) {
    // Simple configuration validation
    if (!config || typeof config !== 'object') {
      throw new Error('Configuration must be an object');
    }
    
    // More complex validation logic can be added here
    return true;
  }

  /**
   * Validate all configurations
   */
  validateAllConfigurations() {
    for (const [name, config] of this.configs) {
      try {
        this.validateConfiguration(config);
      } catch (error) {
        logger.error(`Configuration validation failed ${name}: ${error.message}`);
      }
    }
  }

  /**
   * Notify configuration change
   */
  notifyConfigChange(configName) {
    // Other components can be notified via event system here
    // Temporarily use simple log
    logger.info(`Configuration change notification: ${configName}`);
  }

  /**
   * Get all configuration names
   */
  getConfigNames() {
    return Array.from(this.configs.keys());
  }

  /**
   * Get configuration statistics
   */
  getStats() {
    return {
      totalConfigs: this.configs.size,
      configNames: this.getConfigNames(),
      watchersCount: this.watchers.size
    };
  }
}

module.exports = ConfigManager; 