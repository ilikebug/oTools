const { app } = require('electron');
const logger = require('./logger');

function setAutoStart(enable) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      path: app.getPath('exe'),
      args: []
    });
  } catch (e) {
    logger.error('Failed to set auto start:', e);
    throw e;
  }
}

function isAutoStartEnabled() {
  try {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  } catch (e) {
    logger.error('Failed to get auto start status:', e);
    return false;
  }
}

module.exports = { setAutoStart, isAutoStartEnabled }; 