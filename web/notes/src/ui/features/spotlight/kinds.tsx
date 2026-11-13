/**
 * Carnet's documents in the spotlight (`@unlease/notes/services/spotlight`): a note, a collection,
 * a link, each as the person knows it now (its title as shown, what it is and where it sits, its
 * mark, where opening it goes), and as the preview beside the list shows it: a note on its own
 * colour, a collection's sentence and latest links, a link as Claude read it.
 */
import { Fragment, memo } from 'react';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { t, tc, tx } from '@unlease/core/i18n';
import { asLineColor, isLineColor, isNoteGradient } from '@unlease/design/colors';
import { shownHint, shownTitle } from '@unlease/notes/models/entities';
import { formatPrice, plural } from '@unlease/core/services/format';
import { cleanSiteName } from '@unlease/notes/services/linkRow';
import { highlight, type Matcher, type SearchDoc } from '@unlease/core/services/searchIndex';
import type { SpotMeta } from '@unlease/core/services/spotlight';
import { linkTitle, notesSpotlightDocs } from '@unlease/notes/services/spotlight';
import { noteDrawingRatio } from '@unlease/notes/services/drawing';
import { bodyText, lineStarts, linesText, noteLines, type NoteLine } from '@unlease/notes/services/noteBody';
import { richToPlain } from '@unlease/core/services/richText';
import { siteDomain } from '@unlease/core/services/url';

import { useBlobUrl } from '@shared/app/media/images';
import { Emblem } from '@shared/ui/components/Emblem';
import { Icon } from '@shared/ui/components/Icon';
import { Marked } from '@shared/ui/features/spotlight/Preview';
import styles from '@shared/ui/features/spotlight/spotlight.module.css';
import { navigate } from '@shared/ui/router';
import type { SpotKind } from '@shared/modules';
import { useLibraryStore, type LibraryState } from '../../../app/store/library';
import { openLink, openNote } from '../../commands';
import { paths } from '../../routes';
import { KIND_ICONS } from '../links/kindIcon';
import { DrawingFit } from '../note/DrawingFit';
import { LineRuns } from '../note/NoteLines';

const state = (): LibraryState => useLibraryStore.getState();

let cached: { readonly state: LibraryState; readonly docs: readonly SearchDoc<SpotMeta>[] } | null = null;

/** Carnet's documents, built again only when the library changed. */
function docs(): readonly SearchDoc<SpotMeta>[] {
  const now = state();
  if (cached?.state !== now) cached = { state: now, docs: notesSpotlightDocs(now) };
  return cached.docs;
}

const ofType = (type: string) => (): readonly SearchDoc<SpotMeta>[] => docs().filter(doc => doc.meta.type === type);

/** A link's own picture, small, in its 4:5 frame; its kind's glyph until there is one. */
const LinkThumb = memo(function LinkThumb({ id, large }: { id: string; large?: boolean }) {
  const link = useLibraryStore(s => s.links[id]);
  const kept = useBlobUrl(link?.imageIds[0]);
  const image = kept ?? link?.imageUrl ?? null;
  if (!link) return <Icon name="link" size={20} />;
  return (
    <span className={large ? styles.thumbLarge : styles.thumb} data-picture={image ? true : undefined} data-outline="frame" data-edge>
      {image ? <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} /> : <Icon name={KIND_ICONS[link.kind]} size={large ? 32 : 18} />}
    </span>
  );
});

const NoteMark = memo(function NoteMark({ doc, large = false }: { doc: SearchDoc<SpotMeta>; large?: boolean }) {
  const kind = useLibraryStore(s => s.notes[doc.meta.id]?.kind);
  return <Icon name={kind === 'checklist' ? 'checklist' : kind === 'drawing' ? 'draw' : 'note'} size={large ? 32 : 20} />;
});

const CollectionMark = memo(function CollectionMark({ doc, large = false }: { doc: SearchDoc<SpotMeta>; large?: boolean }) {
  const note = useLibraryStore(s => s.notes[doc.meta.id]);
  return <Emblem emblem={collectionEmblem(doc.meta.id, note?.emblem ?? null)} color={asLineColor(note?.color ?? null)} size={large ? 36 : 22} />;
});

const LinkMark = ({ doc, large = false }: { doc: SearchDoc<SpotMeta>; large?: boolean }) => <LinkThumb id={doc.meta.id} large={large} />;

/** A drawing in the preview stops at this height (its top shows). */
const DRAWING_MAX = 420;

const blank = (line: NoteLine): boolean => !richToPlain(line.runs).trim();

/** Lines without the blank ones at either end. */
function trimLines(lines: readonly NoteLine[]): NoteLine[] {
  let first = 0;
  let last = lines.length;
  while (first < last && blank(lines[first]!)) first += 1;
  while (last > first && blank(lines[last - 1]!)) last -= 1;
  return lines.slice(first, last);
}

/** A formatted note as written: its headings as a page's, the lines of text between them in paragraphs, matches marked. */
function FormattedBody({ lines, matcher }: { lines: readonly NoteLine[]; matcher: Matcher }) {
  const ranges = highlight(linesText(lines), matcher);
  const starts = lineStarts(lines);
  const groups: { readonly first: number; last: number }[] = [];
  lines.forEach((line, index) => {
    const open = groups[groups.length - 1];
    if (line.heading === 0 && open && lines[open.first]!.heading === 0) open.last = index;
    else groups.push({ first: index, last: index });
  });
  return (
    <>
      {groups.map(({ first, last }) => {
        const heading = lines[first]!.heading;
        if (heading > 0) {
          return (
            <p key={first} className={styles.blockHeading} data-level={`h${heading}`}>
              <LineRuns runs={lines[first]!.runs} from={starts[first]} ranges={ranges} />
            </p>
          );
        }
        return (
          <p key={first} className={`${styles.noteBody} t-body`}>
            {lines.slice(first, last + 1).map((line, at) => (
              <Fragment key={at}>
                {at > 0 ? '\n' : null}
                <LineRuns runs={line.runs} from={starts[first + at]} ranges={ranges} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

function NotePreview({ doc, matcher }: { doc: SearchDoc<SpotMeta>; matcher: Matcher }) {
  const note = useLibraryStore(s => s.notes[doc.meta.id]);
  const ids = useLibraryStore(s => s.checksByNote[doc.meta.id]);
  const checks = useLibraryStore(s => s.checks);
  if (!note) return null;
  const items = (ids ?? []).map(id => checks[id]).filter(item => item && item.deletedAt === null && item.text.trim());
  // Untitled, its first line already stands as the title above.
  const text = bodyText(note).trim();
  const body = note.title.trim() ? text : text.split('\n').slice(1).join('\n').trim();
  const written = note.kind === 'text' && note.rich ? trimLines(noteLines(note.body, true)) : null;
  const formatted = written && !note.title.trim() ? trimLines(written.slice(1)) : written;
  const drawing = noteDrawingRatio(note);
  return (
    <div className={styles.noteSheet} data-outline="card" data-edge data-line={isLineColor(note.color) ? note.color : undefined} data-gradient={isNoteGradient(note.color) ? note.color : undefined}>
      {drawing !== null ? <DrawingFit data={note.drawing} ratio={drawing} max={DRAWING_MAX} /> : null}
      {formatted ? (
        formatted.length > 0 ? <FormattedBody lines={formatted} matcher={matcher} /> : null
      ) : body ? (
        <p className={`${styles.noteBody} t-body`}>
          <Marked text={body} matcher={matcher} />
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className={styles.checks}>
          {items.map(item => (
            <li key={item!.id} className="t-body" data-ref={item!.id} data-checked={item!.checked || undefined} data-indent={item!.indent > 0 || undefined}>
              <Icon name={item!.checked ? 'boxChecked' : 'box'} size={20} />
              <span>
                <Marked text={item!.text} matcher={matcher} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {!body && items.length === 0 && drawing === null ? <p className={`${styles.quiet} t-meta`}>{t('Empty note')}</p> : null}
    </div>
  );
}

function CollectionPreview({ doc, matcher }: { doc: SearchDoc<SpotMeta>; matcher: Matcher }) {
  const note = useLibraryStore(s => s.notes[doc.meta.id]);
  const ids = useLibraryStore(s => s.linksByNote[doc.meta.id]);
  const links = useLibraryStore(s => s.links);
  if (!note) return null;
  const live = (ids ?? []).map(id => links[id]).filter(link => link && link.deletedAt === null);
  const done = live.filter(link => link!.done).length;
  const hint = shownHint(note).trim();
  return (
    <>
      {hint ? (
        <p className={`${styles.hint} t-body`}>
          <Marked text={hint} matcher={matcher} />
        </p>
      ) : null}
      <p className={`${styles.quiet} t-meta`}>{done > 0 ? t('{links}, {done}', { links: plural(live.length, t('link'), t('links')), done: plural(done, t('done'), tc('many', 'done')) }) : plural(live.length, t('link'), t('links'))}</p>
      {live.length > 0 ? (
        <ul className={styles.linkList}>
          {live.slice(0, 8).map(link => (
            <li key={link!.id} className="t-body" data-done={link!.done || undefined}>
              <Icon name="link" size={16} />
              <span>
                <Marked text={linkTitle(link!)} matcher={matcher} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function LinkPreview({ doc, matcher }: { doc: SearchDoc<SpotMeta>; matcher: Matcher }) {
  const link = useLibraryStore(s => s.links[doc.meta.id]);
  if (!link) return null;
  return (
    <div className={styles.linkBody}>
      {link.summary ? (
        <p className={`${styles.summary} t-body`}>
          <Marked text={link.summary} matcher={matcher} />
        </p>
      ) : null}
      {link.attributes.length > 0 ? (
        <dl className={styles.facts}>
          {link.attributes.map((fact, at) => (
            <div key={`${fact.label}:${at}`}>
              <dt className="t-meta">{fact.label}</dt>
              <dd className="t-meta">
                <Marked text={fact.value} matcher={matcher} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {link.comment ? (
        <p className={`${styles.comment} t-body`}>
          <span className={`${styles.commentLabel} t-meta`}>{t('Your comment')}</span>
          <Marked text={link.comment} matcher={matcher} />
        </p>
      ) : null}
      <p className={`${styles.address} t-meta`}>
        <Marked text={link.url} matcher={matcher} />
      </p>
    </div>
  );
}


export const NOTES_SPOT_KINDS: readonly SpotKind[] = [
  {
    type: 'note',
    label: tx('Notes'),
    docs: ofType('note'),
    title: doc => {
      const note = state().notes[doc.meta.id];
      if (!note) return doc.title;
      if (note.title.trim()) return note.title.trim();
      const first = doc.parts.find(part => part.role !== 'meta');
      return first ? first.text.slice(0, 120) : t('Untitled note');
    },
    facts: doc => {
      const { notes, labels } = state();
      const note = notes[doc.meta.id];
      const worn = (note?.labelIds ?? []).map(labelId => labels[labelId]).filter(label => label && label.deletedAt === null).map(label => label!.name);
      return [note?.kind === 'checklist' ? t('Checklist') : note?.kind === 'drawing' ? t('Drawing') : t('Note'), ...worn, ...(note?.archived ? [t('Archived')] : [])];
    },
    href: doc => paths.note(doc.meta.id),
    open: doc => openNote(doc.meta.id),
    Mark: NoteMark,
    Preview: NotePreview,
  },
  {
    type: 'collection',
    label: tx('Collections'),
    docs: ofType('collection'),
    title: doc => {
      const note = state().notes[doc.meta.id];
      return note ? shownTitle(note) : doc.title;
    },
    facts: doc => [t('Collection'), plural((state().linksByNote[doc.meta.id] ?? []).length, t('link'), t('links'))],
    href: doc => paths.line(doc.meta.id),
    open: doc => navigate(paths.line(doc.meta.id)),
    Mark: CollectionMark,
    Preview: CollectionPreview,
  },
  {
    type: 'link',
    label: tx('Links'),
    docs: ofType('link'),
    title: doc => {
      const link = state().links[doc.meta.id];
      return link ? linkTitle(link) : doc.title;
    },
    facts: doc => {
      const { links, notes } = state();
      const link = links[doc.meta.id];
      const collection = doc.meta.within ? notes[doc.meta.within] : undefined;
      if (!link) return [t('Link')];
      const price = link.price !== null ? formatPrice(link.price, link.currency) : null;
      return [t('Link'), ...(collection ? [shownTitle(collection)] : []), cleanSiteName(link.siteName) ?? siteDomain(link.url), ...(price ? [price] : []), ...(link.done ? [tc('ticked', 'Done')] : [])];
    },
    href: doc => paths.link(doc.meta.id),
    open: doc => openLink(doc.meta.id),
    Mark: LinkMark,
    Preview: LinkPreview,
  },
];
