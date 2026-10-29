/**
 * "Changer de collection": the filing done by hand. Every collection by its emblem, the current
 * one marked; one click moves the link to the top of another.
 */
import { useId } from 'react';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { shownHint, shownTitle } from '@unlease/notes/models/entities';

import { useLines } from '../../../app/hooks/useLines';
import { DialogFrame } from '../../components/Dialog';
import { Emblem } from '../../components/Emblem';
import { Icon } from '../../components/Icon';
import { Layer } from '../../components/Layer';
import styles from './lines.module.css';

/** `exclude`: collections not offered (those being deleted). */
export function MoveDialog({ open, currentLineId, onDismiss, onPick, title = t('Changer de collection'), exclude = [] }: { open: boolean; currentLineId: string | null; onDismiss: () => void; onPick: (lineId: string) => void; title?: string; exclude?: readonly string[] }) {
  const lines = useLines().filter(line => !exclude.includes(line.id));
  const titleId = useId();
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <DialogFrame kind="list" title={title} titleId={titleId} onClose={onDismiss}>
        {lines.map(line => {
          const current = line.id === currentLineId;
          return (
            <button
              key={line.id}
              type="button"
              className={styles.moveRow}
              aria-current={current || undefined}
              data-autofocus={current || undefined}
              onClick={() => {
                onDismiss();
                if (!current) onPick(line.id);
              }}
            >
              <span className={styles.moveMark}>
                <Emblem emblem={collectionEmblem(line.id, line.emblem)} color={asLineColor(line.color)} size={34} />
              </span>
              <span className={styles.moveText}>
                <span className="t-body-strong">{shownTitle(line)}</span>
                {line.hint ? <span className={`${styles.moveHint} t-meta`}>{shownHint(line)}</span> : null}
              </span>
              {current ? <Icon name="check" size={20} /> : null}
            </button>
          );
        })}
      </DialogFrame>
    </Layer>
  );
}
