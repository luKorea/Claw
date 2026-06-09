import { useCallback, useMemo } from 'react';

import {
  resolveAvailableModelId,
  useAvailableModels,
} from '@/hooks/useAvailableModels';
import { useConversations } from '@/hooks/useConversations';
import { useChatStore } from '@/stores/chat';
import { useSettingsStore } from '@/stores/settings';

export interface UseModelSelectionReturn
  extends ReturnType<typeof useAvailableModels> {
  requestedModelId: string;
  selectedModelId: string | null;
  selectedLabel: string;
  invalidModelId: string | null;
  selectModel: (modelId: string) => void;
}

/**
 * 集中处理侧边栏/默认设置页的模型选择状态。
 */
export function useModelSelection(): UseModelSelectionReturn {
  const available = useAvailableModels();
  const conv = useConversations();
  const defaultModel = useSettingsStore((state) => state.defaultModel);
  const setDefaultModel = useSettingsStore((state) => state.setDefaultModel);
  const setChatError = useChatStore((state) => state.setError);

  const requestedModelId = conv.current?.model ?? defaultModel;
  const selectedModelId = useMemo(
    () => resolveAvailableModelId(requestedModelId, available.flat),
    [available.flat, requestedModelId],
  );
  const exactMatch =
    selectedModelId !== null &&
    (requestedModelId === selectedModelId ||
      available.isModelAvailable(requestedModelId));
  const invalidModelId =
    requestedModelId && !exactMatch && available.hasAvailableModels
      ? requestedModelId
      : null;

  const selectModel = useCallback(
    (modelId: string) => {
      setChatError(null);
      if (!conv.current) {
        setDefaultModel(modelId);
        return;
      }
      void conv.update({ id: conv.current.id, model: modelId }).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setChatError(`切换模型失败：${message}`);
      });
    },
    [conv, setChatError, setDefaultModel],
  );

  return {
    ...available,
    requestedModelId,
    selectedModelId,
    selectedLabel: selectedModelId
      ? available.getModelLabel(selectedModelId)
      : requestedModelId,
    invalidModelId,
    selectModel,
  };
}
