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
    this.setAppCompleteWatcher();
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
          if (window.mainWindow) {
            window.mainWindow.openPluginMarket();
          }
        });
      }

      // GitHub Token save button
      const saveBtn = document.getElementById('saveGithubTokenBtn');
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const input = document.getElementById('githubTokenInput');
          if (input) {
            const token = input.value.trim();
            let config = await window.mainWindow.getConfig('main') || {};
            config.githubToken = token;
            await window.mainWindow.setConfig('main', config);
            alert('GitHub Token saved!');
          }
        });
      }
    } catch (error) {
      console.error('Error binding events:', error);
    }
  }

  async loadAppStatus() {
    try {
      if (!window.mainWindow || !window.mainWindow.getAppStatus) {
        throw new Error('mainWindow not injected or getAppStatus does not exist');
      }
      this.appStatus = await window.mainWindow.getAppStatus();
    } catch (error) {
      console.error('Failed to load application status:', error);
    }
  }

  async loadPlugins() {
    try {
      if (!window.mainWindow || !window.mainWindow.getPlugins) {
        throw new Error('mainWindow not injected or getPlugins does not exist');
      }
      this.plugins = await window.mainWindow.getPlugins();
      this.renderPluginButtons();
    } catch (error) {
      console.error('Failed to load plugins:', error);
    }
  }

  setAppCompleteWatcher() {
    if (!window.mainWindow || !window.mainWindow.onPluginsChanged) {
      console.error('mainWindow not injected or onAppInitCompleted does not exist');
      return;
    }
    window.mainWindow.onAppInitCompleted(async () => {
      await this.loadAppStatus();
      await this.loadPlugins();
      this.updateStatusDisplay();
    });
  }

  setupPluginWatcher() {
    if (!window.mainWindow || !window.mainWindow.onPluginsChanged) {
      console.error('mainWindow not injected or onPluginsChanged does not exist');
      return;
    }
    window.mainWindow.onPluginsChanged((plugins) => {
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
      actionGrid.appendChild(emptyDiv);
      return;
    }
    this.plugins.forEach((plugin, index) => {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'action-btn';
      actionBtn.id = `${plugin.name.replace(/\s+/g, '')}Btn`;
      actionBtn.title = plugin.description;
      const isEnabled = plugin.enabled !== false;
      if (!isEnabled) {
        actionBtn.classList.add('disabled');
      }
      let iconHtml = '';
      if (plugin.icon && (plugin.icon.endsWith('.png') || plugin.icon.endsWith('.jpg') || plugin.icon.endsWith('.jpeg') || plugin.icon.endsWith('.svg'))) {
        iconHtml = `<img class="plugin-icon" src="${plugin.icon}" onerror="this.style.display='none';this.parentNode.innerHTML='<i class='fas fa-puzzle-piece'></i>';" />`;
      }
      actionBtn.innerHTML = `
        <div class="plugin-icon-wrap">${iconHtml}</div>
        <span>${plugin.shortName || plugin.name}</span>
        <div class="plugin-config-dropdown">
          <i class="fas fa-ellipsis-v"></i>
          <div class="dropdown-content">
            <div class="dropdown-item" data-action="configure" data-plugin="${plugin.name}">
              <i class="fas fa-cog"></i> Configure
            </div>
            <div class="dropdown-item" data-action="show" data-plugin="${plugin.name}">
              <i class="fas fa-eye"></i> Show Window
            </div>
            <div class="dropdown-item" data-action="hide" data-plugin="${plugin.name}">
              <i class="fas fa-eye-slash"></i> Hide Window
            </div>
          </div>
        </div>
      `;
 
      actionBtn.addEventListener('click', () => {
        if (isEnabled) {
          this.executePlugin(plugin.name);
        }
      });

      const dropdown = actionBtn.querySelector('.plugin-config-dropdown');
      if (dropdown) {
        dropdown.addEventListener('click', (e) => {
          e.stopPropagation(); 
        });

        const dropdownItems = dropdown.querySelectorAll('.dropdown-item');
        dropdownItems.forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = item.dataset.action;
            const pluginName = item.dataset.plugin;
            this.handlePluginAction(action, pluginName);
          });
        });
      }
      actionGrid.appendChild(actionBtn);
    });
  }

  // General plugin execution logic
  async executePlugin(pluginName) {
    try {
      if (!window.mainWindow || !window.mainWindow.executePlugin) {
        throw new Error('mainWindow not injected or executePlugin does not exist');
      }
      const result = await window.mainWindow.executePlugin(pluginName);
      if (!result && !result.success) {
        this.showNotification(`Plugin execution failed: ${result.message}`, 'error');
      }
    } catch (error) {
      this.showNotification(`Plugin execution error: ${error.message}`, 'error');
    }
  }

  async handlePluginAction(action, pluginName) {
    try {
      switch (action) {
        case 'configure':
          this.showPluginConfigDialog(pluginName);
          break;
        case 'show':
          if (window.mainWindow && window.mainWindow.showPluginWindow) {
            const result = await window.mainWindow.showPluginWindow(pluginName);
            if (result.success) {
              console.log(result.message);
            } else {
              console.error(result.message)
              this.showNotification(result.message, 'warning')
            }
          }
          break;
        case 'hide':
          if (window.mainWindow && window.mainWindow.hidePluginWindow) {
            const result = await window.mainWindow.hidePluginWindow(pluginName);
            if (result.success) {
              console.log(result.message);
            } else {
              console.error(result.message)
              this.showNotification(result.message, 'warning')
            }
          }
          break;
        default:
          console.warn('Unknown plugin action:', action);
      }
    } catch (error) {
      console.error('Plugin action failed:', error);
      this.showNotification(`Plugin action failed: ${error.message}`, 'error');
    }
  }

  showPluginConfigDialog(pluginName) {
    const plugin = this.plugins.find(p => p.name === pluginName);
    if (!plugin) {
      this.showNotification(`Plugin ${pluginName} not found`, 'error');
      return;
    }

    const dialog = document.createElement('div');
    dialog.className = 'plugin-config-dialog';
    dialog.innerHTML = `
      <div class="dialog-overlay"></div>
      <div class="dialog-content">
        <div class="dialog-header">
          <h3>Configure ${plugin.name}</h3>
          <button class="dialog-close-btn">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="dialog-body">
          <div class="settings-section">
            <h4>Plugin Settings</h4>
            <div class="setting-item">
              <label>Startup Mode:</label>
              <select id="pluginStartupMode_${pluginName}">
                <option value="independent" ${plugin.startupMode === 'independent' ? 'selected' : ''}>Independent (Close on X)</option>
                <option value="dependent" ${plugin.startupMode === 'dependent' ? 'selected' : ''}>Dependent (Follow Main App)</option>
              </select>
            </div>
            <div class="setting-item">
              <label>Enabled:</label>
              <input type="checkbox" id="pluginEnabled_${pluginName}" ${plugin.enabled !== false ? 'checked' : ''} />
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="dialog-save-btn">Save</button>
          <button class="dialog-cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    const closeBtn = dialog.querySelector('.dialog-close-btn');
    const cancelBtn = dialog.querySelector('.dialog-cancel-btn');
    const saveBtn = dialog.querySelector('.dialog-save-btn');

    console.log('Buttons found:', { closeBtn, cancelBtn, saveBtn });

    const closeDialog = () => {
      document.body.removeChild(dialog);
    };

    closeBtn.addEventListener('click', closeDialog);
    cancelBtn.addEventListener('click', closeDialog);

    saveBtn.addEventListener('click', async () => {
      try {
        console.log('Save button clicked for plugin:', pluginName);
        
        const startupModeSelect = dialog.querySelector(`#pluginStartupMode_${pluginName}`);
        const enabledCheckbox = dialog.querySelector(`#pluginEnabled_${pluginName}`);
        
        if (!startupModeSelect) {
          console.error('Startup mode select not found');
          this.showNotification('Configuration element not found', 'error');
          return;
        }
        
        if (!enabledCheckbox) {
          console.error('Enabled checkbox not found');
          this.showNotification('Configuration element not found', 'error');
          return;
        }
        
        const startupMode = startupModeSelect.value;
        const enabled = enabledCheckbox.checked;
        
        console.log('Config values:', { startupMode, enabled });

        if (window.mainWindow && window.mainWindow.setPluginConfig) {
          const result = await window.mainWindow.setPluginConfig(pluginName, {
            startupMode,
            enabled
          });
          console.log('Save result:', result);
          
          if (result.success) {
            this.showNotification('Plugin configuration saved successfully!', 'success');
            await this.loadPlugins();
            this.renderPluginButtons();
          } else {
            this.showNotification(result.message, 'error');
          }
        } else {
          console.error('setPluginConfig method not available');
          this.showNotification('Plugin configuration method not available', 'error');
        }
        closeDialog();
      } catch (error) {
        console.error('Failed to save plugin config:', error);
        this.showNotification(`Failed to save configuration: ${error.message}`, 'error');
      }
    });

    document.body.appendChild(dialog);
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
            <label>Running plugins:</label>
            <span class="status-value">${this.appStatus?.runningPluginsCount || 0}</span>
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
        await this.loadSettingsFromConfig();
        this.showPanel('settingsPanel');
      }
    } catch (error) {
      console.error('Failed to display settings panel:', error);
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
      panel.style.display = 'flex';
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
    if (window.mainWindow && window.mainWindow.showSystemNotification) {
      let title = 'Notification';
      if (type === 'success') title = 'Success';
      if (type === 'error') title = 'Error';
      if (type === 'warning') title = 'Warning';
      window.mainWindow.showSystemNotification(title, message);
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
    if (!window.mainWindow || !window.mainWindow.getConfig) return;
    const config = await window.mainWindow.getConfig('main');
    if (!config) return;
    // Auto start
    const autoStart = document.getElementById('autoStart');
    if (autoStart) autoStart.checked = !!config.app?.autoStart;
    // Auto load plugins
    const autoLoadPlugins = document.getElementById('autoLoadPlugins');
    if (autoLoadPlugins) autoLoadPlugins.checked = !!config.plugins?.autoLoad;

    // GitHub Token
    const githubTokenInput = document.getElementById('githubTokenInput');
    if (githubTokenInput) {
      githubTokenInput.value = config.githubToken || '';
    }
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
        const config = await window.mainWindow.getConfig('main');
        config.app = config.app || {};
        config.app.autoStart = !!e.target.checked;
        await window.mainWindow.setConfig('main', config);
      });
    }
    // Auto load plugins
    const autoLoadPlugins = document.getElementById('autoLoadPlugins');
    if (autoLoadPlugins) {
      autoLoadPlugins.addEventListener('change', async (e) => {
        const config = await window.mainWindow.getConfig('main');
        config.plugins = config.plugins || {};
        config.plugins.autoLoad = !!e.target.checked;
        await window.mainWindow.setConfig('main', config);
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
          window.mainWindow.getConfig('main').then(config => {
            let obj = config;
            for (let i = 0; i < configPath.length - 1; i++) {
              if (!obj[configPath[i]]) obj[configPath[i]] = {};
              obj = obj[configPath[i]];
            }
            obj[configPath[configPath.length - 1]] = shortcut;
            window.mainWindow.setConfig('main', config).then(() => {
              if (window.mainWindow.refreshShortcut) {
                window.mainWindow.refreshShortcut();
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