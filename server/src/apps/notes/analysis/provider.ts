/**
 * Carnet's link model over the suite's Claude client (`claude/provider.ts`): what the next reading,
 * sorting call or module runs with, from the live settings, or no model when no key is set.
 */
import type { ClaudeProvider } from '../../../claude/provider';
import { ClaudeLinkModel, type LinkModel } from './model';

export interface AnalysisContext {
  /** Null when no key is set: links are not read at all. */
  readonly model: LinkModel | null;
  readonly budgetUsd: number;
}

export class LinkModelProvider {
  constructor(private readonly claude: ClaudeProvider) {}

  current(): AnalysisContext {
    const { client, budgetUsd } = this.claude.current();
    return { model: client ? new ClaudeLinkModel(client) : null, budgetUsd };
  }
}
