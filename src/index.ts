import type { Context } from '@deepseek-ai/cordis';

export const name = 'dsh-victauri';

export function apply(ctx: Context): void {
  console.log(`[${name}] plugin loaded`);
  // effect 回调立即执行,返回的 disposer 在插件卸载时由 cordis 调用。
  ctx.effect(() => {
    return () => {};
  });
}
