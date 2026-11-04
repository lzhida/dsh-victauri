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
import {
  PREVIEW_HEAD_CHARS,
  PREVIEW_MAX_CHARS,
  PREVIEW_TAIL_CHARS,
  createVictauriCliTool,
} from './tools/cli.ts';

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

/**
 * 全仓扫描范围：源码 + 文档 + README + 脚本 + demo-app + CI 配置。
 *
 * 含根级散文件（cordis.patch.yml / package.json 等），避免旧口径残留在
 * 非 src 位置却扫不到。构建产物目录（target/dist）由 collectTextFiles 跳过。
 */
const SCAN_ROOTS = [
  'src',
  'docs',
  'scripts',
  'demo-app',
  '.github',
  'README.md',
  'cordis.patch.yml',
  'package.json',
] as const;

/** 扫描时纳入的文本文件后缀。 */
const SCAN_EXT = /\.(ts|tsx|js|mjs|cjs|md|json|ya?ml)$/;

/** 递归收集待扫描的文本文件（跳过 node_modules/dist/coverage/.git/target）。 */
function collectTextFiles(target: string): string[] {
  if (!existsSync(target)) return [];
  if (statSync(target).isFile()) return [target];
  const files: string[] = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (
      ['node_modules', 'dist', 'coverage', '.git', 'target'].includes(
        entry.name,
      )
    ) {
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
  it('watch summary 表达上游真实语义:监视测试目录变化(仅 .rs 触发)并重跑 cargo test', () => {
    const { summary } = buildActionHint('watch', '0.8.8');
    expect(summary).toContain('监视测试目录');
    expect(summary).toContain('cargo test');
    expect(summary).toContain('-d/--dir');
    expect(summary).toContain('tests');
    expect(summary).toContain('-f/--filter');
    expect(summary).toContain('.rs');
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

  it('watch notes 说明本通道只有超时前的一次部分输出;多轮靠项目自身 cargo test 而非 test/coverage', () => {
    const notes = buildActionHint('watch', '0.8.8').notes.join(' ');
    expect(notes).toContain('timeout_ms');
    expect(notes).toContain('一次部分输出');
    expect(notes).toContain('逐轮增量');
    // 口径修正(复核意见):test/coverage 是活体 app 上的另一套,不能替代 watch 重跑
    expect(notes).toContain('cargo test');
    expect(notes).toContain('不能替代');
    expect(notes).toMatch(/test\/coverage/);
    expect(notes).toContain('活体 app');
  });

  it('watch notes 覆盖上游真实语义(测试目录 + cargo test + Cargo.toml 工程 + 目录不存在的上游守卫)', () => {
    const notes = buildActionHint('watch', '0.8.8').notes.join(' ');
    expect(notes).toContain('cargo test');
    expect(notes).toContain('Cargo.toml');
    expect(notes).toContain('Rust');
    // 归因修正(复核意见):目录不存在是上游自身守卫,不是 cargo 报缺 Cargo.toml
    expect(notes).toContain('watch directory does not exist');
    expect(notes).not.toContain('否则上游报找不到 Cargo.toml');
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
    // 锁极性:上游 CLI「不提供」--http/--port,改成「提供」必须让本用例失败
    expect(notes).toMatch(/不提供\s*--http/);
    expect(notes).not.toMatch(/(?<!不)提供\s*--http/);
    expect(notes).toContain('app 进程');
  });

  it('bridge notes 提示勿绕 CLI:已有 REST 主通道,工具调用走 victauri_*', () => {
    const notes = buildActionHint('bridge', '0.8.8').notes.join(' ');
    expect(notes).toContain('REST 主通道');
    expect(notes).toContain('victauri_*');
    expect(notes).toContain('诊断');
  });

  it('bridge notes 明确仅诊断性短时使用:拿不到 stdio 交互会话,跨重启是重建会话而非会话存活', () => {
    const notes = buildActionHint('bridge', '0.8.8').notes.join(' ');
    expect(notes).toContain('拿不到 stdio 交互会话');
    // 口径修正(复核意见):上游是「重发现并重建」fresh 会话,不是「会话保持」
    expect(notes).toContain('自动重发现');
    expect(notes).toContain('重建');
    expect(notes).not.toContain('会话保持');
  });

  it('bridge notes 保留长驻/超时/partial 口径,并写明 partial 的第二个来源(512KB/[truncated])', () => {
    const notes = buildActionHint('bridge', '0.8.8').notes.join(' ');
    expect(notes).toContain('timeout_ms');
    expect(notes).toContain('timed_out=true');
    expect(notes).toContain('partial=true');
    expect(notes).toContain('部分输出');
    // 口径补全:partial 不止超时强杀一个来源
    expect(notes).toContain('512KB');
    expect(notes).toContain('[truncated]');
  });

  it('bridge notes 的上游定位带版本限定(0.8.8 实测 / 0.10.x 文档),不把单一版本写成普适事实', () => {
    const notes = buildActionHint('bridge', '0.8.8').notes.join(' ');
    expect(notes).toContain('0.8.8');
    expect(notes).toContain('0.10.x');
  });

  it('bridge hints 不出现 --json 字面量,文档两处口径关键词一致', () => {
    const hints = buildActionHints('0.8.8');
    expect(JSON.stringify(hints.bridge)).not.toContain('--json');
    const docs = readFileSync(join(REPO_ROOT, 'docs/TOOLS.md'), 'utf8');
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
    for (const text of [docs, readme]) {
      expect(text).toContain('第三方 MCP 宿主');
      expect(text).toContain('诊断性短时');
    }
  });

  it('文档数值口径与实现常量同源:预览头尾/上限与 512KB 捕获上限', () => {
    const docs = readFileSync(join(REPO_ROOT, 'docs/TOOLS.md'), 'utf8');
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
    // 实现常量变动时文档若未同步,本用例必须失败
    expect(docs).toContain(String(PREVIEW_HEAD_CHARS));
    expect(docs).toContain(String(PREVIEW_TAIL_CHARS));
    expect(docs).toContain(String(PREVIEW_MAX_CHARS));
    expect(docs).toContain('512KB');
    // 关键句:REST 主通道优先(勿绕 CLI)
    expect(docs).toContain('REST 主通道');
    expect(readme).toContain('REST 主通道');
  });

  it('文档不残留被修正的旧口径:全文/6000 总上限/上游文档原话/见上文 watch', () => {
    const docs = readFileSync(join(REPO_ROOT, 'docs/TOOLS.md'), 'utf8');
    // "stdout/stderr 是全文" 与 512KB 截断矛盾,已改为"未经预览截断的捕获输出"
    expect(docs).not.toContain('是**全文**');
    // 渲染预览实为头尾各 3000 + 一行省略标记,总长略大于 6000
    expect(docs).not.toContain('总上限 **6000 字符**');
    expect(docs).not.toContain('总上限 6000 字符');
    // help 首行原话 ≠ 上游文档原话
    expect(docs).not.toContain('上游文档原话');
    expect(docs).toContain('首行原话');
    // watch 小节在 bridge 段之下,交叉引用方向不能写反
    expect(docs).not.toContain('见上文 watch');
    expect(docs).toMatch(/见下文 watch\s*小节/);
    // coverage 报告走 stderr 未经本机实测,必须标注
    expect(docs).toContain('待实测');
  });

  it('工具描述补 partial 第二来源与预览截断口径', () => {
    const description = buildCliToolDescription('0.8.8');
    expect(description).toContain('512KB');
    expect(description).toContain('[truncated]');
    expect(description).toContain(String(PREVIEW_HEAD_CHARS));
    expect(description).toContain(String(PREVIEW_TAIL_CHARS));
  });
});
