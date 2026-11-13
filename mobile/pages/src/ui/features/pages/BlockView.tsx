/**
 * A page's blocks on the phone, drawn one inside another as they nest, with the web's rhythm. Text
 * kinds are typed in place (`RichInput`), always in the same spot of the same row, so a block
 * turned into another kind keeps its field and the keyboard: a list item carries its mark beside
 * it, a task its box, a toggle its chevron, a callout its wash and emoji. The others draw
 * themselves (code, table, media, bookmark, embed); held down, any block opens its actions (a table
 * on its frame, its cells holding for their row's). Side by side columns stack, as on the web's phone width.
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, Keyframe, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { isLineColor } from '@unlease/design/colors';
import { SHAPES } from '@unlease/design/shapes';
import { t, tx } from '@unlease/core/i18n';
import { CAPTION_KINDS, RICH_KINDS, UNTITLED_PAGE, type Block, type BlockKind } from '@unlease/pages/models/blocks';
import { bulletMark, listDepth, listNumber, numberLabel } from '@unlease/pages/services/blocks';
import { useLibraryStore, type LibraryState } from '@app/store/libraryStore';
import { insertBlock, updateBlock } from '@app/store/pages';
import { setToggleOpen, usePagesUiStore } from '@app/store/pagesUi';
import { haptic } from '@shared/platform/haptics';

import { AppText, Checkbox, Icon, Organic, Tappable } from '@shared/ui/components';
import { decelerate, duration, standard } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { Caption } from './Caption';
import { placeBlock, useBlockFlash } from './blockJump';
import { CodeBlock } from './CodeBlock';
import { flushAll, focusBlock } from './editorStore';
import { MediaBlock } from './MediaBlock';
import { usePageContext } from './PageContext';
import { openPageSheet } from './sheetStore';
import { RichInput } from './RichInput';
import { lineHeightOf } from './richStyle';
import { DrawingBlock } from '../drawing/DrawingBlock';
import { TableBlock } from './TableBlock';
import { TargetBlock } from './TargetBlock';
import { TocBlock } from './TocBlock';
import { CalendarBlock } from './CalendarBlock';
import { ImmichBlock } from './ImmichBlock';

const NO_IDS: readonly string[] = [];
/** A nested block's step in: one list mark's width. */
export const NEST = 26;

export const PLACEHOLDERS: Partial<Record<BlockKind, string>> = {
  text: tx('Write, or type “/” for commands'),
  h1: tx('Heading 1'),
  h2: tx('Heading 2'),
  h3: tx('Heading 3'),
  h4: tx('Heading 4'),
  bullet: tx('List'),
  numbered: tx('List'),
  todo: tx('To-do'),
  toggle: tx('Toggle list'),
  callout: tx('Write something…'),
};

/**
 * The web's rhythm, number for number: the room above and below each kind, and two neighbours'
 * margins collapse as the web's do (the larger one wins, `spaceAbove`). A paragraph keeps 8 on
 * each side; a list's items stay close; a box (callout, code, table, media, bookmark, embed,
 * drawing, table of contents) keeps 12; a heading takes more above than below.
 */
const SPACE: Partial<Record<BlockKind, readonly [number, number]>> = {
  text: [8, 8],
  h1: [32, 4],
  h2: [28, 4],
  h3: [20, 4],
  h4: [16, 4],
  bullet: [2, 2],
  numbered: [2, 2],
  // A line and 4 apart: each box's press pebble keeps clear of the next (the web's 30).
  todo: [4, 4],
  toggle: [2, 2],
  // Sub-pages one under another keep the list rows' gap between their tints.
  page: [4, 4],
  // Each column's tail already leaves room under them.
  columns: [12, 0],
};
const BOX_SPACE: readonly [number, number] = [12, 12];

const spaceOf = (kind: BlockKind): readonly [number, number] => SPACE[kind] ?? BOX_SPACE;

/** Whether `BlockView` draws a block at all (a column or a row is drawn by its container; a page in the bin is not). */
function drawn(block: Block | undefined): block is Block {
  return !!block && block.deletedAt === null && block.kind !== 'column' && block.kind !== 'row' && !(block.kind === 'page' && block.trashedAt !== null);
}

/** The drawn sibling before `index`, if any. */
function drawnAbove(blocks: LibraryState['blocks'], siblings: readonly string[], index: number): Block | undefined {
  for (let at = index - 1; at >= 0; at -= 1) {
    const sibling = blocks[siblings[at]!];
    if (drawn(sibling)) return sibling;
  }
  return undefined;
}

/** The room above a block: the larger of its own and its drawn neighbour's below; the first sits right under what holds it. */
function spaceAbove(blocks: LibraryState['blocks'], siblings: readonly string[], index: number, kind: BlockKind): number {
  const above = drawnAbove(blocks, siblings, index);
  return above ? Math.max(spaceOf(above.kind)[1], spaceOf(kind)[0]) : 0;
}

/** The room under a block: its own when it is the last drawn one, which its container keeps (the web's `flow-root`); else the next one's room above counts it. */
function spaceUnder(blocks: LibraryState['blocks'], siblings: readonly string[], index: number, kind: BlockKind): number {
  for (let at = index + 1; at < siblings.length; at += 1) if (drawn(blocks[siblings[at]!])) return 0;
  return spaceOf(kind)[1];
}

/** A container's blocks, in order. */
export const BlockList = memo(function BlockList({ parentId, depth }: { parentId: string; depth: number }) {
  const ids = useLibraryStore(s => s.blocksByParent[parentId]) ?? NO_IDS;
  return (
    <>
      {ids.map((id, index) => (
        <BlockView key={id} id={id} depth={depth} siblings={ids} index={index} />
      ))}
    </>
  );
});

/** In a callout, its paragraphs after the first start at its text's edge, as far below it as two paragraphs are apart. */
const FLUSH: ViewStyle = { marginTop: 8 };
const NESTED: ViewStyle = { paddingLeft: NEST };

/** What a block holds, under it: indented under an item or a toggle (it follows the item closely); `flush` in a callout. */
function Children({ id, depth, flush = false }: { id: string; depth: number; flush?: boolean }) {
  const has = useLibraryStore(s => (s.blocksByParent[id]?.length ?? 0) > 0);
  if (!has) return null;
  return (
    <View style={flush ? FLUSH : NESTED}>
      <BlockList parentId={id} depth={depth + 1} />
    </View>
  );
}

/** A list item's mark: a bullet by depth, or its number among the items before it. */
function ListMark({ block, siblings, index }: { block: Block; siblings: readonly string[]; index: number }) {
  const styles = useThemedStyles(makeStyles);
  const label = useLibraryStore(s => (block.kind === 'numbered' ? numberLabel(listNumber(s.blocks, siblings, index), listDepth(s.blocks, block.id, 'numbered')) : bulletMark(listDepth(s.blocks, block.id, 'bullet'))));
  return (
    <View style={[styles.lead, { height: lineHeightOf(block.kind) }]} importantForAccessibility="no-hide-descendants">
      <AppText variant="editorBody" style={block.kind === 'bullet' ? styles.bullet : null}>
        {label}
      </AppText>
    </View>
  );
}

function ToggleChevron({ block }: { block: Block }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const open = usePagesUiStore(s => s.openToggles.has(block.id));
  const turn = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    turn.value = withTiming(open ? 1 : 0, { duration: duration.medium, easing: standard });
  }, [open, turn]);
  const turned = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 90}deg` }] }));
  return (
    <Tappable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={open ? t('Collapse') : t('Expand')} onPress={() => setToggleOpen(block.id, !open)} hitSlop={8} style={[styles.lead, styles.chevron, { height: lineHeightOf(block.kind) }]}>
      <Animated.View style={turned}>
        <Icon name="chevronRight" size={18} color={theme.color.ink} />
      </Animated.View>
    </Tappable>
  );
}

/** The leading mark of a text kind: a list's, a task's box, a toggle's chevron; none for a paragraph or a heading. */
function Lead({ block, siblings, index }: { block: Block; siblings: readonly string[]; index: number }) {
  const styles = useThemedStyles(makeStyles);
  const { page, readOnly } = usePageContext();
  switch (block.kind) {
    case 'bullet':
    case 'numbered':
      return <ListMark block={block} siblings={siblings} index={index} />;
    case 'todo':
      return (
        <View style={[styles.lead, styles.box, { height: lineHeightOf(block.kind) }]}>
          <Checkbox checked={block.checked} label={block.checked ? t('Mark as not done') : t('Mark as done')} disabled={readOnly} compact recede onToggle={() => updateBlock(page, block.id, { checked: !block.checked })} />
        </View>
      );
    case 'toggle':
      return <ToggleChevron block={block} />;
    default:
      return null;
  }
}

/** A text kind: its mark and its words on one row, what it holds under it. */
function TextBlock({ block, depth, siblings, index }: { block: Block; depth: number; siblings: readonly string[]; index: number }) {
  const styles = useThemedStyles(makeStyles);
  const { page, readOnly } = usePageContext();
  const open = usePagesUiStore(s => block.kind !== 'toggle' || s.openToggles.has(block.id));
  const empty = useLibraryStore(s => (s.blocksByParent[block.id]?.length ?? 0) === 0);
  return (
    <>
      <View style={styles.line}>
        <Lead block={block} siblings={siblings} index={index} />
        <View style={styles.main}>
          <RichInput block={block} placeholder={t(PLACEHOLDERS[block.kind] ?? '')} hintOnFocus={block.kind === 'text'} done={block.kind === 'todo' && block.checked} />
        </View>
      </View>
      {block.kind === 'toggle' && open && empty ? (
        <Tappable
          disabled={readOnly}
          ownDisabled
          onPress={() => {
            flushAll();
            focusBlock(insertBlock(page, block.id, 0, { kind: 'text', text: '' }), 'start');
          }}
          style={styles.emptyToggle}
        >
          <AppText variant="meta" color={undefined}>
            {t('Empty list. Tap to write in it.')}
          </AppText>
        </Tappable>
      ) : null}
      {open ? <Children id={block.id} depth={depth} /> : null}
    </>
  );
}

function Callout({ block, depth }: { block: Block; depth: number }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { readOnly } = usePageContext();
  return (
    <Organic outline="panel" style={[styles.callout, { backgroundColor: isLineColor(block.color) ? theme.line[block.color].tint : theme.color.paperHigh }]}>
      <Tappable accessibilityLabel={t('Change the callout’s icon')} disabled={readOnly} ownDisabled onPress={() => openPageSheet({ kind: 'emoji', block: block.id, allowNone: false })} pebble={2} style={styles.calloutIcon}>
        <AppText style={styles.calloutEmoji}>{block.icon ?? '💡'}</AppText>
      </Tappable>
      <View style={styles.main}>
        <RichInput block={block} placeholder={t(PLACEHOLDERS.callout ?? '')} />
        <Children id={block.id} depth={depth} flush />
      </View>
    </Organic>
  );
}

/** A sub-page in its parent's content: its icon and title, opening it. */
function PageLink({ block }: { block: Block }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { openTarget } = usePageContext();
  const title = block.text.trim() || t(UNTITLED_PAGE);
  return (
    <Tappable accessibilityRole="link" onPress={() => openTarget({ type: 'page', id: block.id })} style={styles.pageLink}>
      <View style={styles.pageLinkIcon}>{block.icon ? <AppText style={styles.pageEmoji}>{block.icon}</AppText> : <Icon name="page" size={22} color={theme.color.ink} />}</View>
      <AppText variant="bodyStrong" numberOfLines={2} style={styles.pageLinkTitle}>
        {title}
      </AppText>
      <Icon name="chevronRight" size={18} color={theme.color.inkMuted} />
    </Tappable>
  );
}

/** Columns side by side on the web stack here, one under the other. */
function Columns({ block, depth }: { block: Block; depth: number }) {
  const columns = useLibraryStore(s => s.blocksByParent[block.id]) ?? NO_IDS;
  return (
    <View>
      {columns.map(column => (
        <BlockList key={column} parentId={column} depth={depth} />
      ))}
    </View>
  );
}

/** Held down, a block opens its actions (a text block's are in the bar over the keyboard too). */
function HoldForActions({ id, children }: { id: string; children: React.ReactNode }) {
  const { readOnly } = usePageContext();
  const open = (): void => {
    haptic('pick');
    flushAll();
    openPageSheet({ kind: 'block', block: id });
  };
  const hold = Gesture.LongPress()
    .minDuration(450)
    .enabled(!readOnly)
    .onStart(() => runOnJS(open)());
  return <GestureDetector gesture={hold}>{children}</GestureDetector>;
}

function Content({ block, depth, siblings, index }: { block: Block; depth: number; siblings: readonly string[]; index: number }) {
  if (RICH_KINDS.has(block.kind) && block.kind !== 'callout') return <TextBlock block={block} depth={depth} siblings={siblings} index={index} />;
  switch (block.kind) {
    case 'callout':
      return <Callout block={block} depth={depth} />;
    case 'page':
      return (
        <HoldForActions id={block.id}>
          <View>
            <PageLink block={block} />
          </View>
        </HoldForActions>
      );
    case 'code':
      return <CodeBlock block={block} />;
    case 'table':
      // Its own frame takes the hold: wrapped here, the hold would cancel a cell's (its row's actions).
      return <TableBlock block={block} />;
    case 'image':
    case 'video':
    case 'pdf':
    case 'file':
      return (
        <HoldForActions id={block.id}>
          <View>
            <MediaBlock block={block} />
          </View>
        </HoldForActions>
      );
    case 'bookmark':
    case 'embed':
      return (
        <HoldForActions id={block.id}>
          <View>
            <TargetBlock block={block} />
          </View>
        </HoldForActions>
      );
    case 'toc':
      return (
        <HoldForActions id={block.id}>
          <View>
            <TocBlock />
          </View>
        </HoldForActions>
      );
    case 'calendar':
      return (
        <HoldForActions id={block.id}>
          <View>
            <CalendarBlock block={block} />
          </View>
        </HoldForActions>
      );
    case 'immich':
      return (
        <HoldForActions id={block.id}>
          <View>
            <ImmichBlock block={block} />
          </View>
        </HoldForActions>
      );
    case 'drawing':
      return (
        <HoldForActions id={block.id}>
          <View>
            <DrawingBlock block={block} />
          </View>
        </HoldForActions>
      );
    default:
      return null;
  }
}

const BlockView = memo(function BlockView({ id, depth, siblings, index }: { id: string; depth: number; siblings: readonly string[]; index: number }) {
  const styles = useThemedStyles(makeStyles);
  const block = useLibraryStore(s => s.blocks[id]);
  const lit = useBlockFlash(s => s.flash === id);
  const kind = block?.kind ?? 'text';
  const marginTop = useLibraryStore(s => spaceAbove(s.blocks, siblings, index, kind));
  const marginBottom = useLibraryStore(s => spaceUnder(s.blocks, siblings, index, kind));
  if (!drawn(block)) return null;
  const spacing: ViewStyle = { marginTop, marginBottom };
  if (block.kind === 'columns') {
    return (
      <View style={spacing}>
        <Columns block={block} depth={depth} />
      </View>
    );
  }
  return (
    <Animated.View ref={(view: React.ComponentRef<typeof View> | null) => placeBlock(id, view)} style={spacing} entering={ENTER}>
      <Content block={block} depth={depth} siblings={siblings} index={index} />
      {CAPTION_KINDS.has(block.kind) ? <Caption block={block} /> : null}
      {/* Reached from a source Claude cited: the selection's wash, a moment, then it fades. */}
      {lit ? <Animated.View pointerEvents="none" entering={FadeIn.duration(duration.short)} exiting={FadeOut.duration(duration.medium)} style={styles.flash} /> : null}
    </Animated.View>
  );
});

/** A block just made settles in where it lands (`LayoutAnimationConfig skipEntering` keeps a page opening still). */
const ENTER = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 6 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.medium);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    line: { flexDirection: 'row', alignItems: 'flex-start' },
    main: { flex: 1, minWidth: 0 },
    lead: { width: NEST, alignItems: 'center', justifyContent: 'center' },
    bullet: { fontSize: 22 },
    box: { marginLeft: -4, marginRight: 4 },
    chevron: { ...corners(SHAPES.chip) },
    // Its words in line with the toggle's and with what it will hold; its press reaches 8 past them.
    emptyToggle: { marginLeft: NEST - 8, paddingHorizontal: 8, paddingVertical: 6, ...corners(SHAPES.tab) },
    callout: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 12, paddingLeft: 8, paddingRight: 16, overflow: 'hidden' },
    calloutIcon: { width: 36, height: 34, marginTop: -4, alignItems: 'center', justifyContent: 'center' },
    calloutEmoji: { fontSize: 20, lineHeight: 26 },
    pageLink: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginHorizontal: -8, paddingHorizontal: 8, ...corners(SHAPES.tab), borderBottomWidth: 0, borderColor: theme.color.hairline },
    pageLinkIcon: { width: 28, alignItems: 'center' },
    pageEmoji: { fontSize: 22, lineHeight: 28 },
    pageLinkTitle: { flex: 1, textDecorationLine: 'none' },
    flash: { position: 'absolute', top: -2, bottom: -2, left: -6, right: -6, opacity: 0.6, backgroundColor: theme.color.actionContainer, borderWidth: 1.5, borderColor: theme.color.focus, ...corners(SHAPES.tab) },
  });

export { BlockView };
