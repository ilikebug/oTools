const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('node:path');
const Store = require('electron-store');
const logger = require('./utils/logger');
const { AppManager } = require('./core');
const ConfigManager = require('./core/config-manager');
const { setAutoStart } = require('./utils/auto-start');
const PluginManager = require('./core/plugin-manager')
const WindowStateKeeper = require('electron-window-state');
const Positioner = require('electron-positioner');


if (require('electron-squirrel-startup')) {
  app.quit();
}

// Global variables
let mainWindow;
let appManager;
let store;

/**
 * Create main window
 */
const createWindow = (conf) => {
  // 使用 window-state 记录和恢复主窗口状态
  let mainWindowState = WindowStateKeeper({
    defaultWidth: conf && conf.window && conf.window.width ? conf.window.width : 420,
    defaultHeight: conf && conf.window && conf.window.height ? conf.window.height : 380,
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    center: false,
    resizable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../renderer/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    },
    show: false
  });

  mainWindowState.manage(mainWindow);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Use positioner to center the window on the screen where the mouse is
      const { screen } = require('electron');
      const mouse = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(mouse);
      mainWindow.setBounds({
        x: display.bounds.x,
        y: display.bounds.y,
        width: mainWindow.getBounds().width,
        height: mainWindow.getBounds().height
      });
      const positioner = new Positioner(mainWindow);
      positioner.move('center');
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  if (conf.app.debug) {
    mainWindow.webContents.openDevTools();
  }
};

/**
 * Initialize application
 */
async function initializeApp() {
  try {
    // Initialize basic components
    store = new Store();
    
    // init config manager
    const configManager = new ConfigManager();
    await configManager.initialize();
    const mainConfig  = configManager.getConfig('main')
    
    // init plugin manager
    const pluginManager = new PluginManager();
    await pluginManager.initialize({
      configManager: configManager,
      store: store
    });
    
    // Create main window
    createWindow(mainConfig);
    
    // Set mainWindow reference in plugin manager after window creation
    pluginManager.setMainWindow(mainWindow);
    
    // set auto start
    if (mainConfig && mainConfig.app && 
      typeof mainConfig.app.autoStart !== 'undefined') {
      setAutoStart(!!mainConfig.app.autoStart);
    }
    
    // Create app manager
    appManager = new AppManager();
    
    await appManager.initialize(
      {
        configManager: configManager,
        pluginManager: pluginManager,
        mainWindow: mainWindow,
        store: store
      }
    );

    logger.info('Application started');
    
  } catch (error) {
    console.error('Application initialization failed:', error);
    logger.error('Application initialization failed:', error);
    app.quit();
  }
}

// Electron app event handling
app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const configManager = appManager.getComponent('configManager')
    const mainConfig = configManager.getConfig('main')
    createWindow(mainConfig);
  }
});

app.on('before-quit', async () => {
  try {
    // Unregister all global shortcuts
    globalShortcut.unregisterAll();
    
    // Destroy app manager
    if (appManager) {
      await appManager.destroy();
    }
    
  } catch (error) {
    logger.error('Error occurred during application exit:', error);
  }
});

module.exports = {
  mainWindow: mainWindow
}