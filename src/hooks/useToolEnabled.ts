import { useToolsStore } from '@/stores/tools';

/**
 * v1.3:细粒度 selector 化工具启用状态。
 *
 * 替代 v1.2 中 `useToolsStore` 暴露的 `isEnabled` 内部函数 ——
 * 旧实现每次调都遍历数组,且调用方需要订阅整个 store 触发整树重渲。
 */
export function useToolEnabled(name: string): boolean {
  return useToolsStore((s) => !s.disabled.includes(name));
}
