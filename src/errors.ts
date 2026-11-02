/** victauri 桥的结构化错误:kind 可判别,细节字段可编程消费。 */
export class VictauriError extends Error {
  readonly kind: VictauriErrorKind;

  constructor(kind: VictauriErrorKind, message: string) {
    super(`[${kind}] ${message}`);
    this.name = 'VictauriError';
    this.kind = kind;
  }
}

export type VictauriErrorKind =
  /** discovery 目录不存在或无候选实例 */
  | 'no-instance'
  /** 实例目录缺 token/port 文件或 metadata.json 损坏 */
  | 'instance-incomplete'
  /** 所有候选实例探活失败(端口不通/token 不配对) */
  | 'no-live-instance'
  /** HTTP 层非 2xx(带 status) */
  | 'http-error'
  /** 请求超时 */
  | 'timeout'
  /** 工具执行被 victauri 拒绝(工具级错误响应) */
  | 'tool-error';

/** HTTP 非 2xx 错误:携带状态码与响应体摘要。 */
export class VictauriHttpError extends VictauriError {
  readonly status: number;
  readonly bodyPreview: string;

  constructor(status: number, bodyPreview: string, context: string) {
    super(
      'http-error',
      `${context} failed with HTTP ${status}${bodyPreview ? `: ${bodyPreview}` : ''}`,
    );
    this.name = 'VictauriHttpError';
    this.status = status;
    this.bodyPreview = bodyPreview;
  }
}

/** 请求超时错误:携带目标 URL 与超时毫秒。 */
export class VictauriTimeoutError extends VictauriError {
  readonly url: string;
  readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number) {
    super('timeout', `request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'VictauriTimeoutError';
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}
