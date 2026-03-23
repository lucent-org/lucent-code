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

  // ── New tests for LUCENT.md filenames + @skill() parser ──────────────────

  it('loads LUCENT.md first', async () => {
    mockReadFile.mockResolvedValueOnce(new TextEncoder().encode('# Project rules'));
    await loader.load();
    const firstCall = mockReadFile.mock.calls[0][0];
    expect(firstCall.path).toContain('LUCENT.md');
  });

  it('falls back to .clinerules', async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error('not found')) // LUCENT.md
      .mockResolvedValueOnce(new TextEncoder().encode('cline rules content'));
    await loader.load();
    const secondCall = mockReadFile.mock.calls[1][0];
    expect(secondCall.path).toContain('.clinerules');
    expect(loader.getInstructions()).toBe('cline rules content');
  });

  it('falls back to CLAUDE.md last', async () => {
    mockReadFile
      .mockRejectedValueOnce(new Error('not found')) // LUCENT.md
      .mockRejectedValueOnce(new Error('not found')) // .clinerules
      .mockRejectedValueOnce(new Error('not found')) // .cursorrules
      .mockResolvedValueOnce(new TextEncoder().encode('claude rules'));
    await loader.load();
    const fourthCall = mockReadFile.mock.calls[3][0];
    expect(fourthCall.path).toContain('CLAUDE.md');
    expect(loader.getInstructions()).toBe('claude rules');
  });

  it('does not try .openrouter-instructions.md', async () => {
    mockReadFile.mockRejectedValue(new Error('not found'));
    await loader.load();
    const attemptedPaths = mockReadFile.mock.calls.map((c: any[]) => c[0].path as string);
    expect(attemptedPaths.some(p => p.includes('openrouter'))).toBe(false);
  });

  it('parses @skill() lines and strips them from instructions', async () => {
    const raw = '@skill(tdd)\n# Project rules\nBe concise.';
    mockReadFile.mockResolvedValueOnce(new TextEncoder().encode(raw));
    await loader.load();
    expect(loader.getActivatedSkills()).toEqual(['tdd']);
    expect(loader.getInstructions()).not.toContain('@skill');
    expect(loader.getInstructions()).toContain('# Project rules');
  });

  it('returns empty activated skills when no @skill() lines', async () => {
    mockReadFile.mockResolvedValueOnce(new TextEncoder().encode('# Plain prose\nNo skills here.'));
    await loader.load();
    expect(loader.getActivatedSkills()).toEqual([]);
  });

  it('handles multiple @skill() on same line or multiple lines', async () => {
    const raw = '@skill(tdd)\n@skill(clean-commits)\n# Rules';
    mockReadFile.mockResolvedValueOnce(new TextEncoder().encode(raw));
    await loader.load();
    expect(loader.getActivatedSkills()).toEqual(['tdd', 'clean-commits']);
    expect(loader.getInstructions()).not.toContain('@skill');
  });
});
