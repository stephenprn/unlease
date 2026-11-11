/**
 * Material's modal navigation drawer, as habits-garden's sheet turned on its side: every app's way
 * to its places. This is the frame every app shares (the sheet, its scrim, the hand pushing it
 * back, Back closing it, the app's brand at its top, the suite's other apps at its foot); the app
 * lists its places in it with `DrawerItem`, `DrawerHeading` and `DrawerDivider` (Carnet's board,
 * collections and labels; Pages' tree of pages). A row closes the drawer before it acts.
 */
import React, { createContext, memo, useCallback, useContext, useEffect, useRef } from 'react';
import { BackHandler, Keyboard, StatusBar, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { EdgeScrollView } from './ScrollEdges';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APPS, READY_APPS, type AppId } from '@unlease/core/apps';
import type { GlyphName } from '@unlease/design/glyphs';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';

import { useReachableApps } from '../../app/hooks/useAppReachable';
import { appHome, openInApp } from '../../app/openApp';
import { BrandMark } from '../icons/BrandMark';
import { haptic } from '../../platform/haptics';
import { accelerate, decelerate, duration, FLING_SPEED, listPressDelay, spatialSlow, throwTo } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { GroundSlice } from './Ground';
import { Icon } from './Icon';
import { Tappable } from './Tappable';

/** Pushed back past this share of its width (or flung), it closes. */
const CLOSE_SHARE = 0.35;

/** How a row of the drawer closes it before it acts. */
const CloseContext = createContext<() => void>(() => {});

/** `action`, after the drawer is asked to close. */
export function useDrawerGo(): (action: () => void) => () => void {
  const close = useContext(CloseContext);
  return useCallback(
    (action: () => void) => () => {
      close();
      action();
    },
    [close],
  );
}

export interface NavDrawerProps {
  readonly open: boolean;
  /** Whose brand heads it: its mark and its name. */
  readonly app: AppId;
  readonly onClose: () => void;
  /** The rows. */
  readonly children: React.ReactNode;
}

function NavDrawerComponent({ open, app, onClose, children }: NavDrawerProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // Always mounted, off its edge when closed, so its glyphs are drawn before it ever slides out.
  // `shown` runs 0 to 1, `drag` is the hand pushing it back (negative), `width` its own.
  const { width: screen } = useWindowDimensions();
  const shownValue = useSharedValue(0);
  const drag = useSharedValue(0);
  const width = useSharedValue(0);
  // Whether letting go now would close it: crossing that point clicks, as the sheet's does.
  const past = useSharedValue(false);
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
    .onStart(() => {
      past.value = false;
    })
    .onUpdate(event => {
      drag.value = Math.min(0, event.translationX);
      // Past the point where it would close, it clicks; back short of it, it clicks again.
      const beyond = event.translationX < -width.value * CLOSE_SHARE;
      if (beyond !== past.value) {
        past.value = beyond;
        runOnJS(haptic)(beyond ? 'threshold' : 'release');
      }
    })
    .onEnd(event => {
      const beyond = past.value;
      past.value = false;
      if (beyond || event.velocityX < -FLING_SPEED) {
        // Flung short of that point, it still says it acts.
        if (!beyond) runOnJS(haptic)('threshold');
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
        <Animated.View onLayout={onSheetLayout} style={[styles.sheet, { paddingTop: insets.top + 16 }, sheetStyle]} accessibilityViewIsModal={open}>
          <View style={styles.paper} pointerEvents="none">
            {/* Against the screen's left edge, its full height: the screen's own ground, slice for slice. */}
            <GroundSlice top={0} />
          </View>
          <View style={styles.brand}>
            <BrandMark app={app} size={40} />
            <AppText variant="display">{APPS[app].name}</AppText>
          </View>
          <CloseContext.Provider value={onClose}>
            {/* It runs down to the screen's edge, the room over the gesture bar inside it. */}
            <EdgeScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}>
              {children}
              <SuiteApps app={app} />
            </EdgeScrollView>
          </CloseContext.Provider>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export const NavDrawer = memo(NavDrawerComponent);

export interface DrawerItemProps {
  readonly label: string;
  readonly icon?: GlyphName | null;
  readonly selected?: boolean;
  readonly onPress: () => void;
  /** Held down: the place's own actions (a page of Pages' tree), after the drawer closes. */
  readonly onLongPress?: () => void;
  /** Drawn in the mark's place instead of the glyph (a collection's emblem, a label's tag, a page's emoji). */
  readonly leading?: React.ReactNode;
  /** Before the mark (a branch's twisty in a tree). */
  readonly before?: React.ReactNode;
  /** At the row's end (a count, the « elsewhere » arrow). */
  readonly trailing?: React.ReactNode;
  /** The chosen sheet's wash, when matcha would sit under a pigment (a label's own). */
  readonly wash?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A place. The chosen one lies on a sheet of the primary's wash the row's whole width (its own wash
 * behind a collection's cut-out or a label's tag, so a pigment never sits on matcha), its glyph solid
 * and its name stronger, both in the wash's own ink.
 */
export const DrawerItem = memo(function DrawerItem({ label, icon = null, selected = false, onPress, onLongPress, leading, before, trailing, wash, style }: DrawerItemProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const go = useDrawerGo();
  // On the primary's wash, its ink; on an item's own (a label's), the page's.
  const ink = selected && !wash ? theme.color.onActionContainer : theme.color.ink;
  return (
    <Tappable
      unstable_pressDelay={listPressDelay}
      accessibilityRole="menuitem"
      accessibilityState={{ selected }}
      onPress={go(onPress)}
      onLongPress={onLongPress ? go(onLongPress) : undefined}
      style={[styles.item, selected ? { backgroundColor: wash ?? theme.color.actionContainer } : null, style]}
    >
      {before}
      <View style={styles.markSlot}>{leading ?? (icon ? <Icon name={icon} size={24} color={ink} solid={selected} /> : null)}</View>
      <AppText variant={selected ? 'labelStrong' : 'label'} color={selected ? ink : undefined} numberOfLines={1} style={styles.itemLabel}>
        {label}
      </AppText>
      {trailing}
    </Tappable>
  );
});

/**
 * The suite's other apps this phone can open (installed, or run by the server, whose web app then
 * opens), each by its mark, under every app's places: every drawer lists them all, the same way.
 */
const SuiteApps = memo(function SuiteApps({ app }: { app: AppId }) {
  const others = useReachableApps(READY_APPS.filter(id => id !== app));
  if (others.length === 0) return null;
  return (
    <>
      <DrawerDivider />
      <DrawerHeading title={t('Applications')} />
      {others.map(id => (
        <DrawerItem key={id} label={APPS[id].name} leading={<BrandMark app={id} size={28} />} onPress={() => void openInApp(id, appHome(id))} trailing={<ElsewhereMark />} />
      ))}
    </>
  );
});

/** A 40 high heading action reaches 48: the gap above it is empty, the row under it keeps its own touch. */
const HEADING_SLOP = 8;

/** A group's name, and at its end the way to all of them (« Tout voir », « Modifier »). */
export function DrawerHeading({ title, action }: { title: string; action?: { readonly label: string; readonly accessibilityLabel: string; readonly onPress: () => void } }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const go = useDrawerGo();
  return (
    <View style={styles.heading}>
      <AppText variant="metaStrong">{title}</AppText>
      {action ? (
        <Tappable accessibilityLabel={action.accessibilityLabel} onPress={go(action.onPress)} hitSlop={HEADING_SLOP} style={styles.headingAction}>
          <AppText variant="metaStrong" color={theme.color.link}>
            {action.label}
          </AppText>
        </Tappable>
      ) : null}
    </View>
  );
}

export function DrawerDivider() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.divider} />;
}

/** The mark at the end of a row that opens another app of the suite (or the web). */
export function ElsewhereMark() {
  const theme = useTheme();
  return <Icon name="external" size={18} color={theme.color.inkMuted} />;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: theme.color.scrim },
    // A sheet of the ground's paper against the screen's left edge, its full height (under the status bar and over the gesture bar), square, its open side a straight edge.
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
    // The mark centred on the rows' glyphs (the list's 12, the row's 16, the 24 slot's middle), the name on their labels.
    brand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 14 },
    // Its rows a little apart, so a press never runs into the next row nor the chosen one.
    list: { gap: GEOMETRY.rowGap, paddingHorizontal: 12, paddingBottom: 12 },
    item: { height: 52, ...corners(SHAPES.tab), flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16 },
    itemLabel: { flex: 1 },
    // 8 clear on each side, the list's gap counted.
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.color.hairline, marginVertical: 8 - GEOMETRY.rowGap, marginHorizontal: 16 },
    heading: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16 },
    // Its words end where the rows' counts do (16 in).
    headingAction: { minHeight: 40, minWidth: 48, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'flex-end', ...corners(SHAPES.chip) },
    markSlot: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  });
