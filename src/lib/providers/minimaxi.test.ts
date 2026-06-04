/**
 * MiniMax (minimaxi) Provider Adapter 测试
 *
 * v1.3:MiniMax **不走 OAI 兼容**,而是走 Anthropic 兼容协议
 * (`POST /anthropic/v1/messages`,用 `X-Api-Key: sk-cp-...` 头)。
 * 复用 `AnthropicAdapter` 同一份 SDK 逻辑,只换 baseURL + validateKey。
 *
 * 这里只测 adapter 自身的契约字段(id / baseURL / validateKey / previewKey),
 * SDK 内部事件解析、tool_use 累积、thinking 流转等走 anthropic.test.ts 覆盖。
 */

import { describe, expect, it } from 'vitest';

import { minimaxiAdapter } from '@/lib/providers/minimaxi';

describe('providers/minimaxi', () => {
  it('id 是 minimaxi', () => {
    expect(minimaxiAdapter.id).toBe('minimaxi');
  });

  it('baseURL 指向 MiniMax Anthropic 兼容端点', () => {
    // SDK 拼 /v1/messages → 实际 https://api.minimaxi.com/anthropic/v1/messages
    expect(minimaxiAdapter.baseUrl).toBe('https://api.minimaxi.com/anthropic');
  });

  it('capabilities:thinking / tools / system 全开(Anthropic 协议支持)', () => {
    expect(minimaxiAdapter.capabilities).toEqual({
      thinking: true,
      tools: true,
      system: true,
    });
  });

  describe('validateKey', () => {
    it('空 → 拒', () => {
      const r = minimaxiAdapter.validateKey('');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
    });

    it('非 sk- 开头 → 拒(MiniMax 用 Anthropic 风格 sk-cp-... 格式)', () => {
      // v1.3:MiniMax key 是 sk-cp-...(Anthropic 风格),不是 eyJ... JWT。
      // 之前误以为 MiniMax 走 OAI 兼容,key 是 JWT 格式,实际完全错。
      const r = minimaxiAdapter.validateKey('eyJhbGciOiJIUzI1NiJ9.xxx');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/sk-/);
    });

    it('sk-cp- 开头 → 通过(用户实测 key 格式)', () => {
      const ok = minimaxiAdapter.validateKey(
        'sk-cp-w8WejBEq4WTalwNdcOiueI6MaTP9LadQ-6zQZ9fsZLNV8H5QdF9zu6fityMoxPaRzFMMuVzxWmqx_NUOyK9QdZ5H81W7DhppeTvOi6vAXkifti_gO8CV1s',
      );
      expect(ok.ok).toBe(true);
    });

    it('sk-ant-... / sk-proj-... 任意 sk- 开头都通过(协议层不限定 provider 内的细分 prefix)', () => {
      expect(minimaxiAdapter.validateKey('sk-ant-api03-abc').ok).toBe(true);
      expect(minimaxiAdapter.validateKey('sk-proj-xyz').ok).toBe(true);
    });
  });

  describe('previewKey', () => {
    it('短 key(< 4 字符)安全降级', () => {
      expect(minimaxiAdapter.previewKey('123')).toBe('sk-…');
    });

    it('长 key 截取前缀 + 后 4 位', () => {
      // 跟 anthropic 一致(同走 sk-… 前缀,便于用户辨认)
      expect(minimaxiAdapter.previewKey('sk-cp-abcdef1234')).toBe('sk-…1234');
    });
  });
});
