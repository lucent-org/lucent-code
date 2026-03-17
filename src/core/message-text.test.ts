import { describe, it, expect } from 'vitest';
import { messageText } from './message-text';

describe('messageText', () => {
  it('returns string content as-is', () => {
    expect(messageText('hello world')).toBe('hello world');
  });

  it('extracts text from a single text ContentPart', () => {
    expect(messageText([{ type: 'text', text: 'hello' }])).toBe('hello');
  });

  it('ignores image_url parts', () => {
    expect(messageText([
      { type: 'text', text: 'Fix this' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
    ])).toBe('Fix this');
  });

  it('joins multiple text parts', () => {
    expect(messageText([
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
    ])).toBe('Hello world');
  });

  it('returns empty string for array with no text parts', () => {
    expect(messageText([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
    ])).toBe('');
  });
});
