# oTools - Desktop Application Management Center

oTools is a modern, extensible desktop productivity tool that integrates global hotkey activation, OCR recognition, screenshot, clipboard management, and a powerful plugin system. It is designed for developers and efficiency-focused users.

---

## Table of Contents

- [Main Features](#main-features)
- [Architecture & Module Overview](#architecture--module-overview)
- [Installation & Usage](#installation--usage)
- [Plugin Development Guide](#plugin-development-guide)
- [UI & Interaction](#ui--interaction)
- [Tech Stack](#tech-stack)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

---

## Main Features

### Core Highlights

- **Global Hotkey Activation**: Default `Ctrl+Shift+Space` to instantly bring up the main interface.
- **Modern UI**: Frosted glass effect, responsive design, smooth animations.
- **Plugin System**: Supports hot loading, dynamic management, and standard interfaces.
- **System Integration**: Deep integration with screenshot, OCR, clipboard, and other system features.

### Built-in Functions

- **OCR Recognition**: Supports image text recognition (Chinese & English).
- **Screenshot**: Quickly capture any area of the screen.
- **Clipboard Management**: View, edit, and clear clipboard history.
- **Search**: Global search for plugins and features.

### Plugin System

- **Hot Loading**: Automatic detection and loading of plugin changes, no restart required.
- **Standard Interface**: Unified plugin development, invocation, and communication protocol.
- **Plugin Management**: Visual interface for enabling, disabling, and uninstalling plugins.

---

## Architecture & Module Overview

### 1. Main Process (`src/main/`)

- **main.js**: Application entry point, responsible for window creation, global hotkey registration, and main process initialization.
- **core/**: Core managers
  - **app-manager.js**: Application orchestrator, coordinates logging, config, performance, plugin, and other subsystems.
  - **logger.js**: Logging system, supports console, file, and remote outputs.
  - **config-manager.js**: Configuration manager, supports hot loading and validation of main and plugin configs.
  - **performance-monitor.js**: Performance monitoring, records timings, memory, and slow operation warnings.
  - **error-handler.js**: Error handling, with auto-retry, restart, notification, and termination strategies.
- **plugin-manager/**: Plugin process pool, plugin manager, and process manager for plugin loading, execution, isolation, and communication.
  - **message-protocol.js**: Unified inter-process message protocol (format, types, events, responses).
- **utils/**: Utility functions
  - **mac-tools.js**: macOS system integration tools.
  - **window.js**: Window position save/restore.

### 2. Renderer Process (`src/renderer/`)

- **index.js**: Frontend logic, UI initialization, event binding, plugin button rendering, status display, plugin invocation, etc.
- **index.html / index.css**: Main UI structure and styles, supporting responsive layout and modern animations.

### 3. Plugins (`plugins/`)

- **screenshot-ocr/**: Built-in screenshot + OCR plugin
  - **main.js**: Plugin logic, listens for main process messages, calls screenshot and OCR, displays results in a custom HTML window.
  - **plugin.json**: Plugin metadata (name, description, version, author, etc.).
  - **result-viewer.html**: OCR result display window.

### 4. Configuration (`config/`)

- **main.json**: Main configuration file, including hotkeys, window, logging, plugin, and other global settings.
- **plugins/**: Individual plugin config directory.

### 5. Others

- **logs/**: Log file directory.
- **README.md**: Usage and development documentation.
- **forge.config.js**: Electron Forge packaging configuration.

---

## Installation & Usage

### Requirements

- Node.js 16+
- npm or yarn

### Install Dependencies

```bash
npm install
```

### Start in Development Mode

```bash
npm start
```

### Build the Application

```bash
npm run make
```

---

## Plugin Development Guide

### Plugin Structure

Each plugin is an independent directory and must include `main.js` (logic) and `plugin.json` (metadata).

#### plugin.json Example

```json
{
  "name": "screenshot-ocr",
  "description": "Screenshot OCR recognition plugin",
  "version": "1.0.0",
  "author": "oTools"
}
```

#### main.js Example

```js
module.exports = {
  name: 'Plugin Name',
  description: 'Plugin Description',
  version: '1.0.0',
  author: 'Author',
  async execute(...args) {
    // Plugin logic
    return {
      success: true,
      result: 'Execution result',
      message: 'Execution message'
    };
  }
};
```

### Plugin Communication & API

- Plugins communicate with the main process via inter-process messages, supporting main process API calls, custom window display, and result return.
- Plugins can listen for `init`, `execute`, `api_result`, etc., and actively send `result`, `api_call`, etc. to the main process.

### Plugin Installation & Management

1. Place the plugin directory under `plugins/`.
2. The app will automatically detect and load the plugin.
3. Enable/disable plugins in the main UI or plugin management panel.

---

## UI & Interaction

- **Main Interface**: Activated by global hotkey, supports search, plugin buttons, status panel, performance monitoring, error statistics, etc.
- **Plugin Buttons**: All loaded plugins are rendered as buttons; click to execute.
- **Result Window**: For example, the OCR plugin automatically pops up a window to display recognition results.
- **ESC**: Closes all popups or hides the main interface.

---

## Tech Stack

- **Electron**: Cross-platform desktop application
- **Node.js**: Backend logic
- **HTML/CSS/JavaScript**: Frontend UI
- **Tesseract.js**: OCR recognition
- **screenshot-desktop**: Screenshot
- **chokidar**: File/config hot loading

---

## FAQ

- **Hotkey Conflict**: Modify the hotkey in `config/main.json`.
- **Plugin Not Working**: Check the plugin directory structure and `plugin.json`.
- **Log Viewing**: All logs are saved in `logs/otools.log`.

---

## Contributing

1. Fork this project
2. Create a new branch (`git checkout -b feature/xxx`)
3. Commit your changes (`git commit -m 'description'`)
4. Push the branch (`git push origin feature/xxx`)
5. Submit a Pull Request

---

## License

MIT License. See LICENSE for details.

---

## Contact

- Author: ILikeBug
- Email: ye351016@gmail.com
- Project: [GitHub](https://github.com/your-username/oTools)

---

⭐ If you find this project helpful, please give it a star!

---

For more detailed development documentation or any questions, feel free to contact the author via email or GitHub Issue. 