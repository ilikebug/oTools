const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onPluginExecute: (callback) => {
    ipcRenderer.on('plugin-execute', (event, data) => callback(data.action, data.args));
  },
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  showPluginWindow: () => ipcRenderer.invoke('show-plugin-window')
});

contextBridge.exposeInMainWorld('ocrAPI', {
  onPluginData: (callback) => {
    ipcRenderer.on('plugin-data', (event, ...args) => callback(...args));
  },
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
}); 