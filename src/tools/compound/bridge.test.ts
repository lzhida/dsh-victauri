/**
 * compound 桥运行时透传测试（gap-list T-5）：
 * compound 15 个工具与 standalone 共用 createRestBridgeTool 工厂，
 * 此前 0 运行时覆盖——用 logs（含 since_seq integer 校验与闭集枚举）
 * 与 route（未知顶层参数放行）验证「客户端校验 → 透传」链路。
 */
import { describe, expect, it } from 'vitest';

import type { VictauriClient } from '../../client.ts';
import { COMPOUND_TOOL_SPECS } from './catalog.ts';
import { createRestBridgeTool } from '../standalone/bridge.ts';

/**
 * 最小 mock client:记录调用入参。
 * 计数用对象承载(闭包引用),避免解构基础类型得到值快照导致断言恒旧。
 */
function mockClient(impl: () => Promise<unknown>): {
  client: VictauriClient;
  state: { calls: number };
} {
  const state = { calls: 0 };
  const client = {
    callTool: async () => {
      state.calls += 1;
      return impl();
    },
  } as unknown as VictauriClient;
  return { client, state };
}

const specOf = (name: string) =>
  COMPOUND_TOOL_SPECS.find((spec) => spec.name === name)!;

describe('compound 桥运行时透传(共用 standalone 工厂)', () => {
  it('logs.since_seq 类型错在客户端前置拒绝,请求不发出', async () => {
    const { client, state } = mockClient(async () => ({}));
    const tool = createRestBridgeTool(specOf('logs'), {
      getClient: async () => client,
    });
    await expect(
      tool.execute({ action: 'backend', since_seq: '7' }, {} as never),
    ).rejects.toThrow(/must be an integer/);
    expect(state.calls).toBe(0);
  });

  it('logs 未知 action 枚举报错(闭集校验含 backend/backend_digest/stdout)', async () => {
    const { client, state } = mockClient(async () => ({}));
    const tool = createRestBridgeTool(specOf('logs'), {
      getClient: async () => client,
    });
    await expect(tool.execute({ action: 'nope' }, {} as never)).rejects.toThrow(
      /must be one of/,
    );
    expect(state.calls).toBe(0);
    // 闭集含 0.10.2 新动作:合法值不被本地拒绝
    const result = (await tool.execute(
      { action: 'backend_digest' },
      {} as never,
    )) as Record<string, unknown>;
    expect(state.calls).toBe(1);
    expect(result).not.toHaveProperty('error');
  });

  it('route 未知顶层参数放行(透传语义,由服务端决定取舍)', async () => {
    const { client, state } = mockClient(async () => ({ added: true }));
    const tool = createRestBridgeTool(specOf('route'), {
      getClient: async () => client,
    });
    const result = (await tool.execute(
      {
        action: 'add',
        pattern: 'https://example.com/api',
        behavior: 'fulfill',
        totally_unknown_key: 1,
      },
      {} as never,
    )) as Record<string, unknown>;
    expect(state.calls).toBe(1);
    expect(result).toEqual({ added: true });
  });
});
