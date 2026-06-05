import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2Icon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';

import {
  type CustomProvider,
  type CustomProviderInput,
  type CustomProviderProtocol,
  validateCustomProviderInput,
  useCustomProvidersStore,
} from '@/stores/customProviders';
import {
  deleteApiKey,
  getApiKeyStatus,
  setApiKey,
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
  modelId: '',
  supportsThinking: false,
  supportsTools: false,
};

const PROTOCOL_LABELS: Record<CustomProviderProtocol, string> = {
  'openai-compatible': 'OpenAI 兼容',
  'anthropic-compatible': 'Anthropic 兼容',
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
    status: { configured: false, preview: null },
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

  return { ...state, refresh, save, remove };
}

function protocolHelp(protocol: CustomProviderProtocol): string {
  return protocol === 'openai-compatible'
    ? 'Base URL 示例：https://api.example.com/v1'
    : 'Base URL 示例：https://api.example.com/anthropic';
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

export function CustomProvidersTab() {
  const providers = useCustomProvidersStore((state) => state.providers);
  const createProvider = useCustomProvidersStore((state) => state.createProvider);
  const [form, setForm] = useState<CustomProviderInput>(EMPTY_FORM);
  const [apiKey, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formError = useMemo(() => validateCustomProviderInput(form), [form]);

  const updateField = <K extends keyof CustomProviderInput>(
    key: K,
    value: CustomProviderInput[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const handleCreate = async () => {
    const validationError = validateCustomProviderInput(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const provider = createProvider(form);
      if (apiKey.trim()) {
        await setApiKey(provider.id, apiKey.trim());
      }
      setForm(EMPTY_FORM);
      setApiKeyInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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
            id="custom-provider-model-id"
            label="Model ID"
            value={form.modelId}
            placeholder="例如：gpt-4o-mini"
            onChange={(value) => updateField('modelId', value)}
          />
          <TextField
            id="custom-provider-api-key"
            label="API Key"
            value={apiKey}
            type="password"
            placeholder="保存到系统 Keychain"
            onChange={setApiKeyInput}
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
          <span className="text-xs text-muted-foreground">{providers.length} 个</span>
        </div>
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
    modelId: provider.modelId,
    supportsThinking: provider.supportsThinking,
    supportsTools: provider.supportsTools,
  });
  const [apiKey, setApiKeyInput] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyState = useCustomKeyState(provider.id);
  const formError = useMemo(() => validateCustomProviderInput(draft), [draft]);

  useEffect(() => {
    setDraft({
      name: provider.name,
      protocol: provider.protocol,
      baseUrl: provider.baseUrl,
      modelId: provider.modelId,
      supportsThinking: provider.supportsThinking,
      supportsTools: provider.supportsTools,
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
      updateProvider(provider.id, draft);
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
            {PROTOCOL_LABELS[provider.protocol]} · {provider.modelId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">启用</Label>
          <Switch
            checked={provider.enabled}
            onCheckedChange={(enabled) => updateProvider(provider.id, { enabled })}
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
        <TextField
          id={`${provider.id}-base-url`}
          label="API Base URL"
          value={draft.baseUrl}
          placeholder="https://api.example.com/v1"
          onChange={(value) => updateDraft('baseUrl', value)}
        />
        <TextField
          id={`${provider.id}-model-id`}
          label="Model ID"
          value={draft.modelId}
          placeholder="model id"
          onChange={(value) => updateDraft('modelId', value)}
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
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            value={apiKey}
            placeholder="更新 API Key"
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
          {error ?? formError ?? protocolHelp(draft.protocol)}
        </p>
        <div className="flex gap-2">
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
        description="会删除模型配置，已保存的 API Key 需要在删除前手动清除。"
        confirmText="删除"
        destructive
        onConfirm={() => removeProvider(provider.id)}
      />
    </div>
  );
}
