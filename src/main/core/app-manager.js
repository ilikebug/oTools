const BaseManager = require('./base-manager');
const ConfigManager = require('./config-manager');
const PluginManager = require('./plugin-manager');
const logger = require('../utils/logger');

/**
 * Application Manager - Unify all core components
 */
class AppManager extends BaseManager {
  constructor() {
    super('AppManager');
    
    // Core components
    this.configManager = null;
    
    // Plugin related components
    this.pluginManager = null;
    
    // Application status
    this.isInitialized = false;
    this.startTime = null;
    this.appStatus = {
      version: '1.0.0',
      status: 'initializing',
      uptime: 0,
      componentCount: 0,
      lastError: null
    };

    this.components = new Map(); // Initialize component Map
  }

  /**
   * Register component
   * @param {string} name Component name
   * @param {object} componentInstance Component instance
   */
  registerComponent(name, componentInstance) {
    if (this.components.has(name)) {
      logger.warn(`Component ${name} has been overwritten registered`);
    }
    this.components.set(name, componentInstance);
  }

  /**
   * Initialize Application Manager
   */
  async initialize(options = {}) {
    try {
      this.startTime = Date.now();
      this.appStatus.status = 'initializing';
      
      // 2. Initialize configuration manager
      this.configManager = new ConfigManager();
      await this.configManager.initialize({
        configDir: options.configDir,
      });
      this.registerComponent('configManager', this.configManager);
      
      // 7. Initialize plugin manager
      this.pluginManager = new PluginManager(this);
      await this.pluginManager.initialize({
        macTools: options.macTools,
        mainWindow: options.mainWindow,
        resultWindowManager: options.resultWindowManager,
        enableWatch: options.enablePluginWatch !== false
      });
      this.registerComponent('pluginManager', this.pluginManager);
      
      
      // Update application status
      this.appStatus.status = 'running';
      this.appStatus.componentCount = this.getComponentCount();
      this.isInitialized = true;
      
      logger.info('Application Manager initialization completed');
      
    } catch (error) {
      this.appStatus.status = 'error';
      this.appStatus.lastError = error.message;
      
      if (logger) {
        logger.error(`Application Manager initialization failed: ${error.message}`);
      } else {
        console.error('Application Manager initialization failed:', error);
      }
      
      throw error;
    }
  }

  /**
   * Destroy Application Manager
   */
  async destroy() {
    try {
      this.appStatus.status = 'shutting_down';
      logger.info('Application Manager start destroying');
      
      // Destroy components in reverse order
      const destroyOrder = [
        'pluginManager',
        'configManager',
      ];
      
      for (const componentName of destroyOrder) {
        const component = this.getComponent(componentName);
        if (component && typeof component.destroy === 'function') {
          try {
            await component.destroy();
            logger.info(`${componentName} has been destroyed`);
          } catch (error) {
            logger.error(`${componentName} destroy failed: ${error.message}`);
          }
        }
      }
      
      this.appStatus.status = 'stopped';
      this.isInitialized = false;
            
    } catch (error) {
      console.error('Application Manager destroy failed:', error);
      throw error;
    }
  }

  /**
   * Get component
   */
  getComponent(componentName) {
    return this.components.get(componentName);
  }

  /**
   * Get all components
   */
  getAllComponents() {
    return this.components;
  }

  /**
   * Get component count
   */
  getComponentCount() {
    return this.components.size;
  }

  /**
   * Get application status
   */
  getAppStatus() {
    if (this.startTime) {
      this.appStatus.uptime = Date.now() - this.startTime;
    }
    return {
      ...this.appStatus,
      components: [...this.components.entries()].reduce((acc, [name, component]) => {
        acc[name] = {
          active: !!component,
          status: component ? 'active' : 'inactive',
          hasDestroy: typeof component?.destroy === 'function',
          hasGetStatus: typeof component?.getStatus === 'function'
        };
        return acc;
      }, {})
    };
  }

}

module.exports = { AppManager }; 