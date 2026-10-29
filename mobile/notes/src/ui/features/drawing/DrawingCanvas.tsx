/**
 * A drawing's sheet under the finger. One finger draws, or erases (the eraser's reach a quiet
 * circle under it); two fingers scroll a sheet taller than the view, thrown on with the hand's
 * speed; a sheet only read scrolls with one. The sheet is transparent: the paper under it is its
 * host's (the note's own colour and paper, a page's sheet).
 *
 * Kept strokes are drawn in bands of the sheet, each an SVG of its own a whole number of pixels
 * high, so a stroke kept or erased draws again only the bands it lies in. The stroke under the
 * finger never goes through React: its path grows on the UI thread (shared values, an animated
 * path's `d`) in a live slot, an SVG as big as the view laid over the bands, and the stroke kept
 * in its place shows in the very frame that slot empties (`handOver`).
 */
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, runOnUI, useAnimatedProps, useAnimatedStyle, useSharedValue, withDecay, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { t } from '@unlease/core/i18n';
import { DRAWING_LIMITS, DRAWING_WIDTH, ERASER_RADIUS, type Stroke } from '@unlease/notes/models/drawing';
import { eraserReach, strokeWidth } from '@unlease/notes/services/drawing';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { inkPalette, keepSameBands, pathOf, sheetUnits, strokeOpacity, strokesByBand, type InkPalette } from './drawingModel';
import { pathCurve, pathEnd, pathStart } from './livePath';
import { StrokePath } from './StrokePath';
import { releaseSlot, type DrawingEditor, type LiveSlot } from './useDrawingEditor';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** A band of the sheet is about this many drawing units high. */
const BAND = 400;
/** A point nearer than this to the last one (drawing units) adds nothing to the stroke. */
const MIN_STEP = 0.75;
/** A second finger this soon after the first (ms) meant a scroll, and the system taking the touch a back swipe: the stroke is dropped. */
const SCROLL_INTENT = 250;
const CANCELLED = State.CANCELLED;
const PIXEL = PixelRatio.get();

/** What a finger down does: nothing, draws, erases. */
const NOTHING = 0;
const DRAWS = 1;
const ERASES = 2;

/** Shows a stroke drawn here and empties the live slot that held it, in the same frame. */
function handOver(slots: readonly LiveSlot[], seq: number, opacity: SharedValue<number>): void {
  'worklet';
  releaseSlot(slots, seq);
  opacity.value = 1;
}

/** The sheet's scroll, kept inside what the sheet now holds. */
function fitScroll(scroll: SharedValue<number>, max: SharedValue<number>, room: number): void {
  'worklet';
  max.value = room;
  if (scroll.value > room) scroll.value = room;
}

interface BandProps {
  readonly strokes: readonly Stroke[];
  readonly index: number;
  readonly height: number;
  readonly units: number;
  readonly palette: InkPalette;
  readonly drawn: ReadonlyMap<string, number>;
  readonly shown: Set<number>;
  readonly slots: readonly LiveSlot[];
}

/** A stroke drawn here: hidden until its live slot empties, then shown in that frame (a band drawn again shows it at once). */
const DrawnPath = memo(function DrawnStroke({ stroke, seq, palette, slots, shown }: { stroke: Stroke; seq: number; palette: InkPalette; slots: readonly LiveSlot[]; shown: Set<number> }) {
  const [already] = useState(() => shown.has(seq));
  const opacity = useSharedValue(already ? 1 : 0);
  const animated = useAnimatedProps(() => ({ opacity: opacity.value }));
  useEffect(() => {
    if (already) return;
    shown.add(seq);
    runOnUI(handOver)(slots, seq, opacity);
  }, [already, opacity, seq, shown, slots]);
  return (
    <AnimatedPath
      animatedProps={animated}
      d={pathOf(stroke)}
      fill="none"
      stroke={palette[stroke.ink]}
      strokeWidth={strokeWidth(stroke)}
      strokeOpacity={strokeOpacity(stroke.tool)}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
});

const Band = memo(function SheetBand({ strokes, index, height, units, palette, drawn, shown, slots }: BandProps) {
  // A view sizes the band: the SVG library cuts a size it is given to whole dp, a pixel short of the next band.
  return (
    <View style={[bandStyles.band, { top: index * height, height }]}>
      <Svg width="100%" height="100%" viewBox={`0 ${index * units} ${DRAWING_WIDTH} ${units}`}>
        {strokes.map(stroke => {
          const seq = drawn.get(stroke.id);
          return seq === undefined ? (
            <StrokePath key={stroke.id} stroke={stroke} palette={palette} />
          ) : (
            <DrawnPath key={stroke.id} stroke={stroke} seq={seq} palette={palette} slots={slots} shown={shown} />
          );
        })}
      </Svg>
    </View>
  );
});

/** A live slot: the stroke under the finger, its path set on the UI thread. */
const LivePath = memo(function LiveStroke({ slot, color, width, opacity }: { slot: LiveSlot; color: string; width: number; opacity: number }) {
  const animated = useAnimatedProps(() => ({ d: slot.d.value }));
  return <AnimatedPath animatedProps={animated} fill="none" stroke={color} strokeWidth={width} strokeOpacity={opacity} strokeLinecap="round" strokeLinejoin="round" />;
});

function DrawingCanvasComponent({ editor, style }: { editor: DrawingEditor; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const palette = inkPalette(theme);
  const { strokes, editable, slots, events, drawn, shown, choice } = editor;
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setFrame(current => (current.width === width && current.height === height ? current : { width, height }));
  };

  // dp per drawing unit: the sheet is DRAWING_WIDTH units across, whatever the screen.
  const scale = frame.width > 0 ? frame.width / DRAWING_WIDTH : 0;
  const viewUnits = scale > 0 ? frame.height / scale : 0;
  const sheet = useMemo(() => sheetUnits(strokes, viewUnits), [strokes, viewUnits]);
  const sheetHeight = sheet * scale;
  // Bands a whole number of pixels high: a stroke crossing from one to the next meets itself exactly.
  const bandHeight = scale > 0 ? Math.max(1, Math.round(BAND * scale * PIXEL)) / PIXEL : 0;
  const bandUnits = scale > 0 ? bandHeight / scale : BAND;
  const bandCount = bandHeight > 0 ? Math.ceil(sheetHeight / bandHeight) : 0;
  const lastBands = useRef<(readonly Stroke[])[]>([]);
  const bands = useMemo(() => {
    const next = keepSameBands(lastBands.current, strokesByBand(strokes, bandUnits, bandCount));
    lastBands.current = next;
    return next;
  }, [strokes, bandUnits, bandCount]);

  const unit = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const scrollMax = useSharedValue(0);
  const scrollFrom = useSharedValue(0);
  /** The scroll the live stroke was drawn at: its slot moves with the sheet should it scroll before the stroke shows in place. */
  const drawnAt = useSharedValue(0);
  const tool = useSharedValue(NOTHING);
  const doing = useSharedValue(NOTHING);
  const points = useSharedValue<number[]>([]);
  const settled = useSharedValue('');
  const count = useSharedValue(0);
  const lastX = useSharedValue(0);
  const lastY = useSharedValue(0);
  const slotAt = useSharedValue(-1);
  const counter = useSharedValue(0);
  const startedAt = useSharedValue(0);
  const crowded = useSharedValue(false);
  const eraserX = useSharedValue(0);
  const eraserY = useSharedValue(0);
  const eraserOn = useSharedValue(0);
  const fromX = useSharedValue(0);
  const fromY = useSharedValue(0);
  /** The eraser's reach in drawing units: never under ERASER_MIN_PX on screen (core's `eraserReach`). */
  const reachUnits = scale > 0 ? eraserReach(1 / scale) : ERASER_RADIUS;
  const reach = useSharedValue(reachUnits);

  useEffect(() => {
    unit.value = scale;
    reach.value = reachUnits;
  }, [scale, unit, reach, reachUnits]);
  useEffect(() => {
    tool.value = !editable ? NOTHING : choice.tool === 'eraser' ? ERASES : DRAWS;
  }, [editable, choice.tool, tool]);
  const room = Math.max(0, sheetHeight - frame.height);
  useEffect(() => {
    runOnUI(fitScroll)(scrollY, scrollMax, room);
  }, [room, scrollY, scrollMax]);

  const gesture = useMemo(() => {
    const draw = Gesture.Pan()
      .withTestId('drawing')
      .enabled(editable)
      .minDistance(0)
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      .onTouchesDown(event => {
        if (event.numberOfTouches > 1) crowded.value = true;
      })
      .onBegin(event => {
        const s = unit.value;
        doing.value = s > 0 ? tool.value : NOTHING;
        if (doing.value === NOTHING) return;
        // A finger on the sheet stops it where a throw left it moving.
        cancelAnimation(scrollY);
        startedAt.value = Date.now();
        runOnJS(events.begin)();
        const x = Math.min(DRAWING_WIDTH, Math.max(0, event.x / s));
        const y = Math.max(0, (event.y + scrollY.value) / s);
        if (doing.value === ERASES) {
          eraserX.value = event.x;
          eraserY.value = event.y;
          eraserOn.value = 1;
          fromX.value = x;
          fromY.value = y;
          runOnJS(events.erase)(x, y, x, y, reach.value);
          return;
        }
        // A free slot, or else the one held longest (its stroke shows in place in a moment anyway).
        let pick = 0;
        for (let index = 1; index < slots.length; index += 1) if (slots[index]!.seq.value < slots[pick]!.seq.value) pick = index;
        counter.value += 1;
        const slot = slots[pick]!;
        slot.seq.value = counter.value;
        slotAt.value = pick;
        drawnAt.value = scrollY.value;
        points.value = [x, y];
        const top = y - scrollY.value / s;
        settled.value = pathStart(x, top);
        count.value = 1;
        lastX.value = x;
        lastY.value = top;
        slot.d.value = settled.value + pathEnd(1, x, top);
      })
      .onUpdate(event => {
        const s = unit.value;
        if (doing.value === NOTHING || s <= 0) return;
        const x = Math.min(DRAWING_WIDTH, Math.max(0, event.x / s));
        const y = Math.max(0, (event.y + scrollY.value) / s);
        if (doing.value === ERASES) {
          eraserX.value = event.x;
          eraserY.value = event.y;
          runOnJS(events.erase)(fromX.value, fromY.value, x, y, reach.value);
          fromX.value = x;
          fromY.value = y;
          return;
        }
        const at = slotAt.value;
        if (at < 0 || count.value >= DRAWING_LIMITS.points) return;
        // In the live slot's own frame: the view's top when the stroke began.
        const top = y - drawnAt.value / s;
        if (Math.abs(x - lastX.value) + Math.abs(top - lastY.value) < MIN_STEP) return;
        if (count.value >= 2) settled.value += pathCurve(lastX.value, lastY.value, x, top);
        count.value += 1;
        lastX.value = x;
        lastY.value = top;
        points.modify(list => {
          'worklet';
          list.push(x, y);
          return list;
        });
        slots[at]!.d.value = settled.value + pathEnd(count.value, x, top);
      })
      .onFinalize((event, success) => {
        const kind = doing.value;
        doing.value = NOTHING;
        const crowd = crowded.value || event.numberOfPointers > 1;
        crowded.value = false;
        if (kind === NOTHING) return;
        const young = Date.now() - startedAt.value < SCROLL_INTENT;
        const dropped = young && (crowd || (!success && event.state === CANCELLED));
        if (kind === ERASES) {
          eraserOn.value = 0;
          runOnJS(events.eraseEnd)(!dropped);
          return;
        }
        const at = slotAt.value;
        slotAt.value = -1;
        if (at < 0) return;
        const slot = slots[at]!;
        if (dropped) {
          slot.seq.value = 0;
          slot.d.value = '';
          runOnJS(events.drop)();
          return;
        }
        runOnJS(events.stroke)(points.value, slot.seq.value);
      });

    const scroll = Gesture.Pan()
      .minPointers(editable ? 2 : 1)
      .averageTouches(true)
      .onStart(() => {
        cancelAnimation(scrollY);
        scrollFrom.value = scrollY.value;
      })
      .onUpdate(event => {
        scrollY.value = Math.min(scrollMax.value, Math.max(0, scrollFrom.value - event.translationY));
      })
      .onEnd(event => {
        if (scrollMax.value <= 0) return;
        scrollY.value = withDecay({ velocity: -event.velocityY, clamp: [0, scrollMax.value] });
      });

    return Gesture.Simultaneous(draw, scroll);
  }, [editable, events, slots, unit, tool, doing, scrollY, scrollMax, scrollFrom, startedAt, eraserX, eraserY, eraserOn, fromX, fromY, reach, counter, slotAt, drawnAt, points, settled, count, lastX, lastY, crowded]);

  // Whole pixels, so strokes stay crisp wherever the sheet stops.
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.round(scrollY.value * PIXEL) / PIXEL }] }));
  const liveStyle = useAnimatedStyle(() => ({ transform: [{ translateY: Math.round((drawnAt.value - scrollY.value) * PIXEL) / PIXEL }] }));
  const ring = reachUnits * scale;
  const eraserStyle = useAnimatedStyle(() => ({ opacity: eraserOn.value, transform: [{ translateX: eraserX.value - ring }, { translateY: eraserY.value - ring }] }));

  const penColor = palette[choice.ink];
  const penWidth = strokeWidth({ tool: choice.pen, size: choice.sizes[choice.pen] });
  const penOpacity = strokeOpacity(choice.pen);

  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        onLayout={onLayout}
        style={[styles.view, style]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('Zone de dessin')}
        accessibilityHint={editable ? t('Un doigt dessine, deux doigts font défiler.') : undefined}
      >
        {scale > 0 ? (
          <>
            {/* Out of the flow: a taller sheet scrolls inside the view, it never makes the view (and the tools under it) move. */}
            <Animated.View pointerEvents="none" style={[styles.sheet, { height: sheetHeight }, sheetStyle]}>
              {bands.map((list, index) =>
                list.length > 0 ? (
                  <Band key={index} strokes={list} index={index} height={bandHeight} units={bandUnits} palette={palette} drawn={drawn} shown={shown} slots={slots} />
                ) : null,
              )}
            </Animated.View>
            {editable ? (
              <>
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, liveStyle]}>
                  <Svg width="100%" height="100%" viewBox={`0 0 ${DRAWING_WIDTH} ${viewUnits}`}>
                    {slots.map((slot, index) => (
                      <LivePath key={index} slot={slot} color={penColor} width={penWidth} opacity={penOpacity} />
                    ))}
                  </Svg>
                </Animated.View>
                <Animated.View pointerEvents="none" style={[styles.eraser, { width: ring * 2, height: ring * 2, borderRadius: ring }, eraserStyle]} />
              </>
            ) : null}
          </>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const bandStyles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0 },
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    view: { overflow: 'hidden' },
    sheet: { position: 'absolute', top: 0, left: 0, right: 0 },
    // The eraser's reach: a quiet ring of ink on a veil, a circle as every dot is.
    eraser: { position: 'absolute', left: 0, top: 0, borderWidth: 1.5, borderColor: theme.color.outline, backgroundColor: theme.color.veil },
  });

export const DrawingCanvas = memo(DrawingCanvasComponent);
