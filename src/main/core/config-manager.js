const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const {GetConfigPath} = require('../comm')

/**
 * Configuration Manager
 * Responsible for loading, validating, and hot-reloading application configurations
 */
class ConfigManager {
  constructor() {
    this.configs = new Map();
    this.watchers = new Map();
    this.validators = new Map();

    this.configDir = GetConfigPath();  
  }

  /**
   * Initialize the configuration manager
   */
  async initialize() {
    // Ensure the configuration directory exists
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    
    // Load all configurations
    await this.loadAllConfigurations();
    
    // Set up configuration watchers
    this.setupConfigWatchers();
    
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
  }

  /**
   * Load all configuration files
   */
  async loadAllConfigurations() {
    try {
      // Load main configuration
      await this.loadMainConfig();
      
      // Validate all configurations
      this.validateAllConfigurations();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Load main configuration file
   */
  async loadMainConfig() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    const mainConfigPath = path.join(this.configDir, 'main.json');
    const defaultConfig = this.getDefaultMainConfig();
    let config;
    
    if (fs.existsSync(mainConfigPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(mainConfigPath, 'utf-8'));
      config = this.mergeConfigs(defaultConfig, fileConfig);
    } else {
      this.saveConfig('main', defaultConfig)
      config = defaultConfig;
    }
    
    this.configs.set('main', config);
  }

  /**
   * Get default main configuration
   */
  getDefaultMainConfig() {
    return {
      app: {
        name: 'oTools',
        version: '1.10',
        debug: false,
        autoStart: true
      },
      window: {
        width: 400,
        height: 360,
        alwaysOnTop: true,
        skipTaskbar: true
      },
      plugins: {
        autoLoad: true,
        maxProcesses: 10,
        timeout: 30000,
        debug: false
      },
      logger: {
        level: 'info',
        enableFile: true,
        logFile: 'otools.log',
        enableConsole: false
      },
      shortcuts: {
        toggle: 'Alt+Space'
      },
      pluginMarket: {
        debug: false
      }
    };
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
      }     
    } catch (error) {
      throw error
    }
  }

  /**
   * Get configuration
   */
  getConfig(configName, defaultValue = '') {
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
      }     
      if (filePath) {
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
      }
    } catch (error) {
      throw error
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
  validateConfiguration(config) {
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
        throw error
      }
    }
  }

  /**
   * Get all configuration names
   */
  getConfigNames() {
    return Array.from(this.configs.keys());
  }

  /**
   * Destroy the configuration manager (public API)
   */
  async destroy() {
    await this.onDestroy();
  }
}

module.exports = ConfigManager; 