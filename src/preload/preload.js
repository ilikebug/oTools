// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('oToolsAPI', {
  // 插件相关
  getPlugins: () => ipcRenderer.invoke('get-plugins'),
  executePlugin: (pluginName, ...args) => ipcRenderer.invoke('execute-plugin', pluginName, ...args),
  
  // OCR功能
  performOCR: (imagePath) => ipcRenderer.invoke('perform-ocr', imagePath),
  
  // 截图功能
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  
  // 剪贴板功能
  getClipboard: () => ipcRenderer.invoke('get-clipboard'),
  setClipboard: (text) => ipcRenderer.invoke('set-clipboard', text),
  clearClipboard: () => ipcRenderer.invoke('clear-clipboard'),
  
  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  
  // 文件操作
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // 事件监听
  onPluginsChanged: (callback) => {
    ipcRenderer.on('plugins-changed', (event, plugins) => callback(plugins));
  }
});
