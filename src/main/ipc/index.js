const { ipcMain, dialog, shell } = require('electron');

function setupIPC(mainWindow, pluginManager, pluginProcessManager) {
  ipcMain.handle('get-plugins', () => {
    return pluginManager.getPluginsList();
  });
  
  ipcMain.handle('execute-plugin', async (event, pluginName, ...args) => {
    try {
      return await pluginManager.executePlugin(pluginName, ...args);
    } catch (error) {
      return {
        success: false,
        result: null,
        message: error.message
      };
    }
  });

  // OCR功能 - 通过插件进程调用
  ipcMain.handle('perform-ocr', async (event, imagePath) => {
    try {
      return await pluginProcessManager.executePlugin('OCR文字识别', 'performOCR', imagePath);
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'OCR功能调用失败'
      };
    }
  });

  // 截图功能 - 通过插件进程调用
  ipcMain.handle('take-screenshot', async () => {
    try {
      return await pluginProcessManager.executePlugin('屏幕截图', 'takeScreenshot');
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: '截图功能调用失败'
      };
    }
  });

  // 剪贴板功能 - 通过插件进程调用
  ipcMain.handle('get-clipboard', async () => {
    try {
      const result = await pluginProcessManager.executePlugin('剪贴板管理', 'getClipboard');
      return result.success ? result.text : '';
    } catch (error) {
      console.error('获取剪贴板失败:', error);
      return '';
    }
  });

  ipcMain.handle('set-clipboard', async (event, text) => {
    try {
      const result = await pluginProcessManager.executePlugin('剪贴板管理', 'setClipboard', text);
      return result.success;
    } catch (error) {
      console.error('设置剪贴板失败:', error);
      return false;
    }
  });

  ipcMain.handle('clear-clipboard', async () => {
    try {
      const result = await pluginProcessManager.executePlugin('剪贴板管理', 'clearClipboard');
      return result.success;
    } catch (error) {
      console.error('清空剪贴板失败:', error);
      return false;
    }
  });

  // 窗口控制
  ipcMain.handle('minimize-window', (event, mainWindow) => { 
    if (mainWindow) mainWindow.minimize(); 
  });
  
  ipcMain.handle('close-window', (event, mainWindow) => { 
    if (mainWindow) mainWindow.hide(); 
  });

  // 文件操作
  ipcMain.handle('open-file-dialog', async (event, mainWindow) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'gif'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    return result;
  });

  ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
  });

  // 插件进程管理
  ipcMain.handle('start-plugin', (event, dir) => {
    pluginProcessManager.startPlugin(dir);
    return true;
  });

  ipcMain.handle('stop-plugin', (event, name) => {
    pluginProcessManager.stopPlugin(name);
    return true;
  });

  ipcMain.handle('get-running-plugins', () => {
    return pluginProcessManager.getRunningPlugins();
  });
}

module.exports = setupIPC; 