/**
 * Another app's projection kept under one key of Agenda's state (`carnet`, `people`), since its keys
 * (`labels`) would meet Agenda's own. Untouched, the key keeps its identity, so a screen reading it
 * renders again only when that app's records changed.
 */
import type { LibraryBase, LibraryProjection } from '@shared/app/store/library';

export function nested<K extends string, S extends LibraryBase>(key: K, inner: LibraryProjection<S>): LibraryProjection<LibraryBase & { readonly [P in K]: S }> {
  type Outer = LibraryBase & { readonly [P in K]: S };
  return {
    empty: { revision: 0, [key]: inner.empty } as Outer,
    decode: (base, changed) => {
      const before = base[key] as S;
      const after = inner.decode(before, changed);
      const touched = (Object.keys(after) as (keyof S)[]).some(name => name !== 'revision' && after[name] !== before[name]);
      return touched ? ({ ...base, [key]: after } as Outer) : base;
    },
    clear: () => inner.clear(),
  };
}
