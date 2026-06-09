import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2Icon,
  KeyRoundIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';

import {
  type CustomProvider,
  type CustomProviderInput,
  type CustomProviderProtocol,
  type CustomProviderStreamMode,
  validateCustomProviderInput,
  useCustomProvidersStore,
} from '@/stores/customProviders';
import { testCustomProviderChat } from '@/lib/customProviders';
import {
  deleteApiKey,
  getApiKey,
  getApiKeyStatus,
  listCustomProviderModels,
  setApiKey,
  syncApiKeyStatus,
  type ApiKeyStatus,
} from '@/lib/keyring';
import type { CustomProviderId } from '@/types/providers';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';

const EMPTY_FORM: CustomProviderInput = {
  name: '',
  protocol: 'openai-compatible',
  baseUrl: '',
  modelIds: [],
  selectedModelId: '',
  supportsThinking: false,
  supportsTools: false,
  streamMode: 'auto',
};

const PROTOCOL_LABELS: Record<CustomProviderProtocol, string> = {
  'openai-compatible': 'OpenAI 兼容',
  'anthropic-compatible': 'Anthropic 兼容',
};

const STREAM_MODE_LABELS: Record<CustomProviderStreamMode, string> = {
  auto: '自动',
  stream: '仅流式',
  'non-stream': '仅非流式',
};

interface CustomKeyState {
  loading: boolean;
  saving: boolean;
  error: string | null;
  status: ApiKeyStatus;
}

function emptyKeyState(): CustomKeyState {
  return {
    loading: true,
    saving: false,
    error: null,
    status: { configured: false, preview: null, metadataKnown: false },
  };
}

function useCustomKeyState(providerId: CustomProviderId) {
  const [state, setState] = useState<CustomKeyState>(() => emptyKeyState());

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const status = await getApiKeyStatus(providerId);
      setState({ loading: false, saving: false, error: null, status });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        saving: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [providerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (apiKey: string) => {
    if (!apiKey.trim()) return;
    setState((prev) => ({ ...prev, saving: true, error: null }));
    try {
      await setApiKey(providerId, apiKey.trim());
      await refresh();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        saving: false,
        error: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }
  };

  const sync = async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const status = await syncApiKeyStatus(providerId);
      setState({ loading: false, saving: false, error: null, status });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  };

  const remove = async () => {
    setState((prev) => ({ ...prev, saving: true, error: null }));
    try {
      await deleteApiKey(providerId);
      await refresh();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        saving: false,
        error: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }
  };

  return { ...state, refresh, sync, save, remove };
}

function protocolHelp(protocol: CustomProviderProtocol): string {
  return protocol === 'openai-compatible'
    ? 'Base URL 示例：https://api.example.com/v1；获取模型会请求 OpenAI 兼容 /v1/models'
    : 'Base URL 示例：https://api.example.com/anthropic';
}

type ModelFetchKeySource = 'input' | 'config';

function customModelFetchErrorMessage(
  err: unknown,
  keySource: ModelFetchKeySource,
): string {
  const message = err instanceof Error ? err.message : String(err);
  const sourceLabel = keySource === 'input' ? '输入框 Key' : '配置文件 Key';
  if (/401|Unauthorized|鉴权失败|请提供请求API-?Key/i.test(message)) {
    return `自定义模型获取失败：鉴权失败。请确认 API Key 填写正确；如果上方预览不像正常 Key，请清除后重新保存。（使用${sourceLabel}）`;
  }
  return `${message}（使用${sourceLabel}）`;
}

function uniqModelIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function addModelId(input: CustomProviderInput, rawModelId: string): CustomProviderInput {
  const modelIds = uniqModelIds([...input.modelIds, rawModelId]);
  return {
    ...input,
    modelIds,
    selectedModelId:
      input.selectedModelId && modelIds.includes(input.selectedModelId)
        ? input.selectedModelId
        : modelIds[0] ?? '',
  };
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password';
}

function TextField({
  id,
  label,
  value,
  placeholder,
  onChange,
  type = 'text',
}: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

interface ProtocolSelectProps {
  value: CustomProviderProtocol;
  onChange: (value: CustomProviderProtocol) => void;
}

function ProtocolSelect({ value, onChange }: ProtocolSelectProps) {
  return (
    <div className="space-y-1.5">
      <Label>协议</Label>
      <Select value={value} onValueChange={(next) => onChange(next as CustomProviderProtocol)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PROTOCOL_LABELS) as CustomProviderProtocol[]).map((protocol) => (
            <SelectItem key={protocol} value={protocol}>
              {PROTOCOL_LABELS[protocol]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface StreamModeSelectProps {
  value: CustomProviderStreamMode;
  onChange: (value: CustomProviderStreamMode) => void;
}

function StreamModeSelect({ value, onChange }: StreamModeSelectProps) {
  return (
    <div className="space-y-1.5">
      <Label>聊天模式</Label>
      <Select value={value} onValueChange={(next) => onChange(next as CustomProviderStreamMode)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(STREAM_MODE_LABELS) as CustomProviderStreamMode[]).map((mode) => (
            <SelectItem key={mode} value={mode}>
              {STREAM_MODE_LABELS[mode]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface CapabilitySwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function CapabilitySwitch({ label, checked, onChange }: CapabilitySwitchProps) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

interface ModelIdsEditorProps {
  idPrefix: string;
  inputValue: string;
  modelIds: string[];
  selectedModelId: string;
  onInputChange: (value: string) => void;
  onAdd: () => void;
  onSelectedChange: (modelId: string) => void;
  onFetch: () => void;
  fetching: boolean;
}

function ModelIdsEditor({
  idPrefix,
  inputValue,
  modelIds,
  selectedModelId,
  onInputChange,
  onAdd,
  onSelectedChange,
  onFetch,
  fetching,
}: ModelIdsEditorProps) {
  return (
    <div className="space-y-2 rounded-md border bg-background p-3 sm:col-span-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={`${idPrefix}-model-id`}>Model ID</Label>
          <Input
            id={`${idPrefix}-model-id`}
            value={inputValue}
            placeholder="例如：gpt-4o-mini"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onAdd();
              }
            }}
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          添加
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onFetch}
          disabled={fetching}
        >
          {fetching ? <Spinner size="sm" /> : <RefreshCwIcon className="size-3.5" />}
          获取模型
        </Button>
      </div>

      {modelIds.length > 0 && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label>默认模型</Label>
            <Select value={selectedModelId} onValueChange={onSelectedChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelIds.map((modelId) => (
                  <SelectItem key={modelId} value={modelId}>
                    {modelId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

export function CustomProvidersTab() {
  const providers = useCustomProvidersStore((state) => state.providers);
  const hydrated = useCustomProvidersStore((state) => state.hydrated);
  const loading = useCustomProvidersStore((state) => state.loading);
  const storeError = useCustomProvidersStore((state) => state.error);
  const hydrate = useCustomProvidersStore((state) => state.hydrate);
  const createProvider = useCustomProvidersStore((state) => state.createProvider);
  const [form, setForm] = useState<CustomProviderInput>(EMPTY_FORM);
  const [manualModelId, setManualModelId] = useState('');
  const [apiKey, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveForm = useMemo(
    () => addModelId(form, manualModelId),
    [form, manualModelId],
  );
  const formError = useMemo(
    () => validateCustomProviderInput(effectiveForm),
    [effectiveForm],
  );

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrate, hydrated]);

  const updateField = <K extends keyof CustomProviderInput>(
    key: K,
    value: CustomProviderInput[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const handleCreate = async () => {
    const input = addModelId(form, manualModelId);
    const validationError = validateCustomProviderInput(input);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const provider = await createProvider(input);
      if (apiKey.trim()) {
        await setApiKey(provider.id, apiKey.trim());
      }
      setForm(EMPTY_FORM);
      setManualModelId('');
      setApiKeyInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleFetchModels = async () => {
    if (!apiKey.trim()) {
      setError('请先填写 API Key 后再获取模型');
      return;
    }
    setFetchingModels(true);
    setError(null);
    try {
      const modelIds = await listCustomProviderModels({
        protocol: form.protocol,
        baseUrl: form.baseUrl,
        apiKey: apiKey.trim(),
      });
      const nextIds = uniqModelIds(modelIds);
      setForm((prev) => ({
        ...prev,
        modelIds: nextIds,
        selectedModelId:
          prev.selectedModelId && nextIds.includes(prev.selectedModelId)
            ? prev.selectedModelId
            : nextIds[0] ?? '',
      }));
      setManualModelId('');
    } catch (err) {
      setError(customModelFetchErrorMessage(err, 'input'));
    } finally {
      setFetchingModels(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-md border bg-muted/20 p-4">
        <div className="mb-4 flex items-center gap-2">
          <PlusIcon className="size-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">添加自定义模型</h3>
            <p className="text-xs text-muted-foreground">
              支持 OpenAI / Anthropic 兼容接口，所有请求由 Tauri 后端转发以避开 WebView CORS。
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            id="custom-provider-name"
            label="显示名称"
            value={form.name}
            placeholder="例如：公司网关 GPT"
            onChange={(value) => updateField('name', value)}
          />
          <ProtocolSelect
            value={form.protocol}
            onChange={(value) => updateField('protocol', value)}
          />
          <StreamModeSelect
            value={form.streamMode}
            onChange={(value) => updateField('streamMode', value)}
          />
          <TextField
            id="custom-provider-base-url"
            label="API Base URL"
            value={form.baseUrl}
            placeholder={
              form.protocol === 'openai-compatible'
                ? 'https://api.example.com/v1'
                : 'https://api.example.com/anthropic'
            }
            onChange={(value) => updateField('baseUrl', value)}
          />
          <TextField
            id="custom-provider-api-key"
            label="API Key"
            value={apiKey}
            type="password"
            placeholder="保存到本机 Claw 配置"
            onChange={setApiKeyInput}
          />
          <ModelIdsEditor
            idPrefix="custom-provider"
            inputValue={manualModelId}
            modelIds={form.modelIds}
            selectedModelId={form.selectedModelId}
            onInputChange={(value) => {
              setManualModelId(value);
              setError(null);
            }}
            onAdd={() => {
              setForm((prev) => addModelId(prev, manualModelId));
              setManualModelId('');
              setError(null);
            }}
            onSelectedChange={(modelId) => updateField('selectedModelId', modelId)}
            onFetch={() => void handleFetchModels()}
            fetching={fetchingModels}
          />
          <div className="space-y-1.5">
            <Label>能力</Label>
            <div className="grid grid-cols-2 gap-2">
              <CapabilitySwitch
                label="思考"
                checked={form.supportsThinking}
                onChange={(checked) => updateField('supportsThinking', checked)}
              />
              <CapabilitySwitch
                label="工具"
                checked={form.supportsTools}
                onChange={(checked) => updateField('supportsTools', checked)}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{error ?? formError ?? protocolHelp(form.protocol)}</p>
          <Button onClick={() => void handleCreate()} disabled={saving || Boolean(formError)}>
            {saving && <Spinner size="sm" />}
            添加模型
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">已添加模型</h3>
          <span className="text-xs text-muted-foreground">
            {loading ? '加载中' : `${providers.length} 个`}
          </span>
        </div>
        {storeError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {storeError}
          </div>
        )}
        {providers.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            暂无自定义模型
          </div>
        ) : (
          providers.map((provider) => (
            <CustomProviderCard key={provider.id} provider={provider} />
          ))
        )}
      </div>
    </div>
  );
}

interface CustomProviderCardProps {
  provider: CustomProvider;
}

function CustomProviderCard({ provider }: CustomProviderCardProps) {
  const updateProvider = useCustomProvidersStore((state) => state.updateProvider);
  const removeProvider = useCustomProvidersStore((state) => state.removeProvider);
  const [draft, setDraft] = useState<CustomProviderInput>({
    name: provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    modelIds: provider.modelIds,
    selectedModelId: provider.selectedModelId,
    supportsThinking: provider.supportsThinking,
    supportsTools: provider.supportsTools,
    streamMode: provider.streamMode,
  });
  const [manualModelId, setManualModelId] = useState('');
  const [apiKey, setApiKeyInput] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testingChat, setTestingChat] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyState = useCustomKeyState(provider.id);
  const formError = useMemo(() => validateCustomProviderInput(draft), [draft]);

  useEffect(() => {
    setDraft({
      name: provider.name,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      modelIds: provider.modelIds,
      selectedModelId: provider.selectedModelId,
      supportsThinking: provider.supportsThinking,
      supportsTools: provider.supportsTools,
      streamMode: provider.streamMode,
    });
  }, [provider]);

  const updateDraft = <K extends keyof CustomProviderInput>(
    key: K,
    value: CustomProviderInput[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const saveMeta = async () => {
    const validationError = validateCustomProviderInput(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSavingMeta(true);
    setError(null);
    try {
      await updateProvider(provider.id, draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingMeta(false);
    }
  };

  const saveKey = async () => {
    try {
      await keyState.save(apiKey);
      setApiKeyInput('');
    } catch {
      // keyState.error 已更新
    }
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setError(null);
    const keySource: ModelFetchKeySource = apiKey.trim() ? 'input' : 'config';
    try {
      const typedKey = apiKey.trim();
      if (!typedKey && !keyState.status.configured) {
        setError('请先填写 API Key，或点击导入旧 Key 后再获取模型');
        return;
      }
      const key = typedKey || (await getApiKey(provider.id));
      const modelIds = await listCustomProviderModels({
        protocol: draft.protocol,
        baseUrl: draft.baseUrl,
        apiKey: key,
      });
      const nextIds = uniqModelIds(modelIds);
      const nextDraft: CustomProviderInput = {
        ...draft,
        modelIds: nextIds,
        selectedModelId:
          draft.selectedModelId && nextIds.includes(draft.selectedModelId)
            ? draft.selectedModelId
            : nextIds[0] ?? '',
      };
      setDraft(nextDraft);
      await updateProvider(provider.id, nextDraft);
      setManualModelId('');
      if (typedKey) {
        try {
          await keyState.save(typedKey);
          setApiKeyInput('');
        } catch {
          // keyState.error 已更新；模型列表获取成功，不覆盖主结果。
        }
      }
    } catch (err) {
      setError(customModelFetchErrorMessage(err, keySource));
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTestChat = async () => {
    setTestingChat(true);
    setTestResult(null);
    setError(null);
    const typedKey = apiKey.trim();
    try {
      if (!typedKey && !keyState.status.configured) {
        setError('请先填写 API Key，或点击导入旧 Key 后再测试聊天');
        return;
      }
      const key = typedKey || (await getApiKey(provider.id));
      const result = await testCustomProviderChat({
        protocol: draft.protocol,
        streamMode: draft.streamMode,
        baseUrl: draft.baseUrl,
        apiKey: key,
        model: draft.selectedModelId,
      });
      const visibleKind = result.hasText ? '正文' : '思考过程';
      const preview = result.preview ? `：${result.preview}` : '';
      setTestResult(
        `测试通过（${visibleKind}，${PROTOCOL_LABELS[result.protocol]}，${STREAM_MODE_LABELS[result.streamMode]}，${result.endpoint}）${preview}`,
      );
    } catch (err) {
      setError(`测试聊天失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTestingChat(false);
    }
  };

  return (
    <div className="rounded-md border bg-background p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PencilIcon className="size-4 text-primary" />
            <h4 className="truncate text-sm font-semibold">{provider.name}</h4>
            {keyState.status.configured && (
              <CheckCircle2Icon className="size-4 text-emerald-600" />
            )}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {PROTOCOL_LABELS[provider.protocol]} · {STREAM_MODE_LABELS[provider.streamMode]} · {provider.selectedModelId} · {provider.modelIds.length} 个模型
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">启用</Label>
          <Switch
            checked={provider.enabled}
            onCheckedChange={(enabled) => {
              void updateProvider(provider.id, { enabled }).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : String(err));
              });
            }}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          id={`${provider.id}-name`}
          label="显示名称"
          value={draft.name}
          placeholder="显示名称"
          onChange={(value) => updateDraft('name', value)}
        />
        <ProtocolSelect
          value={draft.protocol}
          onChange={(value) => updateDraft('protocol', value)}
        />
        <StreamModeSelect
          value={draft.streamMode}
          onChange={(value) => updateDraft('streamMode', value)}
        />
        <TextField
          id={`${provider.id}-base-url`}
          label="API Base URL"
          value={draft.baseUrl}
          placeholder="https://api.example.com/v1"
          onChange={(value) => updateDraft('baseUrl', value)}
        />
        <ModelIdsEditor
          idPrefix={provider.id}
          inputValue={manualModelId}
          modelIds={draft.modelIds}
          selectedModelId={draft.selectedModelId}
          onInputChange={(value) => {
            setManualModelId(value);
            setError(null);
          }}
          onAdd={() => {
            setDraft((prev) => addModelId(prev, manualModelId));
            setManualModelId('');
            setError(null);
          }}
          onSelectedChange={(modelId) => updateDraft('selectedModelId', modelId)}
          onFetch={() => void handleFetchModels()}
          fetching={fetchingModels}
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <CapabilitySwitch
          label="支持思考"
          checked={draft.supportsThinking}
          onChange={(checked) => updateDraft('supportsThinking', checked)}
        />
        <CapabilitySwitch
          label="支持工具调用"
          checked={draft.supportsTools}
          onChange={(checked) => updateDraft('supportsTools', checked)}
        />
      </div>

      <div className="mt-3 rounded-md border bg-muted/20 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <KeyRoundIcon className="size-4" />
          API Key
          {keyState.loading && <Spinner size="sm" />}
          {keyState.status.preview && (
            <code className="rounded bg-background px-1.5 py-0.5 text-xs font-normal">
              {keyState.status.preview}
            </code>
          )}
          {!keyState.status.metadataKnown && !keyState.loading && (
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-normal text-amber-700">
              可导入旧 Key
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            value={apiKey}
            placeholder="更新本机 API Key"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setApiKeyInput(event.target.value)}
          />
          <Button
            size="sm"
            onClick={() => void saveKey()}
            disabled={keyState.saving || !apiKey.trim()}
          >
            {keyState.saving && <Spinner size="sm" />}
            保存 Key
          </Button>
          {!keyState.status.metadataKnown && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void keyState.sync()}
              disabled={keyState.loading || keyState.saving}
            >
              {keyState.loading ? (
                <Spinner size="sm" />
              ) : (
                <RefreshCwIcon className="size-3.5" />
              )}
              导入旧 Key
            </Button>
          )}
          {keyState.status.configured && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void keyState.remove()}
              disabled={keyState.saving}
            >
              清除
            </Button>
          )}
        </div>
        {keyState.error && (
          <p className="mt-2 text-xs text-destructive">{keyState.error}</p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {error ?? testResult ?? formError ?? protocolHelp(draft.protocol)}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleTestChat()}
            disabled={testingChat || Boolean(formError)}
          >
            {testingChat ? <Spinner size="sm" /> : <PlayIcon className="size-3.5" />}
            测试聊天
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmDeleteOpen(true)}>
            <Trash2Icon className="size-3.5" />
            删除
          </Button>
          <Button size="sm" onClick={() => void saveMeta()} disabled={savingMeta || Boolean(formError)}>
            {savingMeta && <Spinner size="sm" />}
            保存修改
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`删除自定义模型「${provider.name}」`}
        description="会删除模型配置和已保存的本机 API Key。"
        confirmText="删除"
        destructive
        onConfirm={() => removeProvider(provider.id)}
      />
    </div>
  );
}
