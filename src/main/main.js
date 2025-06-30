const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('node:path');
const Store = require('electron-store');

// 导入新的核心组件
const { AppManager } = require('./core');
const { getSavedWindowPosition, saveWindowPosition } = require('./utils/window');
const MacTools = require('./utils/mac-tools');

if (require('electron-squirrel-startup')) {
  app.quit();
}

// 全局变量
let mainWindow;
let appManager;
let resultWindowManager;
let macTools;
let store;

/**
 * 创建主窗口
 */
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

  // macOS 特殊设置
  if (process.platform === 'darwin' && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setFullScreenable(false);
  }

  // 加载主界面
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  // 窗口事件处理
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

  // 开发模式打开开发者工具
  if (process.env.NODE_ENV === 'otools') {
    mainWindow.webContents.openDevTools();
  }
};

/**
 * 注册全局快捷键
 */
function registerGlobalShortcuts() {
  const config = appManager.getComponent('configManager').getConfig('main');
  const shortcut = config?.shortcuts?.toggle || 'Option+Space';
  
  const ret = globalShortcut.register(shortcut, () => {
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
    appManager.getComponent('logger').log('全局快捷键注册失败', 'error');
  } else {
    appManager.getComponent('logger').log(`全局快捷键注册成功: ${shortcut}`);
  }
}

/**
 * 初始化应用
 */
async function initializeApp() {
  try {
    // 初始化基础组件
    store = new Store();
    macTools = new MacTools();
    
    // 创建应用管理器
    appManager = new AppManager();
    
    // 创建主窗口
    createWindow();
    
    // 初始化应用管理器（传入主窗口引用）
    await appManager.initialize({
      logging: {
        level: 'info',
        enableFile: true,
        logFile: path.join(__dirname, '../../logs/otools.log')
      },
      configDir: path.join(__dirname, '../../config'),
      macTools: macTools,
      mainWindow: mainWindow, // 传入主窗口引用
      resultWindowManager: null // 稍后设置
    });

    const logger = appManager.getComponent('logger');
    logger.log('应用管理器初始化完成');
    
    // 设置IPC和结果窗口管理器
    const setupIPC = require('./ipc');
    resultWindowManager = setupIPC(mainWindow, appManager);
    
    // 更新应用管理器中的结果窗口管理器引用
    const pluginProcessPool = appManager.getComponent('pluginProcessPool');
    if (pluginProcessPool && resultWindowManager) {
      pluginProcessPool.resultWindowManager = resultWindowManager;
    }
    
    // 注册全局快捷键
    registerGlobalShortcuts();
    
    logger.log('应用启动完成');
    
  } catch (error) {
    console.error('应用初始化失败:', error);
    app.quit();
  }
}

/**
 * 安全操作窗口的辅助函数
 */
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

// Electron 应用事件处理
app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  try {
    // 注销全局快捷键
    globalShortcut.unregisterAll();
    
    // 销毁应用管理器
    if (appManager) {
      await appManager.destroy();
    }
    
    console.log('应用已安全退出');
  } catch (error) {
    console.error('应用退出时发生错误:', error);
  }
});

// 导出全局变量供其他模块使用
module.exports = {
  mainWindow: () => mainWindow,
  appManager: () => appManager,
  resultWindowManager: () => resultWindowManager,
  macTools: () => macTools,
  store: () => store
};