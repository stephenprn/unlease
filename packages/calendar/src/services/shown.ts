/**
 * Which calendars show, as a navigation lists them, and « Afficher uniquement celui-ci »: one shows,
 * every other one listed is put away, and what showed before is remembered on this device so
 * « Tout afficher » brings it back. A calendar is a key: `own` and `label:<id>` where the client can
 * hide one's own events (the web's « Mes agendas »: « Mes événements » for those without a label,
 * each label for those wearing it), `feed:<id>` (a calendar subscribed to, the holidays: its record's
 * `hidden`, synced) or `layer:<name>` (what another app lays on the calendar, or the weather: this
 * device's `CalendarPrefs`). « Only » puts away every other key listed, layers included.
 */
import type { CalendarFeed, CalendarLabel } from '../models/events';
import type { CalendarPrefs } from '../models/prefs';

/** What the other apps lay on the calendar (and the weather), each shown or not on this device. */
export const CALENDAR_LAYERS = ['birthdays', 'noteReminders', 'pageDates', 'weather'] as const satisfies readonly (keyof CalendarPrefs)[];
export type CalendarLayer = (typeof CALENDAR_LAYERS)[number];

/** One's own events (those without a label, or those wearing one), a calendar subscribed to, or a layer. */
export type ShownKey = 'own' | `label:${string}` | `feed:${string}` | `layer:${CalendarLayer}`;

/** Each calendar listed, shown or not. */
export type Shown = Readonly<Record<string, boolean>>;

export const OWN_KEY = 'own' satisfies ShownKey;
export const labelKey = (id: string): ShownKey => `label:${id}`;
export const feedKey = (id: string): ShownKey => `feed:${id}`;
export const layerKey = (layer: CalendarLayer): ShownKey => `layer:${layer}`;

/**
 * What shows now: one's own events when the client lists them (`own`, and each live label with the
 * ids unticked, `labels`), each live calendar subscribed to, each layer.
 */
export function shownNow({ own, labels, feeds, prefs }: { own?: boolean; labels?: { readonly all: Iterable<CalendarLabel>; readonly hidden: readonly string[] }; feeds: Iterable<CalendarFeed>; prefs: Pick<CalendarPrefs, CalendarLayer> }): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (own !== undefined) out[OWN_KEY] = own;
  if (labels) for (const label of labels.all) if (label.deletedAt === null) out[labelKey(label.id)] = !labels.hidden.includes(label.id);
  for (const feed of feeds) if (feed.deletedAt === null) out[feedKey(feed.id)] = !feed.hidden;
  for (const layer of CALENDAR_LAYERS) out[layerKey(layer)] = prefs[layer];
  return out;
}

/** How many show. */
export function shownCount(shown: Shown): number {
  return Object.values(shown).filter(Boolean).length;
}

/** The calendar shown alone, or null (none shows, or more than one). */
export function aloneShown(shown: Shown): string | null {
  const on = Object.keys(shown).filter(key => shown[key]);
  return on.length === 1 ? on[0]! : null;
}

/**
 * What a calendar's menu offers: « Afficher uniquement celui-ci » unless it already shows alone (or
 * is the only one listed); « Tout afficher » while one shows alone, or none.
 */
export function shownChoices(shown: Shown, key: string): { readonly only: boolean; readonly all: boolean } {
  const listed = Object.keys(shown).length;
  return { only: listed > 1 && aloneShown(shown) !== key, all: listed > 1 && shownCount(shown) <= 1 };
}

/** What this device remembers of the calendars shown before one alone was, and which one that is. */
export interface ShownMemory {
  readonly only: string;
  readonly before: Shown;
}

/**
 * `key` alone shown, every other calendar listed put away, and what showed before remembered. From
 * one shown alone already (a second « uniquement »), the memory of the first is kept: « Tout
 * afficher » goes back to what showed before either.
 */
export function showOnly(shown: Shown, key: string, memory: ShownMemory | null): { readonly shown: Record<string, boolean>; readonly memory: ShownMemory } {
  const next: Record<string, boolean> = {};
  for (const each of Object.keys(shown)) next[each] = each === key;
  if (!(key in shown)) next[key] = true;
  const narrowed = memory !== null && shownCount(shown) <= 1;
  return { shown: next, memory: { only: key, before: narrowed ? memory.before : { ...shown } } };
}

/**
 * « Tout afficher »: what showed before, for the calendars still listed, and a calendar listed since
 * shown; with nothing remembered (or a memory that would show nothing), every calendar.
 */
export function showAll(shown: Shown, memory: ShownMemory | null): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const each of Object.keys(shown)) next[each] = memory && each in memory.before ? memory.before[each] === true : true;
  if (memory && shownCount(next) === 0) for (const each of Object.keys(next)) next[each] = true;
  return next;
}

/** The writes that take `from` to `to`, by where each is kept: the calendars' records (synced), the layers and one's own (this device). */
export interface ShownPatch {
  readonly feeds: readonly { readonly id: string; readonly hidden: boolean }[];
  /** Labels unticked or ticked again (`hiddenLabels`, this device). */
  readonly labels: readonly { readonly id: string; readonly hidden: boolean }[];
  readonly layers: Partial<Pick<CalendarPrefs, CalendarLayer>>;
  /** Whether one's own events show; null when unchanged (or not listed). */
  readonly own: boolean | null;
}

export function shownPatch(from: Shown, to: Shown): ShownPatch {
  const feeds: { id: string; hidden: boolean }[] = [];
  const labels: { id: string; hidden: boolean }[] = [];
  const layers: Partial<Record<CalendarLayer, boolean>> = {};
  let own: boolean | null = null;
  for (const key of Object.keys(to)) {
    const value = to[key] === true;
    if (!(key in from) || from[key] === value) continue;
    if (key === OWN_KEY) own = value;
    else if (key.startsWith('feed:')) feeds.push({ id: key.slice('feed:'.length), hidden: !value });
    else if (key.startsWith('label:')) labels.push({ id: key.slice('label:'.length), hidden: !value });
    else if (key.startsWith('layer:') && (CALENDAR_LAYERS as readonly string[]).includes(key.slice('layer:'.length))) layers[key.slice('layer:'.length) as CalendarLayer] = value;
  }
  return { feeds, labels, layers, own };
}

/** A memory as stored, read whole: anything else is none. */
export function readShownMemory(value: unknown): ShownMemory | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as { only?: unknown; before?: unknown };
  if (typeof raw.only !== 'string' || typeof raw.before !== 'object' || raw.before === null || Array.isArray(raw.before)) return null;
  const before: Record<string, boolean> = {};
  for (const [key, shown] of Object.entries(raw.before as Record<string, unknown>).slice(0, 500)) if (typeof shown === 'boolean') before[key] = shown;
  return { only: raw.only, before };
}
