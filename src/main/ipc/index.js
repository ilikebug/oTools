const { ipcMain, dialog, shell, BrowserWindow } = require('electron');
const MacTools = require('../utils/mac-tools');
const path = require('path');

// 创建MacTools实例
const macTools = new MacTools();

// 全局变量存储结果窗口
let resultWindow = null;
let pluginsDir = null;

function setupIPC(mainWindow, pluginManager, pluginProcessManager) {
  // 设置插件目录路径
  pluginsDir = path.join(__dirname, '..', '..', '..', 'plugins');
  
  ipcMain.handle('get-plugins', () => {
    return pluginManager.getPluginsList();
  });
  
  ipcMain.handle('execute-plugin', async (event, pluginName, ...args) => {
    try {
      // 在执行插件前隐藏主窗口
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
        console.log(`[IPC] 执行插件 ${pluginName} 前隐藏主窗口`);
      }
      
      return await pluginManager.executePlugin(pluginName, ...args);
    } catch (error) {
      return {
        success: false,
        result: null,
        message: error.message
      };
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

  // 结果展示窗口管理
  /**
   * 创建结果展示窗口
   */
  function createResultWindow(pluginName = null, pluginConfig = null) {
    if (resultWindow && !resultWindow.isDestroyed()) {
      resultWindow.focus();
      return resultWindow;
    }

    // 确定窗口配置
    let windowConfig = {
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      title: '结果 - oTools',
      icon: path.join(__dirname, '../../renderer/assets/icon.png'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload.js')
      },
      show: false,
      resizable: true,
      maximizable: true,
      minimizable: true,
      closable: true
    };

    // 如果提供了插件配置，使用插件的UI配置
    if (pluginConfig && pluginConfig.ui) {
      windowConfig = {
        ...windowConfig,
        width: pluginConfig.ui.width || 1200,
        height: pluginConfig.ui.height || 800,
        minWidth: pluginConfig.ui.minWidth || 800,
        minHeight: pluginConfig.ui.minHeight || 600,
        title: pluginConfig.ui.title || '结果 - oTools'
      };
    }

    resultWindow = new BrowserWindow(windowConfig);

    // 确定要加载的HTML文件路径
    let htmlPath;
    if (pluginConfig && pluginConfig.ui && pluginConfig.ui.html) {
      // 从插件目录加载HTML文件
      htmlPath = path.join(pluginsDir, pluginName, pluginConfig.ui.html);
    }

    // 检查HTML文件是否存在
    if (!require('fs').existsSync(htmlPath)) {
      console.error(`HTML文件不存在: ${htmlPath}`);
      // 回退到默认页面
      htmlPath = path.join(__dirname, '../../renderer/result-viewer.html');
    }

    console.log(`加载结果窗口HTML: ${htmlPath}`);

    // 加载结果展示页面
    resultWindow.loadFile(htmlPath);

    // 窗口准备好后显示
    resultWindow.once('ready-to-show', () => {
      resultWindow.show();
    });

    // 窗口关闭时清理引用
    resultWindow.on('closed', () => {
      resultWindow = null;
    });

    return resultWindow;
  }

  /**
   * 保存图片到本地
   */
  ipcMain.handle('save-image', async (event, imageBase64) => {
    try {
      const result = await dialog.showSaveDialog(resultWindow || mainWindow, {
        title: '保存截图',
        defaultPath: `screenshot_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`,
        filters: [
          { name: 'PNG图片', extensions: ['png'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
        const fs = require('fs');
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        fs.writeFileSync(result.filePath, imageBuffer);
        
        return {
          success: true,
          message: '图片保存成功',
          filePath: result.filePath
        };
      }
      
      return {
        success: false,
        message: '用户取消保存'
      };
    } catch (error) {
      console.error('保存图片失败:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });

  /**
   * 重新截图
   */
  ipcMain.handle('new-screenshot', async () => {
    try {
      // 关闭当前结果窗口
      if (resultWindow && !resultWindow.isDestroyed()) {
        resultWindow.close();
      }

      // 执行新的截图和OCR
      const result = await macTools.captureAndOCR();
      
      if (result.success) {
        // 创建新的结果窗口并显示结果
        const newResultWindow = createResultWindow();
        
        // 等待窗口加载完成后发送数据
        newResultWindow.webContents.once('did-finish-load', () => {
          newResultWindow.webContents.send('result-data', {
            imageData: result.imageData,
            text: result.text
          });
        });
        
        return {
          success: true,
          message: '重新截图成功'
        };
      } else {
        return {
          success: false,
          message: result.message
        };
      }
    } catch (error) {
      console.error('重新截图失败:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });

  /**
   * 关闭结果窗口
   */
  ipcMain.handle('close-result-window', () => {
    if (resultWindow && !resultWindow.isDestroyed()) {
      resultWindow.close();
    }
    return { success: true };
  });

  /**
   * 显示结果窗口（供外部调用）
   */
  function showResultWindow(imageData, text, pluginName = null, pluginConfig = null) {
    const window = createResultWindow(pluginName, pluginConfig);
    
    // 等待窗口加载完成后发送数据
    window.webContents.once('did-finish-load', () => {
      window.webContents.send('result-data', {
        imageData: imageData,
        text: text,
        pluginName: pluginName,
        pluginConfig: pluginConfig
      });
    });
  }

  /**
   * 通用显示HTML窗口（供插件调用）
   */
  function showHtmlWindow(htmlPath, data = {}, windowOptions = {}) {
    const BrowserWindow = require('electron').BrowserWindow;
    const path = require('path');
    const fs = require('fs');
    let fullHtmlPath = htmlPath;
    // 如果不是绝对路径，则从插件目录查找
    if (!path.isAbsolute(htmlPath)) {
      // 默认插件目录
      const pluginsDir = path.join(__dirname, '../../plugins');
      // 尝试查找所有插件目录下的 htmlPath
      const pluginDirs = fs.readdirSync(pluginsDir).filter(f => fs.statSync(path.join(pluginsDir, f)).isDirectory());
      for (const dir of pluginDirs) {
        const candidate = path.join(pluginsDir, dir, htmlPath);
        if (fs.existsSync(candidate)) {
          fullHtmlPath = candidate;
          break;
        }
      }
    }
    if (!fs.existsSync(fullHtmlPath)) {
      console.error(`HTML文件不存在: ${fullHtmlPath}`);
      fullHtmlPath = path.join(__dirname, '../../renderer/result-viewer.html');
    }
    const win = new BrowserWindow({
      width: windowOptions.width || 900,
      height: windowOptions.height || 800,
      minWidth: windowOptions.minWidth || 800,
      minHeight: windowOptions.minHeight || 600,
      title: windowOptions.title || '插件窗口',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      ...windowOptions
    });
    win.loadFile(fullHtmlPath);
    win.once('ready-to-show', () => {
      win.show();
    });
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('plugin-data', data);
    });
    win.on('closed', () => {
      // 可选：清理引用
    });
    return win;
  }

  // Mac系统工具功能
  /**
   * 触发Mac系统的区域截图功能
   * @returns {Promise<Object>} 包含截图buffer和状态的对象
   */
  ipcMain.handle('capture-screen-region', async () => {
    try {
      const imageBuffer = await macTools.captureScreenRegion();
      
      // 将Buffer转换为base64字符串以便传输
      const base64Data = imageBuffer.toString('base64');
      
      return {
        success: true,
        data: base64Data,
        message: '区域截图成功'
      };
    } catch (error) {
      console.error('区域截图失败:', error);
      return {
        success: false,
        data: null,
        message: error.message
      };
    }
  });

  /**
   * 对图片进行OCR识别
   * @param {string} imageBase64 - base64编码的图片数据
   * @returns {Promise<Object>} 包含OCR结果的对象
   */
  ipcMain.handle('perform-ocr', async (event, imageBase64) => {
    try {
      console.log('开始OCR识别...');
      
      // 将base64字符串转换回Buffer
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      
      // 执行OCR识别
      const ocrResult = await macTools.performOCR(imageBuffer);
      
      return {
        success: true,
        text: ocrResult,
        message: 'OCR识别成功'
      };
    } catch (error) {
      console.error('OCR识别失败:', error);
      return {
        success: false,
        text: '',
        message: error.message
      };
    }
  });

  /**
   * 截图并立即进行OCR识别（组合功能）
   * @returns {Promise<Object>} 包含截图和OCR结果的对象
   */
  ipcMain.handle('capture-and-ocr', async () => {
    try {      
      // 先进行区域截图
      const imageBuffer = await macTools.captureScreenRegion();

      // 对截图进行OCR识别
      const ocrResult = await macTools.performOCR(imageBuffer);
      
      // 将Buffer转换为base64字符串
      const base64Data = imageBuffer.toString('base64');
      
      return {
        success: true,
        imageData: base64Data,
        text: ocrResult,
        message: '截图并OCR识别成功'
      };
    } catch (error) {
      console.error('截图并OCR识别失败:', error);
      return {
        success: false,
        imageData: null,
        text: '',
        message: error.message
      };
    }
  });

  /**
   * 清理临时文件
   */
  ipcMain.handle('cleanup-temp-files', () => {
    try {
      macTools.cleanup();
      return {
        success: true,
        message: '临时文件清理成功'
      };
    } catch (error) {
      console.error('清理临时文件失败:', error);
      return {
        success: false,
        message: error.message
      };
    }
  });

  // 返回showResultWindow函数供外部使用
  return { showResultWindow, showHtmlWindow };
}

module.exports = setupIPC; 