/**
 * The labels a record wears, chosen in its form (a contact, an event), as the phone's (DESIGN's Label
 * Picker): every label a chip one press puts on or takes off, its own tag the checkbox (`LabelCheck`);
 * worn, the chip lies on the label's wash with its pigment as the edge and the name at 600.
 * « Nouveau libellé » closes the wrap in link ink and becomes a name to type in place (the chip's
 * height and cut, the field's focused edge): its × where the plus was, its ✓ once something is typed.
 * Enter or ✓ makes the label, already worn, and it settles in; ×, Escape, or leaving it empty puts the
 * chip back. A name the app refuses (one taken) is said under the field, what was typed kept.
 */
import { useState, type KeyboardEvent } from 'react';

import { t } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';

import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { LabelCheck } from './LabelMark';
import styles from './labelChips.module.css';

export interface LabelChipItem {
  readonly id: string;
  readonly name: string;
  readonly color: LineColor;
}

/** The app's own words for its labels (« libellé » in Contacts and Agenda). */
export interface LabelChipsWords {
  /** « Nouveau libellé ». */
  readonly add: string;
  /** The field's hint: « Nom du libellé ». */
  readonly placeholder: string;
  /** What a screen reader calls the field: « Nom du nouveau libellé ». */
  readonly field: string;
  /** The ✓: « Créer le libellé ». */
  readonly create: string;
}

export interface LabelChipsProps {
  /** The live labels, in their order. */
  readonly labels: readonly LabelChipItem[];
  readonly chosen: readonly string[];
  readonly onToggle: (id: string) => void;
  /** Makes a label of that name, worn at once by the record: its id, or why it cannot be made (a name taken). */
  readonly onCreate: (name: string) => { readonly id: string } | { readonly problem: string };
  readonly maxLength: number;
  readonly words: LabelChipsWords;
}

export function LabelChips({ labels, chosen, onToggle, onCreate, maxLength, words }: LabelChipsProps) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  // The labels made in this form settle in; those already there lie still.
  const [made, setMade] = useState<ReadonlySet<string>>(() => new Set());
  const close = (): void => {
    setNaming(false);
    setName('');
    setProblem(null);
  };
  const add = (): void => {
    const clean = name.trim();
    if (!clean) {
      close();
      return;
    }
    const result = onCreate(clean);
    if ('problem' in result) {
      setProblem(result.problem);
      return;
    }
    setMade(current => new Set(current).add(result.id));
    close();
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    // Enter makes the label, never sends the record's form; Escape leaves the name unmade, the form open.
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };
  return (
    <div className={styles.chips}>
      {labels.map(label => {
        const on = chosen.includes(label.id);
        return (
          <button key={label.id} type="button" role="checkbox" aria-checked={on} className={styles.chip} data-line={label.color} data-made={made.has(label.id) || undefined} onClick={() => onToggle(label.id)}>
            <LabelCheck color={label.color} checked={on} size={22} />
            <span className={styles.name}>{label.name}</span>
          </button>
        );
      })}
      {naming ? (
        <span className={styles.naming}>
          <span className={styles.field} data-wrong={problem ? true : undefined}>
            {/* The chip's plus becomes the way back. */}
            <IconButton icon="close" label={t('Annuler')} shape={2} compact onClick={close} />
            <input
              className={styles.input}
              value={name}
              onChange={event => {
                setName(event.target.value);
                if (problem) setProblem(null);
              }}
              onKeyDown={onKey}
              onBlur={event => {
                // Leaving it empty (not for its own buttons) puts « Nouveau libellé » back.
                if (!name.trim() && !event.currentTarget.parentElement?.contains(event.relatedTarget)) close();
              }}
              autoFocus
              placeholder={words.placeholder}
              aria-label={words.field}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? 'label-chips-problem' : undefined}
              autoCapitalize="sentences"
              autoComplete="off"
              enterKeyHint="done"
              maxLength={maxLength}
            />
            {name.trim() ? <IconButton icon="check" label={words.create} shape={1} compact onClick={add} /> : null}
          </span>
          {problem ? (
            <span id="label-chips-problem" className={`${styles.problem} t-meta`} role="alert">
              <Icon name="error" size={16} />
              {problem}
            </span>
          ) : null}
        </span>
      ) : (
        <button type="button" className={`${styles.chip} ${styles.add}`} onClick={() => setNaming(true)}>
          <Icon name="plus" size={18} />
          {words.add}
        </button>
      )}
    </div>
  );
}
