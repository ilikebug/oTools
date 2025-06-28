// main.js - 插件主逻辑

module.exports = {
  onActivate() {
    // 插件被激活时调用
    console.log('示例插件已激活');
  },
  onDeactivate() {
    // 插件被卸载/关闭时调用
    console.log('示例插件已卸载');
  },
  // 你可以导出更多方法供 preload.js 或主进程调用
  doSomething(data) {
    return `插件收到: ${data}`;
  }
};
