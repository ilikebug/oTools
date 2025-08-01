const { screen, app } = require('electron');
const { exec } = require('child_process');
const { promisify } = require('util');
const logger = require('./logger');

const execAsync = promisify(exec);

/**
 * Enhanced Window Manager - Solves window popup issues in fullscreen applications
 */
class EnhancedWindowManager {
  constructor() {
    this.managedWindows = new Map();
    this.checkInterval = null;
    this.fullscreenAppCache = null;
    this.lastFullscreenCheck = 0;
  }

  /**
   * Register a window that needs management
   */
  registerWindow(windowId, window, options = {}) {
    const config = {
      window,
      windowId,
      forceTopLevel: options.forceTopLevel || 'floating', // floating, modal-panel, screen-saver
      checkVisibility: options.checkVisibility === true, // Only enable if explicitly requested
      autoRecover: options.autoRecover !== false,
      lastVisibilityCheck: 0,
      recoveryAttempts: 0,
      maxRecoveryAttempts: 3,
      ...options
    };

    this.managedWindows.set(windowId, config);
    this.setupWindowForFullscreen(window, config);
    
    if (!this.checkInterval) {
      this.startVisibilityCheck();
    }
    
    logger.info(`Enhanced window manager registered window: ${windowId}`);
  }

  /**
   * Unregister a window
   */
  unregisterWindow(windowId) {
    this.managedWindows.delete(windowId);
    if (this.managedWindows.size === 0 && this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info(`Enhanced window manager unregistered window: ${windowId}`);
  }

  /**
   * Optimize window settings for fullscreen display
   */
  setupWindowForFullscreen(window, config) {
    if (!window || window.isDestroyed()) {return;}

    try {
      // Set the highest window level
      window.setAlwaysOnTop(true, config.forceTopLevel, 1);
      
      // Ensure visible on all workspaces
      window.setVisibleOnAllWorkspaces(true, { 
        visibleOnFullScreen: true,
        skipTransformProcessType: true 
      });

      // Set window as focusable but don't activate other apps
      if (process.platform === 'darwin') {
        window.setFocusable(true);
        // Prevent window from being optimized away by the system
        window.setMinimizable(false);
      }

      logger.debug(`Enhanced window setup completed for: ${config.windowId}`);
    } catch (error) {
      logger.error(`Failed to setup enhanced window for ${config.windowId}:`, error);
    }
  }

  /**
   * Quick check if enhancement might be needed (without expensive operations)
   */
  mightNeedEnhancement() {
    // Simple heuristic: if we recently detected a fullscreen app, we might need enhancement
    const now = Date.now();
    const cacheAge = now - this.lastFullscreenCheck;
    
    // If cache is fresh (less than 5 seconds) and shows fullscreen, we might need enhancement
    if (cacheAge < 5000 && this.fullscreenAppCache === true) {
      return true;
    }
    
    // If cache is very old (more than 30 seconds), we should check
    if (cacheAge > 30000) {
      return true;
    }
    
    // Otherwise, probably don't need enhancement
    return false;
  }

  /**
   * Fast show window - skip expensive checks when possible
   */
  async fastShowWindow(windowId) {
    const config = this.managedWindows.get(windowId);
    if (!config || !config.window || config.window.isDestroyed()) {
      return false;
    }

    const { window } = config;

    try {
      // Use fast native detection first
      const hasFullscreenApp = this.detectFullscreenAppFast();
      
      if (hasFullscreenApp) {
        logger.info(`Fullscreen environment detected (fast), using enhanced method for: ${windowId}`);
        
        // Use optimized enhancement (no delays)
        window.setAlwaysOnTop(true, 'modal-panel', 2);
        window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        
        // Use native methods to ensure window visibility
        if (process.platform === 'darwin') {
          await this.forceWindowToFrontMacOS(window);
        }
        
        // Update cache asynchronously for future use
        this.detectFullscreenApp().catch(() => {});
      } else {
        // Standard quick show for non-fullscreen environments  
        window.setAlwaysOnTop(true, 'normal');
      }

      // Standard display process (no delay)
      const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      this.positionWindowOnScreen(window, currentScreen);
      
      window.show();
      window.focus();

      return true;
    } catch (error) {
      logger.error(`Fast show window failed for ${windowId}:`, error);
      return false;
    }
  }

  /**
   * Force show window - optimized for fullscreen applications
   */
  async forceShowWindow(windowId) {
    const config = this.managedWindows.get(windowId);
    if (!config || !config.window || config.window.isDestroyed()) {
      return false;
    }

    const { window } = config;

    try {
      // 1. Use fast detection first, fallback to AppleScript if needed
      let hasFullscreenApp = this.detectFullscreenAppFast();
      
      // If fast detection suggests fullscreen, confirm with AppleScript for accuracy
      if (hasFullscreenApp) {
        hasFullscreenApp = await this.detectFullscreenApp();
      }
      
      if (hasFullscreenApp) {
        logger.info(`Fullscreen app confirmed, using enhanced show method for: ${windowId}`);
        
        // 2. Temporarily elevate to highest level
        window.setAlwaysOnTop(true, 'modal-panel', 2);
        
        // 3. Use optimized refresh (try fast first, then deep if needed)
        await this.refreshWindowState(window);
        
        // 4. For stubborn windows, use deep refresh
        if (!window.isVisible() || !window.isFocused()) {
          logger.info(`Window still not responsive, using deep refresh for: ${windowId}`);
          await this.refreshWindowStateDeep(window);
        }
        
        // 5. Use native methods to ensure window visibility
        if (process.platform === 'darwin') {
          await this.forceWindowToFrontMacOS(window);
        }
      }

            // 5. Standard display process
      const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      this.positionWindowOnScreen(window, currentScreen);
      
      window.show();
      window.focus();

      // 6. Quick verification without delay (non-blocking)
      setImmediate(() => {
        this.verifyWindowVisibility(windowId);
      });

      return true;
    } catch (error) {
      logger.error(`Failed to force show window ${windowId}:`, error);
      return false;
    }
  }

  /**
   * Fast fullscreen detection using native Electron APIs
   */
  detectFullscreenAppFast() {
    try {
      const displays = screen.getAllDisplays();
      
      for (const display of displays) {
        // Check if work area is significantly smaller than bounds
        const workAreaRatio = (display.workArea.width * display.workArea.height) / 
                             (display.bounds.width * display.bounds.height);
        
        // If work area is less than 85% of total area, likely has fullscreen app
        if (workAreaRatio < 0.85) {
          return true;
        }
        
        // Check if dock/menubar are hidden (macOS specific)
        if (process.platform === 'darwin') {
          const menuBarHeight = display.bounds.y - display.workArea.y;
          const dockArea = (display.bounds.width * display.bounds.height) - 
                          (display.workArea.width * display.workArea.height) - 
                          (display.workArea.width * menuBarHeight);
          
          // If dock area is very small, dock might be hidden (fullscreen indicator)
          if (dockArea < 1000) { // Less than roughly 25x40 pixels
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      logger.warn('Fast fullscreen detection failed:', error);
      return false;
    }
  }

  /**
   * Detect if there's a fullscreen application running (with AppleScript)
   */
  async detectFullscreenApp() {
    const now = Date.now();
    // Cache detection results for 5 seconds to avoid frequent checks
    if (this.fullscreenAppCache !== null && now - this.lastFullscreenCheck < 5000) {
      return this.fullscreenAppCache;
    }

    try {
      if (process.platform === 'darwin') {
        // Use AppleScript to detect fullscreen applications
        const script = `
          tell application "System Events"
            set frontApp to name of first application process whose frontmost is true
            set frontAppWindows to windows of application process frontApp
            repeat with appWindow in frontAppWindows
              if value of attribute "AXFullScreen" of appWindow is true then
                return "true"
              end if
            end repeat
            return "false"
          end tell
        `;
        
        const { stdout } = await execAsync(`osascript -e '${script}'`);
        this.fullscreenAppCache = stdout.trim() === 'true';
      } else {
        // Detection logic for other platforms
        this.fullscreenAppCache = false;
      }
      
      this.lastFullscreenCheck = now;
      return this.fullscreenAppCache;
    } catch (error) {
      logger.warn('Failed to detect fullscreen app:', error);
      this.fullscreenAppCache = false;
      this.lastFullscreenCheck = now;
      return false;
    }
  }

  /**
   * Refresh window state (optimized, no unnecessary delays)
   */
  async refreshWindowState(window) {
    if (!window || window.isDestroyed()) {return;}

    try {
      // Direct property setting without hide/show cycle
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      window.setAlwaysOnTop(true, 'modal-panel', 2);
      
      // Force focus instead of hide/show cycle
      if (window.isVisible()) {
        window.focus();
        window.moveTop();
      }
    } catch (error) {
      logger.error('Failed to refresh window state:', error);
    }
  }

  /**
   * Refresh window state with hide/show cycle (for stubborn windows)
   */
  async refreshWindowStateDeep(window) {
    if (!window || window.isDestroyed()) {return;}

    try {
      // Only use this for windows that really need the hide/show cycle
      const wasVisible = window.isVisible();
      if (wasVisible) {
        window.hide();
        // Reduced delay from 50ms to 10ms
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Re-set window properties
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      window.setAlwaysOnTop(true, 'modal-panel', 2);
      
      if (wasVisible) {
        window.show();
      }
    } catch (error) {
      logger.error('Failed to deep refresh window state:', error);
    }
  }

  /**
   * Use macOS native methods to force window to front
   */
  async forceWindowToFrontMacOS(window) {
    try {
      // Get the native window ID
      const windowId = window.getNativeWindowHandle().readInt32LE();
      
      // Use native macOS API to force window to front
      const script = `
        tell application "System Events"
          set frontmost of process "oTools" to true
        end tell
      `;
      
      await execAsync(`osascript -e '${script}'`);
      
      // Additional force show
      window.moveTop();
    } catch (error) {
      logger.warn('Failed to force window to front on macOS:', error);
    }
  }

  /**
   * Position window on specified screen
   */
  positionWindowOnScreen(window, targetScreen) {
    try {
      const bounds = window.getBounds();
      const screenBounds = targetScreen.bounds;
      
      // Move window to center of target screen
      const x = screenBounds.x + Math.floor((screenBounds.width - bounds.width) / 2);
      const y = screenBounds.y + Math.floor((screenBounds.height - bounds.height) / 2);
      
      window.setBounds({
        x: x,
        y: y,
        width: bounds.width,
        height: bounds.height
      });
    } catch (error) {
      logger.error('Failed to position window on screen:', error);
    }
  }

  /**
   * Verify if window is actually visible (only for windows that should be visible)
   */
  verifyWindowVisibility(windowId) {
    const config = this.managedWindows.get(windowId);
    if (!config || !config.window || config.window.isDestroyed()) {
      return;
    }

    const { window } = config;
    
    // Only check windows that are supposed to be visible
    // Don't auto-recover hidden windows as user might have intentionally hidden them
    if (!window.isVisible()) {
      return; // Skip hidden windows
    }
    
    try {
      // Check if visible window is within screen bounds
      const bounds = window.getBounds();
      const screens = screen.getAllDisplays();
      
      let isOnScreen = false;
      for (const screenDisplay of screens) {
        const screenBounds = screenDisplay.bounds;
        if (bounds.x < screenBounds.x + screenBounds.width &&
            bounds.x + bounds.width > screenBounds.x &&
            bounds.y < screenBounds.y + screenBounds.height &&
            bounds.y + bounds.height > screenBounds.y) {
          isOnScreen = true;
          break;
        }
      }

      // Only recover if window is visible but off-screen (system may have moved it)
      if (!isOnScreen) {
        logger.warn(`Window ${windowId} is visible but off-screen, repositioning`);
        this.repositionWindow(windowId);
      }
    } catch (error) {
      logger.error(`Failed to verify window visibility for ${windowId}:`, error);
    }
  }

  /**
   * Reposition window to current screen (for off-screen windows)
   */
  repositionWindow(windowId) {
    const config = this.managedWindows.get(windowId);
    if (!config || !config.window || config.window.isDestroyed()) {
      return;
    }

    try {
      const currentScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      this.positionWindowOnScreen(config.window, currentScreen);
      logger.info(`Repositioned off-screen window: ${windowId}`);
    } catch (error) {
      logger.error(`Failed to reposition window ${windowId}:`, error);
    }
  }

  /**
   * Recover invisible windows (only used when explicitly triggered)
   */
  async recoverWindow(windowId) {
    const config = this.managedWindows.get(windowId);
    if (!config || !config.autoRecover) {return;}

    if (config.recoveryAttempts >= config.maxRecoveryAttempts) {
      logger.warn(`Max recovery attempts reached for window: ${windowId}`);
      return;
    }

    config.recoveryAttempts++;
    logger.info(`Attempting to recover window ${windowId} (attempt ${config.recoveryAttempts})`);

    try {
      await this.forceShowWindow(windowId);
      
      // Reset recovery counter if successful
      setTimeout(() => {
        if (config.window && !config.window.isDestroyed() && config.window.isVisible()) {
          config.recoveryAttempts = 0;
        }
      }, 1000);
    } catch (error) {
      logger.error(`Failed to recover window ${windowId}:`, error);
    }
  }

  /**
   * Start periodic visibility checks (only for repositioning off-screen windows)
   */
  startVisibilityCheck() {
    this.checkInterval = setInterval(() => {
      for (const [windowId, config] of this.managedWindows) {
        if (config.checkVisibility && config.window && !config.window.isDestroyed()) {
          const now = Date.now();
          // Check every 60 seconds (reduced frequency)
          if (now - config.lastVisibilityCheck > 60000) {
            config.lastVisibilityCheck = now;
            this.verifyWindowVisibility(windowId);
          }
        }
      }
    }, 30000); // Run check every 30 seconds (reduced frequency)
  }

  /**
   * Destroy the manager
   */
  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.managedWindows.clear();
    logger.info('Enhanced window manager destroyed');
  }
}

module.exports = EnhancedWindowManager;