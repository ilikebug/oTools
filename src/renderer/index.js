// 渲染进程主文件
console.log('渲染进程JavaScript文件已加载');

class oToolsApp {
  constructor() {
    console.log('oToolsApp 构造函数被调用');
    this.plugins = [];
    this.currentPanel = null;
    this.init();
  }

  async init() {
    console.log('oToolsApp init 方法被调用');
    this.bindEvents();
    await this.loadPlugins();
    this.setupPluginWatcher();
    this.renderPluginButtons();
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
      
      console.log('事件绑定完成');
    } catch (error) {
      console.error('绑定事件时出错:', error);
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
    });
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
      actionBtn.innerHTML = `
        <i class="${plugin.icon}"></i>
        <span>${plugin.shortName}</span>
      `;
      actionBtn.addEventListener('click', () => {
        this.executePlugin(plugin.name);
      });
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
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    if (loadingOverlay && loadingText) {
      loadingText.textContent = text;
      loadingOverlay.style.display = 'flex';
    }
  }

  hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
  }

  showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    if (!container) return;
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

console.log('DOMContentLoaded 事件监听器已设置');
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded 事件触发');
  new oToolsApp();
}); 