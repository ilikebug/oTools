// 插件市场窗口渲染逻辑
(async function() {
  const repo = 'ilikebug/oTools-Plugins';
  const apiUrl = `https://api.github.com/repos/${repo}/contents/`;
  const listDiv = document.getElementById('pluginMarketList');

  // 带重试的fetch
  async function fetchWithRetry(url, options = {}, retries = 3, delay = 300) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      } catch (e) {
        if (i === retries - 1) throw e;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  function getPluginIconUrl(plugin) {
    if (plugin.icon) {
      if (/^https?:/.test(plugin.icon)) return plugin.icon;
      return `https://raw.githubusercontent.com/ilikebug/oTools-Plugins/main/${plugin.folder}/${plugin.icon}`;
    }
    return `https://raw.githubusercontent.com/ilikebug/oTools-Plugins/main/${plugin.folder}/icon.png`;
  }

  function render(list) {
    listDiv.innerHTML = '';
    if (!list || list.length === 0) {
      listDiv.innerHTML = '<div class="plugin-market-loading">No plugins available</div>';
      return;
    }
    list.forEach(plugin => {
      const div = document.createElement('div');
      div.className = 'plugin-market-item';
      div.innerHTML = `
        <div class="plugin-icon-wrap">
          <img class="plugin-icon" src="${getPluginIconUrl(plugin)}" onerror="this.style.display='none';this.parentNode.innerHTML='<i class=\'fa fa-puzzle-piece\'></i>';" />
        </div>
        <div class="plugin-info">
          <div class="plugin-title">${plugin.name}</div>
          <div class="plugin-desc">${plugin.description || ''}</div>
          <div class="plugin-author">${plugin.author || ''}</div>
        </div>
      `;
      listDiv.appendChild(div);
    });
  }

  listDiv.innerHTML = '<div class="plugin-market-loading">Loading plugin list...</div>';

  try {
    const res = await fetch(apiUrl);
    const data = await res.json();
    const dirs = data.filter(item => item.type === 'dir');

    // 并发请求所有 plugin.json，带重试
    const pluginPromises = dirs.map(async (dir) => {
      const pluginJsonUrl = `https://api.github.com/repos/${repo}/contents/${dir.name}/plugin.json`;
      try {
        const res2 = await fetchWithRetry(pluginJsonUrl);
        const data2 = await res2.json();
        if (data2 && data2.content) {
          const jsonStr = atob(data2.content.replace(/\n/g, ''));
          const pluginInfo = JSON.parse(jsonStr);
          pluginInfo.folder = dir.name;
          return pluginInfo;
        }
      } catch (e) {
        console.error("request plugins error:", e)
        // 跳过无效插件
      }
      return null;
    });

    const pluginList = (await Promise.all(pluginPromises)).filter(Boolean);
    render(pluginList);
  } catch (e) {
    render([]);
  }
})(); 