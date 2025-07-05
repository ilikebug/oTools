// Plugin manager, responsible for plugin scanning, hot reloading, etc.
const path = require('node:path');
const fs = require('fs');
const chokidar = require('chokidar');
const logger = require('../utils/logger');
const { GetPluginDir } = require('../comm');
const { BrowserWindow } = require('electron');


class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.pluginsDir = GetPluginDir();
    
    this.maxProcesses = null;
    this.processes = new Map(); 

    this.watcher = null;
    this.mainWindow = null;
  }

  /**
   * Initialize plugin manager
   */
  async initialize(options = {}) {
    try {
      this.maxProcesses = options.maxProcesses;

      // Load plugins
      await this.loadPlugins();
      
      // Set up plugin watcher
      if (options.autoLoad !== false) {
        this.watchPlugins();
      }
      // Auto-start dependent plugins
      await this.autoStartDependentPlugins();
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Set main window reference after window creation
   */
  setMainWindow(window) {
    this.mainWindow = window;
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
      
    } catch (error) {
      throw error;
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
              throw e;
            }
          }
        }
      }
      
      logger.info(`Plugin loading completed, ${loadedPlugins.length} plugins loaded: ${loadedPlugins.join(', ')}`);
      
    } catch (error) {
      throw error;
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
          await this.loadPlugins();
          this.notifyPluginsChanged();
        })
        .on('unlinkDir', async (dirPath) => {
          await this.loadPlugins();
          this.notifyPluginsChanged();
        })
        .on('change', async (filePath) => {
          if (filePath.endsWith('plugin.json')) {
            await this.loadPlugins();
            this.notifyPluginsChanged();
          }
        })
        .on('error', (error) => {
          throw error;
        });
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Notify plugin changes
   */
  notifyPluginsChanged() {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents) {
        this.mainWindow.webContents.send('plugins-changed', this.getPluginsList());
      }
    } catch (error) {
      logger.error(`Error in notifyPluginsChanged: ${error.message}`);
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
        icon: path.join(plugin.dir, plugin.icon),
        shortName: plugin.shortName || plugin.name,
        type: plugin.type || 'custom',
        enabled: plugin.enabled !== false,
        loadedAt: plugin.loadedAt,
        startupMode: plugin.startupMode || 'independent',
      }));
    } catch (error) {
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
   * get running plugin
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

    const win = new BrowserWindow({
      show: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      frame: true,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    
    // Set window level to ensure it appears above other applications
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    await win.loadFile(htmlPath);
    const info = { window: win, status: 'idle', meta };
    this.processes.set(pluginName, info);
    
    win.on('closed', () => {
      this.processes.delete(pluginName);
    });

    win.on('close', (event) => {
      const pluginInfo = this.plugins.get(pluginName);
      const startupMode = pluginInfo?.startupMode || 'independent';
      
      if (startupMode === 'dependent') {
        event.preventDefault();
        win.hide();
      }
    });

    return info;
  }

  /**
   * Auto-start dependent plugins
   */
  async autoStartDependentPlugins() {
    try {      
      for (const [pluginName, pluginInfo] of this.plugins) {
        // Check if plugin is enabled and has dependent startup mode
        if (pluginInfo.enabled !== false && pluginInfo.startupMode === 'dependent') {          
          try {
            // For dependent plugins, create process but don't show window
            // This allows plugins to run in background while keeping UI hidden
            const process = await this.createProcess(pluginName);
            if (process && process.window) {
              // Ensure window is hidden but process continues running
              process.window.hide();
              // Mark as dependent mode
              process.startupMode = 'dependent';
            }
          } catch (error) {
            logger.error(`Failed to auto-start dependent plugin ${pluginName}: ${error.message}`);
          }
        }
      }
      
    } catch (error) {
      logger.error(`Error in autoStartDependentPlugins: ${error.message}`);
    }
  }

  /**
   * Show plugin window if it exists and is hidden
   */
  showPluginWindow(pluginName) {
    const processInfo = this.processes.get(pluginName);
    if (processInfo && processInfo.window && !processInfo.window.isDestroyed()) {
      if (!processInfo.window.isVisible()) {
        processInfo.window.show();
        processInfo.window.focus();
        // Ensure window is on top
        processInfo.window.setAlwaysOnTop(true, 'screen-saver');
        // Restore normal level after short delay
        setTimeout(() => {
          if (processInfo.window && !processInfo.window.isDestroyed()) {
            processInfo.window.setAlwaysOnTop(true, 'normal');
          }
        }, 100);
        return true;
      } else {
        // If window is already visible, ensure it gets focus
        processInfo.window.focus();
        processInfo.window.setAlwaysOnTop(true, 'screen-saver');
        setTimeout(() => {
          if (processInfo.window && !processInfo.window.isDestroyed()) {
            processInfo.window.setAlwaysOnTop(true, 'normal');
          }
        }, 100);
        return true;
      }
    } else {
      // If process doesn't exist, try to create it (for dependent plugins)
      const pluginInfo = this.plugins.get(pluginName);
      if (pluginInfo && pluginInfo.startupMode === 'dependent') {
        // Return false to let IPC layer handle process creation
        return false;
      }
      return false;
    }
  }

  /**
   * Hide plugin window if it exists and is visible
   */
  hidePluginWindow(pluginName) {
    const processInfo = this.processes.get(pluginName);
    if (processInfo && processInfo.window && !processInfo.window.isDestroyed()) {
      if (processInfo.window.isVisible()) {
        processInfo.window.hide();
        return true;
      }
    }
    return false;
  }

  /**
   * Get plugin window status
   */
  getPluginWindowStatus(pluginName) {
    const processInfo = this.processes.get(pluginName);
    if (processInfo && processInfo.window && !processInfo.window.isDestroyed()) {
      return {
        exists: true,
        visible: processInfo.window.isVisible(),
        destroyed: processInfo.window.isDestroyed(),
        startupMode: this.plugins.get(pluginName)?.startupMode || 'independent'
      };
    }
    return {
      exists: false,
      visible: false,
      destroyed: true,
      startupMode: this.plugins.get(pluginName)?.startupMode || 'independent'
    };
  }

  /**
   * Execute plugin with improved dependent plugin handling
   */
  async executePlugin(pluginName, action, ...args) {
    try {
      const info = await this.getProcess(pluginName);
      info.status = 'busy';
      
      // All plugins should show window when executed
      if (info.window && !info.window.isVisible()) {
        info.window.show();
        info.window.focus();
        // Ensure window is on top
        info.window.setAlwaysOnTop(true, 'screen-saver');
        // Restore normal level after short delay
        setTimeout(() => {
          if (info.window && !info.window.isDestroyed()) {
            info.window.setAlwaysOnTop(true, 'normal');
          }
        }, 100);
      }
      
      info.status = 'idle';
      return { success: true };
    } catch (error) {
      logger.error(`Error executing plugin ${pluginName}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  getPoolStatus() {
    return Array.from(this.processes.keys());
  }
}

module.exports = PluginManager; 