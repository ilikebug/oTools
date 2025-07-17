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

module.exports = {
  APP_STATUS,

  GetPluginPath,
  GetLoggerPath,
  GetConfigPath,
  GetKVStorePath,
};