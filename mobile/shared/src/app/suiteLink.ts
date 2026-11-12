/**
 * The suite's apps on one phone hand each other their connection, their appearance, their grain,
 * their language and the look they sent (`platform/suiteLink`, a signature-protected provider), so
 * the second app installed connects in one tap (« Utiliser la connexion de Carnet ») and starts from
 * the same colours, in the same language.
 *
 * This app tells it whenever its server, its appearance, its grain, its language or the look it sent
 * changes (cleared when it lets its server go); its welcome asks what the siblings hold. The grain
 * (the paper's and the ground's) and the language are the suite's: whenever this app starts or comes
 * to the front, it takes its siblings' when one chose them later, keeping their time so nothing
 * echoes back. The look (the theme, the colours, the ground, taken whole) is each app's own: it
 * takes the one a sibling sent it (« Appliquer aux autres », `applyLookTo`) when sent after it
 * chose its own, the same way.
 */
import { AppState, type NativeEventSubscription } from 'react-native';

import { APP_IDS, type AppId } from '@unlease/core/apps';
import { isLocale } from '@unlease/core/i18n';
import { parseAppearance, type Appearance } from '@unlease/design/appearance';
import { shareWithSiblings, siblingHoldings } from '@shared/platform/suiteLink';

import { ownApp } from './store/library';
import { appPackage } from './variant';
import { followGrain, followLocale, followLook, readLookOffer, useSettingsStore, type GrainChoice, type LocaleChoice, type LookOffer, type ServerConfig } from './store/settingsStore';

/** What a sibling app holds, as this app can use it. */
export interface Sibling {
  readonly app: AppId;
  readonly server: ServerConfig | null;
  readonly appearance: Appearance | null;
  /** Its grains, when it has chosen them. */
  readonly grain: GrainChoice | null;
  /** Its language, when it has chosen one. */
  readonly locale: LocaleChoice | null;
  /** The look (theme, colours, ground) it last sent, and the apps it is for. */
  readonly look: LookOffer | null;
}

/** A sibling's grains as it shares them, or null when it has none or they are unreadable. */
export function parseGrainChoice(value: string): GrainChoice | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { paper, ground, at } = parsed as Record<string, unknown>;
    return typeof paper === 'boolean' && typeof ground === 'boolean' && typeof at === 'number' && Number.isFinite(at) && at > 0 ? { paper, ground, at } : null;
  } catch {
    return null;
  }
}

/** A sibling's language as it shares it, or null when it has none or it is unreadable. */
export function parseLocaleChoice(value: string): LocaleChoice | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { locale, at } = parsed as Record<string, unknown>;
    return isLocale(locale) && typeof at === 'number' && Number.isFinite(at) && at > 0 ? { locale, at } : null;
  } catch {
    return null;
  }
}

/** The look a sibling sent as it shares it, or null when it sent none or it is unreadable (one that names no app is none). */
export function parseLookOffer(value: string): LookOffer | null {
  if (!value) return null;
  try {
    return readLookOffer(JSON.parse(value));
  } catch {
    return null;
  }
}

/** The app a sibling's applicationId is, in this build (a dev build's siblings are the other dev builds). */
const appOfPackage = (name: string): AppId | undefined => APP_IDS.find(id => appPackage(id) === name);

/** The other apps of the suite on this phone, in the suite's order, those that hold something. */
export async function findSiblings(own: AppId = ownApp()): Promise<Sibling[]> {
  const others = APP_IDS.filter(id => id !== own).map(appPackage);
  const found: Sibling[] = [];
  for (const holding of await siblingHoldings(others)) {
    const app = appOfPackage(holding.packageName);
    if (!app || app === own) continue;
    const server = holding.server && holding.token ? { url: holding.server, token: holding.token } : null;
    let appearance: Appearance | null = null;
    if (holding.appearance) {
      try {
        appearance = parseAppearance(JSON.parse(holding.appearance));
      } catch {
        appearance = null;
      }
    }
    const grain = parseGrainChoice(holding.grain);
    const locale = parseLocaleChoice(holding.locale);
    const look = parseLookOffer(holding.look);
    if (server || appearance || grain || locale || look) found.push({ app, server, appearance, grain, locale, look });
  }
  return found.sort((a, b) => APP_IDS.indexOf(a.app) - APP_IDS.indexOf(b.app));
}

/** The first sibling connected to a server: the one the welcome offers. */
export const connectedSibling = (siblings: readonly Sibling[]): (Sibling & { readonly server: ServerConfig }) | null =>
  (siblings.find(sibling => sibling.server !== null) as (Sibling & { readonly server: ServerConfig }) | undefined) ?? null;

let last = '';

function publish(): void {
  const { server, appearance, grain, grainAt, locale, localeAt, lookOffer } = useSettingsStore.getState();
  const choice: GrainChoice = { paper: grain, ground: appearance.grain, at: grainAt };
  const language: LocaleChoice = { locale, at: localeAt };
  const next = [server?.url ?? '', server?.token ?? '', JSON.stringify(appearance), grainAt > 0 ? JSON.stringify(choice) : '', localeAt > 0 ? JSON.stringify(language) : '', lookOffer ? JSON.stringify(lookOffer) : ''];
  const key = next.join('\n');
  if (key === last) return;
  last = key;
  shareWithSiblings(next[0]!, next[1]!, next[2]!, next[3]!, next[4]!, next[5]!);
}

/** The latest of the siblings' choices, or null when none chose. */
function latestOf<T extends { readonly at: number }>(choices: readonly (T | null)[]): T | null {
  return choices.filter((choice): choice is T => choice !== null).reduce<T | null>((best, choice) => (best === null || choice.at > best.at ? choice : best), null);
}

/** The grain a sibling chose last, when later than this app's: this app's from now on. */
export async function followSiblingsGrain(own: AppId = ownApp()): Promise<void> {
  const latest = latestOf((await findSiblings(own)).map(sibling => sibling.grain));
  if (latest) followGrain(latest);
}

/** The grain and the language the siblings chose last, and the look one sent this app last, when later than this app's: this app's from now on. */
export async function followSiblings(own: AppId = ownApp()): Promise<void> {
  const siblings = await findSiblings(own);
  const grain = latestOf(siblings.map(sibling => sibling.grain));
  if (grain) followGrain(grain);
  const locale = latestOf(siblings.map(sibling => sibling.locale));
  if (locale) followLocale(locale);
  const look = latestOf(siblings.map(sibling => (sibling.look?.to.includes(own) ? sibling.look : null)));
  if (look) followLook(look);
}

const follow = (): void => {
  followSiblings().catch(() => undefined);
};

let unsubscribe: (() => void) | null = null;
let foreground: NativeEventSubscription | null = null;

/** From start (bootstrap): what this app holds goes to its siblings now and whenever it changes; their later grain and language, and a look sent to it, come here now and whenever this app comes to the front. */
export function startSuiteLink(): void {
  publish();
  unsubscribe ??= useSettingsStore.subscribe((state, before) => {
    if (state.server !== before.server || state.appearance !== before.appearance || state.grain !== before.grain || state.grainAt !== before.grainAt || state.locale !== before.locale || state.localeAt !== before.localeAt || state.lookOffer !== before.lookOffer) publish();
  });
  foreground ??= AppState.addEventListener('change', next => {
    if (next === 'active') follow();
  });
  follow();
}

/** Test seam. */
export function stopSuiteLink(): void {
  unsubscribe?.();
  unsubscribe = null;
  foreground?.remove();
  foreground = null;
  last = '';
}
