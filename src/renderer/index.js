// Main renderer process file
console.log('Rendering process JavaScript file has been loaded');

class oToolsApp {
  constructor() {
    console.log('oToolsApp constructor function is called');
    this.plugins = [];
    this.currentPanel = null;
    this.appStatus = null;
    this.performanceStats = null;
    this.errorStats = null;
    this.init();
  }

  async init() {
    console.log('oToolsApp init method is called');
    this.bindEvents();
    await this.loadAppStatus();
    await this.loadPlugins();
    this.setupPluginWatcher();
    this.setupStatusUpdates();
    this.renderPluginButtons();
    this.updateStatusDisplay();
  }

  bindEvents() {
    console.log('Binding events...');
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
            const panelId = e.target.closest('.close-panel-btn').dataset.panel;
            this.hidePanel(panelId);
          });
        });
      } else {
        console.warn('close-panel-btn element not found');
      }

      // ESC key closes panels
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.hideAllPanels();
        }
      });

      // Status update button
      const statusBtn = document.getElementById('statusBtn');
      if (statusBtn) {
        statusBtn.addEventListener('click', () => {
          this.showStatusPanel();
        });
      }

      // Performance monitor button
      const performanceBtn = document.getElementById('performanceBtn');
      if (performanceBtn) {
        performanceBtn.addEventListener('click', () => {
          this.showPerformancePanel();
        });
      }
      
      console.log('Event binding completed');
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
      console.log("Application status has been loaded:", this.appStatus);
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
      console.log("Plugins have been loaded:", this.plugins);
      this.renderPluginButtons();
    } catch (error) {
      console.error('Failed to load plugins:', error);
      this.showNotification('Plugin loading failed', 'error');
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
      this.showNotification('Plugin list has been updated', 'info');
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
      this.showLoading('Executing plugin...');
      const result = await window.oToolsAPI.executePlugin(pluginName);
      this.hideLoading();
      if (result && result.success) {
        this.showNotification(`Plugin execution succeeded: ${result.message}`, 'success');
        console.log('Plugin execution result:', result.result);
      } else if (result) {
        this.showNotification(`Plugin execution failed: ${result.message}`, 'error');
      }
    } catch (error) {
      this.hideLoading();
      this.showNotification(`Plugin execution error: ${error.message}`, 'error');
    }
  }

  async showStatusPanel() {
    try {
      if (!window.oToolsAPI || !window.oToolsAPI.getPerformanceStats) {
        throw new Error('oToolsAPI not injected or getPerformanceStats does not exist');
      }
      
      this.performanceStats = await window.oToolsAPI.getPerformanceStats();
      this.errorStats = await window.oToolsAPI.getErrorStats();
      
      const statusPanel = document.getElementById('statusPanel');
      if (statusPanel) {
        statusPanel.innerHTML = this.renderStatusContent();
        this.showPanel('statusPanel');
      }
    } catch (error) {
      console.error('Failed to display status panel:', error);
      this.showNotification('Unable to load status information', 'error');
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
        
        <h4>Performance statistics</h4>
        <div class="performance-stats">
          ${this.renderPerformanceStats()}
        </div>
        
        <h4>Error statistics</h4>
        <div class="error-stats">
          ${this.renderErrorStats()}
        </div>
      </div>
    `;
  }

  renderPerformanceStats() {
    if (!this.performanceStats) return '<p>No performance data available</p>';
    
    return `
      <div class="stats-grid">
        <div class="stat-item">
          <label>Average response time:</label>
          <span>${this.performanceStats.averageResponseTime || 0}ms</span>
        </div>
        <div class="stat-item">
          <label>Total requests:</label>
          <span>${this.performanceStats.totalRequests || 0}</span>
        </div>
        <div class="stat-item">
          <label>Success rate:</label>
          <span>${this.performanceStats.successRate || 0}%</span>
        </div>
      </div>
    `;
  }

  renderErrorStats() {
    if (!this.errorStats) return '<p>No error data available</p>';
    
    return `
      <div class="stats-grid">
        <div class="stat-item">
          <label>Total errors:</label>
          <span>${this.errorStats.totalErrors || 0}</span>
        </div>
        <div class="stat-item">
          <label>Critical errors:</label>
          <span>${this.errorStats.criticalErrors || 0}</span>
        </div>
        <div class="stat-item">
          <label>Last error:</label>
          <span>${this.errorStats.lastErrorTime || 'None'}</span>
        </div>
      </div>
    `;
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
      this.showNotification(`Found ${matchedPlugins.length} related plugins`, 'success');
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
      if (this.currentPanel === panelId) {
        this.currentPanel = null;
      }
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

  showLoading(text = 'Processing...') {
    const loading = document.getElementById('loading');
    if (loading) {
      const loadingText = loading.querySelector('.loading-text');
      if (loadingText) {
        loadingText.textContent = text;
      }
      loading.style.display = 'flex';
    }
  }

  hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.style.display = 'none';
    }
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <i class="${this.getNotificationIcon(type)}"></i>
      <span>${message}</span>
      <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    document.body.appendChild(notification);
    
    // Automatically remove notification
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 5000);
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
}

// Initialize application

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing oTools application');
  window.oToolsApp = new oToolsApp();
}); 