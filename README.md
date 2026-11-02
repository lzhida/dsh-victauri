# dsh-victauri

[dsh](https://github.com/lzhida/dsh-plugins-workspace) 插件：Victauri 桥接。

把 [Victauri](https://github.com/4da-systems/Victauri)（Tauri 应用内嵌的 MCP 服务器）暴露的 **35 个调试/测试工具**全量桥接为 dsh 原生工具，并桥接 `victauri` CLI 能力（check / test / doctor / coverage 等），让 dsh 会话具备 **Tauri 框架开发测试环境**。

## 工作原理

- **主通道 · REST 直连**：读取 Victauri discovery 目录（`%TEMP%\victauri\<pid>\`）拿到 `token` / `port`，直接 `POST /api/tools/{tool_name}` 执行工具，零中间层。
- **辅通道 · CLI 桥**：spawn 本机 `victauri` CLI（`check` / `doctor` / `test` / `coverage` 等子命令），补足 HTTP 面之外的工程能力。

## 工具清单

Victauri 全量 **35 个工具** + 1 个 CLI 桥工具 = **36 个 dsh 工具**：

- **standalone 批（20 个）**——单动作用途，参数 1:1 透传：
  `app_info` `app_state` `assert_semantic` `check_ipc_integrity` `detect_ghost_commands` `dom_snapshot` `eval_js` `find_elements` `get_diagnostics` `get_memory_stats` `get_plugin_info` `get_registry` `invoke_command` `list_app_dir` `query_db` `read_app_file` `resolve_command` `screenshot` `verify_state` `wait_for`
- **compound 批（15 个）**——复合工具，`action` 参数选择子动作：
  `animation` `css` `explain` `fault` `input` `inspect` `interact` `introspect` `logs` `navigate` `recording` `route` `storage` `trace` `window`
- **CLI 桥（1 个）**——`victauri_cli`：透传 `victauri` CLI 子命令（`init` / `check` / `test` / `record` / `doctor` / `watch` / `invoke` / `bridge` / `coverage`）。

工具详情与参数 schema 见 [docs/TOOLS.md](docs/TOOLS.md)。

## 状态

🚧 0.1.0：脚手架 + 连接层 + CLI 桥 + standalone 批（20）已落地；compound 批（15）、配置面与 demo-app 进行中。

## License

MIT © lzhida
