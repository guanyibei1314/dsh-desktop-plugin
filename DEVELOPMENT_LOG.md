# DSH Desktop 开发日志

> 工程日志用于记录为什么做、发现了什么、如何修、测试是否通过。用户可读版本变化请看 `CHANGELOG.md`；接手说明请看 `HANDOFF.md`。

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
