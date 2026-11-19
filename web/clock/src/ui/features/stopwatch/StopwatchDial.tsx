/**
 * The stopwatch's face on the web, as the phone's (`StopwatchDial`): a ring that ripples round its
 * figure (Clock's wave, `design/waves.ts`), drawn by a hand: a little lopsided as a pebble is, its line
 * gone over twice, its crests uneven and running round while it counts; twelve dots outside it, not
 * quite in line. As a minute runs, Safran melting into the accent is laid over it with a brush,
 * grainy as a print (`/riso-grain.png`), a warm light inside while it runs, a bead riding at its tip;
 * the minute done, it empties and fills again. Paused, the swell calms; at zero, the ring lies flat.
 * The page redraws each frame while it runs (the figure's hundredths), the ring with it. Reduced
 * motion: the crests stand still, the fill still counts.
 */
import { useMemo, type ReactNode } from 'react';

import { isReset, type Stopwatch } from '@unlease/clock/models/stopwatch';
import { brushRing, organicRadius, organicRing, ringPoint, type Ring } from '@unlease/design/waves';

import { useMedia } from '@shared/ui/useMedia';
import tools from '../tools.module.css';

const VIEW = 200;
const CENTER = VIEW / 2;
const RADIUS = 76;
const WAVES = 12;
/** The phone's swells, at this face's scale. */
const RUN_SWELL = 3.3;
const HELD_SWELL = 1.3;
const RUN_SPEED = (Math.PI * 2) / WAVES / 1300;
const SEED = 1.3;
const BRUSH = 7;
const MINUTE = 60_000;

export function StopwatchDial({ watch, now, children }: { readonly watch: Stopwatch; readonly now: number; readonly children: ReactNode }) {
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const running = watch.startedAt !== null;
  const reset = isReset(watch);
  const total = watch.banked + (watch.startedAt === null ? 0 : Math.max(0, now - watch.startedAt));
  const share = total === 0 ? 0 : (total % MINUTE) / MINUTE;
  // The crests run on with the time counted, held where they were once it stops.
  const phase = still ? 0 : (total * RUN_SPEED) % (Math.PI * 2);
  const ring: Ring = { cx: CENTER, cy: CENTER, radius: RADIUS, amplitude: reset ? 0 : running ? RUN_SWELL : HELD_SWELL, waves: WAVES, phase, seed: SEED };
  const bead = ringPoint(ring, share);
  const arc = brushRing(ring, BRUSH, 0, share);

  const dots = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        const at = organicRadius({ cx: 0, cy: 0, radius: RADIUS + RUN_SWELL + 9, amplitude: 0, waves: WAVES, phase: 0, seed: SEED }, angle) + Math.sin(index * 2.7 + SEED);
        return { key: index, x: CENTER + at * Math.sin(angle), y: CENTER - at * Math.cos(angle), r: index === 0 ? 1.9 : 1 + 0.35 * Math.abs(Math.sin(index * 1.9)) };
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
        {running ? <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="url(#watchGlow)" /> : null}
        {dots.map(dot => (
          <circle key={dot.key} cx={dot.x} cy={dot.y} r={dot.r} className={tools.dialDot} />
        ))}
        <path d={organicRing({ ...ring, radius: RADIUS + 1, amplitude: ring.amplitude * 0.85, phase: ring.phase * 0.92 + 0.35, seed: SEED + 2.1 })} className={tools.dialSketch} />
        <path d={organicRing(ring)} className={tools.dialTrack} />
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
