const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('node:path');
const Store = require('electron-store');
const logger = require('./utils/logger');
const { AppManager } = require('./core');
const { getSavedWindowPosition, saveWindowPosition} = require('./comm');
const ConfigManager = require('./core/config-manager');
const { setAutoStart } = require('./utils/auto-start');
const PluginManager = require('./core/plugin-manager')


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
  const savedPos = getSavedWindowPosition(store);
  
  mainWindow = new BrowserWindow({
    width: conf ? conf.window.width: 420,
    height: conf ? conf.window.height: 380,
    x: savedPos ? savedPos.x : undefined,
    y: savedPos ? savedPos.y : undefined,
    center: !savedPos,
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

  if (mainWindow && !mainWindow.isDestroyed()) {
    // Set window level to ensure it appears above other applications
    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setFullScreenable(false);
  }

  // Load main interface
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  // Window event handling
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

  // Open dev tools in development mode
  if (conf.app.debug) {
    mainWindow.webContents.openDevTools();
  }
};

/**
 * Initialize application
 */
async function initializeApp() {
  try {
    console.log('Starting application initialization...');
    
    // Initialize basic components
    store = new Store();
    console.log('Store initialized');
    
    // init config manager
    const configManager = new ConfigManager();
    await configManager.initialize();
    const mainConfig  = configManager.getConfig('main')
    console.log('Config manager initialized');
    
    // init plugin manager
    const pluginManager = new PluginManager();
    await pluginManager.initialize({
      configManager: configManager,
      store: store
    });
    console.log('Plugin manager initialized');
    
    // Create main window
    createWindow(mainConfig);
    console.log('Main window created');
    
    // Set mainWindow reference in plugin manager after window creation
    pluginManager.setMainWindow(mainWindow);
    console.log('Main window reference set');
    
    // set auto start
    if (mainConfig && mainConfig.app && 
      typeof mainConfig.app.autoStart !== 'undefined') {
      setAutoStart(!!mainConfig.app.autoStart);
    }
    console.log('Auto start configured');
    
    // Create app manager
    appManager = new AppManager();
    console.log('App manager created, initializing...');
    
    await appManager.initialize(
      {
        configManager: configManager,
        pluginManager: pluginManager,
        mainWindow: mainWindow,
        store: store
      }
    );
    console.log('App manager initialized');

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