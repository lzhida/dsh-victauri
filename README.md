# dsh-victauri

[dsh](https://github.com/lzhida/dsh-plugins-workspace) 插件：Victauri 桥接。

把 [Victauri](https://github.com/4da-systems/Victauri)（Tauri 应用内嵌的 MCP 服务器）暴露的 **35 个调试/测试工具**全量桥接为 dsh 原生工具，并桥接 `victauri` CLI 能力（check / test / doctor / coverage 等），让 dsh 会话具备 **Tauri 框架开发测试环境**。

## 工作原理

- **主通道 · REST 直连**：读取 Victauri discovery 目录（`%TEMP%\victauri\<pid>\`）拿到 `token` / `port`，直接 `POST /api/tools/{tool_name}` 执行工具，零中间层。
- **辅通道 · CLI 桥**：spawn 本机 `victauri` CLI（`check` / `doctor` / `test` / `coverage` 等子命令），补足 HTTP 面之外的工程能力。

## 状态

🚧 脚手架阶段（0.1.0），工具桥接尚未实现。

## License

MIT © lzhida
