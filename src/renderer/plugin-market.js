(async function() {
  const repo = 'ilikebug/oTools-Plugins';
  const apiUrl = `https://api.github.com/repos/${repo}/contents/`;
  const listDiv = document.getElementById('pluginMarketList');

  async function fetchWithGithubToken(url, options = {}) {
    if (window.mainWindow && window.mainWindow.getConfig) {
      const config = await window.mainWindow.getConfig('main');
      const token = config && config.githubToken;
      options.headers = options.headers || {};
      if (token) {
        options.headers['Authorization'] = `token ${token}`;
      }
    }
    return fetch(url, options);
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
        <button class="plugin-download-btn" title="Download" data-folder="${plugin.folder}">
          <i class="fa fa-download"></i>
        </button>
      `;
      const downloadBtn = div.querySelector('.plugin-download-btn');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.mainWindow && window.mainWindow.downloadPlugin) {
            downloadBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
            downloadBtn.disabled = true;
            downloadBtn.title = 'Downloading...';
            
            window.mainWindow.downloadPlugin({
              folder: plugin.folder,
              name: plugin.name
            });
          }
        });
      }
      listDiv.appendChild(div);
    });
  }

  if (window.mainWindow && window.mainWindow.onDownloadPluginResult) {
    window.mainWindow.onDownloadPluginResult((result) => {
    
      const downloadBtn = document.querySelector(`[data-folder="${result.folder}"]`);
      if (downloadBtn) {
        if (result.success) {
          downloadBtn.innerHTML = '<i class="fa fa-check"></i>';
          downloadBtn.title = 'Downloaded';
          downloadBtn.style.color = '#4CAF50';
        } else {
          downloadBtn.innerHTML = '<i class="fa fa-download"></i>';
          downloadBtn.disabled = false;
          downloadBtn.title = 'Download';
         
          alert(`Download Failed: ${result.message}`);
        }
      }
    });
  }

  listDiv.innerHTML = '<div class="plugin-market-loading">Loading plugin list...</div>';

  try {
    const res = await fetchWithGithubToken(apiUrl);
    const data = await res.json();
    const dirs = data.filter(item => item.type === 'dir');

    const pluginPromises = dirs.map(async (dir) => {
      const pluginJsonUrl = `https://api.github.com/repos/${repo}/contents/${dir.name}/plugin.json`;
      try {
        const res2 = await fetchWithGithubToken(pluginJsonUrl);
        const data2 = await res2.json();
        if (data2 && data2.content) {
          const jsonStr = atob(data2.content.replace(/\n/g, ''));
          const pluginInfo = JSON.parse(jsonStr);
          pluginInfo.folder = dir.name;
          return pluginInfo;
        }
      } catch (e) {
        console.error("request plugins error:", e)
      }
      return null;
    });

    const pluginList = (await Promise.all(pluginPromises)).filter(Boolean);
    render(pluginList);
  } catch (e) {
    render([]);
  }
})(); 