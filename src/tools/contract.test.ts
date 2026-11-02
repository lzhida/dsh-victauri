/**
 * 包级契约测试：三批工具（standalone 20 + compound 15 + CLI 桥 1 = 36）
 * 的名字唯一性、前缀统一、数量口径与复合工具 action 结构。
 *
 * 口径四处一致：本文件 = README「工具清单」= docs/TOOLS.md = catalog 头注释。
 */
import { describe, expect, it } from 'vitest';

import { victauriCliTool } from './cli.ts';
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

describe('dsh-victauri 工具面契约', () => {
  it('数量口径:standalone 20 + compound 15 + CLI 1 = 36,与 README/docs/catalog 一致', () => {
    expect(STANDALONE_TOOL_COUNT).toBe(20);
    expect(COMPOUND_TOOL_COUNT).toBe(15);
    expect(STANDALONE_TOOL_COUNT + COMPOUND_TOOL_COUNT).toBe(35);
    expect(STANDALONE_TOOL_COUNT + COMPOUND_TOOL_COUNT + 1).toBe(36);
    expect(REST_TOOL_SPECS).toHaveLength(STANDALONE_TOOL_COUNT);
    expect(COMPOUND_TOOL_SPECS).toHaveLength(COMPOUND_TOOL_COUNT);
  });

  it('36 个 dsh 工具名全局唯一且统一 victauri_ 前缀', () => {
    const standalone = createStandaloneTools(REST_TOOL_SPECS, {
      getClient: null as never,
    });
    const compound = createCompoundTools({ getClient: null as never });
    const names = [
      ...standalone.map((t) => t.name),
      ...compound.map((t) => t.name),
      victauriCliTool.name,
    ];
    expect(names).toHaveLength(36);
    expect(new Set(names).size).toBe(36);
    for (const name of names) {
      expect(name.startsWith('victauri_'), name).toBe(true);
    }
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
});
