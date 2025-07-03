const { globalShortcut } = require('electron');

const ConfigManager = require('./config-manager');
const PluginManager = require('./plugin-manager');
const KeyboardManager = require('./keyboard-manager')
const MacTools = require('../utils/mac-tools');
const logger = require('../utils/logger');
const consts = require('../consts')
const { setupIPC } = require('../ipc')

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
      componentCount: 0,
      lastError: null
    };

    this.components = new Map(); 

    this.mainWindow = null;
    this.macTools = null;
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
      this.appStatus.status = consts.APP_STATUS.INITIALIZING;

      this.macTools = new MacTools()
      this.store = options.store
      this.mainWindow = options.mainWindow
      
      
      // Initialize configuration manager
      this.configManager = new ConfigManager();
      await this.configManager.initialize();
      this.registerComponent('configManager', this.configManager);
      
      // Initialize plugin manager
      this.pluginManager = new PluginManager();
      await this.pluginManager.initialize({
        macTools: this.macTools,
        mainWindow: this.mainWindow,
        enableWatch: options.enablePluginWatch !== false
      });
      this.registerComponent('pluginManager', this.pluginManager);

      // Initialize keyboard manager
      this.keyboardManager = new KeyboardManager()
      this.keyboardManager.initialize({configManager: this.configManager})
      this.registerComponent('keyboardManager', this.keyboardManager);

      // Set IPC
      setupIPC(this);

      // Register global shortcuts
      this.registerGlobalShortcuts() 
      
      // Update application status
      this.appStatus.status = consts.APP_STATUS.RUNNING;
      this.appStatus.componentCount = this.getComponentCount();      
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
      
      this.appStatus.status = consts.APP_STATUS.STOPPED;
            
    } catch (error) {
      console.error('Application Manager destroy failed:', error);
      throw error;
    }
  }

  /**
 * Register global shortcuts
 */
 registerGlobalShortcuts() {
  const config = this.configManager.getConfig('main');
  const shortcut = config?.shortcuts?.toggle || 'Alt+Space';
  
  const ret = globalShortcut.register(shortcut, () => {
    if (this.mainWindow) {
      if (this.mainWindow.isVisible()) {
        this.mainWindow.hide();
      } else {
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    }
   });
    if (!ret) {
      logger.error('Global shortcut registration failed');
    } else {
      logger.info(`Global shortcut registered: ${shortcut}`);
    }
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
   * Check main window status
   */
  mainWindowIsDestoryed() {
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
    this.mainWindow.show();
    this.mainWindow.focus();
  }

}

module.exports = { AppManager }; 