import { afterEach, describe, expect, it, vi } from 'vitest';
import { apply, name } from './index.js';

describe('dsh-victauri', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('name 与插件 kebab 名一致', () => {
    expect(name).toBe('dsh-victauri');
  });

  it('apply 立即执行 effect 并在卸载时调用清理函数', () => {
    const cleanups: Array<() => void> = [];
    const ctx = {
      effect: vi.fn((fn: () => () => void) => {
        cleanups.push(fn());
      }),
    };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    apply(ctx as never);
    expect(ctx.effect).toHaveBeenCalledTimes(1);
    expect(cleanups).toHaveLength(1);
    expect(() => cleanups[0]()).not.toThrow();
  });
});
