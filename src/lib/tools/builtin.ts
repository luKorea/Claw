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
      '读取本地 UTF-8 文本文件内容。只能传文件路径，目录必须改用 list_dir。支持 ~、$HOME、/home 表示当前用户主目录；文件大小上限默认 1MB。仅允许访问用户主目录、桌面、文档、下载、临时目录下的文件。',
    source: 'builtin',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            '文本文件路径，不要传目录。可使用绝对路径、~/...、$HOME/...，或 /home 表示当前用户主目录。',
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
    description:
      '列出指定目录下的文件和子目录。读取目录内容时使用此工具，不要用 read_file。',
    source: 'builtin',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            '目录路径。可使用绝对路径、~/...、$HOME/...，或 /home 表示当前用户主目录。',
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
