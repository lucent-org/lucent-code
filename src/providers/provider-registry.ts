import type { ILLMProvider } from './llm-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { AnthropicProvider } from './anthropic-provider';
import { NvidiaNimProvider } from './nvidia-nim-provider';

export interface ProviderSettings {
  openRouterApiKey: () => Promise<string | undefined>;
  anthropicApiKey:  () => Promise<string | undefined>;
  nvidiaApiKey:     () => Promise<string | undefined>;
  nvidiaBaseUrl:    string;
  providerOverride: string;
}

export class ProviderRegistry {
  private readonly openRouter: OpenRouterProvider;
  private readonly anthropic:  AnthropicProvider;
  private readonly nvidianim:  NvidiaNimProvider;
  private readonly override:   string;

  constructor(settings: ProviderSettings) {
    this.openRouter = new OpenRouterProvider(settings.openRouterApiKey);
    this.anthropic  = new AnthropicProvider(settings.anthropicApiKey);
    this.nvidianim  = new NvidiaNimProvider(settings.nvidiaApiKey, settings.nvidiaBaseUrl || undefined);
    this.override   = settings.providerOverride ?? '';
  }

  resolve(modelId: string): ILLMProvider {
    if (this.override === 'anthropic')  return this.anthropic;
    if (this.override === 'nvidia-nim') return this.nvidianim;
    if (this.override === 'openrouter') return this.openRouter;

    const id = modelId.toLowerCase();
    if (id.startsWith('claude-') || id.startsWith('anthropic/')) return this.anthropic;
    if (id.startsWith('nvidia/')  || id.startsWith('nv-'))        return this.nvidianim;
    return this.openRouter;
  }

  get all(): ILLMProvider[] {
    return [this.openRouter, this.anthropic, this.nvidianim];
  }
}
