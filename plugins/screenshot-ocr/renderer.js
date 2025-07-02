window.electronAPI = window.electronAPI || {};

window.electronAPI.onPluginExecute = (callback) => {
  window.addEventListener('DOMContentLoaded', () => {
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('plugin-execute', (event, { action, args }) => {
      callback(action, args);
    });
  });
};

// Main plugin logic
window.electronAPI.onPluginExecute(async (action, args) => {
  try {
    const result = await window.electronAPI.invoke('captureAndOCR');
    if (result && result.imageData && result.text !== undefined) {
      // Prefer calling the page's displayResult function
      if (typeof window.displayResult === 'function') {
        window.displayResult({ imageData: result.imageData, text: result.text });
      } else {
        // Fallback: directly manipulate the DOM
        let container = document.getElementById('imageContainer');
        if (container) {
          container.innerHTML = `<img src="data:image/png;base64,${result.imageData}" class="screenshot-image" alt="Screenshot Preview">`;
        }
        let textContent = document.getElementById('textContent');
        if (textContent) {
          textContent.textContent = result.text || 'No text recognized';
          textContent.className = 'text-content';
        }
      }
      // Notify main process to show window
      if (window.electronAPI.showPluginWindow) {
        window.electronAPI.showPluginWindow();
      }
    } else {
      alert('No valid screenshot or OCR result obtained');
    }
  } catch (e) {
    alert('Screenshot or OCR failed: ' + e.message);
  }
}); 

let currentImageData = null;
let currentText = '';

// Initialize after page load
document.addEventListener('DOMContentLoaded', () => {
    updateTimestamp();
    // Listen for messages from the main process
    window.oToolsAPI.onResultData((data) => {
        displayResult(data);
    });
});

// Display result
function displayResult(data) {
    if (data.imageData) {
        displayImage(data.imageData);
    }
    
    if (data.text) {
        displayText(data.text);
    }
    
    updateStatus('Recognition complete');
}

// Display image
function displayImage(imageBase64) {
    currentImageData = imageBase64;
    const container = document.getElementById('imageContainer');
    const loading = document.getElementById('imageLoading');
    
    loading.style.display = 'none';
    
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${imageBase64}`;
    img.className = 'screenshot-image';
    img.alt = 'Screenshot Preview';
    
    container.innerHTML = '';
    container.appendChild(img);
}

// Display text
function displayText(text) {
    currentText = text;
    const textContent = document.getElementById('textContent');
    
    if (text && text.trim()) {
        textContent.textContent = text;
        textContent.className = 'text-content';
    } else {
        textContent.textContent = 'No text recognized';
        textContent.className = 'text-content empty';
    }
}

// Display error message
function displayError(message) {
    const errorContainer = document.getElementById('errorContainer');
    errorContainer.innerHTML = `<div class="error-message">${message}</div>`;
    updateStatus('Recognition failed');
}

// Copy text
async function copyText() {
    if (!currentText) {
        updateStatus('No text to copy');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(currentText);
        updateStatus('Text copied to clipboard', 'copy-success');
        setTimeout(() => updateStatus('Ready'), 2000);
    } catch (error) {
        console.error('Copy failed:', error);
        updateStatus('Copy failed');
    }
}

// Copy image
async function copyImage() {
    if (!currentImageData) {
        updateStatus('No image to copy');
        return;
    }
    
    try {
        // Convert base64 to blob
        const response = await fetch(`data:image/png;base64,${currentImageData}`);
        const blob = await response.blob();
        
        await navigator.clipboard.write([
            new ClipboardItem({
                'image/png': blob
            })
        ]);
        
        updateStatus('Image copied to clipboard', 'copy-success');
        setTimeout(() => updateStatus('Ready'), 2000);
    } catch (error) {
        console.error('Copy image failed:', error);
        updateStatus('Copy image failed');
    }
}

// Save image
function saveImage() {
    if (!currentImageData) {
        updateStatus('No image to save');
        return;
    }
    
    // Save image via main process
    window.oToolsAPI.saveImage(currentImageData);
}

// Clear text
function clearText() {
    currentText = '';
    const textContent = document.getElementById('textContent');
    textContent.textContent = 'Waiting for OCR result...';
    textContent.className = 'text-content empty';
    updateStatus('Text cleared');
}

// New screenshot
function newScreenshot() {
    window.oToolsAPI.newScreenshot();
}

// Close window
function closeWindow() {
    window.oToolsAPI.closeResultWindow();
}

// Update status
function updateStatus(message, className = '') {
    const statusText = document.getElementById('statusText');
    statusText.textContent = message;
    statusText.className = className;
}

// Update timestamp
function updateTimestamp() {
    const timestamp = document.getElementById('timestamp');
    timestamp.textContent = new Date().toLocaleString('en-US');
}

// Update timestamp periodically
setInterval(updateTimestamp, 1000);