/** Migration runner over `PRAGMA user_version`; each step and its bump share one transaction. */
import type { DB } from '@op-engineering/op-sqlite';

import { migration001 } from './001_initial';
import { migration002 } from './002_bases';
import { migration003 } from './003_every_type';
import type { Migration } from './types';

export type { Migration } from './types';

/** Ordered, append-only. Never edit a shipped entry; add a new one. */
const MIGRATIONS: readonly Migration[] = [migration001, migration002, migration003];

export const LATEST_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);

function currentVersion(db: DB): number {
  const row = db.executeSync('PRAGMA user_version').rows[0];
  return row ? Number(Object.values(row)[0] ?? 0) : 0;
}

export function migrate(db: DB): { from: number; to: number; applied: number } {
  const from = currentVersion(db);
  let applied = 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= from) continue;
    db.executeSync('BEGIN');
    try {
      for (const statement of migration.statements) db.executeSync(statement);
      db.executeSync(`PRAGMA user_version = ${migration.version}`);
      db.executeSync('COMMIT');
      applied += 1;
    } catch (error) {
      db.executeSync('ROLLBACK');
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { from, to: currentVersion(db), applied };
}
