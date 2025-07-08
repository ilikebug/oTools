const KeyboardManager = require('./keyboard-manager')
const logger = require('../utils/logger');
const consts = require('../comm')
const { setupIPC } = require('../ipc')
const { forceMoveWindowToCurrentDisplay } = require('../comm')

/**
 * Application Manager - Unify all core components
 */
class AppManager {
  constructor() {
    this.configManager = null;
    this.pluginManager = null;
    this.keyboardManager = null;
  
    this.startTime = null;
    this.appStatus = {
      version: '1.0.0',
      status: consts.APP_STATUS.INITIALIZING,
      uptime: 0,
    };

    this.components = new Map(); 

    this.mainWindow = null;
    this.store = null
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

      this.store = options.store
      this.mainWindow = options.mainWindow
      
      // Initialize configuration manager
      this.configManager = options.configManager
      this.registerComponent('configManager', this.configManager);
      const mainConfig = this.configManager.getConfig('main')

      // Initialize logger
      logger.initialize(mainConfig.logger)
      this.registerComponent('logger', logger);
      
      // Initialize plugin manager
      this.pluginManager = options.pluginManager
      this.registerComponent('pluginManager', this.pluginManager);

      // Initialize keyboard manager
      this.keyboardManager = new KeyboardManager()
      this.keyboardManager.initialize(
        {
          configManager: this.configManager,
          mainWindow: this.mainWindow,
          store: this.store,
          appManager: this
        }
      )
      this.registerComponent('keyboardManager', this.keyboardManager);

      // Register global shortcuts
      this.keyboardManager.refreshShortcuts()

      // Set IPC 
      setupIPC(this);
      
      // Auto-start dependent plugins after IPC is ready
      if (this.pluginManager && 
        typeof this.pluginManager.autoStartDependentPlugins === 'function') {
        await this.pluginManager.autoStartDependentPlugins();
      }
      
      // Update application status
      this.appStatus.status = consts.APP_STATUS.RUNNING;
      // send on completed to main page
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('app-init-completed');
      }
    } catch (error) {
      this.appStatus.status = consts.APP_STATUS.ERROR;
      
      logger.error(`Application Manager initialization failed: ${error.message}`);
      
      throw error;
    }
  }

  /**
   * Destroy Application Manager
   */
  async destroy() {
    try {
      // Destroy components in reverse order
      const destroyOrder = [
        'pluginManager',
        'keyboardManager',
        'configManager',
        'logger'
      ];
      
      for (const componentName of destroyOrder) {
        const component = this.getComponent(componentName);
        if (component && typeof component.destroy === 'function') {
          try {
            await component.destroy();
          } catch (error) {
            logger.error(`${componentName} destroy failed: ${error.message}`);
          }
        }
      }
      this.appStatus.status = consts.APP_STATUS.SHUTTING_DOWN;
            
    } catch (error) {
      logger.error('Application Manager destroy failed:', error);
      throw error;
    }
  }

  /**
  * Get application status
  */
  getAppStatus() {
    if (this.startTime) {
      this.appStatus.uptime = Date.now() - this.startTime;
    }
    
    // Get running plugins count from plugin manager
    let runningPluginsCount = 0;
    if (this.pluginManager) {
      runningPluginsCount = this.pluginManager.processes.size;
    }
    
    return {
      ...this.appStatus,
      runningPluginsCount,
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
   * Check main window status
   */
  mainWindowIsDestroyed() {
    return this.mainWindow && !this.mainWindow.isDestroyed()
  }

  /**
   * hide main main window
   */
  mainWindowHide() {
    this.mainWindow.hide()
  }

  /**
   * show main window
   */
  mainWindowShow() {
    forceMoveWindowToCurrentDisplay(this.mainWindow);
  }

}

module.exports = { AppManager }; 