# dsh-victauri 插件能力审查：六面差距清单

> 基线：victauri 0.10.3（官方 tools-reference + CHANGELOG）为口径基线，与本机 0.8.8 实测、
> cargo registry 0.10.2 源码三源核对。证据标注：`文件:行号`（本仓库）、`上游 出处`
> （ Victauri 仓库）、`复现`（ 可执行命令）。审计日期 2026-11-05；素材来源
> `.agents/tmp/audit-tools-surface.md`（A/B 面）、`.agents/tmp/audit-contract-robustness.md`
> （ C/D 面）与本会话 E/F 面采集。严重度：🔴 高 / 🟡 中 / 🟢 低。

## 面 1：工具面覆盖度

上游 0.10.3 共 35 个 MCP 工具（standalone 20 + compound 15），插件 1:1 全暴露，另有 3 个插件自有
（victauri_cli / victauri_cli_status / victauri_tools_list）合计 38。已过期枚举 1 处：

- 🟡 **P1-1 verify_state 缺 `backend_args` 参数**——src/tools/standalone/catalog.ts:358-369 未声明；
  上游 tools-reference.md:234 与 victauri-plugin-0.10.2/src/mcp/verification_params.rs:16
  `pub backend_args: Option<serde_json::Value>`；桥把 catalog schema 原样下发
  （src/tools/standalone/bridge.ts:99,137），未声明即模型传不出该参数。
- 🟡 **P1-2 animation.action 残留已废弃值 `clear`**——src/tools/compound/catalog.ts:94 仍列 4 值
  （list/scrub/sample/clear）；上游 0.10.3 tools-reference.md:1014 只列 list/scrub/sample（clear 是
  sample 的参数 clear:true）、0.10.2 compound_params.rs:737-746 无 Clear 枚举；0.8.8 仍有。
  基线已声明 0.10.3 → 应移除并对 0.8.8 标注兼容说明。
- 🟢 **P3-3 assert_semantic.condition 9 值是上游文档落后于源码**（doc:344-355 只列 7；
  victauri-core-0.10.2/src/verification.rs:515-534 为 9 含 exists/type_is）——插件已正确覆盖 9 值，
  **勿回灌**，仅记录。
- 🟢 **P3-5 工具数口径**：38（dsh 工具）与 35（上游 MCP 工具）在 docs/TOOLS.md 与 README 混用，
  需在口径处显式解耦（35 = 上游 1:1；38 = 35 + 3 插件自有）。
- ✅ 批六 4/4 已产出上游文档缺口反馈材料 docs/upstream-feedback-0.10.3.md（find_elements 参数表缺
  四新参、assert_semantic 文档 7 值 vs 源码 9 值、RouteBehavior 注释 fetch-only 过时、fault fallback
  schema 声明 webview_label 但 FaultParams 无此字段）；上游 issue 提交与否由用户裁决。

## 面 2：schema 三源对齐

- 🟢 **P2-4 eval_js.expression 别名误标 [文档]**——src/tools/standalone/catalog.ts:154-155,161-163
  标注 [文档]，但 0.10.3 doc:106-138 与 0.10.2 webview_params.rs:7-9 均只有 code，无 expression。
  应改标 [桥]/[实测]（本地归一实现 src/tools/standalone/bridge.ts:47-52）。
- 🟢 **P2-5 query_db.sql 别名同样误标 [文档]**——src/tools/standalone/catalog.ts:306；两源均只有 query。
- 🟢 **P2-3 find_elements 四新参（attribute/attribute_value/text_exact/include_hidden）为 CHANGELOG 单源**
  ——CHANGELOG 0.10.3:59-60 有、0.10.3 文档参数表与 0.10.2 源码均无；标注已是 [CHANGELOG]，
  属正确单源标注，仅记录证据强度。

## 面 3：契约与错误语义

- 🔴 **S-1 上游工具级失败被当成功透出，插件错误信封失效**——上游 rest.rs 口径：工具级失败即
  HTTP 200 + `{"error": msg}`；插件 src/client.ts:122-127（响应无 result 键→原样返回）+
  src/tools/standalone/bridge.ts:137,141（错误信封只在 catch 路径生效）。复现：假上游返回
  `{"error":"eval timed out after 30s"}` → 工具返回裸字符串，无 kind/hint，与 docs/TOOLS.md:318/344/346
  承诺的 `{kind,message,hint}` 不符。**修复方向**：client/bridge 层识别 `error` 键响应并归一为
  VictauriError 信封。
- 🟡 **M-1 kind 词汇表缺 auth/not-found/rate-limited/invalid-params**——src/errors.ts:33-47 仅 7 值；
  src/client.ts:106-112 把 400/401/403/404/429 同归 http-error 且丢弃 VictauriHttpError.status
  （errors.ts:55-68 实际持有 status）。
  **【2026-11-05 归属澄清，批九 3/3】** M-1 与 backlog-A（t-mw2eut5k-6k1elc）的 S-1（上游工具级
  失败裸错误、错误信封失效）/ S-2（客户端永不失效、401 不重发现）**同属错误信封与客户端语义
  改造**：三者都要动 `src/client.ts` 与 `src/tools/standalone/bridge.ts`，并行实施会同文件双写。
  故 **M-1 并入 backlog-A 的设计范围**（错误 kind 映射表本来就要在 backlog-A 出），
  本轮**不实施**。另注：三套 kind 词汇表（REST 桥接 / CLI 探测 / 工具发现）的**语义域边界**
  已在批九 3/3 补注释与文档（`docs/TOOLS.md` 新增「错误 kind 的三套词汇表」一节），
  那是**说明性澄清**，不改变任何运行时取值，也不解决 M-1 本身。
- 🟡 **M-2 {items} 数组包装仅 find_elements 一处说明**——实现 src/tools/standalone/bridge.ts:81-85
  对所有数组生效（实测 get_registry/logs/recording/trace/route/window/fault/animation 全产出
  {"items":[...]}）；上游 tools-reference.md:735 明写 logs 返回 bare array。相关 backlog 卡
  t-mw1ri0ep-8vw7ql（{items} 包装透传实施）已由用户裁定不自动执行——此处仅补描述层说明。
- 🟡 **M-3 多内容块与普通数组同形不可区分**——bridge.ts:82 统一包装；上游多块为
  `{"result":[{type:"text"|"image"}]}`。
- 🟡 **M-4 未知参数静默透传**——src/tools/standalone/json-value.ts:33-41；复现：body 实收
  `{"totally_unknown_key":1}`；bridge.ts:112 注释「服务端拒未知字段」仅对 2 条登记别名生效。
- 🟡 **M-6 上游正式别名未接**——window/window_label、checkpoint_label（上游 tools-reference 行 13/607）；
  插件别名表仅 eval_js/query_db 两条（src/tools/standalone/bridge.ts:47-52）。
- 🟢 **L-1 cli_status 的 kind 词汇表与 errors.ts 不统一**——src/tools/cli-status.ts:65-69。
  **【2026-11-05 澄清，批九 3/3】** 二者**语义域不同、不是同一层**：cli_status 的
  not_found/cli-error/timeout 属「CLI 探测域」（CLI 装没装、跑不跑得起来），
  errors.ts 的 7 值属「REST 桥接错误信封」（调用失败的原因）。二者不互通、不可按名字等价
  比较。已补源码注释 + `docs/TOOLS.md` 新增「错误 kind 的三套词汇表」一节说明边界；
  **不合并两套词汇表**（合并会丢失语义分层，且需改运行时取值）。
- 🟢 **L-11 上游 REST 30s/2MiB deadline 表现为 http-error 而非 timeout**。

## 面 4：健壮性

- 🔴 **S-2 连接成功后客户端永不失效，401 不触发重发现**——src/index.ts:96-103（成功后 promise 永久
  缓存）+ src/client.ts:20-29（token/port readonly）+ src/client.ts:106-112（401 无处理）。复现：
  discovery 写入新 token 后 call#2/#3 仍 401。README.md:73 自称「连接失败会重置缓存」与实现不符
  （失败会重置，成功永不失效）。上游 0.10.3 起 /info 报告 pid 供 stale discovery 重判。
  **修复方向**：401/连接错误时复位 clientPromise + discovery 重扫。
- 🟡 **M-5 eval 类无 per-tool 超时旋钮，固定 30s**——standalone 20 + compound 15 中除
  wait_for/introspect/trace 外均未设 requestBudgetMs（字段 src/tools/standalone/catalog.ts:41）；
  上游 configuration.md：eval 默认 30s 可配至 300s（MAX_EVAL_TIMEOUT_SECS=300 + VICTAURI_EVAL_TIMEOUT）
  → app 端调大后插件 30s 即放弃且服务端仍在跑。
- 🟡 **M-7 discovery 不校验 PID 存活、不核对 /info pid**——src/discovery.ts:81-108,143-188（:178-179
  目录名当 pid）、:194-210；src/client.ts:68-74 只校验是对象；复现：pid=999999 仍被接受。
- 🟡 **M-8 客户端超时只中止本地 fetch 不取消服务端执行**——src/client.ts:166-167,181-183；超时后
  副作用已发生，重试即重复副作用（fault inject 类工具尤甚）。
- 🟡 **M-9 大响应先全量进内存再截断**——src/client.ts:105 `response.text()` 全量；截断只在渲染层
  （src/tools/standalone/render.ts:9,12-24）；上游 trace 单次可达 25MB。
- 🟡 **M-10 CLI 子进程只 kill 一次、无 SIGKILL 升级、不杀子孙进程、timeout_ms 无上限**——
  src/cli.ts:102-105；src/tools/cli.ts:99-102（仅 type:'integer'）、:277 宿主 300s；timeout_ms=3600000
  时宿主放弃、子进程继续跑。
- 🟢 **L-3 wait_for 预算被 120s 硬夹**——src/tools/standalone/timeout.ts:17,30-52。
- 🟢 **L-4 trace/introspect 固定 90s**——src/tools/compound/catalog.ts:270,494。
- 🟢 **L-7 animation points 默认 20 与上游文档 6 不一致**——src/tools/compound/catalog.ts:105。
  **【2026-11-05 改判，批九 3/3】** 本条**不是插件缺陷**：上游 markdown 文档写 default 6
  （tools-reference.md:1012，示例 :1025 也用 6），而上游 **schema doc-comment 与实现**
  写 20——0.10.2 `compound_params.rs:767-768` / 0.10.3 `:771-772` 为「Default 20,
  clamped to 2..=120」，0.10.3 `mod.rs:3551` 实现为 `unwrap_or(20).clamp(2, 120)`。
  插件跟的是 schema/实现口径（20），**改成 6 反而错**。插件描述已加注该矛盾与取舍依据
  （批九 1/3，提交 71112e7）；上游文档/实现矛盾已写入 `docs/upstream-feedback-0.10.3.md`
  第 6 条。本条从「插件待修项」改判为「上游口径矛盾，已在上游反馈材料登记」。
  **证据强度说明**：schema/实现侧行号与数值**已在本机 cargo registry 逐条复核**；
  文档侧行号（:1012 / :1025）来自上游文档引用，本机无副本，**未本地复核**。
- 🟢 **L-9 CLI stdout 上限按字符计（非字节）可略超 512KB**——src/cli.ts:10,78-91。
- 🟢 **L-10 图像落盘无字节上限**——src/tools/standalone/image.ts:26,82-97。

## 面 4.5：功能性缺陷（渲染层，横跨契约与教学面）

- 🔴 **S-3 renderJson 只截头 6000 字符，with_logs 的 backend_log_cursor 被丢弃**——
  src/tools/standalone/render.ts:9-21（`text.slice(0, RENDER_MAX_CHARS)`）+
  src/tools/standalone/bridge.ts:102（output.render=renderJson）。复现：构造
  `{result, backend_logs(120 条,20865 字符), backend_log_cursor}` 载荷 → 渲染文本不含
  `backend_log_cursor` → 批六 1/4 教学的三段式第②步（wait_for since_seq=cursor）拿不到游标。
  **修复方向**：渲染前对 backend_logs 摘要化（保留前 N 条 + 显式带出 cursor），或 renderJson 支持
  尾部保底键；补回归用例锁「含 cursor」。

## 面 5：工程质量与测试

- 🟡 **T-1 闭集枚举的客户端前置拒绝无负向断言**——wait_for condition 枚举（catalog.ts:390 闭集）：
  `condition:'bogus'` → ToolArgsError `must be one of`，缺 condition → `missing required property`，
  请求不发（callTool 不被调用）——standalone.test.ts 无此负向用例。
- 🟡 **T-2 来源标注断言过弱**——contract.test.ts:279-281 任一标签即过；建议 [tool,key,expectedTag]
  三元组逐参精确断言。
- 🟡 **T-3 invoke_command.timeout_ms 与本通道 REST 预算脱钩无断言**——实测
  `resolveRequestBudgetMs('invoke_command',{timeout_ms:120000})===undefined`
  （src/tools/standalone/timeout.ts:30-52）；timeout.test.ts 无此锁定。
- 🟢 **T-4 闭集 tripwire 注释缺失**——contract.test.ts:234-245 与 catalog.ts:391-402 同一份字面量
  复制，应注释「闭集契约而非上游快照」。
- 🟢 **T-5 compound/bridge 运行时透传 0 测试**——建议新建 src/tools/compound/bridge.test.ts
  （dsh-tools 校验边界：since_seq:'7' 抛 ToolArgsError、未知 action 报枚举、未知顶层参数放行）。
- 🟢 **T-6 route 0.10.3 细化口径未覆盖**——regex 重复组 add 时被拒、mock body 不可读时 add 拒绝
  （mock_unreadable）、宽 pattern 给 ipc_warning（批六 2/4 V2-A 低-10）。
- 🟢 **L-5 find_elements 的 css/selector 双声明不归一**——src/tools/standalone/catalog.ts:179,191。
  **【2026-11-05 勘误，批九 3/3】** 本条原描述「主别名方向写反」不准确，真实分歧是
  **上游文档层 vs 上游源码/schema 层自 0.8.8 起长期并存**：
  - 文档层（v0.8.8 `tools-reference.md:136` / v0.10.2 `:157` / v0.10.3 `:157`）**一致**
    为「selector 主名、css 为别名」——文档层从未翻转；
  - 源码/schema 层（0.8.8 `other_params.rs:147-150` / 0.10.2 `:173-176` / 0.10.3 `:181-184`）
    **一致**为「css 主名、selector 别名」；0.10.3 `mod.rs:726` 取值
    `params.css.as_ref().or(params.selector.as_ref())` → 同传两键时 **css 优先**。
    插件描述已按双层口径改写（批九 1/3，提交 71112e7），两键上游均接受、语义等价，
    插件**不做**本地归一（无权威依据选定其一）。上游长期错位已写入
    `docs/upstream-feedback-0.10.3.md` 第 5 条。
    **证据强度说明**：源码/schema 侧行号与取值**已在本机 cargo registry 逐条复核**；
    文档侧行号（:136 / :157）来自上游文档引用，本机无副本，**未本地复核**。
- ✅ 已达标项：连接惰性（src/index.ts:81-126）、并发 promise 去重 + 失败重置、无候选不快落 7373
  （src/client.ts:244-251）、contract 锁工具数与 action 枚举、cli-hints 全量口径护栏
  （SCAN_ROOTS 全仓文本扫描）。

## 面 6：端到端（demo-app + pnpm smoke）

- ✅ **smoke 活体复核 9/9 PASS**（2026-11-05，victauri 0.10.3，pid=30924；SMOKE_SKIP_BUILD=1，
  2500ms）：health/info pid 一致/tools 35/get_plugin_info 35 启用/eval_js/dom_snapshot/invoke_command/
  无 token→401 全过。scripts/smoke.mjs 退出码 0/1/2，不进 CI。
- 🟢 **E-1 smoke 未覆盖后端日志链路**——scripts/smoke.mjs 不含 logs backend_digest / invoke_command
  with_logs 检查（批六 4/4 卡面允许文件不含该脚本，按纪律未夹带）；demo-app 未装 log_layer
  （活体实测 sources.structured_installed:false），补检查需先给 demo-app 装捕获源。
- 🟢 **E-2 demo-app/README.md 工具数 35 与活体 36 不一致**——历史 e2e 报告
  .agents/tmp/dsh-victauri-e2e-report.txt（2026-11-02，桥接 0.10.2）注册 36 个（当时无
  victauri_tools_list）；现在 38 个 dsh 工具 / 35 个上游工具，README 应写清口径。
- 🟢 **E-3 CI 不跑 smoke 与 Rust 构建**——.github/workflows/ci.yml 只有
  format:check/lint/typecheck/test/build；smoke 需 cargo + 活体 app，半自动设计（README 已注明），
  属有意取舍，仅记录。

## 面 2.5：文档漂移（README / docs/TOOLS.md）

- 🟡 **D-1 docs/TOOLS.md:50 logs 动作表仍是 8 个**——批六 2/4 已把 catalog 扩到 11 值（+backend/
  backend_digest/stdout），文档表未同步。
- 🟡 **D-2 docs/TOOLS.md:56 window 动作表仍是 6 个**——catalog 已 7 值（+introspectability）。
- 🟡 **D-3 docs/TOOLS.md:36 wait_for 条件清单未含 log**——catalog 已 10 值闭集。
- 🟢 **D-4 README/docs 无新参数关键词**——timeout_ms/with_logs/since_seq/backend_log_cursor/
  include_hidden 等批六 1/4 新参在文档零提及。
- 🟢 **D-5 doctor --json 证据强度**——cli-hints.ts doctor notes「0.10.0 起的文档才提供 --json」：
  上游 0.10.3 main.rs doctor 仅 AppTarget(--app) 无 --json；历史实测 0.8.8 `--json` 报
  unexpected argument。表述与证据不符，应改为「0.8.8 实测无 --json；上游未证实提供」。

## 已裁决 / 不建卡项

- **setup 子命令**：上游 0.10.0 新增（写 agent 客户端接入指令）；本插件 init 已覆盖首次接入，
  批六 3/4 定论「有意不接」（SPEC_TABLE 头注释与 docs 均已注明）→ 不建卡。
- **{items} 包装透传实施**：backlog 卡 t-mw1ri0ep-8vw7ql，用户 2026-11-04 裁定不自动执行 → 保持 backlog。
- **上游 issue 提交**：材料已备（docs/upstream-feedback-0.10.3.md），提交与否由用户裁决。
- **架构级健壮性**（M-8 超时取消、M-9 流式截断、M-10 进程树清理）：涉及核心客户端/CLI 语义重构，
  需设计评估 → backlog（未授权执行）。
- **M-6 别名扩展（window/window_label/checkpoint_label）**：行为增强，涉及 alias 表与测试 →
  可实现但优先级低，与 T 组测试增强同批处理。

## 建卡映射（批八）

| 差距                                                                | 卡                          | 类型                   |
| ------------------------------------------------------------------- | --------------------------- | ---------------------- |
| S-3 renderJson 丢 cursor                                            | 批八 1/4                    | todo（当场执行）       |
| P1-1 backend_args + P1-2 animation clear + P2-4/P2-5 别名标注       | 批八 2/4                    | todo（当场执行）       |
| T-1/T-2/T-3/T-4/T-5 测试增强 + D-5 doctor 口径                      | 批八 3/4                    | todo（当场执行）       |
| D-1/D-2/D-3/D-4 文档同步 + E-2 demo-app README                      | 批八 4/4                    | todo（当场执行）       |
| L-5 css/selector 主别名方向（勘误后按双层口径改描述）               | 批九 1/3                    | todo（当场执行）       |
| E-1 smoke 后端日志链路检查                                          | 批九 2/3                    | todo（当场执行）       |
| L-5/L-7 结论勘误 + M-1 归属澄清 + L-1 kind 词汇表边界               | 批九 3/3                    | todo（当场执行）       |
| S-1/S-2 错误信封 + 401 重发现（**含 M-1 kind 映射与 status 透出**） | backlog-A t-mw2eut5k-6k1elc | backlog（需用户批准）  |
| M-2/M-3/M-4/M-5/M-6/M-7/M-8/M-9/M-10 + 其余 L 组                    | backlog-B t-mw2evd2u-0dukch | backlog（评估/增强类） |
