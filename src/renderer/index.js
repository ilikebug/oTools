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
    this.renderQuickActions();
    this.updateStatus('应用已就绪');
  }

  bindEvents() {
    console.log('绑定事件...');
    try {
      // 只保留设置按钮和搜索相关事件
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
    console.log("111111111111111")
    try {
      this.updateStatus('加载插件中...');
      this.plugins = await window.oToolsAPI.getPlugins();
      console.log("已加载插件:", this.plugins);
      this.renderPlugins();
      this.renderQuickActions();
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
      this.renderQuickActions();
      this.updateStatus(`插件已更新，共 ${this.plugins.length} 个`);
    });
  }

  // 渲染快捷功能按钮
  renderQuickActions() {
    console.log('渲染快捷功能按钮...');
    const actionGrid = document.querySelector('.action-grid');
    if (!actionGrid) {
      console.error('找不到 action-grid 元素');
      return;
    }

    // 清空现有按钮
    actionGrid.innerHTML = '';

    // 过滤出内置插件（type为builtin的插件）
    const builtinPlugins = this.plugins.filter(plugin => plugin.type === 'builtin');
    console.log('内置插件:', builtinPlugins);

    // 为每个内置插件创建快捷功能按钮
    builtinPlugins.forEach(plugin => {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'action-btn';
      actionBtn.id = `${plugin.name.replace(/\s+/g, '')}Btn`;
      actionBtn.title = plugin.description;
      
      actionBtn.innerHTML = `
        <i class="${plugin.icon}"></i>
        <span>${plugin.shortName}</span>
      `;

      // 绑定点击事件
      actionBtn.addEventListener('click', () => {
        this.executeQuickAction(plugin);
      });

      actionGrid.appendChild(actionBtn);
    });

    // 添加插件管理按钮
    const pluginsBtn = document.createElement('button');
    pluginsBtn.className = 'action-btn';
    pluginsBtn.id = 'pluginsBtn';
    pluginsBtn.title = '插件管理';
    
    pluginsBtn.innerHTML = `
      <i class="fas fa-puzzle-piece"></i>
      <span>插件</span>
    `;

    pluginsBtn.addEventListener('click', () => {
      this.togglePluginsSection();
    });

    actionGrid.appendChild(pluginsBtn);
  }

  // 执行快捷功能
  async executeQuickAction(plugin) {
    try {
      this.showLoading(`执行${plugin.shortName}中...`);
      
      // 根据插件名称执行不同的操作
      let result;
      switch (plugin.name) {
        case 'OCR文字识别':
          const fileResult = await window.oToolsAPI.openFileDialog();
          if (!fileResult.canceled && fileResult.filePaths.length > 0) {
            result = await window.oToolsAPI.performOCR(fileResult.filePaths[0]);
          } else {
            this.hideLoading();
            return;
          }
          break;
        case '屏幕截图':
          result = await window.oToolsAPI.takeScreenshot();
          break;
        case '剪贴板管理':
          this.showPanel('clipboardPanel');
          this.hideLoading();
          return;
        case '计算器':
          // 显示简单的计算器对话框
          const expression = prompt('请输入计算表达式（如：2+3*4）：');
          if (expression) {
            result = await window.oToolsAPI.executePlugin(plugin.name, 'calculate', expression);
          } else {
            this.hideLoading();
            return;
          }
          break;
        default:
          result = await window.oToolsAPI.executePlugin(plugin.name);
          break;
      }

      this.hideLoading();
      
      if (result && result.success) {
        this.showNotification(`${plugin.shortName}执行成功: ${result.message}`, 'success');
        console.log('执行结果:', result);
      } else if (result) {
        this.showNotification(`${plugin.shortName}执行失败: ${result.message}`, 'error');
      }
    } catch (error) {
      this.hideLoading();
      this.showNotification(`${plugin.shortName}执行错误: ${error.message}`, 'error');
    }
  }

  renderPlugins() {
    const pluginsGrid = document.getElementById('pluginsGrid');
    if (!pluginsGrid) return;
    
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
          <div class="plugin-name">
            <i class="${plugin.icon}"></i>
            ${plugin.name}
          </div>
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
      const pluginName = card.querySelector('.plugin-name').textContent.trim();
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

  updateStatus(message) {
    // 不再显示状态栏，直接忽略
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

// 应用启动
console.log('DOMContentLoaded 事件监听器已设置');
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded 事件触发');
  new oToolsApp();
}); 