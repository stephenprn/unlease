/**
 * A colour or a paper for several notes at once (the board's selection, « Couleur et papier »): what
 * the picked notes share, for the picker to show, and what each of them takes. A collection wears a
 * pigment only (`asLineColor`): it takes a colour, never a gradient, « Sans couleur » or a paper, and
 * keeps its own then; the picker says so when a selection mixes notes and collections.
 */
import { isLineColor, type NoteColor, type NotePattern } from '@unlease/design/colors';

/** A picked note or collection, as the finish reads it. */
export interface Finished {
  readonly id: string;
  readonly kind: string;
  readonly color: NoteColor | null;
  readonly pattern: NotePattern | null;
}

/** A colour (a pigment, a gradient, or none), or a paper (or plain). */
export type Finish = { readonly color: NoteColor | null } | { readonly pattern: NotePattern | null };

export interface PickedFinish {
  /** The colour every picked one wears; undefined when they differ. */
  readonly color: NoteColor | null | undefined;
  /** The paper every picked note lies on; undefined when they differ or no note is picked. */
  readonly pattern: NotePattern | null | undefined;
  readonly notes: number;
  readonly collections: number;
}

const isCollection = (item: Finished): boolean => item.kind === 'links';

/** One value when every item holds the same, undefined otherwise (or when there is none). */
function shared<T>(values: readonly T[]): T | undefined {
  if (values.length === 0) return undefined;
  const first = values[0]!;
  return values.every(value => value === first) ? first : undefined;
}

/** What the picked notes and collections wear in common: the picker shows it, or none chosen. */
export function pickedFinish(items: readonly Finished[]): PickedFinish {
  const notes = items.filter(item => !isCollection(item));
  return {
    color: shared(items.map(item => item.color ?? null)),
    pattern: shared(notes.map(item => item.pattern ?? null)),
    notes: notes.length,
    collections: items.length - notes.length,
  };
}

export interface FinishChanges {
  /** The fields each picked one takes (one already so is left out). */
  readonly changes: readonly { readonly id: string; readonly patch: { readonly color?: NoteColor | null; readonly pattern?: NotePattern | null } }[];
  /** Collections that keep their own: the finish is not one a collection wears. */
  readonly kept: number;
}

/** What a colour or a paper changes on the picked ones: notes take it, collections a pigment only. */
export function finishChanges(items: readonly Finished[], finish: Finish): FinishChanges {
  const changes: { id: string; patch: { color?: NoteColor | null; pattern?: NotePattern | null } }[] = [];
  let kept = 0;
  for (const item of items) {
    if ('color' in finish) {
      if (isCollection(item) && !isLineColor(finish.color)) {
        kept += 1;
        continue;
      }
      if ((item.color ?? null) !== finish.color) changes.push({ id: item.id, patch: { color: finish.color } });
      continue;
    }
    if (isCollection(item)) {
      kept += 1;
      continue;
    }
    if ((item.pattern ?? null) !== finish.pattern) changes.push({ id: item.id, patch: { pattern: finish.pattern } });
  }
  return { changes, kept };
}
