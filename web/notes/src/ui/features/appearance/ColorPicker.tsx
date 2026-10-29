/**
 * A colour picked precisely: a square (saturation left to right, brightness downwards) and a hue
 * strip, each taking a press anywhere and a drag, and the arrows from the keyboard (Shift goes ten
 * times as far); and the hex code, typed or pasted (`#abc` works). A grey keeps the hue the strip
 * stood on, so the thumb never jumps to red.
 */
import { memo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

import { hexToHsv, hsvToHex, HUE_SPECTRUM, normalizeHex, saturationValuePaint, type Hsv } from '@unlease/design/color';
import { t } from '@unlease/core/i18n';

import { PebbleEdge } from '../../components/Outline';
import { TextField } from '../../components/TextField';
import styles from './appearance.module.css';

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

const STEP = 0.01;
const BIG_STEP = 0.1;

function ColorPickerComponent({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label?: string }) {
  // The point on the picker, kept beside the hex: a grey keeps its hue, a drag stays where the pointer is.
  const [point, setPoint] = useState<Hsv>(() => hexToHsv(value));
  const [typed, setTyped] = useState(value);
  const [error, setError] = useState<string | null>(null);
  // A colour changed from outside (another stop, the dice): the picker moves to it.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setPoint(current => (hsvToHex(current) === value ? current : hexToHsv(value, current.h)));
    setTyped(value);
    setError(null);
  }
  const commit = (next: Hsv): void => {
    const hex = hsvToHex(next);
    setPoint(next);
    setSeen(hex);
    setTyped(hex);
    setError(null);
    if (hex !== value) onChange(hex);
  };

  const fromSquare = (event: PointerEvent<HTMLDivElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    commit({ h: point.h, s: clamp((event.clientX - box.left) / box.width), v: 1 - clamp((event.clientY - box.top) / box.height) });
  };
  const fromStrip = (event: PointerEvent<HTMLDivElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    commit({ ...point, h: clamp((event.clientX - box.left) / box.width) * 359.9 });
  };
  const press = (follow: (event: PointerEvent<HTMLDivElement>) => void) => ({
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
      follow(event);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) follow(event);
    },
  });

  const onSquareKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const { h, s, v } = point;
    const next = event.key === 'ArrowRight' ? { h, s: clamp(s + step), v } : event.key === 'ArrowLeft' ? { h, s: clamp(s - step), v } : event.key === 'ArrowUp' ? { h, s, v: clamp(v + step) } : event.key === 'ArrowDown' ? { h, s, v: clamp(v - step) } : null;
    if (!next) return;
    event.preventDefault();
    commit(next);
  };
  const onStripKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 10 : 1;
    const { h } = point;
    const hue = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? h + step : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? h - step : event.key === 'Home' ? 0 : event.key === 'End' ? 359 : null;
    if (hue === null) return;
    event.preventDefault();
    commit({ ...point, h: clamp(hue, 0, 359.9) });
  };

  const onType = (text: string): void => {
    setTyped(text);
    const hex = normalizeHex(text);
    if (!hex) return;
    setError(null);
    setPoint(hexToHsv(hex, point.h));
    setSeen(hex);
    if (hex !== value) onChange(hex);
  };
  const settle = (): boolean => {
    const hex = normalizeHex(typed);
    if (!hex) {
      setError(t('Un code de six chiffres, comme #9CC15F.'));
      return false;
    }
    setTyped(hex);
    return true;
  };

  const percent = (amount: number): number => Math.round(amount * 100);
  return (
    <div className={styles.picker} role="group" aria-label={label}>
      <div
        className={styles.square}
        style={saturationValuePaint(point.h)}
        role="slider"
        tabIndex={0}
        aria-label={t('Saturation et luminosité')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent(point.s)}
        aria-valuetext={t('Saturation {saturation} %, luminosité {value} %', { saturation: percent(point.s), value: percent(point.v) })}
        onKeyDown={onSquareKey}
        {...press(fromSquare)}
      >
        <span className={styles.thumb} style={{ left: `${point.s * 100}%`, top: `${(1 - point.v) * 100}%`, background: hsvToHex(point) }} />
      </div>
      <div
        className={styles.strip}
        style={{ '--hues': HUE_SPECTRUM } as CSSProperties}
        role="slider"
        tabIndex={0}
        aria-label={t('Teinte')}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(point.h)}
        aria-valuetext={`${Math.round(point.h)}°`}
        onKeyDown={onStripKey}
        {...press(fromStrip)}
      >
        <span className={styles.thumb} style={{ left: `${(point.h / 360) * 100}%`, background: hsvToHex({ h: point.h, s: 1, v: 1 }) }} />
      </div>
      <div className={styles.hexRow}>
        <span className={styles.hexSwatch} data-pebble-under={1} data-still style={{ '--pebble-fill': value } as CSSProperties} aria-hidden="true">
          <PebbleEdge turn={1} />
        </span>
        <TextField
          className={styles.hexField}
          inputClassName={styles.hexInput}
          label={t('Code hexadécimal')}
          value={typed}
          onChange={onType}
          onBlur={() => void settle()}
          onKeyDown={event => {
            // Enter confirms the dialog only with a code that reads.
            if (event.key === 'Enter' && !settle()) event.preventDefault();
          }}
          error={error}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          maxLength={9}
        />
      </div>
    </div>
  );
}

export const ColorPicker = memo(ColorPickerComponent);
