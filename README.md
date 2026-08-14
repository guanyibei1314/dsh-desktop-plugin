# DSH Desktop

> 类似 **codex 桌面端** 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 原生桌面客户端

![Electron](https://img.shields.io/badge/Electron-最新版-47848f?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/平台-Windows%20%7C%20macOS%20%7C%20Linux-0d1117)
![License](https://img.shields.io/badge/License-MIT-d9a441)

独立原生窗口加载运行中的 DSH Web 客户端，无需浏览器；叠加完整的桌面集成：原生菜单、托盘状态、系统通知。

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 🖥️ 独立原生窗口 | Electron 窗口加载 `http://127.0.0.1:3080`（可用 `DSH_URL` / `--url=` 覆盖） |
| 🎨 原生主题菜单 | 跟随系统 / 亮色 / 暗色，写入 harness 的 `ui-theme` 设置并即时生效，与网页端设置实时同步 |
| 🗂️ 托盘图标 | 实时显示「N 个会话运行中」，点击显示窗口；关窗自动隐藏到托盘 |
| 🔔 系统通知 | 订阅 `/api/events.host` SSE——回合结束、代理出错时弹出通知（10 秒防抖） |
| 🔁 断线自愈 | 服务未启动显示重试页（每 5 秒自动重试）；DSH 重启后事件流 3 秒自动重连 |
| 🔒 安全默认 | `contextIsolation` + `sandbox`，远程页面无 Node 能力；外部链接交系统浏览器 |

## 快速开始

前置要求：本机已安装 [Node.js ≥ 18](https://nodejs.org/) 且 DSH 服务已在运行。

```bash
npm install        # 首次安装依赖
npm start          # 启动桌面应用
```

可选参数：

```bash
DSH_URL=http://127.0.0.1:3080 npm start   # 自定义服务地址（环境变量）
npm start -- --url=http://127.0.0.1:3080  # 自定义服务地址（命令行）
npm run smoke                              # 冒烟测试：页面加载成功则退出码 0
```

## 桌面集成原理

- **主题**：`POST /api/settings.update` 写入 `ui-theme.preference`（`system` / `light` / `dark`）；页面内主题服务订阅设置变更后即时生效
- **通知**：订阅 `GET /api/events.host`（SSE），监听 `host/session-status` 的 running 翻转与 `host/agent-error`
- **托盘状态**：`POST /api/session.list` 每 20 秒轮询 + SSE 实时推送双重保障

## 项目结构

```
├── main.js              # 主进程：窗口 / 菜单 / 托盘 / SSE 通知 / 主题 API
├── preload.js           # 仅错误页使用的桥接（retry / quit）
├── error.html           # 服务未运行时的重试页（自动重连）
├── assets/              # 生成的图标（tray.png 32×32、icon.png 256×256）
├── scripts/
│   └── make-icon.js     # 图标生成器（纯 Node SDF 绘制，无依赖）
└── package.json         # npm start / npm run smoke
```

## 打包为安装程序

```bash
npx electron-builder --win nsis   # Windows 安装包（首次会下载 builder 依赖）
```

## 常见问题

**Electron 二进制下载慢 / 失败**

```bash
# 使用国内镜像（Windows PowerShell）
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
npm install
```

**启动后显示「无法连接 DeepSeek Harness」**

确认 DSH 服务已启动（`dsh` 或 `pnpm dev:web`），服务就绪后页面会自动加载。

**关闭窗口后应用还在运行？**

这是设计行为：关窗隐藏到托盘。真正退出请用托盘菜单「退出」或菜单栏 文件 → 退出。

## License

[MIT](./LICENSE)
