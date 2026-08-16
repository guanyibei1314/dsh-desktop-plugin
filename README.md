# DSH Desktop

> 类似 **Codex 桌面端** 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 原生桌面客户端

![Electron](https://img.shields.io/badge/Electron-43-47848f?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/当前安装包-Windows-0d1117)
![License](https://img.shields.io/badge/License-MIT-d9a441)
![Version](https://img.shields.io/badge/Version-0.4.0-3fb950)

**零配置，开箱即用**：安装后直接运行，无需系统安装 Node.js。应用优先连接本机已有 DSH 服务；没有则自动启动打包内置的 DeepSeek Harness。0.4.0 在保留原有 DSH、终端和桌面集成的基础上，新增插件管理、内置浏览器与 Sites。

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 🖥️ 独立原生窗口 | Electron 窗口加载 DSH Web 客户端，窗口位置/大小自动记忆 |
| 🗂️ 原生会话菜单 | 列出会话、运行状态、工作目录；可打开目录、复制会话 ID |
| ✉️ 托盘快速发消息 | 不切回主窗口即可向已有会话提交 prompt |
| 💻 内置终端 | xterm + node-pty 原生终端，终端权限只属于终端页面 |
| 🧩 插件安装 / 升级环境 | 内置 pnpm，通过官方 `dsh plugin --profile web` 安装、升级、卸载和对账插件，不依赖系统 Node/pnpm |
| 🌐 内置浏览器 | `BaseWindow + WebContentsView`；远程网页无 Node/Electron 权限，独立持久化会话，默认拒绝权限申请 |
| 📌 Sites | 将常用 Web 工具保存成独立工作区；每个 Site 拥有独立持久化浏览器分区和登录态 |
| 🎨 原生主题菜单 | 跟随系统 / 亮色 / 暗色，写入 Harness `ui-theme` 设置 |
| 🔔 系统通知 | 回合结束、代理出错弹系统通知；点击通知聚焦窗口 |
| 💤 运行中防休眠 | 有会话运行时阻止系统休眠，空闲时恢复 |
| ⚡ 全局快捷键 | `Ctrl+Alt+D` 显示 / 隐藏窗口 |
| 🚀 开机自启 | 可选随系统登录启动 |
| 🔁 断线自愈 | DSH 服务不可用时重试，事件流断开后自动重连 |
| 🚀 内置 DeepSeek Harness | 本机无 DSH 时自动启动打包内置运行时，使用应用独立 DSH_HOME |
| ⏱️ 启动闪屏 | 插件较多时显示轻量启动页，主 Web Surface 就绪后切换 |
| 🔒 最小权限桥接 | 主 DSH Web 页面不获得本机 PTY/插件管理/Sites IPC；高权限能力分别由精确本地页面桥接 |
| 📦 运行时闭包门禁 | Windows 打包后验证 DSH CLI、pnpm、node-pty、xterm 等关键物理运行时存在 |
| 📏 安装包审计 | CI 输出安装包 MiB 和最大 unpacked 包，设置体积预算防止无意膨胀 |

## 使用入口

安装并打开后，原有功能保持不变。新增能力位于 **工具** 菜单，托盘也提供对应入口：

- **插件管理**：`Ctrl+Shift+P`
- **内置浏览器**：`Ctrl+Shift+B`
- **Sites**：`Ctrl+Shift+S`
- **内置终端**：`Ctrl+Shift+T`

### 插件管理

插件管理器操作 DSH 的 `web` Profile：

```text
安装   -> dsh plugin --profile web add <package>
升级   -> dsh plugin --profile web update <package>
卸载   -> dsh plugin --profile web remove <package>
列表   -> dsh plugin --profile web list --depth 0
```

桌面包内置匹配的 pnpm 环境，并用 Electron 的 RunAsNode 能力提供私有 Node/pnpm shim，因此不会修改系统全局 PATH，也不要求用户额外安装 Node 或 pnpm。

安全上，GUI **不是任意命令行**。当前只允许 npm Registry 包名以及受限版本/tag（例如 `@scope/plugin`、`plugin@1.2.3`、`plugin@latest`），拒绝 shell 元字符、Git URL、任意命令参数。安装、升级或卸载成功后，界面会提示重启应用以重新生成 DSH Profile。

### 内置浏览器

浏览器不是在 DSH Web renderer 中塞入一个高权限 iframe，而是独立的 Electron Surface：

```text
BaseWindow
├── WebContentsView：本地地址栏 / 导航工具栏
└── WebContentsView：远程 Web 内容
```

远程 Web 内容：

- `sandbox: true`
- `contextIsolation: true`
- `nodeIntegration: false`
- 无 preload / 无 Electron bridge
- 使用 `persist:dsh-browser` 独立会话
- 默认拒绝摄像头、麦克风、定位等权限申请
- 非 HTTP(S) 主导航被阻止；弹窗不在应用内获得新高权限窗口

### Sites

Sites 用于把 GitHub、文档站、内部面板、AI Web 工具等固定成“像 App 一样”的独立窗口。保存的数据位于应用用户目录 `sites.json`。

每个 Site 使用由 Site ID 派生的独立 `persist:dsh-site-*` 分区，因此：

- Site A 与 Site B 的 Cookie / Local Storage 默认隔离；
- Site 登录态不与内置浏览器混用；
- Site 页面没有 Node/Electron 权限；
- 也可以从 Sites 列表选择“浏览器打开”，临时交给内置浏览器浏览。

## 下载安装包

在 GitHub Releases 下载：

**https://github.com/guanyibei1314/dsh-desktop-plugin/releases**

Windows 产物为：

```text
DSH-Desktop-Setup-<版本>.exe
```

当前正式发行目标为 Windows x64。macOS / Linux 代码路径仍保留，但尚未建立正式安装包发布流程。

## 从源码运行

开发环境需要 Node.js；最终安装包不需要用户另外安装 Node。

```bash
npm ci
npm run check
npm start
```

高级选项：`DSH_URL` 环境变量或 `--url=` 可覆盖 Harness 地址。显式指定后只连接该地址，不自动回退到内置 DSH。

## 打包与验证

```bash
npm run check
npm run dist
npm run audit:package
```

Windows 构建会执行：

1. JavaScript 静态语法检查；
2. NSIS 真实打包；
3. `afterPack` 运行时闭包检查；
4. 安装包尺寸与 unpacked runtime 审计；
5. 上传短期 GitHub Actions artifact。

### 体积策略

本项目目标不是通过删除功能制造一个很小但不完整的安装包。当前安装即用闭包包含 Electron/Chromium、DSH、终端 native runtime，以及 0.4.0 起新增的 pnpm。

继续采用：

- Electron 仅保留 `zh-CN` / `en-US` locale；
- 排除生产依赖 source map；
- NSIS `maximum` 压缩；
- 保留 `node_modules/**` 的物理解包，因为 DSH Profile module fallback / junction 与 pnpm / native 模块都需要真实文件路径；
- `scripts/verify-runtime-closure.js` 确认关键运行时没有因打包优化丢失；
- `scripts/package-audit.js` 输出最大物理依赖，为之后有证据地精简非当前架构依赖提供依据，而不是凭包名删除。

CI 当前为 0.4.0 设置 150 MiB 安装包预算。最终实际大小以对应 Release/CI 构建结果为准。

## 安全边界

DSH Desktop 将不同能力拆开，而不是把一个万能 preload 暴露给所有页面：

```text
DSH Web             -> 无桌面高权限 bridge
终端 terminal.html -> 仅 PTY bridge
插件管理器          -> 仅受限 plugin IPC
浏览器工具栏        -> 仅导航 IPC
远程浏览网页         -> 无 preload / 无 Node
Sites 管理器         -> 仅 Sites CRUD / open IPC
Site 远程网页        -> 无 preload / 无 Node
```

本地管理页面使用 CSP，并且 IPC handler 还会验证发送者的实际 `webContents`，形成 preload 白名单 + 主进程发送者验证两层边界。

## 架构概要

```text
bootstrap.js
├── desktop-extensions.js
│   ├── 插件管理 / bundled pnpm runtime
│   ├── WebContentsView Browser
│   └── Sites
└── main.js
    ├── DSH Host 启停 / RPC / SSE
    ├── 主窗口 / 菜单 / 托盘
    ├── 通知 / 防休眠 / 快速发送
    └── xterm + node-pty Terminal
```

采用 bootstrap 扩展层是为了避免大范围改写已验证的旧 `main.js`。新增能力先注册安全 IPC 和菜单扩展，再加载现有主进程逻辑。

## 项目结构

```text
├── bootstrap.js
├── main.js
├── preload.js
├── desktop-extensions.js
├── terminal.html
├── plugin-manager.html
├── plugin-manager.js
├── plugin-manager-preload.js
├── browser-toolbar.html
├── browser-toolbar.js
├── browser-preload.js
├── sites.html
├── sites.js
├── sites-preload.js
├── error.html
├── send-dialog.html
├── splash.html
├── assets/
├── scripts/
│   ├── verify-runtime-closure.js
│   ├── package-audit.js
│   ├── make-icon.js
│   └── release.js
└── .github/workflows/windows-build.yml
```

## 数据位置

应用用户数据目录中主要有：

- `settings.json`：窗口、通知、自启等桌面偏好；
- `dsh-home/`：内置 DSH 的 Home、Profiles、插件依赖；
- `runtime-bin/`：应用私有 Node/pnpm shim；
- `sites.json`：Sites 列表；
- Chromium `persist:*` partitions：内置浏览器与各 Site 的独立 Web 会话数据。

## 常见问题

**插件安装后为什么要重启？**  
`dsh plugin` 会更新 `web` Profile 并对账 bundle 列表；当前桌面版本通过重启重新生成 Host/Profile，避免在已有会话运行中热替换整个插件运行图。

**内置浏览器等于给网页本机 Shell 权限吗？**  
不是。远程内容没有 preload、Node 或 Electron bridge，权限申请默认拒绝。终端和插件管理属于另外的本地受控 Surface。

**关闭主窗口后应用还在运行？**  
设计上关闭到托盘。需要彻底退出时使用 文件 → 退出或托盘 → 退出。

## License

[MIT](./LICENSE)
