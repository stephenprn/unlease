/**
 * The stopwatch's face on the web, as the phone's (`StopwatchDial`): a ring that ripples round its
 * figure (Clock's wave, `design/waves.ts`), drawn by a hand: a little lopsided as a pebble is, its line
 * gone over twice, its crests uneven; twelve dots outside it, not quite in line, each lit in the accent
 * as the brush passes it. As a minute runs, Safran melting into the accent is laid over it with a
 * brush, grainy as a print (`/riso-grain.png`), a warm light inside, a bead riding at its tip.
 *
 * Always a little sea: at zero it breathes, slow and low; started, the wave rises and its crests run
 * round; paused, it calms and drifts. A minute done rolls over: the full stroke and its dots fade as
 * the new minute's begins, and a wavy ripple runs out. A lap sends a swell through it. It draws itself
 * each frame while the page shows (its own loop: the swell eases, the crests never jump). Reduced
 * motion: still, the fill still counts.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { isReset, type Stopwatch } from '@unlease/clock/models/stopwatch';
import { brushRing, organicRadius, organicRing, ringPoint, type Ring } from '@unlease/design/waves';

import { useMedia } from '@shared/ui/useMedia';
import tools from '../tools.module.css';

const VIEW = 200;
const CENTER = VIEW / 2;
const RADIUS = 76;
const WAVES = 12;
/** The phone's swells, at this face's scale. */
const REST_SWELL = 0.85;
const RUN_SWELL = 3.3;
const HELD_SWELL = 1.45;
const LAP_SWELL = 6.6;
const RUN_SPEED = (Math.PI * 2) / WAVES / 1300;
const DRIFT_SPEED = RUN_SPEED / 7;
const ROLL_FADE_MS = 700;
const RIPPLE_MS = 1100;
const SEED = 1.3;
const BRUSH = 7;
const MINUTE = 60_000;

const totalAt = (watch: Stopwatch, now: number): number => watch.banked + (watch.startedAt === null ? 0 : Math.max(0, now - watch.startedAt));

interface Sea {
  readonly total: number;
  readonly phase: number;
  readonly swell: number;
  /** The laps seen, and when the last one was taken (0 none since the page opened). */
  readonly laps: number;
  readonly lapAt: number;
}

/** The dial's sea, each frame: the time counted, the crests running on (a drift when still), the swell easing to its mark. */
function useSea(watch: Stopwatch, still: boolean, now: number): Sea {
  const running = watch.startedAt !== null;
  const target = isReset(watch) ? REST_SWELL : running ? RUN_SWELL : HELD_SWELL;
  const [sea, setSea] = useState<Sea>(() => ({ total: totalAt(watch, now), phase: 0, swell: target, laps: watch.laps.length, lapAt: 0 }));
  useEffect(() => {
    if (still) return undefined;
    let frame = 0;
    let last = performance.now();
    const run = (time: number): void => {
      const step = Math.min(100, time - last);
      last = time;
      setSea(before => {
        // A lap: a swell through the ring, settling back.
        const lapAt = watch.laps.length > before.laps ? time : watch.laps.length < before.laps ? 0 : before.lapAt;
        const sinceLap = time - lapAt;
        const goal = lapAt > 0 && sinceLap < 700 ? (sinceLap < 120 ? LAP_SWELL : target + (LAP_SWELL - target) * Math.exp(-(sinceLap - 120) / 140)) : target;
        return { total: totalAt(watch, Date.now()), phase: before.phase + step * (running ? RUN_SPEED : DRIFT_SPEED), swell: before.swell + (goal - before.swell) * Math.min(1, step / 90), laps: watch.laps.length, lapAt };
      });
      frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [still, watch, running, target]);
  return still ? { total: totalAt(watch, now), phase: 0, swell: target, laps: watch.laps.length, lapAt: 0 } : sea;
}

export function StopwatchDial({ watch, now, children }: { readonly watch: Stopwatch; readonly now: number; readonly children: ReactNode }) {
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const running = watch.startedAt !== null;
  const reset = isReset(watch);
  const { total, phase, swell } = useSea(watch, still, now);
  const into = total % MINUTE;
  const share = total === 0 ? 0 : into / MINUTE;
  const ring: Ring = { cx: CENTER, cy: CENTER, radius: RADIUS, amplitude: swell, waves: WAVES, phase, seed: SEED };
  const bead = ringPoint(ring, share);
  const arc = brushRing(ring, BRUSH, 0, share);
  // The minute just done: its stroke fading, a ripple running out.
  const fade = total >= MINUTE && !still ? Math.max(0, 1 - into / ROLL_FADE_MS) : 0;
  const ripple = total >= MINUTE && !still ? into / RIPPLE_MS : 1;
  const rippled = 1 - (1 - Math.min(1, ripple)) ** 2;

  const dots = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        const at = organicRadius({ cx: 0, cy: 0, radius: RADIUS + RUN_SWELL + 9, amplitude: 0, waves: WAVES, phase: 0, seed: SEED }, angle) + Math.sin(index * 2.7 + SEED);
        return { index, x: CENTER + at * Math.sin(angle), y: CENTER - at * Math.cos(angle), r: index === 0 ? 1.9 : 1 + 0.35 * Math.abs(Math.sin(index * 1.9)) };
      }),
    [],
  );

  return (
    <div className={tools.dial}>
      <svg className={tools.dialRing} viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true">
        <defs>
          <linearGradient id="watchInk" x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0" className={tools.inkWaiting} />
            <stop offset="0.6" className={tools.inkAction} />
            <stop offset="1" className={tools.inkAction} />
          </linearGradient>
          <radialGradient id="watchGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0" className={tools.glowAction} />
            <stop offset="1" className={tools.glowNone} />
          </radialGradient>
          <pattern id="watchTooth" patternUnits="userSpaceOnUse" width="72" height="72">
            <image href="/riso-grain.png" width="72" height="72" />
          </pattern>
        </defs>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="url(#watchGlow)" opacity={reset ? 0.45 : 1} />
        {dots.map(dot => {
          const lit = dot.index === 0 ? 0 : Math.min(1, Math.max(0, (share - dot.index / 12) * 40));
          const on = Math.max(lit, fade);
          return (
            <g key={dot.index}>
              <circle cx={dot.x} cy={dot.y} r={dot.r} className={tools.dialDot} />
              {on > 0 ? <circle cx={dot.x} cy={dot.y} r={dot.r + on * 0.6} className={tools.dialDotLit} opacity={on} /> : null}
            </g>
          );
        })}
        {ripple < 1 ? (
          <path d={organicRing({ ...ring, radius: RADIUS + 3 + 12 * rippled, amplitude: 1.3 + 2.6 * rippled, phase: phase * 1.4 + 1, seed: SEED + 4.4 }, 96)} className={tools.dialRipple} opacity={0.7 * (1 - ripple)} />
        ) : null}
        <path d={organicRing({ ...ring, radius: RADIUS + 1, amplitude: swell * 0.85, phase: phase * 0.92 + 0.35, seed: SEED + 2.1 })} className={tools.dialSketch} />
        <path d={organicRing(ring)} className={tools.dialTrack} />
        {fade > 0 ? <path d={brushRing(ring, BRUSH, 0, 0.9999)} fill="url(#watchInk)" opacity={fade} /> : null}
        {arc ? (
          <>
            <path d={arc} fill="url(#watchInk)" />
            <path d={arc} fill="url(#watchTooth)" opacity={0.75} />
          </>
        ) : null}
        <circle cx={bead.x} cy={bead.y} r={4.4} className={tools.dialBead} data-running={running || undefined} />
      </svg>
      <div className={tools.dialHeart}>{children}</div>
    </div>
  );
}
