/**
 * A name changed in place: kept as typed, saved when the field is left or Enter is pressed, Escape
 * putting the name back. A name that cannot be (another label's, `check`) is said under the field and
 * kept as typed until it is corrected or Escape puts the old one back.
 */
import { useState } from 'react';

import { TextField } from '@shared/ui/components/TextField';

/** `label` shows over the field; `ariaLabel` names it for screen readers alone, where what it holds needs no word (a list of names). */
export function NameField({ label, ariaLabel, value, onSave, maxLength, check }: { label?: string; ariaLabel?: string; value: string; onSave: (value: string) => void; maxLength: number; check?: (value: string) => string | null }) {
  const [typed, setTyped] = useState(value);
  const [shown, setShown] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  // Renamed elsewhere while not being typed in: the new name shows.
  if (value !== shown) {
    setShown(value);
    setTyped(value);
  }
  const commit = (): void => {
    const next = typed.trim();
    if (!next || next === value) {
      setTyped(value);
      setProblem(null);
      return;
    }
    const wrong = check?.(next) ?? null;
    setProblem(wrong);
    if (!wrong) onSave(next);
  };
  return (
    <TextField
      label={label}
      ariaLabel={ariaLabel}
      value={typed}
      onChange={text => {
        setTyped(text);
        if (problem) setProblem(check?.(text.trim()) ?? null);
      }}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape' && (typed !== value || problem)) {
          event.preventDefault();
          event.stopPropagation();
          setTyped(value);
          setProblem(null);
        }
      }}
      error={problem}
      maxLength={maxLength}
    />
  );
}
