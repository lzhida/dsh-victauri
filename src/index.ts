/**
 * dsh-victauri 插件入口。
 *
 * 主通道 REST 直连（discovery 自动发现 → POST /api/tools/{name}）+
 * 辅通道 victauri CLI spawn；37 个 dsh 工具 = 20 standalone + 15 compound
 * + 1 CLI 桥 + 1 CLI 探测（口径见 docs/TOOLS.md 与 src/tools/contract.test.ts）。
 *
 * 依赖注入：tools（工具注册表）。连接惰性建立——首次工具调用才 discovery
 * 探活，Tauri app 未启动不影响插件装载。
 */

import type { Context } from '@deepseek-ai/cordis';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';

import { connectAuto, VictauriClient } from './client.ts';
import { resolveConfig, type ResolvedVictauriConfig } from './config.ts';
import { scanInstances } from './discovery.ts';
import { VictauriError } from './errors.ts';
import { createVictauriCliTool } from './tools/cli.ts';
import { createVictauriCliStatusTool } from './tools/cli-status.ts';
import {
  COMPOUND_TOOL_SPECS,
  createCompoundTools,
} from './tools/compound/index.ts';
import {
  createStandaloneTools,
  REST_TOOL_SPECS,
} from './tools/standalone/index.ts';

/** Cordis 插件名（loader 依赖）；与包名 kebab 段、patch 行 id 一致。 */
export const name = 'dsh-victauri';

/** 依赖注入：工具注册表。 */
export const inject: string[] = ['tools'];

/** 全量工具数（20 standalone + 15 compound + 1 CLI 桥 + 1 CLI 探测）。 */
export const TOTAL_TOOL_COUNT =
  REST_TOOL_SPECS.length + COMPOUND_TOOL_SPECS.length + 2;

/**
 * 按配置建立 REST 客户端（portOverride 固定端口优先，否则 connectAuto）。
 */
async function makeClient(
  config: ResolvedVictauriConfig,
): Promise<VictauriClient> {
  if (config.portOverride !== null) {
    const candidates = (
      await scanInstances({ identifier: config.appIdentifier ?? undefined })
    ).filter((instance) => instance.port === config.portOverride);
    for (const instance of candidates) {
      try {
        const client = VictauriClient.fromInstance(instance, {
          timeoutMs: config.requestTimeoutMs,
        });
        await client.info();
        return client;
      } catch {
        // 该候选不活，继续下一个。
      }
    }
    throw new VictauriError(
      'no-live-instance',
      `no live victauri instance on port ${config.portOverride}${config.appIdentifier ? ` (identifier ${config.appIdentifier})` : ''}`,
    );
  }
  const { client } = await connectAuto({
    identifier: config.appIdentifier ?? undefined,
    timeoutMs: config.requestTimeoutMs,
  });
  return client;
}

/**
 * 插件入口。
 *
 * @param ctx - cordis 上下文（tools 已由 inject 保证就绪）。
 * @param configInput - loader 投影的用户配置（volatile 引用嵌套，可 undefined）。
 */
export function apply(ctx: Context, configInput?: unknown): void {
  // e2e 契约：装载日志 `[name] ` 前缀格式，e2e 运行器按此结构化匹配。
  console.log(`[${name}] plugin loaded`);

  // 1. 解析配置；非法输入降级为默认（不抛错、不阻塞宿主）。
  let config: ResolvedVictauriConfig;
  try {
    config = resolveConfig(configInput);
  } catch (err) {
    console.error(`[${name}] invalid config:`, err);
    config = resolveConfig(undefined);
  }

  // 2. 惰性共享客户端：首次工具调用才 discovery + 探活；失败重置以便下次重试
  //    （Tauri app 可能是后启动的）。
  let clientPromise: Promise<VictauriClient> | undefined;
  const getClient = (): Promise<VictauriClient> => {
    clientPromise ??= makeClient(config).catch((err: unknown) => {
      clientPromise = undefined;
      throw err;
    });
    return clientPromise;
  };

  // 3. 组装 37 工具并按 disabledTools 过滤。
  const tools: ToolDefinition[] = [
    ...createStandaloneTools(REST_TOOL_SPECS, { getClient }),
    ...createCompoundTools({ getClient }),
    createVictauriCliTool(config.cliPath ? { cliPath: config.cliPath } : {}),
    createVictauriCliStatusTool(config.cliPath ? { cliPath: config.cliPath } : {}),
  ];
  const disabled = new Set(config.disabledTools);
  const enabledTools = tools.filter((tool) => !disabled.has(tool.name));

  // 4. 注册工具（disposer 自动附着插件，卸载即注销）。
  for (const tool of enabledTools) {
    ctx.tools.register(tool);
  }
  console.log(
    `[${name}] registered ${enabledTools.length} victauri tools` +
      (disabled.size > 0 ? ` (${disabled.size} disabled by config)` : ''),
  );
}

// re-export：loader 通过 `plugin.Config` 读 schemastery schema 生成设置面板
//（collectConfigSchemas）；不 re-export 会让设置面板不渲染本插件字段。
export { resolveConfig, Config } from './config.ts';
export type { ResolvedVictauriConfig } from './config.ts';
