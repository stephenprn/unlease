/**
 * "Demander à Claude" on the pages (web): a conversation about a page, its sub-pages, or every page,
 * answered from them, each claim marked with the sources it rests on (a press opens the page at the
 * block). From 720px it docks beside the page and stays while the person follows a source; under
 * 720px it rises as the phone's bottom sheet, which a source closes (the conversation is kept).
 * Shown only when the Administration turns the questions on. The phone's `PageAskSheet`.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { answerCopy, answerLayout, askStarters, askTitle, askWords, citationNumbers, isPrivatePage, keptUnder, pagePath, quoteText } from '@unlease/notes/services/pagesAsk';
import { askCost, PAGES_ASK_LIMITS, type PageScope, type PagesAskResponse } from '@unlease/notes/sync/pagesAsk';
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
import { useLibraryStore } from '../../../app/store/library';
import { setPagePrivate } from '../../../app/store/pages';
import { selectServerSettings, useServerSettingsStore } from '../../../app/store/serverSettings';
import { showError, showSnack } from '../../../app/store/ui';
import { Button } from '../../components/Button';
import { SwitchMark } from '../../components/Checkbox';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { Layer } from '../../components/Layer';
import { OutlinedBox } from '../../components/Outline';
import { usePresence } from '../../components/presence';
import { Segmented } from '../../components/Segmented';
import { TextField } from '../../components/TextField';
import { formatUsd } from '../../money';
import { navigate, paths } from '../../router';
import { NARROW, useMedia } from '../../useMedia';
import { ReadingTrack } from '../links/ReadingTrack';
import styles from './ask.module.css';

const EMPTY: AskThread = { scope: 'page', web: false, turns: [] };

/** The page beside its conversation: the docked panel from 720px, the bottom sheet under. */
export function WithPageAsk({ children }: { children: ReactNode }) {
  const settings = usePagesAskSettings();
  const open = usePagesAskStore(s => s.open);
  const narrow = useMedia(NARROW);
  const exists = useLibraryStore(s => (open ? s.blocks[open]?.kind === 'page' && s.blocks[open]?.deletedAt === null : false));
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
  const library = useLibraryStore(s => s);
  const preview = useMemo(() => askPreview(library, pageId, scope, settings), [library, pageId, scope, settings]);
  const reach = PAGES_REACH_CHARS[settings.reach];
  const lines: string[] = [];
  if (scope === 'all') {
    lines.push(t('Claude lit les pages les plus proches de votre question, jusqu’à environ {words} mots ({cost} au plus).', { words: askWords(reach), cost: formatUsd(askCost(reach, model, web)) }));
  } else {
    const words = askWords(preview.chars);
    const cost = formatUsd(askCost(preview.chars, model, web));
    const others = preview.pages.length - 1;
    lines.push(
      scope === 'tree' && others > 0
        ? t('Claude lit cette page et {pages} : environ {words} mots ({cost} au plus).', { pages: plural(others, 'sous-page', 'sous-pages'), words, cost })
        : t('Claude lit cette page : environ {words} mots ({cost} au plus).', { words, cost }),
    );
    if (preview.cut > 0) lines.push(t('Trop long pour une seule question : {pages} de côté.', { pages: plural(preview.cut, 'page laissée', 'pages laissées') }));
  }
  const kept = scope === 'all' ? 0 : keptUnder(library, pageId);
  if (kept > 0) lines.push(t('{pages} hors de Claude.', { pages: plural(kept, 'page gardée', 'pages gardées') }));
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
  const title = useLibraryStore(s => askTitle(s.blocks[pageId]));
  const subCount = useLibraryStore(s => askableSubPages(s, pageId));
  const kept = useLibraryStore(s => isPrivatePage(s.blocks, pageId));
  const ownKept = useLibraryStore(s => s.blocks[pageId]?.private === true);
  const model = useServerSettingsStore(selectServerSettings)?.analysis.model ?? 'claude-opus-5-5';
  const [draft, setDraft] = useState('');
  const field = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const pending = thread.turns.some(turn => turn.answer === null && turn.error === null);
  const scope: PageScope = thread.scope === 'all' && !settings.everywhere ? 'page' : thread.scope === 'tree' && subCount === 0 ? 'page' : thread.scope;
  const web = thread.web && settings.web;

  const options = [
    { value: 'page' as const, label: t('Cette page') },
    ...(subCount > 0 ? [{ value: 'tree' as const, label: t('Sous-pages') }] : []),
    ...(settings.everywhere ? [{ value: 'all' as const, label: t('Toutes') }] : []),
  ];

  // The latest question and its answer kept in sight.
  const last = thread.turns[thread.turns.length - 1];
  useEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    end.current?.scrollIntoView?.({ block: 'end', behavior: still ? 'instant' : 'smooth' });
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
            {t('Demander à Claude')}
          </h2>
          <p className={`${styles.about} t-meta`}>{t('À propos de « {page} »', { page: title })}</p>
        </div>
        {thread.turns.length > 0 ? <IconButton icon="broom" label={t('Nouvelle conversation')} onClick={() => clearAskThread(pageId)} /> : null}
        {/* A sheet goes by its handle, its scrim or Back, as the other sheets. */}
        {sheet ? null : <IconButton icon="close" label={t('Fermer')} onClick={onClose} />}
      </div>

      {kept ? null : (
        <div className={styles.scope}>
          {options.length > 1 ? <Segmented<PageScope> label={t('Ce que Claude lit')} options={options} value={scope} onChange={next => setAskScope(pageId, next)} /> : null}
          <ScopeFacts pageId={pageId} scope={scope} settings={settings} model={model} web={web} />
        </div>
      )}

      <div className={styles.thread} aria-live="polite">
        {kept ? (
          <div className={styles.private}>
            <Icon name="eyeOff" size={24} />
            <p className="t-body">{ownKept ? t('Cette page est gardée hors de Claude : ni elle ni ses sous-pages ne lui sont envoyées.') : t('Une page au-dessus de celle-ci la garde hors de Claude : rien n’en est envoyé.')}</p>
            {ownKept ? (
              <Button kind="tonal" small icon="eye" onClick={() => setPagePrivate(pageId, false)}>
                {t('Montrer à Claude')}
              </Button>
            ) : null}
          </div>
        ) : thread.turns.length === 0 ? (
          <div className={styles.starters} role="group" aria-label={t('Questions pour commencer')}>
            <p className="t-meta">{t('Claude répond d’après vos pages et cite les passages.')}</p>
            {askStarters(scope).map(starter => (
              <Button key={starter} kind="text" small onClick={() => send(starter)}>
                {starter}
              </Button>
            ))}
          </div>
        ) : (
          thread.turns.map(turn => <Turn key={turn.id} pageId={pageId} turn={turn} onCite={cite} />)
        )}
        <div ref={end} />
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
              ariaLabel={t('Votre question')}
              value={draft}
              onChange={setDraft}
              multiline
              maxLength={PAGES_ASK_LIMITS.question}
              placeholder={thread.turns.length > 0 ? t('Une autre question…') : scope === 'page' ? t('Une question sur cette page') : t('Une question sur vos pages')}
              onKeyDown={onKeyDown}
              inputClassName={styles.composeInput}
            />
            <IconButton icon="arrowUp" label={t('Demander')} disabled={!draft.trim() || pending} onClick={() => send(draft)} />
          </div>
          {settings.web ? (
            <button type="button" role="switch" aria-checked={web} className={styles.choice} onClick={() => setAskWeb(pageId, !thread.web)}>
              <span className="t-meta">{t('Chercher aussi sur le web')}</span>
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
            {t('Claude n’a pas pu répondre : {reason}', { reason: t(turn.error) })}
          </p>
          <Button kind="text" small icon="refresh" onClick={() => retryAsk(pageId, turn.id)}>
            {t('Réessayer')}
          </Button>
        </div>
      ) : (
        <div className={styles.waiting} role="status">
          <ReadingTrack width={72} />
          <p className="t-meta">
            {turn.web ? t('Claude lit {pages} et cherche sur le web…', { pages: plural(turn.read, 'page', 'pages') }) : t('Claude lit {pages}…', { pages: plural(turn.read, 'page', 'pages') })}
          </p>
          <Button kind="text" small onClick={() => cancelAsk(pageId)}>
            {t('Annuler')}
          </Button>
        </div>
      )}
    </article>
  );
}

function Answer({ pageId, turn, answer, onCite }: { pageId: string; turn: AskTurn; answer: PagesAskResponse; onCite: (index: number) => void }) {
  const layout = useMemo(() => answerLayout(answer.parts), [answer]);
  const numbers = useMemo(() => [...citationNumbers(answer.parts)].sort((a, b) => a[1] - b[1]), [answer]);
  const blocks = useLibraryStore(s => s.blocks);
  const where = (id: string): string => (blocks[id] && blocks[id]!.deletedAt === null ? pagePath(blocks, id) : t('Page supprimée'));
  const mark = (index: number, cite: number, key: number) => (
    <button key={key} type="button" className={styles.cite} aria-label={t('Source {number} : {page}', { number: cite, page: where(answer.citations[index]?.pageId ?? '') })} onClick={() => onCite(index)}>
      {cite}
    </button>
  );
  const copy = (): void => {
    const text = answerCopy(answer, id => askTitle(blocks[id]));
    if (!navigator.clipboard) {
      showError(t('Impossible de copier la réponse'));
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => showSnack(t('Réponse copiée'), undefined, { tone: 'success' }),
      () => showError(t('Impossible de copier la réponse')),
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
        <ol className={styles.sources} aria-label={t('Sources dans vos pages')}>
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
        <ul className={styles.web} aria-label={t('Sources sur le web')}>
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
          {t('Copier')}
        </Button>
        <Button
          kind="text"
          small
          icon="pagePlus"
          onClick={() => {
            if (addAnswerToPage(pageId, turn)) showSnack(t('Réponse ajoutée à la fin de la page'), undefined, { tone: 'success' });
          }}
        >
          {t('Ajouter à la page')}
        </Button>
      </div>
    </>
  );
}
