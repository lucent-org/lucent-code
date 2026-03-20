import { describe, it, expect } from 'vitest';

// Smoke test: verify the CSS files exist and are importable
describe('design tokens', () => {
  it('tokens.css file exists', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const file = path.resolve(__dirname, 'tokens.css');
    expect(fs.existsSync(file)).toBe(true);
  });

  it('base.css file exists', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const file = path.resolve(__dirname, 'base.css');
    expect(fs.existsSync(file)).toBe(true);
  });
});
