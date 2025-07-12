// Plugin manager, responsible for plugin scanning, hot reloading, etc.
const path = require('node:path');
const fs = require('fs');
const chokidar = require('chokidar');
const logger = require('../utils/logger');
const { GetPluginPath, forceMoveWindowToCurrentDisplay, moveWindowToCursor } = require('../comm');
const { BrowserWindow } = require('electron');


class PluginManager {
  constructor(options = {}) {
    // Always include the default plugin directory for scanning
    this.defaultDir = GetPluginPath();
    // Custom plugin directories (excluding the default directory)
    this.customDirs = [];
    
    this.plugins = new Map();
    this.processes = new Map();

    this.watcher = null;
    this.mainWindow = null;
    this.maxProcesses = null;

    this.configManager = null
  }

  /**
   * Initialize plugin manager
   */
  async initialize(options = {}) {
    try {
      this.configManager = options.configManager;
      const mainConfig = this.configManager.getConfig('main')
      this.maxProcesses = mainConfig.plugins.maxProcesses;
      this.customDirs = mainConfig.plugins.pluginDirs;
      
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
      if (!this.hasPlugin(pluginName)) {
        return {
          success: false,
          error: `Plugin '${pluginName}' does not exist`
        };
      }
    
      // Stop plugin process if running
      await this.stopPluginProcess(pluginName);
  
      // Get plugin info before removal
      const pluginInfo = this.getPluginInfo(pluginName);
      const pluginDir = pluginInfo.dir;
  
      // Remove from plugins map
      this.plugins.delete(pluginName);
  
      // Check if this plugin is in a custom directory
      const isCustomDir = this.customDirs.some(dir => {
        return path.resolve(dir) === path.resolve(pluginDir);
      });
  
      if (isCustomDir) {
        // Remove the specific plugin directory from custom dirs
        this.customDirs = this.customDirs.filter(
          d => path.resolve(d) !== path.resolve(pluginDir)
        );
        
        // Update configuration file to remove this specific plugin directory
        if (this.configManager) {
          const config = this.configManager.getConfig('main');
          if (config && config.plugins && Array.isArray(config.plugins.pluginDirs)) {
            // Remove the specific plugin directory from config
            config.plugins.pluginDirs = config.plugins.pluginDirs.filter(
              d => path.resolve(d) !== path.resolve(pluginDir)
            );
            this.configManager.setConfig('main', config);
          }
        }
      } else {
        // Default plugin dir so delete it
        if (removeFiles && pluginDir && fs.existsSync(pluginDir)) {
          try {
            fs.rmSync(pluginDir, { recursive: true, force: true });
          } catch (error) {
            logger.error(`Failed to remove plugin files from disk: ${error.message}`);
            return {
              success: false,
              error: `Failed to remove plugin files: ${error.message}`
            };
          }
        }
      }
      
      this.notifyPluginsChanged();

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
      // Helper: check if a directory contains plugin.json
      const isPluginDir = (dir) => {
        return fs.existsSync(path.join(dir, 'plugin.json'));
      };

      // Helper: try to load a single plugin directory
      const tryLoadPlugin = (pluginDir) => {
        const metaPath = path.join(pluginDir, 'plugin.json');
        try {
          const fileContent = fs.readFileSync(metaPath, 'utf-8');
          if (!fileContent.trim()) {
            logger.warn(`Empty plugin.json file in ${pluginDir}`);
            return;
          }
          const meta = JSON.parse(fileContent);
          if (!meta.name) {
            logger.warn(`Plugin missing name in ${pluginDir}`);
            return;
          }
          const pluginInfo = {
            ...meta,
            dir: pluginDir,
            loadedAt: new Date().toISOString()
          };
          this.plugins.set(meta.name, pluginInfo);
          logger.info(`Plugin loaded: ${meta.name}`);
        } catch (e) {
          logger.error(`Failed to load plugin from ${pluginDir}: ${e.message}`);
        }
      };
      for (const dir of this.getAllPluginDirs()) {
        if (!fs.existsSync(dir)) {
          logger.warn(`Plugin directory does not exist: ${dir}`);
          continue;
        }

        // 1. If the directory itself is a plugin directory, load it directly
        if (isPluginDir(dir)) {
          tryLoadPlugin(dir);
          continue;
        }

        // 2. Otherwise, scan all its subdirectories
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          if (fs.statSync(fullPath).isDirectory() && isPluginDir(fullPath)) {
            tryLoadPlugin(fullPath);
          }
        }
      }
      
      logger.info(`Plugin loading completed, ${this.plugins.size} plugins loaded.`);
      
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
      if (!fs.existsSync(this.defaultDir)) {
        fs.mkdirSync(this.defaultDir, { recursive: true });
      }
      for (const dir of this.customDirs) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
      
      // Watch both default directory and all custom directories
      const allWatchDirs = [this.defaultDir, ...this.customDirs];
      this.watcher = chokidar.watch(allWatchDirs, {
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
          await this.loadPlugins(); // Reload all plugins
          this.notifyPluginsChanged();
        })
        .on('unlinkDir', async (dirPath) => {
          await this.loadPlugins(); // Reload all plugins
          this.notifyPluginsChanged();
        })
        .on('change', async (filePath) => {
          // Extract plugin name from file path
          const pluginName = path.basename(path.dirname(filePath));
          // Add a small delay to ensure file is fully written
          setTimeout(async () => {
            await this.loadPlugins(pluginName); // Restart specific plugin
            this.notifyPluginsChanged();
          }, 100);
        })
        .on('add', async (filePath) => {
          // Extract plugin name from file path
          const pluginName = path.basename(path.dirname(filePath));
          await this.loadPlugins(pluginName); // Restart specific plugin
          this.notifyPluginsChanged();
        })
        .on('unlink', async (filePath) => {
          // Extract plugin name from file path
          const pluginName = path.basename(path.dirname(filePath));
          await this.loadPlugins(pluginName); // Restart specific plugin
          this.notifyPluginsChanged();
        })
        .on('error', (error) => {
          logger.error(`Plugin watcher error: ${error.message}`);
          // Don't throw error, just log it to prevent watcher from stopping
        })
      
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
    // Use the plugin's actual directory from the loaded plugin info
    const pluginInfo = this.plugins.get(pluginName);
    if (!pluginInfo) throw new Error(`Plugin info not found for: ${pluginName}`);
    const pluginPath = pluginInfo.dir;
    const metaPath = path.join(pluginPath, 'plugin.json');
    if (!fs.existsSync(metaPath)) throw new Error(`Plugin configuration file does not exist: ${metaPath}`);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const htmlEntry = meta.ui && meta.ui.html ? meta.ui.html : 'index.html';
    const isUrl = /^https?:\/\//.test(htmlEntry);
    const htmlPath = isUrl ? htmlEntry : path.join(pluginPath, htmlEntry);
    const pluginPreloadPath = path.join(pluginPath, meta.preload ? meta.preload : 'preload.js');
    
    const defaultWidth = 900;
    const defaultHeight = 600;
    const winWidth = meta.ui.width || defaultWidth;
    const winHeight = meta.ui.height || defaultHeight;
    const winTitle = meta.ui.title || meta.shortName || meta.name || 'Plugin';
    let winFrame = true
    if (meta.ui.frame != undefined) {
      winFrame = meta.ui.frame;
    }

    const win = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      title: winTitle,
      show: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      frame: winFrame,
      webPreferences: {
        sandbox: false, 
        preload: path.join(__dirname, 'plugin-preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        additionalArguments: [`--plugin-preload-path=${pluginPreloadPath}`]
      }
    });

    if (meta.debug) {
      win.webContents.openDevTools();
    }
    
    // Set window level to ensure it appears above other applications
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    if (isUrl) {
      await win.loadURL(htmlPath);
    } else {
      await win.loadFile(htmlPath);
    }
    const info = { window: win, status: 'idle', meta };
    this.processes.set(pluginName, info);

    win.on('show', () => {
      win.focus();
    });
    
    if (meta.ui && meta.ui.hideOnBlur) {
      win.on('blur', () => {
        const pluginInfo = this.plugins.get(pluginName);
        const startupMode = pluginInfo?.startupMode || 'independent';
        
        if (startupMode === 'dependent') {
          // For dependent plugins, just hide the window
          win.hide();
        } else {
          // For independent plugins, close the window
          win.close();
        }
      });
    }
    
    win.on('closed', () => {
      this.processes.delete(pluginName);
    });

    win.on('close', (event) => {
      const pluginInfo = this.plugins.get(pluginName);
      const startupMode = pluginInfo?.startupMode || 'independent';
      
      if (startupMode === 'independent') {
        return
      }

      event.preventDefault();
      win.hide();
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

    window.setAlwaysOnTop(true, 'floating');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    setTimeout(() => {
      if (window && !window.isDestroyed()) {
        window.setAlwaysOnTop(true, 'floating');
        window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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
    // Manually trigger a reload to test
    this.loadPlugins().then(() => {
      this.notifyPluginsChanged();
    }).catch(error => {
      logger.error(`Manual plugin reload failed: ${error.message}`);
    });
  }

  getAllPluginDirs() {
    // Return all valid plugin directories, default directory first
    return [this.defaultDir, ...this.customDirs];
  }

  // Add a custom plugin directory (case-insensitive, ignore trailing slash)
  async addCustomPluginDir(dir) {
    const norm = (d) => d.replace(/[\\/]+$/, '').toLowerCase();
    
    // Check if this directory is already in custom dirs
    if (norm(dir) === norm(this.defaultDir)) {
      return false;
    }
    
    // Check if this exact directory is already added
    if (this.customDirs.some(d => norm(d) === norm(dir))) {
      return false;
    }
    
    // Scan the directory for plugin subdirectories
    const pluginSubdirs = this.scanDirectoryForPlugins(dir);
    
    if (pluginSubdirs.length === 0) {
      return false; // No plugins found in this directory
    }
    
    // Add each plugin subdirectory to custom dirs
    for (const pluginDir of pluginSubdirs) {
      if (!this.customDirs.some(d => norm(d) === norm(pluginDir))) {
        this.customDirs.push(pluginDir);
      }
    }
    
    await this.loadPlugins()
  
    // Re-setup watcher to include the new directories
    if (this.watcher) {
      this.watcher.close();
      this.watchPlugins();
    }
    
    return true;
  }

  /**
   * Scan a directory for plugin subdirectories
   * @param {string} dir Directory to scan
   * @returns {string[]} Array of plugin directory paths
   */
  scanDirectoryForPlugins(dir) {
    const pluginDirs = [];
    
    if (!fs.existsSync(dir)) {
      return pluginDirs;
    }
    
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Check if this directory contains a plugin.json file
          const pluginJsonPath = path.join(fullPath, 'plugin.json');
          if (fs.existsSync(pluginJsonPath)) {
            pluginDirs.push(fullPath);
          }
        }
      }
    } catch (error) {
      logger.error(`Error scanning directory ${dir} for plugins: ${error.message}`);
    }
    
    return pluginDirs;
  }

  // Get all custom plugin directories
  getCustomPluginDirs() {
    return this.customDirs.slice();
  }

  // Validate custom plugin directories (call on startup)
  refreshCustomPluginDirs() {
    this.customDirs = this.customDirs.filter(dir => fs.existsSync(dir));
  }
}

module.exports = PluginManager;  