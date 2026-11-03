import { describe, expect, it } from 'vitest';

import {
  CLI_ACTIONS,
  CLI_ACTION_SPECS,
  buildActionHint,
  buildActionHints,
  buildCliToolDescription,
} from './cli-hints.ts';
import { isCliAction } from './cli.ts';
import { createVictauriCliTool } from './tools/cli.ts';

/** 取工具编译后参数 schema 里的 action enum。 */
function actionEnumOfTool(): string[] {
  const tool = createVictauriCliTool({ cliPath: process.execPath });
  const parameters = tool.parameters as unknown as {
    properties: Record<string, { enum?: string[] }>;
  };
  return parameters.properties['action']?.enum ?? [];
}

describe('dsh-victauri cli 子命令口径与版本感知提示', () => {
  it('CLI_ACTIONS 与规格表同源:新增子命令只需改 CLI_ACTION_SPECS 一处', () => {
    expect(Object.keys(CLI_ACTION_SPECS)).toEqual([...CLI_ACTIONS]);
    expect(CLI_ACTIONS.length).toBe(9);
    for (const action of CLI_ACTIONS) {
      expect(isCliAction(action)).toBe(true);
      expect(CLI_ACTION_SPECS[action].summary.length).toBeGreaterThan(0);
    }
  });

  it('工具参数 enum 与 CLI_ACTIONS 一致(enum/hints 不漂移)', () => {
    expect(actionEnumOfTool()).toEqual([...CLI_ACTIONS]);
  });

  it('0.8.8 下 hints 不提示 doctor 的 --json(实测 0.8.8 不支持该选项)', () => {
    const hints = buildActionHints('0.8.8');
    expect(hints.doctor.notes.join(' ')).not.toContain('--json');
    expect(hints.doctor.notes.join(' ')).not.toContain('JSON');
    expect(JSON.stringify(hints)).not.toContain('--json');
  });

  it('0.10.0 起 hints 提示 doctor 支持 --json', () => {
    const hints = buildActionHints('0.10.0');
    expect(hints.doctor.notes.join(' ')).toContain('--json');
  });

  it('版本未知时不外推任何版本门控文本', () => {
    const hints = buildActionHints(null);
    expect(hints.doctor.notes).toEqual([]);
    expect(JSON.stringify(hints)).not.toContain('--json');
  });

  it('版本门控按数值段比较:0.10.0 命中 ≥0.10.0 的提示', () => {
    expect(buildActionHint('doctor', '0.9.9').notes.join(' ')).not.toContain(
      '--json',
    );
    expect(buildActionHint('doctor', '0.10.0').notes.join(' ')).toContain(
      '--json',
    );
    expect(buildActionHint('doctor', '0.10.1').notes.join(' ')).toContain(
      '--json',
    );
  });

  it('watch/bridge 标注长驻 + 非交互 + 需配合 timeout_ms', () => {
    const hints = buildActionHints('0.8.8');
    for (const action of ['watch', 'bridge'] as const) {
      expect(hints[action].longRunning).toBe(true);
      expect(hints[action].interactive).toBe(false);
      expect(hints[action].summary).toContain('timeout_ms');
      expect(hints[action].notes.join(' ')).toContain('timeout_ms');
    }
    expect(hints.bridge.notes.join(' ')).toContain('stdio');
    expect(hints.doctor.longRunning).toBe(false);
    expect(hints.init.longRunning).toBe(false);
  });

  it('工具描述写明 timeout_ms / cwd / 结构化输出 / hints 字段', () => {
    const description = buildCliToolDescription('0.8.8');
    expect(description).toContain('timeout_ms');
    expect(description).toContain('cwd');
    expect(description).toContain('doctor');
    expect(description).toContain('hints');
    expect(description).toContain('timed_out=true');
    expect(description).toContain('partial=true');
    // 0.8.8 下描述不得出现 --json(版本门控文案只在输出 hints 里)
    expect(description).not.toContain('--json');
  });

  it('工具描述列出全部子命令(action=...)', () => {
    const description = buildCliToolDescription(null);
    for (const action of CLI_ACTIONS) {
      expect(description).toContain(`${action}=`);
    }
  });
});
