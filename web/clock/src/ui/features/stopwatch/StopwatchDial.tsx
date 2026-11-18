/**
 * The stopwatch's face on the web, as the phone's (`StopwatchDial`): a bezel of sixty ticks around
 * its figure, every fifth longer; as a minute runs, the ticks behind the hand light up in the accent,
 * one a second, and a bead rides the ring as the seconds hand; the minute done, the bezel empties and
 * fills again. Drawn in SVG, its colours the design system's.
 */
import type { ReactNode } from 'react';

import tools from '../tools.module.css';

const TICKS = 60;
const VIEW = 200;
const CENTER = VIEW / 2;

export function StopwatchDial({ elapsed, running, children }: { readonly elapsed: number; readonly running: boolean; readonly children: ReactNode }) {
  const inMinute = elapsed % 60_000;
  const lit = elapsed === 0 ? 0 : Math.floor(inMinute / 1000) + 1;
  const angle = (inMinute / 60_000) * 360;
  return (
    <div className={tools.dial}>
      <svg className={tools.dialRing} viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true">
        {Array.from({ length: TICKS }, (_, index) => {
          const major = index % 5 === 0;
          const length = major ? 10 : 5.5;
          return (
            <line
              key={index}
              x1={CENTER}
              x2={CENTER}
              y1={2}
              y2={2 + length}
              transform={`rotate(${(index / TICKS) * 360} ${CENTER} ${CENTER})`}
              className={tools.dialTick}
              data-major={major || undefined}
              data-lit={index < lit || undefined}
            />
          );
        })}
        <circle cx={CENTER} cy={6.5} r={4} transform={`rotate(${angle} ${CENTER} ${CENTER})`} className={tools.dialBead} data-running={running || undefined} />
      </svg>
      <div className={tools.dialHeart}>{children}</div>
    </div>
  );
}
