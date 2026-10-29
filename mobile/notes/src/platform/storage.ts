/** The database directory, for the pre-migration copy (`src/data` may not know the platform). */
import { ANDROID_DATABASE_PATH } from '@op-engineering/op-sqlite';

export function databaseDirectory(): string | undefined {
  return typeof ANDROID_DATABASE_PATH === 'string' && ANDROID_DATABASE_PATH ? ANDROID_DATABASE_PATH : undefined;
}
