import { describe, expect, it } from 'vitest';

import { consumeStream, type StreamCallbacks } from '@/lib/streaming';
import type { AdapterEvent } from '@/lib/providers/types';
import type { ContentBlock } from '@/types/claude';

async function* gen(events: AdapterEvent[]): AsyncIterable<AdapterEvent> {
  for (const e of events) yield e;
}

interface CollectSink {
  texts: string[];
  thinkings: string[];
  toolUses: Array<{ id: string; name: string; input: unknown }>;
  usages: number[];
  dones: Array<{ blocks: ContentBlock[]; stopReason: string | null }>;
  errors: Error[];
  cb: StreamCallbacks;
}

function freshSink(): CollectSink {
  const sink: Omit<CollectSink, 'cb'> = {
    texts: [],
    thinkings: [],
    toolUses: [],
    usages: [],
    dones: [],
    errors: [],
  };
  const cb: StreamCallbacks = {
    onText: (t) => sink.texts.push(t),
    onThinking: (t) => sink.thinkings.push(t),
    onToolUse: (b) => sink.toolUses.push(b),
    onUsage: (u) => sink.usages.push(u.input_tokens + u.output_tokens),
    onDone: (blocks, sr) => sink.dones.push({ blocks, stopReason: sr }),
    onError: (e) => sink.errors.push(e),
  };
  return { ...sink, cb };
}

describe('lib/streaming', () => {
  describe('text 累积', () => {
    it('连续 text_delta 合并到单个 text block', async () => {
      const s = freshSink();
      await consumeStream(
        gen([
          { type: 'text_delta', text: 'a' },
          { type: 'text_delta', text: 'b' },
          { type: 'text_delta', text: 'c' },
          { type: 'done', stopReason: 'stop' },
        ]),
        s.cb,
      );
      expect(s.dones).toHaveLength(1);
      const blocks = s.dones[0]?.blocks;
      expect(blocks).toHaveLength(1);
      expect(blocks?.[0]).toMatchObject({ type: 'text', text: 'abc' });
    });

    it('text 后接 thinking → 两个独立 block', async () => {
      const s = freshSink();
      await consumeStream(
        gen([
          { type: 'text_delta', text: 'hi' },
          { type: 'thinking_delta', thinking: 'thinking' },
          { type: 'done', stopReason: 'stop' },
        ]),
        s.cb,
      );
      const blocks = s.dones[0]?.blocks;
      expect(blocks).toHaveLength(2);
      expect(blocks?.[0]).toMatchObject({ type: 'text', text: 'hi' });
      expect(blocks?.[1]).toMatchObject({ type: 'thinking', thinking: 'thinking' });
    });
  });

  describe('tool_use 累积', () => {
    it('tool_use_start → delta → end 三段组装', async () => {
      const s = freshSink();
      await consumeStream(
        gen([
          { type: 'tool_use_start', id: 't1', name: 'read_file' },
          { type: 'tool_use_delta', id: 't1', input_delta: '{"path":"/a"}' },
          { type: 'tool_use_end', id: 't1', input: { path: '/a' } },
          { type: 'done', stopReason: 'tool_use' },
        ]),
        s.cb,
      );
      const blocks = s.dones[0]?.blocks;
      expect(blocks).toHaveLength(1);
      expect(blocks?.[0]).toMatchObject({
        type: 'tool_use',
        id: 't1',
        name: 'read_file',
        input: { path: '/a' },
      });
      // onToolUse 只在 end 时回调一次
      expect(s.toolUses).toEqual([{ id: 't1', name: 'read_file', input: { path: '/a' } }]);
    });

    it('多个 tool_use 并行累积', async () => {
      const s = freshSink();
      await consumeStream(
        gen([
          { type: 'tool_use_start', id: 't1', name: 'a' },
          { type: 'tool_use_start', id: 't2', name: 'b' },
          { type: 'tool_use_delta', id: 't1', input_delta: '{}' },
          { type: 'tool_use_delta', id: 't2', input_delta: '{"k":1}' },
          { type: 'tool_use_end', id: 't1', input: {} },
          { type: 'tool_use_end', id: 't2', input: { k: 1 } },
          { type: 'done', stopReason: 'tool_use' },
        ]),
        s.cb,
      );
      const blocks = s.dones[0]?.blocks;
      expect(blocks).toHaveLength(2);
      expect(blocks?.[0]).toMatchObject({ type: 'tool_use', id: 't1' });
      expect(blocks?.[1]).toMatchObject({ type: 'tool_use', id: 't2', input: { k: 1 } });
    });
  });

  describe('usage 合并', () => {
    it('多次 usage 事件合并(最后一次为 final)', async () => {
      const s = freshSink();
      await consumeStream(
        gen([
          { type: 'usage', usage: { input_tokens: 10, output_tokens: 0 } },
          { type: 'usage', usage: { input_tokens: 10, output_tokens: 50 } },
          { type: 'done', stopReason: 'stop' },
        ]),
        s.cb,
      );
      // 最后一次 onUsage 回调时,合并 usage = {input:10, output:50} → total 60
      expect(s.usages[s.usages.length - 1]).toBe(60);
    });
  });

  describe('done / error', () => {
    it('done 事件触发 onDone 并结束消费', async () => {
      const s = freshSink();
      await consumeStream(
        gen([
          { type: 'text_delta', text: 'x' },
          { type: 'done', stopReason: 'stop' },
          { type: 'text_delta', text: 'should not appear' },
        ]),
        s.cb,
      );
      expect(s.dones).toHaveLength(1);
      expect(s.texts).toEqual(['x']); // done 后第二个 text_delta 不应到达
    });

    it('error 事件触发 onError', async () => {
      const s = freshSink();
      await consumeStream(
        gen([
          { type: 'text_delta', text: 'x' },
          { type: 'error', error: new Error('boom') },
        ]),
        s.cb,
      );
      expect(s.errors).toHaveLength(1);
      expect(s.errors[0]?.message).toBe('boom');
      expect(s.dones).toHaveLength(0);
    });

    it('流自然结束(无 done)→ onDone(stopReason=null)', async () => {
      const s = freshSink();
      await consumeStream(gen([{ type: 'text_delta', text: 'x' }]), s.cb);
      expect(s.dones).toHaveLength(1);
      expect(s.dones[0]?.stopReason).toBeNull();
    });
  });
});
