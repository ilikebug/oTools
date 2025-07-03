const { globalShortcut } = require('electron');
const logger = require('../utils/logger');

class KeyboardManager {
  constructor() {
    this.shortcuts = new Map(); 

    this.configManager = null;
  }


  async initialize(options = {}) {
    this.configManager = options.configManager
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
      logger.info(`Registered shortcut: ${accelerator}${pluginName ? ' (plugin: ' + pluginName + ')' : ''}`);
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
    logger.info(`Unregistered shortcut: ${accelerator}`);
  }

  /**
   * Unregister all shortcuts
   */
  unregisterAll() {
    globalShortcut.unregisterAll();
    this.shortcuts.clear();
    logger.info('Unregistered all shortcuts');
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
        if (pluginMap['__main__'] && pluginMap['__main__'].onToggle) {
          pluginMap['__main__'].onToggle();
        }
      }, '__main__');
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
  }
}

module.exports = KeyboardManager; 