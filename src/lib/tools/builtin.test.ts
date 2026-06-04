import { describe, expect, it } from 'vitest';

import { BUILTIN_TOOLS, filterEnabled } from '@/lib/tools/builtin';
import type { ToolDefinition } from '@/types/tool';

describe('lib/tools/builtin', () => {
  describe('BUILTIN_TOOLS', () => {
    it('至少包含 read_file / list_dir / write_file 三个工具', () => {
      const names = BUILTIN_TOOLS.map((t) => t.name);
      expect(names).toContain('read_file');
      expect(names).toContain('list_dir');
      expect(names).toContain('write_file');
    });

    it('每个 tool 都有 source=builtin 和合法 JSON Schema', () => {
      for (const t of BUILTIN_TOOLS) {
        expect(t.source).toBe('builtin');
        expect(t.description.length).toBeGreaterThan(0);
        expect(t.parameters.type).toBe('object');
        expect(typeof t.parameters.properties).toBe('object');
        expect(Array.isArray(t.parameters.required)).toBe(true);
        expect((t.parameters.required as string[]).length).toBeGreaterThan(0);
      }
    });

    it('read_file 的 max_bytes 是 integer + minimum: 1', () => {
      const rf = BUILTIN_TOOLS.find((t) => t.name === 'read_file') as ToolDefinition;
      expect(rf).toBeDefined();
      const props = rf.parameters.properties as Record<string, { type: string; minimum?: number }>;
      expect(props.max_bytes?.type).toBe('integer');
      expect(props.max_bytes?.minimum).toBe(1);
    });

    it('tool name 唯一', () => {
      const names = BUILTIN_TOOLS.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe('filterEnabled', () => {
    it('空 disabled 列表 → 返回全部', () => {
      expect(filterEnabled([])).toHaveLength(BUILTIN_TOOLS.length);
    });

    it('disabled 包含 read_file → 过滤掉', () => {
      const r = filterEnabled(['read_file']);
      expect(r.find((t) => t.name === 'read_file')).toBeUndefined();
      expect(r.find((t) => t.name === 'list_dir')).toBeDefined();
    });

    it('disabled 包含全部 → 空数组', () => {
      const allNames = BUILTIN_TOOLS.map((t) => t.name);
      expect(filterEnabled(allNames)).toEqual([]);
    });

    it('disabled 包含未知 name → 忽略', () => {
      const r = filterEnabled(['unknown-tool']);
      expect(r).toHaveLength(BUILTIN_TOOLS.length);
    });

    it('不修改原数组', () => {
      const disabled = ['read_file'];
      const r = filterEnabled(disabled);
      expect(disabled).toEqual(['read_file']);
      // 内部 filter 也不应改变 BUILTIN_TOOLS
      expect(BUILTIN_TOOLS.find((t) => t.name === 'read_file')).toBeDefined();
      expect(r).not.toBe(BUILTIN_TOOLS);
    });
  });
});
