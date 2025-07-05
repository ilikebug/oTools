const { ipcMain, BrowserWindow, Notification } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');

const MacTools = require('./utils/mac-tools');
const logger = require('./utils/logger');
const { setAutoStart } = require('./utils/auto-start');
const { GetPluginDir } = require('./comm');



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
  const configManager = appManager.getComponent('configManager')

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

  // plugin market   
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
    const mainConfig = configManager.getConfig('main')
    if (mainConfig && mainConfig.pluginMarket.debug) {
      win.webContents.openDevTools();
    }
  });

  ipcMain.on('download-plugin', async (event, { folder }) => {
    const pluginsDir = GetPluginDir();
    const pluginPath = path.join(pluginsDir, folder);
    const repo = 'ilikebug/oTools-Plugins';
    const apiBase = `https://api.github.com/repos/${repo}/contents/${folder}`;
    const headers = { 'User-Agent': 'oTools' };
    const mainConfig = configManager.getConfig('main')
    if (mainConfig && mainConfig.githubToken) {
      headers['Authorization'] = `token ${mainConfig.githubToken}`;
    }
    async function fetchJson(url) {
      return new Promise((resolve, reject) => {
        https.get(url, { headers }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });
    }

    async function downloadFile(url, dest) {
      return new Promise((resolve, reject) => {
        https.get(url, { headers }, (res) => {
          if (res.statusCode !== 200) return reject(new Error('下载失败: ' + url));
          const fileStream = fs.createWriteStream(dest);
          res.pipe(fileStream);
          fileStream.on('finish', () => fileStream.close(resolve));
          fileStream.on('error', reject);
        }).on('error', reject);
      });
    }

    async function downloadDir(apiUrl, localDir) {
      if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
      const list = await fetchJson(apiUrl);
      for (const item of list) {
        if (item.type === 'file') {
          const rawUrl = item.download_url;
          const filePath = path.join(localDir, item.name);
          await downloadFile(rawUrl, filePath);
        } else if (item.type === 'dir') {
          await downloadDir(item.url, path.join(localDir, item.name));
        }
      }
    }

    try {
      if (fs.existsSync(pluginPath)) {
        fs.rmSync(pluginPath, { recursive: true, force: true });
      }
      await downloadDir(apiBase, pluginPath);
      await pluginManager.loadPlugins();
      // Notify main window about plugin changes
      pluginManager.notifyPluginsChanged();
      event.reply('download-plugin-result', { success: true, message: 'Plugin downloaded and installed successfully', folder: folder });
      notification("success", `${folder} download success`)
    } catch (e) {
      event.reply('download-plugin-result', { success: false, message: e.message, folder: folder });
    }
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

  // Plugin-specific screenshot + OCR
  ipcMain.handle('capture-and-ocr', async () => {
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
    notification(title, body);
  });
}

function notification(title, body) {
  new Notification({ title, body }).show();
}

module.exports = { setupIPC }; 