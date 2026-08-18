# DSH Desktop

> 类似 **Codex 桌面端** 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 原生桌面客户端。

![Electron](https://img.shields.io/badge/Electron-43-47848f?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/当前安装包-Windows_x64-0d1117)
![License](https://img.shields.io/badge/License-MIT-d9a441)
![Version](https://img.shields.io/badge/Version-0.7.0-3fb950)

**零配置，开箱即用。** 安装后直接运行，无需系统安装 Node.js / pnpm。应用优先连接本机已有 DSH 服务；没有则自动启动随安装包交付并经过验证的 DeepSeek Harness Runtime。

v0.7.0 在 v0.6.0 实时插件市场与插件安全预检的基础上，新增了 **官方 DSH Runtime 安全自动更新体系**：官方发布新版本后，Desktop 可以独立下载、校验、隔离自检、暂存、兼容性预检并安全切换，失败时继续使用上一版本或安装包内置 Runtime。

## 立即下载

### Windows x64

**[下载 DSH Desktop v0.7.0 安装包](https://github.com/guanyibei1314/dsh-desktop-plugin/releases/download/v0.7.0/DSH-Desktop-Setup-0.7.0.exe)**

Release 页面：

**https://github.com/guanyibei1314/dsh-desktop-plugin/releases/tag/v0.7.0**

当前正式发行目标为 Windows x64。macOS / Linux 代码路径仍保留，但尚未建立正式安装包发布流程。

## v0.7.0 重点

### 1. 官方 DSH Runtime 安全自动更新

安装包内置官方 `@deepseek-ai/dsh@0.1.0-rc.7` 作为永久兜底 Runtime。默认 Stable 通道每天检查一次官方 npm `latest`；可选 Latest 通道在官方提供更高 `next` 时跟进。

更新链路不是简单执行 `npm install @latest`，而是：

```text
官方 npm Registry
      ↓
校验包名 / 版本 / 官方 HTTPS tarball
      ↓
校验 sha512 integrity
      ↓
OSV 已知漏洞检查
      ↓
禁用安装期 lifecycle scripts
      ↓
安装到独立用户 Runtime 目录
      ↓
隔离 DSH_HOME 启动真实 DSH Web 自检
      ↓
暂存 candidate
      ↓
下次启动用真实私有 Profile 做兼容性预检
      ├─ 成功 → 激活新 Runtime
      └─ 失败 → 保留旧版 / 安装包内置 Runtime
```

安全约束：

- 固定官方 `registry.npmjs.org` 来源；
- 拒绝 HTTP 降级、凭据 URL 和非官方 tarball；
- 必须有 `sha512` integrity；
- 自动更新安装阶段禁用 lifecycle scripts；
- 查询 OSV；安全评估不可用时 fail-closed；
- 新 Runtime 不覆盖 `app.asar` 或安装目录；
- 更新完成不会强制中断正在运行的会话；
- 主 Harness、插件管理与 bundled skin reconciliation 统一使用当前已验证 Runtime，避免 CLI / 服务版本漂移。

### 2. 实时插件市场

插件管理器直接连接社区实时目录。每次打开 / 刷新优先读取在线目录；仅在网络失败时回退最近一次本地缓存。

支持：

- 搜索、分类、排序；
- 热门 / 最新筛选；
- 已安装筛选；
- npm 插件一键安装、升级、卸载；
- 已安装状态对账；
- 非 npm / URL / Git / shell 条目仅展示，不进入一键安装链路。

### 3. 插件安装前安全预检

市场安装 / 升级前会重新检查：

- npm 发布元数据；
- lifecycle scripts；
- 维护者信息；
- integrity / shasum；
- 发布时间；
- 依赖规模；
- deprecated 状态；
- OSV 已知漏洞。

风险分为 Low / Medium / High / Critical / Unknown：

- **Critical / Unknown**：市场一键安装直接阻止；
- **High**：必须再次确认；
- 安全评分属于自动化风险预检，**不代表对第三方插件绝对安全的保证**。

### 4. 内置 Skin Center

继续固定并离线交付 `@linxin666/dsh-skins@0.1.18`，包含 Skin Center 与上游皮肤资产。

首次启动从安装包物理目录通过本地 `link:` 注册到私有 Web Profile，不需要在线下载皮肤。

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 🖥️ 独立原生窗口 | Electron 窗口加载 DSH Web 客户端，窗口位置 / 大小自动记忆 |
| 🚀 官方 DSH Runtime | 内置官方 DSH，并支持独立安全自动更新、双阶段自检和回滚 |
| 🧩 实时插件市场 | 实时社区目录、搜索 / 分类 / 排序、一键 npm 安装升级卸载 |
| 🛡️ 插件安全预检 | npm 元数据 + lifecycle scripts + integrity + OSV 风险评估 |
| 🗂️ 原生会话菜单 | 列出会话、运行状态、工作目录；可打开目录、复制会话 ID |
| ✉️ 托盘快速发消息 | 不切回主窗口即可向已有会话提交 prompt |
| 💻 内置终端 | xterm + node-pty 原生终端，终端权限只属于终端页面 |
| 🎨 内置皮肤中心 | 固定版本 `@linxin666/dsh-skins` 随安装包离线交付 |
| 🌐 内置浏览器 | `BaseWindow + WebContentsView`；远程网页无 Node / Electron 权限 |
| 📌 Sites | 常用 Web 工具独立工作区；每个 Site 独立持久化浏览器分区 |
| 🎨 原生主题菜单 | 跟随系统 / 亮色 / 暗色，写入 Harness `ui-theme` 设置 |
| 🔔 系统通知 | 回合结束、代理出错弹系统通知；点击通知聚焦窗口 |
| 💤 运行中防休眠 | 有会话运行时阻止系统休眠，空闲时恢复 |
| ⚡ 全局快捷键 | `Ctrl+Alt+D` 显示 / 隐藏窗口 |
| 🚀 开机自启 | 可选随系统登录启动 |
| 🔁 断线自愈 | DSH 服务不可用时重试，事件流断开后自动重连 |
| ⏱️ 启动闪屏 | 插件较多时显示轻量启动页，主 Web Surface 就绪后切换 |
| 🔒 最小权限桥接 | DSH Web 不获得 PTY / 插件管理 / Sites 等高权限 IPC |
| 📦 运行时闭包门禁 | CI 检查 DSH、pnpm、PTY、xterm、skins 等关键物理运行时 |
| 📏 安装包审计 | CI 同时限制绝对体积和相对上一正式版的增长 |

## 使用入口

桌面能力位于 **工具** 菜单，托盘也提供对应入口：

- **插件管理 / 实时市场**：`Ctrl+Shift+P`
- **内置浏览器**：`Ctrl+Shift+B`
- **Sites**：`Ctrl+Shift+S`
- **内置终端**：`Ctrl+Shift+T`
- **皮肤中心**：DSH Web 设置中的 Skin Center

## 安全边界

DSH Desktop 将不同能力拆开，而不是给所有页面一个万能 preload：

```text
DSH Web              -> 无桌面高权限 bridge
终端 terminal.html   -> 仅 PTY bridge
插件市场 / 管理器     -> 仅受限 plugin IPC
浏览器工具栏          -> 仅导航 IPC
远程浏览网页          -> 无 preload / 无 Node
Sites 管理器          -> 仅 Sites CRUD / open IPC
Site 远程网页         -> 无 preload / 无 Node
bundled skins         -> 本地 / 离线 Web Profile link
Runtime updater       -> 固定官方源 + integrity + OSV + 双阶段自检
```

本地管理页面使用 CSP；IPC handler 同时校验发送者实际 `webContents`。远程网页默认拒绝摄像头、麦克风、定位等权限申请。

### Runtime 更新红蓝测试

v0.7.0 的对抗用例覆盖：

- 恶意版本号 / shell 字符；
- 假冒 npm 包；
- 非官方 tarball；
- HTTP 降级；
- `registry.npmjs.org.evil.com` 等伪装域名；
- URL 内嵌账号密码；
- 缺失 / 错误 integrity；
- lifecycle scripts；
- 原型污染形态元数据；
- 非 DSH 子进程误重定向；
- OSV 不可用时 fail-closed。

### 插件市场红蓝测试

覆盖：

- 恶意社区目录数据；
- XSS sink；
- 原型污染；
- HTTP redirect；
- 恶意 npm spec / 命令注入；
- 非 npm 条目误进入一键安装；
- 安全评估不可用时 fail-closed。

## CI / 发布门禁

Windows PR 与正式 Release 构建会执行：

1. 严格 `npm ci`，只使用仓库已提交 lockfile；
2. JavaScript 静态语法检查；
3. Runtime updater 功能测试；
4. Runtime updater 红蓝安全测试；
5. 实时核对安装包内 DSH 与官方 stable；
6. 源码级从官方 npm 下载 Runtime，执行 integrity / OSV、自检与激活；
7. 插件市场功能测试；
8. 插件市场红蓝测试；
9. NSIS Windows 安装包真实构建；
10. packaged smoke；
11. bundled pnpm / `dsh plugin` / offline skins 验证；
12. **安装后的正式候选 EXE** 从官方 Registry 下载并激活 Runtime；
13. 安装后的实时插件市场 + 安全预检；
14. 连续 **3 轮** 清洁安装 → 冷启动 → 二次启动 → 静默卸载；
15. 安装包 / unpacked runtime 审计；
16. 全部成功后才允许创建 GitHub Release。

### 体积策略

继续保持两条硬门禁：

- 安装包绝对大小不得超过 **125 MiB**；
- 相对上一正式版 v0.6.0（`127,385,289` bytes）最多增长 **3 MiB**。

超过任意一条，CI 直接失败，不允许发布。

## 架构概要

```text
bootstrap.js
├── runtime-manager.js
│   ├── official npm metadata / integrity / OSV
│   ├── managed runtime store
│   ├── isolated DSH Web probe
│   ├── real Profile activation preflight
│   └── rollback / fallback
├── desktop-extensions.js
│   ├── plugin market / bundled pnpm runtime
│   ├── WebContentsView Browser
│   └── Sites
├── plugin-market-ipc.js
│   ├── live community registry
│   └── plugin security preflight
├── bundled-web-ui.js
│   └── local/offline dsh-skins -> web Profile reconciliation
└── main.js
    ├── DSH Host 启停 / RPC / SSE
    ├── 主窗口 / 菜单 / 托盘
    ├── 通知 / 防休眠 / 快速发送
    └── xterm + node-pty Terminal
```

## 数据位置

应用用户数据目录中主要有：

- `settings.json`：窗口、通知、自启、Runtime 更新偏好等；
- `dsh-home/`：私有 DSH Home、Profiles、插件依赖；
- `dsh-runtime/`：独立管理的官方 DSH Runtime 版本；
- `dsh-runtime/state.json`：active / previous / pending / latest Runtime 状态；
- `dsh-runtime/runtime-update.log`：Runtime 更新诊断；
- `dsh-home/desktop-bundled-web-ui.json`：Desktop 管理的内置皮肤状态；
- `bundled-web-ui.log`：内置皮肤初始化诊断；
- `sites.json`：Sites 列表；
- Chromium `persist:*` partitions：内置浏览器与各 Site 独立 Web 会话数据。

## 从源码运行

开发环境需要 Node.js；最终安装包不需要用户另外安装 Node。

```bash
npm ci
npm run check
npm start
```

打包 / 本地验证：

```bash
npm run check
npm run test:runtime-update
npm run test:runtime-update-security
npm run test:market
npm run test:market-security
npm run dist
npm run verify:packaged-plugin
npm run audit:package
```

高级选项：`DSH_URL` 环境变量或 `--url=` 可覆盖 Harness 地址。显式指定后只连接该地址，不自动回退到内置 DSH。

## 常见问题

**以后 DeepSeek Harness 更新，还需要重新下载整个 Desktop 吗？**  
通常不需要。v0.7.0 已将 DSH Runtime 与桌面壳解耦，新 Runtime 会通过安全更新链独立暂存与激活。桌面 UI / Electron 本身更新时仍需安装新的 Desktop Release。

**Runtime 更新失败会不会把应用弄坏？**  
更新不会直接覆盖当前 Runtime。候选必须通过隔离 Web 自检和真实 Profile 预检；失败时继续使用上一版本或安装包内置 DSH。

**皮肤还需要联网安装吗？**  
不需要。Skin Center 与选定皮肤资产已经随安装包交付，首次注册使用本地 `link:` 并强制 pnpm offline。

**为什么没有把整个 dsh-web-ui-all 都默认塞进安装包？**  
其中包含 SSH、Remote Web、任务执行、图像理解、梁神模式等更高权限 / 更大运行时能力。它们继续作为可选插件，以控制默认攻击面和安装包体积。

**插件市场的“安全”是否等于绝对安全？**  
不是。自动预检可以阻挡已知漏洞、可疑安装脚本、异常元数据和无法评估的包，但无法证明第三方代码不存在恶意逻辑、供应链劫持或零日问题。

**插件安装后为什么建议重启？**  
`dsh plugin` 会更新 `web` Profile 并对账 bundle 列表；重启可重新生成 Host / Profile，避免在已有会话运行中热替换整个插件运行图。

**内置浏览器等于给网页本机 Shell 权限吗？**  
不是。远程内容没有 preload、Node 或 Electron bridge，权限申请默认拒绝。终端和插件管理属于另外的本地受控 Surface。

**关闭主窗口后应用还在运行？**  
设计上关闭到托盘。需要彻底退出时使用 文件 → 退出或托盘 → 退出。

第三方来源和许可证记录见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

## License

DSH Desktop 自身代码使用 [MIT](./LICENSE)。随安装包分发的第三方组件保留各自许可证和归属，详见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。