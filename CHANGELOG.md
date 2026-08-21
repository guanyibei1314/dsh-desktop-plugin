# Changelog

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
