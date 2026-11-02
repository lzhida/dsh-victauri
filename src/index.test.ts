import { afterEach, describe, expect, it, vi } from 'vitest';
import { apply, inject, name, TOTAL_TOOL_COUNT } from './index.js';
import { COMPOUND_TOOL_SPECS } from './tools/compound/index.ts';
import { REST_TOOL_SPECS } from './tools/standalone/index.ts';

interface StubCtx {
  tools: { register: ReturnType<typeof vi.fn> };
  log: string[];
}

/** 最小模拟 cordis Context：只实现 tools.register 与日志收集。 */
function stubCtx(): StubCtx {
  const log: string[] = [];
  return {
    log,
    tools: {
      register: vi.fn((tool: { name: string }) => {
        log.push(`register:${tool.name}`);
      }),
    },
  };
}

describe('dsh-victauri', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('name 与插件 kebab 名一致', () => {
    expect(name).toBe('dsh-victauri');
  });

  it('inject 声明依赖 tools', () => {
    expect(inject).toEqual(['tools']);
  });

  it('TOTAL_TOOL_COUNT 与 20+15+1 口径一致', () => {
    expect(TOTAL_TOOL_COUNT).toBe(
      REST_TOOL_SPECS.length + COMPOUND_TOOL_SPECS.length + 1,
    );
    expect(TOTAL_TOOL_COUNT).toBe(36);
  });

  it('apply 注册全量 36 工具并打印装载日志', () => {
    const ctx = stubCtx();
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      ctx.log.push(msg);
    });
    apply(ctx as never);
    expect(ctx.tools.register).toHaveBeenCalledTimes(36);
    expect(
      ctx.log.some((line) => line.startsWith(`[${name}] plugin loaded`)),
    ).toBe(true);
    expect(
      ctx.log.some((line) => line.includes('registered 36 victauri tools')),
    ).toBe(true);
    const names = ctx.tools.register.mock.calls.map(
      (call) => (call[0] as { name: string }).name,
    );
    expect(new Set(names).size).toBe(36);
    expect(names).toContain('victauri_cli');
    expect(names).toContain('victauri_eval_js');
    expect(names).toContain('victauri_introspect');
  });

  it('disabledTools 按全名过滤注册并计入日志', () => {
    const ctx = stubCtx();
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      ctx.log.push(msg);
    });
    apply(ctx as never, { disabledTools: ['victauri_trace', 'victauri_cli'] });
    expect(ctx.tools.register).toHaveBeenCalledTimes(34);
    const names = ctx.tools.register.mock.calls.map(
      (call) => (call[0] as { name: string }).name,
    );
    expect(names).not.toContain('victauri_trace');
    expect(names).not.toContain('victauri_cli');
    expect(
      ctx.log.some((line) => line.includes('(2 disabled by config)')),
    ).toBe(true);
  });

  it('非法配置降级默认（工具照常注册 36）', () => {
    const ctx = stubCtx();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    apply(ctx as never, { requestTimeoutMs: 'not-a-number' });
    expect(ctx.tools.register).toHaveBeenCalledTimes(36);
    expect(logSpy).toHaveBeenCalled();
  });
});
