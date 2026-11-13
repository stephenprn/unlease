/**
 * A copy of an app's records kept somewhere else, one way: the phone apps' mirror of the address
 * book and of the calendar into Android's own (Contacts' and Agenda's `phoneMirror`). The app's
 * package says what each record becomes (a row with its id); here, the fingerprint that tells a row
 * written already from one to write again, and what a run changes: the rows to write (new, or
 * different from what was written) and the ids to take away (written once, no longer wanted).
 * Pure, so a run that changes nothing writes nothing, and a run cut short is finished by the next.
 */

/** A row of the mirror: the record's id, and what its fields come to. */
export interface MirrorRow {
  readonly id: string;
  readonly fingerprint: string;
}

/** What the other side holds: each id written, with the fingerprint it was written with. */
export interface WrittenRow {
  readonly id: string;
  readonly fingerprint: string;
}

export interface MirrorChanges<T extends MirrorRow> {
  /** Rows not written yet, or written with other fields. */
  readonly upserts: readonly T[];
  /** Ids written once and no longer wanted (or written twice: every copy goes, the wanted one is written again). */
  readonly deletes: readonly string[];
}

/**
 * A short, stable digest of a value (its JSON, keys in the order given): cyrb53, 53 bits in hex.
 * Not a secret: it only tells two versions of a row apart.
 */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value) ?? '';
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** What a run writes and takes away, so the other side holds `wanted` and nothing else of its own. */
export function mirrorChanges<T extends MirrorRow>(wanted: readonly T[], written: readonly WrittenRow[]): MirrorChanges<T> {
  const held = new Map<string, string[]>();
  for (const row of written) held.set(row.id, [...(held.get(row.id) ?? []), row.fingerprint]);
  const wantedIds = new Set(wanted.map(row => row.id));
  const deletes: string[] = [];
  const twice = new Set<string>();
  for (const [id, prints] of held) {
    if (!wantedIds.has(id)) deletes.push(id);
    else if (prints.length > 1) {
      // Two rows for one record (a run cut between its insert and its bookkeeping): both go, one comes back.
      deletes.push(id);
      twice.add(id);
    }
  }
  const upserts = wanted.filter(row => twice.has(row.id) || held.get(row.id)?.[0] !== row.fingerprint);
  return { upserts, deletes };
}
