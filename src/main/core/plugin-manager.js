// Plugin manager, responsible for plugin scanning, hot reloading, etc.
const path = require('node:path');
const fs = require('fs');
const chokidar = require('chokidar');
const logger = require('../utils/logger');

class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.pluginsDir = path.join(__dirname, '..', '..', '..', 'plugins');
    
    this.maxProcesses = 10;
    this.processes = new Map(); // name -> { window, status, ... }

    this.watcher = null;
    this.mainWindow = null;
  }

  /**
   * Initialize plugin manager
   */
  async initialize(options = {}) {
    try {
      this.mainWindow = options.mainWindow;

      // Load plugins
      await this.loadPlugins();
      
      // Set up plugin watcher
      if (options.enableWatch !== false) {
        this.watchPlugins();
      }
      
      logger.info('Plugin manager initialization completed');
      
    } catch (error) {
      await this.errorHandler.handleError(error, { 
        operation: 'plugin_manager_init' 
      });
      throw error;
    }
  }

  /**
   * Destroy plugin manager
   */
  async destroy() {
    try {
      if (this.watcher) {
        this.watcher.close();
        this.watcher = null;
      }
      
      this.plugins.clear();
      logger.info('Plugin manager destroyed');
      
    } catch (error) {
      await this.errorHandler.handleError(error, { 
        operation: 'plugin_manager_destroy' 
      });
    }
  }

  /**
   * Load plugins
   */
  async loadPlugins() {
    try {
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
      
      logger.info(`Plugin loading completed, ${loadedPlugins.length} plugins loaded: ${loadedPlugins.join(', ')}`);
      
    } catch (error) {
      await this.errorHandler.handleError(error, { operation: 'load_plugins' });
    }
  }

  /**
   * Watch for plugin changes
   */
  watchPlugins() {
    try {
      // Close previous watcher first
      if (this.watcher) {
        this.watcher.close();
      }
      
      this.watcher = chokidar.watch(this.pluginsDir, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true // Ignore initial scan to avoid duplicate loading
      });
      
      this.watcher
        .on('addDir', async (dirPath) => {
          logger.info(`New plugin directory detected: ${dirPath}`);
          await this.loadPlugins();
          this.notifyPluginsChanged();
        })
        .on('unlinkDir', async (dirPath) => {
          logger.info(`Plugin directory deleted: ${dirPath}`);
          await this.loadPlugins();
          this.notifyPluginsChanged();
        })
        .on('change', async (filePath) => {
          if (filePath.endsWith('plugin.json')) {
            logger.info(`Plugin configuration changed: ${filePath}`);
            await this.loadPlugins();
            this.notifyPluginsChanged();
          }
        })
        .on('error', (error) => {
          this.errorHandler.handleError(error, { 
            operation: 'plugin_watcher_error' 
          });
        });
      
      logger.info('Plugin watcher started');
      
    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'watch_plugins' });
    }
  }

  /**
   * Notify plugin changes
   */
  notifyPluginsChanged() {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('plugins-changed', this.getPluginsList());
        logger.info('Notification sent to render process about plugin list change');
      }
    } catch (error) {
      logger.info(`Error in notifyPluginsChanged: ${error.message}`);
    }
  }

  /**
   * Get plugin list
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
   * Get plugin info
   */
  getPluginInfo(pluginName) {
    return this.plugins.get(pluginName);
  }

  /**
   * Check if plugin exists
   */
  hasPlugin(pluginName) {
    return this.plugins.has(pluginName);
  }

  /**
   * 插件进程池相关方法
   */
  async getProcess(pluginName, forceNew = false) {
    if (!forceNew && this.processes.has(pluginName)) {
      const info = this.processes.get(pluginName);
      if (info.status === 'idle' && info.window && !info.window.isDestroyed()) {
        info.status = 'busy';
        return info;
      }
    }
    if (this.processes.size >= this.maxProcesses) {
      throw new Error('Maximum plugin process number reached');
    }
    return await this.createProcess(pluginName);
  }

  async createProcess(pluginName) {
    const pluginPath = path.join(this.pluginsDir, pluginName);
    const metaPath = path.join(pluginPath, 'plugin.json');
    if (!fs.existsSync(metaPath)) throw new Error(`Plugin configuration file does not exist: ${metaPath}`);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const htmlPath = path.join(pluginPath, meta.ui && meta.ui.html ? meta.ui.html : 'index.html');
    const preloadPath = path.join(pluginPath, 'preload.js');
    if (!fs.existsSync(htmlPath)) throw new Error(`Plugin main page does not exist: ${htmlPath}`);
    if (!fs.existsSync(preloadPath)) throw new Error(`Plugin preload script does not exist: ${preloadPath}`);

    const { BrowserWindow } = require('electron');
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    await win.loadFile(htmlPath);
    const info = { window: win, status: 'idle', meta };
    this.processes.set(pluginName, info);
    // 监听插件窗口消息
    win.webContents.on('ipc-message', (event, channel, ...args) => {
      logger.info(`[${pluginName}] IPC message: ${channel}`, args);
    });
    win.on('closed', () => {
      this.processes.delete(pluginName);
    });
    logger.info(`Plugin process created successfully: ${pluginName}`);
    return info;
  }

  async executePlugin(pluginName, action, ...args) {
    const info = await this.getProcess(pluginName);
    info.status = 'busy';
    info.window.webContents.send('plugin-execute', { action, args });
    if (info.window && !info.window.isVisible()) {
      info.window.show();
    }
    info.status = 'idle';
    return { success: true };
  }

  getPoolStatus() {
    return Array.from(this.processes.keys());
  }

  /**
   * Get plugin manager status
   */
  getStatus() {
    return {
      pluginCount: this.plugins.size,
      pluginsDir: this.pluginsDir,
      watcherActive: !!this.watcher,
      mainWindowActive: !!(this.mainWindow && !this.mainWindow.isDestroyed()),
      pluginProcessPoolActive: !!this.processes.size,
    };
  }

  async startPlugin(pluginName) {
    await this.getProcess(pluginName);
    logger.info(`Plugin started: ${pluginName}`);
  }

  async stopPlugin(pluginName) {
    const info = this.processes.get(pluginName);
    if (info && info.window && !info.window.isDestroyed()) {
      info.window.close();
      logger.info(`Plugin stopped: ${pluginName}`);
    }
  }
}

module.exports = PluginManager; 