// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('oToolsAPI', {
  // 应用状态相关
  getAppStatus: () => ipcRenderer.invoke('get-app-status'),
  getPerformanceStats: () => ipcRenderer.invoke('get-performance-stats'),
  getErrorStats: () => ipcRenderer.invoke('get-error-stats'),
  
  // 配置管理
  getConfig: (configName) => ipcRenderer.invoke('get-config', configName),
  setConfig: (configName, config) => ipcRenderer.invoke('set-config', configName, config),
  
  // 插件相关
  getPlugins: () => ipcRenderer.invoke('get-plugins'),
  executePlugin: (pluginName, ...args) => ipcRenderer.invoke('execute-plugin', pluginName, ...args),
  startPlugin: (pluginName) => ipcRenderer.invoke('start-plugin', pluginName),
  stopPlugin: (pluginName) => ipcRenderer.invoke('stop-plugin', pluginName),
  getRunningPlugins: () => ipcRenderer.invoke('get-running-plugins'),
  
  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  
  // 文件操作
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  saveImage: (imageBase64) => ipcRenderer.invoke('save-image', imageBase64),
  
  // 系统功能
  newScreenshot: () => ipcRenderer.invoke('new-screenshot'),
  closeResultWindow: () => ipcRenderer.invoke('close-result-window'),
  
  // 通用invoke方法
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  
  // 事件监听
  onPluginsChanged: (callback) => {
    ipcRenderer.on('plugins-changed', (event, plugins) => callback(plugins));
  },
  
  // 移除事件监听器
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// 为结果展示界面暴露专门的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 接收结果数据
  onResultData: (callback) => {
    ipcRenderer.on('result-data', (event, data) => callback(data));
  },
  
  // 接收插件数据
  onPluginData: (callback) => {
    ipcRenderer.on('plugin-data', (event, data) => callback(data));
  },
  
  // 保存图片
  saveImage: (imageBase64) => ipcRenderer.invoke('save-image', imageBase64),
  
  // 重新截图
  newScreenshot: () => ipcRenderer.invoke('new-screenshot'),
  
  // 关闭结果窗口
  closeResultWindow: () => ipcRenderer.invoke('close-result-window'),
  
  // 打开外部链接
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // 通用invoke方法
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
});

// 为插件进程暴露API
contextBridge.exposeInMainWorld('pluginAPI', {
  // 发送消息到主进程
  sendMessage: (message) => ipcRenderer.invoke('plugin-message', message),
  
  // 调用主进程API
  callAPI: (apiName, ...args) => ipcRenderer.invoke('api_call', apiName, args),
  
  // 显示HTML窗口
  showHtmlWindow: (htmlPath, data, windowOptions) => 
    ipcRenderer.invoke('show_html_window', htmlPath, data, windowOptions),
  
  // 日志记录
  log: (message, level = 'info') => ipcRenderer.invoke('plugin_log', message, level),
  
  // 错误报告
  reportError: (error, context) => ipcRenderer.invoke('plugin_error', error, context),
  
  // 获取插件配置
  getConfig: () => ipcRenderer.invoke('plugin_get_config'),
  
  // 设置插件配置
  setConfig: (config) => ipcRenderer.invoke('plugin_set_config', config)
});

// 错误处理
window.addEventListener('error', (event) => {
  console.error('渲染进程错误:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的Promise拒绝:', event.reason);
});
