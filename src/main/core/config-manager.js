const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const {GetPluginDir, GetConfigDir} = require('../comm')

/**
 * Configuration Manager
 * Responsible for loading, validating, and hot-reloading application configurations
 */
class ConfigManager {
  constructor() {
    this.configs = new Map();
    this.watchers = new Map();
    this.validators = new Map();

    this.configDir = GetConfigDir();  
    this.pluginsDir = GetPluginDir();
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
      
      // Load plugin configurations
      await this.loadPluginConfigs();
      
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
      config = JSON.parse(fs.readFileSync(mainConfigPath, 'utf-8'));
    } else {
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
        version: '1.0.0',
        debug: false,
        autoStart: true
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
      logger: {
        level: 'info',
        enableFile: true,
        logFile: 'otools.log',
        enableConsole: false
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
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }

    const pluginFolders = fs.readdirSync(this.pluginsDir).filter(file => {
      const fullPath = path.join(this.pluginsDir, file);
      return fs.statSync(fullPath).isDirectory();
    });

    for (const pluginName of pluginFolders) {
      const configPath = path.join(this.pluginsDir, pluginName, `plugin.json`);
      if (fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          config.configPath = configPath;
          this.configs.set(`plugin:${pluginName}`, config);
        } catch (error) {
          throw error
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
    } catch (error) {
      throw error
    }
  }

  /**
   * Reload plugin configuration
   */
  async reloadPluginConfig(pluginName) {
    const configPath = path.join(this.pluginsDir, pluginName, `plug.json`);
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      this.configs.set(`plugin:${pluginName}`, config);
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
      } else if (configName.startsWith('plugin:')) {
        const pluginName = configName.replace('plugin:', '');
        filePath = path.join(this.pluginsDir, pluginName, 'plug.json');
        const config = this.getConfig(configName)
        filePath = config.configPath
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
}

module.exports = ConfigManager; 