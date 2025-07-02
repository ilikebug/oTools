// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

// Expose secure APIs to the renderer process
contextBridge.exposeInMainWorld('oToolsAPI', {
  // App status
  getAppStatus: () => ipcRenderer.invoke('get-app-status'),
  getPerformanceStats: () => ipcRenderer.invoke('get-performance-stats'),
  getErrorStats: () => ipcRenderer.invoke('get-error-stats'),
  
  // Config management
  getConfig: (configName) => ipcRenderer.invoke('get-config', configName),
  setConfig: (configName, config) => ipcRenderer.invoke('set-config', configName, config),
  
  // Plugin related
  getPlugins: () => ipcRenderer.invoke('get-plugins'),
  executePlugin: (pluginName, ...args) => ipcRenderer.invoke('execute-plugin', pluginName, ...args),
  startPlugin: (pluginName) => ipcRenderer.invoke('start-plugin', pluginName),
  stopPlugin: (pluginName) => ipcRenderer.invoke('stop-plugin', pluginName),
  getRunningPlugins: () => ipcRenderer.invoke('get-running-plugins'),
  
  // Window control
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  
  // File operations
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  saveImage: (imageBase64) => ipcRenderer.invoke('save-image', imageBase64),
  
  // System features
  newScreenshot: () => ipcRenderer.invoke('new-screenshot'),
  closeResultWindow: () => ipcRenderer.invoke('close-result-window'),
  
  // General invoke method
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  
  // Event listeners
  onPluginsChanged: (callback) => {
    ipcRenderer.on('plugins-changed', (event, plugins) => callback(plugins));
  },
  
  // Remove event listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
  
  refreshShortcut: () => ipcRenderer.invoke('refresh-shortcut'),
});

// Expose dedicated API for result display page
contextBridge.exposeInMainWorld('electronAPI', {
  // Receive result data
  onResultData: (callback) => {
    ipcRenderer.on('result-data', (event, data) => callback(data));
  },
  
  // Receive plugin data
  onPluginData: (callback) => {
    ipcRenderer.on('plugin-data', (event, data) => callback(data));
  },
  
  // Save image
  saveImage: (imageBase64) => ipcRenderer.invoke('save-image', imageBase64),
  
  // New screenshot
  newScreenshot: () => ipcRenderer.invoke('new-screenshot'),
  
  // Close result window
  closeResultWindow: () => ipcRenderer.invoke('close-result-window'),
  
  // Open external link
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // General invoke method
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});

// Expose API for plugin process
contextBridge.exposeInMainWorld('pluginAPI', {
  // Send message to main process
  sendMessage: (message) => ipcRenderer.invoke('plugin-message', message),
  
  // Call main process API
  callAPI: (apiName, ...args) => ipcRenderer.invoke('api_call', apiName, args),
  
  // Show HTML window
  showHtmlWindow: (htmlPath, data, windowOptions) => 
    ipcRenderer.invoke('show_html_window', htmlPath, data, windowOptions),
  
  // Logging
  log: (message, level = 'info') => ipcRenderer.invoke('plugin_log', message, level),
  
  // Error reporting
  reportError: (error, context) => ipcRenderer.invoke('plugin_error', error, context),
  
  // Get plugin config
  getConfig: () => ipcRenderer.invoke('plugin_get_config'),
  
  // Set plugin config
  setConfig: (config) => ipcRenderer.invoke('plugin_set_config', config)
});

// Error handling
window.addEventListener('error', (event) => {
  console.error('Renderer process error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise rejection:', event.reason);
});
