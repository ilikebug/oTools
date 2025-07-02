// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

// Expose secure APIs to the renderer process
contextBridge.exposeInMainWorld('oToolsAPI', {
  // App status
  getAppStatus: () => ipcRenderer.invoke('get-app-status'),
  
  // Config management
  getConfig: (configName) => ipcRenderer.invoke('get-config', configName),
  setConfig: (configName, config) => ipcRenderer.invoke('set-config', configName, config),
  
  // Plugin related
  getPlugins: () => ipcRenderer.invoke('get-plugins'),
  executePlugin: (pluginName, ...args) => ipcRenderer.invoke('execute-plugin', pluginName, ...args),
  startPlugin: (pluginName) => ipcRenderer.invoke('start-plugin', pluginName),
  stopPlugin: (pluginName) => ipcRenderer.invoke('stop-plugin', pluginName),
  
  // Event listeners
  onPluginsChanged: (callback) => {
    ipcRenderer.on('plugins-changed', (event, plugins) => callback(plugins));
  },
  
  // Refresh shortcut
  refreshShortcut: () => ipcRenderer.invoke('refresh-shortcut'),
  
  // Show system notification
  showSystemNotification: (title, body) => {
    ipcRenderer.send('show-system-notification', { title, body });
  },

  // Receive result data
  onResultData: (callback) => {
    ipcRenderer.on('result-data', (event, data) => callback(data));
  },

  // General invoke method
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});
