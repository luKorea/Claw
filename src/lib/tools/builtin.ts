/**
 * 内置工具定义 (v1.1+)
 *
 * 工具 schema 使用 provider-agnostic 形态(`parameters` 字段,JSON Schema)。
 * 各 adapter 内部转 Anthropic `input_schema` 或 OAI `function.parameters`。
 *
 * 实际执行通过 Tauri command(路径白名单、UTF-8 文本约束)。
 */

import type { ToolDefinition } from '@/types/tool';

export const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description:
      '读取本地文本文件的内容(UTF-8)。文件大小上限默认 1MB。仅允许访问用户主目录、桌面、文档、下载、临时目录下的文件。',
    source: 'builtin',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文件的绝对路径',
        },
        max_bytes: {
          type: 'integer',
          description: '最大读取字节数(默认 1048576)',
          minimum: 1,
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_dir',
    description: '列出指定目录下的文件和子目录。',
    source: 'builtin',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '目录的绝对路径',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      '把文本内容写入本地文件(覆盖或新建)。会先创建父目录。危险操作,仅在用户明确允许时使用。',
    source: 'builtin',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目标文件绝对路径' },
        content: { type: 'string', description: '要写入的文本内容' },
      },
      required: ['path', 'content'],
    },
  },
];

/** 过滤掉被用户禁用的内置工具 */
export function filterEnabled(disabled: readonly string[]): ToolDefinition[] {
  return BUILTIN_TOOLS.filter((t) => !disabled.includes(t.name));
}
