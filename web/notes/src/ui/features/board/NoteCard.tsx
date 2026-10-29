/**
 * One card of the wall: a sheet in its own organic outline, kept for life (from
 * its id, `outline.ts`), grained, lifted off the wall; a coloured note is a sheet
 * washed in its pigment or a gradient over its paper, a collection wears its cut-out.
 *
 * Its box is decided by the wall from what it shows (`layoutCard`), so the
 * card's job is to fill that box exactly: the title and body are cut to the
 * lines the wall counted, checklists show their open lines first, and
 * everything is set at one size with the title heavier (a formatted body's
 * marks as written, its headings bold lines of that size). Each part subscribes to exactly the slice
 * it draws, so ticking a box on one checklist re-renders that card and no other.
 *
 * The whole card is one link (a middle click opens the note in a tab); shift or
 * ctrl/cmd click, or the corner pebble, selects instead. Under a finger it is the
 * phone's card (`gestures.ts`): a hold picks it, a sideways drag archives it.
 */
import { memo, type CSSProperties, type MouseEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { pebbleTurn } from '@unlease/design/pebbles';
import { t } from '@unlease/core/i18n';
import { asLineColor, isLineColor, isNoteGradient, isRuledPattern, type NotePattern } from '@unlease/design/colors';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';
import { cardBody, COLLECTION_CARD, drawingCardHeight, footerShowsLabelNames, layoutCard, MAX_CHECK_ROWS, photoHeight, THUMBS_PER_STRIP, thumbSize, type WallMetrics } from '@unlease/notes/services/wall';
import { noteDrawingRatio } from '@unlease/notes/services/drawing';
import { bodyText, linesText, noteCardLines } from '@unlease/notes/services/noteBody';
import { matchRanges } from '@unlease/core/services/search';
import { formatPrice, formatReminder, plural, totalPrice } from '@unlease/core/services/format';

import { useBlobUrl } from '../../../app/media/images';
import { useLibraryStore, type LibraryState } from '../../../app/store/library';
import { EmblemStone } from '../../components/Emblem';
import { Highlight } from '../../components/Highlight';
import { Icon } from '../../components/Icon';
import { LabelMark, LabelTag } from '../../components/LabelMark';
import { OutlineEdge, OutlineRing, PebbleEdge, outlineD, outlineVars } from '../../components/Outline';
import { browserPath, isPlainClick, paths } from '../../router';
import { DrawingPreview } from '../drawing/DrawingPreview';
import { CardLines } from '../note/NoteLines';
import styles from './board.module.css';
import { useCardGestures } from './gestures';
import { shapeOf } from './wallLayout';

/** The tick's pebble, the phone's. */
const TICK_TURN = 2;

export interface NoteCardProps {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly metrics: WallMetrics;
  readonly query: string;
  readonly selected: boolean;
  readonly now: number;
  readonly onOpen: (id: string) => void;
  readonly onSelect: (id: string, event: MouseEvent) => void;
  /** The wall lets cards swipe (nothing picked, no search); "Non classé" and the bin never do. */
  readonly swipe: boolean;
  readonly onSwiped: (id: string) => void;
  /** Gone from the wall: drawn a moment longer, out of reach, while it fades. */
  readonly leaving?: boolean;
}

function NoteCardComponent({ id, left, top, width, height, metrics, query, selected, now, onOpen, onSelect, swipe, onSwiped, leaving = false }: NoteCardProps) {
  const note = useLibraryStore(s => s.notes[id]);
  const hasPhoto = useLibraryStore(s => (s.attachmentsByNote[id]?.length ?? 0) > 0);
  // The lines the wall counted when it sized this card: the text is cut to exactly those.
  const lines = useLibraryStore(
    useShallow(s => {
      const shape = shapeOf(s, id);
      const layout = shape ? layoutCard(shape, metrics) : null;
      return { title: layout?.title ?? 0, body: layout?.body ?? 0 };
    }),
  );
  const gestures = useCardGestures({
    id,
    width,
    swipeable: swipe && !leaving && id !== INBOX_ID && note?.trashedAt === null,
    onPick: onSelect,
    onSwiped,
  });
  if (!note) return null;

  const title = shownTitle(note).trim();
  // A formatted body shows as written at the card's size; a plain one as typed.
  const formatted = noteCardLines(note);
  const body = note.kind === 'text' && !formatted ? cardBody(note.body) : '';
  const isLine = note.kind === 'links';
  const label = title || bodyText(note).trim().slice(0, 80) || (isLine ? t('Collection') : note.kind === 'drawing' ? t('Dessin') : t('Note sans titre'));
  const drawing = noteDrawingRatio(note);
  const href = isLine ? paths.line(id) : paths.note(id);
  // The card's outline, the same for every card: the sheet is clipped to it, the card lifts it.
  const d = outlineD('card', width, height);
  const style: CSSProperties = { left, top, width, height };

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      onSelect(id, event);
      return;
    }
    if (!isPlainClick(event)) return;
    event.preventDefault();
    onOpen(id);
  };

  return (
    <article
      className={styles.card}
      style={style}
      data-selected={selected || undefined}
      data-note-id={id}
      data-leaving={leaving || undefined}
      inert={leaving}
      aria-hidden={leaving || undefined}
      {...gestures}
    >
      <div
        className={`${styles.sheet} paper`}
        style={outlineVars(d)}
        data-line={!isLine && isLineColor(note.color) ? note.color : undefined}
        data-gradient={!isLine && isNoteGradient(note.color) ? note.color : undefined}
      >
        {!isLine && note.pattern ? <CardPaper pattern={note.pattern} top={(hasPhoto ? photoHeight(metrics) : 0) + metrics.padding} checklist={note.kind === 'checklist'} titled={!!title} metrics={metrics} /> : null}
        <a className={styles.hit} href={browserPath(href)} onClick={onClick} aria-label={label} data-card-link={id} />
        {!isLine ? <CardPhoto noteId={id} height={photoHeight(metrics)} /> : null}
        {drawing !== null ? <DrawingPreview data={note.drawing} height={drawingCardHeight(metrics, drawing)} /> : null}
        <div className={isLine ? `${styles.content} ${styles.lineContent}` : styles.content}>
          {isLine ? (
            <LineHead noteId={id} query={query} lines={lines.title} />
          ) : title && lines.title > 0 ? (
            <h3 className={`${styles.title} t-card-title`} style={{ WebkitLineClamp: lines.title }}>
              <Highlight text={title} query={query} />
            </h3>
          ) : null}
          {lines.body > 0 && formatted && formatted.length > 0 ? (
            <p className={`${styles.body} t-card-body`} style={{ WebkitLineClamp: lines.body }}>
              <CardLines lines={formatted} ranges={query.trim() ? matchRanges(linesText(formatted), query) : undefined} />
            </p>
          ) : lines.body > 0 && body ? (
            <p className={`${styles.body} t-card-body`} style={{ WebkitLineClamp: lines.body }}>
              <Highlight text={body} query={query} />
            </p>
          ) : null}
          {note.kind === 'checklist' ? <CardChecklist noteId={id} query={query} /> : null}
          {isLine ? <LineSummary noteId={id} metrics={metrics} /> : null}
        </div>
        {note.labelIds.length > 0 || note.reminderAt !== null ? <CardFooter labelIds={note.labelIds} reminderAt={note.reminderAt} now={now} names={footerShowsLabelNames(metrics, note.reminderAt !== null)} /> : null}
        {/* The hairline edge, and the selection ring, drawn above the photo, so a photo card shows them too. */}
        <OutlineEdge d={d} />
      </div>
      <OutlineRing kind="card" width={width} height={height} className={styles.focusRing} />
      <button
        type="button"
        className={styles.select}
        data-pebble-under={TICK_TURN}
        data-still
        aria-pressed={selected}
        aria-label={selected ? t('Désélectionner « {title} »', { title: label }) : t('Sélectionner « {title} »', { title: label })}
        data-tip={selected ? t('Désélectionner') : t('Sélectionner')}
        onClick={event => onSelect(id, event)}
      >
        <Icon name="check" size={15} />
        <PebbleEdge turn={TICK_TURN} />
      </button>
    </article>
  );
}

/** The card's paper; a ruled one's lines fall under its text, or under its checklist's rows. */
function CardPaper({ pattern, top, checklist, titled, metrics }: { pattern: NotePattern; top: number; checklist: boolean; titled: boolean; metrics: WallMetrics }) {
  const pitch = checklist ? metrics.checkRow : metrics.lineHeight;
  const first = checklist ? top + (titled ? metrics.lineHeight : 0) + metrics.checkRow - 3 : top + metrics.lineHeight - 3;
  const style = { '--pitch': `${pitch}px`, backgroundPosition: `0 ${(((first - pitch + 1) % pitch) + pitch) % pitch}px` } as CSSProperties;
  return <span className={styles.paperLayer} data-pattern={pattern} style={isRuledPattern(pattern) ? style : undefined} aria-hidden="true" />;
}

const firstPhoto = (s: LibraryState, noteId: string): string | null => {
  for (const aid of s.attachmentsByNote[noteId] ?? []) {
    const attachment = s.attachments[aid];
    if (attachment) return attachment.id;
  }
  return null;
};

const CardPhoto = memo(function CardPhoto({ noteId, height }: { noteId: string; height: number }) {
  const photoId = useLibraryStore(s => firstPhoto(s, noteId));
  const uploaded = useLibraryStore(s => (photoId ? (s.attachments[photoId]?.uploaded ?? false) : false));
  const url = useBlobUrl(photoId, 'display', uploaded);
  if (!photoId) return null;
  return (
    <div className={styles.photo} style={{ height }}>
      {url ? <img src={url} alt="" decoding="async" draggable={false} /> : null}
    </div>
  );
});

const CardChecklist = memo(function CardChecklist({ noteId, query }: { noteId: string; query: string }) {
  const { open, checked } = useLibraryStore(
    useShallow(s => {
      const ids = s.checksByNote[noteId] ?? [];
      const texts: string[] = [];
      let done = 0;
      for (const cid of ids) {
        const item = s.checks[cid];
        if (!item) continue;
        if (item.checked) done += 1;
        else if (item.text.trim() && texts.length < MAX_CHECK_ROWS) texts.push(item.text);
      }
      return { open: texts.join('\u0000'), checked: done };
    }),
  );
  const rows = open ? open.split('\u0000') : [];
  return (
    <ul>
      {rows.map((text, index) => (
        <li key={index} className={styles.checkRow}>
          <Icon name="box" size={16} />
          <span className={`${styles.checkText} t-card-body`}>
            <Highlight text={text} query={query} />
          </span>
        </li>
      ))}
      {checked > 0 ? (
        <li className={styles.checkRow}>
          <Icon name="check" size={16} />
          <span className="t-meta">{plural(checked, 'élément coché', 'éléments cochés')}</span>
        </li>
      ) : null}
    </ul>
  );
});

const LineHead = memo(function LineHead({ noteId, query, lines }: { noteId: string; query: string; lines: number }) {
  const note = useLibraryStore(s => s.notes[noteId]);
  if (!note) return null;
  return (
    <div className={styles.lineHead}>
      <EmblemStone id={noteId} emblem={collectionEmblem(noteId, note.emblem)} color={asLineColor(note.color)} size={COLLECTION_CARD.emblem} width={COLLECTION_CARD.stoneWidth} height={COLLECTION_CARD.stoneHeight} />
      {lines > 0 ? (
        <h3 className={`${styles.lineTitle} t-card-title`} style={{ WebkitLineClamp: lines }}>
          <Highlight text={shownTitle(note)} query={query} />
        </h3>
      ) : null}
    </div>
  );
});

const LineSummary = memo(function LineSummary({ noteId, metrics }: { noteId: string; metrics: WallMetrics }) {
  const { thumbs, count, total } = useLibraryStore(
    useShallow(s => {
      const open = (s.linksByNote[noteId] ?? []).map(lid => s.links[lid]).filter(link => !!link && !link.done);
      const images = open
        .filter(link => link!.imageIds.length > 0)
        .slice(0, THUMBS_PER_STRIP)
        .map(link => link!.imageIds[0]!);
      const sum = totalPrice(open.map(link => ({ price: link!.price, currency: link!.currency })));
      return { thumbs: images.join(','), count: open.length, total: sum ? formatPrice(sum.amount, sum.currency) : '' };
    }),
  );
  const size = thumbSize(metrics);
  return (
    <div className={styles.summary}>
      {thumbs ? (
        <div className={styles.thumbs}>
          {thumbs.split(',').map((blobId, index) => (
            <Thumb key={blobId} blobId={blobId} size={size} index={index} />
          ))}
        </div>
      ) : null}
      <p className="t-meta tabular">{total ? `${plural(count, 'lien')} · ${total}` : plural(count, 'lien')}</p>
    </div>
  );
});

/** A picture cropped to a pebble, each its neighbour's other turn, as the phone's. */
const Thumb = memo(function Thumb({ blobId, size, index }: { blobId: string; size: number; index: number }) {
  const url = useBlobUrl(blobId);
  return (
    <div className={styles.thumb} data-pebble={pebbleTurn(index)} data-still style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" decoding="async" draggable={false} /> : null}
    </div>
  );
});

/** A reminder and the labels; on a narrow card beside a reminder, the labels are their tags alone (named in the tooltip). */
const CardFooter = memo(function CardFooter({ labelIds, reminderAt, now, names }: { labelIds: readonly string[]; reminderAt: number | null; now: number; names: boolean }) {
  const labels = useLibraryStore(useShallow(s => labelIds.map(lid => s.labels[lid]).filter(label => !!label && label.deletedAt === null)));
  return (
    <div className={styles.footer}>
      {reminderAt !== null ? (
        <span className={`${styles.chip} t-meta`}>
          <Icon name="bell" size={13} />
          {formatReminder(reminderAt, now)}
        </span>
      ) : null}
      {labels.slice(0, 3).map(label =>
        names ? (
          <LabelMark key={label!.id} name={label!.name} color={label!.color} className={styles.footerLabel} />
        ) : (
          <span key={label!.id} className={styles.footerTag} data-tip={label!.name} role="img" aria-label={label!.name}>
            <LabelTag color={label!.color} />
          </span>
        ),
      )}
    </div>
  );
});

export const NoteCard = memo(NoteCardComponent);
