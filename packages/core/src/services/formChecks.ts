/**
 * When a field says what is wrong with it, the same in every form of both clients: "reward early,
 * punish late".
 *
 * - Nothing is said while a fresh value is being typed: a half-typed address is not a mistake yet.
 * - Leaving a field with something in it checks it; an empty field is said to be missing only once
 *   the form was sent (people skip a field and come back to it).
 * - Once a field says what is wrong, it checks again at every keystroke, and its message goes the
 *   moment the value is right. A field that was right and is edited again waits until it is left.
 * - Sending the form shows every field's problem at once; the first one takes the focus.
 *
 * A field is `live` while its problem (if any) is shown; `formChecks` decides when it goes live and
 * when it goes quiet again. The checks themselves belong to each form (a translated sentence saying
 * what is wrong and how to fix it, or null).
 */

export type FieldMoment =
  /** The value changed. */
  | 'edit'
  /** The field lost the focus. */
  | 'leave'
  /** The form was sent. */
  | 'send';

export interface FieldMomentState {
  /** Whether the field is live now (its problem shown). */
  readonly live: boolean;
  /** Whether it showed a problem as the moment came (the message on screen, before this keystroke). */
  readonly showing: boolean;
  /** Whether the field holds nothing (spaces aside). */
  readonly empty: boolean;
  /** Whether the person already tried to send the form. */
  readonly sent: boolean;
}

/** Whether a field is live after `moment`. */
export function liveAfter(moment: FieldMoment, state: FieldMomentState): boolean {
  switch (moment) {
    case 'send':
      return true;
    case 'leave':
      return state.live || !state.empty || state.sent;
    case 'edit':
      // Showing a problem: checked at every keystroke until it is right. Right (or quiet): quiet until left.
      return state.showing;
    default:
      return state.live;
  }
}

/** The fields to send focus to, in the form's order: the first holding a problem. */
export function firstProblem<K extends string>(order: readonly K[], problems: Readonly<Partial<Record<K, string | null>>>): K | null {
  return order.find(name => !!problems[name]) ?? null;
}

/** Whether a text value counts as empty. */
export const isBlank = (value: string | null | undefined): boolean => !value || value.trim().length === 0;
