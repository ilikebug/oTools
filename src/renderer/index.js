// 渲染进程主文件
console.log('渲染进程JavaScript文件已加载');

class oToolsApp {
  constructor() {
    console.log('oToolsApp 构造函数被调用');
    this.plugins = [];
    this.currentPanel = null;
    this.appStatus = null;
    this.performanceStats = null;
    this.errorStats = null;
    this.init();
  }

  async init() {
    console.log('oToolsApp init 方法被调用');
    this.bindEvents();
    await this.loadAppStatus();
    await this.loadPlugins();
    this.setupPluginWatcher();
    this.setupStatusUpdates();
    this.renderPluginButtons();
    this.updateStatusDisplay();
  }

  bindEvents() {
    console.log('绑定事件...');
    try {
      // 搜索功能
      const searchInput = document.getElementById('searchInput');
      const searchBtn = document.getElementById('searchBtn');
      
      if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            this.handleSearch();
          }
        });
      } else {
        console.warn('找不到 searchInput 元素');
      }
      
      if (searchBtn) {
        searchBtn.addEventListener('click', () => {
          this.handleSearch();
        });
      } else {
        console.warn('找不到 searchBtn 元素');
      }

      // 面板关闭按钮
      const closePanelBtns = document.querySelectorAll('.close-panel-btn');
      if (closePanelBtns.length > 0) {
        closePanelBtns.forEach(btn => {
          btn.addEventListener('click', (e) => {
            const panelId = e.target.closest('.close-panel-btn').dataset.panel;
            this.hidePanel(panelId);
          });
        });
      } else {
        console.warn('找不到 close-panel-btn 元素');
      }

      // ESC键关闭面板
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.hideAllPanels();
        }
      });

      // 状态更新按钮
      const statusBtn = document.getElementById('statusBtn');
      if (statusBtn) {
        statusBtn.addEventListener('click', () => {
          this.showStatusPanel();
        });
      }

      // 性能监控按钮
      const performanceBtn = document.getElementById('performanceBtn');
      if (performanceBtn) {
        performanceBtn.addEventListener('click', () => {
          this.showPerformancePanel();
        });
      }
      
      console.log('事件绑定完成');
    } catch (error) {
      console.error('绑定事件时出错:', error);
    }
  }

  async loadAppStatus() {
    try {
      if (!window.oToolsAPI || !window.oToolsAPI.getAppStatus) {
        throw new Error('oToolsAPI 未注入或 getAppStatus 不存在');
      }
      this.appStatus = await window.oToolsAPI.getAppStatus();
      console.log("应用状态已加载:", this.appStatus);
    } catch (error) {
      console.error('加载应用状态失败:', error);
    }
  }

  async loadPlugins() {
    try {
      if (!window.oToolsAPI || !window.oToolsAPI.getPlugins) {
        throw new Error('oToolsAPI 未注入或 getPlugins 不存在');
      }
      this.plugins = await window.oToolsAPI.getPlugins();
      console.log("已加载插件:", this.plugins);
      this.renderPluginButtons();
    } catch (error) {
      console.error('加载插件失败:', error);
      this.showNotification('插件加载失败', 'error');
    }
  }

  setupPluginWatcher() {
    if (!window.oToolsAPI || !window.oToolsAPI.onPluginsChanged) {
      console.error('oToolsAPI 未注入或 onPluginsChanged 不存在');
      return;
    }
    window.oToolsAPI.onPluginsChanged((plugins) => {
      this.plugins = plugins;
      this.renderPluginButtons();
      this.showNotification('插件列表已更新', 'info');
    });
  }

  setupStatusUpdates() {
    // 定期更新状态信息
    setInterval(async () => {
      try {
        await this.loadAppStatus();
        this.updateStatusDisplay();
      } catch (error) {
        console.error('更新状态失败:', error);
      }
    }, 30000); // 每30秒更新一次
  }

  // 渲染所有插件为按钮（不区分类型）
  renderPluginButtons() {
    const actionGrid = document.querySelector('.action-grid');
    if (!actionGrid) {
      console.error('找不到 action-grid 元素');
      return;
    }
    actionGrid.innerHTML = '';
    this.plugins.forEach(plugin => {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'action-btn';
      actionBtn.id = `${plugin.name.replace(/\s+/g, '')}Btn`;
      actionBtn.title = plugin.description;
      
      // 根据插件状态设置样式
      const isEnabled = plugin.enabled !== false;
      if (!isEnabled) {
        actionBtn.classList.add('disabled');
      }
      
      actionBtn.innerHTML = `
        <i class="${plugin.icon}"></i>
        <span>${plugin.shortName}</span>
        ${plugin.loadedAt ? `<small>${new Date(plugin.loadedAt).toLocaleTimeString()}</small>` : ''}
      `;
      
      if (isEnabled) {
        actionBtn.addEventListener('click', () => {
          this.executePlugin(plugin.name);
        });
      }
      
      actionGrid.appendChild(actionBtn);
    });
  }

  // 通用插件执行逻辑
  async executePlugin(pluginName) {
    try {
      if (!window.oToolsAPI || !window.oToolsAPI.executePlugin) {
        throw new Error('oToolsAPI 未注入或 executePlugin 不存在');
      }
      this.showLoading('执行插件中...');
      const result = await window.oToolsAPI.executePlugin(pluginName);
      this.hideLoading();
      if (result && result.success) {
        this.showNotification(`插件执行成功: ${result.message}`, 'success');
        console.log('插件执行结果:', result.result);
      } else if (result) {
        this.showNotification(`插件执行失败: ${result.message}`, 'error');
      }
    } catch (error) {
      this.hideLoading();
      this.showNotification(`插件执行错误: ${error.message}`, 'error');
    }
  }

  async showStatusPanel() {
    try {
      if (!window.oToolsAPI || !window.oToolsAPI.getPerformanceStats) {
        throw new Error('oToolsAPI 未注入或 getPerformanceStats 不存在');
      }
      
      this.performanceStats = await window.oToolsAPI.getPerformanceStats();
      this.errorStats = await window.oToolsAPI.getErrorStats();
      
      const statusPanel = document.getElementById('statusPanel');
      if (statusPanel) {
        statusPanel.innerHTML = this.renderStatusContent();
        this.showPanel('statusPanel');
      }
    } catch (error) {
      console.error('显示状态面板失败:', error);
      this.showNotification('无法加载状态信息', 'error');
    }
  }

  renderStatusContent() {
    return `
      <div class="status-content">
        <h3>应用状态</h3>
        <div class="status-grid">
          <div class="status-item">
            <label>状态:</label>
            <span class="status-value ${this.appStatus?.status || 'unknown'}">${this.appStatus?.status || '未知'}</span>
          </div>
          <div class="status-item">
            <label>运行时间:</label>
            <span class="status-value">${this.formatUptime(this.appStatus?.uptime || 0)}</span>
          </div>
          <div class="status-item">
            <label>组件数量:</label>
            <span class="status-value">${this.appStatus?.componentCount || 0}</span>
          </div>
          <div class="status-item">
            <label>插件数量:</label>
            <span class="status-value">${this.plugins.length}</span>
          </div>
        </div>
        
        <h4>性能统计</h4>
        <div class="performance-stats">
          ${this.renderPerformanceStats()}
        </div>
        
        <h4>错误统计</h4>
        <div class="error-stats">
          ${this.renderErrorStats()}
        </div>
      </div>
    `;
  }

  renderPerformanceStats() {
    if (!this.performanceStats) return '<p>暂无性能数据</p>';
    
    return `
      <div class="stats-grid">
        <div class="stat-item">
          <label>平均响应时间:</label>
          <span>${this.performanceStats.averageResponseTime || 0}ms</span>
        </div>
        <div class="stat-item">
          <label>总请求数:</label>
          <span>${this.performanceStats.totalRequests || 0}</span>
        </div>
        <div class="stat-item">
          <label>成功率:</label>
          <span>${this.performanceStats.successRate || 0}%</span>
        </div>
      </div>
    `;
  }

  renderErrorStats() {
    if (!this.errorStats) return '<p>暂无错误数据</p>';
    
    return `
      <div class="stats-grid">
        <div class="stat-item">
          <label>总错误数:</label>
          <span>${this.errorStats.totalErrors || 0}</span>
        </div>
        <div class="stat-item">
          <label>严重错误:</label>
          <span>${this.errorStats.criticalErrors || 0}</span>
        </div>
        <div class="stat-item">
          <label>最后错误:</label>
          <span>${this.errorStats.lastErrorTime || '无'}</span>
        </div>
      </div>
    `;
  }

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}天 ${hours % 24}小时`;
    if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`;
    if (minutes > 0) return `${minutes}分钟 ${seconds % 60}秒`;
    return `${seconds}秒`;
  }

  updateStatusDisplay() {
    const statusIndicator = document.getElementById('statusIndicator');
    if (statusIndicator && this.appStatus) {
      statusIndicator.className = `status-indicator ${this.appStatus.status}`;
      statusIndicator.title = `应用状态: ${this.appStatus.status}`;
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
      this.showNotification(`找到 ${matchedPlugins.length} 个相关插件`, 'success');
      this.highlightPlugins(matchedPlugins);
    } else {
      this.showNotification('未找到相关插件', 'warning');
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

  showLoading(text = '处理中...') {
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
    
    // 自动移除通知
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

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM加载完成，初始化oTools应用');
  window.oToolsApp = new oToolsApp();
}); 