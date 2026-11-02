/**
 * compound 批工具目录（15 个，action 参数结构：一个 dsh 工具覆盖一组子动作）。
 *
 * 参数 schema 来源：
 * - [桥] 本机 victauri bridge 0.8.8 暴露的 MCP 工具 schema（action 枚举与参数名）；
 * - [文档] tools-reference（0.10.2）——与桥一致处不另标注，漂移处显式注明。
 *
 * 与 standalone 的差异：复合工具只有 `action` 是必填 enum，其余参数按子动作可选，
 * 服务端（victauri-plugin）负责子动作级校验，本层只透传。
 *
 * ParameterSchemaSpec 顶层即属性映射（implicit open object root），
 * required 是 per-property `required: true` 注解。
 *
 * 工具数口径：Victauri 全量 35（standalone 20 + compound 15）+ CLI 桥 1 = 36 个 dsh 工具；
 * 本文件 15 = README「工具清单」compound 行 = docs/TOOLS.md = 契约测试（常量推导）。
 */
import type { ParameterPropertySpec } from '@deepseek-ai/dsh-tools';

import { BOOL, INT, STR, WEBVIEW } from '../standalone/catalog.ts';
import type { RestToolSpec } from '../standalone/catalog.ts';

/** enum 参数辅助（复合工具的 action 与子级枚举）。 */
const ENUM = (
  description: string,
  values: readonly string[],
  required = false,
) => ({
  type: 'string' as const,
  enum: [...values],
  description,
  ...(required ? { required: true as const } : {}),
});
/** 开放对象参数辅助（headers/args/state 等 JSON 对象透传）。 */
const OBJ = (description: string) => ({
  type: 'object' as const,
  additionalProperties: true,
  description,
});
/** 浮点参数辅助（坐标/秒数/阈值）。 */
const NUM = (description: string) => ({
  type: 'number' as const,
  description,
});
/** 字符串数组参数辅助。 */
const STRARR = (description: string) => ({
  type: 'array' as const,
  items: { type: 'string' as const },
  description,
});

/** action 参数（每个复合工具的公共必填头，枚举值见各规格）。 */
const ACTION = (tool: string, values: readonly string[]) =>
  ENUM(`${tool} 要执行的子动作`, values, true);

/** 15 个 compound 工具规格（顺序 = 文档 tools-reference 顺序）。 */
export const COMPOUND_TOOL_SPECS: readonly RestToolSpec[] = [
  {
    name: 'animation',
    title: '动画introspection与逐帧seek',
    description:
      '动画检查（无 CDP，读 Web Animations API）：list 列运行中 CSS 动画（timing/keyframes/进度）；' +
      'scrub 确定性暂停并 seek 到 points 个等分进度点，返回几何曲线（rect+transform+opacity），' +
      'capture=true 另返回 contact-sheet filmstrip；sample 实时录制 rAF 曲线（record=true 布防、false 收读，' +
      '含丢帧统计）；clear 清空录制。仅 CSS 动画可 seek（JS/rAF 用 sample）。' +
      '注意：动画仅在运行/挂起时可见——先触发动画再调用。 [桥]',
    parameters: {
      action: ACTION('animation', ['list', 'scrub', 'sample', 'clear']),
      capture: BOOL('(scrub) 为 true 时每进度点原生截图并返回 filmstrip PNG'),
      clear: BOOL('(sample) 为 true 时调用后清空已录制会话'),
      cols: INT('(scrub) filmstrip 网格列数，默认 ~sqrt(n)'),
      limit: INT('(frames) 最多返回多少已缓冲帧'),
      points: INT('(scrub) 等分进度点数，默认 20，夹到 2..120'),
      record: BOOL('(sample) true 布防 rAF 录制；false 收读实测曲线'),
      restore: BOOL('(scrub) 默认 true 恢复动画；false 停在终点'),
      selector: STR('目标元素 CSS 选择器；list 省略 = 全部运行中动画'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'css',
    title: 'CSS 注入调试',
    description:
      'CSS 注入：inject 把自定义 CSS 注入页面；remove 移除先前注入的 CSS。' +
      'allow_remote 仅在确需加载远程样式表（@import/url()）时开启，默认 false ' +
      '（远程引用可被用作数据外泄/SSRF 向量，尤其与页面源 prompt injection 组合时）。 [桥]',
    parameters: {
      action: ACTION('css', ['inject', 'remove']),
      allow_remote: BOOL(
        '允许注入 CSS 中的远程 @import/url() 引用（默认 false）',
      ),
      css: STR('(inject) 要注入的 CSS 文本'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'explain',
    title: '活动关联叙述',
    description:
      '把 IPC + DOM + console + network + window 事件跨层关联成连贯叙述：' +
      'summary 最近 N 秒高层活动摘要（IPC 调用数/DOM 变更/console/network/错误计数，默认 30s）；' +
      'last_action 把最近一次事件爆发关联为因果时间线（如「IPC call → DOM update → console.log」）；' +
      'diff 最近 N 秒变化（事件计数/错误/新 IPC 命令）。 [桥]',
    parameters: {
      action: ACTION('explain', ['summary', 'last_action', 'diff']),
      seconds: NUM(
        '回看秒数：summary 默认 30，last_action 默认 5，diff 默认 10',
      ),
    },
  },
  {
    name: 'fault',
    title: '命令故障注入（chaos）',
    description:
      '按故障规则干扰经 invoke_command 工具驱动的命令执行，用于错误路径测试。' +
      '注意：只影响经由本桥 invoke_command 发起的调用，不拦截应用真实用户 IPC。' +
      'inject 加规则（command+fault_type 必填）；list 列规则；clear 按 id 删；clear_all 全删。 [桥]',
    parameters: {
      action: ACTION('fault', ['inject', 'list', 'clear', 'clear_all']),
      command: STR('(inject/clear) 目标命令名'),
      delay_ms: NUM('(fault_type=delay) 命令执行前人工延迟毫秒'),
      error_message: STR('(fault_type=error) 返回的错误消息'),
      fault_type: ENUM('(inject) 故障类型', [
        'delay',
        'error',
        'drop',
        'corrupt',
      ]),
      max_triggers: NUM('规则最多触发次数；0 或省略 = 不限'),
    },
  },
  {
    name: 'input',
    title: '文本与键盘输入',
    description:
      '输入动作：fill 直接设置输入元素值（ref_id 必填）；type_text 逐字符键入' +
      '（trusted=true 走真实 OS 键盘事件，先聚焦目标元素，Windows 已实现）；' +
      'press_key 触发键盘键/组合（如 Enter/Control+a/Escape/Tab/ArrowDown）。 [桥]',
    parameters: {
      action: ACTION('input', ['fill', 'type_text', 'press_key']),
      key: STR('(press_key) 键名或组合'),
      ref_id: STR('(fill/type_text) DOM 快照 ref 句柄；press_key 可省略'),
      text: STR('(type_text) 要键入的文本'),
      trusted: BOOL('为 true 时投递真实 OS 输入（isTrusted: true）'),
      value: STR('(fill) 要设置的字符串值'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'inspect',
    title: 'CSS 与视觉检查',
    description:
      '检查动作：get_styles 取元素计算 CSS（properties 可指定属性清单）；' +
      'get_bounding_boxes 批量取布局矩形；highlight 加调试高亮 overlay；' +
      'clear_highlights 移除全部高亮；audit_accessibility 跑无障碍审计；' +
      'get_performance 取 timing/heap/DOM 指标。ref_id 来自 dom_snapshot。 [桥]',
    parameters: {
      action: ACTION('inspect', [
        'get_styles',
        'get_bounding_boxes',
        'highlight',
        'clear_highlights',
        'audit_accessibility',
        'get_performance',
      ]),
      color: STR('(highlight) overlay 颜色，默认 rgba(255,0,0,0.3)'),
      highlight_label: STR('(highlight) 高亮上方文字标签'),
      properties: STRARR(
        '(get_styles) 要返回的 CSS 属性名清单；省略 = 关键属性',
      ),
      ref_id: STR('目标元素 ref 句柄（get_styles/highlight 必需）'),
      ref_ids: STRARR('(get_bounding_boxes) 批量元素 ref 句柄'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'interact',
    title: 'DOM 元素交互',
    description:
      '元素交互：click/double_click/hover/focus；scroll_into_view 把元素滚入视口' +
      '（ref_id 优先，无 ref 用 x/y 像素滚动位）；select_option 在 <select> 里按值选' +
      '（单选用 value，多选用 values 数组）。多数动作需 dom_snapshot 返回的 ref_id。 [桥]',
    parameters: {
      action: ACTION('interact', [
        'click',
        'double_click',
        'hover',
        'focus',
        'scroll_into_view',
        'select_option',
      ]),
      ref_id: STR('目标元素 ref 句柄（click/hover/focus/select_option 必需）'),
      trusted: BOOL('为 true 时投递真实 OS 鼠标点击（Windows 已实现）'),
      value: STR('(select_option) 单选项值的便捷别名'),
      values: STRARR('(select_option) 多选项值数组'),
      webview_label: WEBVIEW,
      x: NUM('(scroll_into_view) 无 ref_id 时的水平滚动像素'),
      y: NUM('(scroll_into_view) 无 ref_id 时的垂直滚动像素'),
    },
  },
  {
    name: 'introspect',
    title: '后端深度introspection',
    description:
      '后端introspection全集：command_timings 每命令执行耗时统计（slow_threshold_ms 过滤）；' +
      'coverage 本会话被调用过的命令 + ipc_calls_observed；command_catalog 从活体 IPC 日志挖掘' +
      '每命令参数/返回形状（不用 #[inspectable] 也能拿到真实 schema）；' +
      'contract_record 记录命令响应形状基线；contract_check 检查 schema 漂移；' +
      'contract_list/contract_clear 基线管理；startup_timing 插件启动分相计时；' +
      'capabilities 枚举 Tauri v2 capabilities/安全配置/窗口定义；db_health SQLite 诊断' +
      '（journal/WAL/页统计，db_path 只读）；plugin_state 插件内部状态快照；' +
      'processes 枚举宿主进程与子进程；plugin_tasks 插件自有异步任务；' +
      'event_bus 列捕获的 Tauri 事件（args 传 {limit,since_ms}）；event_bus_clear 清缓冲。 [桥]',
    parameters: {
      action: ACTION('introspect', [
        'command_timings',
        'coverage',
        'command_catalog',
        'contract_record',
        'contract_check',
        'contract_list',
        'contract_clear',
        'startup_timing',
        'capabilities',
        'db_health',
        'plugin_state',
        'processes',
        'plugin_tasks',
        'event_bus',
        'event_bus_clear',
      ]),
      args: OBJ(
        '(contract_record/event_bus) 调用命令时的参数对象，如 {"limit":500,"since_ms":5000}',
      ),
      command: STR(
        '(contract_record/contract_check/contract_clear) 目标命令名',
      ),
      db_path: STR('(db_health) SQLite 库文件路径；省略自动发现'),
      slow_threshold_ms: NUM('(command_timings) 只显示慢于此毫秒数的命令'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'logs',
    title: '应用日志与监控',
    description:
      '日志与监控动作：console 捕获的 console.log/warn/error；network 被拦截的 fetch/XHR；' +
      'ipc IPC 调用日志（wait_for_capture=true 等待至多 500ms 抓响应体）；navigation URL 变更史；' +
      'dialogs alert/confirm/prompt 事件；events 合并事件流；slow_ipc 慢调用检测' +
      '（threshold_ms 过滤）；clear 清 IPC+network 日志（按测试隔离）。 [桥]',
    parameters: {
      action: ACTION('logs', [
        'console',
        'network',
        'ipc',
        'navigation',
        'dialogs',
        'events',
        'slow_ipc',
        'clear',
      ]),
      filter: STR('(network) 按 URL 子串过滤'),
      limit: INT('最多返回条目数'),
      since: NUM('(console/events) 只返回该 Unix 毫秒时间戳之后'),
      threshold_ms: NUM('(slow_ipc) 慢调用阈值毫秒'),
      wait_for_capture: BOOL('(ipc) true 时等待最新条目响应体抓取完成'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'navigate',
    title: '导航与对话框控制',
    description:
      '导航与对话框：go_to 导航到 URL；go_back 浏览器后退；get_history 导航历史日志；' +
      'set_dialog_response 自动应答 alert/confirm/prompt（dialog_action=accept|dismiss，' +
      'prompt 可带 text）；get_dialog_log 取已捕获对话框事件。go_to/set_dialog_response ' +
      '受隐私控制约束。 [桥]',
    parameters: {
      action: ACTION('navigate', [
        'go_to',
        'go_back',
        'get_history',
        'set_dialog_response',
        'get_dialog_log',
      ]),
      dialog_action: ENUM('(set_dialog_response) 对话框应答', [
        'accept',
        'dismiss',
      ]),
      dialog_type: STR(
        '(set_dialog_response) 对话框类型（alert/confirm/prompt）',
      ),
      text: STR('(set_dialog_response) prompt 对话框的应答文本'),
      url: STR('(go_to) 目标 URL'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'recording',
    title: '时间旅行录制与回放',
    description:
      '录制与回放：start 开始录制（session_id 可指定，省略生成 UUID）；stop 停止并返回会话；' +
      'checkpoint 保存状态快照（checkpoint_label 起名，省略生成 cp-<uuid>）；' +
      'list_checkpoints 列快照；get_events 取 since_index 之后事件；' +
      'events_between 取两个快照间事件（from/to）；get_replay 取 IPC 回放序列；' +
      'export/import 会话 JSON 导入导出（session_json）；replay 重放录制命令并与基线比对；' +
      'flush 立即排干挂起事件（不等 1 秒轮询）。 [桥]',
    parameters: {
      action: ACTION('recording', [
        'start',
        'stop',
        'checkpoint',
        'list_checkpoints',
        'get_events',
        'events_between',
        'get_replay',
        'export',
        'import',
        'replay',
        'flush',
      ]),
      checkpoint_id: STR('(events_between/get_replay) 快照 ID'),
      checkpoint_label: STR('(checkpoint) 快照别名'),
      from: STR('(events_between) 起始快照 ID'),
      session_id: STR('(start) 会话 ID，省略自动生成'),
      session_json: STR('(import) 先前 export 的 JSON 串'),
      since_index: INT('(get_events) 只取该索引之后的事件'),
      state: OBJ('(checkpoint) 要快照的状态 JSON'),
      to: STR('(events_between) 结束快照 ID'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'route',
    title: '网络请求拦截',
    description:
      '网络拦截（Playwright route 等价物，无 CDP）：按 URL 模式匹配 webview 的 fetch/XHR，' +
      'block 中止 / fulfill 返回 mock 响应（fetch 支持，XHR 回退 delay）/ delay 延迟放行。' +
      'match_type 选 pattern 语义（substring/glob/regex/exact）；times 限制触发次数；' +
      '规则按页面作用域，reload 清空。注意：顶层导航/子资源/WebSocket 不拦截；' +
      'Tauri IPC（ipc.localhost）只观察不控制。add 加规则，list 列规则+触发日志，' +
      'clear 按 id 删，clear_all 全删，matches 返回拦截日志。 [桥]',
    parameters: {
      action: ACTION('route', ['add', 'list', 'clear', 'clear_all', 'matches']),
      behavior: ENUM('(add) 规则行为', ['block', 'fulfill', 'delay']),
      body: STR('(fulfill) mock 响应体；字符串原样，其余 JSON 序列化'),
      content_type: STR(
        '(fulfill) mock 响应 Content-Type，默认 application/json',
      ),
      delay_ms: NUM('(delay/fulfill) 延迟毫秒'),
      headers: OBJ('(fulfill) mock 响应头 JSON 对象'),
      id: INT('(clear) 要删的规则 id'),
      limit: INT('(matches) 最多返回日志条数'),
      match_type: ENUM('(add) pattern 匹配语义', [
        'substring',
        'glob',
        'regex',
        'exact',
      ]),
      method: STR('(add) 限定单一 HTTP 方法'),
      pattern: STR('(add) URL 匹配模式（语义由 match_type 决定）'),
      status: INT('(fulfill) mock 状态码，默认 200'),
      status_text: STR('(fulfill) mock 状态文本'),
      times: NUM('(add) 规则最多触发次数；0/省略 = 不限'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'storage',
    title: '浏览器存储与 Cookie',
    description:
      '存储操作：get 读 localStorage/sessionStorage（storage_type 选，默认 local）；' +
      'set 写（value JSON 序列化）；delete 删键；get_cookies 取全部 Cookie。' +
      'set/delete 受隐私控制约束。 [桥]',
    parameters: {
      action: ACTION('storage', ['get', 'set', 'delete', 'get_cookies']),
      key: STR('(get/set/delete) 存储键'),
      storage_type: ENUM('存储类型', ['local', 'session']),
      value: STR('(set) 要存的值（JSON 序列化）'),
      webview_label: WEBVIEW,
    },
  },
  {
    name: 'trace',
    title: '截屏流/视觉轨迹',
    description:
      '视觉轨迹（无 CDP）：start 按固定间隔截窗进环形缓冲，形成视觉时间线；' +
      'with_events=true 同时启动事件录制器（捆绑 IPC/DOM/console 事件时间线）。' +
      'stop 停止并返回摘要（帧数/时长/时间戳）；status 查询活跃与缓冲帧数；' +
      'frames 取已捕获帧（base64 PNG，limit 限制数量，0/省略 = 全部）。 [桥]',
    parameters: {
      action: ACTION('trace', ['start', 'stop', 'status', 'frames']),
      interval_ms: NUM('(start) 截屏间隔毫秒，默认 500，最小 50'),
      limit: INT('(frames) 最多返回帧数；0/省略 = 全部缓冲'),
      max_frames: INT('(start) 环形缓冲容量，默认 60，最大 600'),
      webview_label: WEBVIEW,
      with_events: BOOL('(start) 同时启动事件录制器'),
    },
  },
  {
    name: 'window',
    title: '窗口管理',
    description:
      '窗口管理：get_state 取窗口位置/尺寸/可见性；list 列全部窗口标签；' +
      'manage 执行窗口动作（manage_action：minimize/unminimize/maximize/unmaximize/' +
      'close/focus/show/hide/fullscreen/unfullscreen/always_on_top/not_always_on_top）；' +
      'resize 调整逻辑像素尺寸（width/height）；move_to 移动（x/y 逻辑像素）；' +
      'set_title 改标题。label 选目标窗口，省略 = 主窗口。 [桥]',
    parameters: {
      action: ACTION('window', [
        'get_state',
        'list',
        'manage',
        'resize',
        'move_to',
        'set_title',
      ]),
      height: INT('(resize) 逻辑像素高'),
      label: STR('目标窗口标签（省略 = 主/首个可见窗口）'),
      manage_action: ENUM('(manage) 窗口动作', [
        'minimize',
        'unminimize',
        'maximize',
        'unmaximize',
        'close',
        'focus',
        'show',
        'hide',
        'fullscreen',
        'unfullscreen',
        'always_on_top',
        'not_always_on_top',
      ]),
      title: STR('(set_title) 新窗口标题'),
      width: INT('(resize) 逻辑像素宽'),
      x: INT('(move_to) 逻辑像素 X'),
      y: INT('(move_to) 逻辑像素 Y'),
    },
  },
];

/** compound 批工具数（口径锚点，契约测试与 README/docs 同源）。 */
export const COMPOUND_TOOL_COUNT = COMPOUND_TOOL_SPECS.length;

/** action 枚举值守卫（导出供契约测试与装配方使用）。 */
export function compoundActionOf(spec: RestToolSpec): readonly string[] {
  const action = spec.parameters['action'] as ParameterPropertySpec & {
    enum?: readonly string[];
  };
  return action.enum ?? [];
}
