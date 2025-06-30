const { ipcMain, dialog, shell, BrowserWindow, app } = require('electron');
const path = require('path');
const { MessageBuilder, MessageType } = require('../plugin-manager/message-protocol');

// 全局变量存储结果窗口
let resultWindow = null;
let pluginsDir = null;

/**
 * 设置IPC通信
 * @param {BrowserWindow} mainWindow 主窗口
 * @param {AppManager} appManager 应用管理器
 */
function setupIPC(mainWindow, appManager) {
  const logger = appManager.getComponent('logger');
  const configManager = appManager.getComponent('configManager');
  const performanceMonitor = appManager.getComponent('performanceMonitor');
  const errorHandler = appManager.getComponent('errorHandler');
  
  // 设置插件目录路径
  pluginsDir = path.join(__dirname, '..', '..', '..', 'plugins');
  
  logger.log('IPC通信模块初始化开始');

  // 插件相关IPC处理
  setupPluginIPC(mainWindow, appManager);
  
  // 窗口控制IPC处理
  setupWindowIPC(mainWindow, appManager);
  
  // 文件操作IPC处理
  setupFileIPC(mainWindow, appManager);
  
  // 系统功能IPC处理
  setupSystemIPC(mainWindow, appManager);
  
  // 结果窗口管理
  setupResultWindowIPC(mainWindow, appManager);

  logger.log('IPC通信模块初始化完成');
  
  // 返回结果窗口管理器
  return { showResultWindow, showHtmlWindow };
}

/**
 * 设置插件相关IPC处理
 */
function setupPluginIPC(mainWindow, appManager) {
  const logger = appManager.getComponent('logger');
  const performanceMonitor = appManager.getComponent('performanceMonitor');
  const errorHandler = appManager.getComponent('errorHandler');
  const pluginManager = appManager.getComponent('pluginManager')

  // 获取插件列表
  ipcMain.handle('get-plugins', async () => {
    try {
      performanceMonitor.startTimer('get_plugins');
      
      const plugins = await pluginManager.getPluginsList();
      
      performanceMonitor.endTimer('get_plugins');
      return plugins;
    } catch (error) {
      await errorHandler.handleError(error, { operation: 'get_plugins' });
      return [];
    }
  });

  // 执行插件
  ipcMain.handle('execute-plugin', async (event, pluginName, ...args) => {
    try {
      performanceMonitor.startTimer('execute_plugin', pluginName);
      // 在执行插件前隐藏主窗口
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
        logger.log(`执行插件 ${pluginName} 前隐藏主窗口`);
      }
      
      const result = await pluginManager.executePlugin(pluginName, 'default', ...args);
      
      performanceMonitor.endTimer('execute_plugin', pluginName, { success: true });
      
      return {
        success: true,
        result: result,
        message: `插件 ${pluginName} 执行成功`
      };
    } catch (error) {
      performanceMonitor.endTimer('execute_plugin', pluginName, { success: false, error: error.message });
      await errorHandler.handleError(error, { 
        pluginName, 
        operation: 'execute_plugin',
        args 
      });
      
      return {
        success: false,
        result: null,
        message: error.message
      };
    }
  });

  // 插件进程管理
  ipcMain.handle('start-plugin', async (event, pluginName) => {
    try {
      await pluginManager.startPlugin(pluginName);
      return { success: true, message: `插件 ${pluginName} 启动成功` };
    } catch (error) {
      await errorHandler.handleError(error, { pluginName, operation: 'start_plugin' });
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('stop-plugin', async (event, pluginName) => {
    try {
      await pluginManager.stopPlugin(pluginName);
      return { success: true, message: `插件 ${pluginName} 停止成功` };
    } catch (error) {
      await errorHandler.handleError(error, { pluginName, operation: 'stop_plugin' });
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('get-running-plugins', () => {
    return pluginManager.getPoolStatus();
  });
}

/**
 * 设置窗口控制IPC处理
 */
function setupWindowIPC(mainWindow, appManager) {
  const logger = appManager.getComponent('logger');

  ipcMain.handle('minimize-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });
  
  ipcMain.handle('close-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  ipcMain.handle('show-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/**
 * 设置文件操作IPC处理
 */
function setupFileIPC(mainWindow, appManager) {
  const logger = appManager.getComponent('logger');
  const errorHandler = appManager.getComponent('errorHandler');

  ipcMain.handle('open-file-dialog', async (event, options = {}) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'gif'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        ...options
      });
      return result;
    } catch (error) {
      await errorHandler.handleError(error, { operation: 'open_file_dialog' });
      return { canceled: true, error: error.message };
    }
  });

  ipcMain.handle('open-external', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      await errorHandler.handleError(error, { operation: 'open_external', url });
      return { success: false, error: error.message };
    }
  });

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
      await errorHandler.handleError(error, { operation: 'save_image' });
      return {
        success: false,
        message: error.message
      };
    }
  });
}

/**
 * 设置系统功能IPC处理
 */
function setupSystemIPC(mainWindow, appManager) {
  const performanceMonitor = appManager.getComponent('performanceMonitor');
  const errorHandler = appManager.getComponent('errorHandler');
  const configManager = appManager.getComponent('configManager');

  // 获取应用状态
  ipcMain.handle('get-app-status', () => {
    return appManager.getAppStatus();
  });

  // 获取性能统计
  ipcMain.handle('get-performance-stats', () => {
    return performanceMonitor.getPerformanceStats();
  });

  // 获取错误统计
  ipcMain.handle('get-error-stats', () => {
    return errorHandler.getErrorStats();
  });

  // 获取配置信息
  ipcMain.handle('get-config', (event, configName) => {
    return configManager.getConfig(configName);
  });

  // 设置配置
  ipcMain.handle('set-config', async (event, configName, config) => {
    try {
      configManager.setConfig(configName, config);
      return { success: true, message: '配置更新成功' };
    } catch (error) {
      await errorHandler.handleError(error, { operation: 'set_config', configName });
      return { success: false, message: error.message };
    }
  });

  // 重新截图
  ipcMain.handle('new-screenshot', async () => {
    try {
      // 关闭当前结果窗口
      if (resultWindow && !resultWindow.isDestroyed()) {
        resultWindow.close();
      }
      
      // 重新执行截图OCR
      const macTools = require('../utils/mac-tools');
      const macToolsInstance = new macTools();
      
      const imageBuffer = await macToolsInstance.captureScreenRegion();
      const ocrResult = await macToolsInstance.performOCR(imageBuffer);
      
      // 显示新的结果窗口
      showResultWindow(
        imageBuffer.toString('base64'),
        ocrResult,
        'screenshot-ocr'
      );
      
      return {
        success: true,
        message: '重新截图成功'
      };
    } catch (error) {
      await errorHandler.handleError(error, { operation: 'new_screenshot' });
      return {
        success: false,
        message: error.message
      };
    }
  });

  // 关闭结果窗口
  ipcMain.handle('close-result-window', () => {
    if (resultWindow && !resultWindow.isDestroyed()) {
      resultWindow.close();
    }
    return { success: true };
  });
}

/**
 * 设置结果窗口管理IPC
 */
function setupResultWindowIPC(mainWindow, appManager) {
  const logger = appManager.getComponent('logger');
  const errorHandler = appManager.getComponent('errorHandler');

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
      logger.log(`HTML文件不存在: ${htmlPath}`, 'warn');
      // 回退到默认页面
      htmlPath = path.join(__dirname, '../../renderer/result-viewer.html');
    }

    logger.log(`加载结果窗口HTML: ${htmlPath}`);

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
   * 显示结果窗口（供外部调用）
   */
  function showResultWindow(imageData, text, pluginName = null, pluginConfig = null) {
    try {
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
      
      logger.log(`结果窗口已显示: ${pluginName || 'default'}`);
    } catch (error) {
      errorHandler.handleError(error, { 
        operation: 'show_result_window', 
        pluginName 
      });
    }
  }

  /**
   * 通用显示HTML窗口（供插件调用）
   */
  function showHtmlWindow(htmlPath, data = {}, windowOptions = {}) {
    try {
      const BrowserWindow = require('electron').BrowserWindow;
      const fs = require('fs');
      let fullHtmlPath = htmlPath;
      // 如果不是绝对路径，则从插件目录查找
      if (!path.isAbsolute(htmlPath)) {
        // 默认插件目录
        const pluginsDir = path.join(__dirname, '../../plugins');
        // 尝试查找所有插件目录下的 htmlPath
        const pluginDirs = fs.readdirSync(pluginsDir).filter(f => 
          fs.statSync(path.join(pluginsDir, f)).isDirectory()
        );
        
        for (const dir of pluginDirs) {
          const candidate = path.join(pluginsDir, dir, htmlPath);
          if (fs.existsSync(candidate)) {
            fullHtmlPath = candidate;
            break;
          }
        }
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
      
      logger.log(`HTML窗口已显示: ${fullHtmlPath}`);
      return win;
    } catch (error) {
      errorHandler.handleError(error, { 
        operation: 'show_html_window', 
        htmlPath 
      });
    }
  }

  // 将函数绑定到全局作用域
  global.showResultWindow = showResultWindow;
  global.showHtmlWindow = showHtmlWindow;
}

module.exports = setupIPC; 