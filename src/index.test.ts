import { afterEach, describe, expect, it, vi } from 'vitest';
import { apply, inject, name, TOTAL_TOOL_COUNT } from './index.js';
import { SKILL_NAME } from './skill-content.ts';
import { COMPOUND_TOOL_SPECS } from './tools/compound/index.ts';
import { REST_TOOL_SPECS } from './tools/standalone/index.ts';

interface StubCtx {
  tools: { register: ReturnType<typeof vi.fn> };
  skills: { register: ReturnType<typeof vi.fn> };
  log: string[];
}

/** 最小模拟 cordis Context：只实现 tools/skills 的 register 与日志收集。 */
function stubCtx(): StubCtx {
  const log: string[] = [];
  return {
    log,
    tools: {
      register: vi.fn((tool: { name: string }) => {
        log.push(`register:${tool.name}`);
      }),
    },
    skills: {
      register: vi.fn((skill: { name: string }) => {
        log.push(`register-skill:${skill.name}`);
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

  it('inject 声明依赖 tools 与 skills', () => {
    expect(inject).toEqual(['tools', 'skills']);
  });

  it('TOTAL_TOOL_COUNT 与 20+15+1+1+1 口径一致', () => {
    expect(TOTAL_TOOL_COUNT).toBe(
      REST_TOOL_SPECS.length + COMPOUND_TOOL_SPECS.length + 3,
    );
    expect(TOTAL_TOOL_COUNT).toBe(38);
  });

  it('apply 注册全量 38 工具并打印装载日志', () => {
    const ctx = stubCtx();
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      ctx.log.push(msg);
    });
    apply(ctx as never);
    expect(ctx.tools.register).toHaveBeenCalledTimes(38);
    expect(
      ctx.log.some((line) => line.startsWith(`[${name}] plugin loaded`)),
    ).toBe(true);
    expect(
      ctx.log.some((line) => line.includes('registered 38 victauri tools')),
    ).toBe(true);
    const names = ctx.tools.register.mock.calls.map(
      (call) => (call[0] as { name: string }).name,
    );
    expect(new Set(names).size).toBe(38);
    expect(names).toContain('victauri_cli');
    expect(names).toContain('victauri_cli_status');
    expect(names).toContain('victauri_eval_js');
    expect(names).toContain('victauri_introspect');
  });

  it('apply 注册内嵌 skill victauri-fullstack-debug（bundled，双面可调用）', () => {
    const ctx = stubCtx();
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      ctx.log.push(msg);
    });
    apply(ctx as never);
    expect(ctx.skills.register).toHaveBeenCalledTimes(1);
    const skill = ctx.skills.register.mock.calls[0][0] as {
      name: string;
      description: string;
      content: string;
      source: string;
      invocation: { modelInvocable: boolean; userInvocable: boolean };
    };
    expect(skill.name).toBe(SKILL_NAME);
    expect(skill.name).toBe('victauri-fullstack-debug');
    expect(skill.source).toBe('bundled');
    expect(skill.description.length).toBeGreaterThan(20);
    expect(skill.content).toContain('后端验证三段式');
    expect(skill.content).toContain('窗口盲区排障');
    expect(skill.invocation).toEqual({
      modelInvocable: true,
      userInvocable: true,
    });
    // skill 注册日志不破坏 e2e 契约行（工具行先打，skill 行另起）。
    const toolLine = ctx.log.find((line) =>
      line.includes('registered 38 victauri tools'),
    );
    const skillLine = ctx.log.find((line) =>
      line.includes(`registered skill ${SKILL_NAME}`),
    );
    expect(toolLine).toBeDefined();
    expect(skillLine).toBeDefined();
    expect(ctx.log.indexOf(toolLine ?? '')).toBeLessThan(
      ctx.log.indexOf(skillLine ?? ''),
    );
  });

  it('disabledTools 按全名过滤注册并计入日志', () => {
    const ctx = stubCtx();
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      ctx.log.push(msg);
    });
    apply(ctx as never, { disabledTools: ['victauri_trace', 'victauri_cli'] });
    expect(ctx.tools.register).toHaveBeenCalledTimes(36);
    const names = ctx.tools.register.mock.calls.map(
      (call) => (call[0] as { name: string }).name,
    );
    expect(names).not.toContain('victauri_trace');
    expect(names).not.toContain('victauri_cli');
    expect(
      ctx.log.some((line) => line.includes('(2 disabled by config)')),
    ).toBe(true);
  });

  it('非法配置降级默认（工具照常注册 38）', () => {
    const ctx = stubCtx();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    apply(ctx as never, { requestTimeoutMs: 'not-a-number' });
    expect(ctx.tools.register).toHaveBeenCalledTimes(38);
    expect(logSpy).toHaveBeenCalled();
  });
});
