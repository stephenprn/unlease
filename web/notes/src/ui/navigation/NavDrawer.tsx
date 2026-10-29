/**
 * Every place in the app, in two spaces the switch at the top moves between: the notes (Keep's
 * side: notes and reminders, the collections by their cut-outs, the labels by their tags, each
 * section folding shut on its title; the archive at the foot) and the pages (the knowledge base:
 * its home, then the tree of pages). The bin, the settings and the Administration belong to both and stay at the foot.
 *
 * Docked on the wall beside the board on wide screens; a paper sheet drawn
 * from the menu button on narrower ones.
 */
import { memo, useId, useState, type CSSProperties, type ReactNode, type UIEvent } from 'react';

import { APP_NAME } from '@unlease/notes/brand';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { t, tx } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';
import type { GlyphName } from '@unlease/design/glyphs';

import { useLines } from '../../app/hooks/useLines';
import { resetBoard } from '../../app/store/board';
import { useLibraryStore, type LibraryState } from '../../app/store/library';
import { setSectionFolded, useNavUiStore, type NavSection, type Space } from '../../app/store/navUi';
import { selectDrawerOpen, setDrawerOpen, setNewLineOpen, useUiStore } from '../../app/store/ui';
import { BrandMark } from '../components/BrandMark';
import { Emblem } from '../components/Emblem';
import { Icon } from '../components/Icon';
import { LabelTag } from '../components/LabelMark';
import { Layer } from '../components/Layer';
import { PagesSection } from '../features/pages/PageTree';
import { browserPath, isPlainClick, Link, navigate, pathForView, paths, type Route } from '../router';
import styles from './nav.module.css';
import { spaceTarget, useSpace } from './space';

function isCurrent(route: Route, path: string): boolean {
  switch (route.name) {
    case 'board':
      return pathForView(route.view) === path;
    case 'line':
      return paths.line(route.id) === path;
    case 'lines':
      return path === paths.lines;
    case 'labels':
      return path === paths.labels;
    case 'settings':
      return path === paths.settings;
    case 'admin':
      return path === paths.admin;
    case 'pages':
      return path === paths.pages;
    case 'page':
      return paths.page(route.id) === path;
    default:
      return false;
  }
}

const openLinks = (id: string) => (s: LibraryState): number => (s.linksByNote[id] ?? []).filter(lid => s.links[lid] && !s.links[lid]!.done).length;

const CollectionCount = memo(function CollectionCount({ id }: { id: string }) {
  const count = useLibraryStore(openLinks(id));
  return count > 0 ? <span className={styles.itemCount}>{count}</span> : null;
});

/** "Non classé" shows only while it holds a link, as its chip on the phone. */
function InboxGate({ children }: { children: ReactNode }) {
  const count = useLibraryStore(openLinks(INBOX_ID));
  return count > 0 ? <>{children}</> : null;
}

/** A section of the navigation: its title folds it shut (remembered on this browser), its action at the far end. */
function Section({ id, title, action, children }: { id: NavSection; title: string; action?: ReactNode; children: ReactNode }) {
  const folded = useNavUiStore(s => s.folded.has(id));
  const body = useId();
  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <h2 className={styles.headingTitle}>
          <button type="button" className={styles.headingToggle} aria-label={folded ? t('Déplier {section}', { section: title }) : t('Replier {section}', { section: title })} aria-expanded={!folded} aria-controls={body} onClick={() => setSectionFolded(id, !folded)}>
            <span className={styles.headingChevron} data-open={!folded || undefined}>
              <Icon name="chevronRight" size={14} />
            </span>
            <span className="t-meta-strong">{title}</span>
          </button>
        </h2>
        {action}
      </div>
      {folded ? null : (
        <div id={body} className={styles.sectionBody}>
          {children}
        </div>
      )}
    </section>
  );
}

const SPACES: readonly { readonly space: Space; readonly label: string; readonly icon: GlyphName }[] = [
  { space: 'notes', label: tx('Notes'), icon: 'note' },
  { space: 'pages', label: tx('Pages'), icon: 'page' },
];

/**
 * The switch between the two spaces: a sunken track with a sheet of paper lying under the current
 * one, sliding across when the other is chosen. Each side is a link to the last place shown in its
 * space, so it opens in a new tab too.
 */
function SpaceSwitch({ space, onSwitch }: { space: Space; onSwitch: (space: Space) => void }) {
  const at = SPACES.findIndex(entry => entry.space === space);
  // Subscribed, so each side's address follows the last place shown in its space.
  const lastPath = useNavUiStore(s => s.lastPath);
  return (
    <div className={styles.spaces} role="group" aria-label={t('Espace')} style={{ '--at': at } as CSSProperties}>
      <span className={styles.spaceSheet} aria-hidden="true" />
      {SPACES.map(entry => {
        const current = entry.space === space;
        return (
          <a
            key={entry.space}
            href={browserPath(spaceTarget(entry.space, lastPath))}
            className={styles.space}
            aria-current={current ? 'true' : undefined}
            onClick={event => {
              if (!isPlainClick(event)) return;
              event.preventDefault();
              onSwitch(entry.space);
            }}
          >
            <Icon name={entry.icon} size={20} />
            <span>{t(entry.label)}</span>
          </a>
        );
      })}
    </div>
  );
}

/** How the list on screen came: null at first, then from the side of the space chosen. */
function useSpaceEntry(space: Space): 'forward' | 'back' | null {
  const [shown, setShown] = useState<{ space: Space; entry: 'forward' | 'back' | null }>({ space, entry: null });
  if (shown.space === space) return shown.entry;
  const entry = space === 'pages' ? 'forward' : 'back';
  setShown({ space, entry });
  return entry;
}

/** The scroller's top fades once rows have gone up under it, as the page's content does under the header. */
function markScrolled(event: UIEvent<HTMLDivElement>): void {
  event.currentTarget.toggleAttribute('data-scrolled', event.currentTarget.scrollTop > 1);
}

export interface NavListProps {
  readonly route: Route;
  /** A row was chosen: the drawer closes. */
  readonly onNavigate?: () => void;
  /** In the drawer: the switch turns the list over in place, and the person picks a row in it (going somewhere would close the drawer). */
  readonly browse?: boolean;
}

export function NavList({ route, onNavigate, browse = false }: NavListProps) {
  const lines = useLines();
  const labelOrder = useLibraryStore(s => s.labelOrder);
  const labels = useLibraryStore(s => s.labels);
  const routeSpace = useSpace(route);
  const [browsed, setBrowsed] = useState<Space | null>(null);
  const space = browsed ?? routeSpace;
  const entry = useSpaceEntry(space);
  const switchTo = (next: Space): void => {
    if (browse) {
      setBrowsed(next);
      return;
    }
    resetBoard();
    navigate(spaceTarget(next));
  };

  const go = (): void => {
    resetBoard();
    onNavigate?.();
  };
  // A collection's or a label's row, chosen, lies on its own wash instead of matcha.
  const item = (key: string, to: string, label: string, leading: ReactNode, trailing?: ReactNode, wash?: string) => (
    <Link
      key={key}
      to={to}
      className={styles.item}
      style={wash ? ({ '--stone': `var(--line-${wash}-tint)`, '--stone-ink': 'var(--ink)' } as CSSProperties) : undefined}
      ariaCurrent={isCurrent(route, to) ? 'page' : undefined}
      onNavigate={go}
    >
      {leading}
      <span className={styles.itemName}>{label}</span>
      {trailing}
    </Link>
  );
  const icon = (name: GlyphName) => (
    <span className={styles.markSlot}>
      <Icon name={name} size={22} />
    </span>
  );

  const notes = (
    <>
      {item('notes', '/', t('Toutes les notes'), icon('note'))}
      {item('reminders', '/reminders', t('Rappels'), icon('bell'))}
      <Section
        id="collections"
        title={t('Collections')}
        action={
          <Link to={paths.lines} className={styles.headingAction} onNavigate={go} ariaLabel={t('Toutes les collections')}>
            {t('Tout voir')}
          </Link>
        }
      >
        {lines.map(line => {
          const row = item(
            `line-${line.id}`,
            paths.line(line.id),
            shownTitle(line),
            <span className={styles.markSlot} data-line={asLineColor(line.color) ?? 'grey'}>
              <Emblem emblem={collectionEmblem(line.id, line.emblem)} color={asLineColor(line.color)} size={24} />
            </span>,
            <CollectionCount id={line.id} />,
            asLineColor(line.color) ?? 'grey',
          );
          return line.id === INBOX_ID ? <InboxGate key={line.id}>{row}</InboxGate> : row;
        })}
        <button
          type="button"
          className={`${styles.item} ${styles.quiet}`}
          onClick={() => {
            onNavigate?.();
            setNewLineOpen(true);
          }}
        >
          <span className={styles.markSlot}>
            <Icon name="plus" size={20} />
          </span>
          <span className={styles.itemName}>{t('Nouvelle collection')}</span>
        </button>
      </Section>
      <Section
        id="labels"
        title={t('Labels')}
        action={
          <Link to={paths.labels} className={styles.headingAction} onNavigate={go} ariaLabel={t('Modifier les labels')}>
            {t('Modifier')}
          </Link>
        }
      >
        {labelOrder.map(id => {
          const label = labels[id];
          if (!label) return null;
          return item(
            `label-${id}`,
            pathForView(`label:${id}`),
            label.name,
            <span className={styles.markSlot} data-line={label.color}>
              <LabelTag color={label.color} size={20} />
            </span>,
            undefined,
            label.color,
          );
        })}
        {labelOrder.length === 0 ? item('labels-empty', paths.labels, t('Créer un label'), icon('tag')) : null}
      </Section>
    </>
  );

  const pages = (
    <>
      {item('pages', paths.pages, t('Toutes les pages'), icon('book'))}
      <section className={styles.section}>
        <div className={styles.heading}>
          <h2 className={`${styles.headingTitle} ${styles.headingStill} t-meta-strong`}>{t('Pages')}</h2>
        </div>
        <div className={styles.sectionBody}>
          <PagesSection route={route} onNavigate={go} />
        </div>
      </section>
    </>
  );

  return (
    <nav className={styles.nav} aria-label={t('Navigation')}>
      <SpaceSwitch space={space} onSwitch={switchTo} />
      {/* A new space's list arrives from its side, and starts at its top. */}
      <div key={space} className={styles.navMain} data-enter={entry ?? undefined} onScroll={markScrolled}>
        <span className={styles.navBlur} aria-hidden="true" />
        {space === 'notes' ? notes : pages}
      </div>
      <div className={styles.navFoot}>
        {space === 'notes' ? item('archive', '/archive', t('Archives'), icon('archive')) : null}
        {item('trash', '/trash', t('Corbeille'), icon('trash'))}
        {item('settings', paths.settings, t('Réglages'), icon('settings'))}
        {item('admin', paths.admin, t('Administration'), icon('server'))}
      </div>
    </nav>
  );
}

/** The narrower screens' drawer: a sheet torn off on its right side. */
export function NavDrawer({ route }: { route: Route }) {
  const open = useUiStore(selectDrawerOpen);
  const close = (): void => setDrawerOpen(false);
  return (
    <Layer open={open} onDismiss={close} kind="start" label={t('Navigation')}>
      <div className={styles.drawerBrand}>
        <BrandMark size={40} />
        <span className="t-display">{APP_NAME}</span>
      </div>
      <div className={styles.drawerScroll}>
        <NavList route={route} onNavigate={close} browse />
      </div>
    </Layer>
  );
}
