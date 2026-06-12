import { describe, expect, it } from 'vitest';

import {
  parseMcpConfigJson,
  stringifyMcpConfigJson,
} from '@/lib/mcp-config-json';
import type { McpServer, McpServerStatus } from '@/types/mcp';

const baseStatus: McpServerStatus = {
  serverId: 'mcp_filesystem',
  phase: 'not_tested',
  supportsTools: false,
  toolCount: 0,
};

function makeServer(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: 'mcp_filesystem',
    name: 'Filesystem',
    transport: 'local-command',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/me/Desktop'],
    workingDirectory: undefined,
    envKeys: ['API_TOKEN'],
    enabled: true,
    status: baseStatus,
    tools: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('lib/mcp-config-json', () => {
  it('解析 Claude Desktop 风格 mcpServers 配置', () => {
    const servers = parseMcpConfigJson(`{
      "mcpServers": {
        "filesystem": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem"],
          "env": { "API_TOKEN": "secret" }
        }
      }
    }`);

    expect(servers).toEqual([
      {
        name: 'filesystem',
        transport: 'local-command',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        workingDirectory: undefined,
        env: { API_TOKEN: 'secret' },
        enabled: true,
      },
    ]);
  });

  it('将 stdio transport 和 cwd 转成项目内部字段', () => {
    const servers = parseMcpConfigJson(`{
      "mcpServers": {
        "github": {
          "transport": "stdio",
          "command": "node",
          "args": ["server.js"],
          "cwd": "/Users/me/project"
        }
      }
    }`);

    expect(servers[0]).toMatchObject({
      name: 'github',
      transport: 'local-command',
      command: 'node',
      args: ['server.js'],
      workingDirectory: '/Users/me/project',
    });
  });

  it('把 disabled: true 映射为 enabled: false', () => {
    const servers = parseMcpConfigJson(`{
      "name": "Disabled server",
      "command": "node",
      "disabled": true
    }`);

    expect(servers[0]?.enabled).toBe(false);
  });

  it('拒绝暂不支持的 transport', () => {
    expect(() =>
      parseMcpConfigJson(`{
        "mcpServers": {
          "remote": {
            "transport": "http",
            "command": "node"
          }
        }
      }`),
    ).toThrow('不支持 transport: http');
  });

  it('导出时保留 env key 但不泄露 env value', () => {
    const json = stringifyMcpConfigJson([makeServer()]);

    expect(JSON.parse(json)).toEqual({
      mcpServers: {
        Filesystem: {
          command: 'npx',
          args: [
            '-y',
            '@modelcontextprotocol/server-filesystem',
            '/Users/me/Desktop',
          ],
          env: { API_TOKEN: '' },
        },
      },
    });
  });

  it('导出禁用 server 时写入 disabled: true', () => {
    const json = stringifyMcpConfigJson([makeServer({ enabled: false })]);

    expect(JSON.parse(json)).toMatchObject({
      mcpServers: {
        Filesystem: {
          disabled: true,
        },
      },
    });
  });
});
