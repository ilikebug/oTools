// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');


// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('oToolsAPI', {
  // 插件相关
  getPlugins: () => ipcRenderer.invoke('get-plugins'),
  executePlugin: (pluginName, ...args) => ipcRenderer.invoke('execute-plugin', pluginName, ...args),
  
  // 文件操作
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Mac系统工具功能
  captureScreenRegion: () => ipcRenderer.invoke('capture-screen-region'),
  performOCR: (imageBase64) => ipcRenderer.invoke('perform-ocr', imageBase64),
  captureAndOCR: () => ipcRenderer.invoke('capture-and-ocr'),
  cleanupTempFiles: () => ipcRenderer.invoke('cleanup-temp-files'),

  // 通用invoke方法
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  
  // 事件监听
  onPluginsChanged: (callback) => {
    ipcRenderer.on('plugins-changed', (event, plugins) => callback(plugins));
  }
});

// 为结果展示界面暴露专门的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 接收结果数据
  onResultData: (callback) => {
    ipcRenderer.on('result-data', (event, data) => callback(data));
  },
  
  // 保存图片
  saveImage: (imageBase64) => ipcRenderer.invoke('save-image', imageBase64),
  
  // 重新截图
  newScreenshot: () => ipcRenderer.invoke('new-screenshot'),
  
  // 关闭结果窗口
  closeResultWindow: () => ipcRenderer.invoke('close-result-window')
});
