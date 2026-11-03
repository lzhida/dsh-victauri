# 工具清单（口径：35 victauri 工具 + 1 CLI 桥 + 1 CLI 探测 = 37 dsh 工具）

> 本文件与 README「工具清单」小节、`src/tools/standalone/catalog.ts` 头注释、
> `src/tools/contract.test.ts` 契约测试共用同一口径：
> **Victauri 全量 35 个工具**（standalone 20 + compound 15）+ **1 个 CLI 桥工具**
> + **1 个 CLI 探测工具**。
> 参数 schema 以 Victauri 官方 tools-reference 文档与本机 0.8.8 实测双重对齐，
> 每个工具 description 内以 `[实测]` / `[文档]` / `[桥]` 标注字段来源。

## standalone 批（20 个，victauri 名 1:1 映射 dsh `victauri_<name>`）

| #   | 工具                             | 用途                                           | 必填参数                         |
| --- | -------------------------------- | ---------------------------------------------- | -------------------------------- |
| 1   | `victauri_app_info`              | 应用信息（config/databases/env/paths/process） | —                                |
| 2   | `victauri_app_state`             | 注册 probe 的后端状态快照                      | —                                |
| 3   | `victauri_assert_semantic`       | 语义断言（evaluate + condition 校验）          | `expression`、`condition`        |
| 4   | `victauri_check_ipc_integrity`   | IPC 完整性（stale/errored call）               | —                                |
| 5   | `victauri_detect_ghost_commands` | 幽灵命令检测（无 handler 的调用）              | —                                |
| 6   | `victauri_dom_snapshot`          | DOM 快照（compact/json + stale refs）          | —                                |
| 7   | `victauri_eval_js`               | webview 内求值 JS                              | `code`（别名 `expression` 兼容） |
| 8   | `victauri_find_elements`         | 按 text/role/selector 搜元素                   | —                                |
| 9   | `victauri_get_diagnostics`       | 环境诊断（service worker/iframe/CSP）          | —                                |
| 10  | `victauri_get_memory_stats`      | OS 级进程内存统计                              | —                                |
| 11  | `victauri_get_plugin_info`       | Victauri 插件配置/端口/命令清单                | —                                |
| 12  | `victauri_get_registry`          | 注册命令目录（可按名过滤）                     | —                                |
| 13  | `victauri_invoke_command`        | 经 IPC 调用 Tauri 命令                         | `command`                        |
| 14  | `victauri_list_app_dir`          | 列应用数据/配置/日志目录                       | —                                |
| 15  | `victauri_query_db`              | 只读 SQL 查询 SQLite                           | `query`（别名 `sql` 兼容）       |
| 16  | `victauri_read_app_file`         | 读应用目录文件（text/base64）                  | `path`                           |
| 17  | `victauri_resolve_command`       | 自然语言匹配命令                               | `query`                          |
| 18  | `victauri_screenshot`            | 窗口截图（base64 → dsh 侧落盘返回路径）        | —                                |
| 19  | `victauri_verify_state`          | 前后端状态比对                                 | `frontend_expr`                  |
| 20  | `victauri_wait_for`              | 轮询等待条件（text/selector/url/ipc_idle…）    | `condition`                      |

## compound 批（15 个，`action` 参数选择子动作）

| 工具                  | action 枚举（必填）                                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `victauri_animation`  | `list` `scrub` `sample` `clear`                                                                                                                                                                                                        |
| `victauri_css`        | `inject` `remove`                                                                                                                                                                                                                      |
| `victauri_explain`    | `summary` `last_action` `diff`                                                                                                                                                                                                         |
| `victauri_fault`      | `inject` `list` `clear` `clear_all`                                                                                                                                                                                                    |
| `victauri_input`      | `fill` `type_text` `press_key`                                                                                                                                                                                                         |
| `victauri_inspect`    | `get_styles` `get_bounding_boxes` `highlight` `clear_highlights` `audit_accessibility` `get_performance`                                                                                                                               |
| `victauri_interact`   | `click` `double_click` `hover` `focus` `scroll_into_view` `select_option`                                                                                                                                                              |
| `victauri_introspect` | `command_timings` `coverage` `command_catalog` `contract_record` `contract_check` `contract_list` `contract_clear` `startup_timing` `capabilities` `db_health` `plugin_state` `processes` `plugin_tasks` `event_bus` `event_bus_clear` |
| `victauri_logs`       | `console` `network` `ipc` `navigation` `dialogs` `events` `slow_ipc` `clear`                                                                                                                                                           |
| `victauri_navigate`   | `go_to` `go_back` `get_history` `set_dialog_response` `get_dialog_log`                                                                                                                                                                 |
| `victauri_recording`  | `start` `stop` `checkpoint` `list_checkpoints` `get_events` `events_between` `get_replay` `export` `import` `replay` `flush`                                                                                                           |
| `victauri_route`      | `add` `list` `clear` `clear_all` `matches`                                                                                                                                                                                             |
| `victauri_storage`    | `get` `set` `delete` `get_cookies`                                                                                                                                                                                                     |
| `victauri_trace`      | `start` `stop` `status` `frames`                                                                                                                                                                                                       |
| `victauri_window`     | `get_state` `list` `manage` `resize` `move_to` `set_title`                                                                                                                                                                             |

复合工具只有 `action` 是必填 enum；其余参数按子动作可选、原样透传，子动作级校验由
victauri-plugin 端负责（本层不重复校验）。完整参数清单见各工具 description
（`src/tools/compound/catalog.ts`）。

## CLI 桥（1 个）

| 工具           | 子命令（action 枚举）                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| `victauri_cli` | `init` `check` `test` `record` `doctor` `watch` `invoke` `bridge` `coverage` |

## CLI 探测（1 个）

| 工具                 | 用途                                                                          | 参数                    |
| -------------------- | ----------------------------------------------------------------------------- | ----------------------- |
| `victauri_cli_status` | 探测本机 `victauri` CLI 可用性：版本号 + 实际命中路径 + CLI 子命令口径         | `refresh`（选填，布尔） |

返回字段：

| 字段              | 说明                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `status`          | `available`（可用）/ `not_found`（未安装或不在 PATH）/ `error`   |
| `version`         | 版本号（解析自 `--version` 输出；解析不出为 `null`）              |
| `version_output`  | `--version` 原始输出                                            |
| `cli_path`        | 实际命中的可执行文件绝对路径；未命中为 `null`                    |
| `requested_path`  | 本次请求解析到的路径（配置注入值或平台默认名）                    |
| `source`          | `config`（配置注入）/ `platform_default`（平台默认）             |
| `actions`         | CLI 子命令口径（同 `CLI_ACTIONS`：9 个）                         |
| `error`           | 失败时的结构化错误 `{kind, message, hint}`；`available` 时为 `null` |

- CLI 缺失时返回 `status=not_found`，`error.message` 与 `error.hint` 均含安装指引：
  `scoop install victauri` / `mise install victauri` / `cargo install victauri`；
- 配置项 `cliPath` 可注入自定义可执行文件路径（仅注入，不暴露给模型）；
- `cli_path` 为 **PATH 顺序下第一个实际命中**的可执行文件：同一台机器上可能与 `where.exe victauri` 的首条不同
  （例如 cargo 安装目录 `~/.cargo/bin` 优先于 mise shims），两条都是有效安装位置，不影响可用性判断；
- 探测只做「定位 + `--version`」两步，不执行任何 CLI 子命令；
- 结果默认缓存 60s，传 `refresh=true` 强制重新探测。

## 口径一致性

四处同源：README「工具清单」= 本文件 = `catalog.ts` 头注释（standalone 20，
全量 35 关系说明）= `standalone.test.ts`（从 `STANDALONE_TOOL_COUNT`、
`CLI_ACTIONS.length` 常量推导断言，不硬编码字面量）。
