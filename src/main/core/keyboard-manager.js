const { globalShortcut } = require('electron');
const logger = require('../utils/logger');
const { forceMoveWindowToCurrentDisplay } = require('../comm');

class KeyboardManager {
  constructor() {
    this.shortcuts = new Map(); 

    this.configManager = null;
    this.mainWindow = null
    this.store = null
  }


  async initialize(options = {}) {
    this.configManager = options.configManager
    this.mainWindow = options.mainWindow
    this.store = options.store
    this.appManager = options.appManager
  }

  /**
   * Register a global shortcut
   * @param {string} accelerator Shortcut key
   * @param {function} callback Callback function
   * @param {string} [pluginName] Plugin name
   */
  registerShortcut(accelerator, callback, pluginName = null) {
    if (this.shortcuts.has(accelerator)) {
      logger.warn(`Shortcut already registered: ${accelerator}`);
      return false;
    }
    const ret = globalShortcut.register(accelerator, callback);
    if (ret) {
      this.shortcuts.set(accelerator, { callback, pluginName });
    } else {
      logger.error(`Failed to register shortcut: ${accelerator}`);
    }
    return ret;
  }

  /**
   * Unregister a shortcut
   * @param {string} accelerator Shortcut key
   */
  unregisterShortcut(accelerator) {
    globalShortcut.unregister(accelerator);
    this.shortcuts.delete(accelerator);
  }

  /**
   * Unregister all shortcuts
   */
  unregisterAll() {
    globalShortcut.unregisterAll();
    this.shortcuts.clear();
  }

  /**
   * Register shortcuts from config (support plugin shortcuts)
   * @param {object} pluginMap Map of plugin name to plugin object
   */
  registerShortcutsFromConfig(pluginMap = {}) {
    // Main app shortcut
    const mainConfig = this.configManager.getConfig('main');
    if (mainConfig?.shortcuts?.toggle) {
      this.registerShortcut(mainConfig.shortcuts.toggle, () => {
        if (this.mainWindow) {
          if (this.mainWindow.isVisible()) {
            this.mainWindow.hide();
          } else {
            forceMoveWindowToCurrentDisplay(this.mainWindow);
          }
        }  
      }, 'main');
    }
    
    // Plugin shortcuts
    for (const [pluginName, plugin] of Object.entries(pluginMap)) {
      if (pluginName === '__main__') continue;
      const pluginConfig = this.configManager.getConfig(`plugin:${pluginName}`);
      if (pluginConfig?.shortcut && typeof plugin.onHotkey === 'function') {
        this.registerShortcut(pluginConfig.shortcut, () => {
          plugin.onHotkey();
        }, pluginName);
      }
    }

    // Custom shortcuts
    if (mainConfig?.customShortcuts) {
      this.registerCustomShortcuts(mainConfig.customShortcuts);
    }
  }

  /**
   * Refresh shortcuts from config
   */
  refreshShortcuts() {
    try {
      // Get plugin manager to get plugin map
      const pluginManager = this.appManager?.getComponent('pluginManager');
      const pluginMap = pluginManager ? pluginManager.plugins : {};
      
      this.unregisterAll();
      this.registerShortcutsFromConfig(pluginMap);
    } catch (error) {
      logger.error(`Failed to refresh shortcuts: ${error.message}`);
    }
  }

  /**
   * Register custom shortcuts for plugin toggle
   * @param {Array} shortcuts Array of custom shortcut objects
   */
  registerCustomShortcuts(shortcuts) {
    // First unregister existing custom shortcuts
    this.unregisterCustomShortcuts();
    
    for (const shortcut of shortcuts) {
      if (shortcut.accelerator && shortcut.pluginName) {
        this.registerShortcut(shortcut.accelerator, () => {
          this.handleCustomShortcut(shortcut.pluginName);
        }, `custom_${shortcut.pluginName}`);
      }
    }
  }

  /**
   * Unregister custom shortcuts
   */
  unregisterCustomShortcuts() {
    const shortcutsToRemove = [];
    for (const [accelerator, shortcut] of this.shortcuts) {
      if (shortcut.pluginName && shortcut.pluginName.startsWith('custom_')) {
        shortcutsToRemove.push(accelerator);
      }
    }
    
    for (const accelerator of shortcutsToRemove) {
      this.unregisterShortcut(accelerator);
    }
  }

  /**
   * Handle custom shortcut execution
   * @param {string} pluginName Plugin name
   */
  async handleCustomShortcut(pluginName) {
    try {
      // Get plugin manager from app manager
      const pluginManager = this.appManager?.getComponent('pluginManager');
      if (!pluginManager) {
        logger.error('Plugin manager not available');
        return;
      }

      // Check if plugin exists
      const pluginInfo = pluginManager.getPluginInfo(pluginName);
      if (!pluginInfo) {
        logger.error(`Plugin ${pluginName} not found`);
        return;
      }

      // Get plugin window status
      const status = pluginManager.getPluginWindowStatus(pluginName);
      
      if (!status.exists) {
        // If process doesn't exist, try to create it (for dependent plugins)
        try {
          await pluginManager.getProcess(pluginName);
        } catch (error) {
          logger.error(`Failed to create plugin process: ${error.message}`);
          return;
        }
      }

      // Check if window is visible
      const isVisible = status.exists && status.visible;
      
      if (isVisible) {
        // Hide window
        pluginManager.hidePluginWindow(pluginName);
      } else {
        // Show window
        pluginManager.showPluginWindow(pluginName);
      }
    } catch (error) {
      logger.error(`Error executing custom shortcut for ${pluginName}: ${error.message}`);
    }
  }

  /**
   * Destroy the keyboard manager 
   */
  destroy() {
    this.unregisterAll();
    this.configManager = null;
    this.mainWindow = null;
  }
}

module.exports = KeyboardManager; 