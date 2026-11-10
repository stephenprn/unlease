/**
 * A colour picked precisely: a square of saturation (left to right) and brightness (top to foot)
 * over a strip of hues, and the colour's hex code, typed or pasted. The thumbs follow the finger on
 * the UI thread; the colour itself reaches the screen a few times a second while dragging (`EVERY`)
 * and exactly when the finger lifts. A grey keeps the hue the strip stood on, so nothing jumps.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { HUE_SPECTRUM, hexToHsv, hsvToHex, normalizeHex, saturationValuePaint, type Hsv } from '@unlease/design/color';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';

import { Organic, TextField } from '../../components';
import { corners } from '../../theme/shape';
import { useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

const SQUARE_HEIGHT = 168;
/** The hues' box, the finger's: a slim track under a full thumb, so the spectrum stays a tool, never the loudest thing on the sheet (the web's). */
const STRIP_HEIGHT = 32;
const TRACK = 12;
const THUMB = 26;
const STRIP_THUMB = 28;
/** While a thumb is dragged, the colour reaches the screen at most this often (ms). */
const EVERY = 60;
/** The square's overlay, the same for every hue: white from the left, black from the foot. */
const OVERLAY = saturationValuePaint(0).backgroundImage;
/** A step of the square or the strip for TalkBack's swipe up and down. */
const STEP = { brightness: 0.05, hue: 5 };

/** The colour of a point, on the UI thread (`hsvToHex`, as a CSS colour). */
function colorOf(h: number, s: number, v: number): string {
  'worklet';
  const hue = (((h % 360) + 360) % 360) / 60;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 1) {
    r = chroma;
    g = x;
  } else if (hue < 2) {
    r = x;
    g = chroma;
  } else if (hue < 3) {
    g = chroma;
    b = x;
  } else if (hue < 4) {
    g = x;
    b = chroma;
  } else if (hue < 5) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }
  const m = v - chroma;
  return `rgb(${Math.round((r + m) * 255)}, ${Math.round((g + m) * 255)}, ${Math.round((b + m) * 255)})`;
}

function clamp(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

export interface ColorPickerProps {
  /** `#RRGGBB`. */
  readonly value: string;
  readonly onChange: (hex: string) => void;
}

function ColorPickerComponent({ value, onChange }: ColorPickerProps) {
  const styles = useThemedStyles(makeStyles);
  // The point the thumbs stand on, and the last colour this picker gave: a new `value` from outside moves the thumbs.
  const [point, setPoint] = useState<Hsv>(() => hexToHsv(value));
  const given = useRef(value);
  const h = useSharedValue(point.h);
  const s = useSharedValue(point.s);
  const v = useSharedValue(point.v);
  const squareWidth = useSharedValue(0);
  const stripWidth = useSharedValue(0);
  const lastSent = useSharedValue(0);
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const typing = useRef(false);

  const place = useCallback(
    (next: Hsv) => {
      h.value = next.h;
      s.value = next.s;
      v.value = next.v;
      setPoint(next);
    },
    [h, s, v],
  );

  useEffect(() => {
    if (value === given.current) return;
    given.current = value;
    place(hexToHsv(value, h.value));
    if (!typing.current) setText(value);
    setError(null);
  }, [value, place, h]);

  /** A point reached by the finger: the colour goes out, the field follows. */
  const give = useCallback(
    (hue: number, saturation: number, brightness: number) => {
      const hex = hsvToHex({ h: hue, s: saturation, v: brightness });
      setPoint({ h: hue, s: saturation, v: brightness });
      if (!typing.current) setText(hex);
      setError(null);
      if (hex === given.current) return;
      given.current = hex;
      onChange(hex);
    },
    [onChange],
  );

  const square = Gesture.Pan()
    .minDistance(0)
    .onBegin(event => {
      s.value = clamp(event.x / Math.max(1, squareWidth.value));
      v.value = 1 - clamp(event.y / SQUARE_HEIGHT);
      lastSent.value = Date.now();
      runOnJS(give)(h.value, s.value, v.value);
    })
    .onUpdate(event => {
      s.value = clamp(event.x / Math.max(1, squareWidth.value));
      v.value = 1 - clamp(event.y / SQUARE_HEIGHT);
      const now = Date.now();
      if (now - lastSent.value < EVERY) return;
      lastSent.value = now;
      runOnJS(give)(h.value, s.value, v.value);
    })
    .onFinalize(() => {
      runOnJS(give)(h.value, s.value, v.value);
    });

  const strip = Gesture.Pan()
    .minDistance(0)
    .onBegin(event => {
      h.value = clamp(event.x / Math.max(1, stripWidth.value)) * 360;
      lastSent.value = Date.now();
      runOnJS(give)(h.value, s.value, v.value);
    })
    .onUpdate(event => {
      h.value = clamp(event.x / Math.max(1, stripWidth.value)) * 360;
      const now = Date.now();
      if (now - lastSent.value < EVERY) return;
      lastSent.value = now;
      runOnJS(give)(h.value, s.value, v.value);
    })
    .onFinalize(() => {
      runOnJS(give)(h.value, s.value, v.value);
    });

  const hueFill = useAnimatedStyle(() => ({ backgroundColor: colorOf(h.value, 1, 1) }));
  const squareThumb = useAnimatedStyle(() => ({
    backgroundColor: colorOf(h.value, s.value, v.value),
    transform: [{ translateX: s.value * squareWidth.value - THUMB / 2 }, { translateY: (1 - v.value) * SQUARE_HEIGHT - THUMB / 2 }],
  }));
  const stripThumb = useAnimatedStyle(() => ({
    backgroundColor: colorOf(h.value, 1, 1),
    transform: [{ translateX: (h.value / 360) * stripWidth.value - STRIP_THUMB / 2 }],
  }));

  const typed = (next: string) => {
    setText(next);
    const hex = normalizeHex(next);
    if (!hex) return;
    setError(null);
    place(hexToHsv(hex, h.value));
    if (hex === given.current) return;
    given.current = hex;
    onChange(hex);
  };
  const settleText = () => {
    typing.current = false;
    const hex = normalizeHex(text);
    if (hex) setText(hex);
    else setError(t('Un code de six chiffres, comme #9CC15F.'));
  };

  // TalkBack's swipes: the square steps its brightness, the strip its hue.
  const onSquareAction = (event: AccessibilityActionEvent) => {
    const step = event.nativeEvent.actionName === 'increment' ? STEP.brightness : event.nativeEvent.actionName === 'decrement' ? -STEP.brightness : 0;
    if (step === 0) return;
    const next = { ...point, v: Math.min(1, Math.max(0, point.v + step)) };
    place(next);
    give(next.h, next.s, next.v);
  };
  const onStripAction = (event: AccessibilityActionEvent) => {
    const step = event.nativeEvent.actionName === 'increment' ? STEP.hue : event.nativeEvent.actionName === 'decrement' ? -STEP.hue : 0;
    if (step === 0) return;
    const next = { ...point, h: (point.h + step + 360) % 360 };
    place(next);
    give(next.h, next.s, next.v);
  };

  return (
    <View style={styles.picker}>
      <GestureDetector gesture={square}>
        <View
          style={styles.squareBox}
          onLayout={(event: LayoutChangeEvent) => {
            squareWidth.value = event.nativeEvent.layout.width;
          }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t('Saturation et luminosité')}
          accessibilityValue={{ text: t('Saturation {saturation} %, luminosité {value} %', { saturation: Math.round(point.s * 100), value: Math.round(point.v * 100) }) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={onSquareAction}
        >
          <Organic style={styles.square}>
            <Animated.View style={[StyleSheet.absoluteFill, hueFill]} />
            <View style={[StyleSheet.absoluteFill, styles.overlay]} />
          </Organic>
          <Animated.View pointerEvents="none" style={[styles.thumb, squareThumb]} />
        </View>
      </GestureDetector>

      <GestureDetector gesture={strip}>
        <View
          style={styles.stripBox}
          onLayout={(event: LayoutChangeEvent) => {
            stripWidth.value = event.nativeEvent.layout.width;
          }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t('Teinte')}
          accessibilityValue={{ min: 0, max: 360, now: Math.round(point.h) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={onStripAction}
        >
          <Organic style={styles.strip} />
          <Animated.View pointerEvents="none" style={[styles.thumb, styles.stripThumb, stripThumb]} />
        </View>
      </GestureDetector>

      <View style={styles.code}>
        <Organic pebble={1} style={[styles.sample, { backgroundColor: value }]} />
        <View style={styles.field}>
          <TextField
            label={t('Code hexadécimal')}
            value={text}
            onChangeText={typed}
            onFocus={() => {
              typing.current = true;
            }}
            onBlur={settleText}
            onSubmitEditing={settleText}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            maxLength={7}
            returnKeyType="done"
            error={error}
          />
        </View>
      </View>
    </View>
  );
}

export const ColorPicker = memo(ColorPickerComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    picker: { gap: 16 },
    // The thumbs ride over the edges: the box holds them, the painted square inside it clips its own paint.
    squareBox: { height: SQUARE_HEIGHT },
    square: { ...StyleSheet.absoluteFill, overflow: 'hidden', borderWidth: 1, borderColor: theme.color.hairline, ...corners(SHAPES.frame) },
    overlay: { backgroundImage: OVERLAY },
    stripBox: { height: STRIP_HEIGHT, justifyContent: 'center' },
    strip: { position: 'absolute', left: 0, right: 0, top: (STRIP_HEIGHT - TRACK) / 2, height: TRACK, borderWidth: 1, borderColor: theme.color.hairline, backgroundImage: HUE_SPECTRUM, ...corners(SHAPES.detail) },
    // A dot: a cream ring edged in charcoal inside and out (the slip's two, the same in both themes), so it reads on every colour.
    thumb: { position: 'absolute', left: 0, top: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 3, borderColor: theme.color.onSlip, boxShadow: `0 0 0 1px ${theme.color.slip}, inset 0 0 0 1px ${theme.color.slip}` },
    stripThumb: { top: (STRIP_HEIGHT - STRIP_THUMB) / 2, width: STRIP_THUMB, height: STRIP_THUMB, borderRadius: STRIP_THUMB / 2 },
    code: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
    // Level with the field (its label above, 52 high).
    sample: { width: 44, height: 44, marginBottom: 4, borderWidth: 1, borderColor: theme.color.hairline },
    field: { flex: 1 },
  });
