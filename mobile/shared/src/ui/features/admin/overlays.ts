/**
 * What the Administration's sections ask the screen to open: a sheet or a dialog draws in place, so
 * it lives at the screen's root, over every section.
 */
import type { BackupSnapshot } from '@unlease/core/sync/admin';

export interface Confirmation {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly danger?: boolean;
  readonly run: () => void;
}

/** A backup to restore: a snapshot on S3, or an archive picked on the phone (copied into its cache). */
export type RestoreTarget = { readonly kind: 'snapshot'; readonly name: string } | { readonly kind: 'file'; readonly path: string; readonly name: string };

export interface AdminOverlays {
  readonly ask: (confirmation: Confirmation) => void;
  /** The choice between downloading and restoring a snapshot. */
  readonly openSnapshot: (snapshot: BackupSnapshot) => void;
  readonly restore: (target: RestoreTarget) => void;
}
