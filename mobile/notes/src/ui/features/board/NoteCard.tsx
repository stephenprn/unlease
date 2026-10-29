/**
 * One wall card: a sheet in its own organic outline (kept for life, from its id), washed in the
 * note's colour or gradient, over its paper. The wall decides its height from what it shows (`layoutCard`), and
 * the title and body are cut to the lines it counted. Each part subscribes to exactly the slice
 * it draws: ticking a box re-renders that list only.
 */
import React, { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { FadeIn, FadeOut, Keyframe } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { noteBackdrop, type PaperRule } from '@unlease/design/backgrounds';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { pebbleTurn } from '@unlease/design/pebbles';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { shownTitle } from '@unlease/notes/models/entities';
import { cardBody, cardInnerWidth, COLLECTION_CARD, drawingCardHeight, footerShowsLabelNames, layoutCard, MAX_CHECK_ROWS, photoHeight, THUMBS_PER_STRIP, thumbSize, type WallMetrics } from '@unlease/notes/services/wall';
import { noteDrawingRatio } from '@unlease/notes/services/drawing';
import { bodyText, noteCardLines } from '@unlease/notes/services/noteBody';
import { formatPrice, formatReminder, plural, totalPrice } from '@unlease/core/services/format';
import { matchRanges } from '@unlease/core/services/search';
import { useBlobSource } from '@app/hooks/useImageSource';
import { useLibraryStore, type LibraryState } from '@app/store/libraryStore';

import { AnimatedOrganic, AppText, EmblemStone, Grain, Icon, LabelMark, LabelTag, Organic, Tappable } from '../../components';
import { decelerate, duration, listPressDelay, standard } from '../../theme/motion';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { DrawingPreview } from '../drawing/DrawingPreview';
import { CardNoteText } from '../note/noteText';
import { shapeOf } from './wallLayout';

/** Picked: the ring is laid on and the tick pebble is pinned over the corner; let go, both lift off. */
const RING_IN = FadeIn.duration(duration.short).easing(standard);
const RING_OUT = FadeOut.duration(100);
const TICK_IN = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 0.5 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } }).duration(duration.medium);

export interface NoteCardProps {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly metrics: WallMetrics;
  readonly query: string;
  readonly selected: boolean;
  readonly onPress: (id: string) => void;
  readonly onLongPress: (id: string) => void;
}

/** An untitled text's name for TalkBack: its opening words, whole ones, as the card shows them first. */
function firstWords(body: string, most = 60): string {
  const text = body.trim().replace(/\s+/g, ' ');
  if (text.length <= most) return text;
  const cut = text.slice(0, most);
  const space = cut.lastIndexOf(' ');
  return space > 0 ? cut.slice(0, space) : cut;
}

/** Ruled lines under a card's text: on the card's 21dp lines, or its checklist's 24dp rows. */
function cardRule(metrics: WallMetrics, top: number, checklist: boolean, titled: boolean): PaperRule {
  if (checklist) return { pitch: metrics.checkRow, offset: top + (titled ? metrics.lineHeight : 0) + metrics.checkRow - 3 };
  return { pitch: metrics.lineHeight, offset: top + metrics.lineHeight - 3 };
}

function NoteCardComponent({ id, width, height, metrics, query, selected, onPress, onLongPress }: NoteCardProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
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
  // Read out with the card (TalkBack reads its label alone), so a footer showing only the tags loses no name.
  const labelNames = useLibraryStore(
    useShallow(s => (s.notes[id]?.labelIds ?? []).map(lid => s.labels[lid]).flatMap(label => (label && label.deletedAt === null ? [label.name] : []))),
  );
  // The card's outline, the same for every card: every layer is drawn in it (`Organic`).
  const outline = 'card';
  if (!note) return null;

  const collection = note.kind === 'links';
  const title = shownTitle(note).trim();
  // A formatted body shows as written (its lines, as the wall sized them); a plain one as its text.
  const formatted = noteCardLines(note);
  const body = note.kind === 'text' && !formatted ? cardBody(note.body) : '';
  const photo = !collection && hasPhoto ? photoHeight(metrics) : 0;
  const drawing = noteDrawingRatio(note);
  const drawn = drawing !== null ? drawingCardHeight(metrics, drawing) : 0;
  const backdrop = collection
    ? noteBackdrop(theme.mode, null, null)
    : noteBackdrop(theme.mode, note.color, note.pattern, cardRule(metrics, photo + drawn + metrics.padding, note.kind === 'checklist', !!title));
  // Untitled, a checklist reads as a list (its items are not in the label), a text by its first words.
  const named = title || (note.kind === 'checklist' ? t('Liste sans titre') : note.kind === 'drawing' ? t('Dessin') : firstWords(bodyText(note))) || t('Note sans titre');
  return (
    <Organic outline={outline} style={[styles.card, { width, height }]}>
      <Organic outline={outline} style={[styles.clip, backdrop]}>
        <Grain width={width} height={height} />
        <Tappable
          // Its press lies inside the sheet, which clips it to the sheet's own shape.
          style={styles.press}
          unstable_pressDelay={listPressDelay}
          onPress={() => onPress(id)}
          onLongPress={() => onLongPress(id)}
          accessibilityLabel={labelNames.length > 0 ? `${named}, ${labelNames.length > 1 ? 'labels' : 'label'} ${labelNames.join(', ')}` : named}
          accessibilityState={{ selected }}
        >
          {!collection ? <CardPhoto noteId={id} width={width} height={photo} /> : null}
          {drawing !== null ? <DrawingPreview data={note.drawing} width={width} height={drawn} /> : null}
          <View style={styles.content}>
            {collection ? (
              <LineHeader noteId={id} title={title} lines={lines.title} query={query} />
            ) : title && lines.title > 0 ? (
              <AppText variant="cardTitle" numberOfLines={lines.title} textBreakStrategy="simple" highlight={matchRanges(title, query)}>
                {title}
              </AppText>
            ) : null}
            {lines.body > 0 && formatted && formatted.length > 0 ? (
              <CardNoteText lines={formatted} cut={lines.body} query={query} width={cardInnerWidth(metrics)} size={metrics.fontSize} />
            ) : lines.body > 0 && body ? (
              <AppText variant="cardBody" numberOfLines={lines.body} textBreakStrategy="simple" highlight={matchRanges(body, query)}>
                {body}
              </AppText>
            ) : null}
            {note.kind === 'checklist' ? <CardChecklist noteId={id} row={metrics.checkRow} /> : null}
            {collection ? <LineSummary noteId={id} metrics={metrics} /> : null}
          </View>
          {note.labelIds.length > 0 || note.reminderAt !== null ? (
            <CardFooter labelIds={note.labelIds} reminderAt={note.reminderAt} height={metrics.footer} names={footerShowsLabelNames(metrics, note.reminderAt !== null)} />
          ) : null}
        </Tappable>
      </Organic>
      {selected ? (
        // A ring laid over the sheet, so choosing a card never moves what is written on it.
        <AnimatedOrganic entering={RING_IN} exiting={RING_OUT} pointerEvents="none" outline={outline} style={[StyleSheet.absoluteFill, styles.ring]}>
          <AnimatedOrganic entering={TICK_IN} pebble={2} style={styles.tick}>
            <Icon name="check" size={16} color={theme.color.onLeaf} />
          </AnimatedOrganic>
        </AnimatedOrganic>
      ) : null}
    </Organic>
  );
}

const firstPhoto = (s: LibraryState, noteId: string) => {
  const ids = s.attachmentsByNote[noteId] ?? [];
  for (const aid of ids) {
    const attachment = s.attachments[aid];
    if (attachment) return attachment.id;
  }
  return null;
};

const CardPhoto = memo(function CardPhotoView({ noteId, width, height }: { noteId: string; width: number; height: number }) {
  const photoId = useLibraryStore(s => firstPhoto(s, noteId));
  const source = useBlobSource(photoId);
  const theme = useTheme();
  if (!photoId) return null;
  return (
    <View style={{ width, height, backgroundColor: theme.color.paperHigh }}>
      {source ? <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
    </View>
  );
});

/** `row` is the wall's own row height, so the list takes exactly the room it was given. */
const CardChecklist = memo(function CardChecklistView({ noteId, row }: { noteId: string; row: number }) {
  const theme = useTheme();
  const { open, checked } = useLibraryStore(
    useShallow(s => {
      const ids = s.checksByNote[noteId] ?? [];
      const openTexts: string[] = [];
      let done = 0;
      for (const cid of ids) {
        const item = s.checks[cid];
        if (!item) continue;
        if (item.checked) done += 1;
        else if (item.text.trim() && openTexts.length < MAX_CHECK_ROWS) openTexts.push(item.text);
      }
      return { open: openTexts.join('\u0000'), checked: done };
    }),
  );
  const rows = open ? open.split('\u0000') : [];
  return (
    <View>
      {rows.map((text, index) => (
        <View key={index} style={[checklistStyles.row, { height: row }]}>
          <Icon name="box" size={16} color={theme.color.inkMuted} />
          <AppText variant="cardBody" numberOfLines={1} style={checklistStyles.text}>
            {text}
          </AppText>
        </View>
      ))}
      {checked > 0 ? (
        <View style={[checklistStyles.row, { height: row }]}>
          <Icon name="check" size={16} color={theme.color.inkMuted} />
          <AppText variant="meta">{plural(checked, 'élément coché', 'éléments cochés')}</AppText>
        </View>
      ) : null}
    </View>
  );
});

const LineHeader = memo(function LineHeaderView({ noteId, title, lines, query }: { noteId: string; title: string; lines: number; query: string }) {
  const note = useLibraryStore(s => s.notes[noteId]);
  if (!note) return null;
  return (
    <View style={lineStyles.header}>
      <EmblemStone id={noteId} emblem={collectionEmblem(noteId, note.emblem)} color={asLineColor(note.color)} size={COLLECTION_CARD.emblem} width={COLLECTION_CARD.stoneWidth} height={COLLECTION_CARD.stoneHeight} />
      {lines > 0 ? (
        <AppText variant="cardTitle" numberOfLines={lines} textBreakStrategy="simple" style={lineStyles.title} highlight={matchRanges(title, query)}>
          {title}
        </AppText>
      ) : null}
    </View>
  );
});

const LineSummary = memo(function LineSummaryView({ noteId, metrics }: { noteId: string; metrics: WallMetrics }) {
  const theme = useTheme();
  const { thumbs, count, total } = useLibraryStore(
    useShallow(s => {
      const ids = s.linksByNote[noteId] ?? [];
      const open = ids.map(lid => s.links[lid]).filter(link => !!link && !link.done);
      const images = open.filter(link => link!.imageIds.length > 0).slice(0, THUMBS_PER_STRIP).map(link => link!.imageIds[0]!);
      const sum = totalPrice(open.map(link => ({ price: link!.price, currency: link!.currency })));
      return { thumbs: images.join(','), count: open.length, total: sum ? formatPrice(sum.amount, sum.currency) : '' };
    }),
  );
  const size = thumbSize(metrics);
  return (
    <View style={lineStyles.summary}>
      {thumbs ? (
        <View style={lineStyles.thumbs}>
          {thumbs.split(',').map((blobId, index) => (
            <Thumb key={blobId} blobId={blobId} size={size} index={index} />
          ))}
        </View>
      ) : null}
      <AppText variant="meta" numberOfLines={1} color={theme.color.inkMuted}>
        {total ? `${plural(count, 'lien')} · ${total}` : plural(count, 'lien')}
      </AppText>
    </View>
  );
});

/** A link's picture cropped to a pebble: neighbours take different turns of it. */
const Thumb = memo(function ThumbView({ blobId, size, index }: { blobId: string; size: number; index: number }) {
  const source = useBlobSource(blobId);
  const theme = useTheme();
  return (
    <Organic pebble={pebbleTurn(index)} style={[lineStyles.thumb, { width: size, height: size, backgroundColor: theme.color.paperHigh }]}>
      {source ? <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </Organic>
  );
});

/** `names`: false on a narrow card with a reminder, where a name would be cut to a letter: the tags stand alone. */
const CardFooter = memo(function CardFooterView({ labelIds, reminderAt, height, names }: { labelIds: readonly string[]; reminderAt: number | null; height: number; names: boolean }) {
  const theme = useTheme();
  const labels = useLibraryStore(useShallow(s => labelIds.map(lid => s.labels[lid]).filter(l => !!l && l.deletedAt === null)));
  return (
    <View style={[footerStyles.footer, { height }]}>
      {reminderAt !== null ? (
        <Organic style={[footerStyles.chip, { borderColor: theme.color.outline }]}>
          <Icon name="bell" size={13} color={theme.color.inkMuted} />
          <AppText variant="meta" numberOfLines={1}>
            {formatReminder(reminderAt, Date.now())}
          </AppText>
        </Organic>
      ) : null}
      {labels.slice(0, 3).map(label =>
        names ? <LabelMark key={label!.id} name={label!.name} color={label!.color} /> : <LabelTag key={label!.id} color={label!.color} />,
      )}
    </View>
  );
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // The sheet lifts off the ground; its content is clipped by an inner layer, never the shadow.
    card: { boxShadow: theme.lift.card },
    clip: { flex: 1, overflow: 'hidden', borderWidth: 1, borderColor: theme.color.hairline },
    press: { flex: 1 },
    content: { flex: 1, paddingHorizontal: 14, paddingTop: 14, overflow: 'hidden' },
    ring: { borderWidth: 2.5, borderColor: theme.color.focus },
    // A matcha pebble pinned over the corner, ringed in the ground so it reads off the sheet.
    tick: { position: 'absolute', top: -8, right: -8, width: 26, height: 26, backgroundColor: theme.color.leaf, borderWidth: 2, borderColor: theme.color.wall, alignItems: 'center', justifyContent: 'center' },
  });

const checklistStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1 },
});

// core's COLLECTION_CARD: the wall sized the card to these.
const lineStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: COLLECTION_CARD.emblemGap, minHeight: COLLECTION_CARD.stoneHeight },
  title: { flex: 1 },
  summary: { gap: COLLECTION_CARD.stripGap, marginTop: COLLECTION_CARD.summaryGap, paddingBottom: 14 },
  thumbs: { flexDirection: 'row', gap: COLLECTION_CARD.thumbGap },
  thumb: { overflow: 'hidden' },
});

const footerStyles = StyleSheet.create({
  // As much paper under the tags as beside them: they sit inside the sheet, never on its edge.
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 12, overflow: 'hidden' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, ...corners(SHAPES.small), paddingHorizontal: 9, minHeight: 24 },
});

export const NoteCard = memo(NoteCardComponent);
