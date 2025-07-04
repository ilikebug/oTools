// Main renderer process file
class oToolsApp {
  constructor() {
    this.plugins = [];
    this.currentPanel = null;
    this.appStatus = null;
    this.init();
  }

  async init() {
    // Hide all panels on page initialization to prevent accidental display
    document.querySelectorAll('.panel').forEach(panel => {
      panel.style.display = 'none';
    });
    this.bindEvents();
    await this.loadAppStatus();
    await this.loadPlugins();
    this.setupPluginWatcher();
    this.setupStatusUpdates();
    this.renderPluginButtons();
    this.updateStatusDisplay();
    this.loadSettingsFromConfig();
    this.bindSettingsEvents();
  }

  bindEvents() {
    try {
      // Search feature
      const searchInput = document.getElementById('searchInput');
      const searchBtn = document.getElementById('searchBtn');
      
      if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            this.handleSearch();
          }
        });
      } else {
        console.warn('searchInput element not found');
      }
      
      if (searchBtn) {
        searchBtn.addEventListener('click', () => {
          this.handleSearch();
        });
      } else {
        console.warn('searchBtn element not found');
      }

      // Panel close buttons
      const closePanelBtns = document.querySelectorAll('.close-panel-btn');
      if (closePanelBtns.length > 0) {
        closePanelBtns.forEach(btn => {
          btn.addEventListener('click', (e) => {
            const panelId = btn.dataset.panel;
            this.hidePanel(panelId);
          });
        });
      } else {
        console.warn('close-panel-btn element not found');
      }

      // Status update button
      const statusBtn = document.getElementById('statusBtn');
      if (statusBtn) {
        statusBtn.addEventListener('click', () => {
          this.showStatusPanel();
        });
      }

      // Settings button
      const settingsBtn = document.getElementById('settingsBtn');
      if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
          this.showSettingsPanel();
        });
      }

      // Plugins market button
      const pluginsBtn = document.getElementById('pluginsBtn');
      if (pluginsBtn) {
        pluginsBtn.addEventListener('click', () => {
          if (window.oToolsAPI) {
            window.oToolsAPI.openPluginMarket();
          }
        });
      }

    } catch (error) {
      console.error('Error binding events:', error);
    }
  }

  async loadAppStatus() {
    try {
      if (!window.oToolsAPI || !window.oToolsAPI.getAppStatus) {
        throw new Error('oToolsAPI not injected or getAppStatus does not exist');
      }
      this.appStatus = await window.oToolsAPI.getAppStatus();
    } catch (error) {
      console.error('Failed to load application status:', error);
    }
  }

  async loadPlugins() {
    try {
      if (!window.oToolsAPI || !window.oToolsAPI.getPlugins) {
        throw new Error('oToolsAPI not injected or getPlugins does not exist');
      }
      this.plugins = await window.oToolsAPI.getPlugins();
      this.renderPluginButtons();
    } catch (error) {
      console.error('Failed to load plugins:', error);
    }
  }

  setupPluginWatcher() {
    if (!window.oToolsAPI || !window.oToolsAPI.onPluginsChanged) {
      console.error('oToolsAPI not injected or onPluginsChanged does not exist');
      return;
    }
    window.oToolsAPI.onPluginsChanged((plugins) => {
      this.plugins = plugins;
      this.renderPluginButtons();
    });
  }

  setupStatusUpdates() {
    // Periodically update status information
    setInterval(async () => {
      try {
        await this.loadAppStatus();
        this.updateStatusDisplay();
      } catch (error) {
        console.error('Failed to update status:', error);
      }
    }, 30000); // Update every 30 seconds
  }

  // Render all plugins as buttons (regardless of type)
  renderPluginButtons() {
    const actionGrid = document.querySelector('.action-grid');
    if (!actionGrid) {
      console.error('action-grid element not found');
      return;
    }
    
    actionGrid.innerHTML = '';
    if (!this.plugins || this.plugins.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'no-plugins-tip';
      emptyDiv.innerHTML = '<i class="fas fa-box-open" style="font-size:32px;color:#c1c1c1;"></i><div style="margin-top:8px;color:#999;font-size:15px;">No plugins available</div>';
      // emptyDiv.style.display = 'flex';
      // emptyDiv.style.flexDirection = 'column';
      // emptyDiv.style.alignItems = 'center';
      // emptyDiv.style.justifyContent = 'center';
      // emptyDiv.style.width = '100%';
      // emptyDiv.style.height = '100%';
      // emptyDiv.style.position = 'absolute';
      // emptyDiv.style.top = '0';
      // emptyDiv.style.left = '0';
      // emptyDiv.style.right = '0';
      // emptyDiv.style.bottom = '0';
      // actionGrid.style.position = 'relative';
      actionGrid.appendChild(emptyDiv);
      return;
    }
    this.plugins.forEach((plugin, index) => {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'action-btn';
      actionBtn.id = `${plugin.name.replace(/\s+/g, '')}Btn`;
      actionBtn.title = plugin.description;
      
      // Set style based on plugin status
      const isEnabled = plugin.enabled !== false;
      if (!isEnabled) {
        actionBtn.classList.add('disabled');
      }
      
      // Set button content
      actionBtn.innerHTML = `
        <i class="${plugin.icon || 'fas fa-puzzle-piece'}"></i>
        <span>${plugin.shortName || plugin.name}</span>
      `;
      
      // Add click event
      actionBtn.addEventListener('click', () => {
        if (isEnabled) {
          this.executePlugin(plugin.name);
        }
      });
      
      actionGrid.appendChild(actionBtn);
    });
  }

  // General plugin execution logic
  async executePlugin(pluginName) {
    try {
      if (!window.oToolsAPI || !window.oToolsAPI.executePlugin) {
        throw new Error('oToolsAPI not injected or executePlugin does not exist');
      }
      const result = await window.oToolsAPI.executePlugin(pluginName);
      if (!result && !result.success) {
        this.showNotification(`Plugin execution failed: ${result.message}`, 'error');
      }
    } catch (error) {
      this.showNotification(`Plugin execution error: ${error.message}`, 'error');
    }
  }

  async showStatusPanel() {
    try {
      const statusPanel = document.getElementById('statusPanel');
      if (statusPanel) {
        const content = statusPanel.querySelector('.panel-content');
        if (content) {
          content.innerHTML = this.renderStatusContent();
        }
        this.showPanel('statusPanel');
      }
    } catch (error) {
      console.error('Failed to display status panel:', error);
    }
  }

  renderStatusContent() {
    return `
      <div class="status-content">
        <h3>Application status</h3>
        <div class="status-grid">
          <div class="status-item">
            <label>Status:</label>
            <span class="status-value ${this.appStatus?.status || 'unknown'}">${this.appStatus?.status || 'Unknown'}</span>
          </div>
          <div class="status-item">
            <label>Running time:</label>
            <span class="status-value">${this.formatUptime(this.appStatus?.uptime || 0)}</span>
          </div>
          <div class="status-item">
            <label>Component count:</label>
            <span class="status-value">${this.appStatus?.componentCount || 0}</span>
          </div>
          <div class="status-item">
            <label>Plugin count:</label>
            <span class="status-value">${this.plugins.length}</span>
          </div>
        </div>
      </div>
    `;
  }

  async showSettingsPanel() {
    try {
      const settingsPanel = document.getElementById('settingsPanel');
      if (settingsPanel) {
        this.showPanel('settingsPanel');
      }
    } catch (error) {
      console.error('Failed to display status panel:', error);
    }
  }

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} days ${hours % 24} hours`;
    if (hours > 0) return `${hours} hours ${minutes % 60} minutes`;
    if (minutes > 0) return `${minutes} minutes ${seconds % 60} seconds`;
    return `${seconds} seconds`;
  }

  updateStatusDisplay() {
    const statusIndicator = document.getElementById('statusIndicator');
    if (statusIndicator && this.appStatus) {
      statusIndicator.className = `status-indicator ${this.appStatus.status}`;
      statusIndicator.title = `Application status: ${this.appStatus.status}`;
    }
  }

  handleSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;
    const matchedPlugins = this.plugins.filter(plugin => 
      plugin.name.toLowerCase().includes(query.toLowerCase()) ||
      plugin.description.toLowerCase().includes(query.toLowerCase())
    );
    if (matchedPlugins.length > 0) {
      this.highlightPlugins(matchedPlugins);
    } else {
      this.showNotification('No related plugins found', 'warning');
    }
  }

  highlightPlugins(matchedPlugins) {
    const pluginCards = document.querySelectorAll('.action-btn');
    pluginCards.forEach(card => {
      const pluginName = card.querySelector('span').textContent.trim();
      const isMatched = matchedPlugins.some(plugin => plugin.shortName === pluginName || plugin.name === pluginName);
      card.style.opacity = isMatched ? '1' : '0.3';
      card.style.transform = isMatched ? 'scale(1.02)' : 'scale(1)';
    });
  }

  showPanel(panelId) {
    this.hideAllPanels();
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.style.display = 'block';
      this.currentPanel = panelId;
    }
  }

  hidePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.style.display = 'none';
      if (this.currentPanel === panelId) this.currentPanel = null;
    }
  }

  hideAllPanels() {
    document.querySelectorAll('.panel').forEach(panel => {
      panel.style.display = 'none';
    });
    this.currentPanel = null;
  }

  togglePluginsSection() {
    const pluginsSection = document.getElementById('pluginsSection');
    if (pluginsSection) {
      const isVisible = pluginsSection.style.display !== 'none';
      pluginsSection.style.display = isVisible ? 'none' : 'block';
    }
  }

  showNotification(message, type = 'info') {
    if (window.oToolsAPI && window.oToolsAPI.showSystemNotification) {
      let title = 'Notification';
      if (type === 'success') title = 'Success';
      if (type === 'error') title = 'Error';
      if (type === 'warning') title = 'Warning';
      window.oToolsAPI.showSystemNotification(title, message);
      return;
    }
  }

  getNotificationIcon(type) {
    const icons = {
      success: 'fas fa-check-circle',
      error: 'fas fa-exclamation-circle',
      warning: 'fas fa-exclamation-triangle',
      info: 'fas fa-info-circle'
    };
    return icons[type] || icons.info;
  }

  async loadSettingsFromConfig() {
    if (!window.oToolsAPI || !window.oToolsAPI.getConfig) return;
    const config = await window.oToolsAPI.getConfig('main');
    if (!config) return;
    // Auto start
    const autoStart = document.getElementById('autoStart');
    if (autoStart) autoStart.checked = !!config.app?.autoStart;
    // Auto load plugins
    const autoLoadPlugins = document.getElementById('autoLoadPlugins');
    if (autoLoadPlugins) autoLoadPlugins.checked = !!config.plugins?.autoLoad;
    // Shortcut
    const toggleShortcut = document.getElementById('toggleShortcut');
    if (toggleShortcut) {
      const shortcut = config.shortcuts?.toggle || '';
      if (shortcut) {
        // Format for display
        const isMac = /mac/i.test(navigator.userAgent);
        const displayShortcut = shortcut.split('+').map(k => {
          if (k === 'Meta') return isMac ? 'Command' : 'Win';
          if (k === 'Alt') return isMac ? 'Option' : 'Alt';
          return k;
        }).join('+');
        toggleShortcut.value = displayShortcut;
      } else {
        toggleShortcut.value = '';
      }
    }
  }

  bindSettingsEvents() {
    // Auto start
    const autoStart = document.getElementById('autoStart');
    if (autoStart) {
      autoStart.addEventListener('change', async (e) => {
        const config = await window.oToolsAPI.getConfig('main');
        config.app = config.app || {};
        config.app.autoStart = !!e.target.checked;
        await window.oToolsAPI.setConfig('main', config);
      });
    }
    // Auto load plugins
    const autoLoadPlugins = document.getElementById('autoLoadPlugins');
    if (autoLoadPlugins) {
      autoLoadPlugins.addEventListener('change', async (e) => {
        const config = await window.oToolsAPI.getConfig('main');
        config.plugins = config.plugins || {};
        config.plugins.autoLoad = !!e.target.checked;
        await window.oToolsAPI.setConfig('main', config);
      });
    }
    // Shortcut capture
    this.captureShortcutInput('toggleShortcut', ['shortcuts', 'toggle']);
  }

  captureShortcutInput(inputId, configPath) {
    const input = document.getElementById(inputId);
    if (!input) {
      console.error('Input element not found:', inputId);
      return;
    }
    let lastValue = input.value;
    let pressedKeys = new Set();
    let displayKeys = [];
    let keyOrder = [];
    let keydownListener;

    // Helper: convert Set to shortcut string
    function getShortcutString(keys) {
      // Ensure modifier key order
      const order = ['Meta', 'Ctrl', 'Alt', 'Shift'];
      let arr = [];
      for (let o of order) {
        if (keys.has(o)) arr.push(o);
      }
      // Other keys
      for (let k of keys) {
        if (!order.includes(k)) arr.push(k);
      }
      return arr.join('+');
    }

    // Helper: format shortcut for display
    function formatShortcutForDisplay(shortcut) {
      const isMac = /mac/i.test(navigator.userAgent);
      return shortcut.split('+').map(k => {
        if (k === 'Meta') return isMac ? 'Command' : 'Win';
        if (k === 'Alt') return isMac ? 'Option' : 'Alt';
        return k;
      }).join('+');
    }

    function normalizeKey(e) {
      if (e.key === 'Control') return 'Ctrl';
      if (e.key === 'Meta') return 'Meta';
      if (e.key === 'Alt') return 'Alt';
      if (e.key === 'Shift') return 'Shift';
      // Use event.code for physical key, not affected by modifiers
      if (e.code.startsWith('Key')) return e.code.slice(3).toUpperCase();
      if (e.code.startsWith('Digit')) return e.code.slice(5);
      // Function keys
      if (e.code.startsWith('F') && e.code.length <= 3) return e.code;
      // Other special keys
      return e.code;
    }

    function isValidShortcut(keys) {
      const modifiers = ['Meta', 'Ctrl', 'Alt', 'Shift'];
      return [...keys].some(k => !modifiers.includes(k));
    }

    keydownListener = (e) => {
      e.preventDefault();
      const key = normalizeKey(e);
      if (!pressedKeys.has(key)) {
        pressedKeys.add(key);
        keyOrder.push(key);
      }
      // Keep unique order
      displayKeys = keyOrder.filter((k, i) => keyOrder.indexOf(k) === i);
      input.value = formatShortcutForDisplay(getShortcutString(new Set(displayKeys)));
    };

    input.addEventListener('focus', () => {
      lastValue = input.value;
      input.value = 'Press shortcut...';
      pressedKeys.clear();
      displayKeys = [];
      keyOrder = [];
      document.addEventListener('keydown', keydownListener);
    });
    
    input.addEventListener('blur', () => {
      if (pressedKeys.size > 0 && displayKeys.length > 0) {
        if (isValidShortcut(displayKeys)) {
          const shortcut = getShortcutString(new Set(displayKeys));
          input.value = formatShortcutForDisplay(shortcut);
          // Save to config
          window.oToolsAPI.getConfig('main').then(config => {
            let obj = config;
            for (let i = 0; i < configPath.length - 1; i++) {
              if (!obj[configPath[i]]) obj[configPath[i]] = {};
              obj = obj[configPath[i]];
            }
            obj[configPath[configPath.length - 1]] = shortcut;
            window.oToolsAPI.setConfig('main', config).then(() => {
              if (window.oToolsAPI.refreshShortcut) {
                window.oToolsAPI.refreshShortcut();
              }
            document.removeEventListener('keydown', keydownListener);
            }).catch(err => {
              console.error('Failed to save config:', err);
            });
          }).catch(err => {
            console.error('Failed to get config:', err);
          });
        } else {
          // Only modifier keys, do not save, restore last value
          input.value = lastValue;
          document.removeEventListener('keydown', keydownListener);
        }
      }
      if (input.value === 'Press shortcut...') input.value = lastValue;
    });
  }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  window.oToolsApp = new oToolsApp();
}); 