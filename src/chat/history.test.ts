import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

vi.mock('vscode', () => ({
  Uri: {
    file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
    joinPath: (base: any, ...segments: string[]) => ({
      fsPath: path.join(base.fsPath, ...segments),
      toString: () => `file://${path.join(base.fsPath, ...segments)}`,
    }),
  },
}));

import { ConversationHistory } from './history';

describe('ConversationHistory', () => {
  let history: ConversationHistory;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(__dirname, '../../.test-conversations-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    const storageUri = { fsPath: tmpDir, toString: () => `file://${tmpDir}` };
    history = new ConversationHistory(storageUri as any);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create a new conversation', async () => {
    const conv = await history.create('test-model');
    expect(conv.id).toBeDefined();
    expect(conv.model).toBe('test-model');
    expect(conv.messages).toHaveLength(0);
    expect(conv.title).toBe('New conversation');
  });

  it('should save and load a conversation', async () => {
    const conv = await history.create('test-model');
    conv.messages.push({ role: 'user', content: 'Hello' });
    conv.title = 'Test Chat';
    await history.save(conv);

    const loaded = await history.load(conv.id);
    expect(loaded).toBeDefined();
    expect(loaded!.title).toBe('Test Chat');
    expect(loaded!.messages).toHaveLength(1);
  });

  it('should list all conversations as summaries', async () => {
    await history.create('model-1');
    await history.create('model-2');

    const list = await history.list();
    expect(list).toHaveLength(2);
    expect(list[0].model).toBeDefined();
    expect(list[0].messageCount).toBe(0);
  });

  it('should delete a conversation', async () => {
    const conv = await history.create('test-model');
    await history.delete(conv.id);

    const loaded = await history.load(conv.id);
    expect(loaded).toBeUndefined();
  });

  it('should export as JSON', async () => {
    const conv = await history.create('test-model');
    conv.messages.push({ role: 'user', content: 'Hello' });
    await history.save(conv);

    const json = await history.exportAsJson(conv.id);
    expect(json).toBeDefined();
    const parsed = JSON.parse(json!);
    expect(parsed.messages).toHaveLength(1);
  });

  it('should export as Markdown', async () => {
    const conv = await history.create('test-model');
    conv.messages.push(
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    );
    conv.title = 'Test Chat';
    await history.save(conv);

    const md = await history.exportAsMarkdown(conv.id);
    expect(md).toBeDefined();
    expect(md).toContain('# Test Chat');
    expect(md).toContain('**User:**');
    expect(md).toContain('**Assistant:**');
  });

  it('should return undefined for non-existent conversation', async () => {
    const loaded = await history.load('non-existent');
    expect(loaded).toBeUndefined();
  });

  it('should sort list by updatedAt descending', async () => {
    const conv1 = await history.create('model');
    await new Promise((r) => setTimeout(r, 10));
    const conv2 = await history.create('model');

    const list = await history.list();
    expect(list[0].id).toBe(conv2.id);
  });

  it('should reject path traversal in conversation ID', async () => {
    await expect(history.load('../../etc/passwd')).rejects.toThrow('Invalid conversation ID');
  });

  it('should reject conversation IDs with special characters', async () => {
    await expect(history.load('../test')).rejects.toThrow('Invalid conversation ID');
    await expect(history.load('test/../../etc')).rejects.toThrow('Invalid conversation ID');
    await expect(history.load('test..test')).rejects.toThrow('Invalid conversation ID');
  });

  it('should accept valid conversation IDs', async () => {
    const result = await history.load('conv-1234567890-abc123');
    expect(result).toBeUndefined();
  });
});
