/**
 * What an app's bin does for a record it emptied that a device restores afterwards (a device
 * offline for more than the bin's week, restoring it from its own bin): the purge's tombstone is
 * lifted, and so are those it laid on what went with it. Carnet's notes have their own
 * (`apps/notes/bin.ts`, which also tells a note a person deleted for good); Pages', Contacts' and
 * Agenda's records use this one. A tombstone a person laid (« Supprimer définitivement ») carries
 * their device's clock, not this server's, and stays.
 */
import { hlcNode } from '@unlease/core/sync/hlc';
import { writeFields, type SyncRecord } from '@unlease/core/sync/record';
import { log } from '../log';
import type { RecordStore } from './records';
import type { PushRule } from './service';

/**
 * A rule (`PushRule`) for records of `type`: one the server tombstoned that a push takes out of the
 * bin (`trashedAt` back to null, later than its trashing) comes back, with what `takenWith` names
 * that the same purge tombstoned (the same `deletedAt`, the server's clock).
 */
export function reviveRule(type: string, takenWith: (records: RecordStore, record: SyncRecord) => readonly SyncRecord[] = () => []): PushRule {
  return (current, incoming, merged, { records, clock }) => {
    if (current.type !== type || typeof merged.fields.deletedAt !== 'number' || merged.fields.trashedAt !== null) return [];
    const purge = merged.clocks.deletedAt;
    if (!purge || hlcNode(purge) !== clock.node) return [];
    const restore = incoming.clocks.trashedAt;
    const trashed = current.clocks.trashedAt;
    if (!restore || incoming.fields.trashedAt !== null || (trashed !== undefined && restore <= trashed)) return [];
    const purgedAt = merged.fields.deletedAt;
    const purged = takenWith(records, merged).filter(other => other.fields.deletedAt === purgedAt && other.clocks.deletedAt !== undefined && hlcNode(other.clocks.deletedAt) === clock.node);
    const stamp = clock.stampOver([purge, ...purged.map(other => other.clocks.deletedAt)]);
    log.info('sync: a record restored on a device after the bin emptied it came back', { type, id: current.id, with: purged.length });
    return [writeFields(merged, { deletedAt: null }, stamp), ...purged.map(other => writeFields(other, { deletedAt: null }, stamp))];
  };
}
