# DSH Desktop

> 类似 **Codex 桌面端** 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 原生桌面客户端

![Electron](https://img.shields.io/badge/Electron-43-47848f?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/当前安装包-Windows-0d1117)
![License](https://img.shields.io/badge/License-MIT-d9a441)
![Version](https://img.shields.io/badge/Version-0.3.0-3fb950)

**零配置，开箱即用**：安装后直接运行，无需安装 Node.js、无需任何命令行。应用优先连接本机已有 DSH 服务；没有则自动启动打包内置的 DeepSeek Harness，全部自动完成。

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 🖥️ 独立原生窗口 | Electron 窗口加载运行中的 DSH Web 客户端，窗口位置/大小自动记忆 |
| 🗂️ 原生会话菜单 | 列出全部会话（工作目录 + 运行状态），一键打开工作目录、复制会话 ID，实时刷新 |
| ✉️ 托盘快速发消息 | 托盘 →「发送消息…」：选会话 + 输入内容，直接经 API 发给 agent |
| 🎨 原生主题菜单 | 跟随系统 / 亮色 / 暗色，写入 harness 的 `ui-theme` 设置并即时生效 |
| 🔔 系统通知 | 回合结束、代理出错弹通知（**点击通知聚焦窗口**；菜单「选项」可开关） |
| 💤 运行中防休眠 | 有会话运行时阻止系统休眠（`powerSaveBlocker`），空闲时自动恢复 |
| 💡 窗口状态可视化 | 标题栏实时显示「N 个会话运行中」；任务完成时窗口闪烁提醒 |
| ⚡ 全局快捷键 | `Ctrl+Alt+D` 随时显示/隐藏窗口（菜单「选项」可开关） |
| 🚀 开机自启 | 菜单「选项」勾选开机自启，登录后自动运行 |
| 🔁 断线自愈 | 服务未启动显示重试页（每 5 秒自动重试）；DSH 重启后事件流自动重连 |
| 🚀 内置 DeepSeek Harness | 本机没有 DSH 服务时自动启动打包内置的 DSH（独立数据目录，退出自动关闭），无需安装 Node |
| 💻 内置终端 | 菜单/托盘「打开终端」：xterm + node-pty 原生终端窗口，自动适配窗口尺寸 |
| ⏱️ 启动闪屏 | 启动即显示 splash 窗口，插件较多时加载期间不再白屏；就绪后无缝切换 |
| 🔒 最小权限桥接 | 远程/本地 DSH Web 页面不获得桌面 IPC；仅应用自己的错误页、发送对话框、终端页按页面精确匹配暴露最小 API |

## 下载安装包（无需终端）

直接到 **GitHub Releases** 下载安装包，双击安装，无需任何命令行操作：

**https://github.com/guanyibei1314/dsh-desktop-plugin/releases**

- 下载 `DSH-Desktop-Setup-<版本>.exe`（NSIS 安装程序，可选安装目录）
- 安装后打开「DSH Desktop」即用：自动连接本机 DSH 服务，没有则自动启动内置 DSH——全程无需安装 Node、无需敲命令
- 当前正式安装包目标是 Windows；macOS / Linux 代码路径保留跨平台实现，但尚未建立正式发行包

> 维护者发布流程：`npm run dist` 打包 → 设置 `GH_TOKEN` 环境变量 → `npm run release` 一键创建 Release 并上传安装包（无需 gh CLI）。

## 快速开始（从源码运行）

前置要求：本机已安装 [Node.js ≥ 18](https://nodejs.org/)（DSH 服务无需手动启动，应用会自动拉起内置 DSH；若本机已有 DSH 在运行也会直接复用）。

```bash
npm install
npm start
```

高级选项（**可选，非必需**）：`DSH_URL` 环境变量或 `--url=` 可覆盖服务地址（指定后只连接该地址，不启动内置 DSH）。

## 打包安装程序

```bash
npm run dist
```

镜像已内置在脚本中，Windows 产物：`dist/DSH-Desktop-Setup-<版本>.exe`。

### 安装包体积策略

DSH Desktop 是“安装即用”模式，因此安装包同时包含 Electron/Chromium、桌面主进程、DeepSeek Harness 运行时和终端依赖，不能把内置 DSH 简单删除来换体积。

当前构建采用保守优化：

- Electron 仅保留 `zh-CN` 与 `en-US` locale；
- 排除生产依赖中的 source map；
- NSIS 构建使用 `maximum` 压缩；
- 继续保留 DSH 依赖闭包的真实 `node_modules` 目录，因为 DSH profile module fallback 会为运行依赖创建 junction，不能把这些包全部藏进只读 ASAR；
- GitHub Actions 的 Windows build 会输出实际安装包字节数 / MiB 并上传短期测试 artifact，避免只凭源码猜体积。

## 安全边界

主 DSH Web UI 与本机高权限能力分离：

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；
- `preload.js` 默认不向普通 DSH Web 页面暴露任何桌面 API；
- `error.html` 只获得 `retry/quit`；
- `send-dialog.html` 只获得会话列表、发送消息、关闭对话框；
- `terminal.html` 才能获得 PTY 接口；
- 本地辅助页面额外设置 CSP，阻止非预期的外部脚本/资源加载。

这样即使 DSH Web renderer 本身出现脚本注入，也不会直接继承 `node-pty` / Shell 能力。

## 桌面集成原理

- **内置 DSH 启动**：检测 3080 无服务时，主进程用 Electron 自带 Node 运行时（RunAsNode + expose-internals）启动打包的 `@deepseek-ai/dsh`（web profile，自动分配端口，独立数据目录），就绪后加载窗口，退出时自动关闭
- **主题**：`POST /api/settings.update` 写入 `ui-theme.preference`（`system` / `light` / `dark`）；页面内主题服务订阅设置变更后即时生效
- **通知**：订阅 `GET /api/events.host`（SSE），监听 `host/session-status` 的 running 翻转与 `host/agent-error`
- **托盘状态**：`POST /api/session.list` 每 20 秒轮询 + SSE 实时推送双重保障
- **快速发消息**：`POST /api/session.prompt`（`mode: queue`），与网页端同一提交管线
- **打开工作目录**：`POST /api/host.openPath`

## 项目结构

```text
├── main.js              # 主进程：窗口 / 菜单 / 托盘 / SSE / 防休眠 / 主题 / 内置 DSH / PTY
├── preload.js           # 最小权限桥接：仅精确匹配的本地页面获得对应 IPC API
├── error.html           # 服务不可用时的重试页
├── splash.html          # 启动闪屏
├── terminal.html        # 内置终端窗口（xterm）
├── send-dialog.html     # 托盘「发送消息」对话框
├── assets/              # 图标
├── scripts/
│   ├── make-icon.js     # 图标生成器
│   └── release.js       # GitHub Release 发布脚本
├── .github/workflows/
│   └── windows-build.yml # Windows 构建、语法检查、安装包尺寸报告
└── package.json
```

## 常见问题

**启动后显示「DeepSeek Harness 暂未就绪」**

应用会自动尝试启动内置 DSH。首次初始化可能较慢；若持续失败，从源码运行时请先完整执行 `npm install`。若显式设置了 `DSH_URL` / `--url=`，应用只连接指定服务，不会回退到内置 DSH。

**内置 DSH 的数据存在哪？**

存在系统用户数据目录的 `dsh-home`（与应用自身偏好 `settings.json` 同级），与你自行安装的 DSH 数据目录相互独立，互不污染。

**关闭窗口后应用还在运行？**

这是设计行为：关窗隐藏到托盘。真正退出请用托盘菜单「退出」或菜单栏 文件 → 退出。

**个人偏好设置存在哪？**

应用自身偏好（窗口布局、通知开关、开机自启等）存在系统用户数据目录的 `settings.json`，与 harness 设置相互独立。

## License

[MIT](./LICENSE)
