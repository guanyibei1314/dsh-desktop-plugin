# DSH Desktop

> DeepSeek Harness 原生 Windows 桌面客户端：一个安装包，两种可切换工作模式。

![Electron](https://img.shields.io/badge/Electron-43-47848f?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Release-Windows_x64-0d1117)
![Version](https://img.shields.io/badge/Version-0.10.0-3fb950)
![License](https://img.shields.io/badge/License-MIT-d9a441)

## Windows x64 — v0.10.0

**v0.10.0 已正式发布。**

**[下载 DSH Desktop v0.10.0 Windows 安装包](https://github.com/guanyibei1314/dsh-desktop-plugin/releases/download/v0.10.0/DSH-Desktop-Setup-0.10.0.exe)**

Release 页面：

**https://github.com/guanyibei1314/dsh-desktop-plugin/releases/tag/v0.10.0**

安装包 SHA-256：

```text
7d406533c4e1427f8b9a9056b4c0b07e9a533ad7332676b980180bfabb57a729
```

Release 同时提供：

```text
DSH-Desktop-Setup-0.10.0.exe.sha256
DSH-Desktop-Setup-0.10.0.exe.blockmap
latest.yml
```

GitHub Actions artifact ZIP digest 不是安装包 EXE 的 SHA-256；以 Release 的 `.sha256` 资产和上面的 EXE SHA-256 为准。

---

# v0.10.0：Standard + Creator 双模式

DSH Desktop 不再需要为了不同工作方式维护两个安装包。v0.10.0 在同一个 Desktop 中提供：

```text
DSH Desktop
├── Standard
│   └── 原有 DSH Agent / 会话 / 插件 / Terminal / Browser / Sites
└── Creator
    └── 内容 / 灵感 / 运营 / 复盘 + 同一个 DSH 会话
```

两种模式共享同一套经过验证的 DeepSeek Harness Runtime、凭据、Node.js、Git 和安全更新基础设施。

模式切换会保存选择并重新启动 Desktop Shell，避免两套侧栏/UI 在同一个 Renderer 中互相覆盖。

## Standard 模式

Standard 就是原来的 DSH Desktop，继续保留：

- DeepSeek Harness 原生会话与 Agent；
- Runtime 自动检查、更新、回滚；
- 实时插件市场与安全预检；
- Skin Center；
- 内置 Terminal；
- 内置 Browser；
- Sites Web 工作区；
- 托盘、通知、防休眠、快捷键；
- Windows 完整 Node.js + Git 工具链。

## Creator 模式

Creator 是 v0.10.0 新增的 Windows-first 本地创作与运营工作台。

当前核心入口：

| 工作区 | 能力 |
| --- | --- |
| 今日推进 | 最近内容、到期事项、目标概览 |
| 内容 | 本地内容库、阶段识别、选题/脚本编辑 |
| 灵感 | 快速记录、分类、标签、升级为真实内容项目 |
| 运营 | 档期规划、下一步、阶段目标 |
| 复盘 | 结果、有效做法、问题、下一次实验 |
| 设置与备份 | 内容目录、Creator 状态 JSON 备份 |
| DSH 会话 | Creator 右侧继续使用同一个 Harness Runtime |

Creator 第一版不强依赖 Screen Studio、macOS-only 工具或自动社交平台发布。后续扩展可以作为 Capability 接入，而不会让 Windows 核心工作台依赖某个外部软件。

完整架构见 [`docs/DUAL_MODE.md`](docs/DUAL_MODE.md)。

---

# 本地文件是真源

Creator 不把脚本、视频和图片搬进封闭数据库。

用户选择一个普通本地目录，例如：

```text
内容/
└── 2026-08-30_人形机器人最新进展/
    ├── topic.md
    ├── script.md
    ├── video.mp4
    ├── video.srt
    └── cover_16x9.png
```

`topic.md`、`script.md` 和媒体文件本身就是事实来源。Creator 的运营状态只保存关联信息，例如：

- 灵感；
- 档期；
- 目标；
- 复盘；
- 发布标记；
- 下一步；
- 标签。

Creator 运营状态保存在 Desktop 用户数据目录下的 `creator/state.json`，切回 Standard 模式不会删除内容目录或 Creator 状态。

## Creator 文件安全边界

v0.10.0 对 Creator 文件操作做了明确限制：

- 内容 Root 必须是真实本地目录；
- 内容 ID 拒绝路径穿越；
- 内容目录拒绝 symlink；
- 编辑器只允许写 `topic.md` / `script.md`；
- 编辑目标拒绝 symlink / 非普通文件；
- 单个可编辑文本上限 2 MiB；
- 临时文件写入后再 rename/copy；
- Renderer 只通过窄化 `contextBridge` IPC 访问主进程。

Creator Window 使用独立 Session partition、`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，Electron 权限默认拒绝。

---

# 完整系统 Node.js + Git

Windows 安装包继续内嵌并在系统缺失时安装官方完整工具链：

```text
Node.js 24.20.0 LTS x64 MSI
Git for Windows 2.55.0(5) x64 full installer
```

不是 portable Node，也不是 MinGit。

构建阶段会验证：

- 当前固定版本仍是官方 latest；
- 固定官方 HTTPS 来源；
- SHA-256；
- Authenticode；
- 预期签名者。

验证通过后才把官方安装器嵌入最终 NSIS，因此用户安装 DSH Desktop 时无需临时联网下载 Node/Git。

Node/npm/Git 被写入 Windows Machine PATH，并在 CI 中通过 fresh-shell 与真实安装 E2E。

DSH Desktop 卸载不会顺带删除独立系统 Node/Git。

---

# DeepSeek Harness Runtime

Desktop 当前 bundled / verified DSH family：

```text
@deepseek-ai/dsh@0.1.1-rc.2
```

Runtime 更新链继续执行：

```text
官方 npm metadata
  -> package/SemVer
  -> 官方 HTTPS tarball
  -> sha512 integrity
  -> npm Registry signature / trusted key
  -> DeepSeek GitHub Release/source identity
  -> OSV
  -> lifecycle scripts disabled
  -> isolated real dsh web probe
  -> pending
  -> next boot real Profile preflight
       -> pass: activate
       -> fail: previous/bundled fallback
```

Standard 和 Creator 都复用这一套 Runtime，不分别下载两套 DSH。

---

# 插件市场

插件市场保留：

- live catalog；
- npm 包名检查；
- 官方 npm Registry；
- 精确版本安装计划；
- tarball / SHA-512 integrity；
- OSV fail-closed；
- 安装后 name/version/integrity 复核；
- 异常时回滚；
- 红蓝安全回归测试。

第三方插件依然属于额外供应链边界，不能因为存在 integrity 就理解为“第三方代码绝对安全”。

---

# Windows 发布门禁

正式 PR / Release 会执行：

1. `npm ci`
2. toolchain manifest source/hash tests
3. Node LTS / Git for Windows latest live gate
4. JS syntax checks
5. Dual Mode / Creator 安全回归
6. Runtime functional + red-blue
7. Runtime maintenance / GC
8. official DSH release verification
9. source Runtime provenance + real activation probe
10. plugin market functional + red-blue
11. PowerShell E2E parse
12. Node/Git download + SHA-256 + Authenticode
13. Windows NSIS build
14. **packaged Standard smoke**
15. **packaged Creator smoke**
16. packaged plugin runtime / offline skins
17. Node/npm/Git/Bash/GUI/LFS/Machine PATH installed E2E
18. installed official Runtime update E2E
19. installed live marketplace + security preflight
20. 3 × clean install → cold start → restart → uninstall
21. package/runtime size audit
22. installer SHA-256
23. verified artifact upload
24. Release 下载同一 artifact 后再次验证 SHA-256

v0.10.0 正式 main release run #160 的 `build` 与 `publish` 均已成功。

当前 DSH Desktop 社区发行路径允许 **unsigned Desktop installer**。因此 Windows 可能显示 `Unknown publisher / Windows protected your PC`。如果构建产物带有签名但签名损坏或无效，验证脚本仍会拒绝。

这项策略只影响 DSH Desktop 自身发行签名；随包 Node.js / Git 官方安装器仍必须通过各自 Authenticode 与 SHA-256 验证。

---

# 从源码运行

开发机器需要 Node.js：

```bash
npm ci
npm run check
npm run test:security-hardening
npm run test:runtime-update
npm run test:runtime-update-security
npm run test:runtime-maintenance
npm run test:market
npm run test:market-security
npm run verify:official-dsh
npm start
```

Creator 本地 smoke：

```bash
npm run smoke:creator
```

Windows 打包：

```bash
npm run dist
npm run verify:packaged-plugin
npm run audit:package
```

---

# 平台状态

正式发行目标当前仍为 **Windows x64**。

- Windows x64：正式目标；
- Linux：当前不建立正式发布链；
- macOS：当前不建立正式发布链。

Creator v0.10.0 核心不依赖 macOS-only 创作软件。

## 项目来源 / 参考

DSH Desktop 是社区项目，不代表 DeepSeek 官方产品。

v0.10.0 Creator 的 local-first 工作台方向参考了 DSH 社区中的 MIT 开源项目，包括 `Jackywxsz/DSH-Creator`，但本仓库实现自己的 Windows Creator Shell，不使用其单独受保护的 `Jacky Creator` 名称、Logo、角色/IP 形象或品牌视觉资产。

## 开发状态 / 接手

- 双模式设计：[`docs/DUAL_MODE.md`](docs/DUAL_MODE.md)
- v0.10.0 发布证据：[`docs/RELEASE_V0.10.0.md`](docs/RELEASE_V0.10.0.md)
- 当前交接：`HANDOFF.md`
- 当前工程日志：`DEVELOPMENT_LOG.md`
- 历史工程日志：`docs/history/DEVELOPMENT_LOG-v0.4-v0.8.md`
- 用户可读变化：`CHANGELOG.md`
