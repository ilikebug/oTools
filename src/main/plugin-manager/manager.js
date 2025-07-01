// Plugin manager, responsible for plugin scanning, metadata reading, hot reloading, etc.
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
   * Initialize plugin manager
   */
  async initialize(options = {}) {
    try {
      this.performanceMonitor.startTimer('plugin_manager_init');
      
      this.mainWindow = options.mainWindow;
      this.resultWindowManager = options.resultWindowManager;

      // Load plugins
      await this.loadPlugins();
      
      // Set up plugin watcher
      if (options.enableWatch !== false) {
        this.watchPlugins();
      }
      
      this.performanceMonitor.endTimer('plugin_manager_init');
      this.logger.log('Plugin manager initialization completed');
      
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
      this.logger.log('Plugin manager destroyed');
      
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
      
      this.logger.log(`Plugin loading completed, ${loadedPlugins.length} plugins loaded: ${loadedPlugins.join(', ')}`);
      
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
          this.logger.log(`New plugin directory detected: ${dirPath}`);
          await this.loadPlugins();
          this.notifyPluginsChanged();
        })
        .on('unlinkDir', async (dirPath) => {
          this.logger.log(`Plugin directory deleted: ${dirPath}`);
          await this.loadPlugins();
          this.notifyPluginsChanged();
        })
        .on('change', async (filePath) => {
          if (filePath.endsWith('plugin.json')) {
            this.logger.log(`Plugin configuration changed: ${filePath}`);
            await this.loadPlugins();
            this.notifyPluginsChanged();
          }
        })
        .on('error', (error) => {
          this.errorHandler.handleError(error, { 
            operation: 'plugin_watcher_error' 
          });
        });
      
      this.logger.log('Plugin watcher started');
      
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
        this.logger.log('Notification sent to render process about plugin list change');
      }
    } catch (error) {
      this.errorHandler.handleError(error, { operation: 'notify_plugins_changed' });
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
   * Execute plugin
   * Only as a business entry, actual execution is delegated to pluginProcessPool
   */
  async executePlugin(pluginName, action, ...args) {
    return await this.pluginProcessPool.executePlugin(pluginName, action, ...args);
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
      pluginProcessPoolActive: !!this.pluginProcessPool,
      resultWindowManagerActive: !!this.resultWindowManager
    };
  }

  async startPlugin(pluginName) {
    await this.pluginProcessPool.getProcess(pluginName);
    this.logger.log(`Plugin started: ${pluginName}`);
  }

  async stopPlugin(pluginName) {
    const info = this.pluginProcessPool.processes.get(pluginName);
    if (info && info.window && !info.window.isDestroyed()) {
      info.window.close();
      this.logger.log(`Plugin stopped: ${pluginName}`);
    }
  }

  getPoolStatus() {
    return this.pluginProcessPool.getPoolStatus();
  }
}

module.exports = PluginManager; 