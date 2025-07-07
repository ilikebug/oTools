// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

// Expose secure APIs to the renderer process
contextBridge.exposeInMainWorld('mainWindow', {
  // App status
  getAppStatus: () => ipcRenderer.invoke('get-app-status'),
  
  // Config management
  getConfig: (configName) => ipcRenderer.invoke('get-config', configName),
  setConfig: (configName, config) => ipcRenderer.invoke('set-config', configName, config),
  getConfigNames: () => ipcRenderer.invoke('get-config-names'),
  
  // Plugin related
  getPlugins: () => ipcRenderer.invoke('get-plugins'),
  getPluginNames: () => ipcRenderer.invoke('get-plugin-names'),
  executePlugin: (pluginName, ...args) => ipcRenderer.invoke('execute-plugin', pluginName, ...args),
  startPlugin: (pluginName) => ipcRenderer.invoke('start-plugin', pluginName),
  stopPlugin: (pluginName) => ipcRenderer.invoke('stop-plugin', pluginName),
  showPluginWindow: (pluginName) => ipcRenderer.invoke('show-plugin-window-by-name', pluginName),
  hidePluginWindow: (pluginName) => ipcRenderer.invoke('hide-plugin-window-by-name', pluginName),
  togglePluginWindow: (pluginName) => ipcRenderer.invoke('toggle-plugin-window-by-name', pluginName),
  getPluginWindowStatus: (pluginName) => ipcRenderer.invoke('get-plugin-window-status', pluginName),
  setPluginConfig: (pluginName, config) => ipcRenderer.invoke('set-plugin-config', pluginName, config),
  uninstallPlugin: (pluginName, removeFiles = true) => ipcRenderer.invoke('uninstall-plugin', pluginName, removeFiles),
  
  // Custom shortcuts
  getCustomShortcuts: () => ipcRenderer.invoke('get-custom-shortcuts'),
  setCustomShortcuts: (shortcuts) => ipcRenderer.invoke('set-custom-shortcuts', shortcuts),
  
  // Event listeners
  onPluginsChanged: (callback) => {
    ipcRenderer.on('plugins-changed', (event, plugins) => callback(plugins));
  },
  
  onAppInitCompleted: (callback) => {
    ipcRenderer.on('app-init-completed', () => callback());
  },
  
  // Refresh shortcut
  refreshShortcut: () => ipcRenderer.invoke('refresh-shortcut'),
  
  // Show system notification
  showSystemNotification: (title, body) => {
    ipcRenderer.send('show-system-notification', { title, body });
  },

  // Open plugin market
  openPluginMarket: () => {
    ipcRenderer.send('open-plugin-market');
  },
  downloadPlugin: ({folder, name}) => {
    ipcRenderer.send('download-plugin', {folder, name});
  },
  onDownloadPluginResult: (callback) => {
    ipcRenderer.on('download-plugin-result', (event, data) => callback(data));
  },

  // Quit application
  quitApp: () => {
    ipcRenderer.send('quit-app');
  },

});