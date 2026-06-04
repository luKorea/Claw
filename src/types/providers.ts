/**
 * Provider / Model registry (v1.1+)
 *
 * 多 Provider 架构: 一家桌面客户端同时支持多家 LLM。
 * 模型 id 是全局字符串,通过 getProviderOfModel() 反查 provider。
 *
 * 不在范围: Gemini / Azure OpenAI / 用户自定义 baseURL。
 */

export type ProviderId = 'anthropic' | 'deepseek' | 'openai' | 'minimaxi';

export const ALL_PROVIDER_IDS: readonly ProviderId[] = [
  'anthropic',
  'deepseek',
  'openai',
  'minimaxi',
] as const;

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  /** 设置面板输入框 placeholder 提示 */
  keyPlaceholder: string;
  /** 帮助链接(用户去拿 key 的网页) */
  keyHelpUrl: string;
  /** 帮助链接显示文案 */
  keyHelpLabel: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    keyPlaceholder: 'sk-ant-api03-...',
    keyHelpUrl: 'https://console.anthropic.com',
    keyHelpLabel: 'console.anthropic.com',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    keyPlaceholder: 'sk-...',
    keyHelpUrl: 'https://platform.deepseek.com',
    keyHelpLabel: 'platform.deepseek.com',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    keyPlaceholder: 'sk-proj-...',
    keyHelpUrl: 'https://platform.openai.com',
    keyHelpLabel: 'platform.openai.com',
  },
  minimaxi: {
    id: 'minimaxi',
    label: 'MiniMax',
    // v1.3 修正:之前误以为 MiniMax 走 OpenAI 兼容,key 是 eyJ... JWT。
    // 实测 MiniMax 提供 Anthropic 兼容 endpoint,key 格式是 sk-cp-...(Anthropic 风格)。
    keyPlaceholder: 'sk-cp-...',
    keyHelpUrl: 'https://platform.minimaxi.com',
    keyHelpLabel: 'platform.minimaxi.com',
  },
};

export interface ModelInfo {
  id: string;
  provider: ProviderId;
  label: string;
  family: string;
  /** 是否支持扩展 thinking / reasoning 块 */
  supportsThinking: boolean;
  /** 上下文窗口大小 (tokens),用于 UI 限流 */
  maxContextTokens?: number;
  /** 聊天标签,UI 显示 */
  groupLabel: string;
}

const ANTHROPIC_MODELS: ModelInfo[] = [
  { id: 'claude-opus-4-8', provider: 'anthropic', label: 'Claude Opus 4.8', family: 'opus', supportsThinking: true, maxContextTokens: 200_000, groupLabel: 'Anthropic' },
  { id: 'claude-sonnet-4-6', provider: 'anthropic', label: 'Claude Sonnet 4.6', family: 'sonnet', supportsThinking: true, maxContextTokens: 200_000, groupLabel: 'Anthropic' },
  { id: 'claude-haiku-4-5-20251001', provider: 'anthropic', label: 'Claude Haiku 4.5', family: 'haiku', supportsThinking: false, maxContextTokens: 200_000, groupLabel: 'Anthropic' },
];

const DEEPSEEK_MODELS: ModelInfo[] = [
  { id: 'deepseek-chat', provider: 'deepseek', label: 'DeepSeek-V3 Chat', family: 'v3', supportsThinking: false, maxContextTokens: 64_000, groupLabel: 'DeepSeek' },
  { id: 'deepseek-reasoner', provider: 'deepseek', label: 'DeepSeek-R1 Reasoner', family: 'r1', supportsThinking: true, maxContextTokens: 64_000, groupLabel: 'DeepSeek' },
];

const OPENAI_MODELS: ModelInfo[] = [
  { id: 'gpt-5', provider: 'openai', label: 'GPT-5', family: 'gpt-5', supportsThinking: true, maxContextTokens: 400_000, groupLabel: 'OpenAI' },
  { id: 'gpt-5-mini', provider: 'openai', label: 'GPT-5 mini', family: 'gpt-5', supportsThinking: true, maxContextTokens: 400_000, groupLabel: 'OpenAI' },
  { id: 'gpt-4o', provider: 'openai', label: 'GPT-4o', family: 'gpt-4o', supportsThinking: false, maxContextTokens: 128_000, groupLabel: 'OpenAI' },
  { id: 'gpt-4o-mini', provider: 'openai', label: 'GPT-4o mini', family: 'gpt-4o', supportsThinking: false, maxContextTokens: 128_000, groupLabel: 'OpenAI' },
];

const MINIMAXI_MODELS: ModelInfo[] = [
  { id: 'MiniMax-M2.7', provider: 'minimaxi', label: 'MiniMax M2.7', family: 'm2', supportsThinking: true, maxContextTokens: 128_000, groupLabel: 'MiniMax' },
  { id: 'MiniMax-M2.7-highspeed', provider: 'minimaxi', label: 'MiniMax M2.7 Highspeed', family: 'm2', supportsThinking: true, maxContextTokens: 128_000, groupLabel: 'MiniMax' },
  { id: 'MiniMax-M2.5', provider: 'minimaxi', label: 'MiniMax M2.5', family: 'm2', supportsThinking: false, maxContextTokens: 128_000, groupLabel: 'MiniMax' },
  { id: 'MiniMax-M2.1', provider: 'minimaxi', label: 'MiniMax M2.1', family: 'm2', supportsThinking: false, maxContextTokens: 128_000, groupLabel: 'MiniMax' },
];

export const ALL_MODELS: readonly ModelInfo[] = [
  ...ANTHROPIC_MODELS,
  ...DEEPSEEK_MODELS,
  ...OPENAI_MODELS,
  ...MINIMAXI_MODELS,
];

export const MODEL_REGISTRY: Record<ProviderId, readonly ModelInfo[]> = {
  anthropic: ANTHROPIC_MODELS,
  deepseek: DEEPSEEK_MODELS,
  openai: OPENAI_MODELS,
  minimaxi: MINIMAXI_MODELS,
};

const MODEL_BY_ID = new Map<string, ModelInfo>(ALL_MODELS.map((m) => [m.id, m]));

export function getModelInfo(id: string): ModelInfo | null {
  return MODEL_BY_ID.get(id) ?? null;
}

export function getProviderOfModel(id: string): ProviderId | null {
  return MODEL_BY_ID.get(id)?.provider ?? null;
}

export function listModelsByProvider(): Array<{ provider: ProviderId; models: ModelInfo[] }> {
  return ALL_PROVIDER_IDS.map((p) => ({
    provider: p,
    models: [...MODEL_REGISTRY[p]],
  }));
}

export const DEFAULT_MODEL_ID = 'MiniMax-M2.7';
