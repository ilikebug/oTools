const { app, BrowserWindow, globalShortcut, clipboard, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('fs');
const chokidar = require('chokidar');
const screenshot = require('screenshot-desktop');
const Tesseract = require('tesseract.js');
const Store = require('electron-store');

if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow;
let pluginManager;
const store = new Store();

// 插件管理器
class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.pluginsDir = path.join(__dirname, '..', 'plugins');
    this.watcher = null;
    this.init();
  }
  init() {
    this.loadPlugins();
    this.watchPlugins();
  }
  loadPlugins() {
    try {
      if (!fs.existsSync(this.pluginsDir)) {
        fs.mkdirSync(this.pluginsDir, { recursive: true });
        return;
      }
      const files = fs.readdirSync(this.pluginsDir);
      files.forEach(file => {
        if (file.endsWith('.js')) {
          this.loadPlugin(path.join(this.pluginsDir, file));
        }
      });
    } catch (error) {
      console.error('加载插件失败:', error);
    }
  }
  loadPlugin(pluginPath) {
    try {
      delete require.cache[require.resolve(pluginPath)];
      const plugin = require(pluginPath);
      if (this.validatePlugin(plugin)) {
        const pluginName = plugin.name;
        this.plugins.set(pluginName, {
          ...plugin,
          path: pluginPath
        });
        console.log(`插件加载成功: ${pluginName}`);
      }
    } catch (error) {
      console.error(`加载插件失败 ${pluginPath}:`, error);
    }
  }
  validatePlugin(plugin) {
    return plugin.name && plugin.description && plugin.version && plugin.author && typeof plugin.execute === 'function';
  }
  watchPlugins() {
    this.watcher = chokidar.watch(this.pluginsDir, {
      ignored: /(^|[\/\\])\../,
      persistent: true
    });
    this.watcher
      .on('add', (filePath) => {
        if (filePath.endsWith('.js')) {
          this.loadPlugin(filePath);
          this.notifyPluginsChanged();
        }
      })
      .on('change', (filePath) => {
        if (filePath.endsWith('.js')) {
          this.loadPlugin(filePath);
          this.notifyPluginsChanged();
        }
      })
      .on('unlink', (filePath) => {
        const pluginName = path.basename(filePath, '.js');
        this.plugins.delete(pluginName);
        this.notifyPluginsChanged();
      });
  }
  notifyPluginsChanged() {
    if (mainWindow) {
      mainWindow.webContents.send('plugins-changed', this.getPluginsList());
    }
  }
  getPluginsList() {
    return Array.from(this.plugins.values()).map(plugin => ({
      name: plugin.name,
      description: plugin.description,
      version: plugin.version,
      author: plugin.author
    }));
  }
  async executePlugin(pluginName, ...args) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`插件不存在: ${pluginName}`);
    }
    return await plugin.execute(...args);
  }
}

// OCR功能
async function performOCR(imagePath) {
  try {
    const result = await Tesseract.recognize(imagePath, 'chi_sim+eng', {
      logger: m => console.log(m)
    });
    return {
      success: true,
      text: result.data.text,
      confidence: result.data.confidence
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// 截图功能
async function takeScreenshot() {
  try {
    const imgPath = path.join(app.getPath('temp'), `screenshot-${Date.now()}.png`);
    await screenshot({ filename: imgPath });
    return {
      success: true,
      path: imgPath
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

function getSavedWindowPosition() {
  const pos = store.get('windowPosition');
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    return pos;
  }
  return null;
}

const createWindow = () => {
  const savedPos = getSavedWindowPosition();
  mainWindow = new BrowserWindow({
    width: 480,
    height: 420,
    x: savedPos ? savedPos.x : undefined,
    y: savedPos ? savedPos.y : undefined,
    center: !savedPos,
    resizable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    show: false
  });

  // 关键：macOS 全屏穿透
  if (process.platform === 'darwin' && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setFullScreenable(false);
  }

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  // 失去焦点时自动隐藏窗口
  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  // 移动时保存窗口位置
  mainWindow.on('move', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [x, y] = mainWindow.getPosition();
      store.set('windowPosition', { x, y });
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
};

function registerGlobalShortcuts() {
  const ret = globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
  if (!ret) {
    console.log('全局快捷键注册失败');
  }
}

function setupIPC() {
  ipcMain.handle('get-plugins', () => {
    return pluginManager.getPluginsList();
  });
  ipcMain.handle('execute-plugin', async (event, pluginName, ...args) => {
    try {
      return await pluginManager.executePlugin(pluginName, ...args);
    } catch (error) {
      return {
        success: false,
        result: null,
        message: error.message
      };
    }
  });
  ipcMain.handle('perform-ocr', async (event, imagePath) => {
    return await performOCR(imagePath);
  });
  ipcMain.handle('take-screenshot', async () => {
    return await takeScreenshot();
  });
  ipcMain.handle('get-clipboard', () => {
    return clipboard.readText();
  });
  ipcMain.handle('set-clipboard', (event, text) => {
    clipboard.writeText(text);
    return true;
  });
  ipcMain.handle('clear-clipboard', () => {
    clipboard.clear();
    return true;
  });
  ipcMain.handle('minimize-window', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });
  ipcMain.handle('close-window', () => {
    if (mainWindow) {
      mainWindow.hide();
    }
  });
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'gif'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    return result;
  });
  ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
  });
}

app.whenReady().then(() => {
  pluginManager = new PluginManager();
  createWindow();
  registerGlobalShortcuts();
  setupIPC();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (pluginManager && pluginManager.watcher) {
    pluginManager.watcher.close();
  }
});

// 所有 mainWindow 操作前加判断
function safeShowMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
  }
}
function safeHideMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}
function safeMinimizeMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
} 