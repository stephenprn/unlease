/**
 * Material's modal navigation drawer, as habits-garden's sheet turned on its side: every place in
 * the app, in two spaces. At its top a switch turns the list over between the notes (Keep's side:
 * the board, reminders, collections, labels, the archive) and the pages (the tree of the knowledge
 * base); the bin, the settings and the Administration belong to both, at the foot.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, ScrollView, StatusBar, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, Keyframe, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_NAME } from '@unlease/notes/brand';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { asLineColor } from '@unlease/design/colors';
import { SHAPES } from '@unlease/design/shapes';
import type { GlyphName } from '@unlease/design/glyphs';
import { t, tx } from '@unlease/core/i18n';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';
import { UNTITLED_PAGE } from '@unlease/notes/models/blocks';
import type { BoardView } from '@app/hooks/useBoard';
import { useLines } from '@app/hooks/useLines';
import { useChildPages } from '@app/hooks/usePages';
import { useLibraryStore } from '@app/store/libraryStore';
import { setExpanded, usePagesUiStore } from '@app/store/pagesUi';

import { AppText, Emblem, GroundSlice, Icon, LabelTag, Organic, Segmented, Tappable } from '../components';
import { accelerate, decelerate, duration, listPressDelay, spatialSlow, throwTo } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { BrandMark } from '../icons/BrandMark';

/** A collection's open links, at the row's end as on the web's navigation; nothing at zero. */
const LineCount = memo(function LineCount({ id }: { id: string }) {
  const theme = useTheme();
  const count = useLibraryStore(s => (s.linksByNote[id] ?? []).filter(lid => s.links[lid] && !s.links[lid]!.done).length);
  return count > 0 ? (
    <AppText variant="labelSmall" color={theme.color.inkMuted}>
      {count}
    </AppText>
  ) : null;
});

export type Space = 'notes' | 'pages';

/** A place the drawer can show as chosen. */
export type DrawerPlace = BoardView | 'lines' | 'settings' | 'admin' | 'pages' | `page:${string}` | null;

/** The other space's list comes in from its side. */
const FROM_RIGHT = new Keyframe({ 0: { opacity: 0, transform: [{ translateX: 16 }] }, 100: { opacity: 1, transform: [{ translateX: 0 }], easing: decelerate } }).duration(duration.medium);
const FROM_LEFT = new Keyframe({ 0: { opacity: 0, transform: [{ translateX: -16 }] }, 100: { opacity: 1, transform: [{ translateX: 0 }], easing: decelerate } }).duration(duration.medium);

const SPACES = [
  { value: 'notes', label: tx('Notes'), icon: 'note' },
  { value: 'pages', label: tx('Pages'), icon: 'page' },
] as const;

/** How far a sub-page sits in from its parent in the tree. */
const TREE_STEP = 14;
/** The 28 by 40 twisty reaches 48 by 52 under a finger. */
const TWISTY_SLOP = { top: 6, bottom: 6, left: 10, right: 10 } as const;
/** A 40 high heading action reaches 48: the gap above it is empty, the row under it keeps its own touch. */
const HEADING_SLOP = 8;

export interface DrawerProps {
  readonly open: boolean;
  /** The space of the screen it is opened from: the list it opens on. */
  readonly space: Space;
  readonly current: DrawerPlace;
  readonly onClose: () => void;
  readonly onView: (view: BoardView) => void;
  readonly onLine: (id: string) => void;
  readonly onLines: () => void;
  /** No collection to list: the row that makes one. */
  readonly onNewLine: () => void;
  readonly onLabels: () => void;
  readonly onSettings: () => void;
  readonly onAdmin: () => void;
  /** The pages' home. */
  readonly onPages: () => void;
  readonly onPage: (id: string) => void;
  readonly onNewPage: () => void;
}

/** A page in the tree, its sub-pages under it while its branch is open. */
const PageBranch = memo(function PageBranch({ id, depth, current, go, onPage }: { id: string; depth: number; current: DrawerPlace; go: (action: () => void) => () => void; onPage: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const page = useLibraryStore(s => s.blocks[id]);
  const children = useChildPages(id);
  const expanded = usePagesUiStore(s => s.expanded.has(id));
  if (!page) return null;
  const selected = current === `page:${id}`;
  const title = page.text.trim() || t(UNTITLED_PAGE);
  return (
    <>
      <Tappable unstable_pressDelay={listPressDelay} accessibilityRole="menuitem" accessibilityState={{ selected }} onPress={go(() => onPage(id))} style={[styles.item, { paddingLeft: 4 + depth * TREE_STEP }]}>
        {children.length > 0 ? (
          <Tappable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={expanded ? t('Replier {title}', { title }) : t('Déplier {title}', { title })} hitSlop={TWISTY_SLOP} onPress={() => setExpanded(id, !expanded)} style={styles.twisty}>
            <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={18} color={theme.color.inkMuted} />
          </Tappable>
        ) : (
          <View style={styles.twisty} />
        )}
        <View style={styles.markSlot}>
          {selected ? <Organic pebble={1} style={[styles.stone, { backgroundColor: theme.color.actionContainer }]} /> : null}
          {page.icon ? <AppText style={styles.pageEmoji}>{page.icon}</AppText> : <Icon name="page" size={22} color={selected ? theme.color.onActionContainer : theme.color.ink} solid={selected} />}
        </View>
        <AppText variant={selected ? 'labelStrong' : 'label'} numberOfLines={1} style={styles.itemLabel}>
          {title}
        </AppText>
      </Tappable>
      {expanded ? children.map(child => <PageBranch key={child} id={child} depth={depth + 1} current={current} go={go} onPage={onPage} />) : null}
    </>
  );
});

function DrawerComponent({ open, space, current, onClose, onView, onLine, onLines, onNewLine, onLabels, onSettings, onAdmin, onPages, onPage, onNewPage }: DrawerProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // Opened, it shows its host's space; the switch turns the list over in place.
  const [shown, setShown] = useState<Space>(space);
  const [arrival, setArrival] = useState<'left' | 'right' | null>(null);
  useEffect(() => {
    if (!open) return;
    setShown(space);
    setArrival(null);
  }, [open, space]);
  const roots = useChildPages(null);
  const allLines = useLines();
  // As on the board: "Non classé" shows only while a link waits in it.
  const inboxHolds = useLibraryStore(s => (s.linksByNote[INBOX_ID] ?? []).some(lid => !!s.links[lid] && !s.links[lid]!.done));
  const lines = inboxHolds ? allLines : allLines.filter(line => line.id !== INBOX_ID);
  const labelOrder = useLibraryStore(s => s.labelOrder);
  const labels = useLibraryStore(s => s.labels);

  // Always mounted, off its edge when closed, so its glyphs are drawn before it ever slides out.
  // `shown` runs 0 to 1, `drag` is the hand pushing it back (negative), `width` its own.
  const { width: screen } = useWindowDimensions();
  const shownValue = useSharedValue(0);
  const drag = useSharedValue(0);
  const width = useSharedValue(0);
  const thrown = useRef(false);

  const settled = useCallback(() => {
    thrown.current = false;
  }, []);

  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      // What was being typed steps aside: the keyboard would sit over the drawer.
      Keyboard.dismiss();
      thrown.current = false;
      drag.value = withSpring(0, spatialSlow);
      shownValue.value = withTiming(1, { duration: duration.long, easing: decelerate });
      return;
    }
    if (thrown.current) return;
    shownValue.value = withTiming(0, { duration: duration.exit, easing: accelerate });
  }, [open, shownValue, drag]);

  const onSheetLayout = useCallback(
    (event: LayoutChangeEvent) => {
      width.value = event.nativeEvent.layout.width;
    },
    [width],
  );

  const markThrown = useCallback(() => {
    thrown.current = true;
  }, []);

  // Pushed back towards its edge it follows the finger; let go far or fast enough, it closes with the hand's speed.
  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-14, 14])
    .onUpdate(event => {
      drag.value = Math.min(0, event.translationX);
    })
    .onEnd(event => {
      if (event.translationX < -width.value * 0.35 || event.velocityX < -900) {
        runOnJS(markThrown)();
        runOnJS(onClose)();
        drag.value = throwTo(-width.value - 24, drag.value, event.velocityX, finished => {
          if (!finished) return;
          // Off its edge: closed, ready to slide out again from there.
          shownValue.value = 0;
          drag.value = 0;
          runOnJS(settled)();
        });
      } else {
        drag.value = withSpring(0, { ...spatialSlow, velocity: event.velocityX });
      }
    });

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: shownValue.value * interpolate(drag.value, [-Math.max(1, width.value), 0], [0, 1], Extrapolation.CLAMP),
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    // Closed: past its own width and its shadow.
    transform: [{ translateX: -(1 - shownValue.value) * (width.value ? width.value + 24 : screen) + drag.value }],
  }));

  const go = (action: () => void) => () => {
    onClose();
    action();
  };

  // The chosen place: the row stays on the paper, its leading mark lies on a pebble (matcha behind a
  // glyph; its own wash behind a collection's cut-out or a label's tag, so a pigment never sits on
  // matcha), the glyph solid, the name stronger.
  const item = (key: string, label: string, icon: GlyphName | null, selected: boolean, onPress: () => void, leading?: React.ReactNode, trailing?: React.ReactNode, wash?: string) => (
    <Tappable key={key} unstable_pressDelay={listPressDelay} accessibilityRole="menuitem" accessibilityState={{ selected }} onPress={go(onPress)} style={styles.item}>
      <View style={styles.markSlot}>
        {selected ? <Organic pebble={1} style={[styles.stone, { backgroundColor: wash ?? theme.color.actionContainer }]} /> : null}
        {leading ?? (icon ? <Icon name={icon} size={24} color={selected ? theme.color.onActionContainer : theme.color.ink} solid={selected} /> : null)}
      </View>
      <AppText variant={selected ? 'labelStrong' : 'label'} numberOfLines={1} style={styles.itemLabel}>
        {label}
      </AppText>
      {trailing}
    </Tappable>
  );

  return (
    // Closed, it is out of reach of the hand and of TalkBack alike.
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      {open ? <StatusBar barStyle={theme.barStyle} /> : null}
      <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
        <Tappable accessibilityLabel={t('Fermer le menu')} noTint onPress={onClose} style={styles.scrim} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View onLayout={onSheetLayout} style={[styles.sheet, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 12 }, sheetStyle]} accessibilityViewIsModal={open}>
          <View style={styles.paper} pointerEvents="none">
            {/* Against the screen's left edge, its full height: the screen's own ground, slice for slice. */}
            <GroundSlice top={0} />
          </View>
          <View style={styles.brand}>
            <BrandMark size={40} />
            <AppText variant="display">{APP_NAME}</AppText>
          </View>
          <View style={styles.switch}>
            <Segmented
              options={SPACES.map(option => ({ ...option, label: t(option.label) }))}
              value={shown}
              onChange={next => {
                setArrival(next === 'pages' ? 'right' : 'left');
                setShown(next);
              }}
            />
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            <Animated.View key={shown} entering={arrival === 'right' ? FROM_RIGHT : arrival === 'left' ? FROM_LEFT : undefined}>
            {shown === 'pages' ? (
              <>
                {item('pages', t('Toutes les pages'), 'page', current === 'pages', onPages)}
                <View style={styles.divider} />
                <View style={styles.heading}>
                  <AppText variant="metaStrong">{t('Pages')}</AppText>
                </View>
                {roots.map(id => (
                  <PageBranch key={id} id={id} depth={0} current={current} go={go} onPage={onPage} />
                ))}
                {item('new-page', t('Nouvelle page'), 'pagePlus', false, onNewPage)}
              </>
            ) : (
              <>
            {item('notes', t('Notes'), 'note', current === 'notes', () => onView('notes'))}
            {item('reminders', t('Rappels'), 'bell', current === 'reminders', () => onView('reminders'))}
            <View style={styles.divider} />
            <View style={styles.heading}>
              <AppText variant="metaStrong">{t('Collections')}</AppText>
              <Tappable accessibilityLabel={t('Toutes les collections')} onPress={go(onLines)} hitSlop={HEADING_SLOP} style={styles.headingAction}>
                <AppText variant="metaStrong" color={theme.color.link}>
                  {t('Tout voir')}
                </AppText>
              </Tappable>
            </View>
            {lines.map(line =>
              item(`line-${line.id}`, shownTitle(line), null, false, () => onLine(line.id), <Emblem emblem={collectionEmblem(line.id, line.emblem)} color={asLineColor(line.color)} size={26} />, <LineCount id={line.id} />),
            )}
            {lines.length === 0 ? item('lines-empty', t('Créer une collection'), 'collections', false, onNewLine) : null}
            <View style={styles.divider} />
            <View style={styles.heading}>
              <AppText variant="metaStrong">{t('Labels')}</AppText>
              <Tappable accessibilityLabel={t('Modifier les labels')} onPress={go(onLabels)} hitSlop={HEADING_SLOP} style={styles.headingAction}>
                <AppText variant="metaStrong" color={theme.color.link}>
                  {t('Modifier')}
                </AppText>
              </Tappable>
            </View>
            {labelOrder.map(id => {
              const label = labels[id];
              if (!label) return null;
              const view: BoardView = `label:${id}`;
              return item(
                `label-${id}`,
                label.name,
                null,
                current === view,
                () => onView(view),
                <LabelTag color={label.color} size={20} />,
                undefined,
                theme.line[label.color].tint,
              );
            })}
            {labelOrder.length === 0 ? item('labels-empty', t('Créer un label'), 'tag', false, onLabels) : null}
            <View style={styles.divider} />
            {item('archive', t('Archives'), 'archive', current === 'archive', () => onView('archive'))}
              </>
            )}
            </Animated.View>
            <View style={styles.divider} />
            {item('trash', t('Corbeille'), 'trash', current === 'trash', () => onView('trash'))}
            {item('settings', t('Réglages'), 'settings', current === 'settings', onSettings)}
            {item('admin', t('Administration'), 'server', current === 'admin', onAdmin)}
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** A sheet of the ground's paper against the screen's left edge, its full height (under the status bar and over the gesture bar), square, its open side a straight edge. */

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: theme.color.scrim },
    sheet: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: 312,
      maxWidth: '86%',
      // The ground itself, the full height of the screen (`GroundSlice` paints it), as behind the board.
      backgroundColor: theme.ground.base,
      borderRightWidth: 1,
      borderColor: theme.color.outline,
      boxShadow: theme.lift.float,
    },
    paper: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingBottom: 14 },
    switch: { paddingHorizontal: 16, paddingBottom: 8 },
    twisty: { width: 28, height: 40, alignItems: 'center', justifyContent: 'center', ...corners(SHAPES.chip) },
    pageEmoji: { fontSize: 18, lineHeight: 24 },
    list: { paddingHorizontal: 12, paddingBottom: 12 },
    item: { height: 52, ...corners(SHAPES.tab), flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16 },
    itemLabel: { flex: 1 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.color.hairline, marginVertical: 8, marginHorizontal: 16 },
    heading: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16 },
    headingAction: { minHeight: 40, minWidth: 48, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'flex-end', ...corners(SHAPES.chip) },
    markSlot: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    // The chosen place's pebble, under its mark.
    stone: { position: 'absolute', top: -8, left: -12, right: -12, bottom: -8 },
  });

export const Drawer = memo(DrawerComponent);
