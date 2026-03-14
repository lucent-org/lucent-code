import { createSignal, createRoot } from 'solid-js';

function createSettingsStore() {
  const [theme, setTheme] = createSignal<'dark' | 'light'>('dark');

  return { theme, setTheme };
}

export const settingsStore = createRoot(createSettingsStore);
