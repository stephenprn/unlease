/**
 * Restoring a backup: on a server that holds nothing it simply comes back; otherwise the person
 * chooses between going back to the backup (its values win everywhere, what was created since is
 * kept) and completing with it (only what is missing comes back).
 */
import { useId, useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import type { RestoreMode } from '@unlease/core/sync/admin';

import { Button } from '../../components/Button';
import { DialogFrame } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { Layer } from '../../components/Layer';
import layers from '../../components/layers.module.css';
import styles from './settings.module.css';

const MODES: readonly { readonly mode: RestoreMode; readonly title: string; readonly hint: string }[] = [
  { mode: 'merge', title: tx('Compléter'), hint: tx('Seul ce qui manque revient ; les modifications faites depuis sont gardées.') },
  { mode: 'rollback', title: tx('Revenir à la sauvegarde'), hint: tx('Tout reprend l’état de la sauvegarde, sur tous vos appareils ; ce qui a été créé depuis est gardé.') },
];

/** `source`: which backup, in words ("Sauvegarde du 26 oct. à 03:00", a file's name). `empty`: the server holds nothing. */
export function RestoreDialog({ open, source, empty, onCancel, onConfirm }: { open: boolean; source: string; empty: boolean; onCancel: () => void; onConfirm: (mode: RestoreMode) => void }) {
  const id = useId();
  const [mode, setMode] = useState<RestoreMode>('merge');
  // Each time it opens it proposes the safe choice again: the dialog stays mounted between restores.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setMode('merge');
  }
  return (
    <Layer open={open} onDismiss={onCancel} role="alertdialog" labelledBy={`${id}-title`}>
      <DialogFrame
        title={t('Restaurer cette sauvegarde ?')}
        titleId={`${id}-title`}
        className={layers.dialog}
        foot={
          <>
            <Button kind="text" onClick={onCancel}>
              {t('Annuler')}
            </Button>
            <Button onClick={() => onConfirm(empty ? 'merge' : mode)}>{t('Restaurer')}</Button>
          </>
        }
      >
        {source ? <p className={`${layers.dialogMessage} t-meta`}>{source}</p> : null}
        {empty ? (
          <p className={`${layers.dialogMessage} t-body`}>{t('Ses notes, listes, liens et pages reviennent sur le serveur, puis sur vos appareils.')}</p>
        ) : (
          <div role="radiogroup" aria-label={t('Restauration')} className={styles.choices}>
            {MODES.map(option => (
              <button key={option.mode} type="button" role="radio" aria-checked={mode === option.mode} className={styles.choice} onClick={() => setMode(option.mode)}>
                <span className={styles.choiceMark} aria-hidden="true">
                  {mode === option.mode ? <Icon name="check" size={20} /> : null}
                </span>
                <span className={styles.rowText}>
                  <span className="t-body-strong">{t(option.title)}</span>
                  <span className="t-meta">{t(option.hint)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </DialogFrame>
    </Layer>
  );
}
