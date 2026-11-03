/**
 * victauri CLI 子命令口径与**版本感知提示**（单一事实源）。
 *
 * 为什么要独立成文件：
 * - 原来 `CLI_ACTIONS`（src/cli.ts）与 `ACTION_HINTS`（src/tools/cli.ts）是两处
 *   手写清单，新增子命令必须改两处，enum 与提示容易漂移；
 * - 现在 `CLI_ACTION_SPECS` 是唯一来源：新增子命令只加一项，
 *   工具参数 enum、动作提示、版本门控说明同步生效（一致性由单测守护）；
 * - 提示按**探测到的 CLI 版本**门控：0.8.8 实测 `doctor` 不接受 `--json`
 *   （报 `error: unexpected argument '--json' found`），而 0.10 起的文档才有该
 *   选项，版本未知时一律不给版本门控文本（保守不外推）。
 */

import { isAtLeast, isBelow } from './cli-version.ts';

/** 版本门控提示：仅在探测版本落在 [since, until) 区间时出现。 */
export interface CliActionNote {
  /** 提示正文。 */
  readonly text: string;
  /** 生效的最低版本（含）；undefined = 不限。 */
  readonly since?: string;
  /** 失效的最高版本（不含）；undefined = 不限。 */
  readonly until?: string;
}

/** 子命令规格（语义 + 行为标记 + 版本门控提示）。 */
export interface CliActionSpec {
  /** 一句话语义（版本无关）。 */
  readonly summary: string;
  /** 该子命令出现的最低版本（含）；undefined = 0.8.8 起可用。 */
  readonly since?: string;
  /** 该子命令消失的最高版本（不含）；undefined = 一直可用。 */
  readonly until?: string;
  /** 长驻子命令：不自行退出，必须配合 timeout_ms。 */
  readonly longRunning?: boolean;
  /** 是否支持交互式 stdin；false = 非交互（等退出模型下拿不到交互通道）。 */
  readonly interactive?: boolean;
  /** 版本门控提示。 */
  readonly notes?: readonly CliActionNote[];
}

/**
 * 子命令规格表（唯一事实源）。
 *
 * 键顺序 = `CLI_ACTIONS` 顺序（`victauri --help` 的 0.8.8 实测顺序）。
 * 新增子命令：在此加一项即可（enum / 提示 / 文档口径同步生效）。
 */
const SPEC_TABLE = {
  init: {
    summary:
      '为 Tauri 项目生成 victauri 接入脚手架(Cargo 依赖/capability/init 调用)',
  },
  check: {
    summary: '校验项目接入配置完整性(Cargo.toml/capability/register_commands)',
  },
  test: {
    summary: '在真实 app 上跑 victauri 测试集',
    notes: [{ text: '可能耗时较长,建议显式传 timeout_ms' }],
  },
  record: {
    summary: '录制会话轨迹供回放',
    notes: [{ text: '可能耗时较长,建议显式传 timeout_ms' }],
  },
  doctor: {
    summary: '诊断 CLI/服务/发现链路健康状态',
    notes: [
      {
        text:
          'doctor 在 0.10.0 之前仅输出文本报告,结构化明细以本工具输出的 doctor 字段为准' +
          '(CLI 侧结构化输出选项自 0.10.0 起的文档才提供)',
        until: '0.10.0',
      },
      {
        text:
          'doctor 支持 CLI 侧结构化输出选项 --json(0.10.0 起的文档提供;0.8.8 实测不支持,' +
          '会报 unexpected argument)',
        since: '0.10.0',
      },
    ],
  },
  watch: {
    summary: '监视 app 服务与 discovery 目录变化',
    longRunning: true,
    interactive: false,
    notes: [
      {
        text:
          '长驻子命令:不会自行退出,必须传 timeout_ms;超时会 kill 子进程并返回 ' +
          'timed_out=true、partial=true,stdout/stderr 为已捕获的部分输出',
      },
    ],
  },
  invoke: {
    summary: '不依赖 dsh 直接触发一次工具调用(参数按子命令约定)',
    notes: [{ text: '需要 app 在运行;app 未起时调用会失败' }],
  },
  bridge: {
    summary: '启动 stdio MCP 代理(连接时自动发现端口+读 token,--app 过滤)',
    longRunning: true,
    interactive: false,
    notes: [
      {
        text:
          '长驻子命令:不会自行退出,必须传 timeout_ms;超时会 kill 子进程并返回 ' +
          'timed_out=true、partial=true',
      },
      {
        text:
          'bridge 是 stdio MCP 代理,本通道只能等它退出,拿不到 stdio 交互会话,' +
          '仅适合短时诊断',
      },
    ],
  },
  coverage: {
    summary: '报告 #[inspectable] 命令的工具覆盖情况',
  },
} as const satisfies Record<string, CliActionSpec>;

/** 子命令名（由规格表推导，新增子命令自动进入联合类型）。 */
export type CliAction = keyof typeof SPEC_TABLE;

/** 子命令规格表（对外只读视图，键与 `CLI_ACTIONS` 一致）。 */
export const CLI_ACTION_SPECS: Record<CliAction, CliActionSpec> = SPEC_TABLE;

/** 子命令清单（顺序 = 规格表键顺序）。 */
export const CLI_ACTIONS = Object.keys(SPEC_TABLE) as CliAction[];

/** 版本感知的子命令提示。 */
export interface CliActionHint {
  /** 一句话语义（含长驻/交互行为标记）。 */
  readonly summary: string;
  /** 版本门控提示正文（按探测版本过滤后）。 */
  readonly notes: string[];
  /** 是否长驻子命令（必须配合 timeout_ms）。 */
  readonly longRunning: boolean;
  /** 是否支持交互式 stdin。 */
  readonly interactive: boolean;
}

/**
 * 构建单个子命令的版本感知提示。
 *
 * @param action - 子命令名。
 * @param version - 探测到的 CLI 版本；null = 未知（不给版本门控文本）。
 */
export function buildActionHint(
  action: CliAction,
  version: string | null,
): CliActionHint {
  const spec = CLI_ACTION_SPECS[action];
  const notes: string[] = [];
  const summaryParts: string[] = [spec.summary];
  if (spec.longRunning === true) {
    summaryParts.push('长驻子命令(不自行退出,必须配合 timeout_ms)');
  }
  if (spec.interactive === false) {
    summaryParts.push('不支持交互式 stdin');
  }
  if (
    spec.since !== undefined &&
    version !== null &&
    !isAtLeast(version, spec.since)
  ) {
    notes.push(`当前 CLI 版本 ${version} 不支持该子命令(需 >= ${spec.since})`);
  }
  for (const note of spec.notes ?? []) {
    if (note.since !== undefined && !isAtLeast(version, note.since)) continue;
    if (note.until !== undefined && !isBelow(version, note.until)) continue;
    notes.push(note.text);
  }
  return {
    summary: summaryParts.join(';'),
    notes,
    longRunning: spec.longRunning ?? false,
    interactive: spec.interactive ?? true,
  };
}

/**
 * 构建全部子命令的版本感知提示。
 *
 * @param version - 探测到的 CLI 版本；null = 未知。
 */
export function buildActionHints(
  version: string | null,
): Record<CliAction, CliActionHint> {
  const hints = {} as Record<CliAction, CliActionHint>;
  for (const action of CLI_ACTIONS) {
    hints[action] = buildActionHint(action, version);
  }
  return hints;
}

/**
 * 工具描述文案。
 *
 * 说明：描述里只放**版本无关**的语义与用法（子命令摘要 + timeout_ms/cwd 要求 +
 * 结构化输出说明）；版本相关差异（如某个选项是否可用）随执行结果里的 `hints`
 * 字段返回——那时已经探测到真实版本，避免在描述里写死某个版本才成立的用法。
 *
 * @param version - 已知版本（测试/调用方注入）；null = 未知（描述不含版本门控文本）。
 */
export function buildCliToolDescription(version: string | null): string {
  const actions = CLI_ACTIONS.map(
    (action) => `${action}=${buildActionHint(action, version).summary}`,
  ).join('; ');
  return [
    '执行 victauri CLI 子命令(辅通道;victauri 服务经 victauri_* 工具走 REST 主通道)。',
    `action 选择子命令:${actions}。`,
    'args 透传给子命令(不含子命令名本身)。',
    'doctor 会输出文本报告;本工具另外把 PASS/FAIL/WARN 明细解析到输出结构的 doctor 字段' +
      '(依次解析 stdout 与 stderr;识别不到报告时 doctor=null,stdout/stderr 原样保留)。',
    'doctor 需在 Tauri 项目根(含 Cargo.toml)执行,否则报告全 FAIL;用 cwd 指定项目根。',
    '长驻子命令(watch/bridge)不会自行退出,必须传 timeout_ms;超时会 kill 子进程,' +
      '返回 timed_out=true、partial=true,stdout/stderr 为已捕获的部分输出。',
    '输出含 cli_version(探测到的 CLI 版本)与 hints(该子命令的版本感知提示)。',
  ].join(' ');
}
