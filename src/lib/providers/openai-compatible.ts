/**
 * OpenAI 兼容 Provider Adapter (v1.1+)
 *
 * 通用 OAI Chat Completions 协议 driver,DeepSeek / OpenAI 共用。
 * baseURL + 部分 provider-specific 字段由子类注入。
 *
 * 不引入 openai SDK,直接 fetch + ReadableStream 解析 SSE。
 */

import type {
  AdapterEvent,
  AdapterMessage,
  AdapterRequest,
  ProviderAdapter,
} from '@/lib/providers/types';
import type { ToolDefinition } from '@/types/tool';
import type { Usage } from '@/types/claude';
import type { ProviderId } from '@/types/providers';

export interface OpenAICompatConfig {
  baseUrl: string;
  /** provider 内部用,用于 previewKey 区分 */
  keyPrefix: string;
  /** 校验 key 的最低要求(默认要 sk- 开头) */
  validateKey?: (key: string) => { ok: true } | { ok: false; reason: string };
  /** 额外请求头(可选),如 deepseek 不需要 */
  extraHeaders?: Record<string, string>;
  /** provider 标识,在错误信息中透出 */
  providerLabel: string;
  /** 是否支持 stream_options.include_usage,默认 true */
  supportsUsageChunk?: boolean;
}

interface OAIToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: ToolDefinition['parameters'] };
}

/**
 * tool_calls delta 累积器。同一 index 可能在多个 chunk 里追加 id/name/args。
 * `args` 用字符串拼接,流结束(`[DONE]` / finish_reason)时一次性 JSON.parse。
 */
export interface ToolAccEntry {
  id?: string;
  name?: string;
  args: string;
}

interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}

interface OAIRequest {
  model: string;
  messages: OAIMessage[];
  max_tokens: number;
  stream: true;
  stream_options?: { include_usage: true };
  tools?: OAIToolDef[];
  /** OAI o-series reasoning effort,或 DeepSeek 走 max_tokens 与 reasoning_content 联动 */
  reasoning_effort?: 'low' | 'medium' | 'high';
  temperature?: number;
}

interface OAIChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices?: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string | null;
      /** DeepSeek 扩展:推理内容与 content 并列 */
      reasoning_content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  /** 最后一个 chunk 携带 usage */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    /** OpenAI o-series: 推理 token 单独计 */
    completion_tokens_details?: { reasoning_tokens?: number };
    cache_read_input_tokens?: number;
  };
}

export function toOAIMessages(msgs: AdapterMessage[]): OAIMessage[] {
  return msgs.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool' as const,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        tool_call_id: m.tool_call_id,
      };
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      return {
        role: 'assistant' as const,
        content: typeof m.content === 'string' ? m.content : null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
          },
        })),
      };
    }
    return {
      role: m.role as 'system' | 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : '',
    };
  });
}

export class OpenAICompatAdapter implements ProviderAdapter {
  readonly id: ProviderId;
  readonly baseUrl: string;
  readonly capabilities = { thinking: true, tools: true, system: true };
  private readonly cfg: OpenAICompatConfig;

  constructor(
    id: ProviderId,
    cfg: OpenAICompatConfig,
  ) {
    this.id = id;
    this.baseUrl = cfg.baseUrl;
    this.cfg = cfg;
  }

  validateKey(key: string): { ok: true } | { ok: false; reason: string } {
    if (this.cfg.validateKey) return this.cfg.validateKey(key);
    if (!key) return { ok: false, reason: 'API Key 不能为空' };
    if (!key.startsWith('sk-')) return { ok: false, reason: `API Key 必须以 sk- 开头` };
    return { ok: true };
  }

  previewKey(key: string): string {
    if (key.length < 4) return `${this.cfg.keyPrefix}…`;
    return `${this.cfg.keyPrefix}…${key.slice(-4)}`;
  }

  async *stream(
    req: AdapterRequest,
    apiKey: string,
    signal: AbortSignal,
  ): AsyncIterable<AdapterEvent> {
    if (!apiKey) throw new Error(`缺少 ${this.cfg.providerLabel} API Key`);

    const body: OAIRequest = {
      model: req.model,
      messages: toOAIMessages(req.messages),
      max_tokens: req.max_tokens,
      stream: true,
    };
    if (this.cfg.supportsUsageChunk !== false) {
      body.stream_options = { include_usage: true };
    }
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map((d) => ({
        type: 'function' as const,
        function: {
          name: d.name,
          description: d.description,
          parameters: d.parameters,
        },
      }));
    }

    const url = `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    if (this.cfg.extraHeaders) Object.assign(headers, this.cfg.extraHeaders);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      yield { type: 'error', error: err instanceof Error ? err : new Error(String(err)) };
      return;
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      yield {
        type: 'error',
        error: new Error(
          `${this.cfg.providerLabel} 请求失败 ${response.status}: ${text.slice(0, 300)}`,
        ),
      };
      return;
    }

    yield* this.parseSSE(response.body, signal);
  }

  private async *parseSSE(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal,
  ): AsyncIterable<AdapterEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    // tool_calls delta 累积:index → ToolAccEntry
    const toolAcc = new Map<number, ToolAccEntry>();

    try {
      while (true) {
        if (signal.aborted) return;
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 按 \n\n 切分事件
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const ev of parseSSEEvent(raw, toolAcc)) {
            yield ev;
          }
        }
      }
      // flush 尾部
      if (buffer.trim()) {
        for (const ev of parseSSEEvent(buffer, toolAcc)) {
          yield ev;
        }
      }
    } catch (err) {
      if (!signal.aborted) {
        yield { type: 'error', error: err instanceof Error ? err : new Error(String(err)) };
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * 解析单个 SSE 事件块(以 \n\n 切分后的单段 raw 文本)。
 * - 收集所有 `data:` 行,多行拼接(支持 line-break 续行)
 * - 忽略 `event:` / `id:` / `retry:` / 注释行(`: ping`)
 * - 处理 `[DONE]` 哨兵,flush 累积的 tool_calls
 * - 处理 usage-only chunk(OpenAI o-series 末尾)
 * - 处理 finish_reason,flush 残留 tool_use 并 yield done
 *
 * @param raw 一个或多个 `\n` 分隔的 SSE 行
 * @param toolAcc 跨事件共享的 tool_calls 累积器(由 parseSSE 持有)
 * @returns 同步事件序列。**会修改 toolAcc**(id 累积、args 拼接、`[DONE]`/finish_reason 时清空)
 */
export function parseSSEEvent(
  raw: string,
  toolAcc: Map<number, ToolAccEntry>,
): AdapterEvent[] {
  const events: AdapterEvent[] = [];
  // 收集所有 data: 行
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
    // 忽略 event: / id: / retry: / 注释行(: ping)
  }
  if (dataLines.length === 0) return events;
  const data = dataLines.join('\n');
  if (data === '[DONE]') {
    // flush 累积的 tool_calls
    for (const [, acc] of toolAcc) {
      if (acc.id) {
        let parsed: unknown = {};
        if (acc.args) {
          try {
            parsed = JSON.parse(acc.args);
          } catch {
            parsed = { __raw: acc.args };
          }
        }
        events.push({ type: 'tool_use_end', id: acc.id, input: parsed });
      }
    }
    toolAcc.clear();
    return events;
  }

  let chunk: OAIChunk;
  try {
    chunk = JSON.parse(data) as OAIChunk;
  } catch {
    // 非 JSON 忽略(心跳等)
    return events;
  }

  // 单独 usage chunk
  if (chunk.usage && (!chunk.choices || chunk.choices.length === 0)) {
    const u = chunk.usage;
    const usage: Usage = {
      input_tokens: u.prompt_tokens ?? 0,
      output_tokens: u.completion_tokens ?? 0,
      reasoning_tokens: u.completion_tokens_details?.reasoning_tokens,
      cache_read_input_tokens: u.cache_read_input_tokens,
      raw: u as unknown as Record<string, unknown>,
    };
    events.push({ type: 'usage', usage });
    events.push({ type: 'done', stopReason: null });
    return events;
  }

  if (!chunk.choices) return events;
  for (const choice of chunk.choices) {
    const d = choice.delta;
    if (d.content) events.push({ type: 'text_delta', text: d.content });
    if (d.reasoning_content) events.push({ type: 'thinking_delta', thinking: d.reasoning_content });

    if (d.tool_calls) {
      for (const tc of d.tool_calls) {
        const acc = toolAcc.get(tc.index) ?? { args: '' };
        // 第一次见到此 index 且 id+name 都到齐时,先 yield start(顺序:start → delta)
        const tcName = tc.function?.name;
        if (!acc.id && tc.id && tcName) {
          acc.id = tc.id;
          acc.name = tcName;
          events.push({ type: 'tool_use_start', id: tc.id, name: tcName });
        } else {
          // 后续 chunk 只补 id / name(不会有 start)
          if (tc.id) acc.id = tc.id;
          if (tcName) acc.name = tcName;
        }
        if (tc.function?.arguments) {
          acc.args += tc.function.arguments;
          if (acc.id) {
            events.push({ type: 'tool_use_delta', id: acc.id, input_delta: tc.function.arguments });
          }
        }
        toolAcc.set(tc.index, acc);
      }
    }

    if (choice.finish_reason) {
      // 先 flush 残留 tool_use
      for (const [, acc] of toolAcc) {
        if (acc.id) {
          let parsed: unknown = {};
          if (acc.args) {
            try {
              parsed = JSON.parse(acc.args);
            } catch {
              parsed = { __raw: acc.args };
            }
          }
          events.push({ type: 'tool_use_end', id: acc.id, input: parsed });
        }
      }
      toolAcc.clear();
      events.push({ type: 'done', stopReason: choice.finish_reason });
    }
  }

  // chunk 自带 usage(非空 choices 也有)
  if (chunk.usage) {
    const u = chunk.usage;
    events.push({
      type: 'usage',
      usage: {
        input_tokens: u.prompt_tokens ?? 0,
        output_tokens: u.completion_tokens ?? 0,
        reasoning_tokens: u.completion_tokens_details?.reasoning_tokens,
        cache_read_input_tokens: u.cache_read_input_tokens,
        raw: u as unknown as Record<string, unknown>,
      },
    });
  }
  return events;
}
