const path = require('path');
const {app} = require('electron')

const APP_STATUS = {
  INITIALIZING: 'initializing',
  RUNNING: 'running',
  STOPPED: 'stopped'
};

const GetPluginDir = () =>  {
  return path.join(app.getPath('appData'), 'oTools', 'plugins');
}

const GetLoggerDir = () => {
  return path.join(app.getPath('appData'), 'oTools', 'logs');
}

const GetConfigDir = () => {
  return path.join(app.getPath('appData'), 'oTools', 'configs');
}


function getSavedWindowPosition(store) {
  const pos = store.get('windowPosition');
  if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
    return pos;
  }
  return null;
}

function saveWindowPosition(store, x, y) {
  store.set('windowPosition', { x, y });
}

module.exports = {  }; 

module.exports = {
  APP_STATUS,

  GetPluginDir,
  GetLoggerDir,
  GetConfigDir,

  getSavedWindowPosition, 
  saveWindowPosition
};