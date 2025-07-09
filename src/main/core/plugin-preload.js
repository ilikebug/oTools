const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');


console.log('plugin-preload.js loaded');

const allowedMethods = [
  'captureScreen',
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
      require(pluginPreloadPath);
    }
  }
} catch (e) {
  // Loading plugin custom preload failed, but does not affect main process functionality
  console.error('Failed to load plugin custom preload:', e);
} 