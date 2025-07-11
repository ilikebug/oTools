// LevelDB-based KV storage manager for plugins
// Dependency: npm install level
const path = require('path');
const { app } = require('electron');
const { Level } = require('level'); // Use destructuring for Level 8.x+
const { GetKVStorePath } = require('../comm');

const dbCache = new Map();

function getPluginKV(dbName) {
  if (!dbCache.has(dbName)) {
    const dbDir = path.join(GetKVStorePath(), dbName);
    const db = new Level(dbDir, { valueEncoding: 'json' }); // Use new Level
    dbCache.set(dbName, db);
  }
  return dbCache.get(dbName);
}

function closeAllKVs() {
  for (const db of dbCache.values()) {
    db.close();
  }
  dbCache.clear();
}

module.exports = { getPluginKV, closeAllKVs }; 