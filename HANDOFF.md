# DSH Desktop 交接文档

> 最后更新：2026-08-18  
> 当前正式版本：`v0.7.1`  
> 仓库：`guanyibei1314/dsh-desktop-plugin`

## 1. 当前状态

DSH Desktop 已达到 Windows x64 可下载安装、无需系统 Node.js/pnpm/DSH 的桌面交付形态。

当前 `main` 已同步到 v0.7.1 文档状态；`v0.7.1` tag 已存在。README 中的正式安装包入口为：

```text
https://github.com/guanyibei1314/dsh-desktop-plugin/releases/download/v0.7.1/DSH-Desktop-Setup-0.7.1.exe
```

Release 页面：

```text
https://github.com/guanyibei1314/dsh-desktop-plugin/releases/tag/v0.7.1
```

### 关键提交

- v0.7.1 图标功能合并：`5eb8cb0ce4da511317ee274ab39874f62c17a136`
- v0.7.1 正式发布触发：`b308dc0d02c466df21aa613e951dfb38bd4b122a`
- v0.7.1 README 同步：`436952b02e27a163d1b4b91691b315b79652998d`
- v0.7.0 Runtime 自动更新主合并：`ef8824c2c392d0271fe8dbdb8b135a4d9f515c00`
- v0.7.0 发布触发：`1993acfa5db1b0379d621d5a70cd5b5cc7b929ee`

### 关键 PR

- PR #6：v0.7.0 managed official DSH runtime updates
- PR #7：v0.7.1 desktop app icon branding

## 2. 当前核心能力

### 桌面端基础

- Electron 原生 Windows 桌面窗口
- 自动记忆窗口位置/大小
- 托盘、快速发消息、系统通知
- 会话运行期间防休眠
- `Ctrl+Alt+D` 全局显示/隐藏
- 可选开机自启
- 内置终端（xterm + node-pty）
- 内置浏览器与 Sites；远程页面无 Node/Electron bridge

### 零配置 Runtime

安装包内置 DeepSeek Harness。若本机 3080 没有可用 DSH 服务，Desktop 自动启动安装包内 Runtime；用户不需要安装 Node.js、pnpm 或 DSH CLI。

当前安装包兜底 Runtime：

```text
@deepseek-ai/dsh@0.1.0-rc.7
```

### 官方 DSH Runtime 自动更新

v0.7.0 起，DSH Runtime 与整个桌面安装包解耦。

默认行为：

```text
每天检查官方 npm stable/latest
      ↓
验证包名 / SemVer / 官方 HTTPS tarball
      ↓
要求 sha512 integrity
      ↓
OSV 检查（不可评估则 fail-closed）
      ↓
禁用 lifecycle scripts
      ↓
安装到 userData/dsh-runtime/versions/<version>
      ↓
隔离 DSH_HOME 启动真实 dsh web
      ↓
暂存 pending
      ↓
下次启动使用真实用户 Profile 做 preflight
      ├─ 通过：激活
      └─ 失败：保留上一版或安装包内 Runtime
```

新 Runtime 不覆盖 `app.asar` 或安装目录，也不会为了更新强制中断当前会话。

主要文件：

- `runtime-update-core.js`
- `runtime-manager.js`
- `bootstrap.js`
- `scripts/test-runtime-update.js`
- `scripts/test-runtime-update-red-blue.js`
- `scripts/verify-official-dsh.js`

### 实时插件市场

市场目录：

```text
https://awesome-dsh-plugin.com/plugins.json
```

能力：

- 实时目录，网络失败回退缓存
- 搜索 / 分类 / 排序 / 已安装过滤
- npm 插件一键安装、更新、卸载
- 非 npm/Git/URL/shell 类条目只展示，不进入一键安装链

安全预检：

- npm 元数据
- lifecycle scripts
- 维护者、发布时间、deprecated
- integrity/shasum
- 依赖规模
- OSV
- 风险评分与 high/critical 阻断策略

主要文件：

- `plugin-market.js`
- `plugin-security.js`
- `plugin-market-ipc.js`
- `plugin-manager.js`

### 内置 Skin Center

固定：

```text
@linxin666/dsh-skins@0.1.18
```

首次启动使用安装包本地路径注册到 Web Profile，强制离线，不后台下载 `@latest`；尊重用户已有显式安装版本。

### v0.7.1 正式桌面图标

采用用户确认的第一版蓝青科技风 DSH 图标。

为了避免图片二进制在仓库/构建传输中损坏，正式流程不是直接信任 PNG，而是：

```text
assets/icon-source.b64
        ↓
scripts/materialize-app-icon.js
        ↓
PNG signature + 256×256 + byte length + SHA-256
        ↓
assets/icon.png
        ↓
Electron / electron-builder / NSIS
```

该图标用于主应用/Windows 安装包、主窗口、闪屏、发送消息窗口、终端窗口。

托盘继续使用独立轻量 `assets/tray.png`，避免复杂图案在 16–24 px 下失去辨识度。

## 3. v0.7.1 测试状态

PR #7 的 Windows build #48 完整通过。

已通过：

1. `npm ci` 锁文件安装
2. 图标 materialize + SHA/PNG/尺寸校验
3. JavaScript 静态语法检查
4. Runtime updater 功能测试
5. Runtime updater 红蓝安全测试
6. 官方 DSH stable 对账
7. 官方 Runtime 下载 + 激活快速探针
8. 插件市场功能测试
9. 插件市场红蓝安全测试
10. PowerShell E2E 脚本检查
11. Windows NSIS 正式打包
12. packaged application smoke test
13. packaged plugin runtime + offline skins 验证
14. 安装后的官方 DSH Runtime 更新全链路
15. 安装后的实时插件市场 + 安全预检
16. 三轮 clean install → cold start → restart → uninstall
17. 安装包/runtime 体积审计
18. artifact 上传

PR #7 候选 artifact：

```text
artifact id: 9318361023
artifact name: dsh-desktop-windows
artifact digest: sha256:2d895c3177379e27b23deb3b6b71e7530544fd2a7fac738b977f9a98adebccc7
```

注意：这是 GitHub Actions artifact ZIP 的 digest，不应当冒充最终 Release EXE 的 SHA-256。

## 4. 曾发现并修复的重要问题

### Runtime smoke 清理跨 junction 损坏 managed runtime

v0.7.0 初次真实安装 Runtime E2E 中发现：隔离 smoke 完成后递归删除临时 DSH_HOME，可能沿 Windows junction/link 穿透并伤到 managed runtime。

修复：保留该隔离 smoke Profile 的少量元数据，不再进行可能跨 junction 的递归清理；激活失败也会记录具体 blocked reason。

### 安装包体积基线错误

早期 v0.7.0 CI 使用了错误旧基线 `126,499,002` bytes，导致候选包被 3 MiB 增长门禁阻断。

核对公开 v0.6.0 安装包后，正确基线为：

```text
127,385,289 bytes
```

修正基线后仍保留原有严格预算，没有放宽 125 MiB 绝对上限 / 3 MiB 单版本增长上限。

### 图标二进制传输风险

v0.7.1 接入图标时发现直接通过 GitHub connector 写二进制 blob 不适合做可审计的稳定交付，因此改成 base64 源 + 构建时 materialize + SHA-256 fail-closed 校验。

## 5. 当前安全边界

Runtime/插件预检能显著降低已知供应链风险，但不能声称“绝对安全”。

当前可以拦截/降低：

- 假 npm 包名
- 非法/注入型版本号
- 非官方根 tarball / HTTP 降级 / URL 凭据
- 缺失/弱 root integrity
- root lifecycle scripts
- 已知直接 DSH OSV 漏洞
- 安全评估不可用
- 无法真实启动 DSH Web 的候选 Runtime
- 与真实用户 Profile 不兼容的 Runtime

当前不能完整证明：

- 普通 JS 中没有恶意逻辑
- transitive dependency 绝对安全
- 不存在 zero-day
- npm 维护者账号未来不会被攻陷
- 不存在延时/条件触发逻辑炸弹

不要在文档或 UI 中使用“100% 安全/绝对安全”的表述。

## 6. 开箱即用边界

安装和 Runtime 已做到普通软件意义上的开箱即用：下载安装后无需 Node/npm/DSH 命令行。

但第一次真正调用 DeepSeek 时，如果用户还没有凭据，官方 Harness 仍要求用户在首次引导中填一次 DeepSeek API Key。

因此当前状态是：

- 安装：开箱即用
- Runtime：开箱即用
- 插件市场/Skin Center/终端：开箱即用
- AI 第一次调用：需要用户提供自己的 API Key

## 7. 下一阶段建议（按优先级）

### P0：小白级首次启动向导

目标：让完全不懂 API/Node/DSH 的用户 30 秒内完成首次对话。

建议：

1. 欢迎页
2. DeepSeek API Key 输入（说明仅保存在本机）
3. 自动连通性检测
4. Runtime / 模型 / 插件系统状态检查
5. 一键进入主界面

不要把用户 API Key 内置进公开安装包。

### P1：Runtime 更新可视化 UI

目前 `stable/latest`、自动更新设置已有内部 settings/env 支持，但没有确认存在独立的完整 GUI 面板。

建议新增：

- 当前 Runtime 版本
- 安装包 fallback 版本
- 更新通道 stable/latest
- 自动更新开关
- 最近检查时间/结果
- pending/blocked/previous 状态
- 手动检查更新
- 手动回滚

### P2：供应链安全继续加固

- dependency-tree OSV / npm audit
- npm provenance/signature 验证
- tarball/source 静态扫描
- 更完整的插件权限/沙箱 manifest
- 运行时行为监测和 quarantine

### P3：维护性

- junction-aware 的旧 smoke Profile 清理
- 自动清理长期未使用 managed Runtime 版本（保留 active/previous/pending）
- 补充正式 Release EXE SHA-256 到 Release notes
- 后续再考虑 macOS/Linux 正式发布链

## 8. 发布流程（不要绕过）

正常开发：

```text
feature branch
  ↓
PR
  ↓
Windows 全链路 CI
  ↓
全部 success
  ↓
merge main
```

正式发布：

```text
main 上创建 message 以 `release:` 开头的发布提交
  ↓
Windows build 再跑完整门禁
  ↓
build success
  ↓
publish job 下载“已验证 artifact”，不重新 build
  ↓
创建/更新 v<package.version> Release
```

不要为了赶发布跳过：Runtime update E2E、live market/security、三轮 clean-install E2E、包审计。

## 9. 常用文件导航

```text
bootstrap.js                  启动扩展层 / Runtime Manager 接管
main.js                       主窗口、DSH host、菜单、托盘、终端
runtime-manager.js            managed Runtime 安装/暂存/激活/回滚
runtime-update-core.js        Runtime 元数据与版本安全校验纯函数
plugin-market.js              实时市场目录
plugin-security.js            插件安全评估
plugin-manager.js             插件管理 UI
bundled-web-ui.js             内置 Skin Center/Profile 对账
desktop-extensions.js         浏览器/Sites/插件桌面扩展
assets/icon-source.b64        v0.7.1 正式图标受控源
scripts/materialize-app-icon.js 图标还原与 fail-closed 校验
.github/workflows/windows-build.yml Windows CI + Release 门禁
CHANGELOG.md                  用户可读版本变更
DEVELOPMENT_LOG.md            工程开发日志
HANDOFF.md                    本文档
```

## 10. 继续开发前检查

每次接手先做：

```bash
npm ci
npm run check
npm run test:runtime-update
npm run test:runtime-update-security
npm run test:market
npm run test:market-security
npm run verify:official-dsh
```

涉及安装包或 Runtime/插件链时，最终结论必须以 Windows GitHub Actions 的真实打包/安装 E2E 为准，而不是只以本地静态测试为准。
