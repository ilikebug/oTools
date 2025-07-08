// Plugin manager, responsible for plugin scanning, hot reloading, etc.
const path = require('node:path');
const fs = require('fs');
const chokidar = require('chokidar');
const logger = require('../utils/logger');
const { GetPluginDir, forceMoveWindowToCurrentDisplay, moveWindowToCursor } = require('../comm');
const { BrowserWindow } = require('electron');


class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.pluginsDir = GetPluginDir();
    
    this.maxProcesses = null;
    this.processes = new Map(); 

    this.watcher = null;
    this.mainWindow = null;
    this.debug = null
    this.store = null
  }

  /**
   * Initialize plugin manager
   */
  async initialize(options = {}) {
    try {
      this.maxProcesses = options.maxProcesses;
      this.debug = options.debug
      this.store = options.store
      
      logger.info(`Initializing plugin manager`);
      
      // Load plugins
      await this.loadPlugins();
      
      // Set up plugin watcher immediately
      if (options.autoLoad !== false) {
        this.watchPlugins();
      }
    } catch (error) {
      logger.error(`Error initializing plugin manager: ${error.message}`);
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
   * Stop plugin process
   */
  async stopPluginProcess(pluginName) {
    const processInfo = this.processes.get(pluginName);
    if (processInfo && processInfo.window && !processInfo.window.isDestroyed()) {
      try {
        processInfo.window.close();
        this.processes.delete(pluginName);
        logger.info(`Plugin process stopped: ${pluginName}`);
      } catch (error) {
        logger.error(`Error stopping plugin process ${pluginName}: ${error.message}`);
      }
    }
  }

  /**
   * Stop all plugin processes
   */
  async stopAllPluginProcesses() {
    const pluginNames = Array.from(this.processes.keys());
    for (const pluginName of pluginNames) {
      await this.stopPluginProcess(pluginName);
    }
  }

  /**
   * Uninstall plugin
   * @param {string} pluginName - Name of the plugin to uninstall
   * @param {boolean} removeFiles - Whether to remove plugin files from disk
   * @returns {Object} Result object with success status and message
   */
  async uninstallPlugin(pluginName, removeFiles = true) {
    try {
      // Check if plugin exists
      if (!this.hasPlugin(pluginName)) {
        return {
          success: false,
          error: `Plugin '${pluginName}' does not exist`
        };
      }

      logger.info(`Starting uninstall process for plugin: ${pluginName}`);

      // Stop plugin process if running
      await this.stopPluginProcess(pluginName);

      // Get plugin info before removal
      const pluginInfo = this.getPluginInfo(pluginName);
      const pluginDir = pluginInfo.dir;

      // Remove from plugins map
      this.plugins.delete(pluginName);

      // Remove plugin files from disk if requested
      if (removeFiles && pluginDir && fs.existsSync(pluginDir)) {
        try {
          // Use fs.rmSync for recursive directory removal (Node.js 14.14.0+)
          fs.rmSync(pluginDir, { recursive: true, force: true });
          logger.info(`Plugin files removed from disk: ${pluginDir}`);
        } catch (error) {
          logger.error(`Failed to remove plugin files from disk: ${error.message}`);
          return {
            success: false,
            error: `Failed to remove plugin files: ${error.message}`
          };
        }
      }

      // Notify main window about plugin changes
      this.notifyPluginsChanged();

      logger.info(`Plugin '${pluginName}' uninstalled successfully`);
      
      return {
        success: true,
        message: `Plugin '${pluginName}' uninstalled successfully`,
        removedFiles: removeFiles
      };

    } catch (error) {
      logger.error(`Error uninstalling plugin ${pluginName}: ${error.message}`);
      return {
        success: false,
        error: `Failed to uninstall plugin: ${error.message}`
      };
    }
  }
  
  /**
   * Load plugins with optional specific plugin restart
   */
  async loadPlugins(restartPluginName = null) {
    try {
      // Stop specific plugin process if restart is requested
      if (restartPluginName) {
        await this.stopPluginProcess(restartPluginName);
      }

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
              const fileContent = fs.readFileSync(metaPath, 'utf-8');
              if (!fileContent.trim()) {
                logger.warn(`Empty plugin.json file in ${fullPath}`);
                continue;
              }
              
              const meta = JSON.parse(fileContent);
              if (!meta.name) {
                logger.warn(`Plugin missing name in ${fullPath}`);
                continue;
              }
              
              const pluginInfo = {
                ...meta,
                dir: fullPath,
                loadedAt: new Date().toISOString()
              };
              
              this.plugins.set(meta.name, pluginInfo);
              loadedPlugins.push(meta.name);
          
            } catch (e) {
              logger.error(`Failed to load plugin from ${fullPath}: ${e.message}`);
              // Continue loading other plugins instead of throwing
              continue;
            }
          }
        }
      }
      
      logger.info(`Plugin loading completed, ${loadedPlugins.length} plugins loaded: ${loadedPlugins.join(', ')}`);
      
      // Restart specific dependent plugin if restart is requested
      if (restartPluginName) {
        const pluginInfo = this.plugins.get(restartPluginName);
        if (pluginInfo && pluginInfo.enabled !== false && pluginInfo.startupMode === 'dependent') {
          try {
            await this.createProcess(restartPluginName);
            const process = this.processes.get(restartPluginName);
            if (process && process.window) {
              process.window.hide();
              process.startupMode = 'dependent';
            }
          } catch (error) {
            logger.error(`Failed to restart dependent plugin ${restartPluginName}: ${error.message}`);
          }
        }
      }
      
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
      
      // Ensure plugins directory exists
      if (!fs.existsSync(this.pluginsDir)) {
        fs.mkdirSync(this.pluginsDir, { recursive: true });
      }
      
      this.watcher = chokidar.watch(this.pluginsDir, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true, // Ignore initial scan to avoid duplicate loading
        depth: 2, // Watch subdirectories
        awaitWriteFinish: {
          stabilityThreshold: 50, // Reduced for faster response
          pollInterval: 50
        },
        usePolling: true, // Use polling for better file change detection
        interval: 100 // Polling interval
      });
      
      this.watcher
        .on('addDir', async (dirPath) => {
          logger.info(`Plugin directory added: ${dirPath}`);
          await this.loadPlugins(); // Reload all plugins
          this.notifyPluginsChanged();
        })
        .on('unlinkDir', async (dirPath) => {
          logger.info(`Plugin directory removed: ${dirPath}`);
          await this.loadPlugins(); // Reload all plugins
          this.notifyPluginsChanged();
        })
        .on('change', async (filePath) => {
          logger.info(`File changed: ${filePath}`);
          // Extract plugin name from file path
          const pluginName = path.basename(path.dirname(filePath));
          // Add a small delay to ensure file is fully written
          setTimeout(async () => {
            await this.loadPlugins(pluginName); // Restart specific plugin
            this.notifyPluginsChanged();
          }, 100);
        })
        .on('add', async (filePath) => {
          logger.info(`File added: ${filePath}`);
          // Extract plugin name from file path
          const pluginName = path.basename(path.dirname(filePath));
          await this.loadPlugins(pluginName); // Restart specific plugin
          this.notifyPluginsChanged();
        })
        .on('unlink', async (filePath) => {
          logger.info(`File removed: ${filePath}`);
          // Extract plugin name from file path
          const pluginName = path.basename(path.dirname(filePath));
          await this.loadPlugins(pluginName); // Restart specific plugin
          this.notifyPluginsChanged();
        })
        .on('error', (error) => {
          logger.error(`Plugin watcher error: ${error.message}`);
          // Don't throw error, just log it to prevent watcher from stopping
        })
        .on('ready', () => {
          logger.info('Plugin watcher ready');
        });
      
    } catch (error) {
      logger.error(`Error setting up plugin watcher: ${error.message}`);
      throw error;
    }
  }

  /**
   * Notify plugin changes
   */
  notifyPluginsChanged() {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.webContents) {
        const pluginsList = this.getPluginsList();
        this.mainWindow.webContents.send('plugins-changed', pluginsList);
      } else {
        logger.warn('Cannot notify plugins: mainWindow unavailable');
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
        ui: plugin.ui,
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

    const defaultWidth = 900;
    const defaultHeight = 600;
    const winWidth = meta.ui.width || defaultWidth;
    const winHeight = meta.ui.height || defaultHeight;
    const winTitle = meta.ui.title || meta.shortName || meta.name || 'Plugin';
    let winFrame = true
    if (meta.ui.frame != undefined) {
      winFrame = meta.ui.frame 
    }

    const win = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      title: winTitle,
      show: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      frame: winFrame,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    if (this.debug) {
      win.webContents.openDevTools();
    }
    
    // Set window level to ensure it appears above other applications
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    await win.loadFile(htmlPath);
    const info = { window: win, status: 'idle', meta };
    this.processes.set(pluginName, info);

    win.on('show', () => {
      win.focus();
    });
    
    if (meta.ui && meta.ui.hideOnBlur) {
      win.on('blur', () => {
        win.hide();
      });
    }
    
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
   * Set window to top level temporarily
   */
  _setWindowToTopTemporarily(window) {
    if (!window || window.isDestroyed()) return;
    
    window.setAlwaysOnTop(true, 'screen-saver');
    setTimeout(() => {
      if (window && !window.isDestroyed()) {
        window.setAlwaysOnTop(true, 'normal');
      }
    }, 100);
  }

  /**
   * Show plugin window if it exists and is hidden
   */
  showPluginWindow(pluginName) {
    const processInfo = this.processes.get(pluginName);
    if (processInfo && processInfo.window && !processInfo.window.isDestroyed()) {
      const pluginInfo = this.plugins.get(pluginName);
      if (pluginInfo && pluginInfo.popupAtCursor) {
        moveWindowToCursor(processInfo.window, 'right');
      } else {
        forceMoveWindowToCurrentDisplay(processInfo.window);
      }
      this._setWindowToTopTemporarily(processInfo.window);
      return true;
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
      info.window.webContents.send('plugin-execute', { action, args });
      
      // All plugins should show window when executed
      if (info.window && !info.window.isVisible()) {
        // Move to current display before showing
        forceMoveWindowToCurrentDisplay(info.window);
        this._setWindowToTopTemporarily(info.window);
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

  /**
   * Test watcher functionality
   */
  testWatcher() {
    logger.info('Testing watcher functionality...');
    logger.info(`Watcher active: ${!!this.watcher}`);
    logger.info(`Watching directory: ${this.pluginsDir}`);
    logger.info(`Current plugins: ${Array.from(this.plugins.keys()).join(', ')}`);
    
    // Manually trigger a reload to test
    this.loadPlugins().then(() => {
      logger.info('Manual plugin reload completed');
      this.notifyPluginsChanged();
    }).catch(error => {
      logger.error(`Manual plugin reload failed: ${error.message}`);
    });
  }
}

module.exports = PluginManager;  