/**
 * 包级契约测试：四批工具（standalone 20 + compound 15 + CLI 桥 1 + CLI 探测 1
 * + 工具发现 1 = 38）的名字唯一性、前缀统一、数量口径与复合工具 action 结构。
 *
 * 口径四处一致：本文件 = README「工具清单」= docs/TOOLS.md = catalog 头注释。
 */
import { describe, expect, it } from 'vitest';

import { TOTAL_TOOL_COUNT } from '../index.ts';
import { victauriCliTool } from './cli.ts';
import { victauriCliStatusTool } from './cli-status.ts';
import {
  COMPOUND_TOOL_SPECS,
  COMPOUND_TOOL_COUNT,
  compoundActionOf,
} from './compound/catalog.ts';
import { createCompoundTools } from './compound/bridge.ts';
import {
  REST_TOOL_SPECS,
  STANDALONE_TOOL_COUNT,
} from './standalone/catalog.ts';
import { createStandaloneTools } from './standalone/bridge.ts';
import { TOOLS_LIST_TOOL_NAME, createToolsListTool } from './tools-list.ts';

describe('dsh-victauri 工具面契约', () => {
  it('数量口径:standalone 20 + compound 15 + CLI 1 + CLI 探测 1 + 工具发现 1 = 38,与 README/docs/catalog 一致', () => {
    expect(STANDALONE_TOOL_COUNT).toBe(20);
    expect(COMPOUND_TOOL_COUNT).toBe(15);
    expect(STANDALONE_TOOL_COUNT + COMPOUND_TOOL_COUNT).toBe(35);
    expect(STANDALONE_TOOL_COUNT + COMPOUND_TOOL_COUNT + 3).toBe(38);
    expect(REST_TOOL_SPECS).toHaveLength(STANDALONE_TOOL_COUNT);
    expect(COMPOUND_TOOL_SPECS).toHaveLength(COMPOUND_TOOL_COUNT);
  });

  it('38 个 dsh 工具名全局唯一且统一 victauri_ 前缀', () => {
    const standalone = createStandaloneTools(REST_TOOL_SPECS, {
      getClient: null as never,
    });
    const compound = createCompoundTools({ getClient: null as never });
    const names = [
      ...standalone.map((t) => t.name),
      ...compound.map((t) => t.name),
      victauriCliTool.name,
      victauriCliStatusTool.name,
      createToolsListTool({ getClient: null as never }).name,
    ];
    expect(names).toHaveLength(38);
    expect(new Set(names).size).toBe(38);
    for (const name of names) {
      expect(name.startsWith('victauri_'), name).toBe(true);
    }
  });

  it('工具面为静态注册:装配入口按固定清单注册,TOTAL_TOOL_COUNT 与实际装配数一致', () => {
    // 装配清单 = REST 桥 20 + compound 桥 15 + CLI 桥 1 + CLI 探测 1 + 工具发现 1
    expect(TOTAL_TOOL_COUNT).toBe(38);
    expect(TOTAL_TOOL_COUNT).toBe(
      REST_TOOL_SPECS.length + COMPOUND_TOOL_SPECS.length + 3,
    );
    // 工具发现工具不映射服务端工具面,故不进 REST/compound 目录(无动态注册入口)
    expect(REST_TOOL_SPECS.map((spec) => spec.name)).not.toContain(
      'tools_list',
    );
    expect(COMPOUND_TOOL_SPECS.map((spec) => spec.name)).not.toContain(
      'tools_list',
    );
    expect(TOOLS_LIST_TOOL_NAME).toBe('victauri_tools_list');
  });

  it('compound 每个工具的 action 为必填 enum 且枚举值唯一、与文档子动作一致', () => {
    const EXPECTED_ACTIONS: Record<string, readonly string[]> = {
      // 0.10.3 基线三动作：clear 已废弃（0.8.8 有、0.10.x 移除，清空改经 sample 的 clear:true）
      animation: ['list', 'scrub', 'sample'],
      css: ['inject', 'remove'],
      explain: ['summary', 'last_action', 'diff'],
      fault: ['inject', 'list', 'clear', 'clear_all'],
      input: ['fill', 'type_text', 'press_key'],
      inspect: [
        'get_styles',
        'get_bounding_boxes',
        'highlight',
        'clear_highlights',
        'audit_accessibility',
        'get_performance',
      ],
      interact: [
        'click',
        'double_click',
        'hover',
        'focus',
        'scroll_into_view',
        'select_option',
      ],
      introspect: [
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
      ],
      logs: [
        'console',
        'network',
        'ipc',
        'navigation',
        'dialogs',
        'events',
        'slow_ipc',
        'clear',
        'backend',
        'backend_digest',
        'stdout',
      ],
      navigate: [
        'go_to',
        'go_back',
        'get_history',
        'set_dialog_response',
        'get_dialog_log',
      ],
      recording: [
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
      ],
      route: ['add', 'list', 'clear', 'clear_all', 'matches'],
      storage: ['get', 'set', 'delete', 'get_cookies'],
      trace: ['start', 'stop', 'status', 'frames'],
      window: [
        'get_state',
        'list',
        'manage',
        'resize',
        'move_to',
        'set_title',
        'introspectability',
      ],
    };
    expect(Object.keys(EXPECTED_ACTIONS)).toHaveLength(COMPOUND_TOOL_COUNT);
    for (const spec of COMPOUND_TOOL_SPECS) {
      const action = spec.parameters['action'] as {
        required?: boolean;
        enum?: string[];
      };
      expect(action?.required, `${spec.name}.action.required`).toBe(true);
      expect(action?.enum, `${spec.name}.action.enum`).toEqual(
        EXPECTED_ACTIONS[spec.name],
      );
      expect(new Set(compoundActionOf(spec)).size).toBe(
        compoundActionOf(spec).length,
      );
    }
  });

  it('compound 的 explain/fault 暴露 webview_label 参数且标注服务端版本口径', () => {
    // ParameterPropertySpec 是联合类型，这里只取字符串型节点的 type/description
    const prop = (
      spec: (typeof COMPOUND_TOOL_SPECS)[number],
      name: string,
    ): { type?: string; description?: string } | undefined =>
      spec.parameters[name] as
        { type?: string; description?: string } | undefined;

    const explain = COMPOUND_TOOL_SPECS.find((s) => s.name === 'explain');
    const fault = COMPOUND_TOOL_SPECS.find((s) => s.name === 'fault');
    // explain：服务端 0.10.2 起支持（ExplainParams.webview_label，别名 window）
    expect(prop(explain!, 'webview_label')?.type).toBe('string');
    expect(prop(explain!, 'webview_label')?.description).toContain('0.10.2');
    // fault：0.10.x fallback schema 口径含该字段，但服务端 FaultParams 未定义
    expect(prop(fault!, 'webview_label')?.type).toBe('string');
    expect(prop(fault!, 'webview_label')?.description).toContain('FaultParams');
    // 其余 compound 工具的 webview_label 口径不变（通用说明文案）
    for (const spec of COMPOUND_TOOL_SPECS) {
      if (spec.name === 'explain' || spec.name === 'fault') {
        continue;
      }
      const label = prop(spec, 'webview_label');
      if (label === undefined) {
        continue;
      }
      expect(label.description, `${spec.name}.webview_label`).toContain(
        '目标 webview 标签',
      );
    }
  });

  it('animation 的参数集合与 Rust AnimationParams 1:1（无 limit），trace 的 limit 保留', () => {
    const animation = COMPOUND_TOOL_SPECS.find((s) => s.name === 'animation');
    const trace = COMPOUND_TOOL_SPECS.find((s) => s.name === 'trace');
    // Rust 0.10.2 / 0.8.8 的 AnimationParams 字段集合（不含 limit）
    const RUST_ANIMATION_PARAMS = [
      'action',
      'capture',
      'clear',
      'cols',
      'points',
      'record',
      'restore',
      'selector',
      'webview_label',
    ];
    expect(Object.keys(animation!.parameters).sort()).toEqual(
      [...RUST_ANIMATION_PARAMS].sort(),
    );
    // limit 属 trace.frames 语义，animation 不得再带（批四 2/6 移除）
    expect(animation!.parameters).not.toHaveProperty('limit');
    // 合法 limit 不受影响
    expect(trace!.parameters).toHaveProperty('limit');
  });

  it('图像类工具描述告知落盘与查看方式（批七 1/1：read_image/present）', () => {
    const screenshot = REST_TOOL_SPECS.find((s) => s.name === 'screenshot');
    const animation = COMPOUND_TOOL_SPECS.find((s) => s.name === 'animation');
    const trace = COMPOUND_TOOL_SPECS.find((s) => s.name === 'trace');
    for (const spec of [screenshot, animation, trace]) {
      expect(spec!.description, `${spec!.name} 落盘路径`).toContain(
        '%TEMP%\\dsh-victauri\\',
      );
      expect(spec!.description, `${spec!.name} read_image 提示`).toContain(
        'read_image',
      );
      expect(spec!.description, `${spec!.name} present 提示`).toContain(
        'present',
      );
    }
  });

  it('standalone 0.10.3 对齐:invoke_command/wait_for/find_elements 新增参数齐备、可选且带来源标注', () => {
    const specOf = (name: string) =>
      REST_TOOL_SPECS.find((spec) => spec.name === name)!;
    const propOf = (name: string, key: string) =>
      specOf(name).parameters[key] as
        | {
            type?: string;
            description?: string;
            required?: true;
            enum?: readonly string[];
          }
        | undefined;

    // invoke_command:timeout_ms(0.9.0 引入,0.10.3 文档仍收录)+with_logs(0.10.2)
    expect(propOf('invoke_command', 'timeout_ms')?.type).toBe('integer');
    expect(propOf('invoke_command', 'with_logs')?.type).toBe('boolean');
    // wait_for:condition 枚举补 log + level/fields/since_seq(0.10.2)
    expect(propOf('wait_for', 'condition')?.enum).toEqual([
      'text',
      'text_gone',
      'selector',
      'selector_gone',
      'url',
      'ipc_idle',
      'network_idle',
      'expression',
      'event',
      'log',
    ]);
    expect(propOf('wait_for', 'level')?.type).toBe('string');
    expect(propOf('wait_for', 'fields')?.type).toBe('object');
    expect(propOf('wait_for', 'since_seq')?.type).toBe('integer');
    // find_elements:title_attr(0.10.3 文档)+attribute/attribute_value/text_exact/include_hidden(CHANGELOG)
    for (const key of [
      'title_attr',
      'attribute',
      'attribute_value',
      'text_exact',
      'include_hidden',
    ]) {
      expect(propOf('find_elements', key), key).toBeDefined();
    }
    expect(propOf('find_elements', 'text_exact')?.type).toBe('boolean');
    expect(propOf('find_elements', 'include_hidden')?.type).toBe('boolean');

    // 新增参数全部可选(透传型,不得标 required)且必须带来源标注
    const NEW_PARAMS: readonly (readonly [string, string])[] = [
      ['invoke_command', 'timeout_ms'],
      ['invoke_command', 'with_logs'],
      ['wait_for', 'level'],
      ['wait_for', 'fields'],
      ['wait_for', 'since_seq'],
      ['find_elements', 'title_attr'],
      ['find_elements', 'attribute'],
      ['find_elements', 'attribute_value'],
      ['find_elements', 'text_exact'],
      ['find_elements', 'include_hidden'],
    ];
    for (const [tool, key] of NEW_PARAMS) {
      const prop = propOf(tool, key);
      expect(prop, `${tool}.${key}`).toBeDefined();
      expect(prop?.required, `${tool}.${key}.required`).toBeUndefined();
      expect(prop?.description, `${tool}.${key}.description`).toMatch(
        /\[(文档|CHANGELOG|实测)/,
      );
    }

    // 后端日志三段式套路与捕获量旋钮落在 invoke_command / wait_for 描述里
    for (const tool of ['invoke_command', 'wait_for']) {
      const desc = specOf(tool).description;
      expect(desc, tool).toContain('backend_log_cursor');
      expect(desc, tool).toContain('VICTAURI_LOG_LEVEL');
      expect(desc, tool).toContain('VICTAURI_LOG_CAPACITY');
    }
    // wait_for.condition 仍是必填（0.8.8 实测 missing field `condition`）
    expect(propOf('wait_for', 'condition')?.required).toBe(true);
  });

  it('批八 2/4 schema 收尾:verify_state backend_args、animation 3 值、别名标注 [桥]', () => {
    const specOf = (name: string, specs = REST_TOOL_SPECS) =>
      specs.find((spec) => spec.name === name)!;
    const propOf = (name: string, key: string) =>
      specOf(name).parameters[key] as
        { type?: string; description?: string; required?: true } | undefined;

    // P1-1 verify_state 补 backend_args（上游 verification_params.rs:16 Option<Value>）
    const backendArgs = propOf('verify_state', 'backend_args');
    expect(backendArgs).toBeDefined();
    expect(backendArgs?.type).toBe('object');
    expect(backendArgs?.required).toBeUndefined();
    expect(backendArgs?.description).toMatch(/\[文档/);
    expect(specOf('verify_state').description).toContain('backend_args');

    // P2-4/P2-5 别名标注 [文档]→[桥]（上游两源均无该别名，属插件本地归一）
    expect(propOf('eval_js', 'expression')?.description).toMatch(/\[桥/);
    expect(propOf('eval_js', 'expression')?.description).not.toMatch(/\[文档/);
    expect(propOf('query_db', 'sql')?.description).toMatch(/\[桥/);
    expect(propOf('query_db', 'sql')?.description).not.toMatch(/\[文档/);

    // P1-2 animation.action 移除已废弃 clear（0.10.3 基线三动作）+ 0.8.8 兼容口径
    const animation = specOf('animation', COMPOUND_TOOL_SPECS);
    expect(
      (animation.parameters['action'] as { enum?: readonly string[] }).enum,
    ).toEqual(['list', 'scrub', 'sample']);
    expect(animation.description).toContain('0.8.8');
    expect(animation.description).toContain('clear:true');
    // animation 的参数集合不变（clear 参数是 sample 的清空开关，与 action=clear 无关）
    expect(animation.parameters).toHaveProperty('clear');
  });

  it('compound 0.10.3 对齐:logs/window 新动作与参数齐备，route/recording/storage 口径同步', () => {
    const specOf = (name: string) =>
      COMPOUND_TOOL_SPECS.find((spec) => spec.name === name)!;
    const propOf = (name: string, key: string) =>
      specOf(name).parameters[key] as
        | {
            type?: string;
            description?: string;
            required?: true;
            enum?: readonly string[];
          }
        | undefined;

    // logs：0.10.2 起新增 backend/backend_digest/stdout 三个动作
    expect(compoundActionOf(specOf('logs'))).toContain('backend');
    expect(compoundActionOf(specOf('logs'))).toContain('backend_digest');
    expect(compoundActionOf(specOf('logs'))).toContain('stdout');
    // logs：参数全集精确锁定（新增 action 不应顺带引入未登记的参数）
    expect(Object.keys(specOf('logs').parameters).sort()).toEqual([
      'action',
      'bodies',
      'fields',
      'filter',
      'level',
      'limit',
      'since',
      'since_seq',
      'target',
      'threshold_ms',
      'wait_for_capture',
      'webview_label',
    ]);
    // logs：新增参数全部可选（透传型）且带类型
    for (const key of ['bodies', 'level', 'target', 'fields', 'since_seq']) {
      const prop = propOf('logs', key);
      expect(prop, `logs.${key}`).toBeDefined();
      expect(prop?.required, `logs.${key}.required`).toBeUndefined();
    }
    expect(propOf('logs', 'bodies')?.type).toBe('boolean');
    expect(propOf('logs', 'level')?.type).toBe('string');
    expect(propOf('logs', 'target')?.type).toBe('string');
    expect(propOf('logs', 'fields')?.type).toBe('object');
    expect(propOf('logs', 'since_seq')?.type).toBe('integer');
    // logs：新增参数须带来源标注（level/target/since_seq/fields 自 0.10.2，bodies 自 0.10.3）
    for (const key of ['bodies', 'level', 'target', 'fields', 'since_seq']) {
      expect(
        propOf('logs', key)?.description,
        `logs.${key}.description`,
      ).toMatch(/\[(文档|源码)/);
    }
    expect(propOf('logs', 'bodies')?.description).toContain('0.10.3');
    for (const key of ['level', 'target', 'fields', 'since_seq']) {
      expect(
        propOf('logs', key)?.description,
        `logs.${key}.description`,
      ).toContain('0.10.2 起');
    }
    // logs：描述须写明游标分页语义与 stdout 游标不透明/gap
    const logsDesc = specOf('logs').description;
    expect(logsDesc).toContain('next_seq');
    expect(logsDesc).toContain('gap:true');
    expect(logsDesc).toContain('backend_digest');
    expect(logsDesc).toMatch(/带 since_seq 的读取返回游标之后最旧的条目/);
    expect(logsDesc).toContain('next_seq 不透明');
    expect(logsDesc).toMatch(/gap:true 表示[^。]*轮转/);
    // logs：捕获门槛须写明（装 log_layer/log_logger/wrap_logger 之一）
    expect(logsDesc).toContain('log_layer');
    expect(logsDesc).toContain('wrap_logger');
    // logs：版本口径须区分「0.10.2 已有」与「0.8.8 无」
    expect(logsDesc).toContain(
      '0.8.8 的 LogsParams 无 level/target/since_seq/fields/bodies',
    );
    expect(logsDesc).not.toMatch(/0\.8\.8 与 0\.10\.2 的 LogsParams 无/);
    expect(logsDesc).toContain('0.10.2 起已含 level/target/since_seq/fields');
    // logs：须说明「新增动作报错 / 新增参数静默忽略」两类兼容性差异
    expect(logsDesc).toMatch(/新增动作[^。]*报错/);
    expect(logsDesc).toMatch(/新增参数[^。]*静默忽略/);

    // window：0.8.8/0.10.2 源码均已含 introspectability 动作
    expect(compoundActionOf(specOf('window'))).toContain('introspectability');
    // window：resize/move_to 的读回值 + settled 语义须在描述里
    const windowDesc = specOf('window').description;
    expect(windowDesc).toContain('requested');
    expect(windowDesc).toMatch(/settled:false 表示[^。]*500ms/);
    expect(windowDesc).toContain('victauri:default');
    expect(windowDesc).toContain('introspectable');

    // route：0.10.3 起 fetch 与 XHR 都支持 fulfill；Tauri IPC 规则语义须写明
    const routeDesc = specOf('route').description;
    expect(routeDesc).toContain('fetch 与 XHR 均支持全部 behavior');
    expect(routeDesc).not.toContain('只观察不控制');
    expect(routeDesc).not.toContain('（fetch 支持，XHR 回退 delay）');
    expect(routeDesc).toContain('Tauri-Response');
    expect(routeDesc).toContain('ipc.localhost');
    expect(routeDesc).toContain('invoke 才 resolve');
    expect(routeDesc).toContain('postMessage');
    expect(routeDesc).toContain('ipc_note');
    expect(routeDesc).toContain(
      '不进入 ghost detection/command_catalog/coverage',
    );
    expect(routeDesc).toContain('不计入 command_timings');
    expect(routeDesc).toContain('postMessage IPC 不受影响');

    // recording：replay 语义改为 0.10.x 口径（只重放无参成功调用、不与基线 diff）
    const recordingDesc = specOf('recording').description;
    expect(recordingDesc).toContain('skipped');
    expect(recordingDesc).toContain('blocked');
    expect(recordingDesc).toContain('不与原响应 diff');
    expect(recordingDesc).toContain('绝不回退 main');
    expect(recordingDesc).toContain('webview_label 只过滤');
    expect(recordingDesc).toContain('重放真实产生副作用');
    expect(recordingDesc).not.toMatch(/replay[^。]*与基线比对/);

    // storage：get_cookies 仅非 httpOnly
    expect(specOf('storage').description).toContain('httpOnly');

    // explain/fault 的 webview_label 已按源码证据定稿，不再留 [INFERENCE] 待证
    const explainLabel = propOf('explain', 'webview_label');
    const faultLabel = propOf('fault', 'webview_label');
    expect(explainLabel).toBeDefined();
    expect(faultLabel).toBeDefined();
    expect(explainLabel?.description).not.toContain('[INFERENCE]');
    expect(faultLabel?.description).not.toContain('[INFERENCE]');
    expect(explainLabel?.description).toContain('[源码]');
    expect(faultLabel?.description).toContain('[源码]');
    expect(explainLabel?.description).toContain('传入被静默忽略、不报错');
    expect(faultLabel?.description).toContain('均未定义该字段');
    expect(faultLabel?.description).toContain('不改变故障规则的作用域');
  });
});
