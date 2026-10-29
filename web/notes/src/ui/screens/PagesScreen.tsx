/**
 * The pages' home, where a day starts: the create strip, then the pages changed last (at any depth)
 * as sheets pinned to the wall, as the collections are (rows on a phone, and none while the pages
 * are few enough to see at a glance), then every top-level page as a row, in the tree's order.
 * While there are only a few pages, a line says what one can hold. The pages in the bin are in the
 * Corbeille with the notes; one quiet line here leads there.
 */
import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { t, tx } from '@unlease/core/i18n';
import { RICH_KINDS, UNTITLED_PAGE } from '@unlease/notes/models/blocks';
import { ancestorPages } from '@unlease/notes/services/blocks';
import { formatEdited, plural } from '@unlease/core/services/format';
import { markupToPlain } from '@unlease/core/services/richText';
import { dateWords } from '@unlease/core/services/dates';

import { useMinute } from '../../app/hooks/useMinute';
import { childPagesOf, livePageIds, mentionLabel, pageEdited, useChildPages, useRecentPages, useTrashedPages } from '../../app/hooks/usePages';
import { useLibraryStore, type LibraryState } from '../../app/store/library';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { OutlineEdge } from '../components/Outline';
import { ComposerStrip } from '../features/board/Composer';
import lineStyles from '../features/lines/lines.module.css';
import { TileSlot } from '../features/lines/TileSlot';
import { openNewPage } from '../features/pages/PageTree';
import styles from '../features/pages/pages.module.css';
import { SyncNotice } from '../navigation/Header';
import { Link, pathForView, paths } from '../router';
import { NARROW, useMedia } from '../useMedia';

/** Fewer pages than this, and the home says what a page can hold. */
const FEW_PAGES = 3;
/** Under this many pages "Toutes les pages" already shows them at a glance: no "Récentes" to repeat them. */
const RECENT_FROM = 5;
/** A desktop's recent sheets: one row of three while the pages are few, two rows past it; a phone's: four rows. */
const RECENT = { few: 3, many: 6, phone: 4 } as const;
const MANY_PAGES = 8;

/** A page's first words (its own content's, a sub-page's are its own) and the pages above it. */
function pageGlance(s: LibraryState, id: string): { readonly preview: string; readonly path: string } {
  let preview = '';
  const walk = (parent: string, depth: number): void => {
    for (const childId of s.blocksByParent[parent] ?? []) {
      const block = s.blocks[childId];
      if (preview || depth > 200 || !block || block.kind === 'page') continue;
      if (RICH_KINDS.has(block.kind)) preview = markupToPlain(block.text, mentionLabel, dateWords).trim().slice(0, 240);
      if (!preview) walk(childId, depth + 1);
    }
  };
  walk(id, 0);
  const path = ancestorPages(s.blocks, id)
    .map(page => page.text.trim() || t(UNTITLED_PAGE))
    .join(' › ');
  return { preview, path };
}

const PageMark = memo(function PageMark({ icon, size }: { icon: string | null; size: number }) {
  return icon ? <span className={styles.emoji}>{icon}</span> : <Icon name="page" size={size} />;
});

const RecentTile = memo(function RecentTile({ id, now }: { id: string; now: number }) {
  const page = useLibraryStore(s => s.blocks[id]);
  const shown = useLibraryStore(useShallow(s => pageGlance(s, id)));
  const edited = useLibraryStore(s => pageEdited(s, id));
  if (!page) return null;
  const title = page.text.trim() || t(UNTITLED_PAGE);
  return (
    <TileSlot>
      {d => (
        <Link to={paths.page(id)} className={`${lineStyles.tile} paper`} ariaLabel={title}>
          <span className={`${lineStyles.tileMark} ${styles.tileIcon} ${styles.tileEmoji}`}>
            <PageMark icon={page.icon} size={36} />
          </span>
          <span className={`${lineStyles.tileName} t-body-strong`}>{title}</span>
          <span className={`${lineStyles.tileHint} t-meta`}>{shown.preview || t('Page vide')}</span>
          <span className={styles.tileFoot}>
            {shown.path ? <span className={`${styles.tilePath} t-meta`}>{shown.path}</span> : null}
            <span className="t-meta">{formatEdited(edited, now)}</span>
          </span>
          <OutlineEdge d={d} />
        </Link>
      )}
    </TileSlot>
  );
});

/** A recent page on a phone: a row, where it sits and when it changed under its title. */
const RecentRow = memo(function RecentRow({ id, now }: { id: string; now: number }) {
  const page = useLibraryStore(s => s.blocks[id]);
  const path = useLibraryStore(useShallow(s => pageGlance(s, id))).path;
  const edited = useLibraryStore(s => pageEdited(s, id));
  if (!page) return null;
  const title = page.text.trim() || t(UNTITLED_PAGE);
  const facts = [path || null, formatEdited(edited, now)].filter(Boolean).join(' · ');
  return (
    <li>
      <Link to={paths.page(id)} className={styles.pageRow}>
        <span className={styles.pageRowIcon}>
          <PageMark icon={page.icon} size={22} />
        </span>
        <span className={`${styles.pageRowTitle} t-body-strong`}>{title}</span>
        <span className={`${styles.pageRowFacts} t-meta`}>{facts}</span>
      </Link>
    </li>
  );
});

const PageRow = memo(function PageRow({ id, now }: { id: string; now: number }) {
  const page = useLibraryStore(s => s.blocks[id]);
  const subPages = useLibraryStore(s => childPagesOf(s, id).length);
  const edited = useLibraryStore(s => pageEdited(s, id));
  if (!page) return null;
  const title = page.text.trim() || t(UNTITLED_PAGE);
  const facts = [subPages > 0 ? plural(subPages, 'sous-page') : null, formatEdited(edited, now)].filter(Boolean).join(' · ');
  return (
    <li>
      <Link to={paths.page(id)} className={styles.pageRow}>
        <span className={styles.pageRowIcon}>
          <PageMark icon={page.icon} size={22} />
        </span>
        <span className={`${styles.pageRowTitle} t-body-strong`}>{title}</span>
        <span className={`${styles.pageRowFacts} t-meta`}>{facts}</span>
      </Link>
    </li>
  );
});

/** Under a keyboard, the keys that fill the pages. */
const PAGE_KEYS = [
  { key: 'P', label: tx('nouvelle page') },
  { key: '/', label: tx('blocs, dans une page') },
  { key: '?', label: tx('raccourcis') },
] as const;

const EMPTY_TEXT = tx('Une page tient des titres, des listes, des tableaux, du code, des images, et vos notes, collections et liens.');

/**
 * The pages' home, laid out as the notes' is: the create strip on top (the bar at the foot on a
 * phone-sized window), then its sections or the same empty place in the same spot.
 */
export function PagesScreen() {
  const roots = useChildPages(null);
  const narrow = useMedia(NARROW);
  const count = useLibraryStore(s => livePageIds(s).length);
  const recent = useRecentPages(narrow ? RECENT.phone : count <= MANY_PAGES ? RECENT.few : RECENT.many);
  const binned = useTrashedPages().length;
  const now = useMinute();

  return (
    <div className={styles.home}>
      {narrow ? <SyncNotice /> : null}
      <h1 className="sr-only">{t('Pages')}</h1>
      <ComposerStrip label={t('Créer une page…')} shortcut="P" onCreate={() => openNewPage(null)} />
      {roots.length === 0 ? (
        <EmptyState
          scene="notes"
          title={t('Aucune page pour l’instant')}
          text={narrow ? `${t(EMPTY_TEXT)} ${t('Le bouton +, en bas, en crée une.')}` : `${t(EMPTY_TEXT)} ${t('Créez-en une avec la barre du haut, ou appuyez sur P.')}`}
          keys={narrow ? undefined : PAGE_KEYS.map(item => ({ ...item, label: t(item.label) }))}
        />
      ) : (
        <>
          {count < FEW_PAGES ? <p className={`${styles.homeIntro} t-body`}>{t('Vos documents, rangés comme vous voulez : une page peut en contenir d’autres. Tapez « / » dans une page pour y ajouter un bloc, « @ » pour citer une note, une collection ou un lien.')}</p> : null}
          {count >= RECENT_FROM ? (
            <section className={styles.homeSection} aria-labelledby="pages-recent">
              <h2 id="pages-recent" className={`${styles.homeHead} t-section`}>
                {t('Récentes')}
              </h2>
              {narrow ? (
                <ul className={styles.allPages}>
                  {recent.map(id => (
                    <RecentRow key={id} id={id} now={now} />
                  ))}
                </ul>
              ) : (
                <ul className={styles.recent}>
                  {recent.map(id => (
                    <RecentTile key={id} id={id} now={now} />
                  ))}
                </ul>
              )}
            </section>
          ) : null}
          <section className={styles.homeSection} aria-labelledby="pages-all">
            <h2 id="pages-all" className={`${styles.homeHead} t-section`}>
              {t('Toutes les pages')}
            </h2>
            <ul className={styles.allPages}>
              {roots.map(id => (
                <PageRow key={id} id={id} now={now} />
              ))}
            </ul>
          </section>
        </>
      )}
      {binned > 0 ? (
        <Link to={pathForView('trash')} className={`${styles.binLink} t-meta`}>
          <Icon name="trash" size={18} />
          {t('{count} dans la corbeille', { count: plural(binned, 'page') })}
        </Link>
      ) : null}
    </div>
  );
}
