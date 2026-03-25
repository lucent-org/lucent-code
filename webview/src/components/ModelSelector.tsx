import { Component, For, createSignal, createMemo, Show } from 'solid-js';
import type { OpenRouterModel } from '@shared';

interface ModelSelectorProps {
  models: OpenRouterModel[];
  selectedModel: string;
  onSelect: (modelId: string) => void;
  contextFillPct?: number;  // 0-100, undefined = hide
}

const ModelSelector: Component<ModelSelectorProps> = (props) => {
  const [search, setSearch] = createSignal('');
  const [isOpen, setIsOpen] = createSignal(false);

  const filteredModels = createMemo(() => {
    const query = search().toLowerCase();
    if (!query) return props.models;
    return props.models.filter(
      (m) => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query)
    );
  });

  const selectedModelName = createMemo(() => {
    const model = props.models.find((m) => m.id === props.selectedModel);
    return model ? model.name : props.selectedModel || 'Select a model';
  });

  const isReasoning = (model: OpenRouterModel) =>
    model.supported_parameters?.includes('reasoning') ?? false;

  const selectedIsReasoning = createMemo(() => {
    const model = props.models.find((m) => m.id === props.selectedModel);
    return model ? isReasoning(model) : false;
  });

  const fillClass = () => {
    const pct = props.contextFillPct;
    if (pct === undefined) return '';
    if (pct >= 80) return 'context-fill--danger';
    if (pct >= 60) return 'context-fill--warn';
    return 'context-fill--ok';
  };

  return (
    <div class="model-selector">
      <button class="model-selector-toggle" onClick={() => setIsOpen(!isOpen())}>
        {selectedModelName()}
        <Show when={selectedIsReasoning()}>
          <span class="model-reasoning-badge" title="Reasoning model — thinks before responding">thinking</span>
        </Show>
        <Show when={props.contextFillPct !== undefined}>
          <span class={`context-fill ${fillClass()}`}>{' · '}{props.contextFillPct}%</span>
        </Show>
      </button>
      <Show when={isOpen()}>
        <div class="model-selector-dropdown model-selector-dropdown--up">
          <input
            class="model-search"
            type="text"
            placeholder="Search models..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
          <div class="model-list">
            <For each={filteredModels()}>
              {(model) => {
                const promptPer1M = (parseFloat(model.pricing.prompt) * 1_000_000).toFixed(2);
                const completionPer1M = (parseFloat(model.pricing.completion) * 1_000_000).toFixed(2);
                const isFree = parseFloat(model.pricing.prompt) === 0 && parseFloat(model.pricing.completion) === 0;
                return (
                  <button
                    class={`model-item ${model.id === props.selectedModel ? 'selected' : ''}`}
                    onClick={() => {
                      props.onSelect(model.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                  >
                    <div class="model-item-main">
                      <div class="model-name">
                        {model.name}
                        <Show when={isReasoning(model)}>
                          <span class="model-reasoning-badge">thinking</span>
                        </Show>
                      </div>
                      <div class="model-pricing">
                        {isFree ? 'free' : `$${promptPer1M} · $${completionPer1M} /1M`}
                      </div>
                    </div>
                    <div class="model-id">{model.id}</div>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default ModelSelector;
