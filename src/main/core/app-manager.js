const BaseManager = require('./base-manager');
const Logger = require('./logger');
const ConfigManager = require('./config-manager');
const ErrorHandler = require('./error-handler');
const PluginProcessPool = require('../plugin-manager/process-pool');
const PluginManager = require('../plugin-manager/manager');

/**
 * Application Manager - Unify all core components
 */
class AppManager extends BaseManager {
  constructor() {
    super('AppManager');
    
    // Core components
    this.logger = null;
    this.configManager = null;
    this.errorHandler = null;
    
    // Plugin related components
    this.pluginProcessPool = null;
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
      this.getComponent('logger')?.log(`Component ${name} has been overwritten registered`, 'warn');
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
      
      // 1. Initialize logger system
      this.logger = new Logger();
      await this.logger.initialize(options.logging || {});
      this.registerComponent('logger', this.logger);
      
      // 2. Initialize configuration manager
      this.configManager = new ConfigManager();
      await this.configManager.initialize({
        configDir: options.configDir,
        logger: this.logger
      });
      this.registerComponent('configManager', this.configManager);
      
      // 4. Initialize error handler
      this.errorHandler = new ErrorHandler();
      await this.errorHandler.initialize({
        logger: this.logger,
        configManager: this.configManager
      });
      this.registerComponent('errorHandler', this.errorHandler);
      
      
      // 6. Initialize plugin process pool
      this.pluginProcessPool = new PluginProcessPool(this);
      await this.pluginProcessPool.initialize({
        macTools: options.macTools,
        resultWindowManager: options.resultWindowManager
      });
      this.registerComponent('pluginProcessPool', this.pluginProcessPool);
      
      // 7. Initialize plugin manager
      this.pluginManager = new PluginManager(this);
      await this.pluginManager.initialize({
        macTools: options.macTools,
        mainWindow: options.mainWindow,
        resultWindowManager: options.resultWindowManager,
        enableWatch: options.enablePluginWatch !== false,
        pluginProcessPool: this.pluginProcessPool
      });
      this.registerComponent('pluginManager', this.pluginManager);
      
      
      // Update application status
      this.appStatus.status = 'running';
      this.appStatus.componentCount = this.getComponentCount();
      this.isInitialized = true;
      
      this.logger.log('Application Manager initialization completed');
      
    } catch (error) {
      this.appStatus.status = 'error';
      this.appStatus.lastError = error.message;
      
      if (this.logger) {
        this.logger.log(`Application Manager initialization failed: ${error.message}`, 'error');
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
      this.logger.log('Application Manager start destroying');
      
      // Destroy components in reverse order
      const destroyOrder = [
        'pluginManager', 
        'pluginProcessPool',
        'messageHandler',
        'messageRouter',
        'errorHandler',
        'configManager',
        'logger'
      ];
      
      for (const componentName of destroyOrder) {
        const component = this.getComponent(componentName);
        if (component && typeof component.destroy === 'function') {
          try {
            await component.destroy();
            this.logger.log(`${componentName} has been destroyed`);
          } catch (error) {
            this.logger.log(`${componentName} destroy failed: ${error.message}`, 'error');
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

  /**
   * Get detailed status information
   */
  getDetailedStatus() {
    const status = this.getAppStatus();
    
    // Add detailed status of each component
    const components = this.getAllComponents();
    for (const [name, component] of Object.entries(components)) {
      if (component && typeof component.getStatus === 'function') {
        try {
          status.components[name].details = component.getStatus();
        } catch (error) {
          status.components[name].details = { error: error.message };
        }
      }
    }
    
    return status;
  }

  /**
   * Health check
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {},
      issues: []
    };
    
    const components = this.getAllComponents();
    
    for (const [name, component] of Object.entries(components)) {
      try {
        if (!component) {
          health.components[name] = { status: 'missing', error: 'Component not initialized' };
          health.issues.push(`${name}: Component not initialized`);
          continue;
        }
        
        // Check if the component has health check method
        if (typeof component.healthCheck === 'function') {
          const componentHealth = await component.healthCheck();
          health.components[name] = componentHealth;
          
          if (componentHealth.status !== 'healthy') {
            health.issues.push(`${name}: ${componentHealth.error || 'Unknown error'}`);
          }
        } else {
          // Basic check
          health.components[name] = { 
            status: 'unknown', 
            message: 'No health check method available' 
          };
        }
        
      } catch (error) {
        health.components[name] = { 
          status: 'error', 
          error: error.message 
        };
        health.issues.push(`${name}: ${error.message}`);
      }
    }
    
    // If there are issues, update overall status
    if (health.issues.length > 0) {
      health.status = 'unhealthy';
    }
    
    return health;
  }

  /**
   * Broadcast message to all components
   */
  async broadcastMessage(message) {
    const results = {};
    const components = this.getAllComponents();
    
    for (const [name, component] of Object.entries(components)) {
      if (component && typeof component.handleMessage === 'function') {
        try {
          results[name] = await component.handleMessage(message);
        } catch (error) {
          results[name] = { error: error.message };
        }
      } else {
        results[name] = { error: 'Component does not support message handling' };
      }
    }
    
    return results;
  }
}

module.exports = { AppManager }; 