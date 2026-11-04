/**
 * standalone 工具结果文本渲染：JSON → ContentBlock[]。
 * 图像结果（{data,mimeType} 形态）由 image.ts 在渲染之前分流落盘，
 * 本模块只负责文本渲染与截断。
 */
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
