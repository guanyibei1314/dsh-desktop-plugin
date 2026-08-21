# DSH Desktop

> DeepSeek Harness 原生 Windows 桌面客户端。

![Electron](https://img.shields.io/badge/Electron-43-47848f?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Release-Windows_x64-0d1117)
![Version](https://img.shields.io/badge/Version-0.9.1-3fb950)
![License](https://img.shields.io/badge/License-MIT-d9a441)

## 立即下载

### Windows x64 — v0.9.1

**[下载 DSH Desktop v0.9.1](https://github.com/guanyibei1314/dsh-desktop-plugin/releases/download/v0.9.1/DSH-Desktop-Setup-0.9.1.exe)**

Release：

**https://github.com/guanyibei1314/dsh-desktop-plugin/releases/tag/v0.9.1**

SHA-256 请以 Release Notes 与：

```text
DSH-Desktop-Setup-0.9.1.exe.sha256
```

为唯一权威来源。不要把 GitHub Actions artifact ZIP digest 当成安装包 EXE SHA-256。

## v0.9.1：安装后直接拥有完整 Node.js + Git

这一版不是把 portable 工具偷偷放进 DSH 目录，而是把两个官方完整 Windows 安装器一起交付：

```text
Node.js 24.19.0 LTS x64 MSI
Git for Windows 2.55.0(5) x64 full installer
```

### Node.js

- 完整官方 Node.js LTS，不是 portable；
- Node 缺失时由 DSH Setup 自动安装；
- npm 一并安装；
- 官方 MSI 把 Node 写入 Windows **Machine PATH**；
- 已经有可用 Node 时默认保留用户现有环境。

### Git for Windows

- 完整 Git for Windows，不是 MinGit / PortableGit；
- Git 缺失时自动安装；
- 包含并已在 CI 真实验证：Git Bash、Git GUI、Git LFS；
- 使用官方安全 `Cmd` PATH 模式，把 Git cmd wrapper 写入 **Machine PATH**，不让 Unix `find/sort` 等命令覆盖 Windows 同名工具；
- 已经有可用 Git 时默认保留用户现有环境。

### DSH 卸载不会删除 Node/Git

Node/Git 被视为独立系统开发工具。CI 会安装它们、卸载 DSH Desktop，然后再次验证 Node、Git、Git Bash 仍然存在。

## 离线安装

Node/Git 不是在用户安装时临时联网下载。

构建阶段会先从固定官方 HTTPS 来源取得安装器，再检查：

- 当前 pinned 版本是否仍是官方 latest；
- SHA-256；
- Authenticode；
- 预期签名者。

通过后才嵌入 DSH Desktop NSIS payload。因此最终 Setup 本身可以离线完成 Node/Git 安装。

当前固定：

```text
Node.js 24.19.0 LTS
Git for Windows 2.55.0(5)
```

## 第一次启动也能立即找到 node/git

Windows 安装器写入环境变量后，DSH Setup 会重新读取 Machine/User PATH、刷新自己的进程环境，并广播 Windows `Environment` 变更。

因此从安装完成页立即启动 DSH Desktop 时，内置终端不需要先注销 Windows 才能看到：

```powershell
node --version
npm --version
git --version
```

## DeepSeek Harness Runtime

v0.9.1 bundled / verified：

```text
@deepseek-ai/dsh@0.1.1-rc.1
```

Desktop 仍保留 v0.8.0 的 managed Runtime 更新系统：

```text
官方 npm metadata
  -> package/SemVer/official HTTPS tarball
  -> sha512 integrity
  -> OSV fail-closed
  -> lifecycle scripts disabled
  -> isolated real dsh web probe
  -> pending
  -> next boot real Profile preflight
       -> pass: activate
       -> fail: previous/bundled fallback
```

Runtime GUI：

- `选项 -> DSH Runtime 更新`
- 托盘 -> `Runtime 更新`

支持 Stable/Latest、自动更新、立即检查、回滚、blocked/pending/previous 状态和诊断。

## 主要能力

| 能力 | 说明 |
| --- | --- |
| 完整系统工具链 | v0.9.1 自动安装官方完整 Node.js + Git for Windows |
| Machine PATH | Node/npm/Git 安装后可被新 shell 与 DSH 内置终端直接解析 |
| 官方 DSH Runtime | bundled fallback + managed safe update + rollback |
| Runtime GUI | 通道、自动更新、检查、回滚、状态与日志 |
| Runtime 安全维护 | junction-aware cleanup + active/previous/pending protected GC |
| 实时插件市场 | live community catalog + npm install/update/remove |
| 插件安全预检 | metadata/lifecycle/integrity/OSV/risk gate |
| Skin Center | `@linxin666/dsh-skins@0.1.18` 随包离线交付 |
| 内置终端 | xterm + node-pty |
| 内置浏览器 | remote content 无 Node/Electron bridge |
| Sites | 独立持久化 Web 工作区 |
| 托盘/通知/防休眠 | 桌面原生集成 |

## v0.9.1 Windows 发布门禁

正式 PR 与 Release 路径执行：

1. `npm ci`
2. toolchain manifest source/hash tests
3. Node latest LTS / Git for Windows latest live check
4. JS static checks
5. Runtime updater functional + red-blue
6. junction/Runtime GC safety test
7. official DSH stable verify
8. official Runtime download + real `dsh web` activation probe
9. plugin market functional + red-blue
10. PowerShell E2E parse
11. official Node/Git download + SHA-256 + Authenticode
12. Windows per-machine NSIS build
13. packaged application smoke
14. packaged plugin runtime + offline skins
15. **完整 Node/npm/Git/Git Bash/Git GUI/Git LFS/Machine PATH installed E2E**
16. installed official Runtime update E2E
17. installed live marketplace + security preflight
18. **3 rounds clean install -> cold start -> restart -> uninstall**
19. installer/runtime size audit
20. EXE SHA-256 generation
21. verified artifact upload
22. publish 再执行 `sha256sum -c` 后创建 Release

PR #12 最终 Windows build #73 已全部通过。

## 安装包体积

加入完整官方 Node/Git 后，旧 125 MiB 上限不再符合产品范围，但没有删除体积控制。

当前硬上限：

```text
230 MiB
```

PR #73 候选实测：

```text
221,685,265 bytes
211.42 MiB
```

## 安全边界

Node/Git 工具链发布可阻断：错误官方版本、非预期 URL、SHA-256 不一致、Authenticode/签名者异常、安装失败、Machine PATH 缺失或 fresh shell 无法解析。

Runtime/插件链也继续使用已有 fail-closed 与红蓝门禁。

这些机制用于降低供应链和安装错误风险，但不等于证明所有第三方 JS、transitive dependency 或未来版本不存在 zero-day。项目不会宣称“100% 安全”。

## 从源码运行

开发机器需要 Node.js：

```bash
npm ci
npm run check
npm run test:toolchain-manifest
npm run verify:official-toolchain
npm run test:runtime-update
npm run test:runtime-update-security
npm run test:runtime-maintenance
npm run test:market
npm run test:market-security
npm run verify:official-dsh
npm start
```

正式 Windows 打包：

```bash
npm run dist
npm run verify:packaged-plugin
npm run audit:package
```

## 平台状态

正式发行目标当前为 **Windows x64**。

- Linux：当前不做正式发布链；
- macOS：尚未建立正式发布链。

## 开发状态 / 接手

- 当前交接：`HANDOFF.md`
- 当前工程日志：`DEVELOPMENT_LOG.md`
- v0.4–v0.8 历史工程日志：`docs/history/DEVELOPMENT_LOG-v0.4-v0.8.md`
- 用户可读版本变化：`CHANGELOG.md`
