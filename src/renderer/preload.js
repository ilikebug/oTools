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


});

contextBridge.exposeInMainWorld('otools', {
  // General invoke method
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  // Screenshot and OCR operations
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  performOcr: (imageData) => ipcRenderer.invoke('perform-ocr', imageData),
  captureAndOcr: () => ipcRenderer.invoke('capture-and-ocr'),

  // File dialog operations
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

  // Clipboard operations
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  writeClipboard: (text) => ipcRenderer.invoke('write-clipboard', text),
  readClipboardImage: () => ipcRenderer.invoke('read-clipboard-image'),
  writeClipboardImage: (imageData) => ipcRenderer.invoke('write-clipboard-image', imageData),



  // System operations
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Window operations
  getWindowInfo: () => ipcRenderer.invoke('get-window-info'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),

  // System information
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getProcessInfo: () => ipcRenderer.invoke('get-process-info'),

  // File system operations
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  createDirectory: (dirPath) => ipcRenderer.invoke('create-directory', dirPath),
  listDirectory: (dirPath) => ipcRenderer.invoke('list-directory', dirPath),
  getFileInfo: (filePath) => ipcRenderer.invoke('get-file-info', filePath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  copyFile: (sourcePath, destPath) => ipcRenderer.invoke('copy-file', sourcePath, destPath),
  moveFile: (sourcePath, destPath) => ipcRenderer.invoke('move-file', sourcePath, destPath),

  // Database operations (simple key-value storage)
  setDbValue: (key, value) => ipcRenderer.invoke('set-db-value', key, value),
  getDbValue: (key) => ipcRenderer.invoke('get-db-value', key),
  deleteDbValue: (key) => ipcRenderer.invoke('delete-db-value', key),

  // Screen and display operations
  getScreenInfo: () => ipcRenderer.invoke('get-screen-info'),

  // Crypto operations
  hashString: (algorithm, data) => ipcRenderer.invoke('hash-string', algorithm, data),
  generateUuid: () => ipcRenderer.invoke('generate-uuid'),
  encryptText: (text, password) => ipcRenderer.invoke('encrypt-text', text, password),
  decryptText: (encrypted, password, iv) => ipcRenderer.invoke('decrypt-text', encrypted, password, iv),

  // Time and date operations
  getCurrentTime: () => ipcRenderer.invoke('get-current-time'),
  formatDate: (timestamp, format) => ipcRenderer.invoke('format-date', timestamp, format),

  // Text processing operations
  textToBase64: (text) => ipcRenderer.invoke('text-to-base64', text),
  base64ToText: (base64) => ipcRenderer.invoke('base64-to-text', base64),
  generateRandomString: (length, charset) => ipcRenderer.invoke('generate-random-string', length, charset),
  
  // File compression utilities
  compressFile: (sourcePath, destPath) => ipcRenderer.invoke('compress-file', sourcePath, destPath),
  decompressFile: (sourcePath, destPath) => ipcRenderer.invoke('decompress-file', sourcePath, destPath)
})