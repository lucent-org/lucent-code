import { describe, it, expect } from 'vitest';
import { LLMError } from './llm-provider';

describe('LLMError', () => {
  it('stores code and message', () => {
    const err = new LLMError('auth', 'Authentication failed');
    expect(err.code).toBe('auth');
    expect(err.message).toBe('Authentication failed');
    expect(err).toBeInstanceOf(Error);
  });

  it('has correct name', () => {
    const err = new LLMError('rate_limit', 'Too many requests');
    expect(err.name).toBe('LLMError');
  });
});
