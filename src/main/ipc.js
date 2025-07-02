const { ipcMain, dialog, shell, BrowserWindow, Notification } = require('electron');
const path = require('path');
const MacTools = require('./utils/mac-tools');


// Global variable to store result window
let resultWindow = null;
let pluginsDir = null;

/**
 * Set up IPC communication
 * @param {BrowserWindow} mainWindow Main window
 * @param {AppManager} appManager Application manager
 */
function setupIPC(mainWindow, appManager) {
  const logger = appManager.getComponent('logger');
  
  // Set plugin directory path
  pluginsDir = path.join(__dirname, '..', '..', '..', 'plugins');
  
  logger.log('IPC communication module initialization started');

  // Plugin-related IPC handling
  setupPluginIPC(mainWindow, appManager);
  
  // Window control IPC handling
  setupWindowIPC(mainWindow, appManager);
  
  // File operation IPC handling
  setupFileIPC(mainWindow, appManager);
  
  // System feature IPC handling
  setupSystemIPC(mainWindow, appManager);
}

/**
 * Set up plugin-related IPC handling
 */
function setupPluginIPC(mainWindow, appManager) {
  const logger = appManager.getComponent('logger');
  const errorHandler = appManager.getComponent('errorHandler');
  const pluginManager = appManager.getComponent('pluginManager')

  // Get plugin list
  ipcMain.handle('get-plugins', async () => {
    try {
      const plugins = await pluginManager.getPluginsList();
      return plugins;
    } catch (error) {
      await errorHandler.handleError(error, { operation: 'get_plugins' });
      return [];
    }
  });

  // Execute plugin
  ipcMain.handle('execute-plugin', async (event, pluginName, ...args) => {
    try {
      // Before executing the plugin, hide the main window
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
        logger.log(`Executing plugin ${pluginName} before hiding main window`);
      }
      
      const result = await pluginManager.executePlugin(pluginName, 'default', ...args);
      
      return {
        success: true,
        result: result,
        message: `Plugin ${pluginName} executed successfully`
      };
    } catch (error) {
      await errorHandler.handleError(error, { 
        pluginName, 
        operation: 'execute_plugin',
        args 
      });
      
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
      await errorHandler.handleError(error, { pluginName, operation: 'start_plugin' });
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('stop-plugin', async (event, pluginName) => {
    try {
      await pluginManager.stopPlugin(pluginName);
      return { success: true, message: `Plugin ${pluginName} stopped successfully` };
    } catch (error) {
      await errorHandler.handleError(error, { pluginName, operation: 'stop_plugin' });
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('show-plugin-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isVisible()) {
      win.show();
    }
  });
}

/**
 * Set up window control IPC handling
 */
function setupWindowIPC(mainWindow, appManager) {
  const logger = appManager.getComponent('logger');

  ipcMain.handle('minimize-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });
  
  ipcMain.handle('close-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  ipcMain.handle('show-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/**
 * Set up file operation IPC handling
 */
function setupFileIPC(mainWindow, appManager) {
  const logger = appManager.getComponent('logger');
  const errorHandler = appManager.getComponent('errorHandler');

  ipcMain.handle('open-file-dialog', async (event, options = {}) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'Image files', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'gif'] },
          { name: 'All files', extensions: ['*'] }
        ],
        ...options
      });
      return result;
    } catch (error) {
      await errorHandler.handleError(error, { operation: 'open_file_dialog' });
      return { canceled: true, error: error.message };
    }
  });

  ipcMain.handle('open-external', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      await errorHandler.handleError(error, { operation: 'open_external', url });
      return { success: false, error: error.message };
    }
  });
}

/**
 * Set up system feature IPC handling
 */
function setupSystemIPC(mainWindow, appManager) {
  const errorHandler = appManager.getComponent('errorHandler');
  const configManager = appManager.getComponent('configManager');

  // Get application status
  ipcMain.handle('get-app-status', () => {
    return appManager.getAppStatus();
  });

  // Get configuration information
  ipcMain.handle('get-config', (event, configName) => {
    return configManager.getConfig(configName);
  });

  // Set configuration
  ipcMain.handle('set-config', async (event, configName, config) => {
    try {
      configManager.setConfig(configName, config);
      return { success: true, message: 'Configuration updated successfully' };
    } catch (error) {
      await errorHandler.handleError(error, { operation: 'set_config', configName });
      return { success: false, message: error.message };
    }
  });

  // Redo screenshot
  ipcMain.handle('new-screenshot', async () => {
    try {
      // Close current result window
      if (resultWindow && !resultWindow.isDestroyed()) {
        resultWindow.close();
      }
      // Redo screenshot OCR
      const macTools = require('./utils/mac-tools');
      const macToolsInstance = new macTools();
      const imageBuffer = await macToolsInstance.captureScreenRegion();
      const ocrResult = await macToolsInstance.performOCR(imageBuffer);
      // Show new result window
      showResultWindow(
        imageBuffer.toString('base64'),
        ocrResult,
        'screenshot-ocr'
      );
      return {
        success: true,
        message: 'Screenshot redone successfully'
      };
    } catch (error) {
      await errorHandler.handleError(error, { operation: 'new_screenshot' });
      return {
        success: false,
        message: error.message
      };
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
      const appManager = global.appManager ? global.appManager() : null;
      if (appManager && appManager.getComponent) {
        const mainJs = require('./main');
        if (mainJs && mainJs.registerGlobalShortcuts) {
          // 先注销所有快捷键
          const { globalShortcut } = require('electron');
          globalShortcut.unregisterAll();
          // 重新注册
          mainJs.registerGlobalShortcuts();
          return { success: true };
        }
      }
      return { success: false, message: 'AppManager or registerGlobalShortcuts not found' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  });

  // Show system notification
  ipcMain.on('show-system-notification', (event, { title, body }) => {
    new Notification({ title, body }).show();
  });
}

module.exports = setupIPC; 