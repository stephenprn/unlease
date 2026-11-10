/**
 * An event's description, typed: plain words where each mention reads `@Its name`, drawn on its
 * chip's wash behind the words (a twin of the field under it) and taken whole by Backspace or
 * Suppr. « @ » where a word starts opens the suite's mention menu by the caret (`MentionMenu`):
 * a person of Contacts, an event, a page of Pages, a note, a collection or a link of Carnet's,
 * found as the word after it grows; the arrows move, Entrée or Tab picks, Échap closes. What is typed
 * is kept as the suite's rich text (`{@contact=<id>}`).
 */
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';
import { dateWords } from '@unlease/core/services/dates';
import { closesAfter, mentionQueryAt } from '@unlease/core/services/mentionSearch';
import { normalizeRich, parseRich, serializeRich, type Run } from '@unlease/core/services/richText';

import { MentionMenu, useMenuKeys, type MenuRow } from '@shared/ui/components/MentionMenu';
import { textareaCaretRect } from '@shared/ui/components/textareaCaret';
import { mentionWords, useNamesRevision } from '../../app/names';
import styles from './description.module.css';
import { mentionHits, useMentionSections, type MentionCandidate } from './mentionRows';

/** A mention as it reads in the field, and the markup it stands for. */
interface Token {
  readonly shown: string;
  readonly run: Run;
}

const shownOf = (name: string): string => `@${name.replace(/\s+/g, ' ').trim()}`;

/** The field's text and the mentions in it, from stored markup. */
export function toTyped(markup: string): { readonly text: string; readonly tokens: readonly Token[] } {
  let text = '';
  const tokens: Token[] = [];
  for (const run of parseRich(markup)) {
    if (run.kind === 'text') text += run.text;
    else if (run.kind === 'mention') {
      const shown = shownOf(mentionWords(run.target));
      tokens.push({ shown, run });
      text += shown;
    } else {
      const shown = `@${dateWords(run)}`;
      tokens.push({ shown, run });
      text += shown;
    }
  }
  return { text, tokens };
}

/** Where each mention still written as it reads stands in the text, in order. */
function tokenSpans(text: string, tokens: readonly Token[]): { readonly start: number; readonly end: number; readonly token: Token }[] {
  const known = [...new Map(tokens.map(token => [token.shown, token])).values()].sort((a, b) => b.shown.length - a.shown.length);
  const spans: { start: number; end: number; token: Token }[] = [];
  let from = 0;
  while (from < text.length) {
    let first: { at: number; token: Token } | null = null;
    for (const token of known) {
      const at = text.indexOf(token.shown, from);
      if (at >= 0 && (first === null || at < first.at)) first = { at, token };
    }
    if (!first) break;
    spans.push({ start: first.at, end: first.at + first.token.shown.length, token: first.token });
    from = first.at + first.token.shown.length;
  }
  return spans;
}

/** Markup from the field's text: each mention still written as it reads goes back to its markup. */
export function fromTyped(text: string, tokens: readonly Token[]): string {
  const runs: Run[] = [];
  let at = 0;
  for (const span of tokenSpans(text, tokens)) {
    if (span.start > at) runs.push({ kind: 'text', text: text.slice(at, span.start), marks: {} });
    runs.push(span.token.run);
    at = span.end;
  }
  if (at < text.length) runs.push({ kind: 'text', text: text.slice(at), marks: {} });
  return serializeRich(normalizeRich(runs));
}

/**
 * An edit that takes away part of a mention takes all of it (Backspace after its name, a word
 * selected across it): the text and where the caret goes; the edit as it was when it touches none.
 */
function wholeMentions(before: string, after: string, spans: ReturnType<typeof tokenSpans>): { readonly text: string; readonly caret: number } | null {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let tail = 0;
  while (tail < before.length - start && tail < after.length - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  const removedEnd = before.length - tail;
  if (removedEnd <= start) return null;
  const inserted = after.slice(start, after.length - tail);
  let from = start;
  let to = removedEnd;
  for (const span of spans) {
    // Partly taken: the whole of it goes.
    if (span.start < removedEnd && span.end > start) {
      from = Math.min(from, span.start);
      to = Math.max(to, span.end);
    }
  }
  if (from === start && to === removedEnd) return null;
  return { text: `${before.slice(0, from)}${inserted}${before.slice(to)}`, caret: from + inserted.length };
}

/** The field's words drawn again under it, each mention on its wash (the field's own text stays on top). */
function Backdrop({ text, spans }: { text: string; spans: ReturnType<typeof tokenSpans> }) {
  const parts: ReactNode[] = [];
  let at = 0;
  spans.forEach((span, index) => {
    if (span.start > at) parts.push(text.slice(at, span.start));
    parts.push(
      <mark key={index} className={styles.token}>
        {text.slice(span.start, span.end)}
      </mark>,
    );
    at = span.end;
  });
  parts.push(`${text.slice(at)}​`);
  return parts;
}

const MENU_ID = 'description-mentions';

export function DescriptionField({ markup, onChange, except = null }: { markup: string; onChange: (markup: string) => void; except?: string | null }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const [{ text, tokens }, setState] = useState(() => toTyped(markup));
  /** The caret while the field holds it (collapsed), else null. */
  const [caret, setCaret] = useState<number | null>(null);
  // A mention named before its record arrived (a link Carnet just saved, « Indisponible ici ») takes
  // its name once the sync brings it; never under the caret, where it would move what is typed.
  const names = useNamesRevision();
  const [namedAt, setNamedAt] = useState(names);
  if (namedAt !== names && caret === null) {
    setNamedAt(names);
    const named = toTyped(fromTyped(text, tokens));
    if (named.text !== text) setState(named);
  }
  /** A « @ » whose menu Échap closed: it opens again only from another one. */
  const [declined, setDeclined] = useState<number | null>(null);
  const spans = useMemo(() => tokenSpans(text, tokens), [text, tokens]);
  const sections = useMentionSections(except);

  const query = useMemo(() => {
    if (caret === null) return null;
    const found = mentionQueryAt(text, caret);
    // The « @ » a mention's name starts with asks for nothing, nor one Échap closed.
    if (!found || found.at === declined || spans.some(span => found.at >= span.start && found.at < span.end)) return null;
    return found;
  }, [text, caret, declined, spans]);

  const change = (next: string, nextTokens: readonly Token[] = tokens): void => {
    setState({ text: next, tokens: nextTokens });
    onChange(fromTyped(next, nextTokens));
  };

  /** Where the caret goes once the field shows the text just set (before the next key is read). */
  const pending = useRef<number | null>(null);
  const putCaret = (position: number): void => {
    setCaret(position);
    pending.current = position;
  };
  useLayoutEffect(() => {
    const position = pending.current;
    const node = field.current;
    if (position === null || !node) return;
    pending.current = null;
    if (document.activeElement !== node) node.focus();
    node.setSelectionRange(position, position);
  }, [text]);

  const choose = (candidate: MentionCandidate): void => {
    if (!query || caret === null) return;
    const shown = shownOf(candidate.title);
    const rest = text.slice(caret);
    const space = rest.startsWith(' ') ? '' : ' ';
    const next = `${text.slice(0, query.at)}${shown}${space}${rest}`;
    change(next, [...tokens, { shown, run: { kind: 'mention', target: candidate.target } }]);
    putCaret(query.at + shown.length + 1);
  };

  const hits = useMemo(() => (query ? mentionHits(sections, query.query) : []), [query, sections]);
  const rows = useMemo<MenuRow[]>(
    () =>
      hits.map(({ section, candidate }) => ({
        key: `${candidate.target.type}:${candidate.target.id}`,
        section,
        label: candidate.title,
        detail: candidate.detail(),
        icon: candidate.icon,
        ...(candidate.emoji ? { emoji: candidate.emoji } : {}),
        pick: () => choose(candidate),
      })),
    // `choose` reads the latest text through the query: rebuilt with the hits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hits],
  );
  const open = query !== null && !closesAfter(query.query, rows.length);
  const keys = useMenuKeys(rows, () => setDeclined(query?.at ?? null));

  // The menu stands by the « @ » it answers, where it was when that « @ » was typed.
  const [anchor, setAnchor] = useState<{ readonly at: number; readonly rect: DOMRect } | null>(null);
  const at = open ? query.at : null;
  useLayoutEffect(() => {
    if (at === null || !field.current) return;
    if (anchor?.at !== at) setAnchor({ at, rect: textareaCaretRect(field.current, at) });
  }, [at, anchor?.at]);

  // As tall as what is typed (the stylesheet's limits), the twin under it keeping step.
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight + 2}px`;
    if (backdrop.current) backdrop.current.scrollTop = node.scrollTop;
  }, [text]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (!open) return;
    if (keys.take(event.key)) event.preventDefault();
  };

  const read = (node: HTMLTextAreaElement): void => setCaret(node.selectionStart === node.selectionEnd ? node.selectionStart : null);

  return (
    <div className={styles.field}>
      <div ref={backdrop} className={`${styles.backdrop} t-body`} aria-hidden="true">
        <Backdrop text={text} spans={spans} />
      </div>
      <textarea
        ref={field}
        className={`${styles.input} t-body`}
        value={text}
        rows={3}
        aria-label={t('Description')}
        placeholder={t('Ajouter une description. « @ » mentionne une personne, une page, une note…')}
        aria-autocomplete="list"
        aria-controls={open ? MENU_ID : undefined}
        aria-activedescendant={open && rows.length > 0 ? `${MENU_ID}-${keys.active}` : undefined}
        onChange={event => {
          const node = event.target;
          // The « @ » Échap closed gone, another one there opens the menu again.
          if (declined !== null && node.value[declined] !== '@') setDeclined(null);
          const whole = wholeMentions(text, node.value, spans);
          if (whole) {
            change(whole.text);
            putCaret(whole.caret);
            return;
          }
          change(node.value);
          read(node);
        }}
        onSelect={event => read(event.currentTarget)}
        onKeyDown={onKeyDown}
        onScroll={event => {
          if (backdrop.current) backdrop.current.scrollTop = event.currentTarget.scrollTop;
        }}
        onBlur={() => setCaret(null)}
        maxLength={50_000}
      />
      {open && anchor?.at === query.at ? (
        <MentionMenu
          anchor={anchor.rect}
          rows={rows}
          active={keys.active}
          onActive={keys.setActive}
          id={MENU_ID}
          label={t('Mentionner')}
          empty={query.query.trim() ? t('Rien ne s’appelle « {query} ».', { query: query.query.trim() }) : t('Rien à mentionner pour l’instant.')}
        />
      ) : null}
    </div>
  );
}
