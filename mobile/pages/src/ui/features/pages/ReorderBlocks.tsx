/**
 * « Réorganiser » on the phone: a page's blocks as an outline over the whole screen, each one row
 * (its kind's glyph, or its icon, and its first words, nested ones further in), to put in order by
 * dragging, as the web does with its handles. The page's blocks are text fields, whose long press
 * selects words, and the keyboard covers half the screen: here nothing is typed, every row is the
 * same height, and a block moves with what it holds (folded into it while it is held).
 *
 * Held a moment, a row lifts off as a strip of paper and follows the finger; the other rows part
 * where it will land, a focus line in the gap as deep as the finger goes right or left (under the row above when that one takes
 * blocks, out of the item it is in: `outlineDrop`), each new place a tick; near the top or the foot
 * the list scrolls on its own. Let go, the move is one gesture of the page's undo (`moveBlocks`), the
 * strip settling into its new place. TalkBack moves a row with its actions (up, down, in, out).
 * « Terminé » or Back leaves: the page goes to the block last moved and lights it, or, nothing
 * moved, the caret goes back where it was.
 *
 * Opened from a block's actions or by holding the bar's up or down arrow (`openReorder`); the page's
 * `ReorderHost` shows it, over everything else.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Keyboard, ScrollView, StyleSheet, View, type AccessibilityActionEvent, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Keyframe, LayoutAnimationConfig, LinearTransition, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import type { GlyphName } from '@unlease/design/glyphs';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { t, tc, tx } from '@unlease/core/i18n';
import { dateWords } from '@unlease/core/services/dates';
import { plural } from '@unlease/core/services/format';
import { markupToPlain } from '@unlease/core/services/richText';
import { RICH_KINDS, UNTITLED_PAGE, type Block, type BlockKind } from '@unlease/pages/models/blocks';
import { shownTarget } from '@unlease/pages/services/blocks';
import { carriedRows, outlineDrop, pageOutline, type OutlineDrop, type OutlineRow } from '@unlease/pages/services/reorder';
import { mentionLabel } from '@app/hooks/usePages';
import { useLibraryStore } from '@app/store/libraryStore';
import { canRedo, canUndo, redoPage, undoPage } from '@app/store/pageHistory';
import { indentBlocks, moveBlocks, nudgeBlocks, outdentBlocks } from '@app/store/pages';
import { haptic } from '@shared/platform/haptics';

import { AppText, Button, EdgeScrollView, EmptyLine, Grain, Ground, Icon, IconButton, Organic, TopBar } from '@shared/ui/components';
import { accelerate, decelerate, duration, listIn, listMove, listOut, standard } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { NEST } from './BlockView';
import { flushAll, focusBlock, resyncFields } from './editorStore';
import { usePageContext } from './PageContext';

// ── opening it ─────────────────────────────────────────────────────────────

interface ReorderRequest {
  readonly page: string;
  /** The block it was opened for: its row stands chosen and in view. */
  readonly block: string | null;
  /** Where the caret was in that block, given back when nothing moved. */
  readonly caret: number | null;
}

const useReorderStore = create<{ readonly request: ReorderRequest | null }>(() => ({ request: null }));

/** Opens « Réorganiser » over the page (its `ReorderHost` shows it); what is typed is saved and the keyboard steps aside. */
export function openReorder(page: string, block: string | null = null, caret: number | null = null): void {
  flushAll();
  Keyboard.dismiss();
  useReorderStore.setState({ request: { page, block, caret } });
}

function closeReorder(): void {
  useReorderStore.setState({ request: null });
}

// ── the rows ───────────────────────────────────────────────────────────────

/** A row's height, and how far one row's top is from the next (the rows' gap counted). */
const ROW = 48;
const GAP = GEOMETRY.rowGap;
const PITCH = ROW + GAP;
/** The rows' inset from the screen's edges (their glyph 10 further in: 16 from the edge). */
const INSET = 6;
/** A row is lifted after this long under the finger (the checklist's hold). */
const LIFT_MS = 230;
/** Within this much of the list's top or foot, a row held there scrolls the list. */
const EDGE = 72;
/** The fastest the list scrolls under a held row, in dp a frame. */
const EDGE_SPEED = 16;

const KIND_GLYPHS: Partial<Record<BlockKind, GlyphName>> = {
  text: 'text',
  h1: 'heading1',
  h2: 'heading2',
  h3: 'heading3',
  h4: 'heading4',
  bullet: 'list',
  numbered: 'numbered',
  todo: 'box',
  toggle: 'toggle',
  callout: 'callout',
  code: 'codeBlock',
  table: 'table',
  page: 'page',
  image: 'image',
  video: 'video',
  pdf: 'pdf',
  file: 'file',
  bookmark: 'bookmark',
  embed: 'embed',
  columns: 'columns',
  toc: 'contents',
  drawing: 'draw',
  calendar: 'calendar',
};

const KIND_LABELS: Partial<Record<BlockKind, string>> = {
  text: tx('Texte'),
  h1: tx('Titre 1'),
  h2: tx('Titre 2'),
  h3: tx('Titre 3'),
  h4: tx('Titre 4'),
  bullet: tx('Élément de liste'),
  numbered: tx('Élément de liste numérotée'),
  todo: tx('Tâche'),
  toggle: tx('Liste dépliante'),
  callout: tx('Encadré'),
  code: tx('Code'),
  page: tx('Page'),
  image: tx('Image'),
  video: tx('Vidéo'),
  pdf: tx('PDF'),
  file: tx('Fichier'),
  bookmark: tx('Signet'),
  embed: tx('Intégration'),
  toc: tx('Table des matières'),
  drawing: tx('Dessin'),
  calendar: tx('Agenda'),
};

/** What a row says: its kind, its first words (none: the kind alone), and what stands for it. */
interface RowLook {
  readonly kind: string;
  readonly words: string;
  readonly glyph: GlyphName | null;
  readonly emoji: string | null;
  readonly strong: boolean;
  readonly quiet: boolean;
}

const firstLine = (text: string): string =>
  text
    .split('\n')
    .map(line => line.trim())
    .find(line => line !== '') ?? '';

function rowLook(block: Block | undefined, row: OutlineRow, columnNumber: number, columnCount: number): RowLook {
  const kind = row.kind === 'table' ? tc('block', 'Tableau') : row.kind === 'columns' ? plural(columnCount, 'colonne') : row.kind === 'column' ? t('Colonne {number}', { number: columnNumber }) : t(KIND_LABELS[row.kind] ?? 'Texte');
  const look = { kind, glyph: KIND_GLYPHS[row.kind] ?? null, emoji: null, strong: false, quiet: false };
  if (!block) return { ...look, words: '' };
  if (row.kind === 'column') return { ...look, words: '', quiet: true };
  if (row.kind === 'columns') return { ...look, words: '' };
  if (row.kind === 'page') return { ...look, words: block.text.trim() || t(UNTITLED_PAGE), emoji: block.icon };
  if (row.kind === 'callout') return { ...look, words: firstLine(markupToPlain(block.text, mentionLabel, dateWords)), emoji: block.icon ?? '💡' };
  if (RICH_KINDS.has(row.kind)) {
    const done = row.kind === 'todo' && block.checked;
    return { ...look, glyph: done ? 'boxChecked' : look.glyph, words: firstLine(markupToPlain(block.text, mentionLabel, dateWords)), strong: /^h[1-4]$/.test(row.kind), quiet: done };
  }
  if (row.kind === 'code') return { ...look, words: firstLine(block.text) };
  const shown = shownTarget(block);
  if (shown) return { ...look, words: mentionLabel(shown.target) };
  return { ...look, words: block.caption.trim() || block.fileName || block.url || '' };
}

/** A row's glyph (or its icon) and its words: on the list, and on the strip a held row becomes. */
const RowBody = memo(function RowBodyView({ look, carried, grip }: { look: RowLook; carried: number; grip: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const empty = look.words === '';
  return (
    <>
      <View style={styles.mark}>
        {look.emoji ? (
          <AppText style={styles.emoji} allowFontScaling={false}>
            {look.emoji}
          </AppText>
        ) : look.glyph ? (
          <Icon name={look.glyph} size={20} color={theme.color.inkMuted} />
        ) : null}
      </View>
      <AppText variant={empty && look.quiet ? 'metaStrong' : look.strong ? 'bodyStrong' : 'body'} color={empty || look.quiet ? theme.color.inkMuted : undefined} numberOfLines={1} style={styles.words}>
        {empty ? look.kind : look.words}
      </AppText>
      {carried > 0 ? (
        <AppText variant="meta" numberOfLines={1} style={styles.carried}>
          {t('avec {blocks}', { blocks: plural(carried, 'bloc') })}
        </AppText>
      ) : null}
      {grip ? (
        <View style={styles.grip}>
          <Icon name="grip" size={18} color={theme.color.inkFaint} />
        </View>
      ) : null}
    </>
  );
});

const ROW_MOVE = listMove;
/** The rows parting for a held one, quicker, to keep up with the finger. */
const ROW_SHIFT = LinearTransition.duration(duration.short).easing(standard);
const ROW_IN = listIn;
const ROW_OUT = listOut;

interface RowProps {
  readonly row: OutlineRow;
  readonly look: RowLook;
  readonly chosen: boolean;
  /** Held (the strip stands for it) or settling into its place: drawn as an empty place. */
  readonly hidden: boolean;
  readonly canLift: boolean;
  readonly dragY: SharedValue<number>;
  readonly onLift: (id: string) => void;
  readonly onMove: (dx: number, dy: number) => void;
  readonly onRelease: (dropped: boolean) => void;
  readonly onAction: (id: string, action: string) => void;
}

const ACTIONS = [
  { name: 'moveUp', label: tx('Monter le bloc') },
  { name: 'moveDown', label: tx('Descendre le bloc') },
  { name: 'indent', label: tx('Imbriquer le bloc') },
  { name: 'outdent', label: tx('Désimbriquer le bloc') },
] as const;

const OutlineRowView = memo(function OutlineRowItem({ row, look, chosen, hidden, canLift, dragY, onLift, onMove, onRelease, onAction }: RowProps) {
  const styles = useThemedStyles(makeStyles);
  const id = row.id;
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(`reorder:${id}`)
        .enabled(canLift)
        .activateAfterLongPress(LIFT_MS)
        .onStart(() => {
          dragY.value = 0;
          runOnJS(onLift)(id);
        })
        .onUpdate(event => {
          dragY.value = event.translationY;
          runOnJS(onMove)(event.translationX, event.translationY);
        })
        .onEnd((_event, success) => {
          runOnJS(onRelease)(success);
        })
        .onFinalize((_event, success) => {
          if (!success) runOnJS(onRelease)(false);
        }),
    [id, canLift, dragY, onLift, onMove, onRelease],
  );
  const actions = useMemo(() => (row.movable ? ACTIONS.map(action => ({ name: action.name, label: t(action.label) })) : undefined), [row.movable]);
  const label = look.words ? t('{kind} : {words}', { kind: look.kind, words: look.words }) : look.kind;
  return (
    <GestureDetector gesture={pan}>
      <View
        collapsable={false}
        accessible
        accessibilityLabel={label}
        accessibilityHint={row.movable ? t('Maintenir pour déplacer') : undefined}
        accessibilityState={chosen ? { selected: true } : undefined}
        accessibilityActions={actions}
        onAccessibilityAction={(event: AccessibilityActionEvent) => onAction(id, event.nativeEvent.actionName)}
        style={[styles.row, { marginLeft: INSET + row.depth * NEST }, hidden ? styles.hidden : null]}
      >
        {chosen ? <Organic pointerEvents="none" style={styles.chosen} /> : null}
        <RowBody look={look} carried={0} grip={row.movable} />
      </View>
    </GestureDetector>
  );
});

// ── the layer ──────────────────────────────────────────────────────────────

/** A row held: the outline as it was picked up, the rows still shown (what it holds folded into it), its place among them. */
interface Lifted {
  readonly id: string;
  readonly rows: readonly OutlineRow[];
  readonly shown: readonly OutlineRow[];
  readonly slot: number;
  readonly depth: number;
  readonly carried: number;
  /** Its top in the list's frame as it was lifted. */
  readonly start: number;
}

/** Where a held row would land now: the gap among the rows it leaves, and the place there (null: none). */
interface Target {
  readonly gap: number;
  readonly wanted: number;
  readonly drop: OutlineDrop | null;
}

const IN = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 24 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.medium);
const OUT = new Keyframe({ 0: { opacity: 1 }, 100: { opacity: 0, easing: accelerate } }).duration(duration.short);

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

/** The block a page can scroll to for a row: a row of columns is drawn by its blocks. */
function drawnFor(id: string): string {
  const { blocks, blocksByParent } = useLibraryStore.getState();
  if (blocks[id]?.kind !== 'columns') return id;
  const column = blocksByParent[id]?.[0];
  return (column && blocksByParent[column]?.[0]) ?? id;
}

function ReorderLayer({ request }: { request: ReorderRequest }) {
  const page = request.page;
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { jumpTo, readOnly } = usePageContext();
  const blocks = useLibraryStore(s => s.blocks);
  const children = useLibraryStore(s => s.blocksByParent);
  // Read again with every change, so undo and redo know whether there is a step to take.
  useLibraryStore(s => s.revision);
  const live = useMemo(() => pageOutline(blocks, children, page), [blocks, children, page]);
  const liveRef = useRef(live);
  liveRef.current = live;

  const [lifted, setLifted] = useState<Lifted | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [settling, setSettling] = useState<{ readonly id: string; readonly depth: number } | null>(null);
  const liftedRef = useRef<Lifted | null>(null);
  const targetRef = useRef<Target | null>(null);
  const settlingRef = useRef<string | null>(null);
  /** The block last moved here: the page goes to it on the way out. */
  const moved = useRef<string | null>(null);

  // Where things are: the list's frame, its scroll, the rows' top in what scrolls.
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);
  const frameHeight = useRef(0);
  const contentHeight = useRef(0);
  const rowsTop = useRef(0);
  const placed = useRef(false);
  const last = useRef({ dx: 0, dy: 0 });
  const speed = useRef(0);
  const frame = useRef<number | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The strip a held row becomes: its top in the list's frame, the finger's way since, its shift to the depth it would land at.
  const floatTop = useSharedValue(0);
  const dragY = useSharedValue(0);
  const shiftX = useSharedValue(0);
  const room = useSharedValue(0);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: Math.max(0, Math.min(room.value, floatTop.value + dragY.value)) }, { translateX: shiftX.value }] }));

  const leave = useCallback(() => {
    if (liftedRef.current) return;
    closeReorder();
    const landed = moved.current;
    if (landed && useLibraryStore.getState().blocks[landed]) jumpTo?.(drawnFor(landed));
    else if (!landed && request.block && request.caret !== null) focusBlock(request.block, request.caret);
  }, [jumpTo, request.block, request.caret]);

  // Back leaves, as « Terminé » does; a page gone into the bin takes nothing more.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => subscription.remove();
  }, [leave]);
  useEffect(() => {
    if (readOnly) closeReorder();
  }, [readOnly]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  /** The chosen row in view, once the list is laid out. */
  const placeChosen = (): void => {
    if (placed.current || frameHeight.current === 0) return;
    placed.current = true;
    const index = request.block ? liveRef.current.findIndex(row => row.id === request.block) : -1;
    if (index < 0) return;
    const y = rowsTop.current + index * PITCH - frameHeight.current / 3;
    if (y > 0) scroll.current?.scrollTo({ y, animated: false });
  };

  /** Where the held row would land, from the finger's way (and the list's scroll). */
  const evaluate = useCallback(() => {
    const held = liftedRef.current;
    if (!held) return;
    const { dx, dy } = last.current;
    const top = clamp(held.start + dy, 0, Math.max(0, frameHeight.current - ROW));
    const centre = top + ROW / 2 + scrollY.current - rowsTop.current;
    // The rows whose middle the held row's middle has passed.
    const reached = clamp(Math.ceil((centre - PITCH / 2) / PITCH), 0, held.shown.length);
    const gap = reached - (held.slot < reached ? 1 : 0);
    const wanted = held.depth + Math.round(dx / NEST);
    // Near the top or the foot, the list scrolls.
    const probe = top + ROW / 2;
    speed.current = frameHeight.current === 0 ? 0 : probe < EDGE ? -Math.min(1, (EDGE - probe) / EDGE) * EDGE_SPEED : probe > frameHeight.current - EDGE ? Math.min(1, (probe - (frameHeight.current - EDGE)) / EDGE) * EDGE_SPEED : 0;
    const before = targetRef.current;
    if (before && before.gap === gap && before.wanted === wanted) return;
    const drop = outlineDrop(held.rows, page, held.id, gap, wanted);
    const next = { gap, wanted, drop };
    targetRef.current = next;
    const changed = !before || before.gap !== gap || before.drop?.depth !== drop?.depth || (before.drop === null) !== (drop === null);
    if (!changed) return;
    setTarget(next);
    if (drop) haptic('tick');
    shiftX.value = withTiming(((drop?.depth ?? held.depth) - held.depth) * NEST, { duration: duration.short, easing: standard });
  }, [page, shiftX]);

  const step = useCallback(() => {
    frame.current = null;
    if (!liftedRef.current || speed.current === 0) return;
    const most = Math.max(0, contentHeight.current - frameHeight.current);
    const next = clamp(scrollY.current + speed.current, 0, most);
    if (next !== scrollY.current) {
      scrollY.current = next;
      scroll.current?.scrollTo({ y: next, animated: false });
      evaluate();
    }
    frame.current = requestAnimationFrame(step);
  }, [evaluate]);

  const onLift = useCallback(
    (id: string) => {
      if (liftedRef.current || settlingRef.current) return;
      const rows = liveRef.current;
      const index = rows.findIndex(row => row.id === id);
      const row = rows[index];
      if (!row || !row.movable) return;
      const carried = carriedRows(rows, id);
      const shown = [...rows.slice(0, index + 1), ...rows.slice(index + 1 + carried)];
      const start = rowsTop.current + index * PITCH + GAP / 2 - scrollY.current;
      const held: Lifted = { id, rows, shown, slot: index, depth: row.depth, carried, start };
      floatTop.value = start;
      shiftX.value = 0;
      last.current = { dx: 0, dy: 0 };
      liftedRef.current = held;
      const here = { gap: index, wanted: row.depth, drop: outlineDrop(rows, page, id, index, row.depth) };
      targetRef.current = here;
      setTarget(here);
      setLifted(held);
      haptic('pick');
    },
    [floatTop, shiftX, page],
  );

  const onMove = useCallback(
    (dx: number, dy: number) => {
      if (!liftedRef.current) return;
      last.current = { dx, dy };
      evaluate();
      if (speed.current !== 0 && frame.current === null) frame.current = requestAnimationFrame(step);
    },
    [evaluate, step],
  );

  const onRelease = useCallback(
    (dropped: boolean) => {
      const held = liftedRef.current;
      if (!held) return;
      liftedRef.current = null;
      speed.current = 0;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      const drop = dropped ? targetRef.current?.drop : null;
      targetRef.current = null;
      if (drop?.moves) {
        flushAll();
        if (moveBlocks(page, [held.id], { parentId: drop.parentId, afterId: drop.afterId }, [held.id])) moved.current = held.id;
      }
      // The strip goes from where it was let go to the row's place (its top and the finger's way, on one curve), then lies down there.
      const { blocks: now, blocksByParent } = useLibraryStore.getState();
      const after = pageOutline(now, blocksByParent, page);
      const index = after.findIndex(row => row.id === held.id);
      setLifted(null);
      setTarget(null);
      if (index < 0) {
        dragY.value = 0;
        return;
      }
      const settle = { duration: duration.medium, easing: standard };
      floatTop.value = withTiming(rowsTop.current + index * PITCH + GAP / 2 - scrollY.current, settle);
      dragY.value = withTiming(0, settle);
      shiftX.value = withTiming((after[index]!.depth - held.depth) * NEST, settle);
      settlingRef.current = held.id;
      setSettling({ id: held.id, depth: held.depth });
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(
        () => {
          settleTimer.current = null;
          settlingRef.current = null;
          setSettling(null);
        },
        reduced ? 0 : duration.medium,
      );
    },
    [page, floatTop, dragY, shiftX, reduced],
  );

  /** TalkBack's actions on a row: a step up or down among its neighbours, into the item above, out of the one it is in. */
  const onAction = useCallback(
    (id: string, action: string) => {
      flushAll();
      const done =
        action === 'moveUp' ? nudgeBlocks(page, [id], -1) : action === 'moveDown' ? nudgeBlocks(page, [id], 1) : action === 'indent' ? indentBlocks(page, [id]) : action === 'outdent' ? outdentBlocks(page, [id]) : false;
      if (done) moved.current = id;
    },
    [page],
  );

  const history = (direction: 'undo' | 'redo'): void => {
    flushAll();
    if (direction === 'undo') undoPage(page);
    else redoPage(page);
    resyncFields();
  };

  const shown = lifted ? lifted.shown : live;
  // The words of each row, its columns numbered within their row.
  const looks = useMemo(() => {
    const out = new Map<string, RowLook>();
    for (const row of shown) {
      const siblings = children[row.parentId] ?? [];
      const columns = row.kind === 'columns' ? (children[row.id]?.length ?? 0) : 0;
      out.set(row.id, rowLook(blocks[row.id], row, siblings.indexOf(row.id) + 1, columns));
    }
    return out;
  }, [shown, blocks, children]);

  // The strip: the held row, or the one settling into its place (drawn at the depth it was lifted from, `shiftX` taking it to its new one).
  const floating = lifted ?? settling;
  const floatingLook = floating ? looks.get(floating.id) : undefined;

  // Where the held row would land, among the other rows: the list opens a gap there (back at its own
  // place while it can land nowhere), the focus line in it as far in as its depth.
  const landing = lifted ? (target?.drop ? { gap: target.gap, depth: target.drop.depth } : { gap: lifted.slot, depth: lifted.depth }) : null;
  const gapRow = landing ? (
    <Animated.View key="landing" layout={ROW_SHIFT} style={styles.slot} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {target?.drop ? (
        <View pointerEvents="none" style={[styles.line, { top: PITCH / 2 - 1.5, left: INSET + landing.depth * NEST + 6 }]}>
          <View style={styles.lineHead} />
        </View>
      ) : null}
    </Animated.View>
  ) : null;

  const busy = lifted !== null || settling !== null;
  const rowView = (row: OutlineRow) => (
    <OutlineRowView
      row={row}
      look={looks.get(row.id)!}
      chosen={row.id === request.block}
      hidden={row.id === lifted?.id || row.id === settling?.id}
      canLift={row.movable && !readOnly && (!busy || row.id === lifted?.id)}
      dragY={dragY}
      onLift={onLift}
      onMove={onMove}
      onRelease={onRelease}
      onAction={onAction}
    />
  );
  // The rows in order, the gap among the others; the held row keeps its own place, out of the flow
  // and unseen, so the finger's gesture on it never moves (the same view, never remounted).
  const laid: React.ReactNode[] = [];
  let other = 0;
  for (const row of shown) {
    if (row.id === lifted?.id) {
      laid.push(
        <Animated.View key={row.id} style={[styles.slot, styles.heldSlot, { top: lifted.slot * PITCH }]}>
          {rowView(row)}
        </Animated.View>,
      );
      continue;
    }
    if (landing?.gap === other) laid.push(gapRow);
    laid.push(
      <Animated.View key={row.id} layout={lifted ? ROW_SHIFT : ROW_MOVE} entering={ROW_IN} exiting={ROW_OUT} style={styles.slot}>
        {rowView(row)}
      </Animated.View>,
    );
    other += 1;
  }
  if (landing && landing.gap >= other) laid.push(gapRow);
  return (
    <Animated.View entering={IN} exiting={OUT} style={styles.layer} accessibilityViewIsModal>
      <Ground />
      <TopBar
        title={t('Réorganiser')}
        actions={
          <>
            <IconButton icon="undo" label={tc('undo', 'Annuler')} shape={1} disabled={busy || !canUndo(page)} onPress={() => history('undo')} />
            <IconButton icon="undo" label={t('Rétablir')} shape={2} disabled={busy || !canRedo(page)} onPress={() => history('redo')} style={styles.mirrored} />
            <Button label={t('Terminé')} small onPress={leave} style={styles.done} />
          </>
        }
      />
      <View
        testID="reorder-frame"
        style={styles.frame}
        onLayout={(event: LayoutChangeEvent) => {
          frameHeight.current = event.nativeEvent.layout.height;
          room.value = Math.max(0, event.nativeEvent.layout.height - ROW);
          placeChosen();
        }}
      >
        <EdgeScrollView
          ref={scroll}
          scrollEnabled={!lifted}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          onContentSizeChange={(_width, height) => {
            contentHeight.current = height;
          }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        >
          <AppText variant="meta" style={styles.hint}>
            {t('Maintenez un bloc, puis faites-le glisser. Vers la droite, il se range sous celui du dessus.')}
          </AppText>
          <View
            onLayout={(event: LayoutChangeEvent) => {
              rowsTop.current = event.nativeEvent.layout.y;
              placeChosen();
            }}
          >
            {shown.length === 0 ? <EmptyLine size="body" text={t('Cette page n’a pas encore de blocs.')} style={styles.empty} /> : null}
            {/* The list as it opens is simply there; what changes after it moves. */}
            <LayoutAnimationConfig skipEntering>
              {laid}
            </LayoutAnimationConfig>
          </View>
        </EdgeScrollView>
        {floating && floatingLook ? (
          <Animated.View pointerEvents="none" style={[styles.float, { left: INSET + floating.depth * NEST }, floatStyle]} importantForAccessibility="no-hide-descendants">
            <Organic style={styles.strip}>
              <Organic pointerEvents="none" style={styles.grain}>
                <Grain />
              </Organic>
              <RowBody look={floatingLook} carried={lifted?.carried ?? 0} grip />
            </Organic>
          </Animated.View>
        ) : null}
      </View>
    </Animated.View>
  );
}

/** Where a page shows « Réorganiser »: beside its sheets, over everything else. */
function ReorderHostComponent({ page }: { page: string }) {
  const request = useReorderStore(s => (s.request?.page === page ? s.request : null));
  // Gone with the page.
  useEffect(
    () => () => {
      if (useReorderStore.getState().request?.page === page) closeReorder();
    },
    [page],
  );
  return request ? <ReorderLayer request={request} /> : null;
}

export const ReorderHost = memo(ReorderHostComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    layer: { ...StyleSheet.absoluteFill, backgroundColor: theme.color.wall },
    mirrored: { transform: [{ scaleX: -1 }] },
    // Centred on the bar's row, as its arrows are (a button stands at its row's top otherwise).
    done: { alignSelf: 'center', marginLeft: 4, marginRight: 8 },
    frame: { flex: 1, overflow: 'hidden' },
    content: { paddingTop: 4 },
    // On the rows' glyphs: 16 from the edge.
    hint: { paddingHorizontal: INSET + 10, paddingBottom: 8 },
    empty: { paddingHorizontal: INSET + 10, paddingVertical: 12 },
    // Each row lies in its pitch, half the rows' gap above and below it, so two rows' tints never touch.
    slot: { height: PITCH, paddingVertical: GAP / 2 },
    // A list row's columns: the glyph 10 in (16 from the edge at the top level), its 24 slot, the words 16 after it.
    row: { height: ROW, marginRight: INSET, flexDirection: 'row', alignItems: 'center', gap: 16, paddingLeft: 10, paddingRight: 4 },
    hidden: { opacity: 0 },
    // The held row's own place while it is carried: out of the flow, where it was.
    heldSlot: { position: 'absolute', left: 0, right: 0 },
    // The block it was opened for: the selection's wash and focus edge, as a chosen place.
    chosen: { ...StyleSheet.absoluteFill, ...corners(SHAPES.tab), backgroundColor: theme.color.actionContainer, borderWidth: 1.5, borderColor: theme.color.focus },
    mark: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    emoji: { fontSize: 18, lineHeight: 24, textAlign: 'center' },
    words: { flex: 1, minWidth: 0 },
    carried: { flexShrink: 0 },
    grip: { width: 40, height: ROW, alignItems: 'center', justifyContent: 'center' },
    // The held row: a strip of the page's paper lifted off the list.
    float: { position: 'absolute', top: 0, right: INSET, height: ROW },
    strip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, paddingLeft: 10, paddingRight: 4, ...corners(SHAPES.tab), backgroundColor: theme.color.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.color.hairline, boxShadow: theme.lift.raised },
    grain: { ...StyleSheet.absoluteFill, ...corners(SHAPES.tab), overflow: 'hidden' },
    // Where it would land: the focus line, a round head where its words would start.
    line: { position: 'absolute', right: INSET, height: 3, borderRadius: 1.5, backgroundColor: theme.color.focus },
    lineHead: { position: 'absolute', left: -4, top: -3, width: 9, height: 9, borderRadius: 4.5, backgroundColor: theme.color.focus },
  });
