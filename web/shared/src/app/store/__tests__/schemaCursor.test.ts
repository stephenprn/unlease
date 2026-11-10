import { describe, expect, it } from 'vitest';

import { schemaFingerprint } from '@unlease/core/sync/schema';

import { freshLibrary } from '@test/library';
import { flushLibrary, loadLibrary, pullTypes, readCursor, resetLibrary, writeCursor } from '@shared/app/store/records';
import { openDatabase, writeRows } from '../../db/database';

describe('the cursor and the schema it was pulled with', () => {
  it('goes on from where it was with the same types and schema, and pulls again from 0 after a build that knows more of them', async () => {
    const { db, name } = await freshLibrary({ persistent: true });
    expect(pullTypes(['note', 'check'])).toBe(true);
    writeCursor(50);
    expect(pullTypes(['check', 'note'])).toBe(false);
    expect(readCursor()).toBe(50);
    await flushLibrary();

    // Reloaded by the same build: it goes on.
    db!.close();
    resetLibrary();
    let again = await openDatabase(name);
    await loadLibrary({ db: again, name });
    expect(readCursor()).toBe(50);
    expect(pullTypes(['note', 'check'])).toBe(false);
    expect(readCursor()).toBe(50);

    // What an older build kept: it pulled with a schema that knew less (it dropped what it did not know).
    await writeRows(again, [], [['schema', 'an-older-build']]);
    again.close();
    resetLibrary();
    again = await openDatabase(name);
    await loadLibrary({ db: again, name });
    expect(readCursor()).toBe(50);
    expect(pullTypes(['note', 'check'])).toBe(true);
    expect(readCursor()).toBe(0);
    await flushLibrary();
    const meta = await new Promise<string | undefined>(resolve => {
      const request = again.transaction('meta', 'readonly').objectStore('meta').get('schema');
      request.onsuccess = () => resolve((request.result as { value: string } | undefined)?.value);
    });
    expect(meta).toBe(schemaFingerprint(['check', 'note']));
    again.close();
  });
});
