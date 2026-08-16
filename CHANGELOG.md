# Changelog

## 0.4.0 — 2026-08-16

- 新增内置插件安装、升级、卸载环境：内置 pnpm 11.17.0，使用 DSH `web` Profile 对账语义，不依赖系统 Node.js / pnpm。
- 新增安全隔离的内置浏览器：基于 Electron `BaseWindow + WebContentsView`，远程网页无 Node / Electron bridge，使用独立持久化会话。
- 新增 Sites：将常用 Web 工具保存为独立桌面工作区，每个 Site 使用独立持久化浏览器分区。
- 保留原有 DeepSeek Harness 主界面、会话、托盘、内置 xterm / node-pty 终端等功能。
- 插件管理 IPC、浏览器工具栏 IPC、Sites IPC 分别隔离并校验发送者；插件输入限制为 npm Registry 包名与受限版本格式。
- Windows x64 包裁除不参与当前运行时的 pnpm artifacts、ARM64 PTY 预编译与 node-pty 构建素材。
- 新增 packaged runtime closure、x64 PTY closure、打包后 EXE smoke、打包后 pnpm / DSH plugin E2E、安装包体积审计。
- GitHub Release 发布改为从 `package.json` 自动读取版本，不再覆盖旧版本标签。

### PR 验证基线

PR #2 最终 Windows 构建：`126,499,001 bytes = 120.64 MiB`。相对 v0.3.0 的 `125,949,889 bytes ≈ 120.12 MiB`，新增上述能力后仅增加约 `0.52 MiB`。
