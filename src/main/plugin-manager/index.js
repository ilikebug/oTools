// 插件管理器，负责插件扫描、元信息读取、热加载等
const path = require('node:path');
const fs = require('fs');
const chokidar = require('chokidar');
const BaseManager = require('../core/base-manager');

class PluginManager extends BaseManager {
  constructor(appManager) {
    super('PluginManager');
    
    this.appManager = appManager;
    this.logger = appManager.getComponent('logger');
    this.configManager = appManager.getComponent('configManager');
    this.errorHandler = appManager.getComponent('errorHandler');
    this.performanceMonitor = appManager.getComponent('performanceMonitor');
    
    this.plugins = new Map();
    this.pluginsDir = path.join(__dirname, '..', '..', '..', 'plugins');
    this.watcher = null;
    this.mainWindow = null;
    this.pluginProcessPool = null;
    this.resultWindowManager = null;
    
    this.logger.log('插件管理器初始化');
  }

  /**
   * 初始化插件管理器
   */
  async initialize(options = {}) {
    try {
      this.performanceMonitor.startTimer('plugin_manager_init');
      
      this.mainWindow = options.mainWindow;
      this.pluginProcessPool = this.appManager.getComponent('pluginProcessPool');
      this.resultWindowManager = options.resultWindowManager;
      
      // 加载插件
      await this.loadPlugins();
      
      // 设置插件监听
      if (options.enableWatch !== false) {
        this.watchPlugins();
      }
      
      this.performanceMonitor.endTimer('plugin_manager_init');
      this.logger.log('插件管理器初始化完成');
      
    } catch (error) {
      await this.errorHandler.handleError(error, { 
        operation: 'plugin_manager_init' 
      });
      throw error;
    }
  }

  /**
   * 销毁插件管理器
   */
  async destroy() {
    try {
      if (this.watcher) {
        this.watcher.close();
        this.watcher = null;
      }
      
      this.plugins.clear();
      this.logger.log('插件管理器已销毁');
      
    } catch (error) {
      await this.errorHandler.handleError(error, { 
        operation: 'plugin_manager_destroy' 
      });
    }
  }

  /**
   * 设置结果窗口管理器
   */
  setResultWindowManager(resultWindowManager) {
    this.resultWindowManager = resultWindowManager;
    this.logger.log('结果窗口管理器已设置');
  }

  /**
   * 显示结果窗口
   */
  showResultWindow(imageData, text, pluginName = null) {
    try {
      if (this.resultWindowManager && this.resultWindowManager.showResultWindow) {
        // 获取插件配置
        let pluginConfig = null;
        if (pluginName && this.plugins.has(pluginName)) {
          pluginConfig = this.plugins.get(pluginName);
        }
        
        this.resultWindowManager.showResultWindow(imageData, text, pluginName, pluginConfig);
        this.logger.log(`结果窗口已显示: ${pluginName || 'default'}`);
        return true;
      }
      
      this.logger.log('结果窗口管理器未设置或不可用', 'warn');
      return false;
      
    } catch (error) {
      this.errorHandler.handleError(error, { 
        operation: 'show_result_window', 
        pluginName 
      });
      return false;
    }
  }

  /**
   * 通用显示HTML窗口
   */
  showHtmlWindow(htmlPath, data = {}, windowOptions = {}) {
    try {
      if (this.resultWindowManager && this.resultWindowManager.showHtmlWindow) {
        this.resultWindowManager.showHtmlWindow(htmlPath, data, windowOptions);
        this.logger.log(`HTML窗口已显示: ${htmlPath}`);
        return true;
      }
      
      this.logger.log('结果窗口管理器未设置或不可用', 'warn');
      return false;
      
    } catch (error) {
      this.errorHandler.handleError(error, { 
        operation: 'show_html_window', 
        htmlPath 
      });
      return false;
    }
  }

  /**
   * 加载插件
   */
  async loadPlugins() {
    try {
      this.performanceMonitor.startTimer('load_plugins');
      
      if (!fs.existsSync(this.pluginsDir)) {
        fs.mkdirSync(this.pluginsDir, { recursive: true });
        this.logger.log('插件目录不存在，已创建');
        return;
      }
      
      const files = fs.readdirSync(this.pluginsDir);
      const loadedPlugins = [];
      
      for (const file of files) {
        const fullPath = path.join(this.pluginsDir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          const metaPath = path.join(fullPath, 'plugin.json');
          if (fs.existsSync(metaPath)) {
            try {
              const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
              const pluginInfo = {
                ...meta,
                dir: fullPath,
                loadedAt: new Date().toISOString()
              };
              
              this.plugins.set(meta.name, pluginInfo);
              loadedPlugins.push(meta.name);
              
            } catch (e) {
              await this.errorHandler.handleError(e, { 
                operation: 'load_plugin_meta', 
                pluginPath: fullPath 
              });
            }
          }
        }
      }
      
      this.performanceMonitor.endTimer('load_plugins', null, { 
        pluginCount: loadedPlugins.length 
      });
      
      this.logger.log(`插件加载完成，共加载 ${loadedPlugins.length} 个插件: ${loadedPlugins.join(', ')}`);
      
    } catch (error) {
      await this.errorHandler.handleError(error, { operation: 'load_plugins' });
    }
  }

  /**
   * 监听插件变化
   */
  watchPlugins() {
    try {
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
          this.logger.log(`检测到新插件目录: ${dirPath}`);
          this.loadPlugins();
          this.notifyPluginsChanged();
        })
        .on('unlinkDir', (dirPath) => {
          this.logger.log(`检测到插件目录删除: ${dirPath}`);
          this.loadPlugins();
          this.notifyPluginsChanged();
        })
        .on('change', (filePath) => {
          if (filePath.endsWith('plugin.json')) {
            this.logger.log(`检测到插件配置变更: ${filePath}`);
            this.loadPlugins();
            this.notifyPluginsChanged();
          }
        })
        .on('error', (error) => {
          this.errorHandler.handleError(error, { 
            operation: 'plugin_watcher_error' 
          });
        });
      
      this.logger.log('插件监听器已启动');
      
    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'watch_plugins' });
    }
  }

  /**
   * 通知插件变化
   */
  notifyPluginsChanged() {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('plugins-changed', this.getPluginsList());
        this.logger.log('已通知渲染进程插件列表变化');
      }
    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'notify_plugins_changed' });
    }
  }

  /**
   * 获取插件列表
   */
  getPluginsList() {
    try {
      return Array.from(this.plugins.values()).map(plugin => ({
        name: plugin.name,
        description: plugin.description,
        version: plugin.version,
        author: plugin.author,
        icon: plugin.icon || 'fas fa-puzzle-piece',
        shortName: plugin.shortName || plugin.name,
        type: plugin.type || 'custom',
        enabled: plugin.enabled !== false,
        loadedAt: plugin.loadedAt
      }));
    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'get_plugins_list' });
      return [];
    }
  }

  /**
   * 获取插件信息
   */
  getPluginInfo(pluginName) {
    return this.plugins.get(pluginName);
  }

  /**
   * 检查插件是否存在
   */
  hasPlugin(pluginName) {
    return this.plugins.has(pluginName);
  }

  /**
   * 执行插件
   */
  async executePlugin(pluginName, action = 'default', ...args) {
    try {
      this.performanceMonitor.startTimer('execute_plugin', pluginName);
      
      const plugin = this.plugins.get(pluginName);
      if (!plugin) {
        throw new Error(`插件不存在: ${pluginName}`);
      }

      // 在执行插件前隐藏主窗口
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.hide();
        this.logger.log(`执行插件 ${pluginName} 前隐藏主窗口`);
      }

      // 通过插件进程池执行插件
      if (this.pluginProcessPool) {
        const result = await this.pluginProcessPool.executePlugin(pluginName, action, ...args);
        
        this.performanceMonitor.endTimer('execute_plugin', pluginName, { 
          success: true, 
          action 
        });
        
        return {
          success: true,
          message: `插件 ${pluginName} 执行成功`,
          result: result
        };
      } else {
        // 如果没有插件进程池，返回模拟结果
        this.performanceMonitor.endTimer('execute_plugin', pluginName, { 
          success: true, 
          action,
          simulated: true 
        });
        
        return {
          success: true,
          message: `插件 ${pluginName} 执行成功（模拟）`,
          result: `执行了插件: ${pluginName}, 动作: ${action}`
        };
      }
      
    } catch (error) {
      this.performanceMonitor.endTimer('execute_plugin', pluginName, { 
        success: false, 
        error: error.message 
      });
      
      await this.errorHandler.handleError(error, { 
        pluginName, 
        operation: 'execute_plugin',
        action,
        args 
      });
      
      return {
        success: false,
        message: error.message,
        result: null
      };
    }
  }

  /**
   * 获取插件管理器状态
   */
  getStatus() {
    return {
      pluginCount: this.plugins.size,
      pluginsDir: this.pluginsDir,
      watcherActive: !!this.watcher,
      mainWindowActive: !!(this.mainWindow && !this.mainWindow.isDestroyed()),
      pluginProcessPoolActive: !!this.pluginProcessPool,
      resultWindowManagerActive: !!this.resultWindowManager
    };
  }
}

module.exports = PluginManager; 