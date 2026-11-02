/**
 * standalone 工具结果渲染：JSON → ContentBlock[]；screenshot base64 落盘。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ContentBlock, TextBlock } from '@deepseek-ai/dsh-llm/types';

/** JSON 文本渲染最大字符数（超出截断，防上下文爆炸）。 */
export const RENDER_MAX_CHARS = 6000;

/** 通用 JSON 结果渲染：pretty-print + 截断。 */
export function renderJson(value: unknown): ContentBlock[] {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    text = String(value);
  }
  if (text.length > RENDER_MAX_CHARS) {
    text = `${text.slice(0, RENDER_MAX_CHARS)}\n…(截断,共 ${text.length} 字符)`;
  }
  const block: TextBlock = { type: 'text', text };
  return [block];
}

/** screenshot 落盘目录名（%TEMP% 之下）。 */
export const SCREENSHOT_DIR_NAME = 'dsh-victauri';

/**
 * screenshot 结果落盘：data(base64 PNG) 写入 %TEMP%\dsh-victauri\screenshot-<ts>.png，
 * 返回 {path, mime_type, bytes}——dsh ImageBlock 需要 durable attachment ref，
 * 直接回路径是 dsh-browser 同款惯例。
 */
export function saveScreenshot(
  data: string,
  mimeType: string,
): { path: string; mime_type: string; bytes: number } {
  const dir = join(tmpdir(), SCREENSHOT_DIR_NAME);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `screenshot-${Date.now()}.png`);
  const buf = Buffer.from(data, 'base64');
  writeFileSync(file, buf);
  return { path: file, mime_type: mimeType, bytes: buf.byteLength };
}
