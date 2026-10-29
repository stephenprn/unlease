/** What goes in a page's text in place of what was typed to ask for it (« @dem », « [[Voy », « /date »). */
import { deleteRich, insertRich, richToPlain, type Run } from '@unlease/core/services/richText';

const SPACE: Run = { kind: 'text', text: ' ', marks: {} };

/** A mention or a date in place of the typed range, a space after it unless one follows already; the caret goes past that space. */
export function placeAtom(runs: readonly Run[], start: number, end: number, atom: Run): { readonly runs: Run[]; readonly caret: number } {
  const rest = deleteRich(runs, start, end);
  const spaced = /[ \u00a0]/.test(richToPlain(rest)[start] ?? '');
  return { runs: insertRich(rest, start, spaced ? [atom] : [atom, SPACE]), caret: start + 2 };
}
