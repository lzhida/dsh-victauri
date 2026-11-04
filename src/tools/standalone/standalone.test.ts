import { existsSync, readFileSync, rmSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CLI_ACTIONS, isCliAction } from '../../cli.ts';
import type { VictauriClient } from '../../client.ts';
import { VictauriError } from '../../errors.ts';
import { REST_TOOL_SPECS, STANDALONE_TOOL_COUNT } from './catalog.ts';
import { createRestBridgeTool } from './bridge.ts';
import { IMAGE_DIR_NAME } from './image.ts';
import { RENDER_MAX_CHARS, renderJson } from './render.ts';

/** 最小 mock client:只实现 callTool,记录调用入参与第三参请求预算。 */
function mockClient(
  impl: (name: string, args: Record<string, unknown>) => Promise<unknown>,
): {
  client: VictauriClient;
  calls: Array<{
    name: string;
    args: Record<string, unknown>;
    budget?: number;
  }>;
} {
  const calls: Array<{
    name: string;
    args: Record<string, unknown>;
    budget?: number;
  }> = [];
  const client = {
    callTool: async (
      name: string,
      args: Record<string, unknown>,
      budget?: number,
    ) => {
      calls.push({ name, args, budget });
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
    // 全量口径:Victauri 35(standalone 20 + compound 15)+ CLI 桥 1 + CLI 探测 1
    // + 工具发现 1 = 38 dsh 工具
    // (CLI_ACTIONS.length=13 是子命令数,不是工具数)
    const COMPOUND_COUNT = 15;
    expect(STANDALONE_TOOL_COUNT).toBe(20);
    expect(STANDALONE_TOOL_COUNT + COMPOUND_COUNT).toBe(35);
    expect(STANDALONE_TOOL_COUNT + COMPOUND_COUNT + 3).toBe(38);
    expect(CLI_ACTIONS.length).toBe(13);
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
      getClient: async () => client,
    });
    const result = (await tool.execute({}, {} as never)) as AnyRecord;
    expect(calls[0]?.name).toBe('app_info');
    expect(calls[0]?.args).toEqual({});
    expect(result).toEqual(payload);
  });

  it('eval_js 别名归一:expression 无 code 时归一为 code', async () => {
    const { client, calls } = mockClient(async () => ({ value: 2 }));
    const tool = createRestBridgeTool(specOf('eval_js'), {
      getClient: async () => client,
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
      getClient: async () => client,
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
      getClient: async () => client,
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
      getClient: async () => client,
    });
    const result = (await tool.execute({}, {} as never)) as AnyRecord;
    const path = result['path'] as string;
    expect(path).toContain(IMAGE_DIR_NAME);
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
      getClient: async () => client,
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
      getClient: async () => client,
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

  it('with_logs 载荷超长时摘要化 backend_logs 并保留 backend_log_cursor（S-3 回归）', () => {
    // 复刻 invoke_command {with_logs:true} 的 0.10.3 五键返回体：cursor 排在
    // backend_logs 之后，旧行为（截头 6000）会把游标丢掉——三段式第②步拿不到它。
    const payload = {
      result: { ok: true },
      backend_logs: Array.from({ length: 120 }, (_, i) => ({
        seq: i,
        level: 'info',
        target: 'app::module',
        fields: { run_type: 'foreground' },
        message: 'x'.repeat(150),
      })),
      backend_logs_hint: '…',
      backend_log_cursor: 42,
      next_seq: 43,
    };
    const [block] = renderJson(payload) as Array<{ text: string }>;
    // 游标与序列必须原样保留（三段式第②步的 since_seq 来源）
    expect(block.text).toContain('"backend_log_cursor": 42');
    expect(block.text).toContain('"next_seq": 43');
    // 摘要标记可见，且不再是 120 条全文
    expect(block.text).toContain('已摘要化');
    expect(block.text).not.toContain('"seq": 119');
    // 短载荷（≤5 条）不被摘要化，保持原样
    const small = renderJson({
      result: {},
      backend_logs: [{ seq: 0 }],
      backend_log_cursor: 1,
    }) as Array<{ text: string }>;
    expect(small[0].text).toContain('"seq": 0');
    expect(small[0].text).not.toContain('已摘要化');
  });

  it('T-1 闭集枚举在客户端前置拒绝:请求不发出(负向护栏)', async () => {
    const { client, calls } = mockClient(async () => ({}));
    const tool = createRestBridgeTool(specOf('wait_for'), {
      getClient: async () => client,
    });
    // 枚举越界:condition:'bogus' 必须被 dsh-tools 参数校验拒绝
    await expect(
      tool.execute({ condition: 'bogus', value: 'x' }, {} as never),
    ).rejects.toThrow(/must be one of/);
    // 缺必填 condition:同样前置拒绝
    await expect(tool.execute({ value: 'x' }, {} as never)).rejects.toThrow(
      /missing required property "condition"/,
    );
    // 类型错:since_seq 必须是 integer
    await expect(
      tool.execute(
        { condition: 'log', value: 'ready', since_seq: '42' },
        {} as never,
      ),
    ).rejects.toThrow(/must be an integer/);
    // 三种越界的请求都未发出(校验在客户端,服务端零流量)
    expect(calls).toHaveLength(0);
  });

  it('T-3 invoke_command.timeout_ms 与本通道 REST 预算脱钩(mock 记录第三参)', async () => {
    const { client, calls } = mockClient(async () => ({ ok: true }));
    const invokeTool = createRestBridgeTool(specOf('invoke_command'), {
      getClient: async () => client,
    });
    await invokeTool.execute(
      { command: 'greet', timeout_ms: 120_000 },
      {} as never,
    );
    // timeout_ms 原样透传给服务端(服务端整次调用预算),但第三参 budget 为 undefined:
    // 本通道 REST 预算走客户端默认链(30s),invoke_command 未单独放宽——两层预算独立
    expect(calls[0]?.args).toEqual({ command: 'greet', timeout_ms: 120_000 });
    expect(calls[0]?.budget).toBeUndefined();

    // 对照:wait_for 的 timeout_ms 会动态换算为本通道预算(timeout_ms+5s 夹 120s 上限)
    const waitTool = createRestBridgeTool(specOf('wait_for'), {
      getClient: async () => client,
    });
    await waitTool.execute(
      { condition: 'url', value: '/ready', timeout_ms: 120_000 },
      {} as never,
    );
    expect(calls[1]?.budget).toBe(120_000);
  });

  it('CLI_ACTIONS 与 standalone 目录无工具名冲突(命名空间分离)', () => {
    const standalone = new Set(REST_TOOL_SPECS.map((spec) => spec.name));
    for (const action of CLI_ACTIONS.filter((a) => isCliAction(a))) {
      // victauri invoke(CLI 子命令)与 invoke_command(REST 工具)不同名,不冲突
      expect(standalone.has(action)).toBe(false);
    }
    expect(standalone.size).toBe(20);
  });

  it('0.10.3 新增参数原样透传给服务端(invoke_command/wait_for/find_elements)', async () => {
    const { client, calls } = mockClient(async () => ({ ok: true }));

    // invoke_command:timeout_ms + with_logs 透传（不被丢弃、不被字符串化）
    const invokeTool = createRestBridgeTool(specOf('invoke_command'), {
      getClient: async () => client,
    });
    await invokeTool.execute(
      {
        command: 'greet',
        args: { name: 'x' },
        timeout_ms: 120_000,
        with_logs: true,
      },
      {} as never,
    );
    expect(calls[0]?.name).toBe('invoke_command');
    expect(calls[0]?.args).toEqual({
      command: 'greet',
      args: { name: 'x' },
      timeout_ms: 120_000,
      with_logs: true,
    });

    // wait_for:condition=log + level/fields/since_seq 透传（fields 为对象不字符串化）
    const waitTool = createRestBridgeTool(specOf('wait_for'), {
      getClient: async () => client,
    });
    await waitTool.execute(
      {
        condition: 'log',
        value: 'pipeline_run',
        level: 'warn',
        fields: { run_type: 'foreground' },
        since_seq: 42,
      },
      {} as never,
    );
    expect(calls[1]?.name).toBe('wait_for');
    expect(calls[1]?.args).toEqual({
      condition: 'log',
      value: 'pipeline_run',
      level: 'warn',
      fields: { run_type: 'foreground' },
      since_seq: 42,
    });

    // find_elements:title_attr + 0.10.3 四新参透传
    const findTool = createRestBridgeTool(specOf('find_elements'), {
      getClient: async () => client,
    });
    await findTool.execute(
      {
        title_attr: '保存',
        attribute: 'data-role',
        attribute_value: 'primary',
        text_exact: true,
        include_hidden: true,
      },
      {} as never,
    );
    expect(calls[2]?.name).toBe('find_elements');
    expect(calls[2]?.args).toEqual({
      title_attr: '保存',
      attribute: 'data-role',
      attribute_value: 'primary',
      text_exact: true,
      include_hidden: true,
    });
  });
});
