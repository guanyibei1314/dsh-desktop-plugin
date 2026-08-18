# DSH Desktop

> 类似 **Codex 桌面端** 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 原生桌面客户端。

![Electron](https://img.shields.io/badge/Electron-43-47848f?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/当前安装包-Windows_x64-0d1117)
![License](https://img.shields.io/badge/License-MIT-d9a441)
![Version](https://img.shields.io/badge/Version-0.9.0-3fb950)

**零配置，开箱即用。** DSH Desktop 自带经过验证的 DeepSeek Harness Runtime；从 v0.9.0 起，Windows 安装包还内置官方完整 Node.js LTS 和官方完整 Git for Windows 安装器。若机器上已经存在可用的 `node` / `git`，默认保留用户现有安装；缺失时才安装并由各自官方安装器持久化到 Windows `PATH`。

v0.9.0 **不使用便携 Node，也不使用 MinGit**。Node.js 与 Git 安装后是正常的独立 Windows 产品；卸载 DSH Desktop 不会删除它们。

## 立即下载

### Windows x64

**[下载 DSH Desktop v0.9.0 安装包](https://github.com/guanyibei1314/dsh-desktop-plugin/releases/download/v0.9.0/DSH-Desktop-Setup-0.9.0.exe)**

Release 页面：

**https://github.com/guanyibei1314/dsh-desktop-plugin/releases/tag/v0.9.0**

当前正式发行目标仍为 **Windows x64**。v0.9.0 不扩展 macOS / Linux 正式发布链。

## v0.9.0 重点

### 1. 官方完整 Node.js LTS

随安装包内置并按需安装：

```text
Node.js 24.19.0 LTS x64
官方 Windows MSI
node-v24.19.0-x64.msi
```

构建时必须同时满足：

- 固定 `nodejs.org` 官方 HTTPS 下载路径；
- 固定版本；
- 固定 SHA-256；
- Authenticode 签名必须有效；
- 任一项不符则发布失败。

安装使用官方 MSI 默认功能集，提供正常 Node.js / npm / PATH 集成。DSH **不会强制选择 Node.js 的可选 native-module build-tools 流程**，因此不会因为安装 Node 而主动拉入 Python / Visual Studio Build Tools。

### 2. 官方完整 Git for Windows

随安装包内置并按需安装：

```text
Git for Windows 2.55.0.windows.3 x64
官方完整安装器
Git-2.55.0.3-64-bit.exe
```

它不是 MinGit，也不是 PortableGit。使用完整 Git for Windows 发行版，并保留其 Git Bash / Git GUI / Git LFS 等完整发行能力。

构建时同样要求：

- 固定官方 Git for Windows GitHub Release URL；
- 固定版本；
- 固定 SHA-256；
- Authenticode 签名有效；
- 校验失败直接阻断发布。

Git 安装使用 `PathOption=Cmd`：让 `git` 在 Windows shell 中可用，同时避免把整套 Unix 工具目录放到 Windows PATH 前面，降低 `find` / `sort` 等同名命令覆盖系统命令的风险。

### 3. 自动写入 Windows PATH

DSH 安装器先检测当前环境：

```text
node --version
  ├─ 可用 -> 保留用户现有 Node
  └─ 不可用 -> 安装内置官方 Node MSI

git --version
  ├─ 可用 -> 保留用户现有 Git
  └─ 不可用 -> 安装内置官方 Git for Windows
```

PR #10 的 Windows 真实安装 E2E 已验证：

```text
Node PATH: Machine=True, User=False
Git  PATH: Machine=True, User=False
```

并重新构造持久化 Machine/User PATH 后启动新的 `cmd`，`where node` 与 `where git` 都可以解析成功。

### 4. 安装/卸载边界

Node.js 与 Git for Windows 由各自官方安装器安装为独立产品：

- DSH 不接管它们的卸载器；
- DSH 卸载时不会删除 Node/Git；
- DSH 卸载时不会主动删除官方安装器维护的 PATH；
- 用户已有可用 Node/Git 时，正常安装默认不覆盖。

这比把 Node/Git 私藏在 DSH 私有目录中更符合“安装后整个系统都可以直接使用”的目标。

### 5. 安装包体积仍有硬门禁

v0.8.0 候选约 `124.14 MiB`。加入完整 Node MSI 与完整 Git for Windows 后，PR #10 已验证的 v0.9.0 候选为：

```text
226,818,745 bytes
216.31 MiB
```

相对 v0.8.0 比较基线增加约 `92.17 MiB`。Windows CI 没有取消体积限制，而是为这个明确的工具链增量设置：

```text
绝对硬上限：230 MiB
单版本增长上限：110 MiB
```

超过门禁仍会阻断发布。

## v0.8.0 能力继续保留

### Runtime 更新 GUI

入口：

- **选项 -> DSH Runtime 更新**
- 托盘 -> **Runtime 更新**

可以查看 current / bundled / latest / previous / pending / blocked Runtime，切换 Stable / Latest、开关自动更新、立即检查、手动回滚、重启应用并打开 Runtime 数据目录。

Runtime 控制面板是独立本地 sandbox 窗口，DSH Web 不获得 Runtime 管理权限。

### 安全 Runtime 自动更新

```text
官方 npm Registry
      ↓
包名 / SemVer / 官方 HTTPS tarball
      ↓
sha512 integrity
      ↓
OSV（不可评估 fail-closed）
      ↓
禁用 lifecycle scripts
      ↓
managed runtime store
      ↓
isolated dsh web probe
      ↓
pending
      ↓
下次启动真实 Profile preflight
      ├─ 成功 -> activate
      └─ 失败 -> previous / bundled fallback
```

新 Runtime 不覆盖 `app.asar` 或安装目录，也不会为了更新强制中断当前会话。

### Runtime 安全维护

- junction-aware smoke Profile cleanup；
- symlink / junction 只解除链接，不递归穿透外部目标；
- 自动 GC 未引用 managed Runtime；
- 永远保护 `active` / `previous` / `pending`；
- Release 随最终 EXE 发布独立 `.sha256`。

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 独立原生窗口 | Electron Windows 桌面窗口，位置 / 大小自动记忆 |
| 完整 Node.js | v0.9.0 按需安装官方 Node.js LTS MSI，并持久化 PATH |
| 完整 Git for Windows | v0.9.0 按需安装完整 Git for Windows，不是 MinGit/PortableGit |
| 官方 DSH Runtime | bundled fallback + 独立安全自动更新 + 双阶段自检 + 回滚 |
| Runtime 控制面板 | 状态、通道、自动更新、检查、回滚与诊断入口 |
| Runtime 自动维护 | junction-aware cleanup + active/previous/pending 保护 GC |
| 实时插件市场 | 社区实时目录、搜索 / 分类 / 排序、一键 npm 安装升级卸载 |
| 插件安全预检 | npm metadata + lifecycle scripts + integrity + OSV 风险评估 |
| 原生会话菜单 | 会话、运行状态、工作目录、打开目录、复制 session ID |
| 托盘快速发消息 | 不切回主窗口即可向已有会话提交 prompt |
| 内置终端 | xterm + node-pty，PTY 权限只属于终端页面 |
| 内置 Skin Center | 固定版本 `@linxin666/dsh-skins` 随安装包离线交付 |
| 内置浏览器 | `BaseWindow + WebContentsView`；远程网页无 Node / Electron 权限 |
| Sites | 常用 Web 工具独立工作区，各自持久化浏览器分区 |
| 原生主题 | 跟随系统 / 亮色 / 暗色 |
| 系统通知 | 回合结束、Agent 错误通知；点击聚焦 |
| 运行中防休眠 | 会话运行时阻止系统休眠，空闲恢复 |
| 全局快捷键 | `Ctrl+Alt+D` 显示 / 隐藏 |
| 开机自启 | 可选随系统登录启动 |
| 断线自愈 | DSH 服务与事件流自动重试 / 重连 |
| 最小权限桥接 | DSH Web 不获得 PTY / Runtime / 插件管理 / Sites 高权限 IPC |
| 运行时闭包门禁 | CI 检查 DSH、pnpm、PTY、xterm、skins 等物理 Runtime |
| 安装包审计 | 绝对体积 + 相对增长双门禁 |

## 使用入口

- **Runtime 更新**：选项 -> `DSH Runtime 更新`
- **插件管理 / 实时市场**：`Ctrl+Shift+P`
- **内置浏览器**：`Ctrl+Shift+B`
- **Sites**：`Ctrl+Shift+S`
- **内置终端**：`Ctrl+Shift+T`
- **Skin Center**：DSH Web 设置中的 Skin Center

## 安全边界

DSH Desktop 不给所有页面一个万能 preload：

```text
DSH Web                 -> 无桌面高权限 bridge
Runtime settings        -> 仅本地 Runtime settings IPC
Terminal                -> 仅 PTY bridge
Plugin manager/market   -> 仅受限 plugin IPC
Browser toolbar         -> 仅导航 IPC
Remote browser content  -> 无 preload / 无 Node
Sites manager           -> 仅 Sites CRUD / open IPC
Site remote content     -> 无 preload / 无 Node
Bundled skins           -> 本地 / 离线 Profile link
Runtime updater         -> 官方源 + integrity + OSV + 双阶段自检
Runtime maintenance     -> boundary check + lstat + junction no-traverse
Toolchain source        -> 固定官方 URL + SHA-256 + Authenticode
```

远程网页默认拒绝摄像头、麦克风、定位等权限申请。

自动安全预检能降低已知风险，但**不等于证明第三方代码绝对安全**。它无法保证不存在 zero-day、恶意普通 JS、未来维护者账号被攻陷或延时/条件触发逻辑。

## CI / 发布门禁

Windows PR 与正式 Release 会执行：

1. `npm ci`
2. Node/Git toolchain manifest 来源 / 版本 / SHA-256 静态检查
3. 正式图标 materialize + SHA/PNG/尺寸校验
4. JavaScript 静态检查
5. Runtime updater functional
6. Runtime updater red-blue
7. Runtime maintenance junction + GC test
8. 官方 DSH stable 对账
9. 官方 Runtime 下载 / 激活快速探针
10. 插件市场 functional
11. 插件市场 red-blue
12. PowerShell E2E parse
13. **真实下载并验证完整 Node/Git 安装器 SHA-256 + Authenticode**
14. NSIS 正式打包
15. packaged application smoke
16. packaged plugin runtime + offline skins
17. **强制安装完整 Node/Git + Program Files 版本 + 持久化 PATH + 新 shell + DSH 卸载独立性 E2E**
18. 安装后的官方 Runtime 更新 E2E
19. 安装后的 live market + security E2E
20. 连续 **3 轮** clean install -> cold start -> restart -> uninstall
21. 安装包 / Runtime 体积审计
22. 最终 EXE SHA-256 generation
23. artifact upload
24. 正式发布时再次校验 `.sha256` 后才创建 Release

任一门禁失败都不允许公开发布。

## 数据位置

应用 userData 中主要有：

- `settings.json`：窗口、通知、自启、Runtime 更新偏好；
- `dsh-home/`：私有 DSH Home、Profiles、插件依赖；
- `dsh-runtime/`：managed Runtime store；
- `dsh-runtime/state.json`：active / previous / pending / latest / blocked；
- `dsh-runtime/runtime-update.log`：更新与维护诊断；
- `dsh-home/desktop-bundled-web-ui.json`：bundled skins 状态；
- `bundled-web-ui.log`：Skin Center 初始化诊断；
- `sites.json`：Sites 列表；
- Chromium `persist:*` partitions：Browser / Sites 独立 Web 会话。

Node.js 与 Git for Windows 不放在 DSH userData 中；它们由官方安装器安装到正常 Windows 产品位置并维护各自 PATH / 卸载信息。

## 从源码运行

开发环境需要 Node.js；最终 Windows 安装包会在系统缺失可用 Node/Git 时按需安装完整工具链。

```bash
npm ci
npm run test:toolchain-manifest
npm run check
npm run test:runtime-update
npm run test:runtime-update-security
npm run test:runtime-maintenance
npm run test:market
npm run test:market-security
npm start
```

打包 / 本地验证（Windows）：

```bash
npm run prepare:toolchain
npm run dist
npm run verify:packaged-plugin
npm run audit:package
```

高级选项：`DSH_URL` 或 `--url=` 可覆盖 Harness 地址。显式指定后只连接该地址，不自动回退 bundled DSH。

## 常见问题

**机器已经有 Node.js / Git，会被强制覆盖吗？**  
正常安装不会。安装器先执行 `node --version` / `git --version`；只要当前 PATH 上已有可用命令，就保留用户现有安装。CI 的强制安装开关只用于测试，不是普通用户默认行为。

**为什么不使用便携 Node / MinGit？**  
v0.9.0 的目标就是让安装后 Node 与 Git 成为整个 Windows 系统可直接使用的正常开发工具，而不是只服务 DSH 的私有运行时，因此采用两者官方完整安装器。

**为什么 Git 没把所有 Unix 命令都塞进 PATH？**  
完整 Git for Windows 仍然安装；PATH 选择的是官方 `Cmd` 模式，让 `git` 可从 cmd/PowerShell 使用，同时避免 `find` / `sort` 等 Unix 同名工具意外覆盖 Windows 系统命令。

**卸载 DSH 会不会把 Node/Git 也删掉？**  
不会。真实 E2E 会先通过 DSH 安装完整 Node/Git，再卸载 DSH，随后重新验证 Node/Git 二进制和 PATH 仍存在。

**Node.js 会不会顺手装 Visual Studio / Python？**  
不会由 DSH 主动选择。DSH 使用 Node 官方 MSI 默认功能集，不强制启用可选 native-module build-tools 流程。

**以后 DeepSeek Harness 更新，还需要重新下载整个 Desktop 吗？**  
通常不需要。DSH Runtime 已与桌面壳解耦；Electron/Desktop UI 或内置系统工具链发生变化时才需要新 Desktop Release。

**Runtime 更新失败会不会把应用弄坏？**  
候选不会直接覆盖当前 Runtime。它必须先通过隔离 Web 自检，下一次启动再通过真实 Profile 预检；失败继续使用 previous 或 bundled Runtime。

**怎么手动回滚 Runtime？**  
打开 `选项 -> DSH Runtime 更新`，选择“回滚上一版本”，然后重启应用。

**为什么梁神模式等没有默认塞进安装包？**  
SSH、Remote Web、任务执行、图像理解、梁神模式等继续作为可选插件，避免默认扩大攻击面和安装包体积。

第三方来源和许可证记录见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

## License

DSH Desktop 自身代码使用 [MIT](./LICENSE)。随安装包分发的第三方组件保留各自许可证和归属，详见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。
