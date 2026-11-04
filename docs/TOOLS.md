# 工具清单（口径：35 victauri 工具 + 1 CLI 桥 + 1 CLI 探测 = 37 dsh 工具）

> 本文件与 README「工具清单」小节、`src/tools/standalone/catalog.ts` 头注释、
> `src/tools/contract.test.ts` 契约测试共用同一口径：
> **Victauri 全量 35 个工具**（standalone 20 + compound 15）+ **1 个 CLI 桥工具**
>
> - **1 个 CLI 探测工具**。
>   参数 schema 以 Victauri 官方 tools-reference 文档与本机 0.8.8 实测双重对齐，
>   每个工具 description 内以 `[实测]` / `[文档]` / `[桥]` 标注字段来源。

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
| 18  | `victauri_screenshot`            | 窗口截图（通用图像通道落盘返回路径）           | —                                |
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

## 图像结果通道（通用落盘）

任何工具返回 `{data, mimeType}` 形态的图像值（顶层对象或含此类值的多块数组）
都在 JSON 文本渲染（6000 字符截断，`renderJson`）**之前**分流落盘
`%TEMP%\dsh-victauri\`，避免 base64 撑爆上下文或被截成残串：

- 覆盖范围：`victauri_screenshot`（单图）、`victauri_trace` `action=frames`
  （多帧多文件）、`victauri_animation` `action=scrub` + `capture=true`
  （帧落盘，filmstrip/manifest 元数据合并回结果）；standalone 与 compound
  两个批共用同一通道（识别逻辑在 `src/tools/standalone/image.ts`）。
- 返回形状：单图 `{path, mime_type, bytes}`；多帧返回 `paths[]` +
  `mime_type`（首图）+ `count`；`scrub` 的 meta JSON 字段原地合并
  （`filmstrip.manifest[]`、`curve[]` 等照常可读）。
- 命名：`<前缀>-<时间戳>[-<序号>].<扩展名>`——`screenshot-<ts>.png`
  保持历史命名不变；多帧序号 `-001` 起，顺序 = 响应内顺序，扩展名由
  mimeType 推导（png/jpg/svg/…，未知兜底 `bin`）。
- 数量上限：单次调用最多落盘 `IMAGE_SAVE_MAX = 120` 个文件
  （与 filmstrip 硬上限同值）；超出部分计入 `dropped` 并在 `note` 注明，
  不静默丢弃。
- 非 `image/*` mimeType（如音频）同通道落盘，但会在 `note` 注明未经
  活体验证；落盘失败时回退原文返回（数组包成 `{items}`）并附
  `image_save_error`，不吞错。

## CLI 桥（1 个）

| 工具           | 子命令（action 枚举）                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| `victauri_cli` | `init` `check` `test` `record` `doctor` `watch` `invoke` `bridge` `coverage` |

子命令口径的**唯一事实源**是 `src/cli-hints.ts` 的 `CLI_ACTION_SPECS`
（键 = 子命令名，值 = 语义 + 行为标记 + 版本门控提示）；`CLI_ACTIONS`、
工具参数 `action` 的 enum、提示文案全部由它派生——**新增子命令只改这一处**
（一致性由 `src/cli-hints.test.ts` 断言：规格表键序 = `CLI_ACTIONS` = 工具 enum）。

参数：

| 参数         | 必填 | 说明                                   |
| ------------ | ---- | -------------------------------------- |
| `action`     | 是   | 子命令名（enum，见上表）               |
| `args`       | 否   | 透传给子命令的参数列表（不含子命令名） |
| `timeout_ms` | 否   | 子进程超时毫秒（默认 120000）          |
| `cwd`        | 否   | 子进程工作目录（默认继承宿主）         |

返回字段：

| 字段          | 说明                                                                         |
| ------------- | ---------------------------------------------------------------------------- |
| `action`      | 实际执行的子命令                                                             |
| `exit_code`   | 退出码；`null` = 超时强杀或被信号终止                                        |
| `stdout`      | 标准输出全文                                                                 |
| `stderr`      | 标准错误全文                                                                 |
| `timed_out`   | 是否因超时被终止                                                             |
| `partial`     | 是否只捕获到部分输出（超时强杀或输出被截断）                                 |
| `cli_version` | 探测到的 CLI 版本；`null` = 未探测到（此时不给版本门控提示）                 |
| `hints`       | 该子命令的版本感知提示 `{summary, notes[], long_running, interactive}`       |
| `doctor`      | `doctor` 子命令的结构化报告；非 doctor 子命令或两路都识别不到报告时为 `null` |

### 结构化输出（doctor）

- `doctor` 的文本报告会**额外**解析成结构化对象放进 `doctor` 字段：
  - `summary`：`Summary:` 行原文；`passed` / `total` / `failed` / `warnings`：计数；
  - `checks[]`：逐条明细 `{status: PASS|FAIL|WARN, message, detail}`，
    `detail` 取明细行的缩进续行（无则 `null`）；
- 原始文本**始终保留**（`stdout` / `stderr` 原样带回），解析不吞内容；
- 解析顺序为**先 `stdout`、再 `stderr`**：0.8.8 实测报告全文写在 `stderr`
  （`stdout` 为空串），0.10 起的文档口径是写在 `stdout`，两路都试；
- 两路都识别不到报告时（如 CLI 报 `error: unexpected argument '--json' found`）
  `doctor` 为 `null`，由调用方回退看 `stdout` / `stderr` 原文。

### 长驻子命令（watch / bridge）

- `watch` / `bridge` **不会自行退出**，必须显式传 `timeout_ms`；
- 超时会 kill 子进程，返回 `timed_out=true`、`partial=true`，
  `stdout` / `stderr` 是**超时前已捕获的部分输出**；
- 两者都标记 `interactive=false`：`bridge` 是 stdio MCP 代理，本通道（等退出模型）
  拿不到 stdio 交互会话，只适合短时诊断。

### 版本感知提示（hints）

- `hints.notes` 按**探测到的 CLI 版本**过滤；版本未知（`cli_version=null`）时
  一律不给版本门控文本（保守不外推）；
- 例：0.8.8 实测 `doctor` 不接受 `--json`（报 `error: unexpected argument
'--json' found`），因此 0.8.8 下的提示只说明「CLI 侧结构化输出选项需 0.10.0
  起才提供」，不建议使用该选项；0.10.0 起才提示该选项可用。

### cwd 用法

- `doctor` 需在 **Tauri 项目根（含 `Cargo.toml`）**执行，否则报告全 `FAIL`
  （仓根执行实测：`[FAIL] No Cargo.toml found in current directory`），
  用 `cwd` 指定项目根。

## CLI 探测（1 个）

| 工具                  | 用途                                                                   | 参数                    |
| --------------------- | ---------------------------------------------------------------------- | ----------------------- |
| `victauri_cli_status` | 探测本机 `victauri` CLI 可用性：版本号 + 实际命中路径 + CLI 子命令口径 | `refresh`（选填，布尔） |

返回字段：

| 字段             | 说明                                                                |
| ---------------- | ------------------------------------------------------------------- |
| `status`         | `available`（可用）/ `not_found`（未安装或不在 PATH）/ `error`      |
| `version`        | 版本号（解析自 `--version` 输出；解析不出为 `null`）                |
| `version_output` | `--version` 原始输出                                                |
| `cli_path`       | 实际命中的可执行文件绝对路径；未命中为 `null`                       |
| `requested_path` | 本次请求解析到的路径（配置注入值或平台默认名）                      |
| `source`         | `config`（配置注入）/ `platform_default`（平台默认）                |
| `actions`        | CLI 子命令口径（同 `CLI_ACTIONS`：9 个）                            |
| `error`          | 失败时的结构化错误 `{kind, message, hint}`；`available` 时为 `null` |

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

CLI 子命令口径另有一处同源：`src/cli-hints.ts` 的 `CLI_ACTION_SPECS` =
`CLI_ACTIONS` = 工具参数 enum = 本文件「CLI 桥」表（由
`src/cli-hints.test.ts` 断言）。
