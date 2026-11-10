/** `GET /api/usage`: what Claude has cost this month and in all, every app's calls together, for the Administration. */
import type { Hono } from 'hono';
import type { Env } from '../apps/types';
import type { SettingsStore } from '../settings/store';
import { monthStart, type UsageStore } from './usage';

export function usageRoute(app: Hono<Env>, { usage, settings, now }: { readonly usage: UsageStore; readonly settings: SettingsStore; readonly now: () => number }): void {
  app.get('/api/usage', c => {
    const { model, budgetUsd } = settings.effective();
    return c.json({ monthToDate: usage.totals(monthStart(now())), total: usage.totals(0), model, budgetUsd });
  });
}
