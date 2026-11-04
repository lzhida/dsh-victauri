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
  isBeyondUntil,
} from './cli-hints.ts';
import { isCliAction } from './cli.ts';
import { COMPOUND_TOOL_SPECS } from './tools/compound/catalog.ts';
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
    // 13 = 0.8.8 实测的 9 个 + 上游 0.10.1/0.10.2 新增的 tools/call/run/logs
    expect(CLI_ACTIONS.length).toBe(13);
    for (const action of CLI_ACTIONS) {
      expect(isCliAction(action)).toBe(true);
      expect(CLI_ACTION_SPECS[action].summary.length).toBeGreaterThan(0);
    }
  });

  it('工具参数 enum 与 CLI_ACTIONS 一致(enum/hints 不漂移)', () => {
    expect(actionEnumOfTool()).toEqual([...CLI_ACTIONS]);
  });

  it('doctor hints 明示不提供 --json(0.8.8 实测 + 0.10.3 源码双证,D-5 口径)', () => {
    for (const version of ['0.8.8', '0.10.0', '0.10.3', null] as const) {
      const hints = buildActionHints(version);
      const notes = hints.doctor.notes.join(' ');
      expect(notes, String(version)).toContain('不提供 --json');
      expect(notes, String(version)).toContain('doctor 字段');
    }
    // 旧的不实口径不得残留
    const all = JSON.stringify(buildActionHints('0.10.3'));
    expect(all).not.toContain('0.10.0 起的文档才提供');
  });

  it('版本未知时不外推任何版本门控文本', () => {
    const hints = buildActionHints(null);
    const all = JSON.stringify(hints);
    // 无门控 note(doctor 口径)可以出现,但版本门控句不得出现
    expect(all).not.toContain('需 >=');
    expect(all).not.toContain('不支持该子命令');
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

/**
 * 上游 0.10.1/0.10.2 新增子命令（tools/call/run/logs）的版本门控口径。
 *
 * 证据来源：上游 v0.10.3 `crates/victauri-cli/src/main.rs` 的 clap `Commands`
 * 枚举与各变体的 after_help；本机 0.8.8 `victauri --help` 实测无这四种子命令。
 */
describe('dsh-victauri 0.10.x 新增子命令口径（tools/call/run/logs）', () => {
  /** 规格表键序的「反引号 + 斜杠」连续串（文档/README 清单同源锚点）。 */
  const CANONICAL_ACTION_LIST = CLI_ACTIONS.map((a) => `\`${a}\``).join(' / ');

  it('0.8.8 下四个新子命令全部标记为不支持,且不泄漏版本专属说明', () => {
    const hints = buildActionHints('0.8.8');
    expect(hints.tools.notes.join(' ')).toContain('需 >= 0.10.1');
    expect(hints.call.notes.join(' ')).toContain('需 >= 0.10.1');
    expect(hints.run.notes.join(' ')).toContain('需 >= 0.10.2');
    expect(hints.logs.notes.join(' ')).toContain('需 >= 0.10.2');
    // 版本专属内容不应出现（--json 是 tools/call 与 logs 的选项）
    expect(hints.tools.notes.join(' ')).not.toContain('--json');
    expect(hints.call.notes.join(' ')).not.toContain('--args-file');
    expect(hints.run.notes.join(' ')).not.toContain('console/<pid>');
    expect(hints.logs.notes.join(' ')).not.toContain('--digest');
  });

  it('0.10.1 起 tools/call 的上游口径出现,0.10.2 起 run/logs 出现', () => {
    const v1011 = buildActionHints('0.10.1');
    expect(v1011.tools.notes.join(' ')).toContain('上游 0.10.1 起提供');
    expect(v1011.tools.notes.join(' ')).toContain('--json');
    expect(v1011.call.notes.join(' ')).toContain('--args-file');
    expect(v1011.call.notes.join(' ')).toContain('退出码');
    // 0.10.1 还没有 run/logs
    expect(v1011.run.notes.join(' ')).toContain('需 >= 0.10.2');
    expect(v1011.logs.notes.join(' ')).toContain('需 >= 0.10.2');

    const v102 = buildActionHints('0.10.2');
    expect(v102.run.notes.join(' ')).toContain('上游 0.10.2 起提供');
    expect(v102.run.notes.join(' ')).toContain('console/<pid>-<ms>.jsonl');
    expect(v102.logs.notes.join(' ')).toContain('--digest');
    expect(v102.logs.notes.join(' ')).toContain('--interval-ms');
  });

  it('tools 的三条上游口径齐备(活体 schema/--json/无 app 与本插件同类工具)', () => {
    const notes = buildActionHint('tools', '0.10.1');
    expect(notes.summary).toContain('victauri tools');
    expect(notes.notes.join(' ')).toContain('活体 app 的 input schema');
    expect(notes.notes.join(' ')).toContain('--json');
    expect(notes.notes.join(' ')).toContain('无 app 可达时只列内置工具名');
    expect(notes.notes.join(' ')).toContain('victauri_tools_list');
  });

  it('call 的四种传参形式与图像 --out 落盘口径齐备', () => {
    const notes = buildActionHint('call', '0.10.1').notes.join(' ');
    for (const form of ['key=value', 'key:=json', 'JSON 对象', '--args-file']) {
      expect(notes).toContain(form);
    }
    expect(notes).toContain('--out');
    expect(notes).toContain('<stem>-1.<ext>');
    expect(notes).toContain('base64');
  });

  it('call 的退出码 0/1/2/3 四语义齐备(含 3 未完成不得盲目重试)', () => {
    const notes = buildActionHint('call', '0.10.1').notes.join(' ');
    for (const code of [
      '0 成功',
      '1 工具报错或 app 拒绝',
      '2 本地问题',
      '3 请求已发出但未完成',
    ]) {
      expect(notes).toContain(code);
    }
    expect(notes).toContain('勿盲目重试');
  });

  it('logs 的完整选项清单与默认值齐备', () => {
    const notes = buildActionHint('logs', '0.10.2').notes.join(' ');
    for (const opt of [
      '--app',
      '--level',
      '--target',
      '--grep',
      '--limit(默认 100)',
      '--follow',
      '--digest',
      '--stdout',
      '--capture',
      '--json',
      '--interval-ms(默认 500)',
    ]) {
      expect(notes).toContain(opt);
    }
  });

  it('logs 的三组选项互斥、回落 run 捕获与 --json 原始记录口径齐备', () => {
    const notes = buildActionHint('logs', '0.10.2').notes.join(' ');
    expect(notes).toContain('--target 与 --stdout/--capture/--digest 互斥');
    expect(notes).toContain(
      '--digest 与 --follow/--stdout/--capture/--grep/--level 互斥',
    );
    expect(notes).toContain('--app 与 --stdout/--capture 互斥');
    expect(notes).toContain('回落最近一次 victauri run 的捕获文件');
    expect(notes).toContain('logs{action:"backend"}');
    // 上游 CLI 侧本身就出原始 JSON records,不是「结构化 JSON 得用插件工具」
    expect(notes).toContain('原始 JSON records');
    expect(notes).not.toContain('需要结构化 JSON 用 logs 工具');
  });

  it('run 的启动语义、长驻标记与 launcher 停止语义齐备', () => {
    const hint = buildActionHint('run', '0.10.2');
    expect(hint.summary).toContain('victauri run -- <cmd>');
    expect(hint.longRunning).toBe(true);
    expect(hint.interactive).toBe(false);
    const notes = hint.notes.join(' ');
    expect(notes).toContain('命令写在 -- 之后');
    expect(notes).toContain('timeout_ms');
    expect(notes).toContain('job object');
    expect(notes).toContain('launcher_gone');
    // 上游 Unix 侧没有 PR_SET_PDEATHSIG,不得写成事实
    expect(notes).not.toContain('PR_SET_PDEATHSIG');
    expect(notes).toContain('DeathWatch');
  });

  it('invoke/call 通道边界:同一 discovery/信任检查/--app pin/永不打印 token', () => {
    const invokeNotes = buildActionHint('invoke', '0.10.3').notes.join(' ');
    expect(invokeNotes).toContain('discovery');
    expect(invokeNotes).toContain('信任检查');
    expect(invokeNotes).toContain('--app pin');
    expect(invokeNotes).toContain('永不打印 token');
    const callNotes = buildActionHint('call', '0.10.1').notes.join(' ');
    expect(callNotes).toContain('discovery');
    expect(callNotes).toContain('信任检查');
    expect(callNotes).toContain('--app pin');
    expect(callNotes).toContain('永不打印 token');
  });

  it('invoke 与 call 并存:0.10.3 下 invoke 仍可用且提示 call 是更通用入口', () => {
    const hints = buildActionHints('0.10.3');
    expect(hints.invoke.notes.join(' ')).not.toContain('不支持该子命令');
    expect(hints.invoke.notes.join(' ')).toContain('更通用的入口');
    expect(hints.invoke.notes.join(' ')).toContain('两者并存');
    // call 侧同样写明比 invoke 更通用
    expect(hints.call.notes.join(' ')).toContain('比 invoke 更通用');
  });

  it('invoke 不设 until 门槛:上游 0.10.3 仍保留 invoke', () => {
    expect(CLI_ACTION_SPECS.invoke.until).toBeUndefined();
    expect(isBeyondUntil(CLI_ACTION_SPECS.invoke, '0.11.0')).toBe(false);
    // until 门控本身是活的（不是死字段）：越过门槛时给出提示
    expect(isBeyondUntil({ summary: 'x', until: '0.11.0' }, '0.11.0')).toBe(
      true,
    );
    expect(isBeyondUntil({ summary: 'x', until: '0.11.0' }, '0.10.3')).toBe(
      false,
    );
    expect(isBeyondUntil({ summary: 'x', until: '0.11.0' }, null)).toBe(false);
  });

  it('logs 的长驻说明只在子命令可用时给出(部分模式才长驻)', () => {
    expect(buildActionHint('logs', '0.8.8').notes.join(' ')).not.toContain(
      '仅 --follow 是长驻用法',
    );
    const notes = buildActionHint('logs', '0.10.2').notes.join(' ');
    expect(notes).toContain('仅 --follow 是长驻用法');
    expect(notes).toContain('timeout_ms');
    expect(notes).toContain('不带 --follow');
    // run 是整条命令都长驻
    expect(buildActionHint('run', '0.10.2').longRunning).toBe(true);
    expect(buildActionHint('logs', '0.10.2').longRunning).toBe(false);
  });

  it('长驻说明的推送矩阵:0.8.8 无 / 0.10.1 无 / 0.10.2 有 / 版本未知无', () => {
    const marker = '仅 --follow 是长驻用法';
    expect(buildActionHint('logs', '0.8.8').notes.join(' ')).not.toContain(
      marker,
    );
    expect(buildActionHint('logs', '0.10.1').notes.join(' ')).not.toContain(
      marker,
    );
    expect(buildActionHint('logs', '0.10.2').notes.join(' ')).toContain(marker);
    // 版本未知时同样不给（与 notes 的版本门控同一套标准）
    expect(buildActionHint('logs', null).notes.join(' ')).not.toContain(marker);
    expect(JSON.stringify(buildActionHints(null))).not.toContain(marker);
  });

  it('工具描述列出全部 13 个子命令(顺序一致)并显式写明版本门槛', () => {
    const description = buildCliToolDescription(null);
    // 顺序锁定：各 action 的出现位置必须递增（防重排）
    const positions = CLI_ACTIONS.map((a) => description.indexOf(`${a}=`));
    for (const pos of positions) {
      expect(pos).toBeGreaterThan(-1);
    }
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
    expect(description).toContain('watch/bridge/run');
    expect(description).toContain('logs 的 --follow 模式');
    // 版本专属语法必须伴随版本门槛说明（否则 0.8.8 用户会照抄不存在的选项）
    expect(description).toContain('tools/call 需 CLI >= 0.10.1');
    expect(description).toContain('run/logs 需 >= 0.10.2');
    expect(description).toContain('以执行结果的 hints 为准');
  });

  it('文档与 README 的 CLI 子命令清单与规格表整串同源', () => {
    const docs = readFileSync(join(REPO_ROOT, 'docs/TOOLS.md'), 'utf8');
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
    // 整串连续匹配：删掉清单行时用例必红（逐词 toContain 会被正文里的同名词绕过）
    expect(docs).toContain(CANONICAL_ACTION_LIST);
    expect(readme).toContain(CANONICAL_ACTION_LIST);
  });

  it('文档与 README 的版本门槛与长驻口径一致', () => {
    const docs = readFileSync(join(REPO_ROOT, 'docs/TOOLS.md'), 'utf8');
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
    expect(docs).toContain('`tools` / `call` 需 CLI **≥ 0.10.1**');
    expect(docs).toContain('`run` / `logs` 需 CLI **≥ 0.10.2**');
    expect(readme).toContain('`tools` / `call` 需 CLI ≥ 0.10.1');
    expect(readme).toContain('`run` / `logs` 需 ≥ 0.10.2');
    expect(readme).toContain('13 个');
    expect(docs).toContain('13 个');
    // 长驻口径两处写法不同（斜杠 vs 带空格），各自锁定
    expect(docs).toContain('watch / bridge / run');
    expect(readme).toContain('watch` / `bridge` / `run');
  });

  it('文档动作表与 catalog 枚举同源(logs/window/animation)+0.10.x 关键词锚点', () => {
    const docs = readFileSync(join(REPO_ROOT, 'docs/TOOLS.md'), 'utf8');
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
    const enumOf = (tool: string): readonly string[] => {
      const spec = COMPOUND_TOOL_SPECS.find((s) => s.name === tool);
      const action = spec?.parameters['action'] as
        { enum?: readonly string[] } | undefined;
      return action?.enum ?? [];
    };
    // docs 动作表逐名锁定：catalog 改枚举而文档没跟 → 用例必红（D-1/D-2 与
    // 批八 2/4 animation 3 值改动的同源护栏）
    for (const a of enumOf('logs')) {
      expect(docs, `logs ${a}`).toContain(`\`${a}\``);
    }
    for (const a of enumOf('window')) {
      expect(docs, `window ${a}`).toContain(`\`${a}\``);
    }
    for (const a of enumOf('animation')) {
      expect(docs, `animation ${a}`).toContain(`\`${a}\``);
    }
    // wait_for 10 值闭集在 docs 全量出现（D-3）
    for (const c of [
      'text',
      'text_gone',
      'selector',
      'selector_gone',
      'url',
      'ipc_idle',
      'network_idle',
      'expression',
      'event',
      'log',
    ]) {
      expect(docs, `wait_for ${c}`).toContain(`\`${c}\``);
    }
    // D-4 新参数关键词锚点：README 与 docs 各至少一次
    for (const kw of [
      'timeout_ms',
      'with_logs',
      'since_seq',
      'backend_log_cursor',
      'include_hidden',
    ]) {
      expect(docs, `docs ${kw}`).toContain(kw);
      expect(readme, `readme ${kw}`).toContain(kw);
    }
    // E-2 工具数口径：38 = 35 上游 + 3 插件自有
    expect(readme).toContain('38 个 dsh 工具');
    expect(readme).toContain('35 个');
  });
});
