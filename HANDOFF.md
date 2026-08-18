# DSH Desktop 交接文档

> 最后更新：2026-08-18  
> 目标正式版本：`v0.9.0`  
> 仓库：`guanyibei1314/dsh-desktop-plugin`

## 1. 当前状态

DSH Desktop 当前正式交付目标仍是 Windows x64。v0.9.0 在 v0.8.0 的 Runtime GUI / 安全自动更新 / Runtime 维护 / 插件市场基础上，新增 **完整系统 Node.js + 完整 Git for Windows 安装链**。

本版本明确：

- Node.js：官方完整 Windows x64 MSI，**不是便携版**；
- Git：官方完整 Git for Windows x64 installer，**不是 MinGit / PortableGit**；
- 缺失可用命令时按需安装；已有可用 Node/Git 默认保留；
- 两者安装后由各自官方安装器持久化 Windows PATH；
- DSH 卸载不卸载 Node/Git；
- 安装包允许合理增大，但保留 230 MiB 硬上限；
- macOS / Linux 正式发布链不在本次范围。

代码 PR #10 已通过 Windows build #64 全门禁并合并：

```text
feature head:
803589d6f772f3001775b2553a86443ad17ebc9b

PR #10 merge:
476d22021c7d7f34cc51cc0f71f98aa2ccd124bb

release trigger:
e86ce084afcace6d50c6fb636d762ea989cab78a
```

正式 `v0.9.0` tag / Release 只能在 `release: v0.9.0` 的 main Windows workflow 再次完整通过后判定完成。最终安装包 SHA-256 只认 Release Notes 与同名 `.exe.sha256` asset。

## 2. v0.9.0 完整工具链

### Node.js

```text
版本：24.19.0 LTS x64
文件：node-v24.19.0-x64.msi
来源：https://nodejs.org/download/release/v24.19.0/node-v24.19.0-x64.msi
SHA-256：f0f66c2a80c08a30a5ab5179ee9ea9e45f9b46289436a8cc87ff833b852db351
CI signer：OpenJS Foundation
```

构建时要求：

- credential-free HTTPS；
- host 必须精确为 `nodejs.org`；
- release path / file 必须与 manifest 精确匹配；
- SHA-256 精确匹配；
- Windows Authenticode `Status=Valid`。

安装：

```text
node --version
  ├─ success -> 保留现有 Node
  └─ fail    -> msiexec 安装官方 MSI
```

使用官方 MSI 默认功能选择，不强制 `ADDLOCAL=ALL`，因此 DSH 不主动选择 Node 的可选 native-module build-tools 流程，也不顺带安装 Python / Visual Studio Build Tools。

### Git for Windows

```text
版本：2.55.0.windows.3 x64
文件：Git-2.55.0.3-64-bit.exe
来源：https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.3/Git-2.55.0.3-64-bit.exe
SHA-256：af12577d0fdff74243a5988197aa49b957d5044edc17004f6ddf0768996f1dca
CI signer：Johannes Schindelin
```

这是完整 Git for Windows 发行版，不是 MinGit。Git Bash / Git GUI / Git LFS 等完整发行内容由官方安装器提供。

安装：

```text
git --version
  ├─ success -> 保留现有 Git
  └─ fail    -> 安装完整 Git for Windows
```

PATH 使用：

```text
PathOption=Cmd
```

这让 Windows cmd/PowerShell 直接解析 `git`，但不把完整 Unix 工具集放进 Windows PATH 前面，降低 `find` / `sort` 等同名命令覆盖系统命令的风险。

## 3. PATH 真实验证

`scripts/verify-installed-toolchain.ps1` 不只看安装器退出码。

强制安装后必须验证：

```text
C:\Program Files\nodejs\node.exe
node --version == v24.19.0

C:\Program Files\Git\cmd\git.exe
git --version == git version 2.55.0.windows.3
```

再从 .NET 的 `EnvironmentVariableTarget.Machine/User` 读取持久化 PATH。

PR #10 build #64 实际结果：

```text
node(machine=True,user=False)
git(machine=True,user=False)
```

随后使用持久化 Machine/User PATH 重新构造新 shell 环境：

```text
where node -> success
where git  -> success
```

因此本版本已经验证是 **Machine PATH 持久化**，不是只给当前安装进程临时加 PATH。

## 4. 安装 / 卸载边界

Node.js 与 Git for Windows 是独立 Windows 产品：

- DSH Desktop 安装器只在缺失可用命令时按需调用官方安装器；
- 用户已有可用 Node/Git 时默认不覆盖；
- DSH Desktop 本身继续沿用既有 per-user 安装模型；
- Node/Git 按各自官方安装器的权限/产品模型安装；
- 卸载 DSH Desktop 不卸载 Node/Git；
- 卸载 DSH Desktop 不主动删除 Node/Git 官方安装器维护的 PATH；
- v0.9.0 不负责 Node/Git 后续自动升级。

如果以后需要维护系统 Node/Git 版本，应单独设计，不要和 `dsh-runtime` 的 managed Runtime 更新机制混用。

## 5. 来源 / 供应链门禁

关键文件：

```text
toolchain-manifest.json
scripts/fetch-toolchain.ps1
scripts/test-toolchain-manifest.js
build/installer.nsh
scripts/verify-installed-toolchain.ps1
```

链路：

```text
pinned manifest
  -> exact official HTTPS URL
  -> SHA-256
  -> Authenticode Valid
  -> NSIS payload
  -> official installer execution
  -> Program Files/version verify
  -> persisted PATH verify
  -> new-shell resolution verify
  -> DSH uninstall independence verify
```

这可以降低下载劫持、错误资产、缓存污染、误用 Portable/MinGit 等风险，但不能声称证明上游不存在 zero-day 或签名主体本身永远不会被攻陷。

## 6. 体积策略

PR #10 已验证候选：

```text
DSH-Desktop-Setup-0.9.0.exe
226,818,745 bytes
216.31 MiB
```

v0.8.0 比较基线：

```text
130,173,608 bytes
```

增量：

```text
+96,645,137 bytes
+92.17 MiB
```

CI 门禁：

```text
绝对上限：230 MiB
单版本增长上限：110 MiB
```

这次增长的主要明确来源就是完整 Node MSI + 完整 Git for Windows installer。不要为了继续塞功能随意再放宽上限；后续任何体积提升都要重新说明原因。

## 7. v0.9.0 PR #10 已验证范围

Windows build #64：**success**。

已通过：

1. `npm ci`
2. toolchain manifest 来源 / 版本 / hash test
3. JavaScript static checks
4. Runtime updater functional
5. Runtime updater red-blue
6. Runtime maintenance junction + GC
7. official DSH stable verify
8. source Runtime download / activation probe
9. plugin market functional
10. plugin market red-blue
11. PowerShell E2E parse
12. full Node/Git official download
13. SHA-256 verify
14. Authenticode verify
15. Windows NSIS build
16. packaged application smoke
17. packaged plugin runtime + offline skins
18. **full Node/Git install + persisted Machine PATH E2E**
19. installed official Runtime updater E2E
20. installed live market + security E2E
21. **3 rounds clean install -> cold start -> restart -> uninstall**
22. package/runtime size audit
23. installer SHA-256 generation
24. artifact upload

正式 Release 还会对 `release: v0.9.0` 再跑同一套门禁；PR success 不能代替正式 Release success。

## 8. v0.8.0 核心能力仍保持

### Desktop

- Electron Windows 原生窗口；
- 窗口位置/大小记忆；
- 托盘与快速发消息；
- 系统通知；
- 会话运行期间防休眠；
- `Ctrl+Alt+D` 全局显示/隐藏；
- 可选开机自启；
- xterm + node-pty 内置终端；
- 内置浏览器与 Sites；远程页面无 Node/Electron bridge。

### DSH Runtime

bundled fallback：

```text
@deepseek-ai/dsh@0.1.0-rc.7
```

更新链：

```text
官方 npm metadata
  -> package / SemVer / official HTTPS tarball
  -> sha512 integrity
  -> OSV（不可评估 fail-closed）
  -> lifecycle scripts block
  -> managed runtime store
  -> isolated dsh web probe
  -> pending
  -> next boot real Profile preflight
       -> pass: activate
       -> fail: previous/bundled fallback
```

Runtime GUI 可查看 current/bundled/latest/previous/pending/blocked，切换 Stable/Latest、自动更新、手动检查与回滚。

### Runtime maintenance

- junction-aware smoke cleanup；
- boundary check；
- managed Runtime GC；
- active / previous / pending 保护；
- final EXE `.sha256` release chain。

### Plugin market / Skin Center

- 实时插件市场 + cache fallback；
- npm 插件安装/升级/卸载；
- metadata / lifecycle / integrity / OSV 风险预检；
- critical / unknown 阻断；
- fixed offline `@linxin666/dsh-skins@0.1.18`。

## 9. 安全边界

可以降低/阻断：

- Node/Git 非官方来源；
- Node/Git 错误 hash；
- Node/Git 无效 Authenticode；
- 假 DSH npm 包 / 非官方 tarball / HTTP 降级；
- DSH 缺失/错误 integrity；
- DSH root lifecycle scripts；
- 已知直接 DSH OSV；
- Runtime 真实启动失败 / Profile 不兼容；
- junction 清理越界；
- 插件市场已知高风险输入。

不能声称证明：

- 第三方普通 JS 一定无恶意逻辑；
- transitive dependency 绝对安全；
- 不存在 zero-day；
- 上游维护者/签名账号未来不会被攻陷；
- 不存在延时或条件触发逻辑。

文档/UI 禁止写“100% 安全”“绝对安全”。

## 10. 开箱即用边界

- DSH Desktop 安装：开箱即用；
- DSH Runtime：开箱即用；
- Node/Git：缺失时由 Desktop 安装器按需安装；
- 插件市场 / Skin Center / 终端：开箱即用；
- 第一次真正调用 DeepSeek：没有凭据时仍需用户自己的 DeepSeek API Key。

不要把用户 API Key 内置进公开安装包。

## 11. 元数据注意项

当前 `package-lock.json` 顶层应用版本字段仍显示历史 `0.7.0`，而 `package.json` 已是 `0.9.0`。全部 `npm ci`、依赖闭包、NSIS 和真实安装 E2E 已通过，因此这不是当前运行时故障；它属于生成 lock 的应用版本元数据漂移。后续重新生成 lock 时应同步清理，不能把该字段解释为当前正式 Desktop 版本。

## 12. 后续优先级

### P0：小白级首次启动 / API Key 引导 — 未完成

欢迎页、API Key 本地保存说明、连通性检测、Runtime/模型/插件状态、一键进入。

### P2：供应链纵深防御 — 未完成

- dependency-tree OSV / npm audit；
- npm provenance / signature；
- tarball/source 静态扫描；
- 插件权限 / sandbox manifest；
- runtime behavior monitoring / quarantine。

### System Toolchain maintenance — 后续独立范围

v0.9.0 只解决“缺失时安装完整 Node/Git”。是否要让 DSH 以后检测/提示 Node/Git 新版本，应独立设计更新策略，不要直接复用 DSH Runtime updater。

### macOS / Linux

不在 v0.9.0 范围；正式发布链仍未建立。

## 13. 关键文件

```text
toolchain-manifest.json              Node/Git 固定版本/URL/hash
build/installer.nsh                  NSIS 嵌套官方安装器 + PATH 安装策略
scripts/fetch-toolchain.ps1          下载/来源/hash/Authenticode 校验
scripts/test-toolchain-manifest.js   manifest 安全纯测试
scripts/verify-installed-toolchain.ps1 完整安装/PATH/卸载独立性 E2E
bootstrap.js                         Desktop 启动 / Runtime 控制接管
runtime-manager.js                   Runtime 下载/暂存/激活/回滚核心
runtime-control.js                   Runtime settings/scheduler/maintenance
runtime-settings-window.js           本地 Runtime GUI / IPC
plugin-market.js                     实时市场目录
plugin-security.js                   插件风险预检
bundled-web-ui.js                    Skin Center/Profile 对账
.github/workflows/windows-build.yml  Windows CI/Release/工具链/PATH 门禁
THIRD_PARTY_NOTICES.md               Node/Git/skins 许可证与归属
CHANGELOG.md                         用户可读变更
DEVELOPMENT_LOG.md                   工程开发日志
HANDOFF.md                           本文档
```

## 14. 接手前检查

```bash
npm ci
npm run test:toolchain-manifest
npm run check
npm run test:runtime-update
npm run test:runtime-update-security
npm run test:runtime-maintenance
npm run test:market
npm run test:market-security
npm run verify:official-dsh
```

Windows 打包前：

```bash
npm run prepare:toolchain
npm run dist
```

涉及 Node/Git PATH、安装包、Runtime 或插件链的最终结论，必须以 Windows GitHub Actions 真实打包 / 安装 E2E 为准。

## 15. 发布流程

```text
feature branch
 -> PR
 -> Windows 全链路 CI
 -> success
 -> merge main
 -> main: release: v<version>
 -> Windows 再跑完整门禁
 -> build success
 -> publish 下载同一个已验证 artifact
 -> sha256sum -c
 -> 创建/更新 v<version> Release
```

禁止为了赶发布跳过 full Node/Git install/PATH E2E、Runtime update E2E、maintenance junction/GC、live market/security、三轮 clean-install E2E 或 package audit。
