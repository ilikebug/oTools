const path = require('path');
const {app, screen} = require('electron')

const APP_STATUS = {
  INITIALIZING: 'initializing',
  RUNNING: 'running',
  SHUTTING_DOWN: 'shutting_down',
  ERROR: 'error'
};

const GetPluginPath = () =>  {
  return path.join(app.getPath('userData'), 'plugins');
}

const GetLoggerPath = () => {
  return path.join(app.getPath('userData'), 'logs');
}

const GetConfigPath = () => {
  return path.join(app.getPath('userData'), 'configs');
}

const GetKVStorePath = () => {
  return path.join(app.getPath('userData'), 'KvStore');
}

/**
 * Force move window to center of current mouse screen (multi-display compatible, macOS optimized)
 */
const forceMoveWindowToCurrentDisplay = (window) => {
  if (!window || window.isDestroyed()) return;
  
  // Set window properties for fullscreen compatibility
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  
  const displays = screen.getAllDisplays();
  const mousePosition = screen.getCursorScreenPoint();
  const currentPos = window.getPosition();
  
  // Find target display (where mouse is located)
  const targetDisplay = displays.find(display => {
    const b = display.bounds;
    return mousePosition.x >= b.x && mousePosition.x < b.x + b.width &&
           mousePosition.y >= b.y && mousePosition.y < b.y + b.height;
  }) || screen.getPrimaryDisplay();
  
  // Find current display (where window is located)
  const currentDisplay = displays.find(display => {
    const b = display.bounds;
    return currentPos[0] >= b.x && currentPos[0] < b.x + b.width &&
           currentPos[1] >= b.y && currentPos[1] < b.y + b.height;
  });
  
  // Calculate target position
  const workArea = targetDisplay.workArea;
  const windowSize = window.getSize();
  const windowX = Math.round(workArea.x + (workArea.width - windowSize[0]) / 2);
  const windowY = Math.round(workArea.y + (workArea.height - windowSize[1]) / 2);
  
  // If window is already on target display and visible, just focus
  if (currentDisplay && currentDisplay.id === targetDisplay.id && window.isVisible()) {
    window.focus();
    return;
  }
  
  // Move window to target position
  window.setPosition(windowX, windowY);
  
  // Show window if hidden, then focus
  if (!window.isVisible()) {
    window.show();
  }
  window.focus();
};

/**
 * Move the window to the mouse cursor position
 * @param {BrowserWindow} window Electron window object
 * @param {string} align Alignment: 'center' or 'topleft', default is 'center'
 */
function moveWindowToCursor(window, align = 'center') {
  if (!window || window.isDestroyed()) return;
  const mouse = screen.getCursorScreenPoint();
  const [w, h] = window.getSize();
  let x = mouse.x, y = mouse.y;
  if (align === 'center') {
    x = x - Math.floor(w / 2);
    y = y - Math.floor(h / 2);
  }
  window.setPosition(x, y);
  window.show();
  window.focus();
}

module.exports = {
  APP_STATUS,

  GetPluginPath,
  GetLoggerPath,
  GetConfigPath,
  GetKVStorePath,

  forceMoveWindowToCurrentDisplay,
  moveWindowToCursor
};