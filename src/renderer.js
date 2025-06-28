// 渲染进程主文件
class oToolsApp {
  constructor() {
    this.plugins = [];
    this.currentPanel = null;
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadPlugins();
    this.setupPluginWatcher();
    this.updateStatus('应用已就绪');
  }

  bindEvents() {
    // 窗口控制
    document.getElementById('minimizeBtn').addEventListener('click', () => {
      window.oToolsAPI.minimizeWindow();
    });

    document.getElementById('closeBtn').addEventListener('click', () => {
      window.oToolsAPI.closeWindow();
    });

    // 搜索功能
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleSearch();
      }
    });
    
    searchBtn.addEventListener('click', () => {
      this.handleSearch();
    });

    // 快捷功能按钮
    document.getElementById('ocrBtn').addEventListener('click', () => {
      this.showPanel('ocrPanel');
    });

    document.getElementById('screenshotBtn').addEventListener('click', () => {
      this.showPanel('screenshotPanel');
    });

    document.getElementById('clipboardBtn').addEventListener('click', () => {
      this.showPanel('clipboardPanel');
    });

    document.getElementById('pluginsBtn').addEventListener('click', () => {
      this.togglePluginsSection();
    });

    // 刷新插件按钮
    document.getElementById('refreshPluginsBtn').addEventListener('click', () => {
      this.loadPlugins();
    });

    // 面板关闭按钮
    document.querySelectorAll('.close-panel-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const panelId = e.target.closest('.close-panel-btn').dataset.panel;
        this.hidePanel(panelId);
      });
    });

    // ESC键关闭面板
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideAllPanels();
      }
    });
  }

  async loadPlugins() {
    try {
      this.updateStatus('加载插件中...');
      this.plugins = await window.oToolsAPI.getPlugins();
      this.renderPlugins();
      this.updateStatus(`已加载 ${this.plugins.length} 个插件`);
    } catch (error) {
      console.error('加载插件失败:', error);
      this.updateStatus('插件加载失败');
      this.showNotification('插件加载失败', 'error');
    }
  }

  setupPluginWatcher() {
    window.oToolsAPI.onPluginsChanged((plugins) => {
      this.plugins = plugins;
      this.renderPlugins();
      this.updateStatus(`插件已更新，共 ${this.plugins.length} 个`);
    });
  }

  renderPlugins() {
    const pluginsGrid = document.getElementById('pluginsGrid');
    pluginsGrid.innerHTML = '';

    if (this.plugins.length === 0) {
      pluginsGrid.innerHTML = `
        <div class="plugin-card" style="text-align: center; color: rgba(255,255,255,0.7);">
          <i class="fas fa-info-circle" style="font-size: 24px; margin-bottom: 8px;"></i>
          <p>暂无插件</p>
          <p style="font-size: 12px;">请将插件文件放入 plugins 目录</p>
        </div>
      `;
      return;
    }

    this.plugins.forEach(plugin => {
      const pluginCard = document.createElement('div');
      pluginCard.className = 'plugin-card';
      pluginCard.innerHTML = `
        <div class="plugin-header">
          <div class="plugin-name">${plugin.name}</div>
          <div class="plugin-version">v${plugin.version}</div>
        </div>
        <div class="plugin-description">${plugin.description}</div>
        <div class="plugin-author">作者: ${plugin.author}</div>
      `;
      
      pluginCard.addEventListener('click', () => {
        this.executePlugin(plugin.name);
      });
      
      pluginsGrid.appendChild(pluginCard);
    });
  }

  async executePlugin(pluginName) {
    try {
      this.showLoading('执行插件中...');
      const result = await window.oToolsAPI.executePlugin(pluginName);
      this.hideLoading();
      
      if (result.success) {
        this.showNotification(`插件执行成功: ${result.message}`, 'success');
        console.log('插件执行结果:', result.result);
      } else {
        this.showNotification(`插件执行失败: ${result.message}`, 'error');
      }
    } catch (error) {
      this.hideLoading();
      this.showNotification(`插件执行错误: ${error.message}`, 'error');
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
    const pluginCards = document.querySelectorAll('.plugin-card');
    pluginCards.forEach(card => {
      const pluginName = card.querySelector('.plugin-name').textContent;
      const isMatched = matchedPlugins.some(plugin => plugin.name === pluginName);
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
    const isVisible = pluginsSection.style.display !== 'none';
    pluginsSection.style.display = isVisible ? 'none' : 'block';
  }

  showLoading(text = '处理中...') {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').style.display = 'flex';
  }

  hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
  }

  updateStatus(message) {
    const statusElement = document.getElementById('statusMessage');
    if (statusElement) {
      statusElement.querySelector('span').textContent = message;
    }
  }

  showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <i class="fas fa-${this.getNotificationIcon(type)}"></i>
        <span>${message}</span>
      </div>
    `;

    container.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  getNotificationIcon(type) {
    switch (type) {
      case 'success': return 'check-circle';
      case 'error': return 'exclamation-circle';
      case 'warning': return 'exclamation-triangle';
      default: return 'info-circle';
    }
  }
}

// 应用启动
document.addEventListener('DOMContentLoaded', () => {
  new oToolsApp();
}); 