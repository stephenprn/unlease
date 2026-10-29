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

import { SHAPES } from '@unlease/design/shapes';
import { t, tx } from '@unlease/core/i18n';
import { CAPTION_KINDS, RICH_KINDS, UNTITLED_PAGE, type Block, type BlockKind } from '@unlease/notes/models/blocks';
import { bulletMark, listDepth, listNumber, numberLabel } from '@unlease/notes/services/blocks';
import { useLibraryStore } from '@app/store/libraryStore';
import { insertBlock, updateBlock } from '@app/store/pages';
import { setToggleOpen, usePagesUiStore } from '@app/store/pagesUi';
import { haptic } from '@platform/haptics';

import { AppText, Checkbox, Icon, Organic, Tappable } from '../../components';
import { decelerate, duration, standard } from '../../theme/motion';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
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

const NO_IDS: readonly string[] = [];
/** A nested block's step in: one list mark's width. */
export const NEST = 26;

export const PLACEHOLDERS: Partial<Record<BlockKind, string>> = {
  text: tx('Écrivez, ou tapez « / » pour les commandes'),
  h1: tx('Titre 1'),
  h2: tx('Titre 2'),
  h3: tx('Titre 3'),
  h4: tx('Titre 4'),
  bullet: tx('Liste'),
  numbered: tx('Liste'),
  todo: tx('À faire'),
  toggle: tx('Liste dépliante'),
  callout: tx('Écrivez quelque chose…'),
};

/** The web's rhythm without margins collapsing: room above and below, by kind. */
const SPACE: Partial<Record<BlockKind, readonly [number, number]>> = {
  text: [4, 4],
  h1: [26, 2],
  h2: [22, 2],
  h3: [16, 2],
  h4: [12, 2],
  bullet: [1, 1],
  numbered: [1, 1],
  todo: [1, 1],
  toggle: [1, 1],
  page: [2, 2],
};
const BOX_SPACE: readonly [number, number] = [8, 8];

/** A container's blocks, in order. */
export const BlockList = memo(function BlockList({ parentId, depth }: { parentId: string; depth: number }) {
  const ids = useLibraryStore(s => s.blocksByParent[parentId]) ?? NO_IDS;
  return (
    <>
      {ids.map((id, index) => (
        <BlockView key={id} id={id} depth={depth} siblings={ids} index={index} first={index === 0} />
      ))}
    </>
  );
});

function Children({ id, depth }: { id: string; depth: number }) {
  const has = useLibraryStore(s => (s.blocksByParent[id]?.length ?? 0) > 0);
  if (!has) return null;
  return (
    <View style={{ paddingLeft: NEST }}>
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
    <Tappable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={open ? t('Replier') : t('Déplier')} onPress={() => setToggleOpen(block.id, !open)} hitSlop={8} style={[styles.lead, styles.chevron, { height: lineHeightOf(block.kind) }]}>
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
          <Checkbox checked={block.checked} label={block.checked ? t('Marquer comme à faire') : t('Marquer comme fait')} disabled={readOnly} onToggle={() => updateBlock(page, block.id, { checked: !block.checked })} />
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
          <RichInput block={block} placeholder={t(PLACEHOLDERS[block.kind] ?? '')} done={block.kind === 'todo' && block.checked} />
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
            {t('Liste vide. Touchez pour y écrire.')}
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
    <Organic outline="panel" style={[styles.callout, { backgroundColor: block.color ? theme.line[block.color].tint : theme.color.paperHigh }]}>
      <Tappable accessibilityLabel={t('Changer l’icône de l’encadré')} disabled={readOnly} ownDisabled onPress={() => openPageSheet({ kind: 'emoji', block: block.id, allowNone: false })} pebble={2} style={styles.calloutIcon}>
        <AppText style={styles.calloutEmoji}>{block.icon ?? '💡'}</AppText>
      </Tappable>
      <View style={styles.main}>
        <RichInput block={block} placeholder={t(PLACEHOLDERS.callout ?? '')} />
        <Children id={block.id} depth={depth} />
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

const BlockView = memo(function BlockView({ id, depth, siblings, index, first }: { id: string; depth: number; siblings: readonly string[]; index: number; first: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const block = useLibraryStore(s => s.blocks[id]);
  const lit = useBlockFlash(s => s.flash === id);
  if (!block || block.deletedAt !== null || block.kind === 'column' || block.kind === 'row') return null;
  if (block.kind === 'page' && block.trashedAt !== null) return null;
  if (block.kind === 'columns') return <Columns block={block} depth={depth} />;
  const [top, bottom] = SPACE[block.kind] ?? BOX_SPACE;
  const spacing: ViewStyle = { marginTop: first ? 0 : top, marginBottom: bottom };
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
    emptyToggle: { marginLeft: NEST, paddingHorizontal: 8, paddingVertical: 6, ...corners(SHAPES.tab) },
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
