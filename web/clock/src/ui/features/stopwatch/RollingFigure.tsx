/**
 * A figure whose characters roll as they change, as a counter's wheels do (the phone's
 * `RollingFigure`): each in its own slot, the old one leaving upward as the new one rises from below,
 * clipped by its slot. Only the characters that change move. Reduced motion: they simply change.
 */
import { memo, useState } from 'react';

import tools from '../tools.module.css';

function Slot({ character }: { readonly character: string }) {
  // The character shown before this one, kept while it rolls away; each change restarts the roll (its key).
  const [shown, setShown] = useState({ now: character, before: character, turn: 0 });
  if (shown.now !== character) setShown({ now: character, before: shown.now, turn: shown.turn + 1 });
  const rolling = shown.before !== shown.now;
  return (
    <span className={tools.rollSlot}>
      <span key={`now${shown.turn}`} className={tools.rollChar} data-roll={rolling ? 'in' : undefined}>
        {shown.now}
      </span>
      {rolling ? (
        <span key={`before${shown.turn}`} className={tools.rollChar} data-roll="out" aria-hidden="true">
          {shown.before}
        </span>
      ) : null}
    </span>
  );
}

function RollingFigureComponent({ text }: { readonly text: string }) {
  return (
    <>
      {[...text].map((character, index) => (
        <Slot key={`${text.length}:${index}`} character={character} />
      ))}
    </>
  );
}

export const RollingFigure = memo(RollingFigureComponent);
