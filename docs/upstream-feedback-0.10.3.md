# 上游文档反馈材料（对照 victauri 0.10.3）

> 用途：整理 dsh-victauri 插件在「schema 三源对齐」审查中发现的**上游文档/实现不一致**，
> 形成可直接提交上游 issue 的反馈清单。措辞与格式沿用批四 4/6 上游反馈先例
> （客观陈述差异 + 双侧证据行号 + 建议修法，不夹带本插件实现偏好）。
> 证据来源：上游 tools-reference 文档（docs/src/tools-reference.md @ main，2026-11-05 抓取）、
> 上游 CHANGELOG（CHANGELOG.md @ main）、cargo registry `victauri-plugin-0.10.2` 源码、
> 本机活体 0.10.3 实例实测（demo-app，见 `pnpm smoke` 记录）。
> 本文件只整理反馈材料，**不代表已提交上游 issue**（上游提交需用户另行裁决）。

## 一、文档参数表缺口（tools-reference.md）

### 1. find_elements 参数表缺 4 个 0.10.3 新增参数

- **现象**：0.10.3 文档的 `find_elements` 参数表（tools-reference.md:154-181）只列
  `selector(alias css)` `text` `role` `webview_label` `test_id` `name` `tag`
  `placeholder` `alt` `title_attr` `label` `exact` `enabled` `max_results(默认10)`，
  **不含** `attribute` `attribute_value` `text_exact` `include_hidden`；
- **对照**：CHANGELOG 0.10.3 段明确「`find_elements` … 新增 `attribute`、
  `attribute_value`、`text_exact` and `include_hidden`」（CHANGELOG [0.10.3] 段），
  且 0.10.2 源码 `other_params.rs:166-198` 的 `FindElementsParams` 亦无四参
  （证明它们确为 0.10.3 新增）；
- **影响**：只读文档的工具集成方（MCP 客户端、agent）拿不到这四个参数的语义与
  默认值口径，无法安全使用；
- **建议**：在 0.10.3 文档参数表补齐四参及其语义（按 CHANGELOG 与实现行为：
  `attribute`/`attribute_value` 为属性过滤子串、`text_exact` 为文本精确匹配、
  `include_hidden` 为包含隐藏元素），或在参数表旁标注「另见 CHANGELOG 0.10.3」。

### 2. assert_semantic 的 condition 枚举文档落后于源码

- **现象**：0.10.3 文档（tools-reference.md:344-355）`assert_semantic` 的
  `condition` 枚举只列 7 值：`equals | not_equals | contains | greater_than |
less_than | truthy | falsy`；
- **对照**：`victauri-core-0.10.2/src/verification.rs:515-534` 的枚举为
  **9 值**（另有 `exists` 与 `type_is`），且本机活体 0.10.3 实例的工具描述
  （`GET /api/tools` 返回的 `assert_semantic.description`）同样列出
  `exists` / `type_is`；
- **影响**：按文档实现客户端校验会**误拒**两个合法条件值；
- **建议**：文档补齐 9 值枚举。

## 二、源码注释与文档/行为不一致（低优先级）

### 3. RouteBehavior::Fulfill 注释仍写 "XHR falls back to delay"

- **现象**：`victauri-plugin-0.10.2/src/mcp/compound_params.rs:626-633` 的
  `RouteBehavior::Fulfill` doc-comment 写「(fetch only; XHR falls back to
  delay)」；同版 `src/mcp/mod.rs:2724-2744` 的 route 工具描述写「fetch supports
  all behaviors; XHR supports block/delay (fulfill is fetch-only)」；
- **对照**：CHANGELOG 0.10.3 段写明「`route` fulfill 现在支持 XMLHttpRequest
  （逐事件与真实服务器对比，21 个场景）」；0.10.3 文档 route 段同样写
  「fetch and XHR support all behaviors: a fulfilled XHR never reaches the
  network」；
- **影响**：读 0.10.2 源码注释的集成方会低估 fulfill 能力（文档已正确，属
  源码注释滞后）；
- **建议**：0.10.3+ 源码同步更新该注释与工具描述句。

### 4. 0.8.8 工具描述中 Tauri IPC 口径过时（仅历史对照）

- **现象**：0.8.8 `src/mcp/mod.rs:2331-2346` 的 route 描述写「Tauri IPC
  (ipc.localhost) is OBSERVE-ONLY … no IPC-control tool」；
- **对照**：0.10.2/0.10.3 已支持对 IPC URL 的规则控制（fulfill 需
  `Tauri-Response: ok` 头、block 转 postMessage 驻留等）；
- **影响**：仅影响仍驻留 0.8.8 的用户；无行动建议，仅备忘。

## 三、行为复核确认无误的项（供上游确认，非缺口）

- `window.resize` / `window.move_to` 的「读回值 + `requested` + `settled:false`
  （约 500ms）」语义与本插件文档一致（tools-reference.md:542-543）；
- `storage.get_cookies` 仅返回非 httpOnly cookie（经 `document.cookie` 读取，
  0.10.2 `js_bridge.rs:1969-1970` 与文档 tools-reference.md:568 一致）；
- `explain.webview_label` 自 0.10.2 起 `ExplainParams` 支持（别名 `window`）；
  `fault.webview_label` 在 0.10.2 `FaultParams` 未定义、传入被静默忽略
  （全 crate 无 `deny_unknown_fields`）——与 0.10.x fallback schema 工具清单
  口径存在轻微出入，见下第四节。

### 4b. fault 工具 fallback schema 与实际参数结构不一致

- **现象**：0.10.x 的 MCP `tools/list`（fallback schema）给 `fault` 工具声明了
  `webview_label` 参数（本插件早期按该清单对齐）；但 0.10.2 源码
  `introspection_params.rs:119-142` 的 `FaultParams` **没有**该字段，传入被
  serde 静默忽略；
- **影响**：客户端按 fallback schema 传 `webview_label` 会「看起来成功但不生效」，
  无任何报错提示；
- **建议**：二选一——`FaultParams` 真正实现 `webview_label`（故障注入按窗口
  限定），或从 fallback schema 移除该参数声明，避免静默无效参数。

## 四、本插件已按以上口径自纠的项（无需上游动作，备忘）

- `verify_state` 补 `backend_args` 参数（上游 doc:234 有、本插件此前缺）；
- `animation.action` 移除上游已废弃的 `clear` 值（0.10.2
  `compound_params.rs:737-746` 无 Clear，文档 doc:1014 只列 list/scrub/sample）；
- `wait_for.condition` 扩为 10 值闭集（含 0.10.2 新增 `log`）；
- `invoke_command` 补 `timeout_ms` / `with_logs`；`find_elements` 补
  `title_attr` + 四个 CHANGELOG 新参；`logs`/`window` 动作枚举对齐 0.10.3。

---

_生成：dsh-victauri 批六 4/4（t-mw1vb6fs-mr2mul），2026-11-05。上游 issue 提交与否由用户裁决。_
