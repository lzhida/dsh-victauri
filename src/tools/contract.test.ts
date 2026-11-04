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
      animation: ['list', 'scrub', 'sample', 'clear'],
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
      window: ['get_state', 'list', 'manage', 'resize', 'move_to', 'set_title'],
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
});
