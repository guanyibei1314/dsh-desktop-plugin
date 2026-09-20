# TypeSafe Creator 灵感评估

Creator 的灵感池支持一次性的 TypeSafe 评估。它读取一条灵感的标题、说明、内容类型、当前优先级和标签，返回三个可组合的 typed judgments：

- priority：Score，评估近期执行优先级；
- angle：Choice，选择一个主要内容角度；
- evidence：Noul，判断是否已有具体来源、案例、数据、问题或实验材料。

代码根据这些原始判断和置信度生成建议：建议推进、先补证据、需要人工判断或暂缓。建议只显示在界面上，不会自动升级灵感、创建目录、写入 topic.md / script.md 或改动档期。

## 配置

TypeSafe Key 只由 Electron 主进程读取：

    TYPESAFE_API_KEY=your_key_here

Windows PowerShell：

    $env:TYPESAFE_API_KEY = 'your_key_here'
    npm run start

不要把 Key 写入 package.json、Creator state.json、备份文件、preload 或 Renderer。若 Key 曾经出现在聊天、日志或终端录屏中，建议在 TypeSafe 控制台轮换后再使用。

## 运行与测试

没有配置 TYPESAFE_API_KEY 时，Creator 仍可离线使用；点击评估只会提示缺少配置，不会发送灵感内容。

本地回归测试：

    npm run test:typesafe

完整安全测试也会执行这个测试：

    npm run test:security-hardening

## 边界

- 请求固定发送到 https://api.typesafe.ai/v1/systemone，模型使用 jev-latest。
- TypeSafe 请求只在主进程发出；Renderer 只能调用 creator:idea:assess 这个窄化 IPC。
- 429 / 529 和网络失败最多按指数退避重试 3 次。
- 返回正文有 256 KiB 上限，并验证 Score、Choice、Noul 的完整字段和概率范围。
- 建议阈值是针对 Creator 工作流的保守起点，不能当成内容表现或商业结果保证；真正的推进仍由用户确认。

接口形状和问题设计以 [TypeSafe HTTP API](https://docs.typesafe.ai/api)、[State](https://docs.typesafe.ai/concepts/state)、[Choice](https://docs.typesafe.ai/primitives/choice) 和 [Score](https://docs.typesafe.ai/primitives/score) 为准。
