// 插件市场窗口渲染逻辑
(async function() {
  const repo = 'ilikebug/oTools-Plugins';
  const apiUrl = `https://api.github.com/repos/${repo}/contents/`;
  const listDiv = document.getElementById('pluginMarketList');

  function render(list) {
    listDiv.innerHTML = '';
    if (!list || list.length === 0) {
      listDiv.innerHTML = '<div style="color:#999;">暂无可用插件</div>';
      return;
    }
    list.forEach(plugin => {
      const div = document.createElement('div');
      div.className = 'plugin-market-item';
      div.innerHTML = `
        <div class="plugin-title">${plugin.name}</div>
        <div class="plugin-desc">${plugin.description || ''}</div>
        <div class="plugin-author">${plugin.author || ''}</div>
      `;
      listDiv.appendChild(div);
    });
  }

  // 显示加载中
  listDiv.innerHTML = '<div class="plugin-market-loading">正在加载插件列表...</div>';

  try {
    const res = await fetch(apiUrl);
    const data = await res.json();
    const dirs = data.filter(item => item.type === 'dir');

    // 并发请求所有 plugin.json
    const pluginPromises = dirs.map(async (dir) => {
      const pluginJsonUrl = `https://api.github.com/repos/${repo}/contents/${dir.name}/plugin.json`;
      try {
        const res2 = await fetch(pluginJsonUrl);
        const data2 = await res2.json();
        if (data2 && data2.content) {
          const jsonStr = atob(data2.content.replace(/\n/g, ''));
          const pluginInfo = JSON.parse(jsonStr);
          pluginInfo.folder = dir.name;
          return pluginInfo;
        }
      } catch (e) {
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