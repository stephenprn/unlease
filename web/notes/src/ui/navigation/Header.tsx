/**
 * The top of the app, on the wall (the phone's BoardHeader): a field-coloured
 * search strip, one row high on every page so nothing beside it ever jumps
 * (the collection chips live on the board, `CollectionChips`). On a
 * phone-sized window the strip holds the menu, the board layout and the sync
 * dot, as on the phone; wider, those sit beside it with the space's own action:
 * "Classer un lien" among the notes, "Nouvelle page" among the pages (which
 * have no board layout to toggle).
 * There it heads the homes of the two spaces alone (the board, the pages'
 * home): elsewhere the shell draws the phone's top bar (`PageHead`). The sync state says itself in words whenever it is not fine.
 *
 * While notes are picked a matcha bar lies over the strip, the same size and
 * cut: nothing below moves.
 *
 * Searching on a phone-sized window, the strip is the phone's: a back arrow
 * where the menu was ("Fermer la recherche") and a full-size ×. Back ends a
 * selection, then a search, before it leaves the board.
 */
import { memo, useRef, useState, type AnimationEvent, type CSSProperties } from 'react';

import { APP_NAME } from '@unlease/notes/brand';
import { t, tx } from '@unlease/core/i18n';
import { formatRelative, plural } from '@unlease/core/services/format';
import { collectionsWithLinks } from '@unlease/notes/services/sorting';
import { INBOX_ID } from '@unlease/notes/models/entities';

import { clearSelection, resetBoard, selectQuery, selectSelection, setQuery, useBoardStore } from '../../app/store/board';
import { deleteForever, restoreNotes, setArchived, setLabelOn, setPinned, trashNotes } from '../../app/store/actions';
import { useLibraryStore } from '../../app/store/library';
import { selectLayout, setLayout, useSettingsStore } from '../../app/store/settings';
import { useSyncStore, type SyncPhase } from '../../app/store/syncStatus';
import { askDeleteLines, openCapture, setDrawerOpen, showSnack, showUndo } from '../../app/store/ui';
import { BrandMark } from '../components/BrandMark';
import { Confirm } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { LabelCheck } from '../components/LabelMark';
import { Popover } from '../components/Popover';
import { usePresence } from '../components/presence';
import { openNewPage } from '../features/pages/PageTree';
import { Link, navigate, paths, useBackCloses, type Arrival, type Route } from '../router';
import { NARROW, useMedia } from '../useMedia';
import styles from './shell.module.css';
import { useSpace } from './space';

/** The bar the page's content sits under, measured by the shell. */
export const APP_HEADER_ID = 'app-header';

/** The selection bar's fade (`--duration-short`), and a little longer for the fallback that lets it go. */
const SELECTION_FADE_MS = 200;

export function syncText(phase: SyncPhase, pending: number, lastSync: number | null, message: string | null, clock: string | null = null, now: number = Date.now()): string {
  switch (phase) {
    case 'local':
      return t('Pas de serveur : les notes restent dans ce navigateur.');
    case 'unauthorized':
      return t('Le serveur refuse le jeton. Vérifiez-le dans l’administration.');
    case 'offline':
      return pending > 0
        ? t('Hors ligne : {changes} en attente.', { changes: plural(pending, 'modification') })
        : message ? t('Hors ligne ({reason}).', { reason: t(message) }) : t('Hors ligne.');
    case 'syncing':
      return pending > 0 ? t('Envoi de {changes}…', { changes: plural(pending, 'modification') }) : t('Synchronisation…');
    default:
      return `${lastSync ? t('Synchronisé {when}.', { when: formatRelative(lastSync, now) }) : t('Synchronisé.')}${clock ? ` ${clock}` : ''}`;
  }
}

/** The phone's dot: green when everything is in, red when refused, faint alone, amber otherwise. */
const DOT_COLORS: Record<SyncPhase, string> = {
  synced: 'var(--ok)',
  syncing: 'var(--waiting)',
  offline: 'var(--waiting)',
  unauthorized: 'var(--danger)',
  local: 'var(--ink-faint)',
};

/** The state in a few words, beside the dot, when it needs saying: offline, or refused. Null when all is well (or local by choice). */
export function syncWords(phase: SyncPhase, pending: number): string | null {
  if (phase === 'unauthorized') return t('Jeton refusé');
  if (phase === 'offline') return pending > 0 ? t('Hors ligne · {count} en attente', { count: pending }) : t('Hors ligne');
  return null;
}

/**
 * The words to show, held through a retry: offline with changes waiting, each try passes through
 * `syncing`, and the words (and what they push aside) must not blink on every one.
 */
function useSyncWords(): { readonly phase: SyncPhase; readonly words: string | null } {
  const { phase, pending } = useSyncStore();
  const [held, setHeld] = useState<{ readonly phase: SyncPhase; readonly words: string } | null>(null);
  const words = syncWords(phase, pending);
  const next = words ? { phase, words } : phase === 'syncing' ? held : null;
  if (next?.words !== held?.words || next?.phase !== held?.phase) setHeld(next);
  return next ?? { phase, words: null };
}

export const SyncDot = memo(function SyncDot({ words = false }: { words?: boolean }) {
  const { phase, pending, lastSyncAt, message, clock } = useSyncStore();
  const text = syncText(phase, pending, lastSyncAt, message, clock);
  const shown = useSyncWords();
  const said = words ? shown.words : null;
  return (
    <button
      type="button"
      className={styles.dotButton}
      data-words={said ? shown.phase : undefined}
      aria-label={text}
      data-tip={text}
      onClick={() =>
        phase === 'synced' || phase === 'syncing' ? showSnack(text) : showSnack(text, { label: t('Serveur'), run: () => navigate(`${paths.admin}#server`) }, { tone: phase === 'offline' ? 'warning' : 'error' })
      }
    >
      <span className={styles.dot} data-phase={phase} style={{ '--dot': DOT_COLORS[phase] } as CSSProperties} />
      {said ? <span className={styles.dotWords}>{said}</span> : null}
    </button>
  );
});

/** On a phone-sized window the strip has no room for words: they sit under it, on the board, while they matter. */
export function SyncNotice() {
  const { phase, words: said } = useSyncWords();
  if (!said) return null;
  return (
    <button type="button" className={styles.syncNotice} data-phase={phase} onClick={() => navigate(`${paths.admin}#server`)}>
      <span className={styles.dot} data-phase={phase} style={{ '--dot': DOT_COLORS[phase] } as CSSProperties} />
      <span>{phase === 'unauthorized' ? t('Le serveur refuse le jeton') : said}</span>
      <span className={styles.syncNoticeAction}>{t('Serveur')}</span>
    </button>
  );
}

/** The search reads the whole library (every note and every page), whatever the view: the placeholder says so. */
const SEARCH_PLACEHOLDER = tx('Rechercher notes et pages');

export interface HeaderProps {
  /** The page on screen (under any overlay). */
  readonly route: Route;
  /** How the page came on screen: on a phone-sized window the header is the board's own, and arrives with it. */
  readonly enter?: Arrival | null;
}

/** The search field's id: "/" focuses it from anywhere. */
export const SEARCH_INPUT_ID = 'search';

/** The phone's "Fermer la recherche": the text goes, and the keyboard with it. */
function endSearch(): void {
  setQuery('');
  document.getElementById(SEARCH_INPUT_ID)?.blur();
}

function LayoutToggle() {
  const layout = useSettingsStore(selectLayout);
  return (
    <IconButton
      icon={layout === 'wall' ? 'rows' : 'grid'}
      label={layout === 'wall' ? t('Afficher en liste') : t('Afficher en mur')}
      shape={1}
      onClick={() => setLayout(layout === 'wall' ? 'list' : 'wall')}
    />
  );
}

/** The field strip: the menu (until the navigation docks; on a phone, Back while searching), the field, and on a phone the layout and the dot. Out of reach while the selection bar lies over it. */
function SearchStrip({ route, narrow, covered }: { route: Route; narrow: boolean; covered: boolean }) {
  const query = useBoardStore(selectQuery);
  const onBoard = route.name === 'board' && route.view !== 'trash';
  // The phone's search mode: Back where the menu was, a full-size × at the end.
  const searchMode = narrow && query.length > 0;
  return (
    <div className={styles.search} inert={covered}>
      {searchMode ? (
        <IconButton icon="back" label={t('Fermer la recherche')} onClick={endSearch} />
      ) : (
        <IconButton icon="menu" label={t('Menu')} className={styles.menuButton} onClick={() => setDrawerOpen(true)} />
      )}
      <div className={styles.searchField} role="search">
        <span className={styles.searchGlyph}>
          <Icon name="search" size={22} />
        </span>
        <input
          id={SEARCH_INPUT_ID}
          type="search"
          className={styles.searchInput}
          value={query}
          placeholder={t(SEARCH_PLACEHOLDER)}
          aria-label={t('Rechercher')}
          autoComplete="off"
          spellCheck={false}
          onChange={event => {
            setQuery(event.target.value);
            // Results live on the board: searching from elsewhere goes there.
            if (!onBoard) navigate('/');
          }}
          onKeyDown={event => {
            if (event.key === 'Escape' && query) {
              event.preventDefault();
              setQuery('');
            } else if (event.key === 'Escape') {
              event.currentTarget.blur();
            }
          }}
        />
        {searchMode ? (
          <IconButton icon="close" label={t('Effacer la recherche')} onClick={() => setQuery('')} />
        ) : query ? (
          <IconButton icon="close" label={t('Effacer la recherche')} compact size={18} onClick={() => setQuery('')} />
        ) : narrow ? null : (
          <kbd className={styles.searchKey} aria-hidden="true">
            /
          </kbd>
        )}
      </div>
      {narrow && !query ? (
        <>
          {route.name === 'board' ? <LayoutToggle /> : null}
          <SyncDot />
        </>
      ) : null}
    </div>
  );
}

/** The picked notes' labels: each tag is its checkbox, ticked when every picked note wears it; a press puts it on all, or takes it off all. */
function BulkLabels({ ids }: { ids: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const order = useLibraryStore(s => s.labelOrder);
  const labels = useLibraryStore(s => s.labels);
  const notes = useLibraryStore(s => s.notes);
  const live = order.map(id => labels[id]).filter(label => !!label && label.deletedAt === null);
  return (
    <>
      <IconButton ref={anchor} icon="tag" label={t('Labels')} shape={2} onClick={() => setOpen(true)} />
      <Popover open={open} anchor={anchor} onDismiss={() => setOpen(false)} label={t('Labels des notes sélectionnées')} align="end" className={styles.bulkLabels}>
        {live.length === 0 ? (
          <p className={`${styles.bulkEmpty} t-meta`}>{t('Aucun label. Créez-en depuis la page Labels.')}</p>
        ) : (
          <ul className={styles.bulkList}>
            {live.map(label => {
              const wearing = ids.filter(id => notes[id]?.labelIds.includes(label!.id)).length;
              const all = wearing === ids.length && ids.length > 0;
              return (
                <li key={label!.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={all ? true : wearing > 0 ? 'mixed' : false}
                    className={styles.bulkRow}
                    onClick={() => {
                      const undo = setLabelOn(ids, label!.id, !all);
                      showUndo(all ? t('« {name} » retiré', { name: label!.name }) : t('« {name} » ajouté', { name: label!.name }), undo);
                    }}
                  >
                    <LabelCheck color={label!.color} checked={all} size={22} />
                    <span className={styles.bulkName}>{label!.name}</span>
                    {wearing > 0 && !all ? <span className={`${styles.bulkSome} t-meta`}>{t('{count} sur {total}', { count: wearing, total: ids.length })}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Popover>
    </>
  );
}

interface SelectionBarProps {
  readonly route: Route;
  /** The selection is over: the bar fades off the strip, then `onGone`. */
  readonly closing: boolean;
  readonly onGone: () => void;
  readonly onDeleteForever: () => void;
}

function SelectionBar({ route, closing, onGone, onDeleteForever }: SelectionBarProps) {
  const live = useBoardStore(selectSelection);
  const notes = useLibraryStore(s => s.notes);
  const livePinned = live.size > 0 && [...live].every(id => notes[id]?.pinned ?? true);
  // Fading out, it keeps showing what was picked rather than "0", and the pin it offered rather than the one just done.
  const [held, setHeld] = useState({ selection: live, allPinned: livePinned });
  if (live.size > 0 && (live !== held.selection || livePinned !== held.allPinned)) setHeld({ selection: live, allPinned: livePinned });
  const selection = live.size > 0 ? live : held.selection;
  const selected = [...selection].filter(id => notes[id]);
  const inTrash = route.name === 'board' && route.view === 'trash';
  const inArchive = route.name === 'board' && route.view === 'archive';
  const allPinned = selected.length > 0 && (live.size > 0 ? livePinned : held.allPinned);
  const done = (undo: () => void, message: string) => {
    clearSelection();
    showUndo(message, undo);
  };
  const count = selected.length;
  const gone = (event: AnimationEvent<HTMLDivElement>): void => {
    if (closing && event.target === event.currentTarget) onGone();
  };
  return (
    <div className={styles.selectionBar} role="toolbar" aria-label={t('Notes sélectionnées')} data-closing={closing || undefined} inert={closing} onAnimationEnd={gone}>
      <IconButton icon="close" label={t('Annuler la sélection')} onClick={clearSelection} shortcut={t('Échap')} />
      <p className={`${styles.selectionCount} t-title`} aria-live="polite">
        {plural(count, 'sélectionnée', 'sélectionnées')}
      </p>
      {inTrash ? (
        <>
          <IconButton icon="restore" label={t('Restaurer')} shape={1} onClick={() => done(restoreNotes(selected), count > 1 ? t('Notes restaurées') : t('Note restaurée'))} />
          <IconButton icon="trash" label={t('Supprimer définitivement')} shape={2} onClick={onDeleteForever} />
        </>
      ) : (
        <>
          <IconButton
            icon={allPinned ? 'pinOff' : 'pin'}
            label={allPinned ? t('Retirer des épinglées') : t('Épingler')}
            shape={1}
            onClick={() => {
              const undos = selected.map(id => setPinned(id, !allPinned));
              done(() => undos.forEach(undo => undo()), allPinned ? (count > 1 ? t('Retirées des épinglées') : t('Retirée des épinglées')) : count > 1 ? t('Notes épinglées') : t('Note épinglée'));
            }}
          />
          <BulkLabels ids={selected} />
          <IconButton
            icon={inArchive ? 'unarchive' : 'archive'}
            label={inArchive ? t('Désarchiver') : t('Archiver')}
            shape={2}
            shortcut="E"
            onClick={() => {
              const undos = selected.map(id => setArchived(id, !inArchive));
              done(() => undos.forEach(undo => undo()), inArchive ? (count > 1 ? t('Notes désarchivées') : t('Note désarchivée')) : count > 1 ? t('Notes archivées') : t('Note archivée'));
            }}
          />
          <IconButton
            icon="trash"
            label={t('Supprimer')}
            shortcut="#"
            onClick={() => {
              // Collections holding links ask where those go first; "Non classé" never goes to the bin.
              if (collectionsWithLinks(selected, notes, useLibraryStore.getState().linksByNote).length > 0) askDeleteLines(selected.filter(id => id !== INBOX_ID));
              else done(trashNotes(selected), count > 1 ? t('Notes placées dans la corbeille') : t('Note placée dans la corbeille'));
            }}
          />
        </>
      )}
    </div>
  );
}

function HeaderComponent({ route, enter = null }: HeaderProps) {
  const query = useBoardStore(selectQuery);
  const selecting = useBoardStore(s => s.selection.size > 0);
  const narrow = useMedia(NARROW);
  const space = useSpace(route);
  const selectionBar = usePresence(selecting, SELECTION_FADE_MS);
  // Back clears a selection, then ends a search, before it leaves the board.
  useBackCloses(selecting, clearSelection);
  useBackCloses(query.length > 0 && route.name === 'board', endSearch);
  // As it was when it came: on a phone-sized window it comes with the board, and stays while the board's views change in place.
  const [arrival] = useState(enter);
  // Here rather than on the bar, so the dialog plays its exit after the bar has gone.
  const [confirmForever, setConfirmForever] = useState(false);
  return (
    <header className={styles.header} id={APP_HEADER_ID} data-enter={arrival ?? undefined}>
      <div className={styles.headerRow}>
        <Link to="/" className={styles.brand} ariaLabel={t('{app}, tableau', { app: APP_NAME })} onNavigate={resetBoard}>
          <span className={styles.brandMark}>
            <BrandMark size={34} />
          </span>
          <span>{APP_NAME}</span>
        </Link>
        <div className={styles.bar}>
          <div className={styles.strip}>
            <SearchStrip route={route} narrow={narrow} covered={selecting} />
            {selectionBar.present ? (
              <SelectionBar route={route} closing={selectionBar.closing} onGone={selectionBar.done} onDeleteForever={() => setConfirmForever(true)} />
            ) : null}
          </div>
          {narrow ? null : (
            <div className={styles.actions}>
              {space === 'pages' ? (
                // The pages' home has its own "Nouvelle page" in its head.
                route.name === 'pages' ? null : (
                  <button type="button" className={`${styles.classify} paper`} onClick={() => openNewPage(null)} aria-label={t('Nouvelle page')} data-tip={t('Nouvelle page (P)')}>
                    <Icon name="pagePlus" size={20} />
                    <span className={styles.classifyLabel}>{t('Nouvelle page')}</span>
                  </button>
                )
              ) : (
                <>
                  <button type="button" className={`${styles.classify} paper`} onClick={() => openCapture('')} aria-label={t('Classer un lien')} data-tip={t('Classer un lien (K)')}>
                    <Icon name="link" size={20} />
                    <span className={styles.classifyLabel}>{t('Classer un lien')}</span>
                  </button>
                  <LayoutToggle />
                </>
              )}
              <SyncDot words />
            </div>
          )}
        </div>
      </div>
      <Confirm
        open={confirmForever}
        title={t('Supprimer définitivement ?')}
        message={t('Ces notes disparaîtront de tous vos appareils. Cette action est irréversible.')}
        confirmLabel={t('Supprimer')}
        danger
        onCancel={() => setConfirmForever(false)}
        onConfirm={() => {
          setConfirmForever(false);
          const notes = useLibraryStore.getState().notes;
          // Only what is in the bin is ever erased from here.
          const selected = [...useBoardStore.getState().selection].filter(id => notes[id] && notes[id]!.trashedAt !== null);
          deleteForever(selected);
          clearSelection();
          showSnack(selected.length > 1 ? t('{count} supprimées définitivement', { count: plural(selected.length, 'note') }) : t('{count} supprimée définitivement', { count: plural(selected.length, 'note') }), undefined, { tone: 'success' });
        }}
      />
    </header>
  );
}

export const Header = memo(HeaderComponent);
