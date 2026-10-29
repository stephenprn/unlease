/**
 * A note, a collection, a link or a page shown in a page. As a bookmark: one card, its picture on
 * the left (the link's, the note's first photo, the collection's cut-out, the page's emoji), its
 * name and a glimpse of what it holds; it opens in a new tab (a page in place). Embedded: all of
 * it, to work with in place: a note's title and text (formatted from the bar over selected words,
 * as in its editor), its list (ticked here) or its drawing, a collection's links to do (as a list or
 * a table; those done too, if asked), a link's picture, facts and stamp, a page's first lines.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { RICH_KINDS, UNTITLED_PAGE, type Block, type BlockTarget, type CollectionView } from '@unlease/notes/models/blocks';
import { asLineColor, isLineColor, isNoteGradient } from '@unlease/design/colors';
import { shownHint, shownTitle } from '@unlease/notes/models/entities';
import { noteDrawingRatio } from '@unlease/notes/services/drawing';
import { formatDay, formatPrice, plural } from '@unlease/core/services/format';
import { linkRowText } from '@unlease/notes/services/linkRow';
import { bodyText } from '@unlease/notes/services/noteBody';
import { markupToPlain } from '@unlease/core/services/richText';
import { prettyUrl } from '@unlease/core/services/url';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';
import { dateWords } from '@unlease/core/services/dates';

import { lineLinkIds } from '../../../app/hooks/useLines';
import { useMinute } from '../../../app/hooks/useMinute';
import { mentionLabel, targetTitle } from '../../../app/hooks/usePages';
import { useBlobUrl } from '../../../app/media/images';
import { saveTypedText } from '../../../app/store/actions';
import { useLibraryStore, type LibraryState } from '../../../app/store/library';
import { setCollectionView } from '../../../app/store/pages';
import { onBeforePause } from '../../../app/sync/loop';
import { Button } from '../../components/Button';
import { Emblem } from '../../components/Emblem';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { OutlineLift } from '../../components/Outline';
import { Segmented, type SegmentedOption } from '../../components/Segmented';
import { Stamp, stampWord } from '../../components/Stamp';
import { openLink } from '../../commands';
import { browserPath, isPlainClick, navigate } from '../../router';
import { KIND_ICONS } from '../links/kindIcon';
import { LinkRow, toggleDone } from '../links/LinkRow';
import { useFilingMotion } from '../links/useFilingMotion';
import { ChecklistEditor } from '../note/ChecklistEditor';
import { DrawingFit } from '../note/DrawingFit';
import { PhotoGrid } from '../note/PhotoGrid';
import { RichBody } from '../note/RichBody';
import { useAutoGrow } from '../note/useAutoGrow';
import { CollectionTable, ColumnsButton } from './CollectionTable';
import { targetPath } from './mentions';
import { usePageContext } from './PageContext';
import styles from './pages.module.css';

/** Opens what a bookmark or an embed shows: a page here, anything else in a new tab. */
export function openTarget(event: MouseEvent | null, target: BlockTarget): void {
  const path = targetPath(useLibraryStore.getState(), target);
  if (target.type === 'page' && (!event || isPlainClick(event))) {
    event?.preventDefault();
    navigate(path);
    return;
  }
  event?.preventDefault();
  window.open(browserPath(path), '_blank', 'noopener');
}

/** The first words of what a note, a collection, a link or a page holds. */
function glimpse(s: LibraryState, target: BlockTarget): { readonly text: string; readonly meta: string; readonly picture: string | null } {
  switch (target.type) {
    case 'note': {
      const note = s.notes[target.id];
      if (!note) return { text: '', meta: '', picture: null };
      if (note.kind === 'links') {
        const ids = (s.linksByNote[target.id] ?? []).filter(id => s.links[id] && !s.links[id]!.done);
        const titles = ids.slice(0, 3).map(id => s.links[id]!.title || prettyUrl(s.links[id]!.url));
        const picture = ids.map(id => s.links[id]!.imageIds[0]).find(Boolean) ?? null;
        return { text: shownHint(note) || titles.join(' · '), meta: t('Collection · {links}', { links: plural(ids.length, 'lien') }), picture };
      }
      const items = (s.checksByNote[target.id] ?? []).flatMap(id => (s.checks[id] && !s.checks[id]!.checked ? [s.checks[id]!.text] : []));
      const picture = s.attachmentsByNote[target.id]?.[0] ?? null;
      const text = note.kind === 'checklist' ? items.slice(0, 4).join(' · ') : note.kind === 'drawing' ? '' : bodyText(note).slice(0, 280);
      return { text, meta: note.kind === 'checklist' ? t('Liste') : note.kind === 'drawing' ? t('Dessin') : t('Note'), picture };
    }
    case 'link': {
      const link = s.links[target.id];
      if (!link) return { text: '', meta: '', picture: null };
      const { source } = linkRowText(link);
      return { text: link.summary || prettyUrl(link.url), meta: [source, link.price !== null ? formatPrice(link.price, link.currency) : null].filter(Boolean).join(' · ') || t('Lien'), picture: link.imageIds[0] ?? null };
    }
    case 'page': {
      let text = '';
      for (const id of s.blocksByParent[target.id] ?? []) {
        const block = s.blocks[id];
        if (block && RICH_KINDS.has(block.kind)) text += `${markupToPlain(block.text, mentionLabel, dateWords)} `;
        if (text.length > 280) break;
      }
      return { text: text.trim(), meta: t('Page'), picture: null };
    }
    default:
      // A type a newer client added (another app's): nothing to show of it here.
      return { text: '', meta: '', picture: null };
  }
}

/** The card's picture: a kept image, or the target's own mark on paper. */
function Picture({ target, blobId }: { target: BlockTarget; blobId: string | null }) {
  const url = useBlobUrl(blobId);
  const look = useLibraryStore(
    useShallow(s => {
      if (target.type === 'page') return { emoji: s.blocks[target.id]?.icon ?? null, emblem: null, color: null, glyph: 'page' as const };
      if (target.type === 'link') return { emoji: null, emblem: null, color: null, glyph: s.links[target.id] ? KIND_ICONS[s.links[target.id]!.kind] : ('link' as const) };
      const note = s.notes[target.id];
      if (note?.kind === 'links') return { emoji: null, emblem: collectionEmblem(note.id, note.emblem), color: asLineColor(note.color), glyph: 'collections' as const };
      return { emoji: null, emblem: null, color: null, glyph: note?.kind === 'checklist' ? ('checklist' as const) : note?.kind === 'drawing' ? ('draw' as const) : ('note' as const) };
    }),
  );
  if (url) return <img src={url} alt="" loading="lazy" decoding="async" draggable={false} />;
  if (look.emoji) return <span className={styles.bookmarkEmoji}>{look.emoji}</span>;
  if (look.emblem) return <Emblem emblem={look.emblem} color={look.color} size={44} />;
  return <Icon name={look.glyph} size={30} />;
}

function Bookmark({ target }: { target: BlockTarget }) {
  const title = useLibraryStore(s => targetTitle(s, target));
  const seen = useLibraryStore(useShallow(s => glimpse(s, target)));
  if (title === null) return <GoneCard target={target} />;
  return (
    <OutlineLift lift="card" raise>
      <a className={`${styles.bookmark} paper`} data-outline="frame" data-edge href={browserPath(targetPath(useLibraryStore.getState(), target))} onClick={event => openTarget(event, target)}>
        <span className={styles.bookmarkPicture}>
          <Picture target={target} blobId={seen.picture} />
        </span>
        <span className={styles.bookmarkText}>
          <span className={`${styles.bookmarkTitle} t-body-strong`}>{title}</span>
          {seen.text ? <span className={`${styles.bookmarkGlimpse} t-meta`}>{seen.text}</span> : null}
          <span className={`${styles.bookmarkMeta} t-meta-strong`}>{seen.meta}</span>
        </span>
      </a>
    </OutlineLift>
  );
}

function GoneCard({ target }: { target: BlockTarget }) {
  const gone = target.type === 'page' ? t('Cette page n’existe plus.') : target.type === 'link' ? t('Ce lien n’existe plus.') : t('Cette note n’existe plus.');
  return (
    <div className={styles.goneCard} data-outline="frame">
      <Icon name="info" size={20} />
      <span className="t-meta">{gone}</span>
    </div>
  );
}

const SAVE_DELAY_MS = 350;

/** An embedded drawing stops at this height (its top shows; the note opens whole). */
const DRAWING_MAX = 520;

/** A note's title or text, typed here as in its own editor (merged with another device's edit). */
function NoteField({ id, field, className, placeholder }: { id: string; field: 'title' | 'body'; className: string; placeholder: string }) {
  const stored = useLibraryStore(s => s.notes[id]?.[field] ?? '');
  const [draft, setDraft] = useState<string | null>(null);
  const since = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const value = draft ?? stored;
  useAutoGrow(area, value);
  const flush = useCallback((): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const typed = area.current?.value;
    if (since.current === null || typed === undefined) return;
    saveTypedText('note', id, field, since.current, field === 'title' ? typed.replace(/\r?\n/g, ' ') : typed);
    since.current = null;
    setDraft(null);
  }, [id, field]);
  const flushRef = useRef(flush);
  useLayoutEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => onBeforePause(() => flushRef.current()), []);
  useEffect(() => () => flushRef.current(), []);
  return (
    <textarea
      ref={area}
      className={className}
      value={value}
      rows={1}
      placeholder={placeholder}
      aria-label={field === 'title' ? t('Titre de la note') : t('Texte de la note')}
      maxLength={field === 'title' ? TEXT_LIMITS.note.title : TEXT_LIMITS.note.body}
      onChange={event => {
        if (since.current === null) since.current = stored;
        setDraft(event.target.value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
      }}
      onBlur={flush}
    />
  );
}

function NoteEmbed({ id }: { id: string }) {
  const note = useLibraryStore(s => s.notes[id]);
  if (!note) return null;
  const editable = note.trashedAt === null;
  const drawing = noteDrawingRatio(note);
  return (
    <OutlineLift lift="card">
      <div className={`${styles.embedNote} paper`} data-outline="card" data-edge data-line={isLineColor(note.color) ? note.color : undefined} data-gradient={isNoteGradient(note.color) ? note.color : undefined}>
        <IconButton icon="external" label={t('Ouvrir la note')} compact size={18} className={styles.embedOpen} onClick={() => openTarget(null, { type: 'note', id })} />
        <PhotoGrid noteId={id} editable={editable} />
        <NoteField id={id} field="title" className={`${styles.embedTitle} t-editor-title`} placeholder={t('Titre')} />
        {note.kind === 'checklist' ? (
          <ChecklistEditor noteId={id} editable={editable} />
        ) : note.kind === 'drawing' ? (
          drawing !== null ? <DrawingFit data={note.drawing} ratio={drawing} max={DRAWING_MAX} /> : null
        ) : (
          <RichBody noteId={id} editable={editable} className={`${styles.embedBody} t-editor-body`} placeholder={t('Note')} label={t('Texte de la note')} />
        )}
      </div>
    </OutlineLift>
  );
}

const viewOptions = (): readonly SegmentedOption<CollectionView>[] => [
  { value: 'list', label: t('Liste'), icon: 'list' },
  { value: 'table', label: t('Tableau'), icon: 'table' },
];

/**
 * A collection's links to do, as a list of rows or as a table of their properties (the embed's
 * `view`), then, when the embed shows them (`showDone`), those done under « Déjà faits »: one list,
 * as on its own screen, so a link stamped here files itself there.
 */
function CollectionEmbed({ block, id }: { block: Block; id: string }) {
  const { page, readOnly } = usePageContext();
  const line = useLibraryStore(s => s.notes[id]);
  const { showDone } = block;
  const order = useCallback(
    (s: LibraryState): string => {
      const { open, done } = lineLinkIds(s, id);
      return `${open.join(',')}|${showDone ? done.join(',') : ''}`;
    },
    [id, showDone],
  );
  const joined = useLibraryStore(order);
  const { ids, doneIds, shownIds } = useMemo(() => {
    const [open = '', done = ''] = joined.split('|');
    const lists = { ids: open ? open.split(',') : [], doneIds: done ? done.split(',') : [] };
    return { ...lists, shownIds: [...lists.ids, ...lists.doneIds] };
  }, [joined]);
  const list = useRef<HTMLUListElement>(null);
  useFilingMotion(list, order);
  const now = useMinute();
  if (!line) return null;
  // One flat run of keyed rows: a row changing sides is moved, never remounted, so its stamp lands.
  const rows = [
    ...ids.map(lid => <LinkRow key={lid} id={lid} now={now} onOpen={openLink} />),
    ...(doneIds.length > 0
      ? [
          <li key="done-heading" className={`${styles.embedDoneHeading} t-section`} data-flip="done-heading">
            {t('Déjà faits · {count}', { count: doneIds.length })}
          </li>,
        ]
      : []),
    ...doneIds.map(lid => <LinkRow key={lid} id={lid} now={now} onOpen={openLink} />),
  ];
  return (
    <OutlineLift lift="card">
      <div className={`${styles.embedCollection} paper`} data-outline="card" data-edge>
        <div className={styles.embedHead}>
          <a className={styles.embedName} href={browserPath(targetPath(useLibraryStore.getState(), { type: 'note', id }))} onClick={event => openTarget(event, { type: 'note', id })}>
            <Emblem emblem={collectionEmblem(id, line.emblem)} color={asLineColor(line.color)} size={34} />
            <span className="t-title">{shownTitle(line)}</span>
          </a>
          <span className="t-meta">{plural(ids.length, 'lien')}</span>
          {readOnly ? null : (
            <span className={styles.embedTools}>
              <span className={styles.embedViews}>
                <Segmented options={viewOptions()} value={block.view} label={t('Afficher la collection en')} onChange={view => setCollectionView(page, block.id, view)} />
              </span>
              {block.view === 'table' ? <ColumnsButton block={block} ids={shownIds} /> : null}
            </span>
          )}
        </div>
        {block.view === 'table' ? (
          <CollectionTable block={block} lineId={id} name={shownTitle(line)} ids={ids} done={doneIds} />
        ) : rows.length > 0 ? (
          <ul ref={list} className={styles.embedLinks} aria-label={t('Liens de {name}', { name: shownTitle(line) })}>
            {rows}
          </ul>
        ) : (
          <p className={`${styles.embedEmpty} t-meta`}>{t('Aucun lien à faire dans cette collection.')}</p>
        )}
      </div>
    </OutlineLift>
  );
}

function LinkEmbed({ id }: { id: string }) {
  const link = useLibraryStore(s => s.links[id]);
  const picture = useBlobUrl(link?.imageIds[0]);
  const now = useMinute();
  if (!link) return null;
  const { source, title, facts } = linkRowText(link);
  return (
    <OutlineLift lift="card">
      <div className={`${styles.embedLink} paper`} data-outline="card" data-edge>
        <div className={styles.embedLinkFrame} data-outline="frame" data-edge>
          {picture || link.imageUrl ? <img src={picture ?? link.imageUrl ?? undefined} alt="" referrerPolicy="no-referrer" draggable={false} /> : <Icon name={KIND_ICONS[link.kind]} size={32} />}
          {link.done && link.doneAt !== null ? (
            <span className={styles.embedStamp}>
              <Stamp kind={link.kind} date={formatDay(link.doneAt, now)} />
            </span>
          ) : null}
        </div>
        <div className={styles.embedLinkText}>
          {source || link.price !== null ? <span className="t-meta-strong">{[source, link.price !== null ? formatPrice(link.price, link.currency) : null].filter(Boolean).join(' · ')}</span> : null}
          <span className="t-title">{title}</span>
          {link.summary ? <p className="t-body">{link.summary}</p> : null}
          {facts.length > 0 ? <span className="t-meta">{facts.join(' · ')}</span> : null}
          <span className={styles.embedLinkActions}>
            <Button kind="filled" small icon="external" href={link.url}>
              {t('Ouvrir la page')}
            </Button>
            <Button kind="tonal" small icon="stamp" onClick={() => toggleDone(id)}>
              {link.done ? t('Remettre à faire') : stampWord(link.kind)}
            </Button>
            <Button kind="text" small onClick={() => openLink(id)}>
              {t('Détails')}
            </Button>
          </span>
        </div>
      </div>
    </OutlineLift>
  );
}

function PageEmbed({ id }: { id: string }) {
  const page = useLibraryStore(s => s.blocks[id]);
  const seen = useLibraryStore(useShallow(s => glimpse(s, { type: 'page', id })));
  if (!page) return null;
  return (
    <OutlineLift lift="card" raise>
      <a className={`${styles.embedPage} paper`} data-outline="card" data-edge href={browserPath(targetPath(useLibraryStore.getState(), { type: 'page', id }))} onClick={event => openTarget(event, { type: 'page', id })}>
        <span className="t-title">
          {page.icon ? `${page.icon} ` : ''}
          {page.text.trim() || t(UNTITLED_PAGE)}
        </span>
        <span className="t-body">{seen.text || t('Page vide')}</span>
      </a>
    </OutlineLift>
  );
}

function Embed({ block, target }: { block: Block; target: BlockTarget }) {
  const kind = useLibraryStore(s => (targetTitle(s, target) === null ? 'gone' : target.type === 'note' && s.notes[target.id]?.kind === 'links' ? 'collection' : target.type));
  switch (kind) {
    case 'gone':
      return <GoneCard target={target} />;
    case 'collection':
      return <CollectionEmbed block={block} id={target.id} />;
    case 'note':
      return <NoteEmbed id={target.id} />;
    case 'link':
      return <LinkEmbed id={target.id} />;
    default:
      return <PageEmbed id={target.id} />;
  }
}

function TargetBlockComponent({ block }: { block: Block }) {
  if (!block.target) return <GoneCard target={{ type: 'note', id: '' }} />;
  return <div contentEditable={false}>{block.kind === 'bookmark' ? <Bookmark target={block.target} /> : <Embed block={block} target={block.target} />}</div>;
}

export const TargetBlock = memo(TargetBlockComponent);
