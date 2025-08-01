const KeyboardManager = require('./keyboard-manager')
const logger = require('../utils/logger');
const consts = require('../comm')
const { setupIPC } = require('../ipc')
const MacTools = require('../utils/mac-tools');
const EnhancedWindowManager = require('../utils/enhanced-window-manager');
const { screen } = require('electron');

/**
 * Application Manager - Unify all core components
 */
class AppManager {
  constructor() {
    this.configManager = null;
    this.pluginManager = null;
    this.keyboardManager = null;
    this.macTools = null;
    this.enhancedWindowManager = null;
  
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
      // Set app manager reference in plugin manager for enhanced window management
      if (this.pluginManager && typeof this.pluginManager.initialize === 'function') {
        this.pluginManager.appManager = this;
      }
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

      // init mac tools
      this.macTools = new MacTools()
      await this.macTools.initialize();
      this.registerComponent('macTools', this.macTools);

      // init enhanced window manager
      this.enhancedWindowManager = new EnhancedWindowManager();
      this.registerComponent('enhancedWindowManager', this.enhancedWindowManager);
      
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
        'enhancedWindowManager',
        'macTools',
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
   * Check if main window is destroyed
   */
  mainWindowIsDestroyed() {
    return !this.mainWindow || this.mainWindow.isDestroyed()
  }
 
   /**
  * hide main main window
  */
   mainWindowHide() {
     this.mainWindow.hide()
   }

      /**
   * show main window (intelligent enhancement selection)
   */
   async mainWindowShow() {
     if (!this.mainWindow || this.mainWindow.isDestroyed()) {
       logger.warn('Main window is not available');
       return false;
     }

     // Intelligently select display strategy (unified with plugin window logic)
     const needsEnhancement = await this.checkIfMainWindowNeedsEnhancement();
     
     if (needsEnhancement && this.enhancedWindowManager) {
       try {
         logger.info('Using enhanced method for main window (fullscreen environment detected)');
         
         // Register main window with enhanced window manager if not already registered
         this.enhancedWindowManager.registerWindow('main', this.mainWindow, {
           forceTopLevel: 'modal-panel',
           checkVisibility: true,
           autoRecover: true
         });
         
         // Use enhanced window manager to force show the window
         const result = await this.enhancedWindowManager.forceShowWindow('main');
         if (result) {return result;}
       } catch (error) {
         logger.warn('Enhanced window manager failed for main window, using fallback:', error);
       }
     }
     
     // Quick show main window (default path)
     return this.showMainWindowQuick();
   }

   /**
   * Check if main window display needs enhancement
   */
   async checkIfMainWindowNeedsEnhancement() {
     try {
       // Reuse plugin manager's environment detection logic
       if (this.pluginManager && typeof this.pluginManager.checkIfNeedsEnhancement === 'function') {
         return await this.pluginManager.checkIfNeedsEnhancement();
       }
       return false;
     } catch (error) {
       logger.warn('Failed to check main window enhancement needs:', error);
       return false;
     }
   }

   /**
   * Quick show main window (original logic, no delays)
   */
   showMainWindowQuick() {
     try {
       // Center main window on the screen where the mouse is (same as keyboard shortcut)
       const mouse = screen.getCursorScreenPoint();
       const display = screen.getDisplayNearestPoint(mouse);
       const width = this.mainWindow.getBounds().width;
       const height = this.mainWindow.getBounds().height;
       const x = display.bounds.x + Math.floor((display.bounds.width - width) / 2);
       const y = display.bounds.y + Math.floor((display.bounds.height - height) / 2);
       
       this.mainWindow.setBounds({ x, y, width, height });
       this.mainWindow.show();
       this.mainWindow.focus();
       return true;
     } catch (error) {
       logger.error('Failed to show main window:', error);
       return false;
     }
   }
}

module.exports = { AppManager }; 