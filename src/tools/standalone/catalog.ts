/**
 * standalone 批工具目录（20 个，victauri 工具名 1:1 映射 dsh victauri_<name>）。
 *
 * 参数 schema 来源（每个工具已标注）：
 * - [实测] 本机活体实例（victauri 0.8.8，REST POST /api/tools/<name> 空参探测
 *   "missing field" 错误消息 + 成功调用返回形状）——权威来源；
 * - [文档] tools-reference / MCP 工具描述（0.10.2）——与实测漂移处显式注明。
 *
 * ParameterSchemaSpec 顶层即属性映射（implicit open object root），
 * required 是 per-property `required: true` 注解。
 *
 * 工具数口径：Victauri 全量 35（standalone 20 + compound 15）+ CLI 桥 1 + CLI 探测 1
 * + 工具发现 1 = 38 个 dsh 工具；
 * 本文件 20 = README「工具清单」standalone 行 = docs/TOOLS.md = 契约测试（常量推导）。
 */
import type { ParameterSchemaSpec } from '@deepseek-ai/dsh-tools';

import { JSON_VALUE } from './json-value.ts';

/** 单个 standalone 工具的静态规格。 */
export interface RestToolSpec {
  /** victauri REST 工具名（dsh 工具名 = `victauri_` + 本值）。 */
  readonly name: string;
  /** 一句话中文标题（render 摘要用）。 */
  readonly title: string;
  /** dsh 工具描述：语义 + 参数说明 + schema 来源注释。 */
  readonly description: string;
  /** 参数 schema（顶层属性映射；来源见 description 尾注）。 */
  readonly parameters: ParameterSchemaSpec;
  /**
   * 该工具的 REST 请求预算毫秒（可选声明；语义见 timeout.ts 优先级文档）。
   * 声明值夹 TOOL_BUDGET_MAX_MS=120s；未声明的工具沿用客户端配置/默认 30s。
   */
  readonly requestBudgetMs?: number;
}

/** 标量参数辅助（standalone/compound catalog 共用）。 */
export const STR = (description: string, required = false) => ({
  type: 'string' as const,
  description,
  ...(required ? { required: true as const } : {}),
});
export const INT = (description: string, required = false) => ({
  type: 'integer' as const,
  description,
  ...(required ? { required: true as const } : {}),
});
export const BOOL = (description: string) => ({
  type: 'boolean' as const,
  description,
});
export const WEBVIEW = STR('目标 webview 标签;缺省取第一个可用 webview [文档]');

/** 20 个 standalone 工具规格（顺序 = 文档 tools-reference 顺序）。 */
export const REST_TOOL_SPECS: readonly RestToolSpec[] = [
  {
    name: 'app_info',
    title: 'Tauri 应用全景信息',
    description:
      '获取 Tauri 应用全景信息：config（identifier/product_name/windows 列表）、databases、env、paths、process。' +
      '无必填参数。schema 来源：[实测 0.8.8 空参成功]。',
    parameters: {},
  },
  {
    name: 'app_state',
    title: '后端状态探针',
    description:
      '经注册探针读后端状态。probe=探针名（缺省列出全部可用探针名）。' +
      'schema 来源：[文档 tools-reference] + [实测 0.8.8 空参成功]。',
    parameters: {
      probe: STR('要执行的探针名;缺省返回可用探针列表 [文档]'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'assert_semantic',
    title: '语义断言',
    description:
      '在 webview 里求值 JS 表达式并对结果做语义断言。' +
      '必填 expression（JS 表达式）与 condition（equals/not_equals/contains/greater_than/less_than/truthy/falsy/exists/type_is）；' +
      'expected 为条件期望值（任意 JSON 值：字符串/数值/布尔/null/数组/对象；truthy/falsy/exists 免）；' +
      'label 人类可读断言名。' +
      'schema 来源：[实测 0.8.8 缺参报 missing field `expression`] + [文档 condition 枚举] + [服务端 expected 为 serde_json::Value]。',
    parameters: {
      expression: STR('在 webview 求值的 JS 表达式 [实测必填]', true),
      condition: STR(
        '断言条件:equals|not_equals|contains|greater_than|less_than|truthy|falsy|exists|type_is [文档]',
        true,
      ),
      expected: JSON_VALUE(
        '条件期望值(任意 JSON 值:字符串/数值/布尔/null/数组/对象,原样透传不字符串化);truthy/falsy/exists 可省 [文档]',
      ),
      label: STR('人类可读断言名(报告用) [文档]'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'check_ipc_integrity',
    title: 'IPC 完整性检查',
    description:
      '检查 IPC 往返完整性:找出卡死(pending 超阈值)与报错的 IPC 调用。stale_threshold_ms 卡死判定毫秒阈值(默认 5000)。' +
      'schema 来源：[文档] + [实测 0.8.8 空参成功]。',
    parameters: {
      stale_threshold_ms: INT('卡死判定毫秒阈值,默认 5000 [文档]'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'detect_ghost_commands',
    title: '幽灵命令检测',
    description:
      '按 IPC 调用结果检测幽灵命令(前端调了但永远没有成功返回的命令)。' +
      'since_ms 只看最近 N 毫秒窗口。返回 confirmed_ghosts/verified_handlers/frontend_only/registry_only 等。' +
      'schema 来源：[文档] + [实测 0.8.8 空参成功]。',
    parameters: {
      since_ms: INT('时间窗口毫秒;>0 只看最近窗口 [文档]'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'dom_snapshot',
    title: 'DOM 快照',
    description:
      '读取带稳定 ref 句柄的 DOM 快照。format: compact(默认,可达性文本省 70-80% token)|json(全树含属性)。' +
      'schema 来源：[文档] + [实测 0.8.8 空参成功 keys=format,stale_refs,tree]。',
    parameters: {
      format: STR('快照格式:compact|json,默认 compact [文档]'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'eval_js',
    title: '执行 JS',
    description:
      '在 Tauri webview 里执行 JavaScript 并返回结果。' +
      '参数名版本差异:本插件参数为 code [实测 0.8.8 报 missing field `code`];' +
      '文档 0.10 写作 expression——为兼容两种命名,本工具同时接受 expression 并自动归一为 code。' +
      '异步表达式自动包 await。',
    parameters: {
      code: STR(
        '要执行的 JS 代码;必填:code 或 expression 至少其一 [实测 0.8.8 接受 code]',
      ),
      expression: STR(
        '(兼容别名)与 code 等价;两者都给时以 code 为准 [文档 0.10 命名]',
      ),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'find_elements',
    title: '查找元素',
    description:
      '按文本/角色/test_id/CSS 选择器/可访问名搜索元素,返回轻量匹配与 ref 句柄。' +
      '全部条件可选(可组合);返回顶层数组,本插件包装为 {items:[...]}。' +
      'schema 来源：[文档] + [实测 0.8.8 空参成功(返回数组)]。',
    parameters: {
      alt: STR('alt 文本子串匹配(忽略大小写) [文档]'),
      css: STR('CSS 选择器(也接受 selector 别名) [文档]'),
      enabled: BOOL('按可用状态过滤 [文档]'),
      exact: BOOL('文本精确匹配(默认子串) [文档]'),
      label: STR('关联 label 文本匹配(按 label 找 input) [文档]'),
      max_results: INT('返回上限,默认 10 [文档]'),
      name: STR('可访问名(aria-label/title/placeholder)子串匹配 [文档]'),
      placeholder: STR('placeholder 文本匹配 [文档]'),
      role: STR('ARIA 角色精确匹配 [文档]'),
      selector: STR('CSS 选择器(css 别名) [文档]'),
      tag: STR('HTML 标签名,如 button/input [文档]'),
      test_id: STR('data-testid 属性值精确匹配 [文档]'),
      text: STR('文本内容子串匹配(忽略大小写) [文档]'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'get_diagnostics',
    title: '环境诊断',
    description:
      '运行环境诊断:检测 service worker/关闭的 shadow DOM/iframe/大 DOM/CSP。连接陌生应用时先调它。' +
      'schema 来源：[文档] + [实测 0.8.8 空参成功 keys=info,warnings]。',
    parameters: {
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'get_memory_stats',
    title: '进程内存统计',
    description:
      '从 OS 读实时进程内存统计(working set/page file 用量)。Windows 返回详细指标;Linux 返回 virtual/resident。' +
      'schema 来源：[文档] + [实测 0.8.8 空参成功]。',
    parameters: {},
  },
  {
    name: 'get_plugin_info',
    title: '插件信息',
    description:
      '获取应用全景信息:Tauri config(identifier/product_name/version)、app 目录路径(data/config/log/local_data)、' +
      '进程环境变量、app 目录内发现的数据库文件。schema 来源：[文档] + [实测 0.8.8 空参成功]。',
    parameters: {},
  },
  {
    name: 'get_registry',
    title: '检索命令注册表',
    description:
      '按名称/描述子串过滤列出全部注册的 Tauri 命令及参数 schema(#inspectable 宏注册才有 schema)。' +
      'query 缺省返回全部。schema 来源：[文档] + [实测 0.8.8 空参成功]。',
    parameters: {
      query: STR('按命令名或描述过滤的子串 [文档]'),
    },
  },
  {
    name: 'invoke_command',
    title: '调用 Tauri 命令',
    description:
      '经 IPC 调用注册的 Tauri 命令(等价前端 invoke),调用会入日志且可验证。' +
      '必填 command;args 为 JSON 对象(键=命令参数名)。隐私命令过滤可能拦截。' +
      'schema 来源：[实测 0.8.8 报 missing field `command`] + [文档 args 形状]。',
    parameters: {
      command: STR(
        '要调用的 Tauri 命令名,如 greet/save_settings [实测必填]',
        true,
      ),
      args: {
        type: 'object',
        additionalProperties: true,
        description: '命令参数 JSON 对象 [文档]',
      },
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'list_app_dir',
    title: '列出应用目录',
    description:
      '列出应用 data/config/log/local_data 目录内容,发现数据库/配置/日志文件,免经 webview。' +
      'directory 默认 data;path 为相对子目录;pattern glob 如 *.sqlite;max_depth 默认 1。' +
      'schema 来源：[文档] + [实测 0.8.8 空参成功 keys=base,count,entries,exists,path,truncated]。',
    parameters: {
      directory: STR('目录别名:data|config|log|local_data,默认 data [文档]'),
      max_depth: INT('递归深度,默认 1(仅直接子项) [文档]'),
      path: STR('所选根下的相对子目录,如 databases [文档]'),
      pattern: STR('glob 过滤,如 *.sqlite、*.db [文档]'),
    },
  },
  {
    name: 'query_db',
    title: '查询 SQLite',
    description:
      '对应用数据目录里的 SQLite 库执行有界只读 SQL(自动发现库文件)。仅 SELECT/PRAGMA/EXPLAIN/WITH。' +
      '必填 query(别名 sql);params 位置绑定参数数组;path 相对 app data 目录;max_rows 默认 100。' +
      'schema 来源：[实测 0.8.8 报 missing field `query`] + [文档其余字段]。',
    parameters: {
      query: STR(
        '只读 SQL(SELECT/PRAGMA/EXPLAIN/WITH);必填:query 或 sql 至少其一 [实测 0.8.8 接受 query]',
      ),
      sql: STR('(别名)与 query 等价;两者都给时以 query 为准 [文档]'),
      params: { type: 'array', description: '位置绑定参数数组 [文档]' },
      path: STR('库文件路径,相对 app data 目录;缺省自动发现 [文档]'),
      max_rows: INT('返回行数上限,默认 100 [文档]'),
    },
  },
  {
    name: 'read_app_file',
    title: '读取应用文件',
    description:
      '从应用 data/config/log/local_data 目录读文件(默认 UTF-8 文本,binary:true 返回 base64)。' +
      '必填 path(相对所选目录,如 settings.json、databases/app.db);max_bytes 默认 1MB。' +
      'schema 来源：[实测 0.8.8 报 missing field `path`] + [文档其余字段]。',
    parameters: {
      path: STR('文件相对路径(相对所选目录) [实测必填]', true),
      binary: BOOL('true 返回 base64 字节;默认 UTF-8 文本 [文档]'),
      directory: STR('目录别名:data|config|log|local_data,默认 data [文档]'),
      max_bytes: INT('读取字节上限,默认 1MB [文档]'),
    },
  },
  {
    name: 'resolve_command',
    title: '自然语言解析命令',
    description:
      '按自然语言描述解析匹配的 Tauri 命令,按相关度打分排序(命令名/描述/意图/类别/示例)。' +
      '必填 query;limit 默认 5。schema 来源：[实测 0.8.8 报 missing field `query`] + [文档 limit]。',
    parameters: {
      query: STR(
        '描述想做什么的自然语言,如 "save the user settings" [实测必填]',
        true,
      ),
      limit: INT('返回结果数上限,默认 5 [文档]'),
    },
  },
  {
    name: 'screenshot',
    title: '窗口截图',
    description:
      '把 Tauri 窗口截成 PNG(Windows PrintWindow/macOS CGWindowList/Linux X11;纯 Wayland 失败回退整屏)。' +
      '本插件把返回的 base64 落盘 %TEMP%\\dsh-victauri\\ 并返回文件路径(不占上下文)。' +
      '隐藏窗口截图会报错,先 show 再截。schema 来源：[文档] + [实测 0.8.8 keys=data,mimeType,type]。',
    parameters: {
      window_label: STR('目标窗口标签;缺省截主/第一个可见窗口 [文档]'),
    },
  },
  {
    name: 'verify_state',
    title: '前后端状态对照',
    description:
      '对比前端状态(JS 表达式求值)与后端状态,返回含 mismatches 的 VerificationResult。' +
      '必填 frontend_expr;后端取态二选一:backend_command(经 invoke_command 取)或 backend_state(JSON 直给)。' +
      'schema 来源：[实测 0.8.8 报 missing field `frontend_expr`] + [文档]。',
    parameters: {
      frontend_expr: STR('返回前端状态对象的 JS 表达式 [实测必填]', true),
      backend_command: STR(
        '取后端状态的 Tauri 命令(与 backend_state 互斥) [文档]',
      ),
      backend_state: {
        type: 'object',
        additionalProperties: true,
        description: '直给的后端状态 JSON(与 backend_command 互斥) [文档]',
      },
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'wait_for',
    title: '条件等待',
    description:
      '按固定间隔轮询直到条件满足或超时。必填 condition:text|text_gone|selector|selector_gone|url|' +
      'ipc_idle|network_idle|expression|event;配套 value/expected/poll_ms(默认 200)/timeout_ms(默认 10000)/' +
      'since_ms(默认 2000, event 回看窗口)。expected 为任意 JSON 值(原样透传不字符串化)。' +
      'schema 来源：[实测 0.8.8 报 missing field `condition`] + [文档]。',
    parameters: {
      condition: STR(
        '等待条件:text|text_gone|selector|selector_gone|url|ipc_idle|network_idle|expression|event [实测必填]',
        true,
      ),
      value: STR(
        '条件值:文本/CSS 选择器/URL 子串/JS 表达式/Tauri 事件名 [文档]',
      ),
      expected: JSON_VALUE(
        '条件期望值(任意 JSON 值:字符串/数值/布尔/null/数组/对象,原样透传不字符串化);缺省任意真值 [文档]',
      ),
      poll_ms: INT('轮询间隔毫秒,默认 200 [文档]'),
      timeout_ms: INT('超时毫秒,默认 10000 [文档]'),
      since_ms: INT('event 条件回看窗口毫秒,默认 2000 [文档]'),
      webview_label: WEBVIEW,
    },
  },
];

/** standalone 工具数口径(代码头注释 = README = docs = 契约测试 四处一致)。 */
export const STANDALONE_TOOL_COUNT = REST_TOOL_SPECS.length;
