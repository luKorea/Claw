import { useMemo, useState } from 'react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';

import { useMcpServers } from '@/hooks/useMcpServers';
import { parseMcpConfigJson, stringifyMcpConfigJson } from '@/lib/mcp-config-json';
import { cn } from '@/lib/utils';
import type { McpServer, McpServerInput, McpServerStatus } from '@/types/mcp';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type JsonDialogMode =
  | { kind: 'add' }
  | { kind: 'edit'; server: McpServer };

function statusLabel(status: McpServerStatus): string {
  if (status.phase === 'ready') {
    return status.toolCount > 0 ? `${status.toolCount} tools enabled` : 'No tools';
  }
  if (status.phase === 'failed') {
    return 'Error - Show Output';
  }
  return 'Not tested';
}

function statusIconClass(status: McpServerStatus): string {
  if (status.phase === 'ready') return 'bg-emerald-500';
  if (status.phase === 'failed') return 'bg-red-500';
  return 'bg-muted-foreground';
}

function serverInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '+';
}

function serverJsonKey(input: McpServerInput): string {
  return input.name.trim();
}

interface McpJsonDialogProps {
  mode: JsonDialogMode | null;
  jsonText: string;
  saving: boolean;
  error: string | null;
  message: string | null;
  onJsonTextChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

function McpJsonDialog({
  mode,
  jsonText,
  saving,
  error,
  message,
  onJsonTextChange,
  onOpenChange,
  onSave,
}: McpJsonDialogProps) {
  const title =
    mode?.kind === 'edit'
      ? `编辑 MCP Server「${mode.server.name}」`
      : 'New MCP Server';
  const description =
    mode?.kind === 'edit'
      ? '在完整 MCP JSON 中编辑当前 MCP Server。环境变量值留空时会保留原值。'
      : '在完整 MCP JSON 中追加新 server。保存不会删除缺失的已有 server。';

  return (
    <Dialog open={Boolean(mode)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="mcp-json-dialog">MCP JSON</Label>
          <Textarea
            id="mcp-json-dialog"
            value={jsonText}
            spellCheck={false}
            className="min-h-80 font-mono text-xs"
            onChange={(event) => onJsonTextChange(event.target.value)}
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {message && <p className="text-xs text-emerald-700">{message}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving && <Spinner size="sm" />}
            保存 JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ServerRowProps {
  server: McpServer;
  testing: boolean;
  onEdit: (server: McpServer) => void;
  onTest: (id: string) => void;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onToggleEnabled: (id: string, enabled: boolean) => void;
}

function ServerRow({
  server,
  testing,
  onEdit,
  onTest,
  onRefresh,
  onDelete,
  onToggleEnabled,
}: ServerRowProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const commandLine = useMemo(
    () => [server.command, ...server.args].filter(Boolean).join(' '),
    [server.args, server.command],
  );
  const isFailed = server.status.phase === 'failed';

  return (
    <div className="border-b px-3 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="relative flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-medium">
          {serverInitial(server.name)}
          <span
            className={cn(
              'absolute -right-1 -bottom-1 size-3 rounded-full ring-2 ring-card',
              statusIconClass(server.status),
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{server.name}</span>
            {!server.enabled && <Badge variant="outline">已禁用</Badge>}
            {server.status.serverName && (
              <span className="text-xs text-muted-foreground">
                {server.status.serverName}
              </span>
            )}
          </div>
          <button
            type="button"
            className={cn(
              'mt-0.5 flex items-center gap-1 text-left text-xs text-muted-foreground',
              isFailed && 'text-destructive hover:underline',
            )}
            onClick={() => {
              if (isFailed) setShowOutput((current) => !current);
            }}
          >
            {statusLabel(server.status)}
            {isFailed &&
              (showOutput ? (
                <ChevronUpIcon className="size-3" />
              ) : (
                <ChevronDownIcon className="size-3" />
              ))}
          </button>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {commandLine}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`编辑 ${server.name}`}
            onClick={() => onEdit(server)}
          >
            <PencilIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`刷新 ${server.name}`}
            onClick={() => onRefresh(server.id)}
            disabled={testing}
          >
            {testing ? <Spinner size="sm" /> : <RefreshCwIcon className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`测试 ${server.name}`}
            onClick={() => onTest(server.id)}
            disabled={testing}
          >
            {testing ? <Spinner size="sm" /> : <PlayIcon className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`删除 ${server.name}`}
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <Trash2Icon className="size-4" />
          </Button>
          <Switch
            aria-label={`启用 ${server.name}`}
            checked={server.enabled}
            onCheckedChange={(enabled) => onToggleEnabled(server.id, enabled)}
          />
        </div>
      </div>

      {showOutput && server.status.errorMessage && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {server.status.errorMessage}
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`删除 MCP Server「${server.name}」`}
        description="会删除本机保存的启动配置和已发现的工具列表。"
        confirmText="删除"
        destructive
        onConfirm={() => onDelete(server.id)}
      />
    </div>
  );
}

interface NewServerRowProps {
  onClick: () => void;
}

function NewServerRow({ onClick }: NewServerRowProps) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <PlusIcon className="size-5" />
      </div>
      <div>
        <div className="text-sm font-medium">New MCP Server</div>
        <div className="text-xs text-muted-foreground">Add a Custom MCP Server</div>
      </div>
    </button>
  );
}

export function McpServersTab() {
  const {
    servers,
    loading,
    saving,
    testingIds,
    error,
    createServer,
    updateServer,
    testServer,
    refreshServer,
    setServerEnabled,
    deleteServer,
  } = useMcpServers();
  const [actionError, setActionError] = useState<string | null>(null);
  const [jsonDialogMode, setJsonDialogMode] = useState<JsonDialogMode | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonMessage, setJsonMessage] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const openAddDialog = () => {
    setJsonDialogMode({ kind: 'add' });
    setJsonText(stringifyMcpConfigJson(servers));
    setJsonError(null);
    setJsonMessage(null);
  };

  const openEditDialog = (server: McpServer) => {
    setJsonDialogMode({ kind: 'edit', server });
    setJsonText(stringifyMcpConfigJson(servers));
    setJsonError(null);
    setJsonMessage(null);
  };

  const closeJsonDialog = (open: boolean) => {
    if (!open) {
      setJsonDialogMode(null);
      setJsonError(null);
      setJsonMessage(null);
    }
  };

  const applyInputs = async (inputs: McpServerInput[]) => {
    const serversByName = new Map(servers.map((server) => [server.name, server]));
    let createdCount = 0;
    let updatedCount = 0;

    for (const input of inputs) {
      const existing = serversByName.get(serverJsonKey(input));
      if (existing) {
        const updated = await updateServer({ id: existing.id, ...input });
        serversByName.delete(existing.name);
        serversByName.set(updated.name, updated);
        updatedCount += 1;
      } else {
        const created = await createServer(input);
        serversByName.set(created.name, created);
        createdCount += 1;
      }
    }

    return { createdCount, updatedCount };
  };

  const saveJsonDialog = async () => {
    setJsonError(null);
    setJsonMessage(null);
    setActionError(null);
    try {
      const inputs = parseMcpConfigJson(jsonText);
      if (jsonDialogMode?.kind === 'edit') {
        const target = inputs.find(
          (input) => serverJsonKey(input) === jsonDialogMode.server.name,
        );
        if (!target) {
          setJsonError(`JSON 中缺少当前 MCP Server「${jsonDialogMode.server.name}」`);
          return;
        }
        await updateServer({ id: jsonDialogMode.server.id, ...target });
        setJsonMessage('已更新 MCP Server');
        setJsonDialogMode(null);
        return;
      }

      const { createdCount, updatedCount } = await applyInputs(inputs);
      setJsonMessage(
        `已应用 ${inputs.length} 个 MCP Server（新增 ${createdCount}，更新 ${updatedCount}）`,
      );
      setJsonDialogMode(null);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err));
    }
  };

  const runTest = async (id: string) => {
    try {
      await testServer(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const refreshTools = async (id: string) => {
    try {
      await refreshServer(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await setServerEnabled(id, enabled);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeServer = async (id: string) => {
    try {
      await deleteServer(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Installed MCP Servers</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          通过 JSON 管理本地命令启动的 MCP Server。环境变量值不会在导出中显示。
        </p>
      </div>

      {(actionError || error) && (
        <p className="text-xs text-destructive">{actionError ?? error}</p>
      )}
      {jsonMessage && <p className="text-xs text-emerald-700">{jsonMessage}</p>}

      <div className="overflow-hidden rounded-lg border bg-card">
        {loading && (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            正在加载 MCP Server...
          </div>
        )}
        {!loading &&
          servers.map((server) => (
            <ServerRow
              key={server.id}
              server={server}
              testing={testingIds.includes(server.id)}
              onEdit={openEditDialog}
              onTest={(id) => void runTest(id)}
              onRefresh={(id) => void refreshTools(id)}
              onDelete={removeServer}
              onToggleEnabled={(id, enabled) => void toggleEnabled(id, enabled)}
            />
          ))}
        <NewServerRow onClick={openAddDialog} />
      </div>

      <McpJsonDialog
        mode={jsonDialogMode}
        jsonText={jsonText}
        saving={saving}
        error={jsonError}
        message={jsonMessage}
        onJsonTextChange={(value) => {
          setJsonText(value);
          setJsonError(null);
          setJsonMessage(null);
        }}
        onOpenChange={closeJsonDialog}
        onSave={() => void saveJsonDialog()}
      />
    </section>
  );
}
