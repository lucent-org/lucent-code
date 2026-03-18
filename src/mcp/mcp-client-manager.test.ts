import { describe, it, expect, vi, beforeEach } from 'vitest';

const { MockClient, MockTransport } = vi.hoisted(() => {
  const MockTransport = vi.fn();
  const mockClient = {
    connect:   vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool:  vi.fn(),
    close:     vi.fn().mockResolvedValue(undefined),
  };
  const MockClient = vi.fn(() => mockClient);
  return { MockClient, MockTransport };
});

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: MockClient }));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js',  () => ({ StdioClientTransport: MockTransport }));

import { McpClientManager } from './mcp-client-manager';
import type { McpServerConfig } from './mcp-config-loader';

function makeServers(overrides: Record<string, McpServerConfig> = {}): Map<string, McpServerConfig> {
  return new Map(Object.entries({
    filesystem: { command: 'npx', args: ['-y', '@mcp/fs'] },
    ...overrides,
  }));
}

describe('McpClientManager', () => {
  let manager: McpClientManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default implementations that may have been overridden by previous tests
    const sharedClient = new MockClient();
    (sharedClient.connect   as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (sharedClient.listTools as ReturnType<typeof vi.fn>).mockResolvedValue({ tools: [] });
    (sharedClient.close     as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    manager = new McpClientManager();
  });

  it('starts with no tools', () => {
    expect(manager.getTools()).toHaveLength(0);
  });

  it('connects to servers and exposes their tools', async () => {
    const mockClient = new MockClient();
    (mockClient.listTools as any).mockResolvedValue({
      tools: [
        { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      ],
    });
    (MockClient as any).mockReturnValue(mockClient);

    await manager.connect(makeServers());

    const tools = manager.getTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].function.name).toBe('mcp__filesystem__read_file');
    expect(tools[0].function.description).toContain('[filesystem]');
  });

  it('marks server as error when connect times out', async () => {
    vi.useFakeTimers();
    const mockClient = new MockClient();
    (mockClient.connect as any).mockReturnValue(new Promise(() => {})); // never resolves
    (MockClient as any).mockReturnValue(mockClient);

    const connectPromise = manager.connect(makeServers());
    vi.advanceTimersByTime(6000);
    await connectPromise;

    expect(manager.getStatus()['filesystem']).toBe('error');
    expect(manager.getTools()).toHaveLength(0);
    vi.useRealTimers();
  });

  it('marks server as error when listTools throws', async () => {
    const mockClient = new MockClient();
    (mockClient.listTools as any).mockRejectedValue(new Error('server error'));
    (MockClient as any).mockReturnValue(mockClient);

    await manager.connect(makeServers());

    expect(manager.getStatus()['filesystem']).toBe('error');
  });

  it('callTool routes to correct server and returns content', async () => {
    const mockClient = new MockClient();
    (mockClient.listTools as any).mockResolvedValue({
      tools: [{ name: 'read_file', description: 'Read', inputSchema: { type: 'object', properties: {} } }],
    });
    (mockClient.callTool as any).mockResolvedValue({
      content: [{ type: 'text', text: 'file contents here' }],
      isError: false,
    });
    (MockClient as any).mockReturnValue(mockClient);

    await manager.connect(makeServers());
    const result = await manager.callTool('mcp__filesystem__read_file', { path: '/tmp/test.txt' });

    expect(result.content).toBe('file contents here');
    expect(result.isError).toBe(false);
    expect(mockClient.callTool).toHaveBeenCalledWith({ name: 'read_file', arguments: { path: '/tmp/test.txt' } });
  });

  it('callTool returns isError:true when server returns error', async () => {
    const mockClient = new MockClient();
    (mockClient.listTools as any).mockResolvedValue({
      tools: [{ name: 'read_file', description: 'Read', inputSchema: { type: 'object', properties: {} } }],
    });
    (mockClient.callTool as any).mockResolvedValue({
      content: [{ type: 'text', text: 'Permission denied' }],
      isError: true,
    });
    (MockClient as any).mockReturnValue(mockClient);

    await manager.connect(makeServers());
    const result = await manager.callTool('mcp__filesystem__read_file', {});

    expect(result.isError).toBe(true);
  });

  it('callTool returns error for unknown server', async () => {
    const result = await manager.callTool('mcp__ghost__tool', {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain('not connected');
  });

  it('callTool returns error for malformed tool name', async () => {
    const result = await manager.callTool('mcp__noDoubleUnderscore', {});
    expect(result.isError).toBe(true);
  });

  it('dispose closes all connections', async () => {
    const mockClient = new MockClient();
    (mockClient.listTools as any).mockResolvedValue({ tools: [] });
    (MockClient as any).mockReturnValue(mockClient);

    await manager.connect(makeServers());
    manager.dispose();

    expect(mockClient.close).toHaveBeenCalled();
    expect(manager.getTools()).toHaveLength(0);
    expect(Object.keys(manager.getStatus())).toHaveLength(0);
  });
});
