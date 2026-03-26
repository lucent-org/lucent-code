# Provider UI Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the model selector and dual status bar items with a unified two-level `ProviderModelSelector` that switches providers, repopulates models, surfaces per-provider settings/auth, and consolidates the status bar into one item.

**Architecture:** New `ProviderModelSelector` component replaces `ModelSelector` — Level 1 shows providers with config status and gear icons, Level 2 shows filtered model list. Two new message types (`switchProvider`, `openProviderSettings`, `providersLoaded`) wire the UI to the backend. The two existing status bar items merge into one dynamic item in `extension.ts`; `InlineCompletionProvider` signals loading state via a callback instead of its own item. `ProviderRegistry` gains a `getProvider(id)` method and `isConfigured()` checks per provider.

**Tech Stack:** TypeScript, SolidJS (webview), VS Code Extension API, Vitest

---

## Context for the Implementer

### Existing provider IDs
- `'openrouter'` — uses OAuth or manual API key; `auth.isAuthenticated()` checks status
- `'anthropic'` — API key in `lucentCode.providers.anthropic.apiKey`
- `'nvidia-nim'` — API key in `lucentCode.providers.nvidianim.apiKey`, base URL in `lucentCode.providers.nvidianim.baseUrl`

### Key files
- `src/shared/types.ts` — `ExtensionMessage` (line 105) and `WebviewMessage` (line 133) union types
- `src/providers/provider-registry.ts` — `ProviderRegistry` class with `resolve()` and `all` getter
- `src/completions/inline-provider.ts` — owns its own `StatusBarItem` (lines 10, 16-19)
- `src/extension.ts` — `openRouterStatusBar` at line 208; `updateOpenRouterStatus` at line 212; `providerProxy` at lines 58-66
- `webview/src/components/ModelSelector.tsx` — current selector, to be replaced
- `webview/src/components/ChatInput.tsx` — uses `ModelSelector` at line 728
- `webview/src/stores/chat.ts` — `handleModelsLoaded` (line 244), `receiveModelChange` (line 262), `selectModel` (line 254)
- `webview/src/App.tsx` — message dispatch in `onMount` (lines 1-80)

### Display name map (use this everywhere)
```ts
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  'openrouter': 'OpenRouter',
  'anthropic':  'Anthropic',
  'nvidia-nim': 'NVIDIA NIM',
};
```

### Settings keys for openSettings
```ts
const PROVIDER_SETTINGS_KEYS: Record<string, string> = {
  'anthropic':  'lucentCode.providers.anthropic',
  'nvidia-nim': 'lucentCode.providers.nvidianim',
};
// OpenRouter uses lucentCode.authMenu command instead
```

---

## Task 1: Extend shared types

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Add new message types to `ExtensionMessage`**

Add after line 129 (`{ type: 'conversationCompacted' ... }`):

```ts
| { type: 'providersLoaded'; providers: Array<{ id: string; name: string; isConfigured: boolean }> }
| { type: 'modelChanged'; modelId: string; providerName?: string; warning?: string }
```

Note: `modelChanged` already exists at line 110 — add `warning?: string` to it. Only add `providersLoaded` as new.

**Step 2: Add new message types to `WebviewMessage`**

Add after line 153 (`{ type: 'compactConversation' ... }`):

```ts
| { type: 'switchProvider'; providerId: string }
| { type: 'openProviderSettings'; providerId: string }
```

**Step 3: Write tests**

In `src/shared/types.test.ts` (create if it doesn't exist):

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type { ExtensionMessage, WebviewMessage } from './types';

describe('ExtensionMessage types', () => {
  it('includes providersLoaded', () => {
    const msg: ExtensionMessage = {
      type: 'providersLoaded',
      providers: [{ id: 'anthropic', name: 'Anthropic', isConfigured: true }],
    };
    expect(msg.type).toBe('providersLoaded');
  });

  it('modelChanged includes optional warning', () => {
    const msg: ExtensionMessage = {
      type: 'modelChanged',
      modelId: 'claude-sonnet-4-6',
      warning: 'Model not available',
    };
    expect(msg.type).toBe('modelChanged');
  });
});

describe('WebviewMessage types', () => {
  it('includes switchProvider', () => {
    const msg: WebviewMessage = { type: 'switchProvider', providerId: 'anthropic' };
    expect(msg.type).toBe('switchProvider');
  });

  it('includes openProviderSettings', () => {
    const msg: WebviewMessage = { type: 'openProviderSettings', providerId: 'nvidia-nim' };
    expect(msg.type).toBe('openProviderSettings');
  });
});
```

**Step 4: Run tests**

```bash
npm test -- --reporter=verbose src/shared/types.test.ts
```

Expected: 4 tests pass.

**Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/types.test.ts
git commit -m "feat(types): add providersLoaded, switchProvider, openProviderSettings message types"
```

---

## Task 2: Extend ProviderRegistry

**Files:**
- Modify: `src/providers/provider-registry.ts`
- Modify: `src/providers/provider-registry.test.ts`

**Step 1: Add `getProvider(id)` and `isConfigured()` to `ProviderRegistry`**

The registry needs to:
1. Return a provider by ID (for `switchProvider` handling)
2. Report whether each provider is configured (for `providersLoaded` message)

Add to `ProviderRegistry` class (after the `all` getter):

```ts
getProvider(id: string): ILLMProvider {
  if (id === 'anthropic')  return this.anthropic;
  if (id === 'nvidia-nim') return this.nvidianim;
  return this.openRouter;
}

// Each key returns whether that provider has credentials available
// These are async because API keys come from SecretStorage
async isConfigured(id: string, auth?: { isAuthenticated(): Promise<boolean> }): Promise<boolean> {
  if (id === 'openrouter') return auth ? auth.isAuthenticated() : false;
  if (id === 'anthropic')  { const k = await this.settings.anthropicApiKey(); return !!k; }
  if (id === 'nvidia-nim') { const k = await this.settings.nvidiaApiKey();    return !!k; }
  return false;
}
```

Note: `ProviderRegistry` constructor needs to save `settings` to use in `isConfigured`. Add `private readonly settings: ProviderSettings` to the class and assign it in constructor.

**Step 2: Write failing tests**

In `src/providers/provider-registry.test.ts`, add:

```ts
describe('getProvider', () => {
  it('returns anthropic provider for id anthropic', () => {
    const p = registry.getProvider('anthropic');
    expect(p.id).toBe('anthropic');
  });

  it('returns nvidia-nim provider for id nvidia-nim', () => {
    const p = registry.getProvider('nvidia-nim');
    expect(p.id).toBe('nvidia-nim');
  });

  it('returns openrouter provider for unknown id', () => {
    const p = registry.getProvider('unknown');
    expect(p.id).toBe('openrouter');
  });
});

describe('isConfigured', () => {
  it('returns true for anthropic when key is set', async () => {
    const result = await registry.isConfigured('anthropic');
    expect(result).toBe(true); // mock returns 'test-key'
  });

  it('returns false for anthropic when key is empty', async () => {
    const emptyRegistry = new ProviderRegistry({
      ...mockSettings,
      anthropicApiKey: async () => undefined,
    });
    const result = await emptyRegistry.isConfigured('anthropic');
    expect(result).toBe(false);
  });

  it('returns openrouter configured status from auth', async () => {
    const mockAuth = { isAuthenticated: async () => true };
    const result = await registry.isConfigured('openrouter', mockAuth);
    expect(result).toBe(true);
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose src/providers/provider-registry.test.ts
```

Expected: new tests fail with "getProvider is not a function".

**Step 4: Implement**

Apply the changes from Step 1.

**Step 5: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose src/providers/provider-registry.test.ts
```

Expected: all tests pass.

**Step 6: Commit**

```bash
git add src/providers/provider-registry.ts src/providers/provider-registry.test.ts
git commit -m "feat(providers): add getProvider() and isConfigured() to ProviderRegistry"
```

---

## Task 3: Merge status bar items — remove inline-provider's own item

**Files:**
- Modify: `src/completions/inline-provider.ts`
- Modify: `src/completions/inline-provider.test.ts`

**Goal:** `InlineCompletionProvider` no longer owns a `StatusBarItem`. Instead, it receives an `onLoadingChange: (loading: boolean) => void` callback in its constructor. The caller (`extension.ts`) uses this to update the shared status bar.

**Step 1: Write failing test**

In `src/completions/inline-provider.test.ts`, add:

```ts
it('calls onLoadingChange(true) when completion starts', async () => {
  const onLoadingChange = vi.fn();
  const provider = new InlineCompletionProvider(mockClient, mockSettings, onLoadingChange);
  // trigger completion
  await provider.provideInlineCompletionItems(mockDocument, mockPosition, mockContext, mockToken);
  expect(onLoadingChange).toHaveBeenCalledWith(true);
});

it('calls onLoadingChange(false) when completion ends', async () => {
  const onLoadingChange = vi.fn();
  const provider = new InlineCompletionProvider(mockClient, mockSettings, onLoadingChange);
  await provider.provideInlineCompletionItems(mockDocument, mockPosition, mockContext, mockToken);
  expect(onLoadingChange).toHaveBeenLastCalledWith(false);
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose src/completions/inline-provider.test.ts
```

**Step 3: Modify `InlineCompletionProvider`**

Replace the `statusBarItem` field and all its usages with the callback:

```ts
constructor(
  private readonly client: ILLMProvider,
  private readonly settings: Settings,
  private readonly onLoadingChange?: (loading: boolean) => void,
) {}
```

Replace every `this.statusBarItem.text = '$(sparkle) OpenRouter'` with `this.onLoadingChange?.(false)`.
Replace `this.statusBarItem.text = '$(loading~spin) OpenRouter'` with `this.onLoadingChange?.(true)`.
Remove the `createStatusBarItem` call, the field declaration, and `this.statusBarItem.dispose()` in `dispose()`.

**Step 4: Run tests**

```bash
npm test -- --reporter=verbose src/completions/inline-provider.test.ts
```

Expected: all pass.

**Step 5: Commit**

```bash
git add src/completions/inline-provider.ts src/completions/inline-provider.test.ts
git commit -m "refactor(completions): replace status bar item with onLoadingChange callback"
```

---

## Task 4: Merge status bar in extension.ts

**Files:**
- Modify: `src/extension.ts`

**Goal:** One status bar item that:
1. Shows current provider name + session cost when idle
2. Shows spinner when inline completion is running
3. Shows warnings when provider is not configured
4. Clicking opens the right auth/settings action per provider

**Step 1: Update `updateOpenRouterStatus` → `updateProviderStatus`**

The function is at ~line 212. Replace it:

```ts
const updateProviderStatus = async () => {
  const providerId = providerRegistry.resolve(settings.chatModel).id;
  const providerName = PROVIDER_DISPLAY_NAMES[providerId] ?? providerId;
  const configured = await providerRegistry.isConfigured(providerId, auth);

  if (!configured) {
    const label = providerId === 'openrouter' ? 'Not signed in' : 'No API key';
    providerStatusBar.text = `$(warning) ${providerName}: ${label}`;
    providerStatusBar.tooltip = `${providerName}: not configured — click to configure`;
    providerStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else if (hasNoCredits && providerId === 'openrouter') {
    providerStatusBar.text = `$(warning) OpenRouter: No credits`;
    providerStatusBar.tooltip = 'No credits remaining — click to manage';
    providerStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    const costStr = currentSessionCost > 0 ? ` · $${currentSessionCost.toFixed(4)}` : '';
    providerStatusBar.text = isInlineLoading
      ? `$(loading~spin) ${providerName}${costStr}`
      : `$(key) ${providerName}${costStr}`;
    providerStatusBar.tooltip = `${providerName} — click to manage`;
    providerStatusBar.backgroundColor = undefined;
  }
  providerStatusBar.show();
};
```

Add `let isInlineLoading = false;` near the other `let` declarations.

**Step 2: Rename `openRouterStatusBar` → `providerStatusBar`**

Use replace-all in `extension.ts`.

**Step 3: Update the `InlineCompletionProvider` constructor call**

Pass the loading callback:

```ts
const inlineProvider = new InlineCompletionProvider(
  providerProxy,
  settings,
  (loading) => { isInlineLoading = loading; void updateProviderStatus(); },
);
```

**Step 4: Add `PROVIDER_DISPLAY_NAMES` constant near the top of the activate function**

```ts
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  'openrouter': 'OpenRouter',
  'anthropic':  'Anthropic',
  'nvidia-nim': 'NVIDIA NIM',
};
```

**Step 5: Update status bar click command**

The status bar `command` property currently points to `lucentCode.authMenu`. Change it to a new command `lucentCode.providerMenu` that routes based on active provider:

```ts
providerStatusBar.command = 'lucentCode.providerMenu';
```

Register the command:

```ts
context.subscriptions.push(
  vscode.commands.registerCommand('lucentCode.providerMenu', async () => {
    const providerId = providerRegistry.resolve(settings.chatModel).id;
    if (providerId === 'openrouter') {
      vscode.commands.executeCommand('lucentCode.authMenu');
    } else if (providerId === 'anthropic') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'lucentCode.providers.anthropic');
    } else if (providerId === 'nvidia-nim') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'lucentCode.providers.nvidianim');
    }
  })
);
```

**Step 6: Run all tests**

```bash
npm test
```

Expected: all 471+ tests pass.

**Step 7: Commit**

```bash
git add src/extension.ts
git commit -m "feat(statusbar): merge dual status bar items into single dynamic provider item"
```

---

## Task 5: Backend — handle `switchProvider` and `openProviderSettings` messages + send `providersLoaded`

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/chat/message-handler.ts`

**Goal:** Extension handles the two new webview messages and sends `providersLoaded` on startup and after provider changes.

**Step 1: Write failing tests in `message-handler.test.ts`**

```ts
describe('switchProvider', () => {
  it('calls onSwitchProvider callback with providerId', async () => {
    const onSwitch = vi.fn();
    handler = new MessageHandler({ ...opts, onSwitchProvider: onSwitch });
    await handler.handleMessage({ type: 'switchProvider', providerId: 'anthropic' });
    expect(onSwitch).toHaveBeenCalledWith('anthropic');
  });
});

describe('openProviderSettings', () => {
  it('calls onOpenProviderSettings callback with providerId', async () => {
    const onSettings = vi.fn();
    handler = new MessageHandler({ ...opts, onOpenProviderSettings: onSettings });
    await handler.handleMessage({ type: 'openProviderSettings', providerId: 'nvidia-nim' });
    expect(onSettings).toHaveBeenCalledWith('nvidia-nim');
  });
});
```

**Step 2: Run tests to see them fail**

```bash
npm test -- src/chat/message-handler.test.ts
```

**Step 3: Add callbacks to `MessageHandler`**

`MessageHandler` already has an options/constructor pattern. Add two optional callbacks:

```ts
// In MessageHandler constructor options (or as additional constructor params):
private readonly onSwitchProvider?: (providerId: string) => void,
private readonly onOpenProviderSettings?: (providerId: string) => void,
```

In `handleMessage`, add cases:

```ts
case 'switchProvider':
  this.onSwitchProvider?.(message.providerId);
  break;

case 'openProviderSettings':
  this.onOpenProviderSettings?.(message.providerId);
  break;
```

**Step 4: Wire in `extension.ts`**

Pass callbacks when constructing `MessageHandler`:

```ts
onSwitchProvider: async (providerId: string) => {
  // 1. Set override
  await vscode.workspace.getConfiguration('lucentCode.providers').update(
    'override', providerId, vscode.ConfigurationTarget.Global
  );
  // 2. Load models for this provider
  const models = await providerRegistry.getProvider(providerId).listModels();
  // 3. Check if current model is available
  const currentModel = settings.chatModel;
  const available = models.some(m => m.id === currentModel);
  let warning: string | undefined;
  let newModelId = currentModel;
  if (!available && models.length > 0) {
    newModelId = models[0].id;
    warning = `"${currentModel}" not available in ${PROVIDER_DISPLAY_NAMES[providerId] ?? providerId} — switching to ${models[0].name}`;
    await vscode.workspace.getConfiguration('lucentCode').update('chatModel', newModelId, vscode.ConfigurationTarget.Global);
  }
  // 4. Send updated models + model change to webview
  panel.webview.postMessage({ type: 'modelsLoaded', models: models.map(toOpenRouterModel) });
  if (warning || newModelId !== currentModel) {
    panel.webview.postMessage({ type: 'modelChanged', modelId: newModelId, providerName: PROVIDER_DISPLAY_NAMES[providerId], warning });
  }
  void updateProviderStatus();
},

onOpenProviderSettings: (providerId: string) => {
  if (providerId === 'openrouter') {
    vscode.commands.executeCommand('lucentCode.authMenu');
  } else if (providerId === 'anthropic') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'lucentCode.providers.anthropic');
  } else if (providerId === 'nvidia-nim') {
    vscode.commands.executeCommand('workbench.action.openSettings', 'lucentCode.providers.nvidianim');
  }
},
```

**Step 5: Add `sendProvidersLoaded` helper and call it on startup**

```ts
const sendProvidersLoaded = async () => {
  const providers = await Promise.all(
    [
      { id: 'openrouter', name: 'OpenRouter' },
      { id: 'anthropic',  name: 'Anthropic'  },
      { id: 'nvidia-nim', name: 'NVIDIA NIM' },
    ].map(async p => ({
      ...p,
      isConfigured: await providerRegistry.isConfigured(p.id, auth),
    }))
  );
  panel.webview.postMessage({ type: 'providersLoaded', providers });
};
```

Call `void sendProvidersLoaded()` in the `ready` message handler (where `getModels` is currently handled).

**Step 6: Add `toOpenRouterModel` helper** (maps `ProviderModel` → `OpenRouterModel` for the webview — this mapping already exists in `handleGetModels`, extract it):

```ts
function toOpenRouterModel(m: ProviderModel): OpenRouterModel {
  return {
    id: m.id,
    name: m.name,
    context_length: m.contextLength,
    pricing: m.pricing,
    top_provider: m.topProvider,
  };
}
```

**Step 7: Run all tests**

```bash
npm test
```

**Step 8: Commit**

```bash
git add src/extension.ts src/chat/message-handler.ts src/chat/message-handler.test.ts
git commit -m "feat(providers): handle switchProvider and openProviderSettings messages; send providersLoaded"
```

---

## Task 6: Webview store — add provider state

**Files:**
- Modify: `webview/src/stores/chat.ts`

**Step 1: Add provider signals and handlers**

In `chat.ts`, after the existing `selectedModelProvider` signal, add:

```ts
const [providers, setProviders] = createSignal<Array<{ id: string; name: string; isConfigured: boolean }>>([]);
const [activeProviderId, setActiveProviderId] = createSignal<string>('openrouter');
const [providerWarning, setProviderWarning] = createSignal<string>('');
```

Add handler for `providersLoaded`:

```ts
function handleProvidersLoaded(providerList: Array<{ id: string; name: string; isConfigured: boolean }>) {
  setProviders(providerList);
}
```

Update `receiveModelChange` to handle the new `warning` field:

```ts
function receiveModelChange(modelId: string, providerName?: string, warning?: string) {
  setSelectedModel(modelId);
  setSelectedModelProvider(providerName ?? '');
  setProviderWarning(warning ?? '');
  // Auto-clear warning after 5s
  if (warning) setTimeout(() => setProviderWarning(''), 5000);
}
```

Add `switchProvider` action:

```ts
function switchProvider(providerId: string) {
  setActiveProviderId(providerId);
  setProviderWarning('');
  vscode.postMessage({ type: 'switchProvider', providerId });
}

function openProviderSettings(providerId: string) {
  vscode.postMessage({ type: 'openProviderSettings', providerId });
}
```

Export from store: `providers`, `activeProviderId`, `providerWarning`, `switchProvider`, `openProviderSettings`, `handleProvidersLoaded`.

**Step 2: Run tests**

```bash
npm test
```

Expected: all pass (store changes are not directly unit-tested, TypeScript compile validates them).

**Step 3: Commit**

```bash
git add webview/src/stores/chat.ts
git commit -m "feat(store): add provider signals, switchProvider action, providersLoaded handler"
```

---

## Task 7: Wire new store actions in App.tsx

**Files:**
- Modify: `webview/src/App.tsx`

**Step 1: Add message handlers**

In the `onMount` message listener, add:

```ts
case 'providersLoaded':
  handleProvidersLoaded(message.providers);
  break;
```

Update the existing `modelChanged` handler to pass `warning`:

```ts
case 'modelChanged':
  receiveModelChange(message.modelId, message.providerName, message.warning);
  break;
```

**Step 2: Run tests**

```bash
npm test
```

**Step 3: Commit**

```bash
git add webview/src/App.tsx
git commit -m "feat(app): handle providersLoaded message and modelChanged warning"
```

---

## Task 8: Build `ProviderModelSelector` component — Level 1 (provider list)

**Files:**
- Create: `webview/src/components/ProviderModelSelector.tsx`
- Modify: `webview/src/styles.css`

**Step 1: Create the component with Level 1 only (provider list)**

```tsx
import { createSignal, For, Show } from 'solid-js';

export interface ProviderInfo {
  id: string;
  name: string;
  isConfigured: boolean;
}

interface Props {
  providers: ProviderInfo[];
  activeProviderId: string;
  selectedModel: string;
  selectedModelName: string;
  contextFillPct?: number;
  providerWarning: string;
  onSelectProvider: (providerId: string) => void;
  onOpenProviderSettings: (providerId: string) => void;
  // Level 2 props (added in Task 9)
  models?: import('../stores/chat').ChatModel[];
  onSelectModel?: (modelId: string) => void;
}

export function ProviderModelSelector(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [level, setLevel] = createSignal<'providers' | 'models'>('providers');
  const [pendingProviderId, setPendingProviderId] = createSignal('');

  const activeProvider = () => props.providers.find(p => p.id === props.activeProviderId);

  const contextFillClass = () => {
    const pct = props.contextFillPct ?? 0;
    if (pct >= 80) return 'context-fill--danger';
    if (pct >= 60) return 'context-fill--warn';
    return 'context-fill--ok';
  };

  const handleProviderClick = (providerId: string) => {
    setPendingProviderId(providerId);
    props.onSelectProvider(providerId);
    setLevel('models');
  };

  const handleGearClick = (e: MouseEvent, providerId: string) => {
    e.stopPropagation();
    props.onOpenProviderSettings(providerId);
    setOpen(false);
  };

  return (
    <div class="provider-model-selector">
      <button
        class="provider-model-selector__toggle"
        onClick={() => { setOpen(o => !o); setLevel('providers'); }}
      >
        <span class="provider-model-selector__provider">{activeProvider()?.name ?? 'Select provider'}</span>
        <span class="provider-model-selector__sep">·</span>
        <span class="provider-model-selector__model">{props.selectedModelName || props.selectedModel}</span>
        <Show when={props.contextFillPct !== undefined}>
          <span class={`context-fill ${contextFillClass()}`}>· {props.contextFillPct}%</span>
        </Show>
      </button>

      <Show when={open()}>
        <div class="provider-model-selector__dropdown provider-model-selector__dropdown--up">
          <Show when={level() === 'providers'}>
            <div class="provider-list">
              <For each={props.providers}>{(provider) => (
                <button
                  class={`provider-item ${provider.id === props.activeProviderId ? 'provider-item--active' : ''}`}
                  onClick={() => handleProviderClick(provider.id)}
                >
                  <span class="provider-item__dot">{provider.id === props.activeProviderId ? '●' : '○'}</span>
                  <span class="provider-item__name">{provider.name}</span>
                  <span class={`provider-item__status ${provider.isConfigured ? 'provider-item__status--ok' : 'provider-item__status--warn'}`}>
                    {provider.isConfigured ? '✓' : '!'}
                  </span>
                  <button
                    class="provider-item__gear"
                    onClick={(e) => handleGearClick(e, provider.id)}
                    title={`Configure ${provider.name}`}
                  >⚙</button>
                </button>
              )}</For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
```

**Step 2: Add CSS**

In `webview/src/styles.css`, add:

```css
/* ProviderModelSelector */
.provider-model-selector { position: relative; }

.provider-model-selector__toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: transparent;
  border: none;
  color: var(--vscode-foreground);
  font-size: 11px;
  cursor: pointer;
  max-width: 260px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  border-radius: 3px;
}
.provider-model-selector__toggle:hover { background: var(--vscode-toolbar-hoverBackground); }

.provider-model-selector__provider { font-weight: 500; }
.provider-model-selector__sep { opacity: 0.5; }
.provider-model-selector__model { opacity: 0.85; overflow: hidden; text-overflow: ellipsis; }

.provider-model-selector__dropdown {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  min-width: 260px;
  background: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 4px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.provider-list { padding: 4px 0; }

.provider-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 10px;
  gap: 8px;
  background: transparent;
  border: none;
  color: var(--vscode-foreground);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
.provider-item:hover { background: var(--vscode-list-hoverBackground); }
.provider-item--active { color: var(--vscode-list-activeSelectionForeground); }

.provider-item__dot { font-size: 10px; width: 12px; }
.provider-item__name { flex: 1; }
.provider-item__status--ok  { color: var(--vscode-testing-iconPassed); font-size: 11px; }
.provider-item__status--warn { color: var(--vscode-editorWarning-foreground); font-size: 11px; }
.provider-item__gear {
  padding: 0 4px;
  background: transparent;
  border: none;
  color: var(--fg-secondary);
  cursor: pointer;
  opacity: 0.6;
  font-size: 12px;
}
.provider-item__gear:hover { opacity: 1; }
```

**Step 3: Run build to check for TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: zero errors.

**Step 4: Commit**

```bash
git add webview/src/components/ProviderModelSelector.tsx webview/src/styles.css
git commit -m "feat(ui): add ProviderModelSelector component - Level 1 provider list"
```

---

## Task 9: Add Level 2 (model list) and warning banner to `ProviderModelSelector`

**Files:**
- Modify: `webview/src/components/ProviderModelSelector.tsx`
- Modify: `webview/src/styles.css`

**Step 1: Add Level 2 model list to the component**

Extend the dropdown `Show when={level() === 'providers'}` block with a Level 2 block:

```tsx
<Show when={level() === 'models'}>
  <div class="model-list-level2">
    <button class="model-list-level2__back" onClick={() => setLevel('providers')}>
      ← {props.providers.find(p => p.id === pendingProviderId())?.name ?? 'Back'}
    </button>
    <Show when={props.providerWarning}>
      <div class="provider-warning-banner">
        ⚠ {props.providerWarning}
      </div>
    </Show>
    <input
      class="model-search"
      type="text"
      placeholder="Search models..."
      value={search()}
      onInput={e => setSearch(e.currentTarget.value)}
      autofocus
    />
    <div class="model-list">
      <For each={filteredModels()}>{(model) => (
        <button
          class={`model-item ${model.id === props.selectedModel ? 'model-item--selected' : ''}`}
          onClick={() => { props.onSelectModel?.(model.id); setOpen(false); }}
        >
          <div class="model-item-main">
            <span class="model-name">{model.name}</span>
            <Show when={model.id === props.selectedModel}>
              <span class="model-item__check">✓</span>
            </Show>
          </div>
          <div class="model-pricing">
            ${model.pricing?.prompt ?? '?'} / ${model.pricing?.completion ?? '?'}
          </div>
        </button>
      )}</For>
    </div>
  </div>
</Show>
```

Add `search` signal and `filteredModels` derived signal:

```ts
const [search, setSearch] = createSignal('');
const filteredModels = () => {
  const q = search().toLowerCase();
  return (props.models ?? []).filter(m =>
    !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
  );
};
```

**Step 2: Add CSS for Level 2**

```css
.model-list-level2 { padding: 4px 0; }

.model-list-level2__back {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--vscode-dropdown-border);
  color: var(--vscode-foreground);
  font-size: 12px;
  cursor: pointer;
  font-weight: 500;
  margin-bottom: 4px;
}
.model-list-level2__back:hover { background: var(--vscode-list-hoverBackground); }

.provider-warning-banner {
  margin: 0 8px 6px;
  padding: 6px 8px;
  background: var(--vscode-editorWarning-background, rgba(255,200,0,0.1));
  border: 1px solid var(--vscode-editorWarning-foreground);
  border-radius: 3px;
  font-size: 11px;
  color: var(--vscode-editorWarning-foreground);
}

.model-item__check { margin-left: auto; color: var(--vscode-testing-iconPassed); }
```

**Step 3: Compile check**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add webview/src/components/ProviderModelSelector.tsx webview/src/styles.css
git commit -m "feat(ui): add Level 2 model list and warning banner to ProviderModelSelector"
```

---

## Task 10: Replace `ModelSelector` with `ProviderModelSelector` in `ChatInput`

**Files:**
- Modify: `webview/src/components/ChatInput.tsx`
- Modify: `webview/src/App.tsx`

**Step 1: Update `ChatInputProps`**

In `ChatInput.tsx`, replace the `ModelSelector`-related props:

Remove:
```ts
selectedModel: string;
selectedModelProvider?: string;
models: OpenRouterModel[];
onSelectModel: (id: string) => void;
contextFillPct?: number;
```

Replace with:
```ts
selectedModel: string;
selectedModelName: string;
selectedModelProvider: string;
models: OpenRouterModel[];
providers: Array<{ id: string; name: string; isConfigured: boolean }>;
activeProviderId: string;
providerWarning: string;
contextFillPct?: number;
onSelectModel: (id: string) => void;
onSelectProvider: (id: string) => void;
onOpenProviderSettings: (id: string) => void;
```

**Step 2: Replace `<ModelSelector>` usage (line 728)**

```tsx
<ProviderModelSelector
  providers={props.providers}
  activeProviderId={props.activeProviderId}
  selectedModel={props.selectedModel}
  selectedModelName={props.selectedModelName}
  contextFillPct={props.contextFillPct}
  providerWarning={props.providerWarning}
  models={props.models}
  onSelectProvider={props.onSelectProvider}
  onOpenProviderSettings={props.onOpenProviderSettings}
  onSelectModel={props.onSelectModel}
/>
```

**Step 3: Update `App.tsx` to pass new props**

Pull the new store values:
```ts
const { providers, activeProviderId, providerWarning, switchProvider, openProviderSettings } = chatStore;
```

Pass to `ChatInput`:
```tsx
providers={providers()}
activeProviderId={activeProviderId()}
providerWarning={providerWarning()}
onSelectProvider={switchProvider}
onOpenProviderSettings={openProviderSettings}
selectedModelName={models().find(m => m.id === selectedModel())?.name ?? selectedModel()}
```

**Step 4: Run compile check**

```bash
npx tsc --noEmit
```

**Step 5: Run all tests**

```bash
npm test
```

Expected: all pass.

**Step 6: Commit**

```bash
git add webview/src/components/ChatInput.tsx webview/src/App.tsx
git commit -m "feat(ui): replace ModelSelector with ProviderModelSelector in ChatInput"
```

---

## Task 11: Final verification

**Step 1: Full test suite**

```bash
npm test
```

Expected: all tests pass.

**Step 2: TypeScript clean compile**

```bash
npx tsc --noEmit
```

Expected: zero errors.

**Step 3: Build**

```bash
npm run compile
```

Expected: success.

**Step 4: Manual smoke test**

- Launch Extension Development Host (F5)
- Click the provider/model button in the chat input bar
- Verify Level 1 shows three providers with ✓/! status
- Click a provider with models configured → Level 2 shows its models
- Switch to a provider where the current model doesn't exist → warning banner appears
- Click ⚙ on OpenRouter → auth menu appears
- Click ⚙ on Anthropic → VS Code settings opens at `lucentCode.providers.anthropic`
- Status bar shows single item: `$(key) <Provider> · $0.0000`
- Trigger inline completion → spinner appears on status bar → returns to key icon

**Step 5: Commit (if any final cleanup)**

```bash
git add -A
git commit -m "feat(ui): provider UI consolidation complete"
```
