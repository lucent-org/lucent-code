import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'http';
import { OpenRouterClient } from './openrouter-client';

let server: http.Server;
let baseUrl: string;
let requestHandler: ((req: http.IncomingMessage, res: http.ServerResponse) => void) | null = null;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (requestHandler) requestHandler(req, res);
    else res.writeHead(500).end('no handler');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;

  // Redirect openrouter.ai fetch calls to our local server
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString().replace('https://openrouter.ai', baseUrl);
    return originalFetch(urlStr, init);
  }) as typeof fetch;
});

afterAll(() => {
  server.close();
});

function makeSSEBody(chunks: object[], done = true): string {
  const lines = chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('');
  return lines + (done ? 'data: [DONE]\n\n' : '');
}

describe('OpenRouterClient integration', () => {
  it('chatStream yields parsed chunks from real SSE response', async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      });
      const body = makeSSEBody([
        { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] },
        { choices: [{ delta: { content: ' world' }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]);
      res.end(body);
    };

    const client = new OpenRouterClient(async () => 'test-key');
    const chunks: string[] = [];
    for await (const chunk of client.chatStream({ model: 'test', messages: [] })) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) chunks.push(content);
    }

    expect(chunks).toEqual(['Hello', ' world']);
  });

  it('chatStream respects AbortSignal mid-stream', async () => {
    requestHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"first"},"finish_reason":null}]}\n\n');
      // Don't call res.end() — simulate a hanging server
    };

    const controller = new AbortController();
    const client = new OpenRouterClient(async () => 'test-key');
    const chunks: string[] = [];

    const gen = client.chatStream({ model: 'test', messages: [] }, controller.signal);
    const firstChunk = await gen.next();
    const content = firstChunk.value?.choices[0]?.delta?.content;
    if (content) chunks.push(content);
    controller.abort();

    const result = await Promise.race([
      gen.next().then(() => 'done', () => 'done'),
      new Promise<string>(resolve => setTimeout(() => resolve('timeout'), 2000)),
    ]);

    expect(chunks).toContain('first');
    expect(result).not.toBe('timeout');
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    let callCount = 0;
    requestHandler = (_req, res) => {
      callCount++;
      if (callCount === 1) {
        res.writeHead(429, { 'Retry-After': '0' }).end('rate limited');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(makeSSEBody([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]));
      }
    };

    const client = new OpenRouterClient(async () => 'test-key');
    const chunks: string[] = [];
    for await (const chunk of client.chatStream({ model: 'test', messages: [] })) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) chunks.push(content);
    }

    expect(callCount).toBe(2);
    expect(chunks).toContain('ok');
  });

  it('throws immediately on 400 (non-retryable)', async () => {
    requestHandler = (_req, res) => {
      res.writeHead(400).end('bad request');
    };

    const client = new OpenRouterClient(async () => 'test-key');
    await expect(async () => {
      for await (const _ of client.chatStream({ model: 'test', messages: [] })) { /* drain */ }
    }).rejects.toThrow('OpenRouter API error (400)');
  });

  it('throws after max retries on 503', async () => {
    let callCount = 0;
    requestHandler = (_req, res) => {
      callCount++;
      res.writeHead(503, { 'Retry-After': '0' }).end('unavailable');
    };

    const client = new OpenRouterClient(async () => 'test-key');
    await expect(async () => {
      for await (const _ of client.chatStream({ model: 'test', messages: [] })) { /* drain */ }
    }).rejects.toThrow('OpenRouter API error (503)');

    // MAX_RETRIES = 3 means 4 total attempts (attempt 0, 1, 2, 3)
    expect(callCount).toBe(4);
  });

  it('throws when no API key configured', async () => {
    const client = new OpenRouterClient(async () => undefined);
    await expect(async () => {
      for await (const _ of client.chatStream({ model: 'test', messages: [] })) { /* drain */ }
    }).rejects.toThrow('No API key configured');
  });
});
