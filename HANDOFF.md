# DSH Desktop 交接文档

> 最后更新：2026-08-18  
> 当前正式版本：`v0.8.0`  
> 仓库：`guanyibei1314/dsh-desktop-plugin`

## 1. 当前状态

DSH Desktop 已达到 Windows x64 可下载安装、无需系统 Node.js / pnpm / DSH 的桌面交付形态。

v0.8.0 本次范围严格为：

- **P1：Runtime 更新可视化 GUI**；
- **P3：Runtime 维护性**（junction-aware 清理、旧 Runtime GC、正式 EXE SHA-256）；
- **Linux 发布链本版本不做**。

代码 PR #8 已通过最终 Windows build #58 全门禁并合并到 `main`：

```text
PR #8 merge:
7c29fb584244b0c56a1dca77c63611b323d1c656

release trigger:
e26cc388a7dc9ff41aa0182011cd5acfd1fc1c5f
```

正式 `v0.8.0` tag 已生成，并已核对与发布触发提交 `e26cc388a7dc9ff41aa0182011cd5acfd1fc1c5f` 完全一致。发布流程在创建 Release 前会对最终 EXE 的 `.sha256` 执行 `sha256sum -c`；正式安装包 SHA-256 以 Release Notes 与同名 `.exe.sha256` asset 为唯一权威值，不使用 PR artifact digest 代替。

正式下载入口：

```text
https://github.com/guanyibei1314/dsh-desktop-plugin/releases/download/v0.8.0/DSH-Desktop-Setup-0.8.0.exe
```

Release 页面：

```text
https://github.com/guanyibei1314/dsh-desktop-plugin/releases/tag/v0.8.0
```

## 2. v0.8.0 核心新增

### Runtime 更新控制面板

入口：

```text
选项 -> DSH Runtime 更新
托盘 -> Runtime 更新
```

可查看：

- 当前 Runtime 版本与来源；
- 安装包 bundled fallback 版本；
- 最近一次检查到的官方版本；
- previous / pending / blocked；
- 最近检查时间；
- 最近激活时间；
- 已管理 Runtime 列表。

可操作：

- Stable / Latest 更新通道；
- 自动更新开关；
- 立即检查更新；
- 手动回滚；
- 重启并应用；
- 打开 Runtime 数据目录。

### Runtime GUI 权限边界

Runtime 管理能力没有暴露给 DSH Web。

```text
Runtime settings window
  -> local file only
  -> sandbox=true
  -> contextIsolation=true
  -> nodeIntegration=false
  -> minimal preload API
  -> IPC sender === runtime settings webContents

DSH Web
  -> 无 Runtime 管理 bridge
```

窗口禁止导航到非本地内容、禁止新窗口。

### 长期运行时自动更新调度

v0.8.0 不再只在启动后安排一次检查，而是在应用持续运行期间定期重新触发检查门禁。

实际联网频率没有变成每小时：现有 `runtime-manager.shouldCheck()` 仍保持 24 小时检查周期。小时级 timer 只是保证长时间不退出 Desktop 时也会再次经过该门禁。

### junction-aware smoke Profile 清理

旧 Runtime smoke Profile 超过 24 小时后可以安全清理。

规则：

- 所有删除必须位于 Runtime root / smoke root 边界内；
- 普通目录才递归；
- Windows junction / symlink 只解除链接本身；
- 不解析并递归进入链接指向的外部目录；
- 清理失败记录日志，不用危险递归作为 fallback。

### managed Runtime 自动 GC

自动保留：

```text
active
previous
pending
```

其余不再长期累积在：

```text
userData/dsh-runtime/versions/
```

### 正式 EXE SHA-256

Windows CI / Release 流程现在：

```text
已验证候选 EXE
  -> Get-FileHash SHA256
  -> DSH-Desktop-Setup-<version>.exe.sha256
  -> artifact
  -> publish 下载同一个已验证 artifact
  -> sha256sum -c
  -> Release asset + Release Notes
```

不要再把 GitHub Actions artifact ZIP digest 当作 Release EXE SHA-256。正式哈希不在交接文档中手工复制，避免文档漂移；以每个版本 Release Notes 和 `.exe.sha256` asset 为准。

## 3. 既有核心能力仍保持

### 桌面基础

- Electron Windows 原生窗口；
- 窗口位置/大小记忆；
- 托盘与快速发消息；
- 系统通知；
- 会话运行期间防休眠；
- `Ctrl+Alt+D` 全局显示/隐藏；
- 可选开机自启；
- xterm + node-pty 内置终端；
- 内置浏览器与 Sites；远程页面无 Node/Electron bridge。

### 零配置 Runtime

安装包内置经过验证的 DeepSeek Harness：

```text
@deepseek-ai/dsh@0.1.0-rc.7
```

如果没有显式远程/本地 DSH 服务，Desktop 自动使用安装包 bundled Runtime；普通用户不需要安装 Node.js、pnpm 或 DSH CLI。

### 官方 DSH Runtime 安全自动更新

```text
官方 npm metadata
  -> package / SemVer / official HTTPS tarball
  -> sha512 integrity
  -> OSV（不可评估 fail-closed）
  -> 禁用 lifecycle scripts
  -> managed runtime store
  -> isolated dsh web probe
  -> pending
  -> 下一次启动 real Profile preflight
       -> pass: activate
       -> fail: previous/bundled fallback
```

新 Runtime 不覆盖 `app.asar` 或安装目录，不为更新强制中断当前会话。

### 实时插件市场

目录：

```text
https://awesome-dsh-plugin.com/plugins.json
```

支持：

- 实时目录与缓存 fallback；
- 搜索 / 分类 / 排序 / 已安装过滤；
- npm 插件安装 / 更新 / 卸载；
- 非 npm / Git / URL / shell 条目只展示，不进入一键安装链。

安全预检包含 npm metadata、维护者、发布时间、deprecated、lifecycle scripts、integrity/shasum、依赖规模、OSV 与风险分级。

### Skin Center

固定随包离线交付：

```text
@linxin666/dsh-skins@0.1.18
```

首次启动从安装包本地 `link:` 注册到 Web Profile，不后台下载 `@latest`，不擅自覆盖用户显式安装的其他版本。

## 4. v0.8.0 PR #8 已验证范围

最终 PR head：

```text
af07884fec180eb3ab84ca505f383339636d39bb
```

Windows build #58：**success**。

已通过：

1. `npm ci`
2. 图标 materialize + 校验
3. JavaScript 静态语法检查
4. Runtime updater functional
5. Runtime updater red-blue
6. **Runtime maintenance junction + GC tests**
7. 官方 DSH stable 对账
8. 官方 Runtime 下载 / 激活快速探针
9. 插件市场 functional
10. 插件市场 red-blue
11. PowerShell E2E parse
12. Windows NSIS build
13. packaged application smoke
14. packaged plugin runtime + offline skins
15. 安装后的官方 Runtime 更新 E2E
16. 安装后的 live market + security E2E
17. **3 轮 clean install -> cold start -> restart -> uninstall**
18. 安装包 / Runtime 体积审计
19. installer SHA-256 generation
20. artifact upload

正式发布 tag 已建立，且 tag 与 `release: v0.8.0` 提交完全一致。发布流程只会在相同 Windows 全链路 build 成功后进入 publish；publish 会使用该 build 的已验证 artifact，而不是重新构建一份未测试安装包。

## 5. v0.8.0 新维护测试的关键断言

`scripts/test-runtime-maintenance.js` 会创建真实 Windows junction：

```text
Runtime root/smoke-home/old-probe/runtime-link
                             |
                             +--> Runtime root 外部目录/sentinel.txt
```

必须同时满足：

- `old-probe` 可以被清理；
- junction 目标外部 `sentinel.txt` 不得删除；
- active / previous / pending Runtime 不得 GC；
- stale Runtime 必须 GC；
- 任何 boundary 外删除请求直接拒绝。

## 6. 本次审查修复

### 更新通道显示语义

原 updater 实际语义只有 `DSH_RUNTIME_CHANNEL=latest` 会强制 Latest；stored latest 否则仍可生效。v0.8.0 UI 已与这个既有真实行为对齐，避免显示“stable 已强制覆盖”但后台并未如此执行。

### blocked 状态可视化

第一版 GUI 虽然拿到了 `blockedVersions`，但主卡片没有显示。最终版已增加 Blocked 数量 / 最近 blocked 版本摘要，并在存在 blocked Runtime 时显示 warning。

### settings.json 持久化覆盖审查

Runtime GUI 保存设置时会基于当前 `settings.json` 合并写入；主窗口已有的 `saveSettings()` 同样每次先重新读取磁盘再 merge patch，因此不会因为主窗口后续保存窗口大小、主题等配置而把 Runtime 通道/自动更新设置覆盖掉。

## 7. 安全边界

可以降低/阻断：

- 假 npm 包；
- 恶意版本号；
- 非官方 tarball / HTTP 降级 / URL 凭据；
- 缺失/错误 integrity；
- root lifecycle scripts；
- 已知直接 DSH OSV；
- 安全评估不可用；
- 无法真实启动 Web 的 Runtime；
- 与真实用户 Profile 不兼容的 Runtime；
- junction 清理越界。

不能声称证明：

- 普通第三方 JS 没有恶意逻辑；
- transitive dependency 绝对安全；
- 不存在 zero-day；
- npm 维护者账号未来不会被攻陷；
- 不存在延时/条件触发逻辑炸弹。

文档/UI 禁止写“100% 安全”“绝对安全”。

## 8. 开箱即用边界

- 安装：开箱即用；
- Runtime：开箱即用；
- 插件市场 / Skin Center / 终端：开箱即用；
- 第一次真正调用 DeepSeek：如果没有凭据，仍需用户提供自己的 DeepSeek API Key。

不要把用户 API Key 内置进公开安装包。

## 9. 后续优先级

### P0：小白级首次启动向导 — 未完成

目标仍是让完全不懂 API / Node / DSH 的用户快速完成第一次对话：欢迎页、API Key、本地保存说明、连通性检测、Runtime/模型/插件状态、一键进入。

### P1：Runtime GUI — v0.8.0 完成

无需重新规划，后续只修真实使用反馈。

### P2：供应链纵深防御 — 未完成

- dependency-tree OSV / npm audit；
- npm provenance / signature；
- tarball/source 静态扫描；
- 插件权限 / sandbox manifest；
- runtime behavior monitoring / quarantine。

### P3：维护性 — v0.8.0 本轮目标完成

- junction-aware smoke cleanup：完成；
- managed Runtime GC：完成；
- 正式 EXE SHA-256 release chain：完成，正式值随 Release Notes + `.exe.sha256` asset 发布；
- **Linux 发布链：按用户要求不做**；
- macOS 正式发布链仍属后续独立范围。

## 10. 关键文件

```text
bootstrap.js                     Desktop 启动 / Runtime 控制接管
runtime-manager.js               Runtime 下载/暂存/激活/回滚核心
runtime-update-core.js           Runtime metadata / SemVer / source 安全纯函数
runtime-control.js               v0.8.0 settings / scheduler / rollback / maintenance
runtime-settings-window.js       v0.8.0 本地 Runtime GUI 窗口与 IPC
runtime-settings-preload.js      Runtime GUI 最小 preload
runtime-settings.html/js         Runtime 控制面板 UI
scripts/test-runtime-maintenance.js junction/GC 安全测试
plugin-market.js                 实时市场目录
plugin-security.js               插件风险预检
plugin-market-ipc.js             市场 IPC
bundled-web-ui.js                Skin Center/Profile 对账
desktop-extensions.js            浏览器/Sites/插件桌面扩展
.github/workflows/windows-build.yml Windows CI + Release 门禁 + EXE SHA-256
CHANGELOG.md                     用户可读变更
DEVELOPMENT_LOG.md               工程开发日志
HANDOFF.md                       本文档
```

## 11. 接手前检查

```bash
npm ci
npm run check
npm run test:runtime-update
npm run test:runtime-update-security
npm run test:runtime-maintenance
npm run test:market
npm run test:market-security
npm run verify:official-dsh
```

涉及安装包、Runtime 或插件链的最终结论，必须以 Windows GitHub Actions 的真实打包 / 安装 E2E 为准，不能只看本地静态检查。

## 12. 发布流程

正常开发：

```text
feature branch
 -> PR
 -> Windows 全链路 CI
 -> 全部 success
 -> merge main
```

正式发布：

```text
main 上 release: v<version>
 -> Windows 再跑完整门禁
 -> build success
 -> publish 下载同一个已验证 artifact
 -> 校验 EXE .sha256
 -> 创建/更新 v<version> Release
```

禁止为了赶发布跳过 Runtime update E2E、maintenance junction/GC test、live market/security、三轮 clean-install E2E 或包审计。
