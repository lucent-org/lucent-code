import { createSignal, For, Show } from 'solid-js';
import type { OpenRouterModel } from '@shared';

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
  models: OpenRouterModel[];
  onSelectProvider: (providerId: string) => void;
  onOpenProviderSettings: (providerId: string) => void;
  onSelectModel: (modelId: string) => void;
}

export function ProviderModelSelector(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [level, setLevel] = createSignal<'providers' | 'models'>('providers');
  const [pendingProviderId, setPendingProviderId] = createSignal('');
  const [search, setSearch] = createSignal('');

  const activeProvider = () => props.providers.find(p => p.id === props.activeProviderId);

  const contextFillClass = () => {
    const pct = props.contextFillPct ?? 0;
    if (pct >= 80) return 'context-fill--danger';
    if (pct >= 60) return 'context-fill--warn';
    return 'context-fill--ok';
  };

  const filteredModels = () => {
    const q = search().toLowerCase();
    return props.models.filter(m =>
      !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
    );
  };

  const handleProviderClick = (providerId: string) => {
    setPendingProviderId(providerId);
    props.onSelectProvider(providerId);
    setSearch('');
    setLevel('models');
  };

  const handleGearClick = (e: MouseEvent, providerId: string) => {
    e.stopPropagation();
    props.onOpenProviderSettings(providerId);
    setOpen(false);
  };

  const handleModelClick = (modelId: string) => {
    props.onSelectModel(modelId);
    setOpen(false);
  };

  return (
    <div class="provider-model-selector">
      <button
        class="provider-model-selector__toggle"
        onClick={() => { setOpen(o => !o); if (!open()) setLevel('providers'); }}
      >
        <span class="provider-model-selector__provider">{activeProvider()?.name ?? 'Select'}</span>
        <span class="provider-model-selector__sep"> · </span>
        <span class="provider-model-selector__model">{props.selectedModelName || props.selectedModel}</span>
        <Show when={props.contextFillPct !== undefined}>
          <span class={`context-fill ${contextFillClass()}`}> · {props.contextFillPct}%</span>
        </Show>
      </button>

      <Show when={open()}>
        <div class="provider-model-selector__dropdown provider-model-selector__dropdown--up">

          {/* Level 1: Provider list */}
          <Show when={level() === 'providers'}>
            <div class="provider-list">
              <For each={props.providers}>{(provider) => (
                <div
                  class={`provider-item${provider.id === props.activeProviderId ? ' provider-item--active' : ''}`}
                  onClick={() => handleProviderClick(provider.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleProviderClick(provider.id); }}
                >
                  <span class="provider-item__dot">{provider.id === props.activeProviderId ? '●' : '○'}</span>
                  <span class="provider-item__name">{provider.name}</span>
                  <span class={`provider-item__status${provider.isConfigured ? ' provider-item__status--ok' : ' provider-item__status--warn'}`}>
                    {provider.isConfigured ? '✓' : '!'}
                  </span>
                  <button
                    class="provider-item__gear"
                    onClick={(e) => handleGearClick(e, provider.id)}
                    title={`Configure ${provider.name}`}
                  >⚙</button>
                </div>
              )}</For>
            </div>
          </Show>

          {/* Level 2: Model list */}
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
                    class={`model-item${model.id === props.selectedModel ? ' model-item--selected' : ''}`}
                    onClick={() => handleModelClick(model.id)}
                  >
                    <div class="model-item-main">
                      <span class="model-name">{model.name}</span>
                      <Show when={model.id === props.selectedModel}>
                        <span class="model-item__check">✓</span>
                      </Show>
                    </div>
                    <Show when={model.pricing}>
                      <div class="model-pricing">
                        ${model.pricing.prompt} / ${model.pricing.completion}
                      </div>
                    </Show>
                  </button>
                )}</For>
              </div>
            </div>
          </Show>

        </div>
      </Show>
    </div>
  );
}
