# oTools - 应用管理中心

一个功能强大的桌面应用管理中心，支持全局快捷键呼出、OCR识别、截图、剪贴板管理等功能，并具备可扩展的插件系统。

## ✨ 主要功能

### 🚀 核心特性
- **全局快捷键呼出**: 使用 `Ctrl+Shift+Space` 快速呼出应用
- **现代化UI**: 毛玻璃效果、流畅动画、响应式设计
- **插件系统**: 支持动态加载和管理插件
- **系统集成**: 深度集成系统功能

### 🔧 内置功能
- **OCR文字识别**: 支持图片文字识别（中英文）
- **截图功能**: 快速截取屏幕
- **剪贴板管理**: 查看、编辑、清空剪贴板内容
- **搜索功能**: 快速搜索和访问功能

### 🔌 插件系统
- **动态加载**: 插件热加载，无需重启应用
- **标准化接口**: 统一的插件开发规范
- **插件管理**: 可视化插件管理界面

## 🛠️ 安装和运行

### 环境要求
- Node.js 16+
- npm 或 yarn

### 安装依赖
```bash
npm install
```

### 开发模式运行
```bash
npm start
```

### 打包应用
```bash
npm run make
```

## 📦 插件开发

### 插件结构
插件是一个标准的 Node.js 模块，需要导出以下接口：

```javascript
module.exports = {
  name: '插件名称',
  description: '插件描述',
  version: '1.0.0',
  author: '作者名',
  
  // 插件执行入口
  async execute(...args) {
    // 插件逻辑
    return {
      success: true,
      result: '执行结果',
      message: '执行消息'
    };
  }
};
```

### 插件示例
查看 `plugins/example-plugin.js` 了解完整的插件开发示例。

### 插件安装
1. 将插件文件放入应用的插件目录
2. 应用会自动检测并加载插件
3. 在插件管理面板中可以看到新安装的插件

## 🎨 界面预览

```
┌─────────────────────────────────────────────────┐
│                  Main Window                    │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │  搜索框     │ │  插件面板    │ │ 设置/管理 │ │
│  └─────────────┘ └─────────────┘ └───────────┘ │
└─────────────────────────────────────────────────┘
         ▲
         │ 全局快捷键触发
         │
┌────────┴────────┐  ┌───────────────────────────┐
│  主进程(Main)   │  │  插件系统(Plugin System)  │
└────────┬────────┘  └─────────────┬─────────────┘
         │                         │
         ▼                         ▼
┌───────────────────┐ ┌───────────────────────────┐
│ 系统功能集成      │ │ 插件目录(动态加载)         │
│ - OCR             │ │ - 插件1                   │
│ - 截图            │ │ - 插件2                   │
│ - 剪贴板管理      │ │ - ...                     │
│ - 文件操作        │ └───────────────────────────┘
└───────────────────┘
```

## 🔧 技术栈

- **Electron**: 跨平台桌面应用框架
- **Node.js**: 后端运行时
- **HTML/CSS/JavaScript**: 前端界面
- **Tesseract.js**: OCR文字识别
- **screenshot-desktop**: 截图功能
- **chokidar**: 文件监控
```

## 🚀 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+Space` | 呼出/隐藏应用 |
| `Esc` | 关闭模态框/隐藏应用 |

## 🔌 插件API

### 插件接口
```javascript
// 插件必须导出的接口
module.exports = {
  name: string,           // 插件名称
  description: string,    // 插件描述
  version: string,        // 版本号
  author: string,         // 作者
  
  // 执行方法
  async execute(...args): Promise<Object>
}
```

### 返回值格式
```javascript
{
  success: boolean,       // 是否成功
  result: any,           // 执行结果
  message: string        // 消息
}
```

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [Tesseract.js](https://tesseract.projectnaptha.com/) - OCR文字识别
- [Font Awesome](https://fontawesome.com/) - 图标库

## 📞 联系方式

- 作者: ILikeBug
- 邮箱: ye351016@gmail.com
- 项目地址: [GitHub](https://github.com/your-username/oTools)

---

⭐ 如果这个项目对你有帮助，请给它一个星标！ 