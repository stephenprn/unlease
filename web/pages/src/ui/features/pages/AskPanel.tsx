/**
 * "Demander à Claude" on the pages (web): a conversation about a page, its sub-pages, or every page,
 * answered from them, each claim marked with the sources it rests on (a press opens the page at the
 * block). From 720px it docks beside the page and stays while the person follows a source; under
 * 720px it rises as the phone's bottom sheet, which a source closes (the conversation is kept).
 * Shown only when the Administration turns the questions on. The phone's `PageAskSheet`.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { t, tc } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { answerCopy, answerLayout, askStarters, askTitle, askWords, citationNumbers, isPrivatePage, keptUnder, pagePath, quoteText } from '@unlease/pages/services/pagesAsk';
import { askCost, PAGES_ASK_LIMITS, type PageScope, type PagesAskResponse } from '@unlease/pages/sync/pagesAsk';
import { PAGES_REACH_CHARS, type ClaudeModel, type PagesAskSettings } from '@unlease/core/sync/settings';

import {
  addAnswerToPage,
  askableSubPages,
  askPages,
  askPreview,
  cancelAsk,
  clearAskThread,
  closePagesAsk,
  retryAsk,
  setAskScope,
  setAskWeb,
  usePagesAskSettings,
  usePagesAskStore,
  type AskThread,
  type AskTurn,
} from '../../../app/pagesAsk';
import { usePagesLibrary, useWholePagesLibrary } from '../../../app/store/blocks';
import { setPagePrivate } from '../../../app/store/pages';
import { selectServerSettings, useServerSettingsStore } from '@shared/app/store/serverSettings';
import { showError, showSnack } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { SwitchMark } from '@shared/ui/components/Checkbox';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { Layer } from '@shared/ui/components/Layer';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { usePresence } from '@shared/ui/components/presence';
import { useScrollEdgesOn } from '@shared/ui/components/scrollEdges';
import { Segmented } from '@shared/ui/components/Segmented';
import { TextField } from '@shared/ui/components/TextField';
import { formatUsd } from '@shared/ui/money';
import { navigate } from '@shared/ui/router';
import { paths } from '../../routes';
import { NARROW, useMedia } from '@shared/ui/useMedia';
import { ReadingTrack } from '@notes/ui/features/links/ReadingTrack';
import styles from './ask.module.css';

const EMPTY: AskThread = { scope: 'page', web: false, turns: [] };

/** The page beside its conversation: the docked panel from 720px, the bottom sheet under. */
export function WithPageAsk({ children }: { children: ReactNode }) {
  const settings = usePagesAskSettings();
  const open = usePagesAskStore(s => s.open);
  const narrow = useMedia(NARROW);
  const exists = usePagesLibrary(s => (open ? s.blocks[open]?.kind === 'page' && s.blocks[open]?.deletedAt === null : false));
  const shown = settings !== null && open !== null && exists;
  // The Administration turned the questions off, or the page is gone: the conversation closes.
  useEffect(() => {
    if (open !== null && (!settings || !exists)) closePagesAsk();
  }, [open, settings, exists]);
  const docked = usePresence(shown && !narrow, 150);
  return (
    <>
      <div className={styles.withAsk} data-asking={docked.present || undefined}>
        <div>{children}</div>
        {docked.present && settings && open ? <AskDock pageId={open} settings={settings} closing={docked.closing} /> : null}
      </div>
      {narrow ? <AskSheet open={shown} pageId={open} settings={settings} /> : null}
    </>
  );
}

function AskDock({ pageId, settings, closing }: { pageId: string; settings: PagesAskSettings; closing: boolean }) {
  const titleId = useId();
  // Escape, or the close button: focus goes back where it was when the panel opened.
  const opener = useRef<Element | null>(null);
  useLayoutEffect(() => {
    opener.current = document.activeElement;
  }, []);
  const close = (): void => {
    closePagesAsk();
    if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
  };
  return (
    <aside
      className={styles.dock}
      data-closing={closing || undefined}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={event => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          close();
        }
      }}
    >
      <OutlinedBox kind="panel" lift="float" className={styles.panel} liftClassName={styles.dockLift}>
        <AskBody pageId={pageId} settings={settings} titleId={titleId} onClose={close} sheet={false} />
      </OutlinedBox>
    </aside>
  );
}

function AskSheet({ open, pageId, settings }: { open: boolean; pageId: string | null; settings: PagesAskSettings | null }) {
  const titleId = useId();
  // The host stays mounted so the sheet plays its exit.
  return (
    <Layer open={open} onDismiss={closePagesAsk} kind="bottom" labelledBy={titleId}>
      {pageId && settings ? (
        <div className={styles.sheetBody}>
          <AskBody pageId={pageId} settings={settings} titleId={titleId} onClose={closePagesAsk} sheet />
        </div>
      ) : null}
    </Layer>
  );
}

/** What a question in the chosen scope reads, said under the scope. */
function ScopeFacts({ pageId, scope, settings, model, web }: { pageId: string; scope: PageScope; settings: PagesAskSettings; model: ClaudeModel; web: boolean }) {
  // Read again as the library changes.
  const library = useWholePagesLibrary();
  const preview = useMemo(() => askPreview(library, pageId, scope, settings), [library, pageId, scope, settings]);
  const reach = PAGES_REACH_CHARS[settings.reach];
  const lines: string[] = [];
  if (scope === 'all') {
    lines.push(t('Claude reads the pages closest to your question, up to about {words} words ({cost} at most).', { words: askWords(reach), cost: formatUsd(askCost(reach, model, web)) }));
  } else {
    const words = askWords(preview.chars);
    const cost = formatUsd(askCost(preview.chars, model, web));
    const others = preview.pages.length - 1;
    lines.push(
      scope === 'tree' && others > 0
        ? t('Claude reads this page and {pages}: about {words} words ({cost} at most).', { pages: plural(others, 'sub-page', 'sub-pages'), words, cost })
        : t('Claude reads this page: about {words} words ({cost} at most).', { words, cost }),
    );
    if (preview.cut > 0) lines.push(t('Too long for one question: {pages} out.', { pages: plural(preview.cut, 'page left', 'pages left') }));
  }
  const kept = scope === 'all' ? 0 : keptUnder(library, pageId);
  if (kept > 0) lines.push(t('{pages} away from Claude.', { pages: plural(kept, 'page kept', 'pages kept') }));
  return (
    <>
      {lines.map(line => (
        <p key={line} className="t-meta">
          {line}
        </p>
      ))}
    </>
  );
}

function AskBody({ pageId, settings, titleId, onClose, sheet }: { pageId: string; settings: PagesAskSettings; titleId: string; onClose: () => void; sheet: boolean }) {
  const thread = usePagesAskStore(s => s.threads[pageId]) ?? EMPTY;
  const title = usePagesLibrary(s => askTitle(s.blocks[pageId]));
  const subCount = usePagesLibrary(s => askableSubPages(s, pageId));
  const kept = usePagesLibrary(s => isPrivatePage(s.blocks, pageId));
  const ownKept = usePagesLibrary(s => s.blocks[pageId]?.private === true);
  const model = useServerSettingsStore(selectServerSettings)?.analysis.model ?? 'claude-opus-5-5';
  const [draft, setDraft] = useState('');
  const field = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  // The conversation fades and blurs under the scope and the question being written, as far as it runs on.
  useScrollEdgesOn(conversation, [], { top: true, bottom: true });
  const pending = thread.turns.some(turn => turn.answer === null && turn.error === null);
  const scope: PageScope = thread.scope === 'all' && !settings.everywhere ? 'page' : thread.scope === 'tree' && subCount === 0 ? 'page' : thread.scope;
  const web = thread.web && settings.web;

  const options = [
    { value: 'page' as const, label: t('This page') },
    ...(subCount > 0 ? [{ value: 'tree' as const, label: t('Sub-pages') }] : []),
    ...(settings.everywhere ? [{ value: 'all' as const, label: tc('pages', 'All') }] : []),
  ];

  // The latest question and its answer kept in sight: the conversation scrolls, never the window (`scrollIntoView`
  // would scroll the page too, the docked panel being sticky in it).
  const last = thread.turns[thread.turns.length - 1];
  useEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const box = conversation.current;
    box?.scrollTo?.({ top: box.scrollHeight, behavior: still ? 'instant' : 'smooth' });
  }, [thread.turns.length, last?.answer, last?.error]);

  // The field grows with what is typed (Firefox has no `field-sizing`).
  useLayoutEffect(() => {
    const element = field.current;
    if (!(element instanceof HTMLTextAreaElement)) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [draft]);

  // Opened: the question field takes the focus (once; a source's page drawing the panel again leaves it where it is).
  const focus = usePagesAskStore(s => s.focus === true);
  useEffect(() => {
    if (!focus) return;
    usePagesAskStore.setState({ focus: false });
    if (!sheet && !kept) field.current?.focus({ preventScroll: true });
  }, [focus, sheet, kept]);

  const send = (question: string): void => {
    const asked = question.trim();
    if (!asked || pending) return;
    setDraft('');
    void askPages(pageId, asked);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(draft);
    }
  };
  const cite = (answer: PagesAskResponse, index: number): void => {
    const citation = answer.citations[index];
    if (!citation) return;
    if (sheet) onClose();
    const block = citation.blockIds[0];
    navigate(`${paths.page(citation.pageId)}${block ? `#block-${encodeURIComponent(block)}` : ''}`);
  };

  return (
    <>
      <div className={styles.head}>
        <Icon name="sparkle" size={20} />
        <div className={styles.headText}>
          <h2 id={titleId} className="t-title">
            {t('Ask Claude')}
          </h2>
          <p className={`${styles.about} t-meta`}>{t('About “{page}”', { page: title })}</p>
        </div>
        {thread.turns.length > 0 ? <IconButton icon="broom" label={t('New conversation')} onClick={() => clearAskThread(pageId)} /> : null}
        {/* A sheet goes by its handle, its scrim or Back, as the other sheets. */}
        {sheet ? null : <IconButton icon="close" label={t('Close')} onClick={onClose} />}
      </div>

      {kept ? null : (
        <div className={styles.scope}>
          {options.length > 1 ? <Segmented<PageScope> label={t('What Claude reads')} options={options} value={scope} onChange={next => setAskScope(pageId, next)} /> : null}
          <ScopeFacts pageId={pageId} scope={scope} settings={settings} model={model} web={web} />
        </div>
      )}

      <div ref={conversation} className={styles.thread} aria-live="polite">
        {kept ? (
          <div className={styles.private}>
            <Icon name="eyeOff" size={24} />
            <p className="t-body">{ownKept ? t('This page is kept away from Claude: neither it nor its sub-pages are sent.') : t('A page above this one keeps it away from Claude: nothing of it is sent.')}</p>
            {ownKept ? (
              <Button kind="tonal" small icon="eye" onClick={() => setPagePrivate(pageId, false)}>
                {t('Show to Claude')}
              </Button>
            ) : null}
          </div>
        ) : thread.turns.length === 0 ? (
          <div className={styles.starters} role="group" aria-label={t('Questions to start with')}>
            <p className="t-meta">{t('Claude answers from your pages and cites the passages.')}</p>
            {askStarters(scope).map(starter => (
              <Button key={starter} kind="text" small onClick={() => send(starter)}>
                {starter}
              </Button>
            ))}
          </div>
        ) : (
          thread.turns.map(turn => <Turn key={turn.id} pageId={pageId} turn={turn} onCite={cite} />)
        )}
        {/* Room under the last turn, a gap's worth. */}
        <div />
      </div>

      {kept ? null : (
        <form
          className={styles.composer}
          onSubmit={event => {
            event.preventDefault();
            send(draft);
          }}
        >
          <div className={styles.composeRow}>
            <TextField
              ref={field}
              ariaLabel={t('Your question')}
              kind="prose"
              enterKeyHint="send"
              value={draft}
              onChange={setDraft}
              multiline
              maxLength={PAGES_ASK_LIMITS.question}
              placeholder={thread.turns.length > 0 ? t('Another question…') : scope === 'page' ? t('A question about this page') : t('A question about your pages')}
              onKeyDown={onKeyDown}
              inputClassName={styles.composeInput}
            />
            <IconButton icon="arrowUp" label={t('Ask')} disabled={!draft.trim() || pending} onClick={() => send(draft)} />
          </div>
          {settings.web ? (
            <button type="button" role="switch" aria-checked={web} className={styles.choice} onClick={() => setAskWeb(pageId, !thread.web)}>
              <span className="t-meta">{t('Search the web too')}</span>
              <SwitchMark checked={web} />
            </button>
          ) : null}
        </form>
      )}
    </>
  );
}

function Turn({ pageId, turn, onCite }: { pageId: string; turn: AskTurn; onCite: (answer: PagesAskResponse, index: number) => void }) {
  return (
    <article className={styles.turn}>
      <p className={`${styles.question} t-body`}>{turn.question}</p>
      {turn.answer ? (
        <Answer pageId={pageId} turn={turn} answer={turn.answer} onCite={index => onCite(turn.answer!, index)} />
      ) : turn.error !== null ? (
        <div className={styles.failed}>
          <p className="t-body" role="alert">
            {t('Claude could not answer: {reason}', { reason: t(turn.error) })}
          </p>
          <Button kind="text" small icon="refresh" onClick={() => retryAsk(pageId, turn.id)}>
            {t('Try again')}
          </Button>
        </div>
      ) : (
        <div className={styles.waiting} role="status">
          <ReadingTrack width={72} />
          <p className="t-meta">
            {turn.web ? t('Claude is reading {pages} and searching the web…', { pages: plural(turn.read, 'page', 'pages') }) : t('Claude is reading {pages}…', { pages: plural(turn.read, 'page', 'pages') })}
          </p>
          <Button kind="text" small onClick={() => cancelAsk(pageId)}>
            {t('Cancel')}
          </Button>
        </div>
      )}
    </article>
  );
}

function Answer({ pageId, turn, answer, onCite }: { pageId: string; turn: AskTurn; answer: PagesAskResponse; onCite: (index: number) => void }) {
  const layout = useMemo(() => answerLayout(answer.parts), [answer]);
  const numbers = useMemo(() => [...citationNumbers(answer.parts)].sort((a, b) => a[1] - b[1]), [answer]);
  const blocks = usePagesLibrary(s => s.blocks);
  const where = (id: string): string => (blocks[id] && blocks[id]!.deletedAt === null ? pagePath(blocks, id) : t('Deleted page'));
  const mark = (index: number, cite: number, key: number) => (
    <button key={key} type="button" className={styles.cite} aria-label={t('Source {number}: {page}', { number: cite, page: where(answer.citations[index]?.pageId ?? '') })} onClick={() => onCite(index)}>
      {cite}
    </button>
  );
  const copy = (): void => {
    const text = answerCopy(answer, id => askTitle(blocks[id]));
    if (!navigator.clipboard) {
      showError(t('Couldn’t copy the answer'));
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => showSnack(t('Answer copied'), undefined, { tone: 'success' }),
      () => showError(t('Couldn’t copy the answer')),
    );
  };
  return (
    <>
      <div className={styles.answer}>
        {layout.map((runs, at) => (
          <div key={at} className={styles.paragraph}>
            {runs.map((run, row) =>
              run.list ? (
                <ul key={row}>
                  {run.lines.map((line, item) => (
                    <li key={item} className="t-body">
                      {line.map((segment, part) => ('text' in segment ? segment.text : mark(segment.index, segment.cite, part)))}
                    </li>
                  ))}
                </ul>
              ) : (
                <p key={row} className="t-body">
                  {run.lines[0]!.map((segment, part) => ('text' in segment ? segment.text : mark(segment.index, segment.cite, part)))}
                </p>
              ),
            )}
          </div>
        ))}
      </div>
      {numbers.length > 0 ? (
        <ol className={styles.sources} aria-label={t('Sources in your pages')}>
          {numbers.map(([index, cite]) => {
            const citation = answer.citations[index]!;
            return (
              <li key={index}>
                <button type="button" className={styles.source} onClick={() => onCite(index)}>
                  <span className={styles.cite} aria-hidden="true">
                    {cite}
                  </span>
                  <span className={`${styles.sourcePage} t-meta-strong`}>{where(citation.pageId)}</span>
                  {citation.quote ? <span className={`${styles.sourceQuote} t-meta`}>« {quoteText(citation.quote)} »</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
      {answer.sources.length > 0 ? (
        <ul className={styles.web} aria-label={t('Sources on the web')}>
          {answer.sources.map(source => (
            <li key={source.url} className="t-meta">
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.actions}>
        <Button kind="text" small icon="copy" onClick={copy}>
          {t('Copy')}
        </Button>
        <Button
          kind="text"
          small
          icon="pagePlus"
          onClick={() => {
            if (addAnswerToPage(pageId, turn)) showSnack(t('Answer added at the end of the page'), undefined, { tone: 'success' });
          }}
        >
          {t('Add to the page')}
        </Button>
      </div>
    </>
  );
}
