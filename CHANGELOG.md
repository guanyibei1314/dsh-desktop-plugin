# Changelog

## 0.7.1 — 2026-08-18

- 新增正式 DSH Desktop 蓝青科技风桌面图标。
- 图标统一用于 Windows 应用/安装包、主窗口、启动闪屏、发送消息窗口与内置终端窗口。
- 托盘继续保留独立轻量小尺寸图标，避免复杂图案在 16–24 px 下失去辨识度。
- 新增受控图标源 `assets/icon-source.b64` 与 `scripts/materialize-app-icon.js`。
- 构建前强制校验 PNG signature、256×256 尺寸、字节长度和 SHA-256；任何不一致都会 fail-closed。
- `start` / `smoke` / `check` / `dist` 均使用同一图标 materialize/校验链，防止开发环境与正式包资源漂移。
- PR #7 Windows build #48 通过 Runtime/插件市场红蓝、正式 NSIS、packaged smoke、安装后 Runtime 更新、实时插件市场、3 轮 clean-install/restart/uninstall 和体积审计。

## 0.7.0 — 2026-08-18

- bundled DeepSeek Harness 更新至官方 `@deepseek-ai/dsh@0.1.0-rc.7`。
- 新增 managed DSH Runtime 自动更新系统：默认 Stable 通道每天检查官方 npm `latest`。
- Runtime 更新不覆盖安装目录/app.asar；安装到用户私有 runtime store，当前会话不热切换。
- 更新候选必须通过官方包名/版本/tarball 来源、sha512 integrity、OSV、lifecycle script 等检查；无法完成安全评估时 fail-closed。
- 新 Runtime 先在隔离 DSH_HOME 启动真实 `dsh web`，通过后暂存；下次启动再使用真实用户 Profile 做兼容性 preflight，通过才激活。
- 激活失败保留 previous/bundled Runtime，不破坏当前 Profile。
- 主 Harness、插件管理、bundled Skin Center reconciliation 统一走当前已验证 Runtime，避免 CLI/服务版本漂移。
- 新增 Runtime updater 功能测试和红蓝安全测试。
- 修复 Windows junction 清理可能穿透 link、破坏 managed Runtime 的问题。
- 发布门禁继续保留正式安装后 Runtime 更新 E2E、live market/security 与三轮 clean-install/restart/uninstall。

## 0.6.0 — 2026-08-18

- 新增实时 DSH 插件市场，连接社区目录 `https://awesome-dsh-plugin.com/plugins.json`。
- 市场支持搜索、分类、排序、已安装过滤、npm 插件一键安装/升级/卸载。
- 非 npm/Git/URL/shell 类型条目仅展示，不进入一键安装链。
- 新增插件安装前安全预检：npm 元数据、维护者、发布时间、deprecated、lifecycle scripts、dependency count、integrity、OSV。
- 新增风险评分：low / medium / high / critical；critical 阻断、high 二次确认、unknown/无法评估默认阻断。
- Registry 使用固定 HTTPS URL、拒绝手动重定向、限制响应大小、屏蔽 prototype pollution 危险键。
- renderer 不注入远程 HTML，IPC 验证调用者来源。
- 新增插件市场功能测试、security tests 与 red-blue tests。

## 0.5.1 — 2026-08-17

- 修复内置 Skin Center 在 Web Profile 中的持久化/注册问题。
- 内置 `@linxin666/dsh-skins@0.1.18`，从安装包物理目录直接注册到 Web Profile。
- 保持本地 `link:` + pnpm offline，不在运行时下载皮肤 `@latest`。
- 用户已有显式不同版本时不擅自替换。

公开 Windows 安装包：

```text
DSH-Desktop-Setup-0.5.1.exe
127,377,535 bytes
SHA256 de40af4042c20cff8942e505521579d99a2aeb2d5969aa3a63f05e42f69e5d86
```

## 0.5.0 — 2026-08-17

- 将 Skin Center 与精选皮肤资产纳入安装包，用户无需另外安装皮肤插件。
- 新增 bundled Web UI/Profile reconciliation 与诊断日志。
- 皮肤初始化失败不阻断 DSH Desktop 主程序启动。
- 保留 SSH、Remote Web、任务执行、图像理解、梁神模式等高权限/大体积能力为可选插件，不默认扩大攻击面。

## 0.4.0 — 2026-08-16

- 新增内置插件安装、升级、卸载环境：内置 pnpm 11.17.0，使用 DSH `web` Profile 对账语义，不依赖系统 Node.js / pnpm。
- 新增安全隔离的内置浏览器：基于 Electron `BaseWindow + WebContentsView`，远程网页无 Node / Electron bridge，使用独立持久化会话。
- 新增 Sites：将常用 Web 工具保存为独立桌面工作区，每个 Site 使用独立持久化浏览器分区。
- 保留原有 DeepSeek Harness 主界面、会话、托盘、内置 xterm / node-pty 终端等功能。
- 插件管理 IPC、浏览器工具栏 IPC、Sites IPC 分别隔离并校验发送者；插件输入限制为 npm Registry 包名与受限版本格式。
- Windows x64 包裁除不参与当前运行时的 pnpm artifacts、ARM64 PTY 预编译与 node-pty 构建素材。
- 新增 packaged runtime closure、x64 PTY closure、打包后 EXE smoke、打包后 pnpm / DSH plugin E2E、安装包体积审计。
- GitHub Release 发布改为从 `package.json` 自动读取版本，不再覆盖旧版本标签。

### PR 验证基线

PR #2 最终 Windows 构建：`126,499,001 bytes = 120.64 MiB`。相对 v0.3.0 的 `125,949,889 bytes ≈ 120.12 MiB`，新增上述能力后仅增加约 `0.52 MiB`。
