import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

vi.mock('fs/promises');
const fsMock = await import('fs/promises');
const mockReadFile  = vi.mocked(fsMock.readFile);
const mockWriteFile = vi.mocked(fsMock.writeFile);
const mockMkdir     = vi.mocked(fsMock.mkdir);
const mockAppendFile = vi.mocked(fsMock.appendFile);

// Import AFTER mocking
const { ToolApprovalManager } = await import('./tool-approval-manager');

const wsConfigPath = path.join('/ws', '.lucent', 'config.json');

describe('ToolApprovalManager', () => {
  beforeEach(() => vi.clearAllMocks());

  it('isApproved returns false with no config files', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const m = new ToolApprovalManager('/ws');
    expect(await m.isApproved('write_file')).toBe(false);
  });

  it('approveForSession makes isApproved true immediately', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const m = new ToolApprovalManager('/ws');
    m.approveForSession('write_file');
    expect(await m.isApproved('write_file')).toBe(true);
  });

  it('session approval does not affect other tools', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const m = new ToolApprovalManager('/ws');
    m.approveForSession('write_file');
    expect(await m.isApproved('delete_file')).toBe(false);
  });

  it('isApproved reads workspace config', async () => {
    mockReadFile.mockImplementation(async (p) => {
      if ((p as string).includes('.lucent') && (p as string).endsWith('config.json')) {
        return JSON.stringify({ approvedTools: ['write_file'] });
      }
      throw new Error('ENOENT');
    });
    const m = new ToolApprovalManager('/ws');
    expect(await m.isApproved('write_file')).toBe(true);
  });

  it('approveForWorkspace writes tool to workspace config', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockMkdir.mockResolvedValue(undefined as any);
    mockWriteFile.mockResolvedValue(undefined);
    mockAppendFile.mockResolvedValue(undefined);
    const m = new ToolApprovalManager('/ws');
    await m.approveForWorkspace('write_file');
    const call = mockWriteFile.mock.calls.find(([p]) => (p as string) === wsConfigPath);
    expect(call).toBeDefined();
    expect(call![1] as string).toContain('write_file');
  });

  it('approveForWorkspace adds .lucent to .gitignore', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockMkdir.mockResolvedValue(undefined as any);
    mockWriteFile.mockResolvedValue(undefined);
    mockAppendFile.mockResolvedValue(undefined);
    const m = new ToolApprovalManager('/ws');
    await m.approveForWorkspace('write_file');
    const gitignorePath = path.join('/ws', '.gitignore');
    const written = mockWriteFile.mock.calls.some(([p]) => (p as string) === gitignorePath)
                 || mockAppendFile.mock.calls.some(([p]) => (p as string) === gitignorePath);
    expect(written).toBe(true);
  });

  it('approveForWorkspace does not duplicate tool in config', async () => {
    mockReadFile.mockImplementation(async (p) => {
      if ((p as string) === wsConfigPath) {
        return JSON.stringify({ approvedTools: ['write_file'] });
      }
      throw new Error('ENOENT');
    });
    mockMkdir.mockResolvedValue(undefined as any);
    mockWriteFile.mockResolvedValue(undefined);
    mockAppendFile.mockResolvedValue(undefined);
    const m = new ToolApprovalManager('/ws');
    await m.approveForWorkspace('write_file');
    const configWrite = mockWriteFile.mock.calls.filter(([p]) => (p as string) === wsConfigPath);
    expect(configWrite).toHaveLength(0);
  });

  it('approveGlobally writes to ~/.lucent/config.json', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockMkdir.mockResolvedValue(undefined as any);
    mockWriteFile.mockResolvedValue(undefined);
    const m = new ToolApprovalManager('/ws');
    await m.approveGlobally('run_terminal_command');
    const call = mockWriteFile.mock.calls.find(([p]) => (p as string).includes('.lucent') && (p as string).endsWith('config.json'));
    expect(call).toBeDefined();
    expect(call![1] as string).toContain('run_terminal_command');
  });
});
