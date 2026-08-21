# DSH Desktop 交接文档

> 最后更新：2026-08-21  
> 当前正式版本：`v0.9.1`  
> 正式发布平台：Windows x64  
> 仓库：`guanyibei1314/dsh-desktop-plugin`

## 1. 正式发布状态

v0.9.1 功能代码已经通过 PR #12 全门禁并合并 `main`。

```text
PR #12 final head
229f2d31bf6c3c215654ce8e547cd13433fdd98d

PR #12 merge
7332654a3d25e36791043c6e07970e80f75bb364

release trigger
6d8f781c25bd425097f6207c6ce3e35e39019a22
message: release: v0.9.1
```

正式 `v0.9.1` tag 已生成，并已用 commit compare 核对：

```text
base: 6d8f781c25bd425097f6207c6ce3e35e39019a22
head: v0.9.1
status: identical
ahead: 0
behind: 0
```

正式下载：

```text
https://github.com/guanyibei1314/dsh-desktop-plugin/releases/download/v0.9.1/DSH-Desktop-Setup-0.9.1.exe
```

Release 页面：

```text
https://github.com/guanyibei1314/dsh-desktop-plugin/releases/tag/v0.9.1
```

正式 EXE SHA-256 以 Release Notes 与：

```text
DSH-Desktop-Setup-0.9.1.exe.sha256
```

为唯一权威来源。不要使用 GitHub Actions artifact ZIP digest 代替 EXE SHA-256，也不要把 PR #73 候选 EXE 哈希当作正式 main Release 哈希。

## 2. v0.9.1 核心：完整系统 Node.js + Git

### Node.js

随安装包内嵌并在缺失时安装：

```text
Node.js 24.19.0 LTS x64 MSI
SHA-256 f0f66c2a80c08a30a5ab5179ee9ea9e45f9b46289436a8cc87ff833b852db351
Signer: OpenJS Foundation
```

不是 portable Node。

实际行为：

- 已有可用 Node -> 默认保留；
- 缺失 -> 官方 MSI 自动安装；
- npm 随官方 MSI 安装；
- Node 写入 Windows Machine PATH；
- CI fresh shell 实际执行 `node --version` / `npm --version`。

### Git for Windows

随安装包内嵌并在缺失时安装：

```text
Git for Windows 2.55.0(5) x64 full installer
SHA-256 d065a4e23c3d9a6b5073d609b5be0830227ec3ca053c083ba385061ddfaf94c6
Signer: Johannes Schindelin
```

不是 MinGit / PortableGit。

完整安装 E2E 已验证：

```text
git.exe
Git Bash
Git GUI
Git LFS
Machine PATH
fresh shell git resolution
```

Git 使用官方安装器 `PathOption=Cmd`，只把安全 cmd wrapper 放入 Windows PATH，避免 Unix `find/sort` 抢占系统同名命令。

## 3. Node/Git 安装与卸载边界

默认不覆盖已经可用的 Node/Git。

CI 的：

```text
DSH_TOOLCHAIN_FORCE_INSTALL=1
```

只用于强制验证“随包完整安装器本身”能正常工作，不是普通用户默认安装策略。

DSH Desktop 卸载后，CI 再次验证：

- Node 仍能运行；
- npm 仍存在；
- Git 仍能运行；
- Git Bash 仍存在。

因此 Node/Git 是独立系统工具，不属于 DSH Desktop 卸载清理范围。

## 4. Machine PATH 与首次启动

Windows 安装器采用 per-machine。

Node/Git 官方安装器持久化环境变量后，DSH Setup 会：

1. 读取 64-bit HKLM Machine PATH；
2. 读取 HKCU User PATH；
3. 展开 `%SystemRoot%` 等环境引用；
4. 更新当前 Setup 进程的 PATH；
5. 广播 `WM_SETTINGCHANGE / Environment`。

目的：安装完成页立即启动 DSH Desktop 时，第一次打开内置终端也能直接使用刚安装的 `node/npm/git`，无需注销 Windows。

## 5. 工具链供应链门禁

构建阶段实时要求：

```text
pinned Node == official latest LTS
pinned Git == Git for Windows latest tag
```

并检查：

- 官方固定 HTTPS URL；
- SHA-256；
- Authenticode；
- 预期签名者。

任一不符直接阻断发布。

经过验证的完整官方安装器随后嵌入 NSIS payload，因此用户安装时不需要再联网下载 Node/Git，离线安装也可完成。

## 6. DeepSeek Harness Runtime

v0.9.1 bundled / verified：

```text
@deepseek-ai/dsh@0.1.1-rc.1
```

开发期间 build #68 正确发现官方 stable 已从 rc.7 更新，因此整个直接 `@deepseek-ai/dsh-*` 家族统一对齐到 `0.1.1-rc.1`，没有只升级根包形成混装 Runtime。

v0.8.0 的能力继续保留：

- bundled fallback；
- managed Runtime store；
- Runtime GUI；
- Stable / Latest；
- 自动/手动检查；
- 回滚；
- official npm source + sha512 integrity；
- OSV fail-closed；
- lifecycle scripts disabled；
- isolated real `dsh web` probe；
- next-boot real Profile preflight；
- junction-aware cleanup；
- active/previous/pending protected GC。

## 7. 发布前失败记录

这些失败必须保留，不能为了“看起来全绿”从工程日志删除。

### build #68

失败原因：官方 DeepSeek Harness stable 已更新。

修复：整个直接 DSH 家族升级至 `0.1.1-rc.1`，并用 `npm install --package-lock-only --ignore-scripts` 受控重建 lock。

### build #72

失败原因：NSIS PATH refresh 首版误用了不存在的 `ReadRegExpandStr`。

修复：改为：

```text
SetRegView 64
ReadRegStr
ExpandEnvStrings
```

没有绕过 PATH 功能，也没有忽略失败。

### build #73

最终 PR 候选：**success**。

## 8. build #73 全门禁

全部通过：

1. `npm ci`，0 known vulnerabilities
2. toolchain source/hash manifest
3. Node/Git official latest live gate
4. JavaScript static checks
5. Runtime updater functional
6. Runtime updater red-blue
7. Runtime maintenance junction + GC
8. official DSH stable verify (`0.1.1-rc.1`)
9. source Runtime real web activation probe
10. plugin market functional
11. plugin market red-blue
12. PowerShell E2E parse
13. Node/Git download + SHA-256 + Authenticode
14. NSIS per-machine build
15. packaged application smoke
16. packaged plugin runtime + offline skins
17. Node/npm/Git/Bash/GUI/LFS/Machine PATH installed E2E
18. installed official Runtime update E2E
19. installed live marketplace + security preflight
20. 3 × clean install -> cold start -> real window -> restart -> uninstall
21. package/runtime audit
22. EXE SHA-256 generation
23. artifact upload

实测：

```text
Node v24.19.0
npm 11.17.0
Git 2.55.0.windows.5
Git LFS 3.7.1
```

## 9. PR 候选体积与哈希

PR #73 候选：

```text
DSH-Desktop-Setup-0.9.1.exe
221,685,265 bytes
211.42 MiB
SHA-256 daa3d15781a4b7a782e79da9e0f573efaa8608614dbc6fcfd09a1fbd22378b54
```

Actions artifact：

```text
ID 9443853094
ZIP digest sha256:c747d894777a00d92207da0d46fc7c43a9750619569e6c958195e9ebc0c78971
```

再次强调：ZIP digest != EXE SHA-256。

正式 main build 会产生自己的已验证 artifact，所以正式 Release 哈希只认 Release `.sha256`。

## 10. 体积门禁

完整 Node/Git 使旧 125 MiB 产品范围不再成立，但体积门禁没有取消。

```text
hard cap: 230 MiB
baseline: 130,173,608 bytes
max growth: 110 MiB
```

PR #73 实际 211.42 MiB，通过硬上限。

## 11. 发布流程

```text
feature branch
 -> PR
 -> Windows full gates
 -> merge main
 -> `release: vX.Y.Z`
 -> main 再跑同一 full gates
 -> EXE/.sha256/blockmap/latest.yml artifact
 -> publish 下载同一 artifact
 -> sha256sum -c
 -> gh release create/edit
```

publish 不重新构建第二份未经测试的 EXE。

## 12. 安全边界

能阻断/降低：

- 错误 Node/Git 官方版本；
- 非预期 URL；
- SHA-256 不匹配；
- Authenticode/签名者异常；
- 安装失败；
- Machine PATH 缺失；
- fresh shell 无法解析工具链；
- Runtime integrity/profile preflight 问题；
- junction 删除越界；
- 已覆盖的插件市场已知风险。

不能证明：

- 没有 zero-day；
- 所有 transitive dependency 绝对安全；
- 普通第三方 JS 一定没有恶意逻辑；
- 上游维护者账号未来不会被攻陷。

禁止写“100% 安全”“绝对安全”。

## 13. 当前日志与关键文件

```text
DEVELOPMENT_LOG.md                         v0.9.x 当前工程日志
docs/history/DEVELOPMENT_LOG-v0.4-v0.8.md 历史工程日志
CHANGELOG.md                               用户可读版本变化
README.md                                  下载/使用/验证说明

build/installer.nsh                       Node/Git 安装 + PATH refresh
scripts/toolchain-manifest.json           pinned toolchain
scripts/fetch-toolchain.ps1               下载/hash/signature
scripts/verify-official-toolchain.ps1     live latest gate
scripts/verify-installed-toolchain.ps1    完整安装/Machine PATH E2E
.github/workflows/windows-build.yml        全门禁 + Release
runtime-manager.js                         managed Runtime
runtime-control.js                         Runtime GUI/maintenance
plugin-market.js / plugin-security.js      marketplace/security
```

## 14. 下一步

### P0 — 首次启动 / API Key 小白向导

尚未完成。实现前先核对官方 DSH 当前凭据/Profile 存储语义；不要把 DeepSeek API Key 内置进公开安装包或日志。

### P2 — 供应链纵深防御

尚未完成：

- dependency-tree OSV/npm audit；
- npm provenance/signature；
- tarball/source static scan；
- richer plugin permissions/sandbox manifest；
- Runtime behavior monitoring/quarantine。

### 平台

Windows x64 是正式目标。Linux 仍不做；macOS 正式发布链未建立。
