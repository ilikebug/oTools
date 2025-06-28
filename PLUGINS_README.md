# oTools 插件系统

## 概述

oTools 现在使用插件化架构，所有功能（包括默认功能）都通过插件的方式提供。插件运行在独立的子进程中，确保安全性和稳定性。

## 默认插件

### 1. OCR文字识别插件 (`ocr-plugin`)
- **功能**: 图片文字识别，支持中英文
- **位置**: `plugins/ocr-plugin/`
- **操作**: `performOCR(imagePath)`

### 2. 屏幕截图插件 (`screenshot-plugin`)
- **功能**: 全屏截图
- **位置**: `plugins/screenshot-plugin/`
- **操作**: `takeScreenshot()`

### 3. 剪贴板管理插件 (`clipboard-plugin`)
- **功能**: 剪贴板读取、写入、清空
- **位置**: `plugins/clipboard-plugin/`
- **操作**: `getClipboard()`, `setClipboard(text)`, `clearClipboard()`

## 插件结构

每个插件目录包含以下文件：

```
plugin-name/
├── plugin.json    # 插件配置文件
└── main.js        # 插件主逻辑
```

### plugin.json 格式

```json
{
  "name": "插件名称",
  "description": "插件描述",
  "version": "1.0.0",
  "author": "作者",
  "main": "main.js",
  "type": "builtin"
}
```

### main.js 格式

```javascript
// 插件主逻辑
class PluginName {
  constructor() {
    this.name = '插件名称';
    this.description = '插件描述';
    this.version = '1.0.0';
    this.author = '作者';
  }

  // 插件初始化
  async init() {
    console.log('[插件] 初始化完成');
  }

  // 插件执行入口
  async execute(action, ...args) {
    switch (action) {
      case 'actionName':
        return await this.actionMethod(...args);
      default:
        throw new Error(`未知的操作: ${action}`);
    }
  }

  // 插件清理
  async cleanup() {
    console.log('[插件] 清理完成');
  }
}

// 创建插件实例
const plugin = new PluginName();

// 处理主进程消息
process.on('message', async (message) => {
  try {
    if (message.type === 'init') {
      await plugin.init();
      process.send({ type: 'ready', plugin: plugin.name });
    } else if (message.type === 'execute') {
      const result = await plugin.execute(message.action, ...message.args);
      process.send({ type: 'result', id: message.id, result });
    } else if (message.type === 'cleanup') {
      await plugin.cleanup();
      process.send({ type: 'cleanup-complete' });
      process.exit(0);
    }
  } catch (error) {
    process.send({ 
      type: 'error', 
      id: message.id, 
      error: error.message 
    });
  }
});

// 通知主进程插件已加载
process.send({ type: 'loaded', plugin: plugin.name });
```

## 插件生命周期

1. **加载**: 插件进程启动，发送 `loaded` 消息
2. **初始化**: 主进程发送 `init` 消息，插件初始化后发送 `ready` 消息
3. **执行**: 主进程发送 `execute` 消息，插件执行后发送 `result` 或 `error` 消息
4. **清理**: 主进程发送 `cleanup` 消息，插件清理后发送 `cleanup-complete` 消息并退出

## 消息格式

### 主进程 -> 插件进程

```javascript
// 初始化
{ type: 'init', meta: pluginMeta }

// 执行操作
{ type: 'execute', id: messageId, action: 'actionName', args: [...] }

// 清理
{ type: 'cleanup' }
```

### 插件进程 -> 主进程

```javascript
// 加载完成
{ type: 'loaded', plugin: 'pluginName' }

// 初始化完成
{ type: 'ready', plugin: 'pluginName' }

// 执行结果
{ type: 'result', id: messageId, result: {...} }

// 执行错误
{ type: 'error', id: messageId, error: 'errorMessage' }

// 清理完成
{ type: 'cleanup-complete' }
```

## 开发新插件

1. 在 `plugins/` 目录下创建新的插件目录
2. 创建 `plugin.json` 配置文件
3. 创建 `main.js` 主逻辑文件
4. 重启应用，插件会自动加载

## 测试插件

可以使用测试脚本验证插件功能：

```bash
node test-plugins.js
```

## 优势

1. **进程隔离**: 插件运行在独立进程中，崩溃不会影响主进程
2. **安全性**: 插件无法直接访问主进程资源
3. **可扩展性**: 易于添加新功能
4. **稳定性**: 插件可以独立重启
5. **模块化**: 功能清晰分离，便于维护 