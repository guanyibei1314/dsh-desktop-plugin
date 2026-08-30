# DSH Desktop 交接文档

> 最后更新：2026-08-30  
> 当前正式公开 Release：`v0.10.0`  
> 当前产品形态：Standard + Creator Dual Mode  
> 正式发布平台：Windows x64  
> 仓库：`guanyibei1314/dsh-desktop-plugin`

## 0. v0.10.0 已正式发布

v0.10.0 已完成完整发布闭环，不再处于候选或待发布状态。

- Feature PR：#27
- Feature merge commit：`082bdae735b63367b2cca3c96bacffa6484575b3`
- Release PR：#28
- Release commit：`db298476c9164f1e47e6b1001b31416dcabcd489`
- 正式 Windows workflow：run #160
- build：success
- publish：success
- GitHub tag：`v0.10.0`
- GitHub Release：`DSH Desktop 0.10.0`
- Published：2026-08-30

正式 Release：

```text
https://github.com/guanyibei1314/dsh-desktop-plugin/releases/tag/v0.10.0
```

正式 Windows 安装包：

```text
DSH-Desktop-Setup-0.10.0.exe
```

安装包 SHA-256：

```text
7d406533c4e1427f8b9a9056b4c0b07e9a533ad7332676b980180bfabb57a729
```

Release 资产已确认存在：

```text
DSH-Desktop-Setup-0.10.0.exe
DSH-Desktop-Setup-0.10.0.exe.sha256
DSH-Desktop-Setup-0.10.0.exe.blockmap
latest.yml
```

注意：当前社区发行允许 DSH Desktop installer 自身 unsigned，所以 Windows 可能显示 `Unknown publisher / Windows protected your PC`。随包 Node.js / Git 仍必须通过官方 SHA-256 和 Authenticode signer 校验。

## 1. v0.9.2 为什么没有正式上线

v0.9.2 第一次被 Desktop Authenticode 强制签名门禁阻断。后来门禁改为允许 unsigned Desktop installer，但第二次发布又在 `Verify pinned full toolchain matches official latest` 失败：旧脚本通过匿名 `api.github.com` 查询 Git for Windows latest Release，在 GitHub Hosted Runner 共享出口命中 API rate limit。

v0.10.0 已修复该问题：

- Git latest 使用 `https://gitforwindows.org/latest-tag.txt`；
- 使用 deterministic GitHub immutable Release asset URL；
- `fetch-toolchain.ps1` 仍真实下载二进制；
- SHA-256 与 Authenticode publisher 验证仍然保留。

## 2. v0.10.0 Dual Mode 架构

```text
DSH Desktop
├── Standard
└── Creator
```

### Standard

入口：

```text
bootstrap.js -> main.js
```

保留原有：

- DSH native session / Agent；
- Runtime GUI / auto update / rollback；
- plugin market；
- Skin Center；
- Terminal；
- Browser；
- Sites；
- tray / notifications / power-save integration。

### Creator

入口：

```text
bootstrap.js
 -> desktop-mode.js
 -> creator-main.js
 -> creator.html / creator.js / creator.css
```

模式选择保存在 Desktop `settings.json`：

```json
{
  "desktopMode": "creator"
}
```

切换模式使用 `app.relaunch()`，不让 Standard sidebar 与 Creator sidebar 在同一个 Renderer 中互相覆盖。

Creator v0.10.0 核心：

- 今日推进；
- 内容库；
- 灵感库；
- 档期；
- 目标；
- 人工复盘；
- Creator JSON 备份；
- 右侧同一个 DSH 会话。

第一版不依赖 Screen Studio、macOS-only 工具或自动发布；后续扩展作为 Capability 接入。

## 3. Creator 数据真源

用户选择真实本地内容 Root，每条内容是普通目录：

```text
Content/
└── YYYY-MM-DD_Title/
    ├── topic.md
    ├── script.md
    ├── *.mp4 / *.mov
    ├── *.srt / *.vtt
    └── cover*.png / jpg / webp
```

正文和媒体只认真实目录。

Creator 自身运营状态：

```text
<Desktop userData>/creator/
├── state.json
└── creator.log
```

`state.json` 只保存 ideas、schedule、goals、reviews、contentMeta、Creator settings，不复制 `topic.md` / `script.md`。

## 4. Creator 文件安全边界

当前要求：

- Root 必须 realpath 且为 directory；
- contentId 只允许安全字符；
- path 必须留在 Root 直接子目录；
- content directory 拒绝 symlink；
- Editor 只允许 `topic.md` / `script.md`；
- editor target 拒绝 symlink / non-file；
- 单个可编辑文本上限 2 MiB；
- 写入使用 temp + rename/copy fallback；
- IPC 要求 exact Creator renderer sender。

Creator Window：

```text
contextIsolation=true
nodeIntegration=false
sandbox=true
partition=persist:dsh-creator-shell
permission request/check => deny
```

`creator.html` 使用本地 CSP，frame 只允许 loopback DSH。

## 5. Shared Runtime

Standard 与 Creator 都先执行：

```text
runtimeManager.patchDshSpawn()
prepareRuntimeBeforeBoot()
Runtime maintenance
bundled Web UI reconcile
```

Creator 启动 DSH service 使用随机 `127.0.0.1:0` 端口，不恢复固定 `3080` 信任。

两种模式共享：

- DSH managed Runtime；
- DSH credentials/home；
- Node/Git；
- Runtime security；
- plugin/runtime package infrastructure。

## 6. 当前 DSH Runtime

当前 direct `@deepseek-ai/dsh-*` family：

```text
0.1.1-rc.2
```

Runtime update 继续要求：

- official npm Registry；
- exact package/SemVer；
- HTTPS tarball；
- sha512 integrity；
- npm Registry signature / trusted signing key；
- expected DeepSeek GitHub repository；
- expected immutable DSH release/source identity；
- OSV；
- lifecycle scripts disabled；
- isolated real `dsh web` probe；
- next-boot real Profile preflight；
- activate / rollback。

## 7. Windows 工具链

v0.10.0 正式发行使用：

```text
Node.js 24.20.0 LTS x64 MSI
SHA-256 28b69132c35ccc033bf8f2a67cd10c9d75ef5822593363309da448f2afff2d8a

Git for Windows 2.55.0(5) x64 full installer
SHA-256 d065a4e23c3d9a6b5073d609b5be0830227ec3ca053c083ba385061ddfaf94c6
```

安装为 per-machine：

- trusted Program Files 检测；
- 缺失时安装官方完整 Node/npm；
- 缺失时安装官方完整 Git/Bash/GUI/LFS；
- Machine PATH；
- fresh shell 验证；
- DSH uninstall 不删除独立 Node/Git。

Node/npm 版本验证不再硬编码 npm patch 版本；Node MSI 自身先经过 SHA-256 + OpenJS Authenticode 验证，然后 installed E2E 要求 fresh shell 解析到同一个有效 npm semver。

## 8. Desktop 签名政策

当前社区发行：

```text
NotSigned -> 允许社区 Release
Valid -> 可以继续验证已配置 Publisher
Invalid / HashMismatch / other invalid signature -> 拒绝
```

不能把 unsigned 描述成受信 Publisher。

## 9. v0.10.0 正式 CI 实际通过项目

正式 main release run #160 已通过：

1. npm ci
2. toolchain manifest checks
3. official latest Node/Git live gate
4. static syntax
5. security hardening + dual-mode tests
6. Runtime functional/red-blue
7. Runtime maintenance
8. official DSH verify
9. source Runtime provenance/activation probe
10. plugin market functional/red-blue
11. PowerShell parse
12. full Node/Git download + hash + Authenticode
13. NSIS build
14. packaged Standard smoke
15. packaged Creator smoke
16. packaged plugin/skins
17. installed Node/Git/Machine PATH
18. installed Runtime update
19. installed live marketplace/security
20. 3x clean install/cold start/restart/uninstall
21. package size audit
22. EXE SHA-256
23. artifact upload
24. publish re-download / Authenticode policy / SHA-256 reverify
25. versioned GitHub Release creation

`build` 与 `publish` 均为 `success`。

## 10. 关键文件

```text
bootstrap.js                       mode-independent boot/runtime setup
desktop-mode.js                    Standard/Creator selection + relaunch
main.js                            Standard host
creator-core.js                    Creator state/path pure logic
creator-main.js                    Creator host/IPC/DSH service
creator-preload.js                 Creator least-privilege bridge
creator.html/js/css                Creator workspace

toolchain-manifest.json            pinned full Node/Git
build/installer.nsh                per-machine installer
scripts/verify-official-toolchain.ps1
scripts/fetch-toolchain.ps1
scripts/test-dual-mode.js
.github/workflows/windows-build.yml

docs/DUAL_MODE.md                  dual-mode architecture
docs/RELEASE_V0.10.0.md            v0.10.0 release evidence
CHANGELOG.md
README.md
DEVELOPMENT_LOG.md
```

## 11. 下一版本建议

v0.10.0 已经正式 Release，后续进入新版本时优先考虑：

- Creator optional capabilities：字幕、封面、发布、数据同步；
- Creator knowledge/rule/template 闭环；
- 更完整的 Creator installed E2E；
- 插件 lifecycle-script 进一步收紧；
- GitHub main ruleset 强制 PR + required Windows build + CODEOWNERS；
- Windows 正式代码签名可作为未来发行增强，不阻塞当前社区版本。

Linux 继续不做正式发布链；macOS 暂不建立正式发行链。
