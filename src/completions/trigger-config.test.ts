import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { TriggerConfig } from './trigger-config';

describe('TriggerConfig', () => {
  let config: TriggerConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    config = new TriggerConfig();
  });

  afterEach(() => {
    vi.useRealTimers();
    config.dispose();
  });

  it('should debounce calls in auto mode', async () => {
    const callback = vi.fn();
    config.trigger(callback, 'auto', 300);
    config.trigger(callback, 'auto', 300);
    config.trigger(callback, 'auto', 300);

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should execute immediately in manual mode', () => {
    const callback = vi.fn();
    config.trigger(callback, 'manual', 300);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should cancel pending triggers', () => {
    const callback = vi.fn();
    config.trigger(callback, 'auto', 300);
    config.cancel();
    vi.advanceTimersByTime(300);
    expect(callback).not.toHaveBeenCalled();
  });

  it('should abort in-flight requests via signal', () => {
    config.trigger(() => {}, 'manual', 300);
    const signal = config.getAbortSignal();
    expect(signal.aborted).toBe(false);

    config.cancel();
    expect(signal.aborted).toBe(true);
  });

  it('should cancel previous request when new one starts', () => {
    config.trigger(() => {}, 'manual', 300);
    const firstSignal = config.getAbortSignal();

    config.trigger(() => {}, 'manual', 300);
    expect(firstSignal.aborted).toBe(true);
  });
});
