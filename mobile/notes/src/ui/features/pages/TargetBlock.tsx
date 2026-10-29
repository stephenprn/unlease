/**
 * A note, a collection, a link or a page shown in a page, on the phone. As a bookmark: one card,
 * the target's mark on its left (a link's picture in its 4:5 frame, a note's first photo, a
 * collection's emblem on its stone, a page's emoji), its name and a glimpse of what it holds. As
 * an embed: all of it, to read in place: a note as its own sheet (its title, then its text as
 * written, its drawing or the items still to do), a collection's links to do as their rows (those
 * done too, when asked), a link as its row and its summary. A press opens the target; a gone one
 * says so quietly.
 */
import React, { memo, useCallback, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { noteBackdrop, patternBackdrop } from '@unlease/design/backgrounds';
import { collectionEmblem } from '@unlease/notes/models/collections';
import type { GlyphName } from '@unlease/design/glyphs';
import { t } from '@unlease/core/i18n';
import { RICH_KINDS, UNTITLED_PAGE, type Block, type BlockTarget } from '@unlease/notes/models/blocks';
import { asLineColor, isRuledPattern } from '@unlease/design/colors';
import { shownHint, shownTitle } from '@unlease/notes/models/entities';
import { noteDrawingRatio } from '@unlease/notes/services/drawing';
import { formatPrice, plural } from '@unlease/core/services/format';
import { linkRowText } from '@unlease/notes/services/linkRow';
import { linesText, noteCardLines, noteLines } from '@unlease/notes/services/noteBody';
import { markupToPlain } from '@unlease/core/services/richText';
import { prettyUrl } from '@unlease/core/services/url';
import { MAX_DRAWING_RATIO } from '@unlease/notes/services/wall';
import { dateWords } from '@unlease/core/services/dates';
import { useBlobSource, type ImageSource } from '@app/hooks/useImageSource';
import { mentionLabel, targetTitle } from '@app/hooks/usePages';
import { useLibraryStore, type LibraryState } from '@app/store/libraryStore';

import { AppText, EmblemStone, Grain, Icon, IconButton, Organic, Tappable } from '../../components';
import { listPressDelay } from '../../theme/motion';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { DrawingPreview } from '../drawing/DrawingPreview';
import { KIND_ICONS } from '../links/kindIcon';
import { LinkRow } from '../links/LinkRow';
import { NoteRuns } from '../note/noteText';
import { usePageContext } from './PageContext';

/** A link's picture frame on a bookmark: 4:5, as everywhere a link's own picture shows. */
const FRAME = { width: 56, height: 70 } as const;
/** Ruled lines under an embedded note's text: one under each 23 high line. */
const BODY_RULE = { pitch: 23, offset: 22 } as const;
/** An embedded note shows this many of its items still to do. */
const NOTE_ITEMS = 12;

interface Glimpse {
  readonly text: string;
  readonly meta: string;
  /** A kept picture: a blob id. */
  readonly picture: string | null;
  /** A link's picture by address, before or without a kept one. */
  readonly pictureUrl: string | null;
}

/** The first words of what a note, a collection, a link or a page holds. */
function glimpse(s: LibraryState, target: BlockTarget): Glimpse {
  const none: Glimpse = { text: '', meta: '', picture: null, pictureUrl: null };
  switch (target.type) {
    case 'note': {
      const note = s.notes[target.id];
      if (!note) return none;
      if (note.kind === 'links') {
        const ids = (s.linksByNote[target.id] ?? []).filter(id => s.links[id] && !s.links[id]!.done);
        const titles = ids.slice(0, 3).map(id => s.links[id]!.title || prettyUrl(s.links[id]!.url));
        return { text: shownHint(note) || titles.join(' · '), meta: t('Collection · {links}', { links: plural(ids.length, 'lien') }), picture: null, pictureUrl: null };
      }
      const items = (s.checksByNote[target.id] ?? []).flatMap(id => (s.checks[id] && !s.checks[id]!.checked ? [s.checks[id]!.text] : []));
      // A formatted body's words alone, read once per version of the note.
      const shown = noteCardLines(note);
      const text = note.kind === 'checklist' ? items.slice(0, 4).join(' · ') : (shown ? linesText(shown) : note.body).slice(0, 280);
      return { text, meta: note.kind === 'checklist' ? t('Liste') : note.kind === 'drawing' ? t('Dessin') : t('Note'), picture: s.attachmentsByNote[target.id]?.[0] ?? null, pictureUrl: null };
    }
    case 'link': {
      const link = s.links[target.id];
      if (!link) return none;
      const { source } = linkRowText(link);
      return { text: link.summary || prettyUrl(link.url), meta: [source, link.price !== null ? formatPrice(link.price, link.currency) : null].filter(Boolean).join(' · ') || t('Lien'), picture: link.imageIds[0] ?? null, pictureUrl: link.imageUrl };
    }
    case 'page': {
      let text = '';
      for (const id of s.blocksByParent[target.id] ?? []) {
        const block = s.blocks[id];
        if (block && RICH_KINDS.has(block.kind)) text += `${markupToPlain(block.text, mentionLabel, dateWords)} `;
        if (text.length > 280) break;
      }
      return { text: text.trim(), meta: t('Page'), picture: null, pictureUrl: null };
    }
    default:
      // A type a newer client added (another app's): nothing to show of it here.
      return none;
  }
}

/** A gone target, in a well: what it was, and that it is no more. */
function GoneCard({ target }: { target: BlockTarget }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Organic outline="frame" style={styles.gone}>
      <Icon name="info" size={20} color={theme.color.inkMuted} />
      <AppText variant="meta">{target.type === 'page' ? t('Cette page n’existe plus.') : target.type === 'link' ? t('Ce lien n’existe plus.') : t('Cette note n’existe plus.')}</AppText>
    </Organic>
  );
}

/** A picture in a link's frame: on cream by day it multiplies, at night it shows a little less bright. */
function FramedPicture({ source, glyph }: { source: ImageSource | null; glyph: GlyphName }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Organic outline="frame" style={[styles.frame, source ? styles.framePaper : null]}>
      {source ? (
        <Image source={source} style={[StyleSheet.absoluteFill, theme.mode === 'dark' ? styles.photoNight : styles.photoDay]} resizeMode="cover" />
      ) : (
        <Icon name={glyph} size={26} color={theme.color.inkMuted} />
      )}
    </Organic>
  );
}

/** The bookmark's mark, by what it points at. */
function BookmarkMark({ target, seen }: { target: BlockTarget; seen: Glimpse }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const blob = useBlobSource(seen.picture);
  const look = useLibraryStore(
    useShallow(s => {
      if (target.type === 'page') return { emoji: s.blocks[target.id]?.icon ?? null, line: null, glyph: 'page' as GlyphName };
      if (target.type === 'link') return { emoji: null, line: null, glyph: s.links[target.id] ? KIND_ICONS[s.links[target.id]!.kind] : ('link' as GlyphName) };
      const note = s.notes[target.id];
      if (note?.kind === 'links') return { emoji: null, line: { emblem: note.emblem, color: note.color }, glyph: 'collections' as GlyphName };
      return { emoji: null, line: null, glyph: (note?.kind === 'checklist' ? 'checklist' : note?.kind === 'drawing' ? 'draw' : 'note') as GlyphName };
    }),
  );
  if (look.line) return <EmblemStone id={target.id} emblem={collectionEmblem(target.id, look.line.emblem)} color={asLineColor(look.line.color)} size={28} width={50} height={46} tilt={-6} />;
  if (look.emoji) return <AppText style={styles.bookmarkEmoji}>{look.emoji}</AppText>;
  const source = blob ?? (seen.pictureUrl ? { uri: seen.pictureUrl } : null);
  if (target.type === 'link' || source) return <FramedPicture source={source} glyph={look.glyph} />;
  return <Icon name={look.glyph} size={28} color={theme.color.inkMuted} />;
}

function Bookmark({ target }: { target: BlockTarget }) {
  const styles = useThemedStyles(makeStyles);
  const { openTarget } = usePageContext();
  const title = useLibraryStore(s => targetTitle(s, target));
  const seen = useLibraryStore(useShallow(s => glimpse(s, target)));
  if (title === null) return <GoneCard target={target} />;
  return (
    <Organic outline="frame" style={styles.sheet}>
      <Grain />
      <Tappable unstable_pressDelay={listPressDelay} onPress={() => openTarget(target)} accessibilityRole="link" accessibilityLabel={[title, seen.meta].filter(Boolean).join(', ')} style={styles.bookmark}>
        <View style={styles.bookmarkMark}>
          <BookmarkMark target={target} seen={seen} />
        </View>
        <View style={styles.bookmarkText}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {title}
          </AppText>
          {seen.text ? (
            <AppText variant="meta" numberOfLines={2}>
              {seen.text}
            </AppText>
          ) : null}
          <AppText variant="metaStrong" numberOfLines={1}>
            {seen.meta}
          </AppText>
        </View>
      </Tappable>
    </Organic>
  );
}

/** A note as its own sheet: its paper and colour, its title, its text (formatted as written), its drawing or the items still to do. */
function NoteEmbed({ id }: { id: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { openTarget } = usePageContext();
  const note = useLibraryStore(s => s.notes[id]);
  const items = useLibraryStore(useShallow(s => (s.checksByNote[id] ?? []).flatMap(cid => (s.checks[cid] && !s.checks[cid]!.checked ? [s.checks[cid]!.text] : []))));
  const ticked = useLibraryStore(s => (s.checksByNote[id] ?? []).filter(cid => s.checks[cid]?.checked).length);
  const photo = useBlobSource(useLibraryStore(s => s.attachmentsByNote[id]?.[0] ?? null));
  const formatted = useMemo(() => (note?.kind === 'text' && note.rich ? noteLines(note.body, true) : null), [note]);
  /** The drawing's width, once laid out: it is drawn at the embed's own width. */
  const [drawingWidth, setDrawingWidth] = useState(0);
  if (!note) return null;
  const open = () => openTarget({ type: 'note', id });
  // Ruled paper lies under the text it rules, as in the note's own editor; a list keeps its colour alone; a drawing's paper lies still over its whole sheet.
  const ruled = isRuledPattern(note.pattern) && note.kind !== 'drawing';
  const drawing = noteDrawingRatio(note);
  // A drawing taller than a card allows shows its top, as on its card.
  const drawingRatio = drawing !== null ? Math.min(drawing, MAX_DRAWING_RATIO) : null;
  return (
    <Organic outline="card" style={[styles.sheet, noteBackdrop(theme.mode, note.color, ruled ? null : note.pattern)]}>
      <Grain />
      <Tappable unstable_pressDelay={listPressDelay} onPress={open} accessibilityLabel={note.title ? t('Ouvrir la note {title}', { title: shownTitle(note) }) : t('Ouvrir la note')} style={styles.note}>
        {photo ? (
          <Organic outline="frame" style={styles.notePhoto}>
            <Image source={photo} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </Organic>
        ) : null}
        <View style={styles.noteHead}>
          <AppText variant="title" numberOfLines={3} style={styles.flex} color={note.title ? undefined : theme.color.inkMuted}>
            {shownTitle(note) || (note.kind === 'checklist' ? t('Liste') : note.kind === 'drawing' ? t('Dessin') : t('Note'))}
          </AppText>
          <IconButton icon="external" label={t('Ouvrir la note')} size={20} shape={2} onPress={open} />
        </View>
        {note.kind === 'checklist' ? (
          <View style={styles.items}>
            {items.slice(0, NOTE_ITEMS).map((text, index) => (
              <View key={`${index}:${text}`} style={styles.item}>
                <Icon name="box" size={20} color={theme.color.ink} />
                <AppText variant="body" style={styles.flex}>
                  {text}
                </AppText>
              </View>
            ))}
            {items.length > NOTE_ITEMS || ticked > 0 ? (
              <AppText variant="meta">{[items.length > NOTE_ITEMS ? plural(items.length - NOTE_ITEMS, 'autre élément', 'autres éléments') : null, ticked > 0 ? plural(ticked, 'élément coché', 'éléments cochés') : null].filter(Boolean).join(' · ')}</AppText>
            ) : null}
          </View>
        ) : note.kind === 'drawing' ? (
          drawingRatio !== null ? (
            <View style={[styles.drawing, { aspectRatio: 1 / drawingRatio }]} onLayout={event => setDrawingWidth(Math.round(event.nativeEvent.layout.width))}>
              {drawingWidth > 0 ? <DrawingPreview data={note.drawing} width={drawingWidth} height={Math.round(drawingWidth * drawingRatio)} /> : null}
            </View>
          ) : null
        ) : formatted && note.body ? (
          <View style={ruled ? patternBackdrop(theme.mode, note.pattern, BODY_RULE) : null}>
            <AppText variant="body">
              <NoteRuns lines={formatted} place="embed" />
            </AppText>
          </View>
        ) : note.body ? (
          <View style={ruled ? patternBackdrop(theme.mode, note.pattern, BODY_RULE) : null}>
            <AppText variant="body">{note.body}</AppText>
          </View>
        ) : null}
      </Tappable>
    </Organic>
  );
}

/** A collection's links to do as their rows, then those done under « Déjà faits » when the embed shows them. */
function CollectionEmbed({ block, id }: { block: Block; id: string }) {
  const styles = useThemedStyles(makeStyles);
  const { openTarget } = usePageContext();
  const line = useLibraryStore(s => s.notes[id]);
  const { showDone } = block;
  const order = useCallback(
    (s: LibraryState): string => {
      const ids = s.linksByNote[id] ?? [];
      const open = ids.filter(lid => s.links[lid] && !s.links[lid]!.done);
      const done = showDone ? ids.filter(lid => s.links[lid]?.done).sort((a, b) => (s.links[b]!.doneAt ?? 0) - (s.links[a]!.doneAt ?? 0)) : [];
      return `${open.join(',')}|${done.join(',')}`;
    },
    [id, showDone],
  );
  const joined = useLibraryStore(order);
  const { openIds, doneIds } = useMemo(() => {
    const [open = '', done = ''] = joined.split('|');
    return { openIds: open ? open.split(',') : [], doneIds: done ? done.split(',') : [] };
  }, [joined]);
  const openLink = useCallback((lid: string) => openTarget({ type: 'link', id: lid }), [openTarget]);
  if (!line) return null;
  return (
    <Organic outline="card" style={[styles.sheet]}>
      <Grain />
      <View style={styles.collection}>
        <Tappable unstable_pressDelay={listPressDelay} onPress={() => openTarget({ type: 'note', id })} accessibilityLabel={t('Ouvrir la collection {title}', { title: shownTitle(line) })} style={styles.collectionHead}>
          <EmblemStone id={id} emblem={collectionEmblem(id, line.emblem)} color={asLineColor(line.color)} size={26} width={44} height={40} />
          <View style={styles.flex}>
            <AppText variant="title" numberOfLines={2}>
              {shownTitle(line)}
            </AppText>
            <AppText variant="meta">{plural(openIds.length, 'lien')}</AppText>
          </View>
        </Tappable>
        {openIds.length === 0 && doneIds.length === 0 ? (
          <AppText variant="meta" style={styles.collectionEmpty}>
            {t('Aucun lien à faire dans cette collection.')}
          </AppText>
        ) : null}
        {openIds.map(lid => (
          <LinkRow key={lid} id={lid} onOpen={openLink} />
        ))}
        {doneIds.length > 0 ? (
          <AppText variant="section" style={styles.doneHeading} accessibilityRole="header">
            {t('Déjà faits · {count}', { count: doneIds.length })}
          </AppText>
        ) : null}
        {doneIds.map(lid => (
          <LinkRow key={lid} id={lid} onOpen={openLink} />
        ))}
      </View>
    </Organic>
  );
}

/** A link as its row, its summary under it. */
function LinkEmbed({ id }: { id: string }) {
  const styles = useThemedStyles(makeStyles);
  const { openTarget } = usePageContext();
  const summary = useLibraryStore(s => s.links[id]?.summary ?? '');
  const exists = useLibraryStore(s => !!s.links[id]);
  const openLink = useCallback((lid: string) => openTarget({ type: 'link', id: lid }), [openTarget]);
  if (!exists) return null;
  return (
    <Organic outline="card" style={[styles.sheet]}>
      <Grain />
      <View style={styles.linkEmbed}>
        <LinkRow id={id} onOpen={openLink} />
        {summary ? (
          <AppText variant="body" numberOfLines={6} style={styles.summary}>
            {summary}
          </AppText>
        ) : null}
      </View>
    </Organic>
  );
}

/** A page is better opened: its first lines, to go to it. */
function PageEmbed({ id }: { id: string }) {
  const styles = useThemedStyles(makeStyles);
  const { openTarget } = usePageContext();
  const page = useLibraryStore(s => s.blocks[id]);
  const seen = useLibraryStore(useShallow(s => glimpse(s, { type: 'page', id })));
  if (!page) return null;
  const title = page.text.trim() || t(UNTITLED_PAGE);
  return (
    <Organic outline="card" style={[styles.sheet]}>
      <Grain />
      <Tappable unstable_pressDelay={listPressDelay} onPress={() => openTarget({ type: 'page', id })} accessibilityRole="link" accessibilityLabel={t('Ouvrir la page {title}', { title })} style={styles.pageEmbed}>
        <AppText variant="title">{page.icon ? `${page.icon} ${title}` : title}</AppText>
        <AppText variant="body" numberOfLines={6}>
          {seen.text || t('Page vide')}
        </AppText>
      </Tappable>
    </Organic>
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
  return block.kind === 'bookmark' ? <Bookmark target={block.target} /> : <Embed block={block} target={block.target} />;
}

export const TargetBlock = memo(TargetBlockComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    // A sheet of paper on the page: hairline edge, the card's lift, its grain clipped to its corners.
    sheet: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card, overflow: 'hidden' },
    gone: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: theme.color.paperHigh },
    bookmark: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 96, paddingLeft: 12, paddingRight: 16, paddingVertical: 12 },
    bookmarkMark: { width: 56, alignItems: 'center', justifyContent: 'center' },
    bookmarkEmoji: { fontSize: 34, lineHeight: 42 },
    bookmarkText: { flex: 1, gap: 3 },
    frame: { width: FRAME.width, height: FRAME.height, overflow: 'hidden', backgroundColor: theme.color.paperHigh, borderWidth: 1, borderColor: theme.color.outline, alignItems: 'center', justifyContent: 'center' },
    framePaper: { backgroundColor: theme.color.paper, isolation: 'isolate' },
    photoDay: { mixBlendMode: 'multiply' },
    photoNight: { opacity: 0.86 },
    note: { paddingLeft: 16, paddingRight: 6, paddingTop: 8, paddingBottom: 16, gap: 6 },
    notePhoto: { height: 180, overflow: 'hidden', marginTop: 6, marginRight: 10, backgroundColor: theme.color.paperHigh },
    // Its strokes on the note's own sheet, as wide as its text.
    drawing: { marginTop: 2, marginRight: 10 },
    noteHead: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48 },
    items: { gap: 6, paddingRight: 10 },
    item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    collection: { paddingTop: 6, paddingBottom: 8 },
    collectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 6, paddingHorizontal: 8, paddingVertical: 8, minHeight: 56 },
    collectionEmpty: { paddingHorizontal: 16, paddingVertical: 12 },
    doneHeading: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
    linkEmbed: { paddingVertical: 6 },
    summary: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 10 },
    pageEmbed: { padding: 16, gap: 6 },
  });
