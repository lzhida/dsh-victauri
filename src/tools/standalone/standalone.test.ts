import { existsSync, readFileSync, rmSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CLI_ACTIONS, isCliAction } from '../../cli.ts';
import type { VictauriClient } from '../../client.ts';
import { VictauriError } from '../../errors.ts';
import { REST_TOOL_SPECS, STANDALONE_TOOL_COUNT } from './catalog.ts';
import { createRestBridgeTool } from './bridge.ts';
import { RENDER_MAX_CHARS, SCREENSHOT_DIR_NAME, renderJson } from './render.ts';

/** 最小 mock client:只实现 callTool,记录调用入参。 */
function mockClient(
  impl: (name: string, args: Record<string, unknown>) => Promise<unknown>,
): {
  client: VictauriClient;
  calls: Array<{ name: string; args: Record<string, unknown> }>;
} {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    callTool: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return impl(name, args);
    },
  } as unknown as VictauriClient;
  return { client, calls };
}

/** ToolDefinition.execute 返回 unknown:断言回 Record 形状。 */
type AnyRecord = Record<string, unknown>;

/** 用最小规格构桥(绕过 catalog,聚焦工厂行为)。 */
const specOf = (name: string) =>
  REST_TOOL_SPECS.find((spec) => spec.name === name)!;

describe('dsh-victauri standalone 批', () => {
  it('20 个工具注册齐全且 dsh 名带 victauri_ 前缀(口径=README=docs=契约测试)', () => {
    // 全量口径:Victauri 35(standalone 20 + compound 15)+ CLI 桥 1 个工具 = 36 dsh 工具
    // (CLI_ACTIONS.length=9 是子命令数,不是工具数)
    const COMPOUND_COUNT = 15;
    expect(STANDALONE_TOOL_COUNT).toBe(20);
    expect(STANDALONE_TOOL_COUNT + COMPOUND_COUNT).toBe(35);
    expect(STANDALONE_TOOL_COUNT + COMPOUND_COUNT + 1).toBe(36);
    expect(CLI_ACTIONS.length).toBe(9);
    expect(REST_TOOL_SPECS).toHaveLength(STANDALONE_TOOL_COUNT);
    for (const spec of REST_TOOL_SPECS) {
      const tool = createRestBridgeTool(spec, { getClient: null as never });
      expect(tool.name).toBe(`victauri_${spec.name}`);
    }
  });

  it('6 个单名必填工具的 required 注解与探测一致', () => {
    const requiredMap: Record<string, string[]> = {
      assert_semantic: ['expression', 'condition'],
      invoke_command: ['command'],
      read_app_file: ['path'],
      resolve_command: ['query'],
      verify_state: ['frontend_expr'],
      wait_for: ['condition'],
    };
    for (const [name, fields] of Object.entries(requiredMap)) {
      const parameters = specOf(name).parameters as Record<
        string,
        { required?: boolean }
      >;
      for (const field of fields) {
        expect(parameters[field]?.required, `${name}.${field}`).toBe(true);
      }
    }
    // eval_js/query_db 走别名归一:required 由 execute 兜底(schema 双 optional)
    const evalParams = specOf('eval_js').parameters as Record<
      string,
      { required?: boolean }
    >;
    expect(evalParams['code']?.required).toBeUndefined();
    expect(evalParams['expression']?.required).toBeUndefined();
  });

  it('空参工具(app_info)透传 {} 且返回原样', async () => {
    const payload = { config: { product_name: 'demo' }, env: {} };
    const { client, calls } = mockClient(async () => payload);
    const tool = createRestBridgeTool(specOf('app_info'), {
      getClient: () => client,
    });
    const result = (await tool.execute({}, {} as never)) as AnyRecord;
    expect(calls[0]?.name).toBe('app_info');
    expect(calls[0]?.args).toEqual({});
    expect(result).toEqual(payload);
  });

  it('eval_js 别名归一:expression 无 code 时归一为 code', async () => {
    const { client, calls } = mockClient(async () => ({ value: 2 }));
    const tool = createRestBridgeTool(specOf('eval_js'), {
      getClient: () => client,
    });
    await tool.execute({ expression: '1+1' }, {} as never);
    expect(calls[0]?.args).toEqual({ code: '1+1' });
    // 两者都给时以实测名 code 为准并丢弃别名
    await tool.execute({ code: '2+2', expression: 'ignored' }, {} as never);
    expect(calls[1]?.args).toEqual({ code: '2+2' });
  });

  it('alias 工具缺 primary(两个名都没给)返回结构化错误(execute 兜底)', async () => {
    const { client, calls } = mockClient(async () => ({}));
    const tool = createRestBridgeTool(specOf('eval_js'), {
      getClient: () => client,
    });
    const result = (await tool.execute({}, {} as never)) as AnyRecord;
    const err = result['error'] as AnyRecord;
    expect(err['kind']).toBe('tool-error');
    expect(String(err['message'])).toContain(
      'missing required property "code"',
    );
    expect(calls).toHaveLength(0);
  });

  it('数组结果包装为 {items:[...]}(find_elements 实测顶层数组)', async () => {
    const { client } = mockClient(async () => [
      { tag: 'button' },
      { tag: 'input' },
    ]);
    const tool = createRestBridgeTool(specOf('find_elements'), {
      getClient: () => client,
    });
    const result = (await tool.execute(
      { tag: 'button' },
      {} as never,
    )) as AnyRecord;
    expect(result).toEqual({ items: [{ tag: 'button' }, { tag: 'input' }] });
  });

  it('screenshot base64 落盘 %TEMP%/dsh-victauri 返回路径', async () => {
    // 1x1 红点 PNG 的 base64
    const PNG_BASE64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const { client } = mockClient(async () => ({
      data: PNG_BASE64,
      mimeType: 'image/png',
      type: 'png',
    }));
    const tool = createRestBridgeTool(specOf('screenshot'), {
      getClient: () => client,
    });
    const result = (await tool.execute({}, {} as never)) as AnyRecord;
    const path = result['path'] as string;
    expect(path).toContain(SCREENSHOT_DIR_NAME);
    expect(result['mime_type']).toBe('image/png');
    expect(result['bytes']).toBeGreaterThan(0);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path).byteLength).toBe(result['bytes'] as number);
    rmSync(path, { force: true });
  });

  it('VictauriError 不 throw,返回 {error:{kind,message,hint}} 含自检指引', async () => {
    const { client } = mockClient(async () => {
      throw new VictauriError('no-live-instance', 'all candidates dead');
    });
    const tool = createRestBridgeTool(specOf('get_plugin_info'), {
      getClient: () => client,
    });
    const result = (await tool.execute({}, {} as never)) as AnyRecord;
    const err = result['error'] as AnyRecord;
    expect(err['kind']).toBe('no-live-instance');
    expect(err['message']).toContain('all candidates dead');
    expect(String(err['hint'])).toContain('victauri check');
  });

  it('非 Victauri 异常归一 kind=unknown', async () => {
    const { client } = mockClient(async () => {
      throw new Error('boom');
    });
    const tool = createRestBridgeTool(specOf('app_info'), {
      getClient: () => client,
    });
    const result = (await tool.execute({}, {} as never)) as AnyRecord;
    expect((result['error'] as AnyRecord)['kind']).toBe('unknown');
  });

  it('renderJson pretty-print 且超 RENDER_MAX_CHARS 截断', () => {
    const blocks = renderJson({ a: 1 });
    expect(blocks[0]).toMatchObject({ type: 'text' });
    const long = 'x'.repeat(RENDER_MAX_CHARS + 500);
    const truncated = renderJson({ blob: long });
    const text = (truncated[0] as { text: string }).text;
    expect(text).toContain('截断');
    expect(text.length).toBeLessThan(RENDER_MAX_CHARS + 100);
  });

  it('CLI_ACTIONS 与 standalone 目录无工具名冲突(命名空间分离)', () => {
    const standalone = new Set(REST_TOOL_SPECS.map((spec) => spec.name));
    for (const action of CLI_ACTIONS.filter((a) => isCliAction(a))) {
      // victauri invoke(CLI 子命令)与 invoke_command(REST 工具)不同名,不冲突
      expect(standalone.has(action)).toBe(false);
    }
    expect(standalone.size).toBe(20);
  });
});
