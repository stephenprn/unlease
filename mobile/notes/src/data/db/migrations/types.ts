/** A forward-only schema step, applied in ascending `version`. */
export interface Migration {
  /** Unique, contiguous from 1, never renumbered once shipped. */
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
}
