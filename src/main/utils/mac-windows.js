const { exec } = require('child_process');
const logger = require('./logger');

/**
 * Switch back to the previous active app (implemented via AppleScript)
 */
function switchToPreviousApp() {
  // 1. Get the name of the current frontmost app
  exec(`osascript -e 'tell application "System Events" to set frontApp to name of first application process whose frontmost is true'`, (err, stdout) => {
    if (err) {
      logger.error('Failed to get frontmost app:', err);
      return;
    }
    const appName = stdout.trim();
    // 2. After a short delay, activate that app
    setTimeout(() => {
      exec(`osascript -e 'tell application "${appName}" to activate'`, (err2) => {
        if (err2) {
          logger.error('Failed to switch back to previous app:', err2);
        }
      });
    }, 100);
  });
}

module.exports = {
  switchToPreviousApp
}; 