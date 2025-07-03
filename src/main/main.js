const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('node:path');
const Store = require('electron-store');
const logger = require('./utils/logger');
const { AppManager } = require('./core');
const { getSavedWindowPosition, saveWindowPosition } = require('./utils/window');

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
const createWindow = () => {
  const savedPos = getSavedWindowPosition(store);
  
  mainWindow = new BrowserWindow({
    width: 480,
    height: 400,
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
 * Initialize application
 */
async function initializeApp() {
  try {
    // Initialize basic components
    store = new Store();
    // Create main window
    createWindow();
    // Create app manager
    appManager = new AppManager();
    await appManager.initialize(
      {
        mainWindow: mainWindow,
        store: store
      }
    );
    
    logger.info('Application started');
    
  } catch (error) {
    console.error('Application initialization failed:', error);
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
    
  } catch (error) {
    console.error('Error occurred during application exit:', error);
  }
});