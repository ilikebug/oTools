const { ipcMain, BrowserWindow, Notification } = require('electron');
const path = require('path');
const MacTools = require('./utils/mac-tools');
const logger = require('./utils/logger');
const { setAutoStart } = require('./utils/auto-start');
const { globalShortcut } = require('electron');
const KeyboardManager = require('./core/keyboard-manager');



/**
 * Set up IPC communication
 * @param {AppManager} appManager Application manager
 */
function setupIPC(appManager) {
  
  // Plugin-related IPC handling
  setupPluginIPC(appManager);
  
  // System feature IPC handling
  setupSystemIPC(appManager);
}

/**
 * Set up plugin-related IPC handling
 */
function setupPluginIPC(appManager) {
  const pluginManager = appManager.getComponent('pluginManager')

  // Get plugin list
  ipcMain.handle('get-plugins', async () => {
    try {
      const plugins = await pluginManager.getPluginsList();
      return plugins;
    } catch (error) {
      return [];
    }
  });

  // Execute plugin
  ipcMain.handle('execute-plugin', async (event, pluginName, ...args) => {
    try {
      // Before executing the plugin, hide the main window
      if (appManager.mainWindowIsDestoryed()) {
        appManager.mainWindowHide()
        logger.info(`Executing plugin ${pluginName} before hiding main window`);
      }
      
      const result = await pluginManager.executePlugin(pluginName, 'default', ...args);
      
      return {
        success: true,
        result: result,
        message: `Plugin ${pluginName} executed successfully`
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        message: error.message
      };
    }
  });

  // Plugin process management
  ipcMain.handle('start-plugin', async (event, pluginName) => {
    try {
      await pluginManager.startPlugin(pluginName);
      return { success: true, message: `Plugin ${pluginName} started successfully` };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('stop-plugin', async (event, pluginName) => {
    try {
      await pluginManager.stopPlugin(pluginName);
      return { success: true, message: `Plugin ${pluginName} stopped successfully` };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('show-plugin-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isVisible()) {
      win.show();
    }
  });

  // 新增：打开插件市场窗口
  ipcMain.on('open-plugin-market', () => {
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      resizable: true,
      frame: true,
      webPreferences: {
        preload: path.join(__dirname, '../renderer/preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false
      }
    });
    win.setMenuBarVisibility(true);
    win.loadFile(path.join(__dirname, '../renderer/plugin-market.html'));
  });
}

/**
 * Set up system feature IPC handling
 */
function setupSystemIPC(appManager) {
  const configManager = appManager.getComponent('configManager');
  const keyboardManager = appManager.getComponent('keyboardManager')

  // Get application status
  ipcMain.handle('get-app-status', () => {
    return appManager.getAppStatus();
  });

  // Get configuration information
  ipcMain.handle('get-config', (event, configName) => {
    return configManager.getConfig(configName);
  });

  // Get configuration names
  ipcMain.handle('get-config-names', () => {
    return configManager.getConfigNames();
  });

  // Set configuration
  ipcMain.handle('set-config', async (event, configName, config) => {
    try {
      configManager.setConfig(configName, config);
      if (configName === 'main' && config.app && 
        typeof config.app.autoStart !== 'undefined') {
        setAutoStart(!!config.app.autoStart);
      }
      return { success: true, message: 'Configuration updated successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // New: Plugin-specific screenshot + OCR
  ipcMain.handle('captureAndOCR', async () => {
    try {
      const macTools = new MacTools();
      const imageBuffer = await macTools.captureScreenRegion();
      const ocrResult = await macTools.performOCR(imageBuffer);
      return {
        imageData: imageBuffer.toString('base64'),
        text: ocrResult
      };
    } catch (error) {
      return { imageData: null, text: '', error: error.message };
    }
  });

  // Refresh global shortcut
  ipcMain.handle('refresh-shortcut', async () => {
    try {
          keyboardManager.unregisterAll();
          keyboardManager.registerShortcutsFromConfig();
          return { success: true };
    } catch (e) {
      return { success: false, message: e.message };
    }
  });

  // Show system notification
  ipcMain.on('show-system-notification', (event, { title, body }) => {
    new Notification({ title, body }).show();
  });
}

module.exports = { setupIPC }; 