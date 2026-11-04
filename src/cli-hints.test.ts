import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CLI_ACTIONS,
  CLI_ACTION_SPECS,
  buildActionHint,
  buildActionHints,
  buildCliToolDescription,
} from './cli-hints.ts';
import { isCliAction } from './cli.ts';
import { createVictauriCliTool } from './tools/cli.ts';

/** 取工具编译后参数 schema 里的 action enum。 */
function actionEnumOfTool(): string[] {
  const tool = createVictauriCliTool({ cliPath: process.execPath });
  const parameters = tool.parameters as unknown as {
    properties: Record<string, { enum?: string[] }>;
  };
  return parameters.properties['action']?.enum ?? [];
}

/** 仓库根目录（src/ 的上一级），用于全仓文案残留扫描。 */
const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** 全仓扫描范围：源码 + 文档 + README（不含依赖与构建产物）。 */
const SCAN_ROOTS = ['src', 'docs', 'README.md'] as const;

/** 扫描时纳入的文本文件后缀。 */
const SCAN_EXT = /\.(ts|tsx|js|mjs|cjs|md|json|ya?ml)$/;

/** 递归收集待扫描的文本文件（跳过 node_modules/dist/coverage/.git）。 */
function collectTextFiles(target: string): string[] {
  if (!existsSync(target)) return [];
  if (statSync(target).isFile()) return [target];
  const files: string[] = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', '.git'].includes(entry.name)) {
      continue;
    }
    const child = join(target, entry.name);
    if (entry.isDirectory()) files.push(...collectTextFiles(child));
    else if (SCAN_EXT.test(entry.name)) files.push(child);
  }
  return files;
}

describe('dsh-victauri cli 子命令口径与版本感知提示', () => {
  it('CLI_ACTIONS 与规格表同源:新增子命令只需改 CLI_ACTION_SPECS 一处', () => {
    expect(Object.keys(CLI_ACTION_SPECS)).toEqual([...CLI_ACTIONS]);
    expect(CLI_ACTIONS.length).toBe(9);
    for (const action of CLI_ACTIONS) {
      expect(isCliAction(action)).toBe(true);
      expect(CLI_ACTION_SPECS[action].summary.length).toBeGreaterThan(0);
    }
  });

  it('工具参数 enum 与 CLI_ACTIONS 一致(enum/hints 不漂移)', () => {
    expect(actionEnumOfTool()).toEqual([...CLI_ACTIONS]);
  });

  it('0.8.8 下 hints 不提示 doctor 的 --json(实测 0.8.8 不支持该选项)', () => {
    const hints = buildActionHints('0.8.8');
    expect(hints.doctor.notes.join(' ')).not.toContain('--json');
    expect(hints.doctor.notes.join(' ')).not.toContain('JSON');
    expect(JSON.stringify(hints)).not.toContain('--json');
  });

  it('0.10.0 起 hints 提示 doctor 支持 --json', () => {
    const hints = buildActionHints('0.10.0');
    expect(hints.doctor.notes.join(' ')).toContain('--json');
  });

  it('版本未知时不外推任何版本门控文本', () => {
    const hints = buildActionHints(null);
    expect(hints.doctor.notes).toEqual([]);
    expect(JSON.stringify(hints)).not.toContain('--json');
  });

  it('版本门控按数值段比较:0.10.0 命中 ≥0.10.0 的提示', () => {
    expect(buildActionHint('doctor', '0.9.9').notes.join(' ')).not.toContain(
      '--json',
    );
    expect(buildActionHint('doctor', '0.10.0').notes.join(' ')).toContain(
      '--json',
    );
    expect(buildActionHint('doctor', '0.10.1').notes.join(' ')).toContain(
      '--json',
    );
  });

  it('watch/bridge 标注长驻 + 非交互 + 需配合 timeout_ms', () => {
    const hints = buildActionHints('0.8.8');
    for (const action of ['watch', 'bridge'] as const) {
      expect(hints[action].longRunning).toBe(true);
      expect(hints[action].interactive).toBe(false);
      expect(hints[action].summary).toContain('timeout_ms');
      expect(hints[action].notes.join(' ')).toContain('timeout_ms');
    }
    expect(hints.bridge.notes.join(' ')).toContain('stdio');
    expect(hints.doctor.longRunning).toBe(false);
    expect(hints.init.longRunning).toBe(false);
  });

  it('工具描述写明 timeout_ms / cwd / 结构化输出 / hints 字段', () => {
    const description = buildCliToolDescription('0.8.8');
    expect(description).toContain('timeout_ms');
    expect(description).toContain('cwd');
    expect(description).toContain('doctor');
    expect(description).toContain('hints');
    expect(description).toContain('timed_out=true');
    expect(description).toContain('partial=true');
    // 0.8.8 下描述不得出现 --json(版本门控文案只在输出 hints 里)
    expect(description).not.toContain('--json');
  });

  it('工具描述列出全部子命令(action=...)', () => {
    const description = buildCliToolDescription(null);
    for (const action of CLI_ACTIONS) {
      expect(description).toContain(`${action}=`);
    }
  });
});

/**
 * watch 旧错误口径的匹配正则（曾把上游语义误写成 app 服务/discovery 目录监听）。
 *
 * 刻意用正则而非字面量：本测试文件也在扫描范围内，写死旧表述会让自己命中自己。
 */
const OLD_WATCH_WORDING = /监视\s*app\s*服务与\s*discovery\s*目录变化/;

describe('dsh-victauri watch 子命令口径（上游真实语义 + 本通道边界）', () => {
  it('watch summary 表达上游真实语义:监视测试目录变化并重跑 cargo test', () => {
    const { summary } = buildActionHint('watch', '0.8.8');
    expect(summary).toContain('监视测试目录');
    expect(summary).toContain('cargo test');
    expect(summary).toContain('-d/--dir');
    expect(summary).toContain('tests');
    expect(summary).toContain('-f/--filter');
    expect(summary).not.toContain('discovery');
    expect(OLD_WATCH_WORDING.test(summary)).toBe(false);
  });

  it('watch notes 说明输出是人类向 ANSI 文本,上游无 JSON/--once/--follow 模式', () => {
    const notes = buildActionHint('watch', '0.8.8').notes.join(' ');
    expect(notes).toContain('ANSI');
    expect(notes).toContain('stderr');
    expect(notes).toContain('JSON');
    expect(notes).toContain('--once');
    expect(notes).toContain('--follow');
  });

  it('watch notes 说明本通道只有超时前的一次部分输出,多轮改用 test/coverage', () => {
    const notes = buildActionHint('watch', '0.8.8').notes.join(' ');
    expect(notes).toContain('timeout_ms');
    expect(notes).toContain('一次部分输出');
    expect(notes).toContain('逐轮增量');
    expect(notes).toContain('test/coverage');
  });

  it('watch notes 覆盖上游真实语义(测试目录 + cargo test + Cargo.toml 工程)', () => {
    const notes = buildActionHint('watch', '0.8.8').notes.join(' ');
    expect(notes).toContain('cargo test');
    expect(notes).toContain('Cargo.toml');
    expect(notes).toContain('Rust');
  });

  it('全仓无 watch 旧错误口径残留(含本测试文件自身)', () => {
    const hits: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of collectTextFiles(join(REPO_ROOT, root))) {
        if (OLD_WATCH_WORDING.test(readFileSync(file, 'utf8'))) {
          hits.push(relative(REPO_ROOT, file));
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('dsh-victauri bridge 子命令口径（上游定位 + 本通道边界）', () => {
  it('bridge notes 说明上游定位:第三方 MCP 宿主的 stdio→HTTP 代理,HTTP 端点在 app 进程内', () => {
    const notes = buildActionHint('bridge', '0.8.8').notes.join(' ');
    expect(notes).toContain('第三方 MCP 宿主');
    expect(notes).toContain('stdio→HTTP');
    expect(notes).toContain('--http');
    expect(notes).toContain('app 进程');
  });

  it('bridge notes 提示勿绕 CLI:已有 REST 主通道,工具调用走 victauri_*', () => {
    const notes = buildActionHint('bridge', '0.8.8').notes.join(' ');
    expect(notes).toContain('REST 主通道');
    expect(notes).toContain('victauri_*');
    expect(notes).toContain('诊断');
  });

  it('bridge notes 明确仅诊断性短时使用:拿不到 stdio 交互会话,自动重连只在 CLI 侧', () => {
    const notes = buildActionHint('bridge', '0.8.8').notes.join(' ');
    expect(notes).toContain('拿不到 stdio 交互会话');
    expect(notes).toContain('自动重连');
  });

  it('bridge notes 保留长驻/超时/partial 口径', () => {
    const notes = buildActionHint('bridge', '0.8.8').notes.join(' ');
    expect(notes).toContain('timeout_ms');
    expect(notes).toContain('timed_out=true');
    expect(notes).toContain('partial=true');
    expect(notes).toContain('部分输出');
  });

  it('bridge hints 不出现 --json 字面量(0.8.8 全量 hints 护栏),文档三处口径关键词一致', () => {
    const hints = buildActionHints('0.8.8');
    expect(JSON.stringify(hints.bridge)).not.toContain('--json');
    const docs = readFileSync(join(REPO_ROOT, 'docs/TOOLS.md'), 'utf8');
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
    for (const text of [docs, readme]) {
      expect(text).toContain('第三方 MCP 宿主');
      expect(text).toContain('诊断性短时');
    }
  });
});
