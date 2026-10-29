/**
 * Migration 002: beside a pending record, the base of its typed text (`core/sync/bases`),
 * as JSON `{type, id, fields, clocks}` or null, so a concurrent edit merges instead of losing one side.
 */
import type { Migration } from './types';

export const migration002: Migration = {
  version: 2,
  name: 'typed text bases',
  statements: ['ALTER TABLE records ADD COLUMN bases TEXT'],
};
