# DSH Desktop 交接文档

> 最后更新：2026-08-30  
> 当前开发目标：`v0.10.0` Dual Mode  
> 当前正式公开 Release：`v0.9.1`，`v0.9.2` 未成功生成 GitHub Release  
> 正式发布平台：Windows x64  
> 仓库：`guanyibei1314/dsh-desktop-plugin`

## 0. 当前发布任务

v0.10.0 通过 PR #27 开发和验证，目标是一个 Windows 安装包提供两种可切换模式：

```text
DSH Desktop
├── Standard
└── Creator
```

Standard 保留 v0.9.x 原有 DSH Desktop。Creator 是新的 Windows-first 本地内容 / 灵感 / 运营 / 复盘工作台，但不复制第二套 DSH Runtime。

正式 Release 仍必须走：

```text
PR
 -> Windows full gates
 -> merge main，release: v0.10.0 ...
 -> main 再跑同一 full gates
 -> verified artifact
 -> publish job SHA-256 re-check
 -> v0.10.0 GitHub Release
```

在 `v0.10.0` Release 页面和安装资产真实存在前，不得把“代码已合并”表述成“正式上线成功”。

## 1. v0.9.2 为什么没有正式上线

v0.9.2 最初被强制 Desktop Authenticode 签名门禁阻断；仓库没有配置公共发行签名证书。随后门禁改为允许 unsigned Desktop installer，并再次触发发布。

第二次正式发布最终在 `Verify pinned full toolchain matches official latest` 失败：旧 `verify-official-toolchain.ps1` 使用匿名 `api.github.com` 请求 Git for Windows latest Release，在 GitHub Hosted Runner 共享出口上命中 API rate limit。

因此 v0.9.2 没有生成正式 GitHub Release/tag 资产，当前对外正式版仍是 v0.9.1。

v0.10.0 已修改该 live gate：

- Git latest 使用 `https://gitforwindows.org/latest-tag.txt`；
- 再由 deterministic GitHub immutable Release asset URL 固定文件；
- 实际二进制仍由 `fetch-toolchain.ps1` 下载；
- SHA-256 与 Authenticode publisher 验证没有删除。

## 2. v0.10.0 Dual Mode 架构

### Standard

入口仍为：

```text
bootstrap.js -> main.js
```

保留：

- DSH native session / Agent；
- Runtime GUI / auto update / rollback；
- plugin market；
- Skin Center；
- Terminal；
- Browser；
- Sites；
- tray / notifications / power-save integration。

### Creator

入口为：

```text
bootstrap.js
 -> desktop-mode.js
 -> creator-main.js
 -> creator.html / creator.js / creator.css
```

模式选择存储在 Desktop `settings.json`：

```json
{
  "desktopMode": "creator"
}
```

切换模式使用 `app.relaunch()`。不在同一个 Renderer 中同时加载 Standard sidebar 与 Creator sidebar。

Creator 当前核心：

- 今日推进；
- 内容库；
- 灵感库；
- 档期；
- 目标；
- 人工复盘；
- Creator JSON 备份；
- 右侧同一个 DSH 会话。

Creator 第一版不依赖 Screen Studio/macOS-only 工具/自动发布，扩展能力后续单独接 Capability。

## 3. Creator 数据真源

用户选择真实本地内容 Root。每条内容是普通文件夹：

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

Creator 自己的状态：

```text
<Desktop userData>/creator/
├── state.json
└── creator.log
```

`state.json` 只保存：

- ideas；
- schedule；
- goals；
- reviews；
- contentMeta；
- Creator settings。

不得把 `topic.md` / `script.md` 再复制一份到 state。

## 4. Creator 文件安全边界

`creator-core.js` / `creator-main.js` 当前要求：

- Root 必须通过 realpath 且为 directory；
- contentId 只能使用安全字符；
- path 必须仍位于 Root 的直接子目录；
- content directory 不允许 symlink；
- Editor 只允许 `topic.md` / `script.md`；
- editor target 不允许 symlink/non-file；
- 单个编辑文本上限 2 MiB；
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

`creator.html` 有本地 CSP，frame 只允许 loopback DSH。

## 5. Shared Runtime

Standard 与 Creator 都先执行：

```text
runtimeManager.patchDshSpawn()
prepareRuntimeBeforeBoot()
Runtime maintenance
bundled Web UI reconcile
```

然后才根据 mode 进入 Standard 或 Creator。

Creator 启动 DSH service 时继续使用随机 `127.0.0.1:0` 分配端口，不恢复固定 `3080` 信任。

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

v0.10.0 当前：

```text
Node.js 24.20.0 LTS x64 MSI
SHA-256 28b69132c35ccc033bf8f2a67cd10c9d75ef5822593363309da448f2afff2d8a

Git for Windows 2.55.0(5) x64 full installer
SHA-256 d065a4e23c3d9a6b5073d609b5be0830227ec3ca053c083ba385061ddfaf94c6
```

Node 24.20.0 是在 v0.10 CI 中由 live latest 门禁发现的上游更新，不得把 latest gate 关掉来继续使用旧 24.19.0。

安装仍为 per-machine：

- trusted Program Files 检测；
- 缺失时安装官方完整 Node/npm；
- 缺失时安装官方完整 Git/Bash/GUI/LFS；
- Machine PATH；
- 安装完成页首次启动可立即解析；
- DSH uninstall 不删除独立 Node/Git。

## 8. Desktop 签名政策

当前社区发行允许 DSH Desktop installer 自身 unsigned。

要求：

```text
NotSigned -> 允许社区 Release
Valid -> 可以继续验证已配置 Publisher
Invalid / HashMismatch / other invalid signature -> 拒绝
```

不能把 unsigned 说成“受信 Publisher”。Windows 可能显示 Unknown publisher / Windows protected your PC。

这不影响随包 Node.js/Git：它们仍必须验证官方 SHA-256 + Authenticode signer。

## 9. v0.10 CI 必须通过

正式 PR / Release 至少执行：

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
24. publish re-download/reverify

任一失败都应修问题后重跑，不允许把关键步骤改为 `continue-on-error` 来上线。

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
CHANGELOG.md
README.md
DEVELOPMENT_LOG.md
```

## 11. 后续建议

在 v0.10.0 正式 Release 成功之后，再进入下一版本：

- Creator optional capabilities：字幕、封面、发布、数据同步；
- Creator knowledge/rule/template 闭环；
- 更完整的 Creator installed E2E，而不只 packaged smoke；
- 插件 lifecycle-script 进一步收紧；
- GitHub main ruleset 强制 PR + required Windows build + CODEOWNERS；
- Windows 正式代码签名可作为未来发行增强，但不应阻塞当前社区版本。

Linux 继续不做正式发布链；macOS 暂不建立正式发行链。
