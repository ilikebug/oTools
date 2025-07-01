window.electronAPI = window.electronAPI || {};

window.electronAPI.onPluginExecute = (callback) => {
  window.addEventListener('DOMContentLoaded', () => {
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('plugin-execute', (event, { action, args }) => {
      callback(action, args);
    });
  });
};

// 插件主逻辑
window.electronAPI.onPluginExecute(async (action, args) => {
  try {
    const result = await window.electronAPI.invoke('captureAndOCR');
    if (result && result.imageData && result.text !== undefined) {
      // 优先调用页面的 displayResult 函数
      if (typeof window.displayResult === 'function') {
        window.displayResult({ imageData: result.imageData, text: result.text });
      } else {
        // 兜底：直接操作 DOM
        let container = document.getElementById('imageContainer');
        if (container) {
          container.innerHTML = `<img src="data:image/png;base64,${result.imageData}" class="screenshot-image" alt="截图预览">`;
        }
        let textContent = document.getElementById('textContent');
        if (textContent) {
          textContent.textContent = result.text || '未识别到文字内容';
          textContent.className = 'text-content';
        }
      }
      // 通知主进程显示窗口
      if (window.electronAPI.showPluginWindow) {
        window.electronAPI.showPluginWindow();
      }
    } else {
      alert('未获取到有效的截图或OCR结果');
    }
  } catch (e) {
    alert('截图或OCR失败: ' + e.message);
  }
}); 

let currentImageData = null;
let currentText = '';

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('OCR插件结果展示界面已加载');
    updateTimestamp();
    
    // 监听来自主进程的消息
    window.electronAPI.onResultData((data) => {
        console.log('收到结果数据:', data);
        displayResult(data);
    });
});

// 显示结果
function displayResult(data) {
    if (data.imageData) {
        displayImage(data.imageData);
    }
    
    if (data.text) {
        displayText(data.text);
    }
    
    updateStatus('识别完成');
}

// 显示图片
function displayImage(imageBase64) {
    currentImageData = imageBase64;
    const container = document.getElementById('imageContainer');
    const loading = document.getElementById('imageLoading');
    
    loading.style.display = 'none';
    
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${imageBase64}`;
    img.className = 'screenshot-image';
    img.alt = '截图预览';
    
    container.innerHTML = '';
    container.appendChild(img);
}

// 显示文字
function displayText(text) {
    currentText = text;
    const textContent = document.getElementById('textContent');
    
    if (text && text.trim()) {
        textContent.textContent = text;
        textContent.className = 'text-content';
    } else {
        textContent.textContent = '未识别到文字内容';
        textContent.className = 'text-content empty';
    }
}

// 显示错误信息
function displayError(message) {
    const errorContainer = document.getElementById('errorContainer');
    errorContainer.innerHTML = `<div class="error-message">${message}</div>`;
    updateStatus('识别失败');
}

// 复制文字
async function copyText() {
    if (!currentText) {
        updateStatus('没有可复制的文字');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(currentText);
        updateStatus('文字已复制到剪贴板', 'copy-success');
        setTimeout(() => updateStatus('准备就绪'), 2000);
    } catch (error) {
        console.error('复制失败:', error);
        updateStatus('复制失败');
    }
}

// 复制图片
async function copyImage() {
    if (!currentImageData) {
        updateStatus('没有可复制的图片');
        return;
    }
    
    try {
        // 将base64转换为blob
        const response = await fetch(`data:image/png;base64,${currentImageData}`);
        const blob = await response.blob();
        
        await navigator.clipboard.write([
            new ClipboardItem({
                'image/png': blob
            })
        ]);
        
        updateStatus('图片已复制到剪贴板', 'copy-success');
        setTimeout(() => updateStatus('准备就绪'), 2000);
    } catch (error) {
        console.error('复制图片失败:', error);
        updateStatus('复制图片失败');
    }
}

// 保存图片
function saveImage() {
    if (!currentImageData) {
        updateStatus('没有可保存的图片');
        return;
    }
    
    // 通过主进程保存图片
    window.electronAPI.saveImage(currentImageData);
}

// 清空文字
function clearText() {
    currentText = '';
    const textContent = document.getElementById('textContent');
    textContent.textContent = '等待OCR识别结果...';
    textContent.className = 'text-content empty';
    updateStatus('文字已清空');
}

// 重新截图
function newScreenshot() {
    window.electronAPI.newScreenshot();
}

// 关闭窗口
function closeWindow() {
    window.electronAPI.closeResultWindow();
}

// 更新状态
function updateStatus(message, className = '') {
    const statusText = document.getElementById('statusText');
    statusText.textContent = message;
    statusText.className = className;
}

// 更新时间戳
function updateTimestamp() {
    const timestamp = document.getElementById('timestamp');
    timestamp.textContent = new Date().toLocaleString('zh-CN');
}

// 定期更新时间戳
setInterval(updateTimestamp, 1000);