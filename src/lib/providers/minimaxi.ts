/**
 * MiniMax (minimaxi) Provider Adapter
 *
 * 走 OpenAI 兼容协议,baseURL 固定 https://api.minimax.io/v1。
 * M2.7 系列支持 `reasoning_content` 字段流式回 reasoning,
 * 与 DeepSeek-R1 走同一 AdapterEvent `thinking_delta` 通道。
 *
 * **Key 格式:实际是 JWT (`eyJ...` 开头)**,不是 `sk-`。
 * 之前注释误写为 `sk-cp-`,导致 validate_input 强校验失败,用户配不上。
 */

import { OpenAICompatAdapter } from '@/lib/providers/openai-compatible';
import type { ProviderAdapter } from '@/lib/providers/types';

class MiniMaxIAdapter extends OpenAICompatAdapter {
  constructor() {
    super('minimaxi', {
      // v1.3 修正:MiniMax 官方 baseURL 是 api.minimax.io(过去硬编码 minimaxi.com
      // 仍可解析但部分账号返回 401)。两个域名均官方所有,以 .io 为主。
      baseUrl: 'https://api.minimax.io/v1',
      // previewKey 截取前缀用。MiniMax JWT 前缀是 'eyJ'。
      keyPrefix: 'eyJ',
      providerLabel: 'MiniMax',
      // v1.3:MiniMax 用 JWT,非 `sk-` 前缀。覆盖默认 validateKey。
      validateKey: (key) => {
        if (!key) return { ok: false, reason: 'API Key 不能为空' };
        if (!key.startsWith('eyJ')) {
          return { ok: false, reason: 'MiniMax API Key 应该是 JWT 格式 (eyJ...)' };
        }
        return { ok: true };
      },
    });
  }
}

export const minimaxiAdapter: ProviderAdapter = new MiniMaxIAdapter();
