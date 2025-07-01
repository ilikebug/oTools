const { ipcMain, dialog, shell, BrowserWindow, app } = require('electron');
const path = require('path');

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
  const configManager = appManager.getComponent('configManager');
  const performanceMonitor = appManager.getComponent('performanceMonitor');
  const errorHandler = appManager.getComponent('errorHandler');
  
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
  
  // Result window management
  setupResultWindowIPC(mainWindow, appManager);

  logger.log('IPC communication module initialization completed');
  
  // Return result window manager
  return { showResultWindow, showHtmlWindow };
}

/**
 * Set up plugin-related IPC handling
 */
function setupPluginIPC(mainWindow, appManager) {
  const logger = appManager.getComponent('logger');
  const performanceMonitor = appManager.getComponent('performanceMonitor');
  const errorHandler = appManager.getComponent('errorHandler');
  const pluginManager = appManager.getComponent('pluginManager')

  // Get plugin list
  ipcMain.handle('get-plugins', async () => {
    try {
      performanceMonitor.startTimer('get_plugins');
      
      const plugins = await pluginManager.getPluginsList();
      
      performanceMonitor.endTimer('get_plugins');
      return plugins;
    } catch (error) {
      await errorHandler.handleError(error, { operation: 'get_plugins' });
      return [];
    }
  });

  // Execute plugin
  ipcMain.handle('execute-plugin', async (event, pluginName, ...args) => {
    try {
      performanceMonitor.startTimer('execute_plugin', pluginName);
      // Before executing the plugin, hide the main window
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
        logger.log(`Executing plugin ${pluginName} before hiding main window`);
      }
      
      const result = await pluginManager.executePlugin(pluginName, 'default', ...args);
      
      performanceMonitor.endTimer('execute_plugin', pluginName, { success: true });
      
      return {
        success: true,
        result: result,
        message: `Plugin ${pluginName} executed successfully`
      };
    } catch (error) {
      performanceMonitor.endTimer('execute_plugin', pluginName, { success: false, error: error.message });
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

  ipcMain.handle('get-running-plugins', () => {
    return pluginManager.getPoolStatus();
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

  ipcMain.handle('save-image', async (event, imageBase64) => {
    try {
      const result = await dialog.showSaveDialog(resultWindow || mainWindow, {
        title: 'Save screenshot',
        defaultPath: `screenshot_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`,
        filters: [
          { name: 'PNG image', extensions: ['png'] },
          { name: 'All files', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
        const fs = require('fs');
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        fs.writeFileSync(result.filePath, imageBuffer);
        
        return {
          success: true,
          message: 'Image saved successfully',
          filePath: result.filePath
        };
      }
      
      return {
        success: false,
        message: 'User canceled saving'
      };
    } catch (error) {
      await errorHandler.handleError(error, { operation: 'save_image' });
      return {
        success: false,
        message: error.message
      };
    }
  });
}

/**
 * Set up system feature IPC handling
 */
function setupSystemIPC(mainWindow, appManager) {
  const performanceMonitor = appManager.getComponent('performanceMonitor');
  const errorHandler = appManager.getComponent('errorHandler');
  const configManager = appManager.getComponent('configManager');

  // Get application status
  ipcMain.handle('get-app-status', () => {
    return appManager.getAppStatus();
  });

  // Get performance statistics
  ipcMain.handle('get-performance-stats', () => {
    return performanceMonitor.getPerformanceStats();
  });

  // Get error statistics
  ipcMain.handle('get-error-stats', () => {
    return errorHandler.getErrorStats();
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
      const macTools = require('../utils/mac-tools');
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
  const MacTools = require('../utils/mac-tools');
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

  // Close result window
  ipcMain.handle('close-result-window', () => {
    if (resultWindow && !resultWindow.isDestroyed()) {
      resultWindow.close();
    }
    return { success: true };
  });
}

/**
 * Set up result window management IPC
 */
function setupResultWindowIPC(mainWindow, appManager) {
  const logger = appManager.getComponent('logger');
  const errorHandler = appManager.getComponent('errorHandler');

  /**
   * Create result display window
   */
  function createResultWindow(pluginName = null, pluginConfig = null) {
    if (resultWindow && !resultWindow.isDestroyed()) {
      resultWindow.focus();
      return resultWindow;
    }

    // Determine window configuration
    let windowConfig = {
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      title: 'Results - oTools',
      icon: path.join(__dirname, '../../renderer/assets/icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload.js')
      },
      show: false,
      resizable: true,
      maximizable: true,
      minimizable: true,
      closable: true
    };

    // If plugin configuration is provided, use plugin's UI configuration
    if (pluginConfig && pluginConfig.ui) {
      windowConfig = {
        ...windowConfig,
        width: pluginConfig.ui.width || 1200,
        height: pluginConfig.ui.height || 800,
        minWidth: pluginConfig.ui.minWidth || 800,
        minHeight: pluginConfig.ui.minHeight || 600,
        title: pluginConfig.ui.title || 'Results - oTools'
      };
    }

    resultWindow = new BrowserWindow(windowConfig);

    // Determine the HTML file path to load
    let htmlPath;
    if (pluginConfig && pluginConfig.ui && pluginConfig.ui.html) {
      // Load HTML file from plugin directory
      htmlPath = path.join(pluginsDir, pluginName, pluginConfig.ui.html);
    }

    // Check if HTML file exists
    if (!require('fs').existsSync(htmlPath)) {
      logger.log(`HTML file does not exist: ${htmlPath}`, 'warn');
      // Fallback to default page
      htmlPath = path.join(__dirname, '../../renderer/result-viewer.html');
    }

    logger.log(`Loading result window HTML: ${htmlPath}`);

    // Load result display page
    resultWindow.loadFile(htmlPath);

    // Show window after it's ready
    resultWindow.once('ready-to-show', () => {
      resultWindow.show();
    });

    // Clean up references when window is closed
    resultWindow.on('closed', () => {
      resultWindow = null;
    });

    return resultWindow;
  }

  /**
   * Show result window (for external use)
   */
  function showResultWindow(imageData, text, pluginName = null, pluginConfig = null) {
    try {
      const window = createResultWindow(pluginName, pluginConfig);
      
      // Wait for window to load before sending data
      window.webContents.once('did-finish-load', () => {
        window.webContents.send('result-data', {
          imageData: imageData,
          text: text,
          pluginName: pluginName,
          pluginConfig: pluginConfig
        });
      });
      
      logger.log(`Result window displayed: ${pluginName || 'default'}`);
    } catch (error) {
      errorHandler.handleError(error, { 
        operation: 'show_result_window', 
        pluginName 
      });
    }
  }

  /**
   * Generic show HTML window (for plugins to use)
   */
  function showHtmlWindow(htmlPath, data = {}, windowOptions = {}) {
    try {
      const BrowserWindow = require('electron').BrowserWindow;
      const fs = require('fs');
      let fullHtmlPath = htmlPath;
      // If not absolute path, search for htmlPath in plugin directories
      if (!path.isAbsolute(htmlPath)) {
        // Default plugin directory
        const pluginsDir = path.join(__dirname, '../../plugins');
        // Try to find htmlPath in all plugin directories
        const pluginDirs = fs.readdirSync(pluginsDir).filter(f => 
          fs.statSync(path.join(pluginsDir, f)).isDirectory()
        );
        
        for (const dir of pluginDirs) {
          const candidate = path.join(pluginsDir, dir, htmlPath);
          if (fs.existsSync(candidate)) {
            fullHtmlPath = candidate;
            break;
          }
        }
      }

      const win = new BrowserWindow({
        width: windowOptions.width || 900,
        height: windowOptions.height || 800,
        minWidth: windowOptions.minWidth || 800,
        minHeight: windowOptions.minHeight || 600,
        title: windowOptions.title || 'Plugin window',
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        },
        ...windowOptions
      });
      
      win.loadFile(fullHtmlPath);
      win.once('ready-to-show', () => {
        win.show();
      });
      
      win.webContents.once('did-finish-load', () => {
        win.webContents.send('plugin-data', data);
      });
      
      win.on('closed', () => {
        // Optional: Clean up references
      });
      
      logger.log(`HTML window displayed: ${fullHtmlPath}`);
      return win;
    } catch (error) {
      errorHandler.handleError(error, { 
        operation: 'show_html_window', 
        htmlPath 
      });
    }
  }

  // Bind functions to global scope
  global.showResultWindow = showResultWindow;
  global.showHtmlWindow = showHtmlWindow;
}

module.exports = setupIPC; 