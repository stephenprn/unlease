/**
 * Settings from the environment. Anything malformed stops the server at boot
 * with a message naming the variable, rather than surfacing later as a strange
 * failure in the middle of a sync. The Claude key, model and budget here are
 * only fallbacks: the apps set them through `/api/settings`.
 */
import { CLAUDE_MODELS, isClaudeModel, type ClaudeModel } from '@unlease/core/sync/settings';

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

export interface Config {
  readonly token: string;
  readonly anthropicApiKey: string | null;
  readonly dataDir: string;
  readonly port: number;
  readonly corsOrigins: readonly string[];
  /** The web app's build, served at `/` beside the API; null serves the API alone. */
  readonly webDir: string | null;
  readonly claudeModel: ClaudeModel;
  readonly claudeEffort: Effort;
  readonly monthlyBudgetUsd: number;
  readonly analysisConcurrency: number;
}

export class ConfigError extends Error {}

type Env = Readonly<Record<string, string | undefined>>;

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function integer(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = read(env, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < min || value > max) {
    throw new ConfigError(`${name} must be an integer between ${min} and ${max} (got "${raw}")`);
  }
  return value;
}

function origins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
    .map(entry => {
      let url: URL;
      try {
        url = new URL(entry);
      } catch {
        throw new ConfigError(`UNLEASE_CORS_ORIGINS: "${entry}" is not a URL`);
      }
      if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.pathname !== '/' || url.search) {
        throw new ConfigError(`UNLEASE_CORS_ORIGINS: "${entry}" must be a bare origin such as https://example.com`);
      }
      return url.origin;
    });
}

export function loadConfig(env: Env): Config {
  const token = read(env, 'UNLEASE_TOKEN');
  if (!token) {
    throw new ConfigError(
      'UNLEASE_TOKEN is required: set it to a long random string (for example `openssl rand -hex 32`) and give the same value to the apps',
    );
  }
  const effort = read(env, 'UNLEASE_CLAUDE_EFFORT') ?? 'low';
  if (!(EFFORTS as readonly string[]).includes(effort)) {
    throw new ConfigError(`UNLEASE_CLAUDE_EFFORT must be one of ${EFFORTS.join(', ')} (got "${effort}")`);
  }
  const model = read(env, 'UNLEASE_CLAUDE_MODEL') ?? 'claude-opus-5-5';
  if (!isClaudeModel(model)) {
    throw new ConfigError(`UNLEASE_CLAUDE_MODEL must be one of ${CLAUDE_MODELS.join(', ')} (got "${model}")`);
  }
  const budgetRaw = read(env, 'UNLEASE_MONTHLY_BUDGET_USD');
  const budget = budgetRaw === undefined ? 15 : Number(budgetRaw);
  if (!Number.isFinite(budget) || budget < 0) {
    throw new ConfigError(`UNLEASE_MONTHLY_BUDGET_USD must be a number of dollars, 0 or more (got "${budgetRaw}")`);
  }
  return {
    token,
    anthropicApiKey: read(env, 'ANTHROPIC_API_KEY') ?? null,
    dataDir: read(env, 'UNLEASE_DATA_DIR') ?? '/data',
    port: integer(env, 'PORT', 8080, 1, 65_535),
    corsOrigins: origins(read(env, 'UNLEASE_CORS_ORIGINS')),
    webDir: read(env, 'UNLEASE_WEB_DIR') ?? null,
    claudeModel: model,
    claudeEffort: effort as Effort,
    monthlyBudgetUsd: budget,
    analysisConcurrency: integer(env, 'UNLEASE_ANALYSIS_CONCURRENCY', 2, 1, 16),
  };
}
