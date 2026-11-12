/**
 * The top of the app, on the wall (the phone's BoardHeader): the brand (the app's mark and its
 * name, a link to its home), a field-coloured search strip, one row high on every page so nothing
 * beside it ever jumps. On a phone-sized window the strip holds the menu, the app's tools (the
 * board's layout) and the sync dot, as on the phone; wider, those sit beside it with the app's own
 * actions ("Classer un lien" in Carnet, "Nouvelle page" in Pages), and at the far end the launcher,
 * the suite's apps and the Administration (as Google's; on a phone-sized window, in the drawer).
 * There it heads the app's home alone (the board, the pages' home): elsewhere the shell draws the
 * phone's top bar (`PageHead`). The sync state says itself in words whenever it is not fine.
 *
 * An app may lay a bar over the strip, the same size and cut (Carnet's picked notes): nothing
 * below moves.
 *
 * Searching on a phone-sized window, the strip is the phone's: a back arrow where the menu was
 * ("Fermer la recherche") and a full-size ×. Back ends a search before it leaves the home.
 */
import { memo, useState, type CSSProperties } from 'react';

import { APP_WORDS } from '@unlease/core/appWords';
import { t } from '@unlease/core/i18n';
import { formatRelative, plural } from '@unlease/core/services/format';

import { useAppOff } from '../../app/apps';
import { setQuery, useQuery } from '../../app/store/search';
import { useSyncStore, type SyncPhase } from '../../app/store/syncStatus';
import { setDrawerOpen, showSnack } from '../../app/store/ui';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { adminPath, navigate, useBackCloses, type Arrival, type Route } from '../router';
import { NARROW, useMedia } from '../useMedia';
import { theApp } from '../../modules';
import { AppBrand, AppLauncher } from './AppBrand';
import styles from './shell.module.css';

/** The bar the page's content sits under, measured by the shell. */
export const APP_HEADER_ID = 'app-header';

export function syncText(phase: SyncPhase, pending: number, lastSync: number | null, message: string | null, clock: string | null = null, now: number = Date.now()): string {
  switch (phase) {
    case 'local':
      return t('Pas de serveur : tout reste dans ce navigateur.');
    case 'unauthorized':
      return t('Le serveur refuse le jeton. Vérifiez-le dans l’administration.');
    case 'offline': {
      // Why, what waits (and that it is safe here), and since when: a server reached only at home or
      // through a VPN is out of reach for hours, and the person should know nothing is lost meanwhile.
      const reason = message ? t(message) : t('Hors ligne');
      const waiting = pending > 0
        ? t('{reason} : {changes} en attente, à l’abri dans ce navigateur.', { reason, changes: plural(pending, 'modification') })
        : message ? t('Hors ligne ({reason}).', { reason }) : t('Hors ligne.');
      return lastSync ? `${waiting} ${t('Dernière synchronisation {when}.', { when: formatRelative(lastSync, now) })}` : waiting;
    }
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
      // The phone's tones: all well a success, at work or alone by choice an info, offline a warning, refused an error.
      onClick={() =>
        phase === 'synced' || phase === 'syncing'
          ? showSnack(text, undefined, { tone: phase === 'synced' ? 'success' : 'info' })
          : showSnack(text, { label: t('Serveur'), run: () => navigate(adminPath('server')) }, { tone: phase === 'local' ? 'info' : phase === 'offline' ? 'warning' : 'error' })
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
    <button type="button" className={styles.syncNotice} data-phase={phase} onClick={() => navigate(adminPath('server'))}>
      <span className={styles.dot} data-phase={phase} style={{ '--dot': DOT_COLORS[phase] } as CSSProperties} />
      <span>{phase === 'unauthorized' ? t('Le serveur refuse le jeton') : said}</span>
      <span className={styles.syncNoticeAction}>{t('Serveur')}</span>
    </button>
  );
}

export interface HeaderProps {
  /** The page on screen (under any overlay). */
  readonly route: Route;
  /** How the page came on screen: on a phone-sized window the header is the home's own, and arrives with it. */
  readonly enter?: Arrival | null;
}

/** The search field's id: "/" focuses it from anywhere. */
export const SEARCH_INPUT_ID = 'search';

/** The phone's "Fermer la recherche": the text goes, and the keyboard with it. */
export function endSearch(): void {
  setQuery('');
  document.getElementById(SEARCH_INPUT_ID)?.blur();
}

/** The field strip: the menu (until the navigation docks; on a phone, Back while searching), the field, and on a phone the app's tools and the dot. Out of reach while an app's bar lies over it. */
function SearchStrip({ route, narrow, covered }: { route: Route; narrow: boolean; covered: boolean }) {
  const query = useQuery();
  const module = theApp();
  const home = module.searchHome ?? null;
  // The phone's search mode: Back where the menu was, a full-size × at the end.
  const searchMode = narrow && query.length > 0;
  const Tools = module.NarrowTools;
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
          placeholder={APP_WORDS[module.id].search}
          aria-label={t('Rechercher')}
          autoComplete="off"
          spellCheck={false}
          onChange={event => {
            setQuery(event.target.value);
            // Results live on the app's home: searching from elsewhere goes there.
            if (home && !module.isHome(route)) navigate(home);
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
          {Tools ? <Tools route={route} /> : null}
          <SyncDot />
        </>
      ) : null}
    </div>
  );
}

const NOT_COVERED = (): boolean => false;

function HeaderComponent({ route, enter = null }: HeaderProps) {
  const query = useQuery();
  const narrow = useMedia(NARROW);
  const module = theApp();
  // The same hook on every render: the app never changes while the page lives.
  const covered = (module.useHeaderCovered ?? NOT_COVERED)();
  // Back ends a search before it leaves the home.
  useBackCloses(query.length > 0 && module.isHome(route), endSearch);
  // As it was when it came: on a phone-sized window it comes with the home, and stays while the home's views change in place.
  const [arrival] = useState(enter);
  const Cover = module.HeaderCover;
  // In the Administration, none of the app's actions; nor while the server has the app turned off.
  const off = useAppOff();
  const Actions = route.name === 'admin' || (off && route.name !== 'settings') ? undefined : module.HeaderActions;
  return (
    <header className={styles.header} id={APP_HEADER_ID} data-enter={arrival ?? undefined}>
      <div className={styles.headerRow}>
        <div className={styles.brand}>
          <AppBrand />
        </div>
        <div className={styles.bar}>
          <div className={styles.strip}>
            <SearchStrip route={route} narrow={narrow} covered={covered} />
            {Cover ? <Cover route={route} /> : null}
          </div>
          {narrow ? null : (
            <div className={styles.actions}>
              {Actions ? <Actions route={route} /> : null}
              <SyncDot words />
              <AppLauncher />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export const Header = memo(HeaderComponent);
