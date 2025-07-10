const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');


const allowedMethods = [
  'getPlugins',
  'getPluginNames',
  'executePlugin',
  'showPluginWindow',
  'hidePluginWindow',
  'getPluginWindowStatus',
  'uninstallPlugin',
  'setPluginConfig',
  'downlaodPlugnin',

  'getCustomShortcuts',
  'setCustomShortcuts',
  
  'getAppStatus',
  'getSystemInfo',
  'refreshShortcut',
  'openExternal',
  'getConfig',
  'getConfigNames',
  'setConfig',

  'captureScreen',
  'performOcr',
  'captureAndOcr',

  'showOpenDialog',
  'showSaveDialog',
  'readFile',
  'writeFile',
  'fileExists',
  'createDirectory',
  'showItemInFolder',
  'listDirectory',
  'getFileInfo',
  'deleteFile',
  'copyFile',
  'moveFile',

  'getWindowInfo',
  'minimizeWindow',
  'maximizeWindow',
  'showWindow',
  'hideWindow',
  'setDbValue',
  'getDbValue',
  'deleteDbValue',
  'getScreenInfo',
  'generateRandomString',

  'readClipboard',
  'writeClipboard',
  'readClipboardImage',
  'writeClipboardImage',

  'simulateMouse',
  'getMousePosition',
  'simulateKeyboard',

  'showSystemNotification',
];

const otools = {};
for (const method of allowedMethods) {
  otools[method] = (...args) => ipcRenderer.invoke('otools-function', method, ...args);
}

contextBridge.exposeInMainWorld('otools', otools);

// Dynamically load plugin's own preload.js if exists
try {
  // Find --plugin-preload-path=xxx from process.argv
  const preloadArg = process.argv.find(arg => arg.startsWith('--plugin-preload-path='));
  if (preloadArg) {
    const pluginPreloadPath = preloadArg.replace('--plugin-preload-path=', '');
    if (fs.existsSync(pluginPreloadPath)) {
      const pluginDir = path.dirname(pluginPreloadPath);
      const nodeModulesPath = path.join(pluginDir, 'node_modules');
      if (fs.existsSync(nodeModulesPath)) {
        module.paths.unshift(nodeModulesPath);
      }
      require(pluginPreloadPath);
    }
  }
} catch (e) {
  // Loading plugin custom preload failed, but does not affect main process functionality
  console.error('Failed to load plugin custom preload:', e);
} 