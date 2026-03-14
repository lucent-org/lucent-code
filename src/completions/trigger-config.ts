export class TriggerConfig {
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private abortController?: AbortController;

  trigger(callback: () => void, mode: 'auto' | 'manual', debounceMs: number): void {
    this.clearDebounce();
    this.abortController?.abort();
    this.abortController = new AbortController();

    if (mode === 'manual') {
      callback();
    } else {
      this.debounceTimer = setTimeout(callback, debounceMs);
    }
  }

  cancel(): void {
    this.clearDebounce();
    this.abortController?.abort();
  }

  getAbortSignal(): AbortSignal {
    if (!this.abortController) {
      this.abortController = new AbortController();
    }
    return this.abortController.signal;
  }

  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  dispose(): void {
    this.cancel();
  }
}
