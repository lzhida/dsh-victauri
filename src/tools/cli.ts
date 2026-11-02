import { defineTool } from '@deepseek-ai/dsh-tools';
import type { ContentBlock } from '@deepseek-ai/dsh-llm/types';

import {
  CLI_ACTIONS,
  isCliAction,
  runVictauriCli,
  CLI_DEFAULT_TIMEOUT_MS,
} from '../cli.ts';

/** 工具层执行预算:victauri test/record 可能耗时,给满 5 分钟。 */
const TOOL_TIMEOUT_MS = 300_000;

/** victauri_cli 各子命令的一句话语义(0.8.8 实测 + 0.10 文档)。 */
const ACTION_HINTS: Record<string, string> = {
  init: '为 Tauri 项目生成 victauri 接入脚手架(Cargo 依赖/capability/init 调用)',
  check: '校验项目接入配置完整性(Cargo.toml/capability/register_commands)',
  test: '在真实 app 上跑 victauri 测试集',
  record: '录制会话轨迹供回放',
  doctor: '诊断 CLI/服务/发现链路健康状态',
  watch: '监视 app 服务与 discovery 目录变化(常驻)',
  invoke: '不依赖 dsh 直接触发一次工具调用(参数按子命令约定)',
  bridge: '启动 stdio MCP 代理(连接时自动发现端口+读 token,--app 过滤)',
  coverage: '报告 #[inspectable] 命令的工具覆盖情况',
};

/** victauri_cli 工具工厂:cliPath 仅注入(测试/自定义安装路径),不暴露给模型。 */
export function createVictauriCliTool(options: { cliPath?: string } = {}) {
  return defineTool({
    name: 'victauri_cli',
    description: [
      '执行 victauri CLI 子命令(辅通道;victauri 服务经 victauri_* 工具走 REST 主通道)。',
      `action 选择子命令:${CLI_ACTIONS.map((a) => `${a}=${ACTION_HINTS[a] ?? ''}`).join('; ')}。`,
      'args 透传给子命令(不含子命令名本身);长驻子命令(watch/bridge)建议配合超时使用。',
    ].join(' '),
    parameters: {
      action: {
        type: 'string',
        enum: CLI_ACTIONS,
        required: true,
        description: 'victauri 子命令名',
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: '透传给子命令的参数列表(不含子命令名)',
      },
      timeout_ms: {
        type: 'integer',
        description: '子进程超时毫秒(默认 120000)',
      },
      cwd: {
        type: 'string',
        description: '子进程工作目录(默认继承宿主)',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          exit_code: {
            oneOf: [{ type: 'integer' }, { type: 'null' }],
            description: '退出码;null=超时强杀或被信号终止',
          },
          stdout: {
            type: 'string',
            required: true,
            description: '标准输出全文',
          },
          stderr: {
            type: 'string',
            required: true,
            description: '标准错误全文',
          },
          timed_out: {
            type: 'boolean',
            required: true,
            description: '是否因超时被终止',
          },
        },
      },
      render: (_args, value) => {
        const head = `victauri_cli exit=${String(value.exit_code)}${value.timed_out ? ' (timed out)' : ''}`;
        const blocks: ContentBlock[] = [{ type: 'text', text: head }];
        const preview = (value.stderr || value.stdout).slice(0, 2000);
        if (preview) {
          blocks.push({ type: 'text', text: preview });
        }
        return blocks;
      },
    },
    timeoutMs: TOOL_TIMEOUT_MS,
    execute: async (args) => {
      const { action, args: extraArgs, timeout_ms, cwd } = args;
      if (!isCliAction(action)) {
        // enum 已在参数校验拦截;此处兜底保证类型收窄
        throw new Error(`unknown victauri subcommand: ${action}`);
      }
      const result = await runVictauriCli({
        args: [action, ...(extraArgs ?? [])],
        cliPath: options.cliPath,
        timeoutMs: timeout_ms ?? CLI_DEFAULT_TIMEOUT_MS,
        ...(cwd !== undefined ? { cwd } : {}),
      });
      return {
        exit_code: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        timed_out: result.timedOut,
      };
    },
  });
}

/** 常规装配用的默认 victauri_cli 工具(PATH 上的 victauri)。 */
export const victauriCliTool = createVictauriCliTool();
