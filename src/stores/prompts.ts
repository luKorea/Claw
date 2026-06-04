import { create } from 'zustand';

export interface PromptPreset {
  id: string;
  name: string;
  content: string;
  builtin: number; // 0 | 1
  created_at: number;
}

export interface PromptsState {
  list: PromptPreset[];
  setList: (list: PromptPreset[]) => void;
  upsert: (preset: PromptPreset) => void;
  remove: (id: string) => void;
}

/** 内置预设：首次启动时插入 */
export const BUILTIN_PRESETS: Omit<PromptPreset, 'id' | 'created_at'>[] = [
  {
    name: '通用助手',
    builtin: 1,
    content: '你是一个乐于助人的助手。请简洁、准确地回答用户的问题。',
  },
  {
    name: '代码审查',
    builtin: 1,
    content:
      '你是一位资深代码审查专家。请仔细阅读用户提交的代码，指出潜在的 bug、性能问题、安全隐患、可读性问题，并给出改进建议。回答时先概括问题，再列出具体位置和修复方案。',
  },
  {
    name: '翻译助手',
    builtin: 1,
    content:
      '你是一位精通多国语言的专业翻译。请将用户输入的文本准确、自然地翻译成目标语言，保留原文的语气、专业术语和格式。',
  },
  {
    name: '总结助手',
    builtin: 1,
    content:
      '你是一位总结专家。请将用户提供的内容压缩为结构化的要点总结，保留关键信息、数字、人名、结论。',
  },
];

export const usePromptsStore = create<PromptsState>((set) => ({
  list: [],
  setList: (list) => set({ list }),
  upsert: (preset) =>
    set((s) => {
      const existing = s.list.findIndex((p) => p.id === preset.id);
      if (existing === -1) return { list: [preset, ...s.list] };
      const next = s.list.slice();
      next[existing] = preset;
      return { list: next };
    }),
  remove: (id) => set((s) => ({ list: s.list.filter((p) => p.id !== id) })),
}));
