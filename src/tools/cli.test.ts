import { describe, expect, it } from 'vitest';

import { createVictauriCliTool, victauriCliTool } from './cli.ts';

/** ToolDefinition.execute 返回 unknown(运行时接口),断言回具体形状。 */
interface CliToolValue {
  exit_code: number | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
}

/** 工具工厂注入 node 本体当 cliPath:用 -e 脚本模拟 victauri 子命令行为。 */
const tool = createVictauriCliTool({ cliPath: process.execPath });

describe('dsh-victauri victauri_cli tool', () => {
  it('execute 拼装 [action, ...args] 并返回结构化四元组', async () => {
    const result = (await tool.execute(
      {
        action: 'doctor',
        args: ['probe-arg'],
      },
      {} as never,
    )) as CliToolValue;
    // node -e 脚本不认识 doctor 子命令,exit 非零但结构化字段齐全
    expect(result).toMatchObject({
      exit_code: expect.anything(),
      stdout: expect.any(String),
      stderr: expect.any(String),
      timed_out: false,
    });
  });

  it('入参透传到子进程参数列表(argv 验证)', async () => {
    // 让 node 打印 argv:args 透传含 JSON 可解析内容
    const probe = createVictauriCliTool({ cliPath: process.execPath });
    const result = (await probe.execute(
      {
        action: 'coverage',
        args: ['--format', 'json'],
      },
      {} as never,
    )) as CliToolValue;
    expect(result.timed_out).toBe(false);
    // node 无 coverage 参数会报 unknown option,stderr 应包含子命令名
    expect(result.stderr + result.stdout).toContain('coverage');
  });

  it('timeout_ms 透传:1ms 超时强杀正常命令 → timed_out', async () => {
    // node 启动需数十 ms,1ms 预算必超时——验证 timeout_ms 确实透传生效
    // (超时全链路已在 cli.test.ts 用长驻脚本独立覆盖;此处 action 挡首位
    // 无法注入 -e 长驻脚本,故用极短预算等价验证)
    const result = (await tool.execute(
      {
        action: 'doctor',
        args: ['-e', 'console.log("ok")'],
        timeout_ms: 1,
      },
      {} as never,
    )) as CliToolValue;
    expect(result.timed_out).toBe(true);
    expect(result.exit_code).toBeNull();
  }, 10_000);

  it('默认工具常量可导入且 name 正确', () => {
    expect(victauriCliTool.name).toBe('victauri_cli');
  });

  it('enum 外 action 在 defineTool 参数校验层被拦截', async () => {
    await expect(
      tool.execute(
        // 绕过类型标注模拟非法调用:校验在 execute 内部先行
        { action: 'rm -rf /' as never, args: [] },
        {} as never,
      ),
    ).rejects.toThrow(/must be one of/);
  });
});
