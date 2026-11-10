/**
 * The Claude client the next call runs with, from the live settings (the key, the model, the
 * monthly budget: set from the Administration, shared by every app), or none when no key is set.
 * The SDK client is kept per API key and rebuilt only when the key changes.
 */
import type { Effort } from '../config';
import type { SettingsStore } from '../settings/store';
import { anthropicMessages, ClaudeClient, type MessagesApi } from './client';

export interface ClaudeContext {
  /** Null when no key is set: nothing is asked of Claude. */
  readonly client: ClaudeClient | null;
  readonly budgetUsd: number;
}

export interface ClaudeProviderOptions {
  readonly effort: Effort;
  readonly createApi?: (apiKey: string) => MessagesApi;
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export class ClaudeProvider {
  private api: { readonly apiKey: string; readonly api: MessagesApi } | null = null;

  constructor(
    private readonly settings: SettingsStore,
    private readonly options: ClaudeProviderOptions,
  ) {}

  current(): ClaudeContext {
    const { apiKey, model, budgetUsd } = this.settings.effective();
    if (!apiKey) {
      this.api = null;
      return { client: null, budgetUsd };
    }
    if (this.api?.apiKey !== apiKey) this.api = { apiKey, api: (this.options.createApi ?? anthropicMessages)(apiKey) };
    return { client: new ClaudeClient(this.api.api, { model, effort: this.options.effort, sleep: this.options.sleep }), budgetUsd };
  }
}
