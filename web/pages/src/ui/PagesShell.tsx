/**
 * Pages' places as the shell draws them: the home (the recent pages and the tree, or the search's
 * results), a page, the bin; its navigation (the home, then the tree), « Nouvelle page » beside the
 * search and as the pebble at the foot of a phone-sized home.
 */
import { useRef, useState, type AnimationEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import { UNTITLED_PAGE } from '@unlease/pages/models/blocks';
import { spotKey } from '@unlease/core/services/spotlight';

import { useTrashedPages } from '../app/hooks/usePages';
import { useBlocksStore, type BlocksState } from '../app/store/blocks';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { Icon } from '@shared/ui/components/Icon';
import { usePresence } from '@shared/ui/components/presence';
import { NavGlyph, NavRow, NavStill } from '@shared/ui/navigation/NavParts';
import { PageHead } from '@shared/ui/navigation/PageHead';
import shell from '@shared/ui/navigation/shell.module.css';
import type { Arrival, Route } from '@shared/ui/router';
import settings from '@shared/ui/features/settings/settings.module.css';
import { EmptyPagesBinDialog, PagesBinSection } from './features/pages/PagesBin';
import { openNewPage, PagesSection } from './features/pages/PageTree';
import styles from './features/pages/pages.module.css';
import { paths } from './routes';
import { PageScreen } from './screens/PageScreen';
import { PagesScreen } from './screens/PagesScreen';

/** The pages in the bin: each comes back whole, or goes for good; « Vider la corbeille » takes them all (asked first). */
function PagesTrashScreen() {
  const binned = useTrashedPages().length;
  const [emptying, setEmptying] = useState(false);
  return (
    <div className={settings.page}>
      {/* The title and, while it holds pages, how long they stay, as Carnet's bin says it right under its own (empty, the empty place says it). */}
      <div>
        <PageHead title={t('Corbeille')} action={binned > 0 ? { icon: 'broom', label: t('Vider la corbeille'), onClick: () => setEmptying(true) } : undefined} />
        {binned > 0 ? <p className={`${styles.binNote} t-meta`}>{t('Les pages de la corbeille sont supprimées au bout de {days} jours.', { days: TRASH_RETENTION_DAYS })}</p> : null}
      </div>
      {binned === 0 ? <EmptyState scene="trash" title={t('La corbeille est vide')} text={t('Les pages supprimées y restent {days} jours, le temps de changer d’avis.', { days: TRASH_RETENTION_DAYS })} /> : <PagesBinSection />}
      <EmptyPagesBinDialog open={emptying} onClose={() => setEmptying(false)} />
    </div>
  );
}

export function PagesShellScreen({ route }: { route: Route }) {
  switch (route.name) {
    case 'pages':
      return <PagesScreen />;
    case 'page':
      return <PageScreen key={route.id} id={route.id} />;
    case 'pagesTrash':
      return <PagesTrashScreen />;
    default:
      return null;
  }
}

function titleFor(state: BlocksState, route: Route): string | null {
  switch (route.name) {
    case 'page':
      return state.blocks[route.id]?.text.trim() || t(UNTITLED_PAGE);
    case 'pagesTrash':
      return t('Corbeille');
    default:
      return null;
  }
}

export const usePagesTitle = (page: Route): string | null => useBlocksStore(state => titleFor(state, page));

export function pagesPathOf(route: Route): string {
  switch (route.name) {
    case 'page':
      return paths.page(route.id);
    case 'pagesTrash':
      return paths.trash;
    default:
      return paths.pages;
  }
}

/** A page is still there to go back to (not in the bin). */
export function pagesStillThere(route: Route): boolean {
  if (route.name !== 'page') return true;
  const page = useBlocksStore.getState().blocks[route.id];
  return !!page && page.kind === 'page' && page.trashedAt === null;
}

export const pagesOpened = (route: Route): string | null => (route.name === 'page' ? spotKey('page', route.id) : null);

export function PagesNav({ route, onNavigate }: { route: Route; onNavigate: () => void }) {
  return (
    <>
      <NavRow to={paths.pages} label={t('Toutes les pages')} leading={<NavGlyph name="book" />} current={route.name === 'pages'} onNavigate={onNavigate} />
      <NavStill title={t('Pages')}>
        <PagesSection route={route} onNavigate={onNavigate} />
      </NavStill>
    </>
  );
}

export function PagesNavFoot({ route, onNavigate }: { route: Route; onNavigate: () => void }) {
  return <NavRow to={paths.trash} label={t('Corbeille')} leading={<NavGlyph name="trash" />} current={route.name === 'pagesTrash'} onNavigate={onNavigate} />;
}

/** « Nouvelle page » beside the search, wide; the pages' home has its own in its head. */
export function PagesHeaderActions({ route }: { route: Route }) {
  if (route.name === 'pages') return null;
  return (
    <button type="button" className={`${shell.classify} paper`} onClick={() => openNewPage(null)} aria-label={t('Nouvelle page')} data-tip={t('Nouvelle page (P)')}>
      <Icon name="pagePlus" size={20} />
      <span className={shell.classifyLabel}>{t('Nouvelle page')}</span>
    </button>
  );
}

/** Its slide away (`--duration-short`), and a little longer for the fallback that lets it go. */
const BAR_EXIT_MS = 200;

/** A phone-sized window's bar on the pages' home: its pebble makes a page. Mounted with its page: `enter` is how that page came. */
export function PagesBottomBar({ route, enter }: { route: Route; enter: Arrival | null }) {
  const { present, closing, done } = usePresence(route.name === 'pages', BAR_EXIT_MS);
  const [arrival] = useState(enter);
  const fab = useRef<HTMLButtonElement>(null);
  if (!present) return null;
  const gone = (event: AnimationEvent<HTMLDivElement>): void => {
    if (closing && event.target === event.currentTarget) done();
  };
  return (
    <div className={`${shell.bottomBar} paper`} data-enter={(!closing && arrival) || undefined} data-closing={closing || undefined} inert={closing} onAnimationEnd={gone}>
      <div className={shell.bottomActions} />
      <button ref={fab} type="button" className={shell.fab} data-pebble-under={0} aria-label={t('Nouvelle page')} onClick={() => openNewPage(null)}>
        <Icon name="plus" size={26} />
      </button>
    </div>
  );
}

