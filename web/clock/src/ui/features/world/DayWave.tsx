/**
 * The world clocks' day wave on the web, as the phone's (`DayWave`, `clock/services/dayWave.ts`): one
 * wave of the day drawn with a brush, midnight at both ends, noon about its crest, the horizon through
 * it; its day's swell a grainy gradient (Safran melting into the accent, `/riso-grain.png`), the
 * night's hollows in the second ink. It breathes, slowly, every mark riding it. Here rides it as the
 * accent's mark, a ring rippling out of it; each city a smaller mark (the sun's colour by day, the
 * accent at dusk, hollow at night), its name over it; the hours stand under the horizon. Screen readers
 * skip it: the cards say each city's time. Reduced motion: still.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { clockWords } from '@unlease/calendar/services/eventText';
import { deviceZone } from '@unlease/calendar/services/time';
import type { WorldClock } from '@unlease/clock/models/worldClock';
import { placeMarks, waveMarks, type PlacedMark } from '@unlease/clock/services/dayWave';
import { dayBrush, dayWave, dayWaveY } from '@unlease/design/waves';

import { useMedia } from '@shared/ui/useMedia';
import tools from '../tools.module.css';

const HEIGHT = 176;
const MIDDLE = 100;
const AMPLITUDE = 44;
const SIDE = 20;
const LINE = 16;
const BREATH_MS = 14_000;

/** The breath, in radians, each frame while shown; 0 when still. */
function useBreath(still: boolean): number {
  const [breath, setBreath] = useState(0);
  useEffect(() => {
    if (still) return undefined;
    let frame = 0;
    const start = performance.now();
    const run = (time: number): void => {
      setBreath((((time - start) % BREATH_MS) / BREATH_MS) * Math.PI * 2);
      frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [still]);
  return still ? 0 : breath;
}

function DayWaveComponent({ clocks, at, twelveHours }: { readonly clocks: readonly WorldClock[]; readonly at: number; readonly twelveHours: boolean }) {
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  useEffect(() => {
    const element = box.current;
    // Without a way to measure (an old browser, the tests), it keeps a phone's width.
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(entries => setWidth(Math.max(200, entries[0]?.contentRect.width ?? 360)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const breath = useBreath(still);
  const inner = width - SIDE * 2;
  const marks = useMemo(() => placeMarks(waveMarks(clocks, at, deviceZone()), { width: inner, middle: MIDDLE, amplitude: AMPLITUDE, line: LINE, charWidth: 7.2 }), [clocks, at, inner]);
  const hours = [0.25, 0.5, 0.75].map(share => ({ share, words: clockWords(`${String(share * 24).padStart(2, '0')}:00`, twelveHours) }));
  const top = MIDDLE - AMPLITUDE * 1.25;

  return (
    <div ref={box} className={tools.dayWave} aria-hidden="true">
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
        <defs>
          <linearGradient id="dayInk" x1="0" y1={top} x2="0" y2={MIDDLE} gradientUnits="userSpaceOnUse">
            <stop offset="0" className={tools.dayInkTop} />
            <stop offset="0.6" className={tools.dayInkMiddle} />
            <stop offset="1" className={tools.dayInkBottom} />
          </linearGradient>
          <linearGradient id="dayFade" x1="0" y1={top} x2="0" y2={MIDDLE} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.1" />
          </linearGradient>
          <mask id="dayMask" maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={HEIGHT}>
            <rect x="0" y="0" width={width} height={HEIGHT} fill="url(#dayFade)" />
          </mask>
          <pattern id="dayTooth" patternUnits="userSpaceOnUse" width="112" height="112">
            <image href="/riso-grain.png" width="112" height="112" />
          </pattern>
        </defs>
        <g transform={`translate(${SIDE} 0)`}>
          <path d={`${dayWave(inner, MIDDLE, AMPLITUDE, 0.25, 0.75, 32, breath)}Z`} fill="url(#dayInk)" />
          <path d={`${dayWave(inner, MIDDLE, AMPLITUDE, 0.25, 0.75, 32, breath)}Z`} fill="url(#dayTooth)" opacity={0.6} mask="url(#dayMask)" />
          <path d={`${dayWave(inner, MIDDLE, AMPLITUDE, 0, 0.25, 16, breath)}L0 ${MIDDLE}Z`} className={tools.dayNight} />
          <path d={`${dayWave(inner, MIDDLE, AMPLITUDE, 0.75, 1, 16, breath)}L${inner * 0.75} ${MIDDLE}Z`} className={tools.dayNight} />
        </g>
        <line x1={6} x2={width - 6} y1={MIDDLE} y2={MIDDLE} className={tools.dayHorizon} />
        <g transform={`translate(${SIDE} 0)`}>
          <path d={dayBrush(inner, MIDDLE, AMPLITUDE, 3, 0, 0.26, breath, 16)} className={tools.dayNightLine} />
          <path d={dayBrush(inner, MIDDLE, AMPLITUDE, 3, 0.74, 1, breath, 16)} className={tools.dayNightLine} />
          <path d={dayBrush(inner, MIDDLE, AMPLITUDE, 4.5, 0.235, 0.765, breath)} className={tools.dayLine} />
          {marks.map(mark => (
            <Mark key={mark.key} mark={mark} breath={breath} />
          ))}
        </g>
      </svg>
      {hours.map(hour => (
        <span key={hour.share} className={`${tools.dayHour} t-label-small`} style={{ left: SIDE + hour.share * inner - 30 }}>
          {hour.words}
        </span>
      ))}
      {marks.map(mark => (
        <span
          key={mark.key}
          className={`${tools.dayName} ${mark.here ? 't-label-strong' : 't-label-small'}`}
          data-here={mark.here || undefined}
          style={{ left: SIDE + mark.labelX - mark.labelWidth / 2 - 8, top: mark.labelTop + dayWaveY(mark.share, MIDDLE, AMPLITUDE, breath) - mark.y, width: mark.labelWidth + 16 }}
        >
          {mark.name}
        </span>
      ))}
    </div>
  );
}

/** A mark on the wave: here the accent's, larger, a ring rippling out of it; a city by its sky. */
function Mark({ mark, breath }: { readonly mark: PlacedMark; readonly breath: number }) {
  const y = dayWaveY(mark.share, MIDDLE, AMPLITUDE, breath);
  return (
    <>
      {mark.here ? <circle cx={mark.x} cy={y} r={8} className={tools.dayRipple} /> : null}
      <circle cx={mark.x} cy={y} r={mark.here ? 8 : 6} className={tools.dayMark} data-here={mark.here || undefined} data-sky={mark.light} />
    </>
  );
}

/** A small wave of the day, a card's own, drawn with the same brush: its mark where the city's hour is. */
export const MiniDayWave = memo(function MiniDayWave({ share, light }: { readonly share: number; readonly light: PlacedMark['light'] }) {
  const width = 48;
  const middle = 16;
  const amplitude = 9;
  return (
    <svg width={width + 12} height={32} viewBox={`0 0 ${width + 12} 32`} aria-hidden="true" className={tools.miniWave}>
      <line x1={1} x2={width + 11} y1={middle} y2={middle} className={tools.dayHorizon} />
      <path d={dayBrush(width, middle, amplitude, 2.2, 0, 1, 0, 24)} transform="translate(6 0)" className={tools.dayNightLine} />
      <circle cx={6 + share * width} cy={dayWaveY(share, middle, amplitude)} r={4.5} className={tools.miniMark} data-sky={light} />
    </svg>
  );
});

export const DayWave = memo(DayWaveComponent);
