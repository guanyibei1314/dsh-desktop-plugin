# DSH Desktop 开发日志

> 工程日志用于记录为什么做、发现了什么、如何修、测试是否通过。用户可读版本变化请看 `CHANGELOG.md`；接手说明请看 `HANDOFF.md`。

## 2026-08-18 — v0.8.0 Runtime 控制面板 + Runtime 维护

### 目标

按用户确认范围只完成原交接文档的 **P1 + P3**：

- P1：Runtime 更新可视化 UI；
- P3：junction-aware smoke Profile 清理、旧 managed Runtime 自动 GC、正式 Release EXE SHA-256；
- **本版本不做 Linux 发布链扩展**，也没有把跨平台发布塞进本次范围。

### 分支 / PR / 版本

- 分支：`feat/v0.8.0-runtime-maintenance`
- PR：#8 `feat: v0.8.0 runtime control and maintenance`
- 版本：`0.7.1 -> 0.8.0`
- PR merge：`7c29fb584244b0c56a1dca77c63611b323d1c656`
- 正式发布触发：`e26cc388a7dc9ff41aa0182011cd5acfd1fc1c5f` (`release: v0.8.0`)

### P1：Runtime 更新 GUI

新增：

- `runtime-control.js`
- `runtime-settings-window.js`
- `runtime-settings-preload.js`
- `runtime-settings.html`
- `runtime-settings.js`

界面提供：

- 当前 Runtime 版本 / source；
- 安装包 bundled fallback 版本；
- 最近一次检查到的官方版本；
- previous / pending / blocked 状态；
- 最近检查时间 / 最近激活时间；
- Stable / Latest 更新通道；
- 自动更新开关；
- 手动检查更新；
- 手动回滚；
- 重启并应用；
- 打开 Runtime 目录。

桌面入口：

- 应用菜单 `选项 -> DSH Runtime 更新`；
- 托盘 `Runtime 更新`。

### Runtime GUI 安全边界

没有给 DSH Web 增加 Runtime 管理 bridge。

Runtime 控制窗口是本地 `BrowserWindow`：

```text
contextIsolation = true
nodeIntegration  = false
sandbox          = true
```

preload 只暴露最小方法集；IPC handler 同时验证调用者必须是当前 Runtime 设置窗口的真实 `webContents`。窗口拒绝导航到非本地页面并禁止新窗口。

### 自动更新调度调整

v0.7.x 主要在启动后安排一次后台更新检查。v0.8.0 改成应用运行期间持续调度：

```text
启动后短延迟触发
      ↓
调用现有 checkAndStageUpdate
      ↓
runtime-manager.shouldCheck 保持 24h 实际联网门禁
      ↓
应用仍运行时按小时重新触发门禁判断
```

因此长期不退出 DSH Desktop 的用户也不会永远错过后续检查，同时没有把真实更新频率提高到每小时。

### P3：junction-aware 清理

v0.7.0 曾经发现：直接递归删除隔离 smoke DSH_HOME 可能沿 Windows junction/link 穿透，伤到 managed Runtime。此前为安全起见停止递归清理。

v0.8.0 新增 `safeRemoveTree()`：

- 每个节点先 `lstat`；
- 普通目录才递归；
- symlink / junction / reparse point 只解除链接本身；
- 删除前强制校验路径仍位于允许的 runtime boundary 内；
- Windows junction 对 `unlink` 的兼容问题有 `rmdir` 仅删除链接本身的 fallback；
- 清理失败只记录诊断，不允许通过越界删除来“强行清干净”。

旧 smoke Profile 超过 24 小时后才进入清理。

### P3：managed Runtime GC

启动完成 Runtime 选择/激活后执行 GC：

永远保护：

```text
activeVersion
previousVersion
pendingVersion
```

其余 `dsh-runtime/versions/*` 不再无限累积。

回滚到 previous 时通过 pending 在下一次启动做真实 Profile 预检；回滚到 bundled 时保留当前 managed 版本为 previous，避免回滚动作本身破坏恢复路径。

### P3：正式 EXE SHA-256

Windows workflow 新增：

1. 对最终 `DSH-Desktop-Setup-<version>.exe` 执行 SHA-256；
2. 生成同名 `.exe.sha256`；
3. artifact 同时上传 EXE / checksum / blockmap / latest.yml；
4. publish job 下载的是已经过完整门禁的 artifact，不重新 build；
5. publish 前执行 `sha256sum -c`；
6. Release Notes 写入正式 EXE SHA-256；
7. `.sha256` 作为独立 Release asset 发布。

### 新增维护安全测试

新增 `scripts/test-runtime-maintenance.js`，Windows CI 中真实构造：

```text
smoke-home/old-probe/runtime-link
                     │
                     └─ Windows junction -> runtime root 外部目录
                                           └─ sentinel.txt
```

测试要求：

- old smoke profile 被清理；
- junction 本身消失；
- 外部 `sentinel.txt` 必须仍存在；
- active / previous / pending fake Runtime 必须保留；
- stale Runtime 必须被 GC；
- 任何 runtime boundary 外路径直接拒绝删除。

### 审查中主动发现并修复的问题

#### 1. 更新通道 UI 与旧 updater 语义不完全一致

第一次实现曾把 `DSH_RUNTIME_CHANNEL=stable` 显示为强制覆盖，但原 `runtime-manager.updateSettings()` 实际只有显式 `latest` 环境变量会强制进入 Latest；stored latest 否则仍生效。

修复：`runtime-control.effectiveSettings()` 与原 updater 的真实语义严格对齐，避免 UI 显示一个实际上没有生效的配置。

#### 2. blocked 状态没有独立可视化

第一版 UI 已返回 `blockedVersions`，但没有在主状态卡中单独显示。

修复：新增 Blocked 版本卡片、最近 blocked 版本摘要以及 warning 状态，不让用户只能通过日志猜测候选为什么没激活。

### PR #8 最终 Windows 验证

最终代码 head：`af07884fec180eb3ab84ca505f383339636d39bb`

Windows build #58：**success**。

已验证：

1. `npm ci`
2. 图标 materialize / 校验
3. JavaScript 静态检查（包含所有 v0.8.0 新文件）
4. Runtime updater functional
5. Runtime updater red-blue
6. **Runtime maintenance junction + GC test**
7. official DSH stable verify
8. source Runtime download / activation probe
9. plugin market functional
10. plugin market red-blue
11. PowerShell E2E parse
12. Windows NSIS build
13. packaged application smoke
14. packaged plugin runtime + offline skins
15. installed official Runtime updater E2E
16. installed live market + security E2E
17. **3 rounds clean install -> cold start -> restart -> uninstall**
18. package/runtime size audit
19. installer SHA-256 generation
20. artifact upload

PR 门禁全绿后才合并到 `main`。

### 正式 Release 状态

`release: v0.8.0` 已按仓库既定流程触发。正式 Release 仍必须再次通过同一套 Windows 门禁；最终 EXE SHA-256 以该正式发布 workflow 生成的 `.sha256` / Release Notes 为准，不能拿 PR artifact digest 冒充。

### 仍存在的限制 / 下一步

- P0 小白级首次启动 / API Key 引导仍未做；
- P2 dependency-tree OSV / provenance / 更强插件权限与 sandbox 等纵深防御仍未做；
- macOS 正式发布链仍未建立；
- **Linux 发布链本版本按用户要求不做**；
- 自动预检仍不能证明第三方普通 JS 不含恶意逻辑，也不能覆盖 zero-day / 维护者账号被攻陷等供应链风险。

---

## 2026-08-18 — v0.7.1 正式桌面图标

### 目标

将用户确认的第一版蓝青科技风 DSH Desktop 图标接入正式 Windows 安装包，并保持可审计、可重复构建。

### 实施

- 创建分支：`feat/branding-v0.7.1`
- PR：#7 `feat: v0.7.1 desktop app icon branding`
- 版本：`0.7.0 -> 0.7.1`
- 图标统一用于：
  - Windows app/installer
  - 主窗口
  - splash
  - 发送消息窗口
  - 终端窗口
- 托盘继续使用独立轻量 `tray.png`

### 二进制资源策略调整

直接向 GitHub 写图片二进制 blob 的链路不适合作为稳定、可复核的图标交付路径。

最终方案：

```text
assets/icon-source.b64
  -> scripts/materialize-app-icon.js
  -> 校验 PNG signature
  -> 校验 256×256
  -> 校验 byte length
  -> 校验 SHA-256
  -> assets/icon.png
```

任何校验失败直接阻断 `start/smoke/check/dist`。

### 测试

Windows build #48 全部通过：

- static syntax
- Runtime updater functional
- Runtime updater red-blue
- official DSH stable verify
- source Runtime download/activation probe
- plugin market functional
- plugin market red-blue
- NSIS build
- packaged smoke
- packaged plugin runtime/offline skins
- installed Runtime update E2E
- installed live market/security E2E
- 3 rounds clean install/cold start/restart/uninstall
- package audit
- artifact upload

候选 artifact：

```text
id: 9318361023
name: dsh-desktop-windows
digest: sha256:2d895c3177379e27b23deb3b6b71e7530544fd2a7fac738b977f9a98adebccc7
```

注意：digest 属于 Actions artifact ZIP，不是最终 Release EXE SHA-256。

### 合并 / 发布

- PR #7 merge commit：`5eb8cb0ce4da511317ee274ab39874f62c17a136`
- merge commit GitHub verified
- release trigger：`b308dc0d02c466df21aa613e951dfb38bd4b122a`
- README v0.7.1 sync：`436952b02e27a163d1b4b91691b315b79652998d`
- `v0.7.1` tag 已验证存在

---

## 2026-08-18 — v0.7.0 Managed Official DSH Runtime Updates

### 背景

官方 DeepSeek Harness `@deepseek-ai/dsh` 从 rc.6 更新到 rc.7。目标不是简单把安装包依赖改成 `@latest`，而是让以后 DSH Runtime 可以在不重新下载整个桌面安装包的情况下安全升级。

### 设计原则

- 安装包继续带固定、已验证的 bundled Runtime 作为 fallback
- managed Runtime 放用户目录，不修改 app.asar/安装目录
- 不在当前会话中热切换
- 更新先 stage，下次启动对真实 Profile preflight 后再激活
- 失败自动保留 previous/bundled Runtime
- 安全检查不可用时 fail-closed

### 主要实现

新增：

- `runtime-update-core.js`
- `runtime-manager.js`
- `scripts/test-runtime-update.js`
- `scripts/test-runtime-update-red-blue.js`
- `scripts/verify-official-dsh.js`
- `scripts/verify-installed-runtime-update.ps1`

修改：

- `bootstrap.js`
- Windows build/release workflow
- package version/dependency lock

### 官方 Runtime 校验

发布时要求安装包 bundled `@deepseek-ai/dsh` 与官方 npm stable/latest 一致。

v0.7.0 发布时验证：

```text
@deepseek-ai/dsh = 0.1.0-rc.7
```

### Runtime 更新安全策略

根包必须满足：

- exact package name
- strict SemVer
- official `registry.npmjs.org`
- HTTPS tarball
- 不允许 URL username/password
- sha512 integrity
- 自动更新不允许 lifecycle scripts
- OSV 不可用或发现直接 DSH 漏洞则 block

安装：

- 使用 bundled pnpm
- exact version
- official registry pinned
- `--ignore-scripts`
- audit/fund/update notifier disabled

验证：

1. installed package name/version/bin
2. lockfile expected sha512
3. real `dsh --version`
4. isolated `dsh web` HTTP probe
5. pending stage
6. next boot actual Profile preflight
7. activate or rollback

### 重要故障：junction cleanup

第一次 installed Runtime E2E：

- 官方下载成功
- integrity 成功
- isolated smoke 成功
- activation 失败：`pending runtime files are missing or invalid`

定位到：隔离 smoke 后递归删除临时 DSH_HOME，而 DSH 可能在 Profile 中创建指向 managed Runtime 的 Windows junction/link；递归删除可能穿透 link 并破坏 Runtime。

修复：

- 不再递归清理该 smoke Profile
- 保留少量诊断元数据
- activation failure 输出具体 blocked reason

修复后：source updater + installed updater 全链路通过。

### 体积门禁问题

候选曾被 package audit 正确阻断：使用了错误 baseline `126,499,002` bytes。

重新核对公开 v0.6.0：

```text
127,385,289 bytes
```

改成真实基线后：

- 没有放宽 125 MiB 绝对上限
- 没有放宽 3 MiB 单版本增长上限
- 最终候选通过

### 最终验证

PR #6 最终 Windows Workflow #44：success。

覆盖：

- Runtime functional/red-blue
- official npm live verify
- source download/activation
- market functional/red-blue
- NSIS
- packaged smoke
- installed Runtime updater
- installed live market/security
- 3 round clean install/restart/uninstall
- audit

### 合并 / 发布

- merge：`ef8824c2c392d0271fe8dbdb8b135a4d9f515c00`
- release trigger：`1993acfa5db1b0379d621d5a70cd5b5cc7b929ee`
- v0.7.0 tag 已创建

---

## 2026-08-18 — v0.6.0 实时插件市场 + 安全预检

### 目标

将插件管理从静态/人工包名升级成实时社区目录，同时避免把“实时市场”变成远程代码注入入口。

### Registry

```text
https://awesome-dsh-plugin.com/plugins.json
```

### 市场行为

- 每次打开/刷新读取 live registry
- 失败才回退 cache
- 搜索/分类/排序
- npm 包一键 install/update/remove
- 非 npm 条目展示但不进入一键安装链
- renderer 不注入远程 HTML

### 网络/解析约束

- fixed registry URL
- manual redirects rejected
- response size limit
- prototype pollution key block：`__proto__`, `prototype`, `constructor`
- HTTP metadata URL stripped
- caller-restricted IPC

### 插件安全预检

- npm metadata
- publish time
- maintainers
- repo metadata
- lifecycle scripts
- dependency count
- integrity
- deprecation
- OSV

风险：

```text
low      < 20
medium   20-44
high     45-69
critical >= 70
```

策略：

- critical：block
- high：require explicit confirm
- unknown/无法评估：block

### 安全边界

该机制属于 heuristic preflight，不等于证明插件 JS 没有恶意逻辑，也不能防止所有 transitive dependency、zero-day、维护者账号被攻陷等风险。

---

## 2026-08-17/18 — v0.5.x 内置 Skin Center 稳定化

### 目标

把 `@linxin666/dsh-skins` 的 Skin Center 与皮肤资产变成随安装包交付的精选 Web UI 能力，避免普通用户再手工执行插件安装。

### 最终固定版本

```text
@linxin666/dsh-skins@0.1.18
```

### 行为

- 安装包本地 link
- Web Profile reconciliation
- pnpm offline
- 不下载 `@latest`
- 初始化失败不阻断主程序
- 用户已有显式 registry/local-link 版本时不擅自覆盖

### v0.5.1

重点修复 Skin Center Profile 持久化/注册问题。

公开安装包记录：

```text
DSH-Desktop-Setup-0.5.1.exe
127,377,535 bytes
SHA256 de40af4042c20cff8942e505521579d99a2aeb2d5969aa3a63f05e42f69e5d86
```

---

## 2026-08-16 — v0.4.0 桌面扩展基线

主要完成：

- 内置 pnpm 插件管理环境
- 内置浏览器
- Sites
- IPC 权限分离
- packaged runtime closure
- node-pty/xterm 终端闭包
- 安装包体积审计
- GitHub Release 自动版本化

具体用户可读变化保留在 `CHANGELOG.md`。

---

## 后续工程日志规则

每次功能开发都至少记录：

1. 日期 / 版本 / PR
2. 目标
3. 架构选择和原因
4. 主要文件
5. 发现的 bug / 安全问题
6. 修复方式
7. 测试门禁
8. 合并 commit
9. release trigger/tag
10. 仍存在的限制和下一步

禁止只写“已完成/测试通过”而不记录测试范围、失败历史和边界。
