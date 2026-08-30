# Changelog

## 0.10.0 — 2026-08-30

- 新增 **Standard / Creator 双模式**：同一个 Windows 安装包、同一个经过验证的 DSH Runtime，可在桌面菜单中切换并通过干净 relaunch 重建 Shell，避免两套 UI/侧栏状态互相污染。
- Standard 模式完整保留原有 DSH 会话、Agent、Runtime 更新/回滚、插件市场、Skin Center、Terminal、Browser、Sites、托盘和通知。
- 新增 Windows-first **DSH Creator** 工作台：今日推进、内容、灵感、运营、复盘、设置与备份六个核心入口，右侧继续使用同一套 DSH 会话。
- Creator 内容坚持 local-first：用户选择真实本地内容目录；每条内容是普通文件夹；`topic.md` / `script.md` 和媒体文件是唯一正文事实源，运营状态不复制第二份正文。
- Creator 支持真实项目创建、`topic.md` / `script.md` 编辑、内容资产阶段识别、灵感转内容、统一档期、目标追踪、人工复盘和 Creator 状态 JSON 导出。
- Creator 状态独立保存在 Desktop `userData/creator/`；Standard / Creator 切换不会删除内容目录或运营数据。
- Creator 文件安全边界：Root realpath、内容 ID 防 traversal、目录/编辑文件拒绝 symlink、仅允许编辑 `topic.md` / `script.md`、文本 2 MiB 上限、临时文件原子写入。
- Creator Renderer 继续使用 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、独立 session partition、权限默认拒绝和窄化 contextBridge IPC。
- CI 新增 Dual Mode 回归测试以及 **packaged Standard smoke + packaged Creator smoke**，两种模式都必须在正式 Windows 安装包中可启动。
- 修复 v0.9.2 正式 Release 的实际阻塞：Git for Windows latest gate 不再依赖共享 Runner 的匿名 `api.github.com` Releases 请求，改用 Git for Windows 官方 latest-tag endpoint + 确定性 immutable Release URL；实际二进制仍由后续阶段下载并验证 pinned SHA-256 + Authenticode。
- Node.js 官方 LTS 于 2026-08-26 更新，随包完整 Node.js 从 `24.19.0` 升级至 **`24.20.0`**；Windows x64 MSI SHA-256 固定为 `28b69132c35ccc033bf8f2a67cd10c9d75ef5822593363309da448f2afff2d8a`，并继续经过官方 SHASUMS + Authenticode 验证。
- DSH Desktop 社区 Release 路径允许未签名 Desktop installer；带有损坏/无效签名的产物仍被验证脚本拒绝。随包 Node.js / Git 官方安装器的签名与 SHA-256 硬门禁不变。
- v0.9.2 没有成功生成正式 GitHub Release；v0.10.0 在其安全加固代码基础上继续开发并作为下一正式发行版本。
- Creator 产品方向参考 DSH 社区 MIT 项目（包括 `Jackywxsz/DSH-Creator`），但 DSH Desktop 使用自己的 Windows Creator Shell，不复用 Jacky Creator 名称、Logo、角色/IP 或单独受保护的品牌视觉资产。

## 0.9.2 — 2026-08-22 (release candidate; GitHub Release 未完成)

- 安全加固版本：修复提权安装器从不可信 PATH 探测/执行 Node/Git 的边界，改为仅识别 machine-owned Program Files 路径，并加入攻击复现回归。
- 插件市场 OSV 不可用时改为 fail-closed；市场一键安装/升级绑定 **exact version + official npm Registry + exact tarball + SHA-512 integrity**，安装后再次核对 integrity，失败自动回滚。
- 移除默认信任固定 `127.0.0.1:3080` 的行为；DSH Desktop 默认拥有自己启动的随机 loopback Runtime，只有用户显式配置外部 DSH URL 才复用外部服务。
- 主 Harness Electron Session 改为权限默认拒绝，并把导航/重定向限制在当前可信 Harness origin。
- npm/OSV/Runtime/RPC 等远端 JSON 读取统一加入 streaming byte limits，在分配完整响应前执行硬上限检查。
- Runtime 自动更新除官方 npm Registry、版本、tarball 和 SHA-512 外，强制验证 **exact `@deepseek-ai/dsh@version:integrity` npm Registry ECDSA 签名 + npm 官方 signing keys + DeepSeek 官方 immutable GitHub Release + exact tag `apps/cli/package.json` identity**；如果上游发布 provenance metadata 则记录该状态，但不再用会扫描整棵依赖树的 `npm audit signatures` 作为唯一放行路径。所有 publisher identity 校验完成前禁止执行候选 Runtime JavaScript。
- 修复 Windows/Electron 以 Node 模式运行 pnpm 时可能在 `pnpm --ignore-scripts` 已完成落盘后返回 `0x80000003` 的清理退出码；仅当输出明确包含 pnpm `Done` 且退出码精确匹配时才允许继续进入严格 package/version/repository、lock integrity、ECDSA 与 immutable GitHub 后置校验，任一校验失败仍 fail-closed。
- GitHub Actions 全部固定到 40 位 immutable commit SHA，新增 workflow 回归门禁、CODEOWNERS 与 Dependabot；正式 Release commit 必须关联已合并到 `main` 的 PR。
- v0.9.2 曾新增正式 Windows Authenticode 强制门禁，但仓库没有发布证书，正式 Release 因此未生成；后续社区发行策略改为允许 unsigned Desktop，同时保留 SHA-256 与无效签名拒绝。
- Desktop 版本升级到 **0.9.2**；开发期间 DeepSeek Harness 官方 stable 再次更新，全部直接 `@deepseek-ai/dsh-*` 依赖统一对齐到 **`0.1.1-rc.2`**。
- v0.9.1 的完整 Node.js + Git for Windows、Machine PATH、Runtime GUI、junction-aware GC、Skin Center、插件市场与三轮真实安装 E2E 继续保留。

## 0.9.1 — 2026-08-21

- Windows 安装包改为 **per-machine**，完整官方 Node.js 与 Git for Windows 在缺失时自动安装到系统环境。
- 内嵌官方完整 **Node.js 24.19.0 LTS x64 MSI**，不是 portable；npm 随官方 MSI 安装。
- 内嵌官方完整 **Git for Windows 2.55.0(5) x64 installer**，不是 MinGit/PortableGit；完整 Git Bash、Git GUI、Git LFS 已进入安装 E2E。
- Node/Git 使用官方安装器持久化到 **Machine PATH**；安装完成后 DSH Setup 重新读取 HKLM/HKCU PATH、刷新当前进程并广播 Windows Environment 变更，避免首次启动仍拿旧 PATH。
- 普通安装检测现有 `node` / `git`；已有可用安装默认保留，不无条件覆盖用户开发环境。
- DSH Desktop 卸载不删除独立 Node/Git；CI 已验证卸载 DSH 后 Node、Git、Git Bash 仍正常存在。
- 新增 toolchain manifest/source/hash 检查和 live latest 门禁：Node pinned 必须等于官方 latest LTS，Git pinned 必须等于 Git for Windows latest tag。
- Node/Git 安装器在嵌入前校验 SHA-256、Authenticode 和预期签名者；任一异常 fail-closed。
- 用户安装阶段不再联网下载 Node/Git；经过校验的完整官方安装器已随 NSIS payload 交付，可离线安装。
- DeepSeek Harness 官方 stable 在开发期间升级，bundled 以及直接 `@deepseek-ai/dsh-*` 家族统一从 `0.1.0-rc.7` 对齐至 **`0.1.1-rc.1`**。
- `package-lock.json` 受控重建并同步项目版本 `0.9.1`；重建使用 `--package-lock-only --ignore-scripts`。
- 修复首版 NSIS PATH refresh 误用不存在的 `ReadRegExpandStr`；最终使用 `SetRegView 64 + ReadRegStr + ExpandEnvStrings`。
- Windows build #73 全绿：Node/Git official latest、SHA/signature、Runtime/插件红蓝、junction/GC、NSIS、packaged smoke、完整 Node/npm/Git/Bash/GUI/LFS/Machine PATH、installed Runtime、live market/security、三轮 clean-install/restart/uninstall、体积审计、EXE SHA-256 和 artifact upload 全部通过。
- PR #73 候选安装包：`221,685,265 bytes = 211.42 MiB`；v0.9.x 继续保留 **230 MiB** 硬体积上限。
- PR #12 合并：`7332654a3d25e36791043c6e07970e80f75bb364`；正式 release trigger：`6d8f781c25bd425097f6207c6ce3e35e39019a22`。
- 正式 `v0.9.1` tag 已生成并验证与 release trigger commit 完全一致。
- 正式 EXE SHA-256 仍以 GitHub Release Notes 和 `DSH-Desktop-Setup-0.9.1.exe.sha256` asset 为权威，不使用 Actions artifact ZIP digest 冒充。

## 0.9.0 — 2026-08-21

- 首次引入完整 Node.js + 完整 Git for Windows 随 DSH Desktop 安装的方向。
- 该版本随后被 v0.9.1 取代：v0.9.1 更新 Git for Windows 到 2.55.0(5)，把 Windows 安装/Machine PATH 约束和完整 Git Bash/GUI/LFS E2E 做成硬门禁，并同步官方最新 DeepSeek Harness Runtime。
- 新用户应使用 v0.9.1，不建议继续以 v0.9.0 作为发布基线。

## 0.8.0 — 2026-08-18

- 新增独立 **DSH Runtime 更新 GUI**，可查看 current / bundled / latest / previous / pending / blocked、最近检查和激活状态。
- 新增 Stable / Latest、自动更新、手动检查、手动回滚、重启和 Runtime 目录入口。
- Runtime 设置窗口保持 sandbox + contextIsolation + 最小 IPC，DSH Web 不获得 Runtime 管理权限。
- 自动更新从启动后单次调度改成应用持续运行时重新触发门禁；实际网络检查仍由 24h `shouldCheck` 控制。
- 新增 junction-aware smoke Profile 清理，junction/symlink 只解除链接，不递归穿透外部目标。
- 新增 managed Runtime GC，仅保留 active / previous / pending。
- Windows Release 新增最终 EXE `.sha256`，publish 使用同一个已验证 artifact 并再次执行 `sha256sum -c`。
- PR #8 Windows build #58 通过 Runtime/插件红蓝、junction/GC、NSIS、installed Runtime、live market、安全门禁和三轮安装回归。

## 0.7.1 — 2026-08-18

- 新增正式 DSH Desktop 蓝青科技风桌面图标，并统一用于应用、安装包、窗口和 splash。
- 构建前校验受控图标源、PNG signature、尺寸、长度和 SHA-256。

## 0.7.0 — 2026-08-18

- bundled DeepSeek Harness 更新到当时官方 `0.1.0-rc.7`。
- 新增 managed official DSH Runtime 自动更新、隔离 `dsh web` probe、真实 Profile preflight、pending/activate/rollback 链。
- 新增 Runtime updater functional/red-blue tests 和 installed Runtime E2E。

## 0.6.0 — 2026-08-18

- 新增实时插件市场、搜索/分类/排序和 npm 插件安装/更新/卸载。
- 新增插件 metadata、lifecycle、integrity、OSV 和风险分级安全预检。
- 新增插件市场 functional/security/red-blue tests。

## 0.5.x — 2026-08-17/18

- 内置 `@linxin666/dsh-skins@0.1.18` Skin Center，并以安装包本地 `link:` 离线注册到 Web Profile。

## 0.4.0 — 2026-08-16

- 建立内置 pnpm 插件环境、浏览器、Sites、IPC 权限隔离、packaged Runtime closure、node-pty/xterm 和安装包体积审计基线。
