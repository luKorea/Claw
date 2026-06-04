import { invoke } from '@tauri-apps/api/core';

export interface ToolExecResult {
  ok: boolean;
  content: string;
}

/**
 * 执行一个内置工具调用。
 * 返回的 content 是 JSON 字符串或纯文本，将作为 tool_result 块回传模型。
 */
export async function executeBuiltinTool(
  name: string,
  input: unknown,
): Promise<ToolExecResult> {
  try {
    switch (name) {
      case 'read_file': {
        const args = input as { path: string; max_bytes?: number };
        const result = await invoke<{ path: string; content: string; size: number }>(
          'read_text_file',
          { path: args.path, maxBytes: args.max_bytes },
        );
        return {
          ok: true,
          content: JSON.stringify(
            { path: result.path, size: result.size, content: result.content },
            null,
            2,
          ),
        };
      }
      case 'list_dir': {
        const args = input as { path: string };
        const result = await invoke<{
          path: string;
          entries: { name: string; path: string; is_dir: boolean; size: number }[];
        }>('list_dir', { path: args.path });
        return { ok: true, content: JSON.stringify(result, null, 2) };
      }
      case 'write_file': {
        const args = input as { path: string; content: string };
        const result = await invoke<{ path: string; bytes_written: number }>(
          'write_text_file',
          { path: args.path, content: args.content },
        );
        return {
          ok: true,
          content: JSON.stringify(
            { path: result.path, bytes_written: result.bytes_written },
          ),
        };
      }
      default:
        return { ok: false, content: `未知工具: ${name}` };
    }
  } catch (err) {
    return {
      ok: false,
      content: `工具执行失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
