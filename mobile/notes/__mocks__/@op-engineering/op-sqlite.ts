/**
 * op-sqlite is JSI and cannot load under Jest: tests run on node's own SQLite instead,
 * so the SQL under test is the SQL that ships.
 */
import { DatabaseSync } from 'node:sqlite';

type Scalar = string | number | boolean | null;

interface QueryResult {
  rows: Record<string, Scalar>[];
  rowsAffected: number;
}

export function open(_options: { name: string; location?: string }): {
  executeSync: (sql: string, params?: Scalar[]) => QueryResult;
  close: () => void;
} {
  // Always in memory: a test must never touch a real file.
  const db = new DatabaseSync(':memory:');
  return {
    executeSync: (sql: string, params: Scalar[] = []): QueryResult => {
      const statement = db.prepare(sql);
      try {
        return { rows: statement.all(...(params as never[])) as Record<string, Scalar>[], rowsAffected: 0 };
      } catch {
        const info = statement.run(...(params as never[]));
        return { rows: [], rowsAffected: Number(info.changes) };
      }
    },
    close: () => db.close(),
  };
}
