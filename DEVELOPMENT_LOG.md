# DSH Desktop 开发日志

> 当前工程日志：v0.9.x。v0.4–v0.8 历史记录已原样归档到 `docs/history/DEVELOPMENT_LOG-v0.4-v0.8.md`。

## 2026-08-21 — v0.9.1 完整系统 Node.js + Git 工具链

### 目标

用户明确要求：

- 不使用 portable Node.js；
- 不使用 MinGit；
- DSH Desktop Windows 安装包直接携带官方完整 Node.js 与完整 Git for Windows；
- 在缺失时由安装程序自动完成系统安装；
- Node/Git 必须进入 Windows **Machine PATH**；
- 安装包可以增大，但仍必须有明确体积上限；
- 不破坏用户机器已有可用 Node/Git；
- DSH 卸载不能顺带删除独立安装的 Node/Git。

### 分支 / PR / 版本

- 功能分支：`feat/v0.9.1-system-toolchain`
- PR：#12 `fix: v0.9.1 enforce full system Node and Git toolchain`
- 最终功能 head：`229f2d31bf6c3c215654ce8e547cd13433fdd98d`
- PR merge：`7332654a3d25e36791043c6e07970e80f75bb364`
- release trigger：`6d8f781c25bd425097f6207c6ce3e35e39019a22` (`release: v0.9.1`)
- Desktop 版本：`0.9.1`

### 固定官方工具链

构建时固定并核对：

```text
Node.js 24.19.0 LTS x64 MSI
SHA-256 f0f66c2a80c08a30a5ab5179ee9ea9e45f9b46289436a8cc87ff833b852db351
Signer OpenJS Foundation

Git for Windows 2.55.0(5) x64 full installer
SHA-256 d065a4e23c3d9a6b5073d609b5be0830227ec3ca053c083ba385061ddfaf94c6
Signer Johannes Schindelin
```

同时新增实时 latest 门禁：

- Node 固定版本必须仍等于官方 latest LTS；
- Git 固定版本必须仍等于 Git for Windows latest tag；
- 下载 URL、SHA-256、Authenticode 任一不匹配即 fail-closed；
- 用户安装时不再联网下载，两个官方安装器已经在 CI 校验后嵌入 NSIS payload，因此离线安装仍可完成。

### 安装行为

Windows DSH Desktop 改为 per-machine 安装。

默认行为：

```text
检测 node --version
├─ 已有可用 Node -> 保留用户现有安装
└─ 缺失 -> 官方 Node MSI /passive /norestart

检测 git --version
├─ 已有可用 Git -> 保留用户现有安装
└─ 缺失 -> 官方完整 Git for Windows 静默安装
```

CI E2E 使用 `DSH_TOOLCHAIN_FORCE_INSTALL=1` 强制走完整安装分支，用于证明随包安装器本身真实可用；这不代表普通用户机器上会无条件覆盖已有环境。

Git 使用完整安装器的 `PathOption=Cmd`：Git Bash / Git GUI / Git LFS / OpenSSH 等完整组件正常安装，但 Windows PATH 只加入 Git 的 cmd wrapper，避免 Unix `find` / `sort` 等工具抢占 Windows 同名命令。

### Machine PATH 与首次启动问题

仅依赖官方安装器写注册表还不够：如果 DSH Setup 安装完立刻启动 Desktop，子进程可能继承 Setup 启动前的旧 PATH。

最终 NSIS 逻辑：

1. 读取 64-bit HKLM Machine PATH；
2. 读取 HKCU User PATH；
3. 展开 `%SystemRoot%` 等 REG_EXPAND_SZ 引用；
4. 更新当前安装器进程的 `PATH`；
5. 广播 `WM_SETTINGCHANGE / Environment`。

这样安装完成页直接启动 DSH Desktop 时，其内置终端也能立即看到刚安装的 Node/Git。

### DeepSeek Harness 同步升级

第一次 v0.9.1 CI 没有绕过旧 Runtime 门禁：`verify:official-dsh` 发现官方 stable 已从 `0.1.0-rc.7` 更新到：

```text
@deepseek-ai/dsh@0.1.1-rc.1
```

因此把直接 `@deepseek-ai/dsh-*` 家族统一升级到 `0.1.1-rc.1`，而不是只升级根包造成混装 Runtime。

`package-lock.json` 使用 GitHub Windows runner + `npm install --package-lock-only --ignore-scripts` 受控重建；临时写权限 workflow 随后立即删除。lock 顶层版本也从历史遗留值同步为 `0.9.1`。

### 发布前失败历史

#### Windows build #68 — fail-closed：官方 DSH 已更新

新增 Node/Git official latest 门禁通过，但原 `verify:official-dsh` 正确阻断旧 `0.1.0-rc.7` Runtime。

处理：升级整个直接 DSH 家族到 `0.1.1-rc.1` 并重建 lock；没有放松 DSH 一致性检查。

#### Windows build #72 — NSIS 编译失败

原因：安装器首次实现使用不存在的 NSIS `ReadRegExpandStr` 指令。

处理：改为 NSIS 支持的：

```text
SetRegView 64
ReadRegStr
ExpandEnvStrings
```

没有删除 PATH 刷新设计，也没有把失败步骤改成 `continue-on-error`。

#### Windows build #73 — success

最终 PR 候选全链路通过。

### build #73 真实安装验证

工具链 E2E 实际验证：

```text
Node.js: v24.19.0
npm: 11.17.0
Git: git version 2.55.0.windows.5
Git Bash: C:\Program Files\Git\git-bash.exe
Git GUI: C:\Program Files\Git\cmd\git-gui.exe
Git LFS: 3.7.1
Machine PATH: Node + Git 均存在
fresh shell: node/npm/git 均解析到预期版本
```

随后卸载 DSH Desktop，再次验证：

```text
Node.js 仍存在并可运行
Git 仍存在并可运行
Git Bash 仍存在
```

因此 DSH Desktop 与独立 Node/Git 生命周期分离。

### build #73 其他全门禁

全部通过：

1. `npm ci`（693 packages，0 known vulnerabilities）
2. toolchain manifest source/hash checks
3. Node/Git official latest check
4. JavaScript static checks
5. Runtime updater functional
6. Runtime updater red-blue
7. Runtime maintenance junction + GC
8. official DSH stable verify (`0.1.1-rc.1`)
9. source Runtime download / real web activation probe
10. plugin market functional
11. plugin market red-blue
12. PowerShell E2E parse
13. official Node/Git download + SHA-256 + Authenticode
14. NSIS per-machine build
15. packaged application smoke
16. packaged plugin runtime + offline Skin Center
17. full Node/npm/Git/Bash/GUI/LFS/Machine PATH installed E2E
18. installed official DSH Runtime update E2E
19. installed live marketplace + security preflight
20. 3 × clean install -> cold start -> real desktop window -> restart -> uninstall
21. package/runtime size audit
22. EXE SHA-256 generation
23. artifact upload

### 候选安装包数据（PR #73）

```text
DSH-Desktop-Setup-0.9.1.exe
221,685,265 bytes
211.42 MiB
SHA-256 daa3d15781a4b7a782e79da9e0f573efaa8608614dbc6fcfd09a1fbd22378b54
```

PR artifact：

```text
Artifact ID: 9443853094
Artifact ZIP digest: sha256:c747d894777a00d92207da0d46fc7c43a9750619569e6c958195e9ebc0c78971
```

**Artifact ZIP digest 不是 EXE SHA-256。** 正式 Release 的 EXE SHA-256 仍以 Release Notes 与 `.exe.sha256` asset 为唯一权威来源，因为正式 main build 会重新产生其自己的已验证 artifact。

### 体积门禁

v0.9.x 因完整内嵌官方 Node/Git 安装器，旧 125 MiB 门禁不再符合产品范围，但没有取消体积控制。

当前硬门禁：

```text
absolute installer cap: 230 MiB
baseline: 130,173,608 bytes
max growth vs baseline: 110 MiB
```

#73 实际 211.42 MiB，通过硬上限；相比基线增加约 87.27 MiB。

### Release 规则

正式发布必须：

```text
release: v0.9.1 main commit
 -> 同一 Windows 全门禁 build
 -> artifact 包含 EXE/.sha256/blockmap/latest.yml
 -> publish job 下载同一个已验证 artifact
 -> sha256sum -c
 -> gh release create/edit v0.9.1
```

publish 不重新 build 第二份未经测试的 EXE。

### 当前安全边界

可以实际阻断/降低：

- 非官方 Node/Git 来源；
- 固定版本不再是当前官方 latest；
- Node/Git SHA-256 不一致；
- Authenticode 无效/签名者不符合预期；
- Node/Git 安装失败；
- Machine PATH 缺失；
- fresh shell 无法解析工具链；
- DSH Runtime 来源/integrity/profile preflight 问题；
- junction 清理越界；
- 已有插件市场安全规则覆盖的已知风险。

不能声称：

- 绝对没有 zero-day；
- 所有 transitive dependency 绝对安全；
- 第三方普通 JS 一定没有恶意逻辑；
- 未来上游维护者账号不会被攻陷。

### 下一步

- P0：首次启动 / DeepSeek API Key 小白向导；
- P2：dependency-tree OSV、npm provenance/signature、插件权限 manifest / sandbox、Runtime behavior quarantine；
- Windows 是当前正式发布目标；Linux 仍按此前要求不做，macOS 正式发布链也未建立。
