import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReadFile } = vi.hoisted(() => ({ mockReadFile: vi.fn() }));

vi.mock('fs/promises', () => ({ readFile: mockReadFile }));
vi.mock('os', () => ({ homedir: () => '/home/user' }));

import { loadMcpConfig } from './mcp-config-loader';

const FS_CFG = JSON.stringify({
  mcpServers: { filesystem: { command: 'npx', args: ['-y', '@mcp/fs', '/tmp'] } },
});

describe('loadMcpConfig', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty map when no config files exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    expect((await loadMcpConfig()).size).toBe(0);
  });

  it('loads servers from ~/.claude/settings.json', async () => {
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).includes('.claude')) return Promise.resolve(FS_CFG);
      return Promise.reject(new Error('ENOENT'));
    });
    const result = await loadMcpConfig();
    expect(result.get('filesystem')?.command).toBe('npx');
  });

  it('workspace .mcp.json overrides global on name collision', async () => {
    const globalCfg = JSON.stringify({ mcpServers: { srv: { command: 'old' } } });
    const localCfg  = JSON.stringify({ mcpServers: { srv: { command: 'new' } } });
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).endsWith('.mcp.json')) return Promise.resolve(localCfg);
      if ((p as string).includes('.claude'))   return Promise.resolve(globalCfg);
      return Promise.reject(new Error('ENOENT'));
    });
    expect((await loadMcpConfig('/workspace')).get('srv')?.command).toBe('new');
  });

  it('skips malformed JSON without throwing', async () => {
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).includes('.claude'))   return Promise.resolve('not json');
      if ((p as string).endsWith('.mcp.json')) return Promise.resolve(FS_CFG);
      return Promise.reject(new Error('ENOENT'));
    });
    expect((await loadMcpConfig('/workspace')).get('filesystem')?.command).toBe('npx');
  });

  it('skips entries missing command field', async () => {
    const bad = JSON.stringify({ mcpServers: { bad: { args: ['x'] } } });
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).includes('.claude')) return Promise.resolve(bad);
      return Promise.reject(new Error('ENOENT'));
    });
    expect((await loadMcpConfig()).size).toBe(0);
  });

  it('merges servers from all three config files', async () => {
    const claude = JSON.stringify({ mcpServers: { a: { command: 'cmd-a' } } });
    const lucent = JSON.stringify({ mcpServers: { b: { command: 'cmd-b' } } });
    const local  = JSON.stringify({ mcpServers: { c: { command: 'cmd-c' } } });
    mockReadFile.mockImplementation((p: string) => {
      if ((p as string).includes('.claude/settings'))  return Promise.resolve(claude);
      if ((p as string).includes('.lucentcode'))       return Promise.resolve(lucent);
      if ((p as string).endsWith('.mcp.json'))         return Promise.resolve(local);
      return Promise.reject(new Error('ENOENT'));
    });
    const result = await loadMcpConfig('/workspace');
    expect(result.size).toBe(3);
    expect(result.get('a')?.command).toBe('cmd-a');
    expect(result.get('b')?.command).toBe('cmd-b');
    expect(result.get('c')?.command).toBe('cmd-c');
  });
});
