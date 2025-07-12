const { ipcMain, BrowserWindow, Notification, dialog, clipboard, shell, app, screen } = require('electron');
const path = require('path');
const https = require('https');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const robot = require('robotjs'); // For simulating mouse and keyboard

const logger = require('./utils/logger');
const { setAutoStart } = require('./utils/auto-start');
const { GetPluginPath } = require('./comm');
const { getPluginKV } = require('./utils/kv-manager');

let functionMap = null;

/**
 * Set up IPC communication
 * @param {AppManager} appManager Application manager
 */
function setupIPC(appManager) {

  functionMap = createFunctionMap(appManager);
}


function notification(title, body) {
  try {
    if (!Notification.isSupported()) {
      logger.warn('Notifications are not supported on this system');
      return;
    }

    const notification = new Notification({ title, body });
    
    notification.show();
  } catch (error) {
    logger.error('Failed to show notification:', error);
  }
}

// Function map for exposing all main process APIs to plugin renderer processes
function createFunctionMap(appManager) {
  const pluginManager = appManager.getComponent('pluginManager');
  const configManager = appManager.getComponent('configManager');
  const keyboardManager = appManager.getComponent('keyboardManager');
  return {
    // Plugin handlers
    getPlugins: async (event) => {
      return await pluginManager.getPluginsList();
    },

    getPluginNames: async (event) => {
      const plugins = await pluginManager.getPluginsList();
      return plugins.map(plugin => ({
        name: plugin.name,
        shortName: plugin.shortName || plugin.name,
        description: plugin.description || ''
      }));
    },

    executePlugin: async (event, pluginName, ...args) => {
      if (appManager.mainWindowIsDestroyed()) {
        appManager.mainWindowHide();
      }
      const pluginInfo = pluginManager.getPluginInfo(pluginName);
      if (!pluginInfo) {
        throw new Error(`Plugin ${pluginName} not found`);
      }
      if (pluginInfo.startupMode === 'dependent') {
        const status = pluginManager.getPluginWindowStatus(pluginName);
        if (!status.exists) {
          try {
            await pluginManager.getProcess(pluginName);
          } catch (error) {
            throw new Error(`Failed to create plugin process: ${error.message}`);
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
    },

    showPluginWindow: async (event, pluginName) => {
      const pluginInfo = pluginManager.getPluginInfo(pluginName);
      if (!pluginInfo) {
        throw new Error(`Plugin ${pluginName} not found`);
      }
      const status = pluginManager.getPluginWindowStatus(pluginName);
      if (!status.exists) {
        try {
          await pluginManager.getProcess(pluginName);
        } catch (error) {
          throw new Error(`Failed to create plugin process: ${error.message}`);
        }
      }
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
    },

    hidePluginWindow: async (event, pluginName) => {
      const result = pluginManager.hidePluginWindow(pluginName);
      return { success: result, message: result ? `Plugin window hidden: ${pluginName}` : `Plugin window not found or already hidden: ${pluginName}` };
    },

    getPluginWindowStatus: async (event, pluginName) => {
      const status = pluginManager.getPluginWindowStatus(pluginName);
      return { success: true, status };
    },

    uninstallPlugin: async (event, pluginName, removeFiles = true) => {
      const result = await pluginManager.uninstallPlugin(pluginName, removeFiles);
      return result;
    },

    setPluginConfig: async (event, pluginName, config) => {
      const pluginInfo = pluginManager.getPluginInfo(pluginName);
      if (!pluginInfo) {
        throw new Error(`Plugin ${pluginName} not found`);
      }
      const updatedConfig = { ...pluginInfo, ...config };
      pluginManager.plugins.set(pluginName, updatedConfig);
      const pluginConfigPath = path.join(pluginInfo.dir, 'plugin.json');
      fs.writeFileSync(pluginConfigPath, JSON.stringify(updatedConfig, null, 2));
      pluginManager.notifyPluginsChanged();
      return { success: true, message: `Plugin ${pluginName} configuration saved` };
    },

    downloadPlugin: async (event, { folder }) => {
      const pluginsDir = GetPluginPath();
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
        event.sender.send('download-plugin-result', { 
          success: true, 
          message: 'Plugin downloaded and installed successfully', 
          folder: folder,
        });
        notification("success", `${folder} download success`)
      } catch (e) {
        event.sender.send('download-plugin-result', {
           success: false, 
           message: e.message, 
           folder: folder,
        });
      }
    },

    openPluginMarket: (event) => {
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
    },
    
    // custom shortcuts
    getCustomShortcuts: async (event) => {
      const config = configManager.getConfig('main');
      return config.customShortcuts || [];
    },

    setCustomShortcuts: async (event, shortcuts) => {
      const config = configManager.getConfig('main');
      config.customShortcuts = shortcuts;
      configManager.setConfig('main', config);
      if (keyboardManager) {
        keyboardManager.refreshShortcuts();
      }
      return { success: true, message: 'Custom shortcuts saved' };
    },

    // System handlers
    getAppStatus: (event) => {
      return appManager.getAppStatus();
    },
    
    getSystemInfo: async (event) => {
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
    },

    refreshShortcut: async (event) => {
      keyboardManager.unregisterAll();
      keyboardManager.registerShortcutsFromConfig();
      return { success: true, message: 'Shortcuts refreshed' };
    },
    
    openExternal: async (event, url) => {
      await shell.openExternal(url);
      return { success: true, message: 'Opened external link' };
    },

    getConfig: (event, configName) => {
      return configManager.getConfig(configName);
    },

    getConfigNames: (event) => {
      return configManager.getConfigNames();
    },

    setConfig: async (event, configName, config) => {
      configManager.setConfig(configName, config);
      if (configName === 'main' && config.app && typeof config.app.autoStart !== 'undefined') {
        setAutoStart(!!config.app.autoStart);
      }
      return { success: true, message: 'Configuration updated successfully' };
    },

    captureScreen: async (event) => {
      const macTools = appManager.getComponent('macTools');
      const imageBuffer = await macTools.captureScreenRegion();
      return {
        success: true,
        imageData: imageBuffer.toString('base64'),
        message: 'Screenshot captured successfully'
      };
    },

    performOcr: async (event, imageData) => {
      const macTools = appManager.getComponent('macTools');
      if (!imageData) {
        return {
          success: false,
          text: '',
          message: 'No executable image'
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
    },

    captureAndOcr: async (event) => {
      const macTools = appManager.getComponent('macTools');
      const imageBuffer = await macTools.captureScreenRegion();
      const ocrResult = await macTools.performOCR(imageBuffer);
      return {
        success: true,
        imageData: imageBuffer.toString('base64'),
        text: ocrResult,
        message: 'Screenshot and OCR completed successfully'
      };
    },

    // File system operations
    showOpenDialog: async (event, options) => {
      return await dialog.showOpenDialog(options);
    },

    showSaveDialog: async (event, options) => {
      return await dialog.showSaveDialog(options);
    },
    
    readFile: async (event, filePath) => {
      return fs.readFileSync(filePath, 'utf8');
    },

    writeFile: async (event, filePath, content) => {
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true, message: 'File written successfully' };
    },

    fileExists: async (event, filePath) => {
      const exists = fs.existsSync(filePath);
      return { success: true, exists };
    },

    createDirectory: async (event, dirPath) => {
      fs.mkdirSync(dirPath, { recursive: true });
      return { success: true, message: 'Directory created successfully' };
    },

    showItemInFolder: async (event, filePath) => {
      shell.showItemInFolder(filePath);
      return { success: true, message: 'Showed item in folder' };
    },

    listDirectory: async (event, dirPath) => {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      const result = items.map(item => ({
        name: item.name,
        isDirectory: item.isDirectory(),
        isFile: item.isFile(),
        isSymbolicLink: item.isSymbolicLink()
      }));
      return { success: true, items: result };
    },

    getFileInfo: async (event, filePath) => {
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
    },

    deleteFile: async (event, filePath) => {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      return { success: true, message: 'File deleted successfully' };
    },

    copyFile: async (event, sourcePath, destPath) => {
      fs.copyFileSync(sourcePath, destPath);
      return { success: true, message: 'File copied successfully' };
    },

    moveFile: async (event, sourcePath, destPath) => {
      fs.renameSync(sourcePath, destPath);
      return { success: true, message: 'File moved successfully' };
    },


    // Window operations
    getWindowInfo: async (event) => {
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
    },

    minimizeWindow: async (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.minimize();
        return { success: true, message: 'Window minimized' };
      }
      return { success: false, message: 'Window not found' };
    },
    
    maximizeWindow: async (event) => {
      if (win.isMaximized()) {
        win.unmaximize();
        return { success: true, message: 'Window unmaximized' };
      } else {
        win.maximize();
        return { success: true, message: 'Window maximized' };
      }
    },

    showWindow: async (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.show();
        return { success: true, message: 'Window shown' };
      }
      return { success: false, message: 'Window not found' };
    },

    hideWindow: async (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        win.hide();
        return { success: true, message: 'Window hidden' };
      }
      return { success: false, message: 'Window not found' };
    },

    // Database operations
    setDbValue: async (event, dbName, key, value) => {
      const db = getPluginKV(dbName);
      await db.put(key, value);
      return { success: true, message: 'Value stored successfully' };
    },

    getDbValue: async (event, dbName, key) => {
      const db = getPluginKV(dbName);
      try {
        const value = await db.get(key);
        return { success: true, value };
      } catch (e) {
        if (e.notFound) return { success: true, value: null };
        throw e;
      }
    },
    
    deleteDbValue: async (event, dbName, key) => {
      const db = getPluginKV(dbName);
      await db.del(key);
      return { success: true, message: 'Value deleted successfully' };
    },

    // Screen and display operations
    getScreenInfo: async (event) => {
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
    },

    // Generate randon string
    generateRandomString: async (event, length = 16, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') => {
      let result = '';
      for (let i = 0; i < length; i++) {
        result += charset.charAt(Math.floor(Math.random() * charset.length));
      }
      return { success: true, randomString: result };
    },

    // Clipboard operations
    readClipboard: async (event) => {
      const text = clipboard.readText();
      if (text == '') {
        return { success: false, message: 'No text in clipboard' };
      }
      return { success: true, text };
    },

    writeClipboard: async (event, text) => {
      clipboard.writeText(text);
      return { success: true, message: 'Text copied to clipboard' };
    },

    readClipboardImage: async (event) => {
      const image = clipboard.readImage();
      if (image.isEmpty()) {
        return { success: false, message: 'No image in clipboard' };
      }
      return { success: true, imageData: image.toDataURL() };
    },

    writeClipboardImage: async (event, imageData) => {
      const image = clipboard.readImage();
      clipboard.writeImage(image);
      return { success: true, message: 'Image copied to clipboard' };
    },

    // Simulate mouse operations
    simulateMouse: async (event, action, params) => {
      switch (action) {
        case 'move': {
          robot.moveMouse(params.x, params.y);
          break;
        }
        case 'click': {
          robot.mouseClick(params.button || 'left', params.double || false);
          break;
        }
        case 'doubleClick': {
          robot.mouseClick(params.button || 'left', true);
          break;
        }
        case 'scroll': {
          robot.scrollMouse(params.x || 0, params.y || 0);
          break;
        }
        case 'drag': {
          robot.dragMouse(params.x, params.y);
          break;
        }
        default:
          return { success: false, message: 'Unknown mouse action' };
      }
      return { success: true, message: 'Mouse action performed' };
    },

    getMousePosition: async (event) => {
      const pos = robot.getMousePos();
      return { success: true, x: pos.x, y: pos.y };
    },  

    // Simulate keyboard operations
    simulateKeyboard: async (event, action, params) => {
      switch (action) {
        case 'type': {
          robot.typeString(params.text);
          break;
        }
        case 'keyTap': {
          robot.keyTap(params.key, params.modifiers);
          break;
        }
        case 'keyToggle': {
          robot.keyToggle(params.key, params.down, params.modifiers);
          break;
        }
        default:
          return { success: false, message: 'Unknown keyboard action' };
      }
      return { success: true, message: 'Keyboard action performed' };
    },

    // Quit application
    quitApp: (event) => {
      app.quit();
    },

    // Show sysnte notification
    showSystemNotification: (event, title, body) => {
      // Handle both object format { title, body } and separate parameters
      let notificationTitle, notificationBody;
      
      if (typeof title === 'object' && title !== null) {
        // Object format: { title, body }
        notificationTitle = title.title || 'Notification';
        notificationBody = title.body || '';
      } else {
        // Separate parameters: title, body
        notificationTitle = title || 'Notification';
        notificationBody = body || '';
      }
      
      notification(notificationTitle, notificationBody);
      return { success: true };
    },

    // Add a custom plugin directory and reload plugins
    addCustomPlugin: async (event, dir) => {
      const pluginManager = appManager.getComponent('pluginManager');
      const result = await pluginManager.addCustomPluginDir(dir);
      if (result) {
        const configManager = appManager.getComponent('configManager');
        const mainConfig = configManager.getConfig('main');
        mainConfig.plugins = mainConfig.plugins || {};
        if (!mainConfig.plugins.pluginDirs) mainConfig.plugins.pluginDirs = [];
        
        // Get the actual plugin directories that were added
        const customDirs = pluginManager.getCustomPluginDirs();
        
        // Update config with all custom plugin directories
        mainConfig.plugins.pluginDirs = customDirs;
        configManager.setConfig('main', mainConfig);
        
        return { success: true };
      }
      return { success: false, message: 'Directory already exists, is default, or contains no plugins.' };
    },

  };
}

ipcMain.handle('otools-function', async (event, funcName, ...args) => {
  if (functionMap && functionMap[funcName]) {
    try {
        return await functionMap[funcName](event, ...args);
    } catch (e) {
      logger.error(`otools-function call filed: ${funcName} - ${e.message}`, e);
      return { success: false, message: e.message };
    }
  }
  return { success: false, message: 'Function not found: ' + funcName };
});

module.exports = { setupIPC }; 