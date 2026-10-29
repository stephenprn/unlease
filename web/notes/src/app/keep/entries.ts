/** Takeout writes `Takeout/Keep/…`; an export re-zipped by hand may start at `Keep/`. */
export function isKeepEntry(name: string): boolean {
  return /(^|\/)Keep\/[^/]+$/.test(name);
}
