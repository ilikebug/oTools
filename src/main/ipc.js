const { ipcMain, BrowserWindow, Notification, dialog, clipboard, shell, app, screen } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const clipboardEvent = require('clipboard-event');

// Clipboard listener variables
let clipboardListenerStarted = false;
let clipboardListener = null;

const MacTools = require('./utils/mac-tools');
const logger = require('./utils/logger');
const { setAutoStart } = require('./utils/auto-start');
const { GetPluginDir } = require('./comm');

// 用 global 变量做全局保护
if (!global._systemIpcRegistered) global._systemIpcRegistered = false;

/**
 * Create standardized error response
 */
function createErrorResponse(error, customMessage = null) {
  const message = customMessage || error.message;
  logger.error(`IPC Error: ${message}`, error);
  return { success: false, message };
}



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
  if (global._pluginIpcRegistered) return;
  global._pluginIpcRegistered = true;
  const pluginManager = appManager.getComponent('pluginManager')
  const configManager = appManager.getComponent('configManager')

  // Get plugin list
  ipcMain.handle('get-plugins', async () => {
    try {
      const plugins = await pluginManager.getPluginsList();
      return plugins;
    } catch (error) {
      logger.error(`get-plugins error: ${error.message}`);
      return [];
    }
  });

  // Get plugin names for shortcut configuration
  ipcMain.handle('get-plugin-names', async () => {
    try {
      const plugins = await pluginManager.getPluginsList();
      return plugins.map(plugin => ({
        name: plugin.name,
        shortName: plugin.shortName || plugin.name,
        description: plugin.description || ''
      }));
    } catch (error) {
      logger.error(`get-plugin-names error: ${error.message}`);
      return [];
    }
  });

  // Execute plugin
  ipcMain.handle('execute-plugin', async (event, pluginName, ...args) => {
    try {
      // Before executing the plugin, hide the main window
      if (appManager.mainWindowIsDestroyed()) {
        appManager.mainWindowHide()
      }
      
      // Check if plugin exists
      const pluginInfo = pluginManager.getPluginInfo(pluginName);
      if (!pluginInfo) {
        return { success: false, message: `Plugin ${pluginName} not found` };
      }

      // For dependent plugins, ensure process exists
      if (pluginInfo.startupMode === 'dependent') {
        const status = pluginManager.getPluginWindowStatus(pluginName);
        if (!status.exists) {
          try {
            await pluginManager.getProcess(pluginName);
          } catch (error) {
            return createErrorResponse(error, `Failed to create plugin process: ${error.message}`);
          }
        }
      }
      
      const result = await pluginManager.executePlugin(pluginName, 'default', ...args);
      
      return {
        success: true,
        result: result,
        message: `Plugin ${pluginName} executed successfully`,
        startupMode: pluginInfo.startupMode
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
      return createErrorResponse(error);
    }
  });

  ipcMain.handle('stop-plugin', async (event, pluginName) => {
    try {
      await pluginManager.stopPlugin(pluginName);
      return { success: true, message: `Plugin ${pluginName} stopped successfully` };
    } catch (error) {
      return createErrorResponse(error);
    }
  });

  ipcMain.handle('show-plugin-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isVisible()) {
      win.show();
    }
  });

  // Show plugin window by name
  ipcMain.handle('show-plugin-window-by-name', async (event, pluginName) => {
    try {
      // First check if plugin exists
      const pluginInfo = pluginManager.getPluginInfo(pluginName);
      if (!pluginInfo) {
        return { success: false, message: `Plugin ${pluginName} not found` };
      }

      // Check if plugin process exists
      const status = pluginManager.getPluginWindowStatus(pluginName);
      
      if (!status.exists) {
        // If process doesn't exist, try to create it (for dependent plugins)
        try {
          await pluginManager.getProcess(pluginName);
        } catch (error) {
          return createErrorResponse(error, `Failed to create plugin process: ${error.message}`);
        }
      }

      // Now try to show window
      const result = pluginManager.showPluginWindow(pluginName);
      if (result) {
        return { 
          success: true, 
          message: `Plugin window shown: ${pluginName}`,
          startupMode: status.startupMode
        };
      } else {
        return { 
          success: false, 
          message: `Failed to show plugin window: ${pluginName}`,
          startupMode: status.startupMode
        };
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Hide plugin window by name
  ipcMain.handle('hide-plugin-window-by-name', async (event, pluginName) => {
    try {
      const result = pluginManager.hidePluginWindow(pluginName);
      return { success: result, message: result ? `Plugin window hidden: ${pluginName}` : `Plugin window not found or already hidden: ${pluginName}` };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Toggle plugin window by name (show if hidden, hide if shown)
  ipcMain.handle('toggle-plugin-window-by-name', async (event, pluginName) => {
    try {
      // First check if plugin exists
      const pluginInfo = pluginManager.getPluginInfo(pluginName);
      if (!pluginInfo) {
        return { success: false, message: `Plugin ${pluginName} not found` };
      }

      // Check if plugin process exists
      const status = pluginManager.getPluginWindowStatus(pluginName);
      
      if (!status.exists) {
        // If process doesn't exist, try to create it (for dependent plugins)
        try {
          await pluginManager.getProcess(pluginName);
        } catch (error) {
          return createErrorResponse(error, `Failed to create plugin process: ${error.message}`);
        }
      }

      // Check if window is visible
      const isVisible = status.exists && status.visible;
      
      if (isVisible) {
        // Hide window
        const result = pluginManager.hidePluginWindow(pluginName);
        return { 
          success: result, 
          message: result ? `Plugin window hidden: ${pluginName}` : `Plugin window not found: ${pluginName}`,
          action: 'hide'
        };
      } else {
        // Show window
        const result = pluginManager.showPluginWindow(pluginName);
        return { 
          success: result, 
          message: result ? `Plugin window shown: ${pluginName}` : `Failed to show plugin window: ${pluginName}`,
          action: 'show'
        };
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Get plugin window status
  ipcMain.handle('get-plugin-window-status', async (event, pluginName) => {
    try {
      const status = pluginManager.getPluginWindowStatus(pluginName);
      return { success: true, status };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Uninstall plugin
  ipcMain.handle('uninstall-plugin', async (event, pluginName, removeFiles = true) => {
    try {
      const result = await pluginManager.uninstallPlugin(pluginName, removeFiles);
      return result;
    } catch (error) {
      return createErrorResponse(error, `Failed to uninstall plugin: ${error.message}`);
    }
  });

  // Set plugin configuration
  ipcMain.handle('set-plugin-config', async (event, pluginName, config) => {
    try {
      const pluginInfo = pluginManager.getPluginInfo(pluginName);
      if (!pluginInfo) {
        return { success: false, message: `Plugin ${pluginName} not found` };
      }

      const updatedConfig = { ...pluginInfo, ...config };
      pluginManager.plugins.set(pluginName, updatedConfig);

      const pluginConfigPath = path.join(pluginInfo.dir, 'plugin.json');
      fs.writeFileSync(pluginConfigPath, JSON.stringify(updatedConfig, null, 2));

      pluginManager.notifyPluginsChanged();

      return { success: true, message: `Plugin ${pluginName} configuration saved` };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Custom shortcut management
  ipcMain.handle('get-custom-shortcuts', async () => {
    try {
      const config = configManager.getConfig('main');
      return config.customShortcuts || [];
    } catch (error) {
      logger.error(`get-custom-shortcuts error: ${error.message}`);
      return [];
    }
  });

  ipcMain.handle('set-custom-shortcuts', async (event, shortcuts) => {
    try {
      const config = configManager.getConfig('main');
      config.customShortcuts = shortcuts;
      configManager.setConfig('main', config);
      
      // Refresh keyboard shortcuts
      const keyboardManager = appManager.getComponent('keyboardManager');
      if (keyboardManager) {
        keyboardManager.refreshShortcuts();
      }
      
      return { success: true, message: 'Custom shortcuts saved' };
    } catch (error) {
      return createErrorResponse(error);
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
          if (res.statusCode !== 200) return reject(new Error('Download failed: ' + url));
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
  if (global._systemIpcRegistered) return;
  global._systemIpcRegistered = true;
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

  // Refresh shortcuts
  ipcMain.handle('refresh-shortcut', async () => {
    try {
      keyboardManager.unregisterAll();
      keyboardManager.registerShortcutsFromConfig();
      return { success: true, message: 'Shortcuts refreshed' };
    } catch (error) {
      return { success: false, message: error.message };
    }
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

  // Screenshot capture
  ipcMain.handle('capture-screen', async () => {
    try {
      const macTools = new MacTools();
      const imageBuffer = await macTools.captureScreenRegion();
      return {
        success: true,
        imageData: imageBuffer.toString('base64'),
        message: 'Screenshot captured successfully'
      };
    } catch (error) {
      return { 
        success: false, 
        imageData: null, 
        message: error.message 
      };
    }
  });

  // OCR text recognition
  // only support base64 image fromat
  ipcMain.handle('perform-ocr', async (event, imageData) => {
    try {
      const macTools = new MacTools();      
      if (!imageData) {
        return { 
          success: false, 
          text: '', 
          message: "No executable image" 
        };
      }
      imageData = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageBuffer = Buffer.from(imageData, 'base64');
      
      const ocrResult = await macTools.performOCR(imageBuffer);      
      return {
        success: true,
        text: ocrResult,
        message: 'OCR performed successfully'
      };
    } catch (error) {
      logger.error('OCR failed:', error);
      return { 
        success: false, 
        text: '', 
        message: `OCR failed: ${error.message}` 
      };
    }
  });

  // Combined screenshot + OCR (for backward compatibility)
  ipcMain.handle('capture-and-ocr', async () => {
    try {
      const macTools = new MacTools();
      const imageBuffer = await macTools.captureScreenRegion();
      const ocrResult = await macTools.performOCR(imageBuffer);
      return {
        success: true,
        imageData: imageBuffer.toString('base64'),
        text: ocrResult,
        message: 'Screenshot and OCR completed successfully'
      };
    } catch (error) {
      logger.error('Screenshot and OCR failed:', error);
      return { 
        success: false, 
        imageData: null, 
        text: '', 
        message: `Screenshot and OCR failed: ${error.message}` 
      };
    }
  });



  // Show system notification
  ipcMain.on('show-system-notification', (event, { title, body }) => {
    notification(title, body);
  });

  // Quit application
  ipcMain.on('quit-app', () => {
    app.quit();
  });

  // File dialog operations
  ipcMain.handle('show-open-dialog', async (event, options) => {
    try {
      const result = await dialog.showOpenDialog(options);
      return {
        success: true,
        canceled: result.canceled,
        filePaths: result.filePaths
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('show-save-dialog', async (event, options) => {
    try {
      const result = await dialog.showSaveDialog(options);
      return {
        success: true,
        canceled: result.canceled,
        filePath: result.filePath
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // File system operations
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, content };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, message: 'File written successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('file-exists', (event, filePath) => {
    try {
      const exists = fs.existsSync(filePath);
      return { success: true, exists };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('create-directory', async (event, dirPath) => {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      return { success: true, message: 'Directory created successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // System operations
  ipcMain.handle('open-external', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true, message: 'Opened external link' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('show-item-in-folder', async (event, filePath) => {
    try {
      shell.showItemInFolder(filePath);
      return { success: true, message: 'Showed item in folder' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('get-app-version', () => {
    try {
      return { success: true, version: app.getVersion() };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Window operations
  ipcMain.handle('get-window-info', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        return {
          success: true,
          isVisible: win.isVisible(),
          isMinimized: win.isMinimized(),
          isMaximized: win.isMaximized(),
          bounds: win.getBounds()
        };
      }
      return { success: false, message: 'Window not found' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('minimize-window', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.minimize();
        return { success: true, message: 'Window minimized' };
      }
      return { success: false, message: 'Window not found' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('maximize-window', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (win.isMaximized()) {
          win.unmaximize();
          return { success: true, message: 'Window unmaximized' };
        } else {
          win.maximize();
          return { success: true, message: 'Window maximized' };
        }
      }
      return { success: false, message: 'Window not found' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('show-window', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.show();
        return { success: true, message: 'Window shown' };
      }
      return { success: false, message: 'Window not found' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('hide-window', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.hide();
        return { success: true, message: 'Window hidden' };
      }
      return { success: false, message: 'Window not found' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // System information
  ipcMain.handle('get-system-info', () => {
    try {
      return {
        success: true,
        platform: os.platform(),
        arch: os.arch(),
        version: os.version(),
        hostname: os.hostname(),
        homedir: os.homedir(),
        tmpdir: os.tmpdir(),
        cpus: os.cpus().length,
        totalmem: os.totalmem(),
        freemem: os.freemem(),
        uptime: os.uptime()
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Process management
  ipcMain.handle('get-process-info', () => {
    try {
      const process = require('process');
      return {
        success: true,
        pid: process.pid,
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // File system extended operations
  ipcMain.handle('list-directory', async (event, dirPath) => {
    try {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      const result = items.map(item => ({
        name: item.name,
        isDirectory: item.isDirectory(),
        isFile: item.isFile(),
        isSymbolicLink: item.isSymbolicLink()
      }));
      return { success: true, items: result };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('get-file-info', (event, filePath) => {
    try {
      const stats = fs.statSync(filePath);
      return {
        success: true,
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        isSymbolicLink: stats.isSymbolicLink(),
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('delete-file', async (event, filePath) => {
    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      return { success: true, message: 'File deleted successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('copy-file', async (event, sourcePath, destPath) => {
    try {
      fs.copyFileSync(sourcePath, destPath);
      return { success: true, message: 'File copied successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('move-file', async (event, sourcePath, destPath) => {
    try {
      fs.renameSync(sourcePath, destPath);
      return { success: true, message: 'File moved successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Database operations (simple key-value storage)
  ipcMain.handle('set-db-value', async (event, key, value) => {
    try {
      const dbPath = path.join(app.getPath('userData'), 'plugin-db.json');
      let db = {};
      if (fs.existsSync(dbPath)) {
        db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      }
      db[key] = value;
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
      return { success: true, message: 'Value stored successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('get-db-value', async (event, key) => {
    try {
      const dbPath = path.join(app.getPath('userData'), 'plugin-db.json');
      if (!fs.existsSync(dbPath)) {
        return { success: true, value: null };
      }
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      return { success: true, value: db[key] || null };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('delete-db-value', async (event, key) => {
    try {
      const dbPath = path.join(app.getPath('userData'), 'plugin-db.json');
      if (!fs.existsSync(dbPath)) {
        return { success: true, message: 'Key not found' };
      }
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      delete db[key];
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
      return { success: true, message: 'Value deleted successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Screen and display operations
  ipcMain.handle('get-screen-info', () => {
    try {
      const displays = screen.getAllDisplays();
      const primaryDisplay = screen.getPrimaryDisplay();
      return {
        success: true,
        displays: displays.map(display => ({
          id: display.id,
          bounds: display.bounds,
          workArea: display.workArea,
          scaleFactor: display.scaleFactor,
          rotation: display.rotation,
          internal: display.internal,
          size: display.size
        })),
        primaryDisplay: {
          id: primaryDisplay.id,
          bounds: primaryDisplay.bounds,
          workArea: primaryDisplay.workArea,
          scaleFactor: primaryDisplay.scaleFactor
        }
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Crypto operations
  ipcMain.handle('hash-string', (event, algorithm, data) => {
    try {
      const hash = crypto.createHash(algorithm);
      hash.update(data);
      return { success: true, hash: hash.digest('hex') };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('generate-uuid', () => {
    try {
      const uuid = crypto.randomUUID();
      return { success: true, uuid };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('encrypt-text', (event, text, password) => {
    try {
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(password, 'salt', 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(algorithm, key);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return { success: true, encrypted, iv: iv.toString('hex') };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('decrypt-text', (event, encrypted, password, iv) => {
    try {
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(password, 'salt', 32);
      const decipher = crypto.createDecipher(algorithm, key);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return { success: true, decrypted };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Time and date operations
  ipcMain.handle('get-current-time', () => {
    try {
      const now = new Date();
      return {
        success: true,
        timestamp: now.getTime(),
        isoString: now.toISOString(),
        localString: now.toString(),
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds()
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('format-date', (event, timestamp, format) => {
    try {
      const date = new Date(timestamp);
      let result = format;
      
      // Simple format replacement
      result = result.replace('YYYY', date.getFullYear());
      result = result.replace('MM', String(date.getMonth() + 1).padStart(2, '0'));
      result = result.replace('DD', String(date.getDate()).padStart(2, '0'));
      result = result.replace('HH', String(date.getHours()).padStart(2, '0'));
      result = result.replace('mm', String(date.getMinutes()).padStart(2, '0'));
      result = result.replace('ss', String(date.getSeconds()).padStart(2, '0'));
      
      return { success: true, formatted: result };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Text processing operations
  ipcMain.handle('text-to-base64', (event, text) => {
    try {
      const base64 = Buffer.from(text, 'utf8').toString('base64');
      return { success: true, base64 };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('base64-to-text', (event, base64) => {
    try {
      const text = Buffer.from(base64, 'base64').toString('utf8');
      return { success: true, text };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('generate-random-string', (event, length = 16, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') => {
    try {
      let result = '';
      for (let i = 0; i < length; i++) {
        result += charset.charAt(Math.floor(Math.random() * charset.length));
      }
      return { success: true, randomString: result };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // File compression utilities
  ipcMain.handle('compress-file', async (event, sourcePath, destPath) => {
    try {
      const zlib = require('zlib');
      const input = fs.createReadStream(sourcePath);
      const output = fs.createWriteStream(destPath);
      const gzip = zlib.createGzip();
      
      return new Promise((resolve) => {
        input.pipe(gzip).pipe(output);
        output.on('finish', () => {
          resolve({ success: true, message: 'File compressed successfully' });
        });
        output.on('error', (error) => {
          resolve({ success: false, message: error.message });
        });
      });
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('decompress-file', async (event, sourcePath, destPath) => {
    try {
      const zlib = require('zlib');
      const input = fs.createReadStream(sourcePath);
      const output = fs.createWriteStream(destPath);
      const gunzip = zlib.createGunzip();
      
      return new Promise((resolve) => {
        input.pipe(gunzip).pipe(output);
        output.on('finish', () => {
          resolve({ success: true, message: 'File decompressed successfully' });
        });
        output.on('error', (error) => {
          resolve({ success: false, message: error.message });
        });
      });
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Clipboard operations
  ipcMain.handle('read-clipboard', () => {
    try {
      const text = clipboard.readText();
      return { success: true, text };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('write-clipboard', (event, text) => {
    try {
      clipboard.writeText(text);
      return { success: true, message: 'Text copied to clipboard' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('read-clipboard-image', () => {
    try {
      const image = clipboard.readImage();
      if (image.isEmpty()) {
        return { success: false, message: 'No image in clipboard' };
      }
      return { success: true, imageData: image.toDataURL() };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('write-clipboard-image', (event, imageData) => {
    try {
      const image = clipboard.readImage();
      clipboard.writeImage(image);
      return { success: true, message: 'Image copied to clipboard' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // start clipboard listener
  ipcMain.handle('start-clipboard-listener', (event) => {
    if (clipboardListenerStarted) {
      return { success: false, message: 'Clipboard listener already started' };
    }
    clipboardListenerStarted = true;
    clipboardListener = clipboardEvent.on('change', () => {
      // Send to all windows
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('clipboard-changed');
      });
    });
    return { success: true, message: 'Clipboard listener started' };
  });

  // stop clipboard listener
  ipcMain.handle('stop-clipboard-listener', (event) => {
    if (!clipboardListenerStarted) {
      return { success: false, message: 'Clipboard listener not started' };
    }
    if (clipboardListener && clipboardListener.remove) {
      clipboardListener.remove();
    } else if (clipboardListener && clipboardListener.off) {
      clipboardListener.off();
    }
    clipboardListenerStarted = false;
    clipboardListener = null;
    return { success: true, message: 'Clipboard listener stopped' };
  });
}

function notification(title, body) {
  try {
    if (!Notification.isSupported()) {
      logger.warn('Notifications are not supported on this system');
      return;
    }

    const notification = new Notification({ title, body });
    
    notification.on('show', () => {
      logger.info('Notification shown successfully');
    });
    
    notification.on('error', (error) => {
      logger.error('Notification error:', error);
    });
    
    notification.show();
  } catch (error) {
    logger.error('Failed to show notification:', error);
  }
}

module.exports = { setupIPC }; 