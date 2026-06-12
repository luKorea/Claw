export type McpTransport = 'local-command';

export type McpStatusPhase = 'not_tested' | 'ready' | 'failed';

export type McpErrorCategory =
  | 'startup_failed'
  | 'initialization_failed'
  | 'discovery_failed'
  | 'timeout';

export interface McpServerStatus {
  serverId: string;
  phase: McpStatusPhase;
  serverName?: string;
  serverVersion?: string;
  supportsTools: boolean;
  toolCount: number;
  lastCheckedAt?: number;
  errorCategory?: McpErrorCategory;
  errorMessage?: string;
}

export interface McpTool {
  serverId: string;
  serverName: string;
  originalName: string;
  runtimeName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
  discoveredAt: number;
}

export interface McpServer {
  id: string;
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  workingDirectory?: string;
  envKeys: string[];
  enabled: boolean;
  status: McpServerStatus;
  tools: McpTool[];
  createdAt: number;
  updatedAt: number;
}

export interface McpServerInput {
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  workingDirectory?: string;
  env: Record<string, string>;
  enabled: boolean;
}

export interface McpServerUpdateInput extends McpServerInput {
  id: string;
}

export interface McpToolCallInput {
  runtimeName: string;
  arguments: Record<string, unknown>;
  toolUseId: string;
}

export interface McpToolCallResult {
  toolUseId: string;
  content: string;
  isError: boolean;
  errorCategory?:
    | 'unknown_tool'
    | 'server_disabled'
    | 'server_deleted'
    | 'invocation_failed'
    | 'timeout';
  summary?: string;
}
