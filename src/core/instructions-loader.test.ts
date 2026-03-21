import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReadFile, mockCreateFileSystemWatcher, mockShowWarningMessage } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockCreateFileSystemWatcher: vi.fn(() => ({
    onDidCreate: vi.fn(),
    onDidChange: vi.fn(),
    onDidDelete: vi.fn(),
    dispose: vi.fn(),
  })),
  mockShowWarningMessage: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { scheme: 'file', path: '/workspace' } }],
    fs: { readFile: mockReadFile },
    createFileSystemWatcher: mockCreateFileSystemWatcher,
  },
  Uri: {
    joinPath: (base: any, ...segments: string[]) => ({
      scheme: 'file',
      path: base.path + '/' + segments.join('/'),
    }),
  },
  RelativePattern: class {
    constructor(public base: any, public pattern: string) {}
  },
  window: { showWarningMessage: mockShowWarningMessage },
}));

import { InstructionsLoader } from './instructions-loader';

describe('InstructionsLoader', () => {
  let loader: InstructionsLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new InstructionsLoader();
  });

  it('should return undefined when no instructions file exists', async () => {
    mockReadFile.mockRejectedValue(new Error('File not found'));
    await loader.load();
    expect(loader.getInstructions()).toBeUndefined();
  });

  it('should load .openrouter-instructions.md when present', async () => {
    mockReadFile.mockResolvedValueOnce(new TextEncoder().encode('# Instructions'));
    await loader.load();
    expect(loader.getInstructions()).toBe('# Instructions');
  });

  it('should fall back to .cursorrules when .openrouter-instructions.md is missing', async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce(new TextEncoder().encode('Be concise'));
    await loader.load();
    expect(loader.getInstructions()).toBe('Be concise');
  });

  it('should prefer .openrouter-instructions.md and not read .cursorrules', async () => {
    mockReadFile.mockResolvedValueOnce(new TextEncoder().encode('Override'));
    await loader.load();
    expect(loader.getInstructions()).toBe('Override');
    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it('should warn and skip a file exceeding 50 KB', async () => {
    mockReadFile.mockResolvedValueOnce(new Uint8Array(51 * 1024));
    await loader.load();
    expect(mockShowWarningMessage).toHaveBeenCalledWith(expect.stringContaining('50 KB'));
    expect(loader.getInstructions()).toBeUndefined();
  });

  it('should register a FileSystemWatcher on watch()', () => {
    loader.watch();
    expect(mockCreateFileSystemWatcher).toHaveBeenCalledTimes(1);
  });

  it('should clear instructions on dispose', async () => {
    mockReadFile.mockResolvedValueOnce(new TextEncoder().encode('# Instructions'));
    await loader.load();
    expect(loader.getInstructions()).toBe('# Instructions');
    loader.dispose();
    expect(loader.getInstructions()).toBeUndefined();
  });

  describe('watcher callbacks', () => {
    it('reloads instructions when file changes', async () => {
      let onDidChangeCallback: (() => void) | undefined;
      const mockWatcher = {
        onDidCreate: vi.fn(),
        onDidChange: vi.fn((cb: () => void) => { onDidChangeCallback = cb; }),
        onDidDelete: vi.fn(),
        dispose: vi.fn(),
      };
      mockCreateFileSystemWatcher.mockReturnValueOnce(mockWatcher);

      loader.watch();

      // First load
      mockReadFile.mockResolvedValueOnce(new TextEncoder().encode('# Original'));
      await loader.load();
      expect(loader.getInstructions()).toBe('# Original');

      // Simulate file change
      mockReadFile.mockResolvedValueOnce(new TextEncoder().encode('# Updated'));
      await onDidChangeCallback!();
      expect(loader.getInstructions()).toBe('# Updated');
    });

    it('clears instructions when file is deleted', async () => {
      let onDidDeleteCallback: (() => void) | undefined;
      const mockWatcher = {
        onDidCreate: vi.fn(),
        onDidChange: vi.fn(),
        onDidDelete: vi.fn((cb: () => void) => { onDidDeleteCallback = cb; }),
        dispose: vi.fn(),
      };
      mockCreateFileSystemWatcher.mockReturnValueOnce(mockWatcher);

      loader.watch();

      // Load instructions first
      mockReadFile.mockResolvedValueOnce(new TextEncoder().encode('# Instructions'));
      await loader.load();
      expect(loader.getInstructions()).toBe('# Instructions');

      // Simulate file deletion: both files return not found
      mockReadFile.mockRejectedValue(new Error('not found'));
      await onDidDeleteCallback!();
      expect(loader.getInstructions()).toBeUndefined();
    });
  });
});
