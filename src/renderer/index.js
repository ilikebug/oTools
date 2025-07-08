// Main renderer process file
class oToolsApp {
  constructor() {
    this.plugins = [];
    this.currentPanel = null;
    this.appStatus = null;
    this.init();
  }

  // Unified IPC call method to reduce repetitive window.mainWindow checks
  async callMainWindow(method, ...args) {
    if (!window.mainWindow) {
      throw new Error('mainWindow not available');
    }
    if (typeof window.mainWindow[method] !== 'function') {
      throw new Error(`Method ${method} not available on mainWindow`);
    }
    return await window.mainWindow[method](...args);
  }

  // Unified shortcut handling functions
  _getShortcutString(keys) {
    // Uppercase, sort, deduplicate
    return Array.from(new Set(Array.from(keys).map(k => k.toUpperCase()))).sort().join('+');
  }

  _formatShortcutForDisplay(shortcut) {
    if (!shortcut) return '';
    return shortcut.split('+').map(key => {
      const keyMap = {
        'CONTROL': 'Ctrl',
        'META': 'Cmd',
        'ALT': 'Alt',
        'SHIFT': 'Shift'
      };
      return keyMap[key] || key;
    }).join('+');
  }

  // Restore shortcut capture logic to the original implementation
  // Ensure _normalizeKey only returns the main key name as a string
  // Ensure _isValidShortcut only allows modifier + main key
  captureShortcutInput(inputId, configPath) {
    const input = document.getElementById(inputId);
    if (!input) {
      console.error('Input element not found:', inputId);
      return;
    }
    let lastValue = input.value;
    let pressedKeys = new Set();
    let keydownListener;
    let keyupListener;
    let finished = false;

    keydownListener = (e) => {
      if (finished) return;
      e.preventDefault();
      const key = this._normalizeKey(e).toUpperCase();
      pressedKeys.add(key);
      input.value = this._formatShortcutForDisplay(this._getShortcutString(pressedKeys));
    };
    keyupListener = (e) => {
      if (finished) return;
      finished = true;
      if (pressedKeys.size > 0) {
        if (this._isValidShortcut(pressedKeys)) {
          const shortcut = this._getShortcutString(pressedKeys);
          input.value = this._formatShortcutForDisplay(shortcut);
          // Save to config
          this.callMainWindow('getConfig', 'main').then(config => {
            let obj = config;
            for (let i = 0; i < configPath.length - 1; i++) {
              if (!obj[configPath[i]]) obj[configPath[i]] = {};
              obj = obj[configPath[i]];
            }
            obj[configPath[configPath.length - 1]] = shortcut;
            this.callMainWindow('setConfig', 'main', config).then(() => {
              this.callMainWindow('refreshShortcut');
            }).catch(err => {
              console.error('Failed to save config:', err);
            });
          }).catch(err => {
            console.error('Failed to get config:', err);
          });
        } else {
          input.value = lastValue;
        }
      } else {
        input.value = lastValue;
      }
      document.removeEventListener('keydown', keydownListener);
      document.removeEventListener('keyup', keyupListener);
      input.blur();
    };
    input.addEventListener('focus', () => {
      lastValue = input.value;
      input.value = 'Press shortcut...';
      pressedKeys.clear();
      finished = false;
      document.addEventListener('keydown', keydownListener);
      document.addEventListener('keyup', keyupListener);
    });
    input.addEventListener('blur', () => {
      document.removeEventListener('keydown', keydownListener);
      document.removeEventListener('keyup', keyupListener);
      if (input.value === 'Press shortcut...') input.value = lastValue;
    });
  }

  _normalizeKey(e) {
    const keyMap = {
      'Control': 'CTRL',
      'Meta': 'META',
      'Alt': 'ALT',
      'Shift': 'SHIFT',
      ' ': 'SPACE',
      'Space': 'SPACE',
      'Escape': 'ESC',
      'Tab': 'TAB',
      'Enter': 'ENTER',
      'Backspace': 'BACKSPACE',
      'Delete': 'DELETE',
      'ArrowUp': 'UP',
      'ArrowDown': 'DOWN',
      'ArrowLeft': 'LEFT',
      'ArrowRight': 'RIGHT',
      'Home': 'HOME',
      'End': 'END',
      'PageUp': 'PAGEUP',
      'PageDown': 'PAGEDOWN'
    };
    if (keyMap[e.key]) return keyMap[e.key];
    if (keyMap[e.code]) return keyMap[e.code];
    if (/^F\d{1,2}$/i.test(e.key)) return e.key.toUpperCase();
    if (e.code && e.code.startsWith('Key')) return e.code.slice(3).toUpperCase();
    if (e.code && e.code.startsWith('Digit')) return e.code.slice(5);
    if (e.key.length === 1) return e.key.toUpperCase();
    return e.key.toUpperCase();
  }

  _isValidShortcut(keys) {
    if (!keys || keys.size === 0) return false;
    const arr = Array.from(keys);
    const modifiers = ['CTRL', 'META', 'ALT', 'SHIFT'];
    const hasModifier = arr.some(k => modifiers.includes(k));
    const hasNonModifier = arr.some(k => !modifiers.includes(k));
    return hasModifier && hasNonModifier;
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
          this.callMainWindow('openPluginMarket');
        });
      }

      // GitHub Token save button
      const saveBtn = document.getElementById('saveGithubTokenBtn');
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const input = document.getElementById('githubTokenInput');
          if (input) {
            const token = input.value.trim();
            let config = await this.callMainWindow('getConfig', 'main') || {};
            config.githubToken = token;
            await this.callMainWindow('setConfig', 'main', config);
            alert('GitHub Token saved!');
          }
        });
      }



      // Top quit button
      const quitBtnTop = document.getElementById('quitBtnTop');
      if (quitBtnTop) {
        quitBtnTop.addEventListener('click', () => {
          if (confirm('Are you sure you want to exit the application?')) {
            this.callMainWindow('quitApp');
          }
        });
      }
    } catch (error) {
      console.error('Error binding events:', error);
    }
  }

  async loadAppStatus() {
    try {
      this.appStatus = await this.callMainWindow('getAppStatus');
    } catch (error) {
      console.error('Failed to load application status:', error);
    }
  }

  async loadPlugins() {
    try {
      this.plugins = await this.callMainWindow('getPlugins');
      this.renderPluginButtons();
    } catch (error) {
      console.error('Failed to load plugins:', error);
    }
  }

  setAppCompleteWatcher() {
    try {
      window.mainWindow.onAppInitCompleted(async () => {
        await this.loadAppStatus();
        await this.loadPlugins();
        this.updateStatusDisplay();
      });
    } catch (error) {
      console.error('mainWindow not injected or onAppInitCompleted does not exist');
    }
  }

  setupPluginWatcher() {
    try {
      window.mainWindow.onPluginsChanged((plugins) => {
        this.plugins = plugins;
        this.renderPluginButtons();
      });
    } catch (error) {
      console.error('mainWindow not injected or onPluginsChanged does not exist');
    }
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
            <div class="dropdown-item" data-action="uninstall" data-plugin="${plugin.name}">
              <i class="fas fa-trash"></i> Uninstall
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
      const result = await this.callMainWindow('executePlugin', pluginName);
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
          const showResult = await this.callMainWindow('showPluginWindow', pluginName);
          if (!showResult.success) {
            console.error(showResult.message)
            this.showNotification(showResult.message, 'warning')
          }
          break;
        case 'uninstall':
          const uninstallResult = await this.callMainWindow('uninstallPlugin', pluginName, );
          if (!uninstallResult.success) {
            console.error(uninstallResult.message)
            this.showNotification(uninstallResult.message, 'warning')
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
            <div class="setting-item">
              <label>Hide on Blur:</label>
              <input type="checkbox" id="pluginHideOnBlur_${pluginName}" ${(plugin.ui && plugin.ui.hideOnBlur) ? 'checked' : ''} />
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

    // Dialog buttons initialized

    const closeDialog = () => {
      document.body.removeChild(dialog);
    };

    closeBtn.addEventListener('click', closeDialog);
    cancelBtn.addEventListener('click', closeDialog);

    saveBtn.addEventListener('click', async () => {
      try {
        // Save button clicked for plugin configuration
        
        const startupModeSelect = dialog.querySelector(`#pluginStartupMode_${pluginName}`);
        const enabledCheckbox = dialog.querySelector(`#pluginEnabled_${pluginName}`);
        const hideOnBlurCheckbox = dialog.querySelector(`#pluginHideOnBlur_${pluginName}`);
        
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
        const hideOnBlur = hideOnBlurCheckbox ? hideOnBlurCheckbox.checked : false;
        
        const oldUi = plugin.ui || {};
        const ui = { ...oldUi, hideOnBlur };
        
        const result = await this.callMainWindow('setPluginConfig', pluginName, {
          startupMode,
          enabled,
          ui
        });
        // Plugin configuration saved
        
        if (result.success) {
          this.showNotification('Plugin configuration saved successfully!', 'success');
          await this.loadPlugins();
          this.renderPluginButtons();
        } else {
          this.showNotification(result.message, 'error');
        }
      } catch (error) {
        console.error('setPluginConfig method not available:', error);
        this.showNotification('Plugin configuration method not available', 'error');
      }
      closeDialog();
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
    try {
      let title = 'Notification';
      if (type === 'success') title = 'Success';
      if (type === 'error') title = 'Error';
      if (type === 'warning') title = 'Warning';
      this.callMainWindow('showSystemNotification', title, message);
    } catch (error) {
      console.error('Failed to show system notification:', error);
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
    try {
      const config = await this.callMainWindow('getConfig', 'main');
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

      // Load custom shortcuts
      await this.loadCustomShortcuts();
    } catch (error) {
      console.error('Failed to load settings from config:', error);
    }
  }

  bindSettingsEvents() {
    // Auto start
    const autoStart = document.getElementById('autoStart');
    if (autoStart) {
      autoStart.addEventListener('change', async (e) => {
        try {
          const config = await this.callMainWindow('getConfig', 'main');
          config.app = config.app || {};
          config.app.autoStart = !!e.target.checked;
          await this.callMainWindow('setConfig', 'main', config);
        } catch (error) {
          console.error('Failed to update auto start setting:', error);
        }
      });
    }
    // Auto load plugins
    const autoLoadPlugins = document.getElementById('autoLoadPlugins');
    if (autoLoadPlugins) {
      autoLoadPlugins.addEventListener('change', async (e) => {
        try {
          const config = await this.callMainWindow('getConfig', 'main');
          config.plugins = config.plugins || {};
          config.plugins.autoLoad = !!e.target.checked;
          await this.callMainWindow('setConfig', 'main', config);
        } catch (error) {
          console.error('Failed to update auto load plugins setting:', error);
        }
      });
    }

    // Shortcut capture
    this.captureShortcutInput('toggleShortcut', ['shortcuts', 'toggle']);

    // Custom shortcuts
    this.bindCustomShortcutsEvents();
  }

  // Custom shortcuts methods
  async loadCustomShortcuts() {
    try {
      const shortcuts = await this.callMainWindow('getCustomShortcuts');
      this.renderCustomShortcuts(shortcuts);
    } catch (error) {
      console.error('Failed to load custom shortcuts:', error);
    }
  }

  renderCustomShortcuts(shortcuts) {
    const container = document.getElementById('customShortcutsList');
    if (!container) return;

    container.innerHTML = '';
    
    shortcuts.forEach((shortcut, index) => {
      const shortcutElement = this.createShortcutElement(shortcut, index);
      container.appendChild(shortcutElement);
    });
  }

  createShortcutElement(shortcut, index) {
    const div = document.createElement('div');
    div.className = 'shortcut-item';
    div.innerHTML = `
      <div style="flex: 1;">
        <div class="plugin-label">Plugin</div>
        <select class="plugin-select" data-index="${index}">
          <option value="">Select Plugin</option>
        </select>
      </div>
      <div style="flex: 1;">
        <div class="shortcut-label">Shortcut</div>
        <input type="text" class="shortcut-input" data-index="${index}" readonly placeholder="Press shortcut..." />
      </div>
      <button class="remove-btn" data-index="${index}" title="Remove shortcut">
        <i class="fas fa-trash"></i>
      </button>
    `;

    this.populatePluginOptions(div.querySelector('.plugin-select'), shortcut.pluginName);

    // Set accelerator value
    if (shortcut.accelerator) {
      const isMac = /mac/i.test(navigator.userAgent);
      const displayShortcut = shortcut.accelerator.split('+').map(k => {
        if (k === 'Meta') return isMac ? 'Command' : 'Win';
        if (k === 'Alt') return isMac ? 'Option' : 'Alt';
        return k;
      }).join('+');
      div.querySelector('.shortcut-input').value = displayShortcut;
    }

    return div;
  }

  async populatePluginOptions(selectElement, valueToSet) {
    try {
      const plugins = await this.callMainWindow('getPluginNames');
      plugins.forEach(plugin => {
        const option = document.createElement('option');
        option.value = plugin.name;
        option.textContent = plugin.shortName || plugin.name;
        selectElement.appendChild(option);
      });
      if (valueToSet) selectElement.value = valueToSet;
    } catch (error) {
      console.error('Failed to load plugin names:', error);
    }
  }

  bindCustomShortcutsEvents() {
    const addBtn = document.getElementById('addShortcutBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.addCustomShortcut();
      });
    }

    // Bind events for existing shortcuts
    this.bindShortcutItemEvents();
  }

  bindShortcutItemEvents() {
    const container = document.getElementById('customShortcutsList');
    if (!container) return;

    // Plugin select change
    container.addEventListener('change', (e) => {
      if (e.target.classList.contains('plugin-select')) {
        this.updateCustomShortcuts();
      }
    });

    // Remove button click
    container.addEventListener('click', (e) => {
      if (e.target.closest('.remove-btn')) {
        const index = e.target.closest('.remove-btn').dataset.index;
        this.removeCustomShortcut(parseInt(index));
      }
    });

    // Shortcut input focus
    container.addEventListener('focusin', (e) => {
      if (e.target.classList.contains('shortcut-input')) {
        this.captureCustomShortcutInput(e.target);
      }
    });
  }

  addCustomShortcut() {
    const container = document.getElementById('customShortcutsList');
    if (!container) return;

    const shortcuts = Array.from(container.children).map((item, index) => ({
      pluginName: item.querySelector('.plugin-select').value,
      accelerator: this.getShortcutValue(item.querySelector('.shortcut-input'))
    }));

    // Add new empty shortcut
    shortcuts.push({ pluginName: '', accelerator: '' });

    this.renderCustomShortcuts(shortcuts);
    this.bindShortcutItemEvents();
  }

  removeCustomShortcut(index) {
    const container = document.getElementById('customShortcutsList');
    if (!container) return;

    const shortcuts = Array.from(container.children).map((item, i) => ({
      pluginName: item.querySelector('.plugin-select').value,
      accelerator: this.getShortcutValue(item.querySelector('.shortcut-input'))
    }));

    shortcuts.splice(index, 1);
    this.renderCustomShortcuts(shortcuts);
    this.bindShortcutItemEvents();
    this.updateCustomShortcuts();
  }

  getShortcutValue(inputElement) {
    const value = inputElement.value;
    if (!value || value === 'Press shortcut...') return '';
    
    const isMac = /mac/i.test(navigator.userAgent);
    return value.split('+').map(k => {
      if (k === 'Command' && isMac) return 'Meta';
      if (k === 'Win' && !isMac) return 'Meta';
      if (k === 'Option' && isMac) return 'Alt';
      return k;
    }).join('+');
  }

  captureCustomShortcutInput(inputElement) {
    const lastValue = inputElement.value;
    let pressedKeys = new Set();
    let keydownListener;
    let keyupListener;
    let finished = false;

    keydownListener = (e) => {
      if (finished) return;
      e.preventDefault();
      const key = this._normalizeKey(e).toUpperCase();
      pressedKeys.add(key);
      inputElement.value = this._formatShortcutForDisplay(this._getShortcutString(pressedKeys));
    };
    keyupListener = (e) => {
      if (finished) return;
      finished = true;
      if (pressedKeys.size > 0) {
        if (this._isValidShortcut(pressedKeys)) {
          const shortcut = this._getShortcutString(pressedKeys);
          inputElement.value = this._formatShortcutForDisplay(shortcut);
          this.updateCustomShortcuts();
        } else {
          inputElement.value = lastValue;
        }
      } else {
        inputElement.value = lastValue;
      }
      document.removeEventListener('keydown', keydownListener);
      document.removeEventListener('keyup', keyupListener);
      inputElement.blur();
      inputElement.removeEventListener('blur', blurHandler);
    };
    const blurHandler = () => {
      document.removeEventListener('keydown', keydownListener);
      document.removeEventListener('keyup', keyupListener);
      if (inputElement.value === 'Press shortcut...') inputElement.value = lastValue;
      inputElement.removeEventListener('blur', blurHandler);
    };
    inputElement.value = 'Press shortcut...';
    pressedKeys.clear();
    finished = false;
    document.addEventListener('keydown', keydownListener);
    document.addEventListener('keyup', keyupListener);
    inputElement.addEventListener('blur', blurHandler);
  }

  async updateCustomShortcuts() {
    try {
      const container = document.getElementById('customShortcutsList');
      if (!container) return;

      const shortcuts = Array.from(container.children).map(item => ({
        pluginName: item.querySelector('.plugin-select').value,
        accelerator: this.getShortcutValue(item.querySelector('.shortcut-input'))
      })).filter(shortcut => shortcut.pluginName && shortcut.accelerator);

      await this.callMainWindow('setCustomShortcuts', shortcuts);
    } catch (error) {
      console.error('Failed to save custom shortcuts:', error);
      this.showNotification('Failed to save custom shortcuts', 'error');
    }
  }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  window.oToolsApp = new oToolsApp();
}); 