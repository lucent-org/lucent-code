import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPostMessage, mockAsWebviewUri } = vi.hoisted(() => ({
  mockPostMessage: vi.fn(() => Promise.resolve(true)),
  mockAsWebviewUri: vi.fn((uri: any) => ({ toString: () => `webview://${uri.fsPath}` })),
}));

vi.mock('vscode', () => ({
  Uri: {
    joinPath: (_base: any, ...segments: string[]) => ({
      fsPath: ['extensionUri', ...segments].join('/'),
    }),
  },
}));

import { ChatViewProvider } from './chat-provider';

function makeExtensionUri() {
  return { fsPath: 'extensionUri' } as any;
}

function makeWebview(visible = true) {
  return {
    options: {} as any,
    html: '',
    postMessage: mockPostMessage,
    asWebviewUri: mockAsWebviewUri,
    cspSource: 'https://csp.example',
  };
}

function makeWebviewView(visible = true) {
  const webview = makeWebview(visible);
  return {
    webview,
    visible,
  } as any;
}

describe('ChatViewProvider', () => {
  let provider: ChatViewProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ChatViewProvider(makeExtensionUri());
  });

  describe('before resolveWebviewView', () => {
    it('getWebview returns undefined', () => {
      expect(provider.getWebview()).toBeUndefined();
    });

    it('isVisible returns false', () => {
      expect(provider.isVisible).toBe(false);
    });

    it('postMessageToWebview queues messages', () => {
      const msg = { type: 'chatResponse', content: 'hello' } as any;
      provider.postMessageToWebview(msg);
      expect(mockPostMessage).not.toHaveBeenCalled();
    });
  });

  describe('resolveWebviewView', () => {
    it('sets enableScripts on webview options', () => {
      const webviewView = makeWebviewView();
      provider.resolveWebviewView(webviewView, {} as any, {} as any);
      expect(webviewView.webview.options.enableScripts).toBe(true);
    });

    it('sets html on the webview', () => {
      const webviewView = makeWebviewView();
      provider.resolveWebviewView(webviewView, {} as any, {} as any);
      expect(webviewView.webview.html).toContain('<!DOCTYPE html>');
    });

    it('html includes nonce in CSP and script tag', () => {
      const webviewView = makeWebviewView();
      provider.resolveWebviewView(webviewView, {} as any, {} as any);
      const html = webviewView.webview.html;
      // nonce should appear in both the CSP meta tag and the script tag
      const nonceMatch = html.match(/nonce-([A-Za-z0-9]{32})/);
      expect(nonceMatch).not.toBeNull();
      const nonce = nonceMatch![1];
      expect(html).toContain(`nonce="${nonce}"`);
    });

    it('calls onResolve callback if set', () => {
      const webviewView = makeWebviewView();
      const onResolve = vi.fn();
      provider.onResolve = onResolve;
      provider.resolveWebviewView(webviewView, {} as any, {} as any);
      expect(onResolve).toHaveBeenCalledOnce();
    });

    it('does not throw if onResolve is not set', () => {
      const webviewView = makeWebviewView();
      expect(() => provider.resolveWebviewView(webviewView, {} as any, {} as any)).not.toThrow();
    });

    it('flushes pending messages queued before resolve', () => {
      const msg1 = { type: 'chatResponse', content: 'a' } as any;
      const msg2 = { type: 'chatResponse', content: 'b' } as any;
      provider.postMessageToWebview(msg1);
      provider.postMessageToWebview(msg2);

      const webviewView = makeWebviewView();
      provider.resolveWebviewView(webviewView, {} as any, {} as any);

      expect(mockPostMessage).toHaveBeenCalledTimes(2);
      expect(mockPostMessage).toHaveBeenCalledWith(msg1);
      expect(mockPostMessage).toHaveBeenCalledWith(msg2);
    });

    it('clears pending queue after flushing', () => {
      const msg = { type: 'chatResponse', content: 'x' } as any;
      provider.postMessageToWebview(msg);

      const webviewView = makeWebviewView();
      provider.resolveWebviewView(webviewView, {} as any, {} as any);
      mockPostMessage.mockClear();

      // Second resolve should not re-flush
      provider.resolveWebviewView(makeWebviewView(), {} as any, {} as any);
      expect(mockPostMessage).not.toHaveBeenCalled();
    });
  });

  describe('after resolveWebviewView', () => {
    let webviewView: ReturnType<typeof makeWebviewView>;

    beforeEach(() => {
      webviewView = makeWebviewView(true);
      provider.resolveWebviewView(webviewView, {} as any, {} as any);
      mockPostMessage.mockClear();
    });

    it('getWebview returns the webview', () => {
      expect(provider.getWebview()).toBe(webviewView.webview);
    });

    it('isVisible returns true when webview is visible', () => {
      expect(provider.isVisible).toBe(true);
    });

    it('isVisible returns false when webview is not visible', () => {
      webviewView.visible = false;
      expect(provider.isVisible).toBe(false);
    });

    it('postMessageToWebview sends immediately', () => {
      const msg = { type: 'chatResponse', content: 'immediate' } as any;
      provider.postMessageToWebview(msg);
      expect(mockPostMessage).toHaveBeenCalledWith(msg);
    });
  });

  describe('viewType', () => {
    it('has the correct static viewType', () => {
      expect(ChatViewProvider.viewType).toBe('lucentCode.chatView');
    });
  });
});
