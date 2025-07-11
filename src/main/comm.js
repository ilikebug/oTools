const path = require('path');
const {app, screen} = require('electron')

const APP_STATUS = {
  INITIALIZING: 'initializing',
  RUNNING: 'running',
  SHUTTING_DOWN: 'shutting_down',
  ERROR: 'error'
};

const GetPluginDir = () =>  {
  return path.join(app.getPath('userData'), 'plugins');
}

const GetLoggerDir = () => {
  return path.join(app.getPath('userData'), 'logs');
}

const GetConfigDir = () => {
  return path.join(app.getPath('userData'), 'configs');
}

const GetDBDir = () => {
  return path.join(app.getPath('userData'), 'fileDB');
}


/**
 * Force move window to center of current mouse screen (multi-display compatible, macOS optimized)
 */
const forceMoveWindowToCurrentDisplay = (window) => {
  if (!window || window.isDestroyed()) return;
  
  const displays = screen.getAllDisplays();
  const mousePosition = screen.getCursorScreenPoint();
  
  // Find the display where the mouse cursor is located
  let targetDisplay = displays.find(display => {
    const b = display.bounds;
    return mousePosition.x >= b.x && mousePosition.x < b.x + b.width &&
           mousePosition.y >= b.y && mousePosition.y < b.y + b.height;
  }) || screen.getPrimaryDisplay();
  
  // Get current window position
  const currentPos = window.getPosition();
  
  // Check if window is already on the target display
  let windowCurrentDisplay = null;
  for (const display of displays) {
    const b = display.bounds;
    if (currentPos[0] >= b.x && currentPos[0] < b.x + b.width &&
        currentPos[1] >= b.y && currentPos[1] < b.y + b.height) {
      windowCurrentDisplay = display;
      break;
    }
  }
  
  // Calculate target position
  const workArea = targetDisplay.workArea;
  const windowSize = window.getSize();
  const windowX = Math.round(workArea.x + (workArea.width - windowSize[0]) / 2);
  const windowY = Math.round(workArea.y + (workArea.height - windowSize[1]) / 2);
  
  // If window is already on target display, just focus without moving
  if (windowCurrentDisplay && windowCurrentDisplay.id === targetDisplay.id) {
    if (!window.isVisible()) {
      window.show();
    }
    return;
  }
  
  // If window is visible, check if movement is needed
  if (window.isVisible()) {
    // Calculate distance between current and target position
    const distance = Math.sqrt(
      Math.pow(currentPos[0] - windowX, 2) + 
      Math.pow(currentPos[1] - windowY, 2)
    );
    
    // If distance is less than 50 pixels, don't move window (avoid micro jitter)
    if (distance < 50) {
      window.focus();
      return;
    }
    
    window.setPosition(windowX, windowY);
    window.focus();
  } else {
    // If window is hidden, set position first then show
    window.setPosition(windowX, windowY);
    window.show();
    window.focus();
  }
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

function getSavedWindowPosition(store) {
  const pos = store.get('windowPosition');
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    // Check if saved position is still valid (within any display bounds)
    const displays = screen.getAllDisplays();
    for (const display of displays) {
      const bounds = display.bounds;
      if (pos.x >= bounds.x && 
          pos.x < bounds.x + bounds.width &&
          pos.y >= bounds.y && 
          pos.y < bounds.y + bounds.height) {
        return pos;
      }
    }
    // If saved position is not valid, return null to trigger centering on current display
    return null;
  }
  return null;
}

function saveWindowPosition(store, x, y) {
  // Only save position if it's within a valid display
  const displays = screen.getAllDisplays();
  for (const display of displays) {
    const bounds = display.bounds;
    if (x >= bounds.x && 
        x < bounds.x + bounds.width &&
        y >= bounds.y && 
        y < bounds.y + bounds.height) {
      store.set('windowPosition', { x, y });
      return;
    }
  }
  // If position is not within any display, don't save it
  store.delete('windowPosition');
}

module.exports = {
  APP_STATUS,

  GetPluginDir,
  GetLoggerDir,
  GetConfigDir,
  GetDBDir,

  getSavedWindowPosition, 
  saveWindowPosition,
  forceMoveWindowToCurrentDisplay,
  moveWindowToCursor
};