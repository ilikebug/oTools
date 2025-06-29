const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('node:path');
const Store = require('electron-store');
const PluginProcessManager = require('./plugin-manager/process-manager');
const PluginManager = require('./plugin-manager/index');
const setupIPC = require('./ipc');
const { getSavedWindowPosition, saveWindowPosition } = require('./utils/window');
const MacTools = require('./utils/mac-tools');

if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow;
let resultWindowManager;
const pluginsDir = path.join(__dirname, '..', '..', 'plugins');
const macTools = new MacTools();
const pluginProcessManager = new PluginProcessManager(pluginsDir, macTools);
let pluginManager;
const store = new Store();

const createWindow = () => {
  const savedPos = getSavedWindowPosition(store);
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

  if (process.platform === 'darwin' && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setFullScreenable(false);
  }

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  mainWindow.on('move', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [x, y] = mainWindow.getPosition();
      saveWindowPosition(store, x, y);
    }
  });

  if (process.env.NODE_ENV === 'otools') {
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

app.whenReady().then(() => {
  createWindow();
  pluginManager = new PluginManager(mainWindow, pluginProcessManager);
  registerGlobalShortcuts();
  
  // 设置IPC并获取结果窗口管理器
  resultWindowManager = setupIPC(mainWindow, pluginManager, pluginProcessManager);
  
  // 将结果窗口管理器传递给插件管理器和插件进程管理器
  if (pluginManager && resultWindowManager) {
    pluginManager.setResultWindowManager(resultWindowManager);
  }
  if (pluginProcessManager && resultWindowManager) {
    pluginProcessManager.setResultWindowManager(resultWindowManager);
  }
  
  pluginProcessManager.startAll();
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

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  if (pluginManager && pluginManager.watcher) {
    pluginManager.watcher.close();
  }
  pluginProcessManager.stopAll();
});

// 安全操作窗口 - 合并重复的检查逻辑
function safeWindowOperation(operation) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    operation();
  }
}

function safeShowMainWindow() {
  safeWindowOperation(() => mainWindow.show());
}

function safeHideMainWindow() {
  safeWindowOperation(() => mainWindow.hide());
}

function safeMinimizeMainWindow() {
  safeWindowOperation(() => mainWindow.minimize());
}