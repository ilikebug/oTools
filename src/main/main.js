const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('node:path');
const Store = require('electron-store');

// Import new core components
const { AppManager } = require('./core');
const { getSavedWindowPosition, saveWindowPosition } = require('./utils/window');
const MacTools = require('./utils/mac-tools');

if (require('electron-squirrel-startup')) {
  app.quit();
}

// Global variables
let mainWindow;
let appManager;
let resultWindowManager;
let macTools;
let store;

/**
 * Create main window
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

  // macOS specific settings
  if (process.platform === 'darwin' && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
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
  if (process.env.NODE_ENV === 'otools') {
    mainWindow.webContents.openDevTools();
  }
};

/**
 * Register global shortcuts
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
    appManager.getComponent('logger').log('Global shortcut registration failed', 'error');
  } else {
    appManager.getComponent('logger').log(`Global shortcut registered: ${shortcut}`);
  }
}

/**
 * Initialize application
 */
async function initializeApp() {
  try {
    // Initialize basic components
    store = new Store();
    macTools = new MacTools();
    
    // Create app manager
    appManager = new AppManager();
    // 挂载到 global，供 IPC 刷新快捷键时访问
    global.appManager = () => appManager;
    
    // Create main window
    createWindow();
    
    // Initialize app manager (pass main window reference)
    await appManager.initialize({
      logging: {
        level: 'info',
        enableFile: true,
        logFile: path.join(__dirname, '../../logs/otools.log')
      },
      configDir: path.join(__dirname, '../../config'),
      macTools: macTools,
      mainWindow: mainWindow, // Pass main window reference
      resultWindowManager: null // Set later
    });

    const logger = appManager.getComponent('logger');
    logger.log('App manager initialized');
    
    // Set up IPC and result window manager
    const setupIPC = require('./ipc');
    resultWindowManager = setupIPC(mainWindow, appManager);
    
    // Update result window manager reference in app manager
    const pluginProcessPool = appManager.getComponent('pluginProcessPool');
    if (pluginProcessPool && resultWindowManager) {
      pluginProcessPool.resultWindowManager = resultWindowManager;
    }
    
    // Register global shortcuts
    registerGlobalShortcuts();
    
    logger.log('Application started');
    
  } catch (error) {
    console.error('Application initialization failed:', error);
    app.quit();
  }
}

/**
 * Helper function for safe window operations
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

// Electron app event handling
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
    // Unregister all global shortcuts
    globalShortcut.unregisterAll();
    
    // Destroy app manager
    if (appManager) {
      await appManager.destroy();
    }
    
    console.log('Application exited safely');
  } catch (error) {
    console.error('Error occurred during application exit:', error);
  }
});

// Export global variables for use in other modules
module.exports = {
  mainWindow: () => mainWindow,
  appManager: () => appManager,
  resultWindowManager: () => resultWindowManager,
  macTools: () => macTools,
  store: () => store,
  registerGlobalShortcuts
};