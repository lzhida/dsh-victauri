/**
 * REST 桥工厂：catalog 规格 VictauriClient.callTool 透传 → dsh 工具。
 *
 * 通用行为：
 * - 别名归一：eval_js(expression→code)、query_db(sql→query)——0.8.8 实测参数名优先，
 *   文档命名兼容（两者都给时以实测名为准）；
 * - JSON 值透传：入参收敛为纯 JSON 值（isJsonValue 守卫）后**原样**发送，
 *   type:'json' 的参数（assert_semantic.expected / wait_for.expected /
 *   storage.value）数值、对象、数组、null 均不被字符串化；
 * - 图像通道：结果中的 {data,mimeType} 形态图像值（顶层对象或 REST 多块数组，
 *   覆盖 screenshot / trace frames / animation scrub filmstrip）在 renderJson
 *   截断之前统一落盘 %TEMP%\dsh-victauri\ 返回路径，落盘失败回退原文并保留错误；
 * - 数组结果包装为 {items: [...]}（dsh execute 契约要求顶层 object，find_elements 实测顶层数组）；
 * - 错误面：VictauriError 系列不 throw，返回结构化 {error:{kind,message,hint}} +
 *   自检指引（启动 app / victauri check）。
 */
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';

import type { VictauriClient } from '../../client.ts';
import { VictauriError, isVictauriError } from '../../errors.ts';
import type { JsonValue } from '../../json.ts';
import { normalizeImageResult, saveImage } from './image.ts';
import type { RestToolSpec } from './catalog.ts';
import { toJsonArgs } from './json-value.ts';
import { resolveRequestBudgetMs } from './timeout.ts';
import { renderJson } from './render.ts';

/** 工具运行期依赖：惰性取连接（装配层缓存复用；连接异步建立）。 */
export interface BridgeDeps {
  getClient: () => Promise<VictauriClient>;
}

/** 无 app 运行/调用失败时的自检指引。 */
export const SELF_CHECK_HINT =
  '自检指引: ① 确认 Tauri app 已以 debug 构建启动且接入了 victauri-plugin(' +
  'Builder.plugin(victauri_plugin::init())); ② 运行 victauri check 检查项目配置; ' +
  '③ 首次使用可先跑本插件 demo-app(debug 构建)验证链路';

/** 把异常归一为结构化错误值（不向模型抛栈）。 */
function toErrorValue(err: unknown): Record<string, JsonValue> {
  const kind = isVictauriError(err) ? err.kind : 'unknown';
  const message = err instanceof Error ? err.message : String(err);
  return { error: { kind, message, hint: SELF_CHECK_HINT } };
}

/** 需要别名归一的工具（实测名 ← 文档别名）。 */
const ARG_ALIASES: Readonly<
  Record<string, readonly [primary: string, alias: string]>
> = {
  eval_js: ['code', 'expression'],
  query_db: ['query', 'sql'],
};

/**
 * 图像通道：把 callTool 结果中的图像值落盘并替换为文件引用。
 * 返回 null = 结果不含图像（调用方走原 toRecord 通道，零行为变化）。
 * save 可注入用于测试落盘失败回退路径。
 */
export function applyImageChannel(
  result: JsonValue,
  toolName: string,
  save: typeof saveImage = saveImage,
): Record<string, JsonValue> | null {
  try {
    return normalizeImageResult(result, toolName, save);
  } catch (err) {
    // 落盘失败：回退原文返回并保留错误信息（不吞错）
    return {
      ...toRecord(result),
      image_save_error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 数组结果守卫（find_elements 实测顶层数组）。 */
function isArrayValue(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/** 把 callTool 结果归一为顶层 object(dsh execute 契约要求 Record)。 */
function toRecord(value: JsonValue): Record<string, JsonValue> {
  if (isArrayValue(value)) return { items: value };
  if (typeof value === 'object' && value !== null) return value;
  return { value };
}

/**
 * 由规格构建单个 REST 桥工具。dsh 工具名 = `victauri_` + victauri 工具名。
 * 输出 schema 为开放对象（透传透出，形状由 victauri 端决定）。
 */
export function createRestBridgeTool(
  spec: RestToolSpec,
  deps: BridgeDeps,
): ToolDefinition {
  const alias = ARG_ALIASES[spec.name];
  return defineTool({
    name: `victauri_${spec.name}`,
    description: spec.description,
    parameters: spec.parameters,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: renderJson,
    },
    execute: async (args, exec) => {
      void exec;
      try {
        // 入参收敛为纯 JSON 值（丢弃 undefined 与非 JSON 值）后**原样透传**：
        // 任意 JSON 值参数（expected / storage.value）不会被字符串化
        const callArgs: Record<string, JsonValue> = toJsonArgs(
          args as unknown as Record<string, unknown>,
        );
        // 别名归一:实测名优先,文档别名兜底;别名键总是移除(服务端拒未知字段)
        if (alias) {
          const [primary, aliasKey] = alias;
          const aliasVal = callArgs[aliasKey];
          if (callArgs[primary] === undefined && aliasVal !== undefined) {
            callArgs[primary] = aliasVal;
          }
          if (aliasVal !== undefined) delete callArgs[aliasKey];
          // required 注解无法覆盖别名路径(defineTool 校验在归一前):兜底结构化报错
          if (callArgs[primary] === undefined) {
            return toErrorValue(
              new VictauriError(
                'tool-error',
                `missing required property "${primary}" (alias "${aliasKey}" accepted)`,
              ),
            );
          }
        }
        const client = await deps.getClient();
        // per-tool 请求预算:wait_for 动态 > spec 声明 > 无覆盖(客户端默认链)
        const budget = resolveRequestBudgetMs(
          spec.name,
          callArgs,
          spec.requestBudgetMs,
        );
        const result = await client.callTool(spec.name, callArgs, budget);
        // 图像通道:{data,mimeType} 形态统一落盘返回路径;无图像走原通道
        const imaged = applyImageChannel(result, spec.name);
        if (imaged !== null) return imaged;
        return toRecord(result);
      } catch (err) {
        return toErrorValue(err);
      }
    },
  });
}

/** 构建 20 个 standalone 桥工具。 */
export function createStandaloneTools(
  specs: readonly RestToolSpec[],
  deps: BridgeDeps,
): ToolDefinition[] {
  return specs.map((spec) => createRestBridgeTool(spec, deps));
}
