# DSH Desktop 交接文档

> 最后更新：2026-08-21  
> 目标正式版本：`v0.9.1`  
> 正式发布平台：Windows x64  
> 仓库：`guanyibei1314/dsh-desktop-plugin`

## 1. 当前结论

v0.9.1 的产品代码已完成、PR #12 已通过完整 Windows 发布门禁并合并到 `main`。

```text
PR #12 final head
229f2d31bf6c3c215654ce8e547cd13433fdd98d

PR #12 merge
7332654a3d25e36791043c6e07970e80f75bb364

formal release trigger
6d8f781c25bd425097f6207c6ce3e35e39019a22
message: release: v0.9.1
```

正式 Release 仍必须以 `v0.9.1` tag、Release 页面和 Release `.exe.sha256` asset 实际存在为完成条件。不要仅因 `release:` commit 已进入 main 就声称发布成功。

## 2. v0.9.1 核心变化

### 完整 Node.js 系统安装

安装包内嵌：

```text
Node.js 24.19.0 LTS x64 MSI
```

不是 portable 版本。

安装器行为：

- 已有可用 Node：默认保留；
- Node 缺失：调用官方 MSI 完整安装；
- npm 随官方 Node 安装；
- 安装结果必须进入 Windows Machine PATH；
- CI 会用 fresh shell 真实验证 `node` 和 `npm`。

### 完整 Git for Windows 系统安装

安装包内嵌：

```text
Git for Windows 2.55.0(5) x64 full installer
```

不是 MinGit，也不是 PortableGit。

完整安装 E2E 明确验证：

```text
git.exe
Git Bash
Git GUI
Git LFS
Machine PATH
```

Git PATH 使用官方安装器 `PathOption=Cmd`，避免把 Unix `find` / `sort` 等工具放进 Windows PATH 并遮蔽系统同名命令。

### 不破坏已有开发环境

普通安装不会无条件覆盖机器上已经可用的 Node/Git。

CI 的 `DSH_TOOLCHAIN_FORCE_INSTALL=1` 只用于强制验证“随包完整安装链”本身，不是普通用户默认行为。

DSH Desktop 卸载后：

- Node.js 保留；
- npm 保留；
- Git 保留；
- Git Bash 保留；
- Node/Git 自己维护的 Machine PATH 保留。

### 安装完成后立即刷新 PATH

官方 Node/Git 安装器持久化 PATH 后，DSH Setup 会重新读取：

```text
HKLM Machine PATH
HKCU User PATH
```

然后更新当前安装器进程环境，并广播 `WM_SETTINGCHANGE / Environment`。

目的：用户从安装完成页立即启动 DSH Desktop 时，第一次打开内置终端就能解析刚安装的 `node/npm/git`，无需注销或重启电脑。

## 3. 工具链供应链门禁

构建时不只下载固定 URL，还实时核对当前上游：

```text
Node pinned == official latest LTS
Git pinned == Git for Windows latest tag
```

随后校验：

- 固定官方 HTTPS 来源；
- SHA-256；
- Authenticode 有效；
- 预期签名者；
- 安装器文件名/版本一致。

v0.9.1 当前固定：

```text
Node 24.19.0
SHA256 f0f66c2a80c08a30a5ab5179ee9ea9e45f9b46289436a8cc87ff833b852db351
Signer OpenJS Foundation

Git for Windows 2.55.0(5)
SHA256 d065a4e23c3d9a6b5073d609b5be0830227ec3ca053c083ba385061ddfaf94c6
Signer Johannes Schindelin
```

用户机器安装时不需要临时下载 Node/Git；官方安装器已经在构建阶段校验后内嵌，因此离线安装仍可完成。

## 4. DeepSeek Harness Runtime

v0.9.1 发布开发期间，原官方 stable 门禁发现 DeepSeek Harness 已从 rc.7 更新。

当前 bundled / verified：

```text
@deepseek-ai/dsh@0.1.1-rc.1
```

直接 `@deepseek-ai/dsh-*` 家族统一对齐到 `0.1.1-rc.1`，避免根包与子包混装。

已有 v0.8.0 Runtime 能力全部保留：

- bundled fallback；
- managed Runtime store；
- Stable / Latest GUI；
- 自动检查；
- 手动检查/回滚；
- official npm source + sha512 integrity；
- OSV fail-closed；
- lifecycle scripts disabled；
- isolated real `dsh web` probe；
- next-boot real Profile preflight；
- previous/bundled rollback；
- junction-aware smoke cleanup；
- active/previous/pending protected GC。

## 5. v0.9.1 发布前故障记录

这些失败是门禁正常发挥作用，不得从日志删除。

### build #68

Node/Git official check 已通过，但 `verify:official-dsh` 发现官方 DSH stable 更新，阻止旧 rc.7 发布。

修复：整个直接 DSH 家族升级 `0.1.1-rc.1`；lock 使用 `--package-lock-only --ignore-scripts` 受控重建。

### build #72

NSIS 编译失败：第一版 PATH refresh 误用了不存在的 `ReadRegExpandStr`。

修复：改成受支持的 `SetRegView 64 + ReadRegStr + ExpandEnvStrings`。没有绕过 PATH 功能，也没有忽略错误。

### build #73

最终 PR 候选：**success**。

## 6. build #73 全量验证

已通过：

1. `npm ci`，0 known vulnerabilities
2. Node/Git manifest source/hash checks
3. Node/Git official latest checks
4. JS static checks
5. Runtime updater functional
6. Runtime updater red-blue
7. Runtime junction + GC safety
8. official DSH stable verify (`0.1.1-rc.1`)
9. source Runtime real web activation probe
10. plugin marketplace functional
11. plugin marketplace red-blue
12. PowerShell E2E parse
13. Node/Git official download + SHA-256 + Authenticode
14. NSIS per-machine build
15. packaged app smoke
16. packaged plugin runtime + offline skins
17. full Node/npm/Git/Bash/GUI/LFS/Machine PATH installed E2E
18. installed official Runtime updater E2E
19. installed live marketplace + security preflight
20. 3 × clean install -> cold start -> real desktop window -> restart -> uninstall
21. installer/runtime audit
22. EXE SHA-256 generation
23. artifact upload

工具链实测：

```text
Node v24.19.0
npm 11.17.0
Git 2.55.0.windows.5
Git LFS 3.7.1
```

DSH 卸载后 Node/Git 再次检测仍可用。

## 7. 候选安装包 / 正式哈希规则

PR #73 候选：

```text
DSH-Desktop-Setup-0.9.1.exe
221,685,265 bytes
211.42 MiB
SHA256 daa3d15781a4b7a782e79da9e0f573efaa8608614dbc6fcfd09a1fbd22378b54
```

Actions artifact：

```text
ID 9443853094
ZIP digest sha256:c747d894777a00d92207da0d46fc7c43a9750619569e6c958195e9ebc0c78971
```

注意：Actions artifact ZIP digest **不是** EXE SHA-256。

正式 Release 会由 main 的全门禁 build 重新产生自己的已验证 artifact，因此正式 EXE 哈希只认：

```text
v0.9.1 Release Notes
DSH-Desktop-Setup-0.9.1.exe.sha256 asset
```

## 8. 体积策略

v0.9.x 因产品范围明确加入完整官方 Node/Git，旧 125 MiB 上限不再适用，但没有取消体积门禁。

当前：

```text
hard cap: 230 MiB
baseline: 130,173,608 bytes
max growth vs baseline: 110 MiB
```

#73 实际 211.42 MiB，距离硬上限仍有余量。

## 9. 正式发布流程

```text
feature branch
 -> PR
 -> Windows full gates
 -> merge main
 -> empty commit `release: vX.Y.Z`
 -> main 再跑同一全门禁
 -> upload EXE/.sha256/blockmap/latest.yml artifact
 -> publish 下载同一已验证 artifact
 -> `sha256sum -c`
 -> `gh release create/edit vX.Y.Z`
```

publish 不重新 build 另一份 EXE。

## 10. 当前高权限 / 安全边界

DSH Desktop 仍使用分离 bridge：

```text
DSH Web                -> 无通用桌面高权限 bridge
Runtime settings       -> 本地窗口 + 最小 Runtime IPC
Terminal               -> PTY bridge only
Plugin manager         -> 受限 plugin IPC
Browser/Sites content  -> remote content 无 Node/Electron bridge
```

自动检查能降低已知供应链风险，但禁止写“100% 安全”“绝对安全”。仍不能证明不存在 zero-day、恶意普通 JS、未来维护者账号被攻陷或所有 transitive dependency 风险。

## 11. 关键文件

```text
build/installer.nsh                       v0.9.1 Node/Git 安装 + PATH refresh
scripts/toolchain-manifest.json           pinned official toolchain metadata
scripts/fetch-toolchain.ps1               下载/哈希/签名校验
scripts/verify-official-toolchain.ps1     live latest gate
scripts/verify-installed-toolchain.ps1    完整安装/Machine PATH/卸载独立性 E2E
.github/workflows/windows-build.yml        全门禁 + Release
package.json / package-lock.json           Desktop 0.9.1 + DSH 0.1.1-rc.1
runtime-manager.js                         managed DSH Runtime
runtime-control.js                         Runtime GUI/settings/maintenance
plugin-market.js / plugin-security.js      live marketplace + preflight
DEVELOPMENT_LOG.md                         当前 v0.9.x 工程日志
docs/history/DEVELOPMENT_LOG-v0.4-v0.8.md 历史工程日志
HANDOFF.md                                 本交接文档
```

## 12. 下一步优先级

### P0 — 首次启动小白向导

尚未完成。目标：欢迎页、DeepSeek API Key、本地保存说明、连通性测试、Runtime/模型/插件健康状态、一键进入主界面。

实现前必须先核对官方 DSH 当前凭据/Profile 存储语义；不要把 API Key 内置到公开安装包或日志。

### P2 — 供应链纵深防御

尚未完成：

- dependency-tree OSV/npm audit；
- npm provenance/signature；
- tarball/source static scan；
- richer plugin permission/sandbox manifest；
- Runtime behavior monitoring/quarantine。

### 平台

Windows x64 是正式发布目标。Linux 仍按此前范围不做；macOS 正式发布链尚未建立。
