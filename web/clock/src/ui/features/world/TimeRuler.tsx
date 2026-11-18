/**
 * The world clocks' comparison (the phone's `TimeRuler`): a ruler of the hours here, a day either
 * way, slid under a fixed needle. The hour under the needle is « now » at rest; slid (dragged, or a
 * click where the hour is), every city shows its time at that moment, in quarter hours, so « when is
 * it a good time to call Tokyo? » is one gesture. Let go, it settles on the nearest quarter (150,
 * decelerate). A slider for the keyboard and a screen reader: ← and → a quarter hour, Page Up and
 * Page Down an hour. Its sides fade where hours run on.
 */
import { memo, useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { hourLabel } from '@unlease/calendar/services/eventText';
import { instantToWall } from '@unlease/calendar/services/time';
import { offsetWords, snapShift } from '@unlease/clock/services/worldClocks';

import tools from '../tools.module.css';

/** An hour's width on the ruler. */
const HOUR = 64;
const PER_MINUTE = HOUR / 60;
const SPAN_HOURS = 24;
const MOST = SPAN_HOURS * 60;
/** Under this, a press is a click (it jumps there), not a drag. */
const CLICK_SLOP = 4;

const HOURS = Array.from({ length: SPAN_HOURS * 2 + 1 }, (_, index) => index - SPAN_HOURS);

interface Props {
  /** The time now (to the minute). */
  readonly now: number;
  /** Minutes from now the needle points at (quarter hours). */
  readonly shift: number;
  readonly onShift: (minutes: number) => void;
  readonly twelveHours: boolean;
}

function TimeRulerComponent({ now, shift, onShift, twelveHours }: Props) {
  // The ruler's hours are this hour and a day either way; the needle's place is minutes from this hour's start.
  const wall = instantToWall(now, '');
  const hour = Number(wall.slice(11, 13));
  const minute = Number(wall.slice(14, 16));
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const measure = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    setWidth(node.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.current.observe(node);
  }, []);
  // Dragged: where the needle is under the hand, between quarters.
  const [held, setHeld] = useState<number | null>(null);
  const drag = useRef<{ readonly x: number; readonly from: number; moved: boolean; last: number } | null>(null);
  const pointer = held ?? minute + shift;

  const clampShift = (minutes: number): number => snapShift(Math.max(-MOST, Math.min(MOST, minutes)));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, from: minute + shift, moved: false, last: shift };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    if (!state.moved && Math.abs(dx) < CLICK_SLOP) return;
    state.moved = true;
    const at = Math.max(minute - MOST, Math.min(minute + MOST, state.from - dx / PER_MINUTE));
    setHeld(at);
    const snapped = clampShift(at - minute);
    if (snapped !== state.last) {
      state.last = snapped;
      onShift(snapped);
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    drag.current = null;
    setHeld(null);
    if (!state || state.moved) return;
    // A click: the needle goes to the hour clicked.
    const box = event.currentTarget.getBoundingClientRect();
    onShift(clampShift(shift + (event.clientX - box.left - box.width / 2) / PER_MINUTE));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = { ArrowRight: 15, ArrowUp: 15, ArrowLeft: -15, ArrowDown: -15, PageUp: 60, PageDown: -60 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    onShift(clampShift(shift + step));
  };

  const label = shift === 0 ? t('Now') : t('{gap} from now', { gap: offsetWords(shift) });
  const offset = width / 2 - (pointer + MOST) * PER_MINUTE;
  return (
    <div
      ref={measure}
      className={tools.ruler}
      role="slider"
      tabIndex={0}
      aria-label={t('Compare the time')}
      aria-valuemin={-MOST}
      aria-valuemax={MOST}
      aria-valuenow={shift}
      aria-valuetext={label}
      data-scroll-fade="x"
      data-dragging={held !== null || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
        setHeld(null);
      }}
      onKeyDown={onKeyDown}
    >
      <div className={tools.rulerTrack} style={{ width: HOURS.length * HOUR, transform: `translateX(${offset}px)` }} aria-hidden="true">
        {HOURS.map(step => {
          const at = (hour + step + 48) % 24;
          const major = at % 3 === 0;
          return (
            <div key={step} className={tools.rulerHour}>
              <span className={tools.tick} data-major={major || undefined} data-midnight={at === 0 || undefined} />
              <span className={tools.minor} style={{ left: HOUR / 4 }} />
              <span className={tools.minor} data-half="" style={{ left: HOUR / 2 }} />
              <span className={tools.minor} style={{ left: (HOUR * 3) / 4 }} />
              {major ? (
                <span className={`${tools.hourLabel} t-label-small`} data-midnight={at === 0 || undefined}>
                  {hourLabel(at, twelveHours)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <span className={tools.needle} aria-hidden="true" />
      <span className={tools.knob} aria-hidden="true" />
    </div>
  );
}

export const TimeRuler = memo(TimeRulerComponent);
