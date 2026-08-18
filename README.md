# DSH Desktop

> 类似 **Codex 桌面端** 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 原生桌面客户端。

![Electron](https://img.shields.io/badge/Electron-43-47848f?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/当前安装包-Windows_x64-0d1117)
![License](https://img.shields.io/badge/License-MIT-d9a441)
![Version](https://img.shields.io/badge/Version-0.8.0-3fb950)

**零配置，开箱即用。** 安装后直接运行，无需系统安装 Node.js / pnpm / DSH CLI。应用优先连接显式指定的 DSH 服务；没有则自动启动随安装包交付并经过验证的官方 DeepSeek Harness Runtime。

v0.8.0 在 v0.7.x 的安全 Runtime 自动更新、实时插件市场、安全预检、Skin Center 与正式桌面图标基础上，补齐 **Runtime 更新 GUI** 和 **Runtime 维护闭环**：用户可以看到更新状态、切换通道、手动检查/回滚；后台可以安全清理 junction-containing smoke Profile 和未使用 Runtime；正式 Release 同时发布最终 EXE SHA-256。

## 立即下载

### Windows x64

**[下载 DSH Desktop v0.8.0 安装包](https://github.com/guanyibei1314/dsh-desktop-plugin/releases/download/v0.8.0/DSH-Desktop-Setup-0.8.0.exe)**

Release 页面：

**https://github.com/guanyibei1314/dsh-desktop-plugin/releases/tag/v0.8.0**

当前正式发行目标仍为 **Windows x64**。v0.8.0 **没有扩展 Linux 发布链**；macOS / Linux 正式发布属于后续独立范围。

## v0.8.0 重点

### 1. Runtime 更新 GUI

入口：

- **选项 -> DSH Runtime 更新**
- 托盘 -> **Runtime 更新**

可以查看：

- 当前 Runtime 与来源；
- 安装包 bundled fallback；
- 最近一次检查到的官方版本；
- previous / pending / blocked；
- 最近检查时间与最近激活时间；
- 当前 managed Runtime 列表。

可以操作：

- Stable / Latest 更新通道；
- 自动更新开关；
- 立即检查；
- 手动回滚；
- 重启并应用；
- 打开 Runtime 数据目录。

Runtime 控制面板是独立本地 sandbox 窗口。DSH Web **不会**因此获得 Runtime 管理权限。

### 2. 长时间运行也会继续检查 Runtime 更新

应用运行期间会定期重新触发更新检查门禁；现有 `shouldCheck` 仍控制实际 24 小时联网周期，因此不是“每小时下载一次”。

更新链保持：

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

### 3. junction-aware Runtime 维护

v0.8.0 重新启用旧 smoke Profile 清理，但不再使用可能穿透 Windows junction 的危险递归删除。

规则：

- 删除路径必须位于允许的 Runtime boundary 内；
- 普通目录才递归；
- junction / symlink 只解除链接本身；
- 不进入链接指向的外部目标；
- 旧 smoke Profile 超过 24 小时才清理。

CI 会真实创建一个指向 Runtime root 外部的 Windows junction，并要求外部 `sentinel.txt` 在清理后仍存在。

### 4. managed Runtime 自动 GC

自动保留：

```text
active
previous
pending
```

其他长期未引用 Runtime 会从 `userData/dsh-runtime/versions/` 清理，避免版本目录无限累积。

### 5. 正式安装包 SHA-256

Windows Release 流程现在会：

1. 对最终 EXE 计算 SHA-256；
2. 生成 `DSH-Desktop-Setup-<version>.exe.sha256`；
3. 把 checksum 与 EXE 一起作为已验证 artifact 传给 publish；
4. publish 前执行 `sha256sum -c`；
5. `.sha256` 与 EXE 一起发布；
6. Release Notes 写入最终 EXE SHA-256。

不要把 GitHub Actions artifact ZIP digest 当作安装包 SHA-256。

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 🖥️ 独立原生窗口 | Electron Windows 桌面窗口，位置 / 大小自动记忆 |
| 🚀 官方 DSH Runtime | bundled fallback + 独立安全自动更新 + 双阶段自检 + 回滚 |
| 🔄 Runtime 控制面板 | v0.8.0 新增状态、通道、自动更新、检查、回滚与诊断入口 |
| 🧹 Runtime 自动维护 | junction-aware smoke cleanup + active/previous/pending 保护 GC |
| 🧩 实时插件市场 | 社区实时目录、搜索 / 分类 / 排序、一键 npm 安装升级卸载 |
| 🛡️ 插件安全预检 | npm metadata + lifecycle scripts + integrity + OSV 风险评估 |
| 🗂️ 原生会话菜单 | 会话、运行状态、工作目录、打开目录、复制 session ID |
| ✉️ 托盘快速发消息 | 不切回主窗口即可向已有会话提交 prompt |
| 💻 内置终端 | xterm + node-pty，PTY 权限只属于终端页面 |
| 🎨 内置 Skin Center | 固定版本 `@linxin666/dsh-skins` 随安装包离线交付 |
| 🌐 内置浏览器 | `BaseWindow + WebContentsView`；远程网页无 Node / Electron 权限 |
| 📌 Sites | 常用 Web 工具独立工作区，各自持久化浏览器分区 |
| 🎨 原生主题 | 跟随系统 / 亮色 / 暗色 |
| 🔔 系统通知 | 回合结束、Agent 错误通知；点击聚焦 |
| 💤 运行中防休眠 | 会话运行时阻止系统休眠，空闲恢复 |
| ⚡ 全局快捷键 | `Ctrl+Alt+D` 显示 / 隐藏 |
| 🚀 开机自启 | 可选随系统登录启动 |
| 🔁 断线自愈 | DSH 服务与事件流自动重试 / 重连 |
| 🔒 最小权限桥接 | DSH Web 不获得 PTY / Runtime / 插件管理 / Sites 高权限 IPC |
| 📦 运行时闭包门禁 | CI 检查 DSH、pnpm、PTY、xterm、skins 等物理 Runtime |
| 📏 安装包审计 | 绝对体积 + 相对增长双门禁 |

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
```

远程网页默认拒绝摄像头、麦克风、定位等权限申请。

自动安全预检能降低已知风险，但**不等于证明第三方代码绝对安全**。它无法保证不存在 zero-day、恶意普通 JS、未来维护者账号被攻陷或延时/条件触发逻辑。

## CI / 发布门禁

Windows PR 与正式 Release 会执行：

1. `npm ci`
2. 正式图标 materialize + SHA/PNG/尺寸校验
3. JavaScript 静态检查
4. Runtime updater functional
5. Runtime updater red-blue
6. **Runtime maintenance junction + GC test**
7. 官方 DSH stable 对账
8. 官方 Runtime 下载 / 激活快速探针
9. 插件市场 functional
10. 插件市场 red-blue
11. PowerShell E2E parse
12. NSIS 正式打包
13. packaged application smoke
14. packaged plugin runtime + offline skins
15. 安装后的官方 Runtime 更新 E2E
16. 安装后的 live market + security E2E
17. 连续 **3 轮** clean install -> cold start -> restart -> uninstall
18. 安装包 / Runtime 体积审计
19. 最终 EXE SHA-256 generation
20. artifact upload
21. 正式发布时再次校验 `.sha256` 后才创建 Release

### 体积策略

- 安装包绝对大小不得超过 **125 MiB**；
- 相对已验证比较基线最多增长 **3 MiB**。

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

## 从源码运行

开发环境需要 Node.js；最终安装包不需要用户另外安装 Node。

```bash
npm ci
npm run check
npm run test:runtime-update
npm run test:runtime-update-security
npm run test:runtime-maintenance
npm run test:market
npm run test:market-security
npm start
```

打包 / 本地验证：

```bash
npm run dist
npm run verify:packaged-plugin
npm run audit:package
```

高级选项：`DSH_URL` 或 `--url=` 可覆盖 Harness 地址。显式指定后只连接该地址，不自动回退 bundled DSH。

## 常见问题

**以后 DeepSeek Harness 更新，还需要重新下载整个 Desktop 吗？**  
通常不需要。DSH Runtime 已与桌面壳解耦；Electron/Desktop UI 自身更新时才需要新 Desktop Release。

**Runtime 更新失败会不会把应用弄坏？**  
候选不会直接覆盖当前 Runtime。它必须先通过隔离 Web 自检，下一次启动再通过真实 Profile 预检；失败继续使用 previous 或 bundled Runtime。

**怎么手动回滚？**  
打开 `选项 -> DSH Runtime 更新`，选择“回滚上一版本”，然后重启应用。没有可恢复版本时按钮会禁用或返回明确原因。

**为什么还有 blocked Runtime？**  
候选可能因 integrity、OSV、来源、lifecycle scripts、真实启动或 Profile 兼容性检查失败而被阻止。blocked 不会替换当前已验证 Runtime。

**皮肤需要联网安装吗？**  
不需要。Skin Center 与选定皮肤资产随安装包离线交付。

**为什么梁神模式等没有默认塞进安装包？**  
SSH、Remote Web、任务执行、图像理解、梁神模式等继续作为可选插件，避免默认扩大攻击面和安装包体积。

**Linux 版 v0.8.0 在哪里？**  
本版本按范围决定不做 Linux 正式发布链；当前公开安装包仍为 Windows x64。

第三方来源和许可证记录见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

## License

DSH Desktop 自身代码使用 [MIT](./LICENSE)。随安装包分发的第三方组件保留各自许可证和归属，详见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。
