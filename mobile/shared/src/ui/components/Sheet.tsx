/**
 * Material's modal bottom sheet. Rendered in place, not in a native Modal, so it stays under
 * the app's snackbar and inside the navigator: mount it at the root of a screen or of the app.
 * It rises once its height is known, leaves faster than it came, and the hand moves it from
 * anywhere on it, as Google's sheets: dragged down it follows the finger; a body that scrolls
 * (`SheetScroll`, `SheetFlatList`) scrolls back to its top first, then hands the drag on to the
 * sheet in the same stroke. Let go past half its height (counting the hand's speed), or flung,
 * it is thrown off; short of it, it settles back. Its threshold clicks.
 */
import React, { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Keyboard, StyleSheet, View, useWindowDimensions, type FlatList, type FlatListProps, type LayoutChangeEvent, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';

import { haptic } from '../../platform/haptics';
import { accelerate, decelerate, duration, FLING_SPEED, spatialSlow, throwTo } from '../theme/motion';
import { useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { Grain } from './Grain';
import { AnimatedOrganic, Organic } from './Organic';
import { ScrollEdges, splitScrollStyle, type EdgeProps } from './ScrollEdges';
import { Tappable } from './Tappable';
import { OverlayFocus, useKeyboardTop, useOverlayKeyboard } from './useKeyboardVisible';

export interface SheetProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly title?: string;
  readonly children?: React.ReactNode;
  /** Let the content grow to most of the screen. */
  readonly tall?: boolean;
  /** Opened over a field that keeps typing after it (a bar riding on the keyboard): the keyboard stays. */
  readonly keepsKeyboard?: boolean;
}

/** Whether a sheet darkens what is under it: the quick window over the home screen is its own scrim. */
export const SheetScrim = createContext(true);

/** The sheet's outline: its top edge and corners; its sides and foot run straight off the screen. */
const OUTLINE = 'sheet';
/** Material's rule: let go where the hand would take it in a tenth of a second, past half the sheet, it goes. */
const DISMISS_SHARE = 0.5;
const HAND_AHEAD = 0.1;
/** Flung down (`FLING_SPEED`), it goes wherever it is let go. */
const DISMISS_SPEED = FLING_SPEED;
/** A drag starts once the hand has clearly moved up or down, and leaves a sideways stroke to what is under it (a row of swatches, a slider). */
const DRAG_START = 10;
const SIDEWAYS = 16;

type NativeGesture = ReturnType<typeof Gesture.Native>;

/** What a sheet's scrolling body shares with the sheet, so the drag passes from one to the other. */
interface SheetBody {
  /** The body's own touch, run beside the sheet's drag. */
  readonly gesture: NativeGesture;
  /** How far the body is scrolled. */
  readonly offset: SharedValue<number>;
  /** How far the sheet is pulled down: while it is, the body stays at its top. */
  readonly pulled: SharedValue<number>;
  /** Whether the touch began on the body. */
  readonly touched: SharedValue<boolean>;
  /** One body per sheet hands the drag over; a second scroll in it scrolls on its own. */
  readonly claim: () => boolean;
  readonly release: () => void;
}

const SheetBodyContext = createContext<SheetBody | null>(null);

/** The room the sheet keeps over the screen's foot, and its height: a body that ends on that room takes it inside (`useFootRoom`). */
interface SheetFoot {
  readonly room: number;
  readonly panelHeight: number;
}

const SheetFootContext = createContext<SheetFoot | null>(null);

function SheetComponent({ visible, onDismiss, title, children, tall = false, keepsKeyboard = false }: SheetProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { height: screen } = useWindowDimensions();
  // Opened while the screen's field held the keyboard, the field steps aside; the sheet does not rise to meet a keyboard leaving.
  const overlay = useOverlayKeyboard(visible, keepsKeyboard);
  const heard = useKeyboardTop();
  const keyboardTop = overlay.aside ? null : heard;
  const keyboard = keyboardTop !== null;
  const scrim = useContext(SheetScrim);
  // Where the anchor ends in the window, so the keyboard's overlap is known even when it was up before the sheet opened.
  const anchor = useRef<React.ComponentRef<typeof View>>(null);
  const [anchorBottom, setAnchorBottom] = useState<number | null>(null);
  const measureAnchor = useCallback(() => anchor.current?.measureInWindow((_x, y, _width, height) => setAnchorBottom(y + height)), []);
  const lift = keyboardTop !== null && anchorBottom !== null ? Math.max(0, anchorBottom - keyboardTop) : 0;
  // Stays mounted while it leaves; `shown` runs 0 to 1, `drag` is the hand's pull, `height` the panel's own.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const shown = useSharedValue(0);
  const drag = useSharedValue(0);
  const height = useSharedValue(0);
  const [panelHeight, setPanelHeight] = useState(0);
  // Over the gesture bar; on the keyboard the content runs down to its edge (a strip of empty panel there read as a black band cutting it), and the keyboard already spans the gesture bar.
  const room = keyboard ? 0 : Math.max(insets.bottom, 16);
  const foot = useMemo<SheetFoot>(() => ({ room, panelHeight }), [room, panelHeight]);
  const thrown = useRef(false);
  // The scrolling body's part in the drag: where it is scrolled, whether the touch began on it, and where the hand was when it reached its top.
  const offset = useSharedValue(0);
  const touched = useSharedValue(false);
  const handAtTop = useSharedValue(0);
  const past = useSharedValue(false);
  const bodyGesture = useMemo(
    () =>
      Gesture.Native()
        .onBegin(() => {
          touched.value = true;
        })
        .onFinalize(() => {
          touched.value = false;
        }),
    [touched],
  );
  const claimed = useRef(false);
  const body = useMemo<SheetBody>(
    () => ({
      gesture: bodyGesture,
      offset,
      pulled: drag,
      touched,
      claim: () => {
        if (claimed.current) return false;
        claimed.current = true;
        return true;
      },
      release: () => {
        claimed.current = false;
        offset.value = 0;
      },
    }),
    [bodyGesture, offset, drag, touched],
  );

  const unmount = useCallback(() => {
    height.value = 0;
    drag.value = 0;
    thrown.current = false;
    setAnchorBottom(null);
    setMounted(false);
  }, [height, drag]);

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onDismiss]);

  useEffect(() => {
    if (visible) {
      // Opening again while it leaves: it turns round from where it is.
      thrown.current = false;
      if (height.value > 0) {
        drag.value = withSpring(0, spatialSlow);
        shown.value = withTiming(1, { duration: duration.long, easing: decelerate });
      }
      return;
    }
    // A field of the sheet's keeps no keyboard up once the sheet goes (« Ajouter » pressed while typing).
    if (mounted) Keyboard.dismiss();
    // A sheet thrown off by the hand finishes on its own; anything else leaves the M3 way.
    if (!mounted || thrown.current) return;
    shown.value = withTiming(0, { duration: duration.exit, easing: accelerate }, finished => {
      if (finished) runOnJS(unmount)();
    });
  }, [visible, mounted, shown, height, drag, unmount]);

  // It rises only once its height is known, so the motion is the panel's own, not the screen's.
  const onPanelLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const first = height.value === 0;
      height.value = event.nativeEvent.layout.height;
      setPanelHeight(event.nativeEvent.layout.height);
      if (first && visible) shown.value = withTiming(1, { duration: duration.long, easing: decelerate });
    },
    [height, shown, visible],
  );

  const markThrown = useCallback(() => {
    thrown.current = true;
  }, []);

  // Thrown off while its form asked to keep it (changes not saved: `useUnsaved`): it comes back.
  const shownNow = useRef(visible);
  useEffect(() => {
    shownNow.current = visible;
  }, [visible]);
  const afterThrow = useCallback(() => {
    if (!shownNow.current) {
      unmount();
      return;
    }
    thrown.current = false;
    drag.value = withSpring(0, spatialSlow);
  }, [unmount, drag]);

  const pan = Gesture.Pan()
    .activeOffsetY([-DRAG_START, DRAG_START])
    .failOffsetX([-SIDEWAYS, SIDEWAYS])
    .simultaneousWithExternalGesture(bodyGesture)
    .onStart(event => {
      handAtTop.value = event.translationY;
      past.value = false;
    })
    .onUpdate(event => {
      let next: number;
      if (touched.value) {
        // On the body: it scrolls back to its top first; from there the sheet follows the hand, and pushed back up it gives the scroll back.
        if (offset.value > 0.5 && drag.value <= 0) {
          handAtTop.value = event.translationY;
          return;
        }
        next = Math.max(0, event.translationY - handAtTop.value);
        if (next === 0) handAtTop.value = event.translationY;
      } else {
        // Elsewhere (the handle, the title, the foot): down it follows the finger; up it resists, it is already as high as it goes.
        next = event.translationY >= 0 ? event.translationY : -Math.sqrt(-event.translationY) * 2;
      }
      drag.value = next;
      // Past the point where it would go, it clicks; back short of it, it clicks again.
      const beyond = next > height.value * DISMISS_SHARE;
      if (beyond !== past.value) {
        past.value = beyond;
        runOnJS(haptic)(beyond ? 'threshold' : 'release');
      }
    })
    .onEnd(event => {
      if (drag.value <= 0) {
        if (drag.value < 0) drag.value = withSpring(0, { ...spatialSlow, velocity: event.velocityY });
        return;
      }
      const ahead = drag.value + Math.max(0, event.velocityY) * HAND_AHEAD;
      if (ahead > height.value * DISMISS_SHARE || event.velocityY > DISMISS_SPEED) {
        // Thrown off short of the point that clicks, it still says it goes.
        if (!past.value) runOnJS(haptic)('threshold');
        runOnJS(markThrown)();
        runOnJS(onDismiss)();
        drag.value = throwTo(height.value + 48, drag.value, event.velocityY, finished => {
          if (finished) runOnJS(afterThrow)();
        });
      } else {
        drag.value = withSpring(0, { ...spatialSlow, velocity: event.velocityY });
      }
    });

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: shown.value * interpolate(drag.value, [0, Math.max(1, height.value)], [1, 0], Extrapolation.CLAMP),
  }));
  const panelStyle = useAnimatedStyle(() => ({
    // A little past its own height, so its lift is gone too.
    transform: [{ translateY: (1 - shown.value) * (height.value ? height.value + 24 : screen) + drag.value }],
  }));

  if (!mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'box-none' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
        <Tappable accessibilityLabel={t('Fermer')} onPress={onDismiss} style={scrim ? styles.scrim : styles.clear} noTint />
      </Animated.View>
      {/* The lift comes out of this box, so the panel gives height back instead of leaving the screen. */}
      <View ref={anchor} onLayout={measureAnchor} style={[styles.anchor, { paddingTop: insets.top + 8, paddingBottom: lift }]} pointerEvents="box-none">
        <GestureDetector gesture={pan}>
          <AnimatedOrganic
            outline={OUTLINE}
            onLayout={onPanelLayout}
            style={[styles.panel, { maxHeight: screen * (tall ? 0.88 : 0.75), paddingBottom: room }, panelStyle]}
          >
            <Organic outline={OUTLINE} style={styles.paper} pointerEvents="none">
              <Grain />
            </Organic>
            <View style={styles.handleZone} accessibilityElementsHidden>
              <View style={styles.handle} />
            </View>
            {title ? (
              <AppText variant="title" style={styles.title} accessibilityRole="header">
                {title}
              </AppText>
            ) : null}
            <SheetBodyContext.Provider value={body}>
              <SheetFootContext.Provider value={foot}>
                <OverlayFocus.Provider value={overlay.focus}>{children}</OverlayFocus.Provider>
              </SheetFootContext.Provider>
            </SheetBodyContext.Provider>
          </AnimatedOrganic>
        </GestureDetector>
      </View>
    </View>
  );
}

/**
 * How far in from the sheet's own padding its title, fields, paragraphs and section heads stand: on the
 * column of its rows' glyphs (`ListRow`'s 6 and 10), 24 from the sheet's edge.
 */
export const SHEET_INSET = 16;

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: theme.color.scrim },
    clear: { flex: 1 },
    anchor: { flex: 1, justifyContent: 'flex-end' },
    // habits-garden's sheet: the ground's own paper, a firm lip (at night it is all that parts it from the scrim), its two top corners uneven.
    panel: {
      backgroundColor: theme.color.wall,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: theme.color.outline,
      // One column, 24 from the edge: the title (16 in), a row's glyph (a list row's 6 and 10), a field's edge and a paragraph (16 in, `SHEET_INSET`).
      paddingHorizontal: 8,
      boxShadow: theme.lift.float,
      flexShrink: 1,
    },
    // The grain is clipped by its own layer: the panel must not clip, or the shadow goes too.
    paper: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
    handleZone: { height: 28, alignItems: 'center', justifyContent: 'center' },
    handle: { width: 36, height: 5, borderTopLeftRadius: 3, borderTopRightRadius: 2, borderBottomRightRadius: 3, borderBottomLeftRadius: 2, backgroundColor: theme.color.outline },
    title: { marginBottom: 12, marginHorizontal: SHEET_INSET },
  });

export const Sheet = memo(SheetComponent);

/** The sheet a body lies in, claimed by the first body that scrolls (null outside a sheet, or for a second one). */
function useSheetBody(): SheetBody | null {
  const sheet = useContext(SheetBodyContext);
  const [mine] = useState(() => sheet?.claim() ?? false);
  useEffect(() => (mine ? () => sheet?.release() : undefined), [mine, sheet]);
  return mine ? sheet : null;
}

/**
 * How a sheet's body tells the sheet where it is scrolled; while the sheet is pulled down, the body
 * stays at its top, so the two never move at once.
 */
function useBodyScroll(body: SheetBody | null, own: React.Ref<never> | undefined) {
  const animated = useAnimatedRef<Animated.ScrollView>();
  // The caller's ref too (a list scrolled to the hour chosen, a thread to its end).
  const ref = useCallback(
    (node: never) => {
      (animated as unknown as (node: never) => void)(node);
      if (typeof own === 'function') own(node);
      else if (own) (own as React.RefObject<unknown>).current = node;
    },
    [animated, own],
  );
  const offset = body?.offset;
  const pulled = body?.pulled;
  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: event => {
        if (!offset || !pulled) return;
        offset.value = event.contentOffset.y;
        if (pulled.value > 0 && event.contentOffset.y !== 0) scrollTo(animated, 0, 0, false);
      },
    },
    [offset, pulled],
  );
  return { ref, onScroll };
}

/**
 * A body that ends on the sheet's room over the screen's foot (nothing under it: no actions, no
 * composer) runs on through that room to the screen's edge and keeps it at the end of what it holds,
 * so its rows are never cut short of the screen. Measured from where it lies in the panel (a body
 * wrapped in a view of its own keeps the room under it, as before), against the panel's height.
 */
function useFootRoom(): { readonly extend: number; readonly onLayout: (event: LayoutChangeEvent) => void } {
  const foot = useContext(SheetFootContext);
  const [extend, setExtend] = useState(0);
  // What it took when last laid out, so its own bottom is read as it would lie without it.
  const applied = useRef(0);
  applied.current = extend;
  const bottom = useRef<number | null>(null);
  const decide = useCallback(() => {
    const at = bottom.current;
    const last = !!foot && foot.room > 0 && foot.panelHeight > 0 && at !== null && Math.abs(at - (foot.panelHeight - foot.room)) <= 1.5;
    setExtend(last ? foot.room : 0);
  }, [foot]);
  useEffect(decide, [decide]);
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      bottom.current = y + height - applied.current;
      decide();
    },
    [decide],
  );
  return { extend, onLayout };
}

/** The caller's content style, its foot padded by the sheet's room when the body took it. */
function withRoom(style: StyleProp<ViewStyle>, extend: number): StyleProp<ViewStyle> {
  if (!extend) return style;
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  const base = flat.paddingBottom ?? flat.paddingVertical ?? flat.padding ?? 0;
  return [style, { paddingBottom: (typeof base === 'number' ? base : 0) + extend }];
}

/**
 * A sheet's scrolling body: it shrinks with the panel, so every field stays reachable above the
 * keyboard, and pulled down from its top it moves the sheet (no stretch at its ends: the sheet is what gives).
 */
export function SheetScroll({ style, ref: own, top, contentContainerStyle, ...rest }: ScrollViewProps & EdgeProps & { readonly ref?: React.Ref<React.ComponentRef<typeof Animated.ScrollView>> }) {
  const body = useSheetBody();
  const { ref, onScroll } = useBodyScroll(body, own as React.Ref<never>);
  const room = useFootRoom();
  const { outer, inner } = splitScrollStyle([shrink.scroll, style, room.extend ? { marginBottom: -room.extend } : null]);
  const scroll = (
    <Animated.ScrollView
      ref={ref}
      keyboardShouldPersistTaps="handled"
      overScrollMode={body ? 'never' : undefined}
      scrollEventThrottle={16}
      onScroll={onScroll}
      style={inner}
      contentContainerStyle={withRoom(contentContainerStyle, room.extend)}
      {...(rest as object)}
    />
  );
  // Its ends soften under the handle and the foot while it runs on past them (`ScrollEdges`).
  return (
    <ScrollEdges style={outer} top={top} onLayout={room.onLayout}>
      {body ? <GestureDetector gesture={body.gesture}>{scroll}</GestureDetector> : scroll}
    </ScrollEdges>
  );
}

/** A sheet's long list (a picker of notes, emojis, zones): `SheetScroll`'s hand-over, virtualized. */
export function SheetFlatList<T>({ style, data, ref: own, top, contentContainerStyle, ...rest }: FlatListProps<T> & EdgeProps & { readonly ref?: React.Ref<FlatList<T>> }) {
  const body = useSheetBody();
  const { ref, onScroll } = useBodyScroll(body, own as React.Ref<never>);
  const room = useFootRoom();
  const { outer, inner } = splitScrollStyle([shrink.scroll, style, room.extend ? { marginBottom: -room.extend } : null]);
  const list = (
    <Animated.FlatList
      ref={ref as never}
      data={data}
      keyboardShouldPersistTaps="handled"
      overScrollMode={body ? 'never' : undefined}
      scrollEventThrottle={16}
      onScroll={onScroll}
      style={inner}
      contentContainerStyle={withRoom(contentContainerStyle, room.extend)}
      {...(rest as object)}
    />
  );
  return (
    <ScrollEdges style={outer} top={top} onLayout={room.onLayout}>
      {body ? <GestureDetector gesture={body.gesture}>{list}</GestureDetector> : list}
    </ScrollEdges>
  );
}

const shrink = StyleSheet.create({ scroll: { flexShrink: 1 } });
