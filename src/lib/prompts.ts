import { invoke } from '@tauri-apps/api/core';

import { BUILTIN_PRESETS, type PromptPreset } from '@/stores/prompts';
import { now, uuid } from '@/lib/utils';

const SEED_FLAG = 'claw.prompts.seeded.v1';

export const promptApi = {
  list: () => invoke<PromptPreset[]>('list_prompt_presets'),
  create: (input: { name: string; content: string; builtin?: boolean }) =>
    invoke<PromptPreset>('create_prompt_preset', { input }),
  update: (input: { id: string; name?: string; content?: string }) =>
    invoke<void>('update_prompt_preset', { input }),
  remove: (id: string) => invoke<void>('delete_prompt_preset', { id }),
};

/** 首次启动时把内置预设写入数据库（带幂等检查） */
export async function seedBuiltinPresets(): Promise<void> {
  if (localStorage.getItem(SEED_FLAG)) return;
  const existing = await promptApi.list();
  if (existing.length === 0) {
    for (const preset of BUILTIN_PRESETS) {
      await promptApi.create({
        name: preset.name,
        content: preset.content,
        builtin: true,
      });
    }
  }
  localStorage.setItem(SEED_FLAG, '1');
}

/** 简单的变量占位替换：{{key}} -> value */
export function applyPromptVariables(
  content: string,
  vars: Record<string, string>,
): string {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

export type { PromptPreset };

// Re-export uuid/now for prompt components
export { uuid, now };
