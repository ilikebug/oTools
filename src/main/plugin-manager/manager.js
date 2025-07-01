// 插件管理器，负责插件扫描、元信息读取、热加载等
const path = require('node:path');
const fs = require('fs');
const chokidar = require('chokidar');
const BaseManager = require('../core/base-manager');
const PluginProcessPool = require('./process-pool');

class PluginManager extends BaseManager {
  constructor(options = {}) {
    super('PluginManager');

    this.appManager = options.appManager;
    this.logger = options.logger;
    this.configManager = options.configManager;
    this.errorHandler = options.errorHandler;
    this.performanceMonitor = options.performanceMonitor;

    if (!this.logger) {
      throw new Error('PluginManager requires a logger instance.');
    }
    
    this.plugins = new Map();
    this.pluginsDir = path.join(__dirname, '..', '..', '..', 'plugins');
    this.watcher = null;
    this.mainWindow = null;
    this.resultWindowManager = null;
    this.macTools = null
    this.pluginProcessPool = new PluginProcessPool({
      maxProcesses: 5
    });
  }

  /**
   * 初始化插件管理器
   */
  async initialize(options = {}) {
    try {
      this.performanceMonitor.startTimer('plugin_manager_init');
      
      this.mainWindow = options.mainWindow;
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
   * 加载插件
   */
  async loadPlugins() {
    try {
      this.performanceMonitor.startTimer('load_plugins');

      this.plugins.clear();

      if (!fs.existsSync(this.pluginsDir)) {
        fs.mkdirSync(this.pluginsDir, { recursive: true });
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
        .on('addDir', async (dirPath) => {
          this.logger.log(`检测到新插件目录: ${dirPath}`);
          await this.loadPlugins();
          this.notifyPluginsChanged();
        })
        .on('unlinkDir', async (dirPath) => {
          this.logger.log(`检测到插件目录删除: ${dirPath}`);
          await this.loadPlugins();
          this.notifyPluginsChanged();
        })
        .on('change', async (filePath) => {
          if (filePath.endsWith('plugin.json')) {
            this.logger.log(`检测到插件配置变更: ${filePath}`);
            await this.loadPlugins();
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
   * 只作为业务入口，实际执行委托给 pluginProcessPool
   */
  async executePlugin(pluginName, action, ...args) {
    return await this.pluginProcessPool.executePlugin(pluginName, action, ...args);
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

  async startPlugin(pluginName) {
    await this.pluginProcessPool.getProcess(pluginName);
    this.logger.log(`插件已启动: ${pluginName}`);
  }

  async stopPlugin(pluginName) {
    const info = this.pluginProcessPool.processes.get(pluginName);
    if (info && info.window && !info.window.isDestroyed()) {
      info.window.close();
      this.logger.log(`插件已停止: ${pluginName}`);
    }
  }

  getPoolStatus() {
    return this.pluginProcessPool.getPoolStatus();
  }
}

module.exports = PluginManager; 