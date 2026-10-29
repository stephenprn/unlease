/**
 * "Demander à Claude" on the pages (web): whether the server offers it, what a question reads
 * (`askContext`), the question asked, and the conversations, one per page, kept while the tab is
 * open (never stored, never synced). The phone's `src/app/pagesAsk.ts`.
 */
import { create } from 'zustand';

import { getLocale, t } from '@unlease/core/i18n';
import type { BlockTarget } from '@unlease/notes/models/blocks';
import { subPages } from '@unlease/notes/services/blocks';
import { answerDraft, answerText, askContext, isPrivatePage } from '@unlease/notes/services/pagesAsk';
import { PAGES_ASK_LIMITS, type PageScope, type PagesAskResponse } from '@unlease/notes/sync/pagesAsk';
import { PAGES_REACH_CHARS, type PagesAskSettings } from '@unlease/core/sync/settings';

import { targetTitle } from './hooks/usePages';
import { useLibraryStore, type LibraryState } from './store/library';
import { insertDrafts } from './store/pages';
import { useServerSettingsStore } from './store/serverSettings';
import { useSettingsStore } from './store/settings';
import { askAboutPages } from './sync/transport';

export interface AskTurn {
  readonly id: number;
  readonly question: string;
  readonly scope: PageScope;
  readonly web: boolean;
  /** Pages read, and pages of the scope left out for room. */
  readonly read: number;
  readonly cut: number;
  /** Null while Claude answers, or when it could not. */
  readonly answer: PagesAskResponse | null;
  readonly error: string | null;
}

export interface AskThread {
  readonly scope: PageScope;
  readonly web: boolean;
  readonly turns: readonly AskTurn[];
}

interface PagesAskState {
  /** The page whose conversation is open. */
  readonly open: string | null;
  readonly threads: Readonly<Record<string, AskThread>>;
  /** Just opened: the question field takes the focus once (not when a source's page draws the panel again). */
  readonly focus?: boolean;
}

export const usePagesAskStore = create<PagesAskState>(() => ({ open: null, threads: {} }));

const running = new Map<string, AbortController>();
let turns = 0;

/** What the server allows, once it said so and Claude has a key; null: the pages show nothing of it. */
export function selectPagesAsk(s: { readonly settings: { readonly analysis: { readonly enabled: boolean }; readonly pages: PagesAskSettings } | null }): PagesAskSettings | null {
  return s.settings?.pages.enabled && s.settings.analysis.enabled ? s.settings.pages : null;
}

export const usePagesAskSettings = (): PagesAskSettings | null => useServerSettingsStore(selectPagesAsk);

/** A mention's name, as Claude reads it (nothing sent to Claude is translated). */
const labelIn =
  (s: LibraryState) =>
  (target: BlockTarget): string =>
    targetTitle(s, target) ?? '(deleted)';

/** The live sub-pages under a page, private ones aside: whether « avec les sous-pages » adds anything. */
export function askableSubPages(s: LibraryState, pageId: string): number {
  return subPages(s.blocks, s.blocksByParent, pageId).filter(id => s.blocks[id]?.deletedAt === null && !isPrivatePage(s.blocks, id)).length;
}

function thread(pageId: string): AskThread {
  const kept = usePagesAskStore.getState().threads[pageId];
  if (kept) return kept;
  const s = useLibraryStore.getState();
  return { scope: askableSubPages(s, pageId) > 0 ? 'tree' : 'page', web: false, turns: [] };
}

function update(pageId: string, change: (thread: AskThread) => AskThread): void {
  usePagesAskStore.setState(s => ({ threads: { ...s.threads, [pageId]: change(s.threads[pageId] ?? thread(pageId)) } }));
}

export function openPagesAsk(pageId: string): void {
  usePagesAskStore.setState(s => ({ open: pageId, focus: true, threads: s.threads[pageId] ? s.threads : { ...s.threads, [pageId]: thread(pageId) } }));
}

export function closePagesAsk(): void {
  usePagesAskStore.setState({ open: null });
}

export function setAskScope(pageId: string, scope: PageScope): void {
  update(pageId, current => ({ ...current, scope }));
}

export function setAskWeb(pageId: string, web: boolean): void {
  update(pageId, current => ({ ...current, web }));
}

/** A new conversation: what was asked is forgotten, the choices stay. */
export function clearAskThread(pageId: string): void {
  running.get(pageId)?.abort();
  running.delete(pageId);
  update(pageId, current => ({ ...current, turns: [] }));
}

/** The question being answered is dropped; it stays in the conversation as not answered. */
export function cancelAsk(pageId: string): void {
  running.get(pageId)?.abort();
  running.delete(pageId);
  update(pageId, current => ({ ...current, turns: current.turns.filter(turn => turn.answer !== null || turn.error !== null) }));
}

/** What a question in this scope would read now (the closest pages for « toutes les pages » are only known with the question). */
export function askPreview(s: LibraryState, pageId: string, scope: PageScope, settings: PagesAskSettings) {
  return askContext(s, pageId, scope === 'all' ? 'page' : scope, '', PAGES_REACH_CHARS[settings.reach], labelIn(s));
}

/** Asks Claude about the page, in its conversation's scope; the answer joins the conversation. */
export async function askPages(pageId: string, question: string): Promise<void> {
  const settings = selectPagesAsk(useServerSettingsStore.getState());
  const config = useSettingsStore.getState().server;
  const asked = question.trim().slice(0, PAGES_ASK_LIMITS.question);
  if (!asked) return;
  const current = thread(pageId);
  const id = ++turns;
  const s = useLibraryStore.getState();
  const scope = current.scope === 'all' && !settings?.everywhere ? 'page' : current.scope;
  const web = current.web && settings?.web === true;
  const context = settings ? askContext(s, pageId, scope, asked, PAGES_REACH_CHARS[settings.reach], labelIn(s)) : null;
  const history = current.turns
    .filter((turn): turn is AskTurn & { answer: PagesAskResponse } => turn.answer !== null)
    .slice(-PAGES_ASK_LIMITS.history)
    .map(turn => ({ question: turn.question, answer: answerText(turn.answer).slice(0, PAGES_ASK_LIMITS.turnAnswer) }));
  update(pageId, now => ({ ...now, turns: [...now.turns, { id, question: asked, scope, web, read: context?.pages.length ?? 0, cut: context?.cut ?? 0, answer: null, error: null }] }));
  const settle = (answer: PagesAskResponse | null, error: string | null): void => update(pageId, now => ({ ...now, turns: now.turns.map(turn => (turn.id === id ? { ...turn, answer, error } : turn)) }));
  if (!settings || !config || !context) {
    settle(null, !config ? t('Aucun serveur n’est connecté') : t('Les questions sur les pages sont désactivées dans l’administration'));
    return;
  }
  if (context.pages.length === 0) {
    settle(null, t('Ces pages sont gardées hors de Claude.'));
    return;
  }
  running.get(pageId)?.abort();
  const controller = new AbortController();
  running.set(pageId, controller);
  try {
    const answer = await askAboutPages(config, { scope, pages: context.pages, question: asked, history, web, lang: getLocale() }, controller.signal);
    if (!controller.signal.aborted) settle(answer, null);
  } catch (error) {
    if (!controller.signal.aborted) settle(null, error instanceof Error ? error.message : t('erreur inconnue'));
  } finally {
    if (running.get(pageId) === controller) running.delete(pageId);
  }
}

/** The question asked again, in place of its failed answer. */
export function retryAsk(pageId: string, turnId: number): void {
  const turn = thread(pageId).turns.find(each => each.id === turnId);
  if (!turn) return;
  update(pageId, now => ({ ...now, turns: now.turns.filter(each => each.id !== turnId) }));
  void askPages(pageId, turn.question);
}

/** The answer at the end of the page it was asked on: a toggle titled with the question. Its block's id, or null. */
export function addAnswerToPage(pageId: string, turn: AskTurn): string | null {
  if (!turn.answer) return null;
  const count = useLibraryStore.getState().blocksByParent[pageId]?.length ?? 0;
  const [id] = insertDrafts(pageId, [answerDraft(turn.question, turn.answer)], { parentId: pageId, index: count });
  return id ?? null;
}
