// 插件管理器，负责插件扫描、元信息读取、热加载等
const path = require('node:path');
const fs = require('fs');
const chokidar = require('chokidar');

class PluginManager {
  constructor(mainWindow, pluginProcessManager) {
    this.plugins = new Map();
    this.pluginsDir = path.join(__dirname, '..', '..', '..', 'plugins');
    this.watcher = null;
    this.mainWindow = mainWindow;
    this.pluginProcessManager = pluginProcessManager;
    this.resultWindowManager = null;
    this.init();
  }

  init() {
    this.loadPlugins();
    this.watchPlugins();
  }

  // 设置结果窗口管理器
  setResultWindowManager(resultWindowManager) {
    this.resultWindowManager = resultWindowManager;
    console.log('[插件管理器] 结果窗口管理器已设置');
  }

  // 显示结果窗口
  showResultWindow(imageData, text, pluginName = null) {
    if (this.resultWindowManager && this.resultWindowManager.showResultWindow) {
      // 获取插件配置
      let pluginConfig = null;
      if (pluginName && this.plugins.has(pluginName)) {
        pluginConfig = this.plugins.get(pluginName);
      }
      
      this.resultWindowManager.showResultWindow(imageData, text, pluginName, pluginConfig);
      return true;
    }
    console.warn('[插件管理器] 结果窗口管理器未设置或不可用');
    return false;
  }

  // 通用显示HTML窗口
  showHtmlWindow(htmlPath, data = {}, windowOptions = {}) {
    if (this.resultWindowManager && this.resultWindowManager.showHtmlWindow) {
      this.resultWindowManager.showHtmlWindow(htmlPath, data, windowOptions);
      return true;
    }
    console.warn('[插件管理器] 结果窗口管理器未设置或不可用');
    return false;
  }

  loadPlugins() {
    try {
      if (!fs.existsSync(this.pluginsDir)) {
        fs.mkdirSync(this.pluginsDir, { recursive: true });
        return;
      }
      const files = fs.readdirSync(this.pluginsDir);
      files.forEach(file => {
        const fullPath = path.join(this.pluginsDir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          const metaPath = path.join(fullPath, 'plugin.json');
          if (fs.existsSync(metaPath)) {
            try {
              const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
              this.plugins.set(meta.name, {
                ...meta,
                dir: fullPath
              });
              console.log(`插件元信息加载成功: ${meta.name}`);
            } catch (e) {
              console.error(`加载插件目录失败 ${fullPath}:`, e);
            }
          }
        }
      });
    } catch (error) {
      console.error('加载插件失败:', error);
    }
  }

  watchPlugins() {
    // 先关闭之前的监听器
    if (this.watcher) {
      this.watcher.close();
    }
    
    this.watcher = chokidar.watch(this.pluginsDir, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true // 忽略初始扫描，避免重复加载
    });
    
    this.watcher
      .on('addDir', (dirPath) => {
        console.log('检测到新插件目录:', dirPath);
        this.loadPlugins();
        this.notifyPluginsChanged();
      })
      .on('unlinkDir', (dirPath) => {
        console.log('检测到插件目录删除:', dirPath);
        this.loadPlugins();
        this.notifyPluginsChanged();
      })
      .on('change', (filePath) => {
        if (filePath.endsWith('plugin.json')) {
          console.log('检测到插件配置变更:', filePath);
          this.loadPlugins();
          this.notifyPluginsChanged();
        }
      });
  }

  notifyPluginsChanged() {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('plugins-changed', this.getPluginsList());
    }
  }

  getPluginsList() {
    return Array.from(this.plugins.values()).map(plugin => ({
      name: plugin.name,
      description: plugin.description,
      version: plugin.version,
      author: plugin.author,
      icon: plugin.icon || 'fas fa-puzzle-piece',
      shortName: plugin.shortName || plugin.name,
      type: plugin.type || 'custom'
    }));
  }

  async executePlugin(pluginName, action = 'default', ...args) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`插件不存在: ${pluginName}`);
    }

    // 在执行插件前隐藏主窗口
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.hide();
      console.log(`[插件管理器] 执行插件 ${pluginName} 前隐藏主窗口`);
    }

    // 通过插件进程管理器执行插件
    if (this.pluginProcessManager) {
      try {
        const result = await this.pluginProcessManager.executePlugin(pluginName, action, ...args);
        return {
          success: true,
          message: `插件 ${pluginName} 执行成功`,
          result: result
        };
      } catch (error) {
        console.error(`插件 ${pluginName} 执行失败:`, error);
        return {
          success: false,
          message: error.message,
          result: null
        };
      }
    } else {
      // 如果没有插件进程管理器，返回模拟结果
      return {
        success: true,
        message: `插件 ${pluginName} 执行成功（模拟）`,
        result: `执行了插件: ${pluginName}, 动作: ${action}`
      };
    }
  }
}

module.exports = PluginManager; 