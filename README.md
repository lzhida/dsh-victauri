# dsh-victauri

[![CI](https://github.com/lzhida/dsh-victauri/actions/workflows/ci.yml/badge.svg)](https://github.com/lzhida/dsh-victauri/actions/workflows/ci.yml)

[dsh](https://github.com/lzhida/dsh-plugins-workspace)（DeepSeek Harness）插件：Victauri 桥接。

把 [Victauri](https://github.com/4da-systems/Victauri)（Tauri 应用内嵌的 MCP 服务器）暴露的 **35 个调试/测试工具**全量桥接为 dsh 原生工具，并桥接 `victauri` CLI 能力（check / test / doctor / coverage 等），让 dsh 会话具备 **Tauri 框架开发测试环境**。

## 工作原理

- **主通道 · REST 直连**：读取 Victauri discovery 目录（Windows `%TEMP%\victauri\<pid>\{metadata.json, port, token}`；类 Unix 按官方三级回退）拿到 `token` / `port`，直接 `POST /api/tools/{tool_name}` 执行工具，零中间层。
- **辅通道 · CLI 桥**：spawn 本机 `victauri` CLI（`check` / `doctor` / `test` / `coverage` 等子命令），补足 HTTP 面之外的工程能力。
- **连接惰性建立**：插件装载不做 discovery；首次工具调用才自动探活（`started_at` 最新优先），Tauri app 未启动不影响插件加载。

## 安装

### 方式一：link 安装（开发/本地，推荐）

```sh
# 在 dsh 工作区执行（--profile 须置于 plugin 之后；link: 后必须是绝对路径）
pnpm dsh plugin --profile test add link:E:\workspace\plugins\dsh-victauri
```

### 方式二：git 实体安装

```sh
pnpm dsh plugin --profile test add github:lzhida/dsh-victauri
```

本插件为**构建式发行**（`main` 指向 esbuild 产出的 `dist/index.js`，`prepare`/`prepack` 自动构建），git/npm 安装可直接使用。pnpm 对 git 依赖不装 devDependencies，构建依赖（esbuild）与运行时依赖均在 `dependencies`；若宿主 pnpm 拦截构建脚本，需在消费侧 `pnpm-workspace.yaml` 的 `allowBuilds` 放行 `esbuild`。

## 配置

| 字段               | 类型     | 默认    | 说明                                                                                                                                   |
| ------------------ | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `appIdentifier`    | string   | `''`    | 按 Tauri app bundle id 过滤实例（discovery `metadata.identifier`，对应 victauri bridge 的 `--app` 语义）；留空 = 自动选最新实例        |
| `portOverride`     | number   | 空      | 固定服务端口（须出现在 discovery 中）；留空 = 自动发现                                                                                 |
| `cliPath`          | string   | `''`    | `victauri` CLI 可执行文件路径；留空 = 平台默认（win32 为 `victauri.exe`）                                                              |
| `requestTimeoutMs` | number   | `30000` | REST 请求超时毫秒（`wait_for` 动态预算与 `trace`/`introspect` 声明预算 90s 可按工具覆盖，上限 120s，见 docs/TOOLS.md「请求超时语义」） |
| `disabledTools`    | string[] | `[]`    | 不注册的工具全名列表（`victauri_` 前缀全名）                                                                                           |

## 工具清单

Victauri 全量 **35 个工具** + 1 个 CLI 桥工具 + 1 个 CLI 探测工具 + 1 个工具发现工具 = **38 个 dsh 工具**：

- **standalone 批（20 个）**——单动作用途，参数 1:1 透传：
  `victauri_app_info` `victauri_app_state` `victauri_assert_semantic` `victauri_check_ipc_integrity` `victauri_detect_ghost_commands` `victauri_dom_snapshot` `victauri_eval_js` `victauri_find_elements` `victauri_get_diagnostics` `victauri_get_memory_stats` `victauri_get_plugin_info` `victauri_get_registry` `victauri_invoke_command` `victauri_list_app_dir` `victauri_query_db` `victauri_read_app_file` `victauri_resolve_command` `victauri_screenshot` `victauri_verify_state` `victauri_wait_for`
- **compound 批（15 个）**——复合工具，`action` 参数选择子动作：
  `victauri_animation` `victauri_css` `victauri_explain` `victauri_fault` `victauri_input` `victauri_inspect` `victauri_interact` `victauri_introspect` `victauri_logs` `victauri_navigate` `victauri_recording` `victauri_route` `victauri_storage` `victauri_trace` `victauri_window`
- **CLI 桥（1 个）**——`victauri_cli`：透传 `victauri` CLI 子命令（13 个：`init` / `check` / `test` / `record` / `doctor` / `watch` / `invoke` / `tools` / `call` / `bridge` / `coverage` / `run` / `logs`；`tools` / `call` 需 CLI ≥ 0.10.1，`run` / `logs` 需 ≥ 0.10.2，`invoke` 在 0.10.3 仍与 `call` 并存；上游另有 `setup` 与 clap 内置 `help`，本插件有意不接）；`doctor` 的 PASS/FAIL/WARN 明细额外解析进结构化输出（原始 stdout 始终保留，解析失败回退原文）；长驻子命令（`watch` / `bridge` / `run`，以及 `logs` 的 `--follow` 模式）须配合 `timeout_ms`，超时返回 `timed_out=true` + `partial=true` + 超时前已捕获的部分输出；`watch` = 递归监视测试目录的 `.rs` 变化并重跑**应用工程的** `cargo test`（与 `victauri test` 内置冒烟套件不是同一套测试；多轮效果应重复跑项目自身 `cargo test`，`test` / `coverage` 是活体 app 上的另一套、不能替代）；`bridge` = 面向第三方 MCP 宿主的 stdio→HTTP 代理（上游 CLI 无 `--http`/`--port`，HTTP 端点在 victauri app 进程内，本插件已有 REST 主通道直连同款工具，工具调用面与 bridge 所代理的同一套工具等价），在本通道仅作诊断性短时使用、拿不到 stdio 交互会话（跨 app 重启是**重建**后端会话，不是会话存活）；子命令提示按探测到的 CLI 版本门控（`doctor` 恒定提示**不提供** `--json`：0.8.8 实测报 unexpected argument，0.10.3 源码亦无该选项）。
- **CLI 探测（1 个）**——`victauri_cli_status`：探测本机 `victauri` CLI 可用性（版本号 + 实际命中路径 + 子命令口径）；CLI 未安装时返回 `status=not_found` 并附安装指引（scoop / mise / cargo install victauri），结果缓存 60s（`refresh=true` 强制重探）。命中路径取 **PATH 顺序下第一个实际命中**的可执行文件（可能与 `where.exe victauri` 首条不同，均为有效安装位置）。
- **工具发现（1 个）**——`victauri_tools_list`：只读查询服务端当前实际工具面（`GET /api/tools`），并把服务端清单与插件静态暴露面的**双向差异**以 `warnings` 告警呈现（`not_exposed`=服务端有而插件没暴露；`missing_on_server`=插件暴露而服务端没有），告警只提示不阻断；工具面保持静态注册，服务端新增工具不会自动变成 dsh 工具（详见 [docs/TOOLS.md](docs/TOOLS.md)「工具发现」）。

工具详情、必填参数与 compound `action` 枚举表见 [docs/TOOLS.md](docs/TOOLS.md)。

## 行为约定

- **错误不抛栈**：连接失败 / HTTP 错误 / 工具执行失败统一返回结构化 `{error: {kind, message, hint}}`，`hint` 含自检指引（启动 app → `victauri check` → 跑 demo-app 验证链路）。
- **图像结果落盘**：`victauri_screenshot` / `victauri_trace`（frames）/ `victauri_animation`（scrub `capture=true`）的 base64 图像统一落盘 `%TEMP%\dsh-victauri\`，单图返回 `{path, mime_type, bytes}`，多帧返回 `paths[]`，不占模型上下文（详见 [docs/TOOLS.md](docs/TOOLS.md)「图像结果通道」）。
- **按工具差异化超时**：`victauri_wait_for` 请求预算 = `timeout_ms` + 5s 余量，`victauri_trace` / `victauri_introspect` 固定 90s 声明预算（上限 120s）；其余工具沿用 `requestTimeoutMs`（默认 30000）不变（详见 [docs/TOOLS.md](docs/TOOLS.md)「请求超时语义」）。
- **工具面差异告警**：服务端新增工具**不会**自动注册为 dsh 工具（工具面静态，避免 schema 契约漂移）；用 `victauri_tools_list` 查差异，`not_exposed` 说明插件版本落后于服务端，需升级插件后才能调用新工具。
- **别名兼容**：`victauri_eval_js`（`code`/`expression`）与 `victauri_query_db`（`query`/`sql`）双命名兼容，以实测名优先；别名键不透传服务端。
- **后端日志三段式（0.10.2 起）**：`victauri_invoke_command` 传 `with_logs=true` 拿 `backend_log_cursor` → `victauri_wait_for` 传 `condition:'log'` + `since_seq:<cursor>` 阻塞到匹配的后端行（`level` / `fields` 过滤，匹配脱敏后文本）→ `victauri_logs` `action='backend_digest'` 摘要盘点；`since_seq` 为向前分页游标（返回游标之后最旧的条目）。
- **任意 JSON 值参数**：`victauri_assert_semantic` / `victauri_wait_for` 的 `expected` 与 `victauri_storage` 的 `value` 接受任意 JSON 值（数值/对象/数组/布尔/`null`），透传时**不字符串化**（详见 [docs/TOOLS.md](docs/TOOLS.md)「任意 JSON 值参数」）。
- **元素查找 0.10.3 新参**：`victauri_find_elements` 支持 `title_attr` / `attribute` / `attribute_value` / `text_exact` / `include_hidden`（true 才返回隐藏元素）；同版本起可访问名与 visible/enabled 为诚实计算值。
- **数组包装**：顶层数组结果包装为 `{items: [...]}`（dsh 工具契约要求顶层 object）；上游 victauri 的 `logs` 部分动作返回的是裸数组（bare array），读结果先取 `items`（详见 [docs/TOOLS.md](docs/TOOLS.md)「数组结果的形状」）。
- **版本兼容**：参数 schema 以 victauri 0.10.3（官方文档 + CHANGELOG）为基线，与 0.8.8（本机桥实测）及 0.10.2（cargo registry 源码）双源核对对齐，字段级差异在工具 description 内以 `[实测]` / `[文档]` / `[源码]` / `[桥]` 标注。

## 故障排查

| 现象                            | 处置                                                                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 工具返回 `no-live-instance`     | Tauri app 未启动或未接入 victauri-plugin：以 **debug 构建**启动 app（release 构建的 victauri 桥是 no-op）并确认 `Builder.plugin(victauri_plugin::init())` 已接入                                                                                                |
| 工具返回 `no-instance`          | discovery 目录无记录：确认 app 以 victauri-plugin 启动过；多实例/多 app 时配置 `appIdentifier` 或 `portOverride` 收敛目标                                                                                                                                       |
| `auth`（401/403）/ `http-error` | token 失效（app 重启后 discovery 更新）或实例退出：auth(401/403)、网络层失败与连接失败会**自动重置缓存**并在下次调用重新发现（读到新 token/port）；`invalid-params`(400)/`not-found`(404)/`rate-limited`(429)/5xx/超时/工具级失败不复位（服务在线，复位无意义） |
| `cli-error`（CLI 桥）           | `victauri` CLI 不在 PATH：先跑 `victauri_cli_status` 看探测结论；再配置 `cliPath` 指向可执行文件或按提示 `scoop install victauri` / `mise install victauri` / `cargo install victauri`                                                                          |
| 注册的工具偏多                  | 配置 `disabledTools` 列出不需要的工具全名                                                                                                                                                                                                                       |

## 开发

```sh
pnpm install     # 安装依赖（prepare 自动构建 dist）
pnpm test        # vitest（含契约测试：38 工具名唯一/数量口径/action 枚举/静态注册）
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm build       # esbuild 产出 dist/index.js
pnpm smoke       # demo-app 本地冒烟（半自动 e2e，见下）
```

内置 e2e demo Tauri app 见 [demo-app/](demo-app/)（开发测试链路用，不进 CI）。

### 本地冒烟（`pnpm smoke`）

`pnpm smoke` 一条命令跑完 demo-app 的半自动 e2e：构建 demo-app（`cargo build --features victauri`）
→ 启动 → 轮询 discovery 就绪 → 经 REST 主通道冒烟 10 项检查 → PASS/FAIL 摘要 → 结束进程树。
覆盖 6 个核心工具（`get_plugin_info` / `app_info` / `eval_js` / `dom_snapshot` / `invoke_command` / `logs`）
与 `/health`、`/info`、`/api/tools` 三个端点，含「无 token → 401」认证闸门检查。

- **边界：不进 CI**。需要 Rust 工具链（cargo）、会真的拉起一个 Tauri 窗口，并依赖本机
  `%TEMP%\victauri` discovery 目录——与 [demo-app/README.md](demo-app/README.md) 的现状决策一致。
- 退出码：`0` 全部通过 / `1` 有检查失败 / `2` 前置条件或环境不满足。
- 可调环境变量：`SMOKE_SKIP_BUILD=1`（跳过构建）、`SMOKE_BUILD_TIMEOUT_MS`（默认 600000）、
  `SMOKE_DISCOVERY_TIMEOUT_MS`（默认 60000）、`SMOKE_REQUEST_TIMEOUT_MS`（默认 20000）、
  `SMOKE_SELFTEST=1`（追加一项故意失败的检查，用于验证失败路径退出码）。
- 端口顺延：脚本从 discovery 的 `port` 文件读实际端口（默认 7373，被占时服务端顺延到下一个空闲端口，
  如 7374），不硬编码端口。

发布相关（publish workflow 草案与启用清单）见 [docs/release.md](docs/release.md)：
仓库当前**未启用发布**，启用前需按该清单逐项确认发布目标与 `main` 分支策略。

## License

MIT © lzhida
