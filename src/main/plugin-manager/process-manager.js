const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');

class PluginProcessManager {
  constructor(pluginsDir) {
    this.pluginsDir = pluginsDir;
    this.processes = new Map(); // name -> child_process
  }

  // 启动所有插件
  startAll() {
    const pluginDirs = fs.readdirSync(this.pluginsDir).filter(f => fs.statSync(path.join(this.pluginsDir, f)).isDirectory());
    for (const dir of pluginDirs) {
      this.startPlugin(dir);
    }
  }

  // 启动单个插件
  startPlugin(dirName) {
    const pluginPath = path.join(this.pluginsDir, dirName);
    const metaPath = path.join(pluginPath, 'plugin.json');
    if (!fs.existsSync(metaPath)) return;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const mainPath = path.join(pluginPath, meta.main || 'main.js');
    if (!fs.existsSync(mainPath)) return;
    if (this.processes.has(meta.name)) {
      this.stopPlugin(meta.name);
    }
    const child = fork(mainPath, [], {
      cwd: pluginPath,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });
    child.on('message', msg => {
      // 处理插件进程发来的消息
      console.log(`[插件:${meta.name}] 收到消息:`, msg);
      // 你可以在这里转发到主进程/前端
    });
    child.on('exit', (code, signal) => {
      console.log(`[插件:${meta.name}] 进程退出 code=${code} signal=${signal}`);
      this.processes.delete(meta.name);
    });
    this.processes.set(meta.name, child);
    // 可选：初始化消息
    child.send({ type: 'init', meta });
    console.log(`[插件:${meta.name}] 已启动`);
  }

  // 停止单个插件
  stopPlugin(name) {
    const child = this.processes.get(name);
    if (child) {
      child.kill();
      this.processes.delete(name);
      console.log(`[插件:${name}] 已停止`);
    }
  }

  // 停止所有插件
  stopAll() {
    for (const name of this.processes.keys()) {
      this.stopPlugin(name);
    }
  }

  // 给插件进程发消息
  sendToPlugin(name, msg) {
    const child = this.processes.get(name);
    if (child) {
      child.send(msg);
    }
  }
}

module.exports = PluginProcessManager; 