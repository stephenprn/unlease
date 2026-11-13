/**
 * What Android holds back of the sync with the app closed (`@shared/platform/backgroundSync`): the
 * battery's « Restreinte » stops it altogether, Data Saver stops it on mobile data. Changes written
 * meanwhile stay safe on the phone, but wait for the app to be opened: the person is told, once a day
 * at most, with the page that fixes it (`useBackgroundSyncWarning`), and Réglages and the
 * Administration's « Serveur » list it for as long as it lasts (`BackgroundSyncRows`). Read again each
 * time the app comes back to the front: the answer changes in Android's settings.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { t } from '@unlease/core/i18n';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';
import { backgroundHealth, openBackgroundSetting, type BackgroundHealth, type BackgroundSetting } from '@shared/platform/backgroundSync';

import { selectServer, useSettingsStore } from '../store/settingsStore';
import { showSnack } from '../store/uiStore';

/** What holds the sync back, the heavier first, and the page that fixes each. */
export interface BackgroundProblem {
  readonly kind: 'restricted' | 'dataSaver';
  readonly fix: BackgroundSetting;
}

export function backgroundProblems(health: BackgroundHealth | null): readonly BackgroundProblem[] {
  if (!health) return [];
  const problems: BackgroundProblem[] = [];
  if (health.restricted) problems.push({ kind: 'restricted', fix: 'battery' });
  if (health.dataSaver) problems.push({ kind: 'dataSaver', fix: 'data' });
  return problems;
}

/** What Android holds back, read at mount and each time the app comes to the front; null until read, or without a server. */
export function useBackgroundHealth(): BackgroundHealth | null {
  const server = useSettingsStore(selectServer);
  const [health, setHealth] = useState<BackgroundHealth | null>(null);
  const refresh = useCallback(() => {
    backgroundHealth().then(setHealth, () => setHealth(null));
  }, []);
  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', state => state === 'active' && refresh());
    return () => subscription.remove();
  }, [refresh]);
  return server ? health : null;
}

/** Opens Android's page that fixes it. */
export function fixBackgroundProblem(problem: BackgroundProblem): void {
  void openBackgroundSetting(problem.fix);
}

/** The slip's words: what holds the sync back, and what to choose on the page its button opens. */
export function backgroundProblemSlip(problem: BackgroundProblem): string {
  return problem.kind === 'restricted'
    ? t('Battery set to “Restricted”: Android stops sync while the app is closed. Under “Battery”, choose “Optimized” or “Unrestricted”.')
    : t('Data Saver: on mobile data, Android stops sync while the app is closed. Allow unrestricted data usage.');
}

const WARNED_AT = 'backgroundSyncWarnedAt';
/** A slip at most this often: the rows in Réglages say it for as long as it lasts. */
const WARN_EVERY_MS = 24 * 60 * 60_000;

/**
 * At start, and back in front, while a server is set: a slip saying the sync with the app closed is
 * held back, its button opening the page that fixes it. Once a day at most.
 */
export function useBackgroundSyncWarning(enabled = true): void {
  const health = useBackgroundHealth();
  useEffect(() => {
    const problem = backgroundProblems(health)[0];
    if (!enabled || !problem) return;
    const warnedAt = Number(readPreferences()[WARNED_AT] ?? 0);
    const now = Date.now();
    if (Number.isFinite(warnedAt) && now - warnedAt < WARN_EVERY_MS) return;
    writePreference(WARNED_AT, now);
    showSnack(backgroundProblemSlip(problem), { label: t('Fix'), run: () => fixBackgroundProblem(problem) }, { tone: 'warning' });
  }, [health, enabled]);
}
