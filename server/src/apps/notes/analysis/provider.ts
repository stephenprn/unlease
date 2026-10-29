/**
 * What the next analysis runs with, from the live settings: the model (or
 * none, when no key is set) and the monthly budget. The SDK client is kept per
 * API key and rebuilt only when the key changes.
 */
import type { Effort } from '../../../config';
import type { SettingsStore } from '../../../settings/store';
import { anthropicMessages, ClaudeLinkModel, type LinkModel, type MessagesApi } from './model';

export interface AnalysisContext {
  /** Null when no key is set: links are not read at all. */
  readonly model: LinkModel | null;
  readonly budgetUsd: number;
}

export interface LinkModelProviderOptions {
  readonly effort: Effort;
  readonly createApi?: (apiKey: string) => MessagesApi;
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export class LinkModelProvider {
  private client: { readonly apiKey: string; readonly api: MessagesApi } | null = null;

  constructor(
    private readonly settings: SettingsStore,
    private readonly options: LinkModelProviderOptions,
  ) {}

  current(): AnalysisContext {
    const { apiKey, model, budgetUsd } = this.settings.effective();
    if (!apiKey) {
      this.client = null;
      return { model: null, budgetUsd };
    }
    if (this.client?.apiKey !== apiKey) {
      this.client = { apiKey, api: (this.options.createApi ?? anthropicMessages)(apiKey) };
    }
    return {
      model: new ClaudeLinkModel(this.client.api, { model, effort: this.options.effort, sleep: this.options.sleep }),
      budgetUsd,
    };
  }
}
