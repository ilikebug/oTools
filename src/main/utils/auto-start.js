const { app } = require('electron');
const logger = require('./logger')

let AutoLaunch;
try {
  AutoLaunch = require('auto-launch');
} catch (e) {
  AutoLaunch = null;
}

const appName = app.getName ? app.getName() : 'oTools';
logger.info("auto start name", appName)

let autoLauncher = null;
if (AutoLaunch) {
  autoLauncher = new AutoLaunch({
    name: appName,
    path: app.getPath('exe'),
    isHidden: true
  });
}

async function setAutoStart(enable) {
  if (!autoLauncher) return;
  try {
    if (enable) {
      await autoLauncher.enable();
    } else {
      await autoLauncher.disable();
    }
  } catch (e) {
    throw e;
  }
}

async function isAutoStartEnabled() {
  if (!autoLauncher) return false;
  try {
    return await autoLauncher.isEnabled();
  } catch (e) {
    return false;
  }
}

module.exports = { setAutoStart, isAutoStartEnabled }; 