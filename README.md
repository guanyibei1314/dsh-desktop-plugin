# DSH Desktop

类似 **codex 桌面端** 的 DeepSeek Harness 原生桌面客户端：

- **独立原生窗口**加载运行中的 DSH Web 客户端（默认 `http://127.0.0.1:3080`），不依赖浏览器
- **原生菜单**：主题切换（跟随系统 / 亮色 / 暗色，直接写入 harness 的 `ui-theme` 设置并即时生效）、视图缩放、打开设置文档、关于
- **托盘图标**：实时显示运行中的会话数量，点击显示窗口；关窗自动隐藏到托盘
- **系统通知**：订阅 harness 的 `/api/events.host` 事件流——回合结束、代理出错时弹出通知
- **容错**：服务未启动时显示重试页（每 5 秒自动重试）；DSH 重启后事件流自动重连

## 运行

```bash
npm install        # 首次
npm start          # 启动桌面应用
```

可选参数：

```bash
DSH_URL=http://127.0.0.1:3080 npm start   # 自定义服务地址
npm start -- --url=http://127.0.0.1:3080  # 同上（命令行方式）
npm run smoke                              # 冒烟测试：加载成功则退出码 0
```

## 结构

| 文件 | 说明 |
| --- | --- |
| `main.js` | 主进程：窗口 / 菜单 / 托盘 / SSE 通知 / 主题 API |
| `preload.js` | 仅错误页使用的桥接（`retry` / `quit`） |
| `error.html` | 服务未运行时的重试页 |
| `assets/` | 生成的图标（`tray.png` 32×32、`icon.png` 256×256） |
| `scripts/make-icon.js` | 图标生成器（纯 Node，SDF 绘制，无依赖） |

## 桌面集成说明

- **主题**：通过 `POST /api/settings.update` 写入 `ui-theme.preference`，页面内的主题服务订阅设置变更后即时生效，与网页端改动完全一致
- **通知**：订阅 `GET /api/events.host`（SSE），监听 `host/session-status` 的 running 翻转与 `host/agent-error`
- **托盘状态**：`POST /api/session.list` 轮询（20 秒）+ SSE 实时推送双重保障
- **打包**：目前以 `npm start` 运行；如需安装包，可后续接入 `electron-builder`（`npx electron-builder --win nsis`）

## 与浏览器 TUI 面板插件的关系

工作区同名的动态 Cordis 插件（`tuip-1`「Codex TUI Panel」）是浏览器 Web GUI 内的会话视图标签页；本桌面应用是独立的原生窗口外壳。两者互补：桌面窗口内同样可以看到该插件注册的「TUI」标签页（动态插件按浏览器页面激活）。
