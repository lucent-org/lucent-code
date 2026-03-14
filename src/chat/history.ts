import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { Conversation, ConversationSummary, ChatMessage } from '../shared/types';

export class ConversationHistory {
  private readonly conversationsDir: string;

  constructor(storageUri: vscode.Uri) {
    this.conversationsDir = path.join(storageUri.fsPath, 'conversations');
    if (!fs.existsSync(this.conversationsDir)) {
      fs.mkdirSync(this.conversationsDir, { recursive: true });
    }
  }

  async create(model: string): Promise<Conversation> {
    const conversation: Conversation = {
      id: this.generateId(),
      title: 'New conversation',
      model,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.save(conversation);
    return conversation;
  }

  async save(conversation: Conversation): Promise<void> {
    conversation.updatedAt = new Date().toISOString();
    const filePath = this.getFilePath(conversation.id);
    fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf-8');
  }

  async load(id: string): Promise<Conversation | undefined> {
    const filePath = this.getFilePath(id);
    if (!fs.existsSync(filePath)) return undefined;
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as Conversation;
    } catch {
      return undefined;
    }
  }

  async list(): Promise<ConversationSummary[]> {
    if (!fs.existsSync(this.conversationsDir)) return [];
    const files = fs.readdirSync(this.conversationsDir).filter((f) => f.endsWith('.json'));
    const summaries: ConversationSummary[] = [];
    for (const file of files) {
      try {
        const data = fs.readFileSync(path.join(this.conversationsDir, file), 'utf-8');
        const conv = JSON.parse(data) as Conversation;
        summaries.push({
          id: conv.id,
          title: conv.title,
          model: conv.model,
          messageCount: conv.messages.length,
          updatedAt: conv.updatedAt,
        });
      } catch { /* skip corrupted */ }
    }
    return summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async delete(id: string): Promise<void> {
    const filePath = this.getFilePath(id);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  async exportAsJson(id: string): Promise<string | undefined> {
    const conv = await this.load(id);
    if (!conv) return undefined;
    return JSON.stringify(conv, null, 2);
  }

  async exportAsMarkdown(id: string): Promise<string | undefined> {
    const conv = await this.load(id);
    if (!conv) return undefined;
    const parts: string[] = [];
    parts.push(`# ${conv.title}`);
    parts.push(`\n*Model: ${conv.model} | ${new Date(conv.createdAt).toLocaleString()}*\n`);
    for (const msg of conv.messages) {
      if (msg.role === 'user') parts.push(`\n**User:**\n\n${msg.content}\n`);
      else if (msg.role === 'assistant') parts.push(`\n**Assistant:**\n\n${msg.content}\n`);
    }
    return parts.join('\n');
  }

  private getFilePath(id: string): string {
    // Sanitize: only allow alphanumeric, hyphens, and underscores
    const sanitized = id.replace(/[^a-zA-Z0-9\-_]/g, '');
    if (!sanitized || sanitized !== id) {
      throw new Error('Invalid conversation ID');
    }
    const filePath = path.join(this.conversationsDir, `${sanitized}.json`);
    // Double-check the resolved path is within the conversations directory
    const resolved = path.resolve(filePath);
    const resolvedDir = path.resolve(this.conversationsDir);
    if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
      throw new Error('Invalid conversation ID');
    }
    return filePath;
  }

  private generateId(): string {
    return `conv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}
