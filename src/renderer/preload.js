// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

const allowedMethods = [
  // App status
  'getAppStatus',
  
  // Config management
  'getConfig',
  'setConfig',
  
  // Plugin related
  'getPlugins',
  'getPluginNames',
  'executePlugin',
  'showPluginWindow',
  'setPluginConfig',
  'uninstallPlugin',
  
  // Custom shortcuts
  'getCustomShortcuts',
  'setCustomShortcuts',
  
  // Event listeners
  'onPluginsChanged',
  
  // Refresh shortcut
  'refreshShortcut',

  // Open plugin market
  'openPluginMarket',
  'downloadPlugin',
  'onDownloadPluginResult',

  // Show system notification
  'showSystemNotification',
  
  // Quit application
  'quitApp',
];

const otools = {};
for (const method of allowedMethods) {
  otools[method] = (...args) => ipcRenderer.invoke('otools-function', method, ...args);
}

contextBridge.exposeInMainWorld('otools', otools);

contextBridge.exposeInMainWorld('events', {
  onAppInitCompleted: (callback) => {
    ipcRenderer.on('app-init-completed', () => callback());
  },

  onPluginsChanged: (callback) => {
    ipcRenderer.on('plugins-changed', (event, plugins) => callback(plugins));
  },

  onDownloadPluginResult: (callback) => {
    ipcRenderer.on('download-plugin-result', (event, data) => callback(data));
  },
});