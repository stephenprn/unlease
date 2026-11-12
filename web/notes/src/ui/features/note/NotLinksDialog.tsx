/**
 * « Transformer en collection » refused: a list whose items are not all links says which, in a
 * dialog rather than a slip (it has to be read, and acted on in the note behind it), with what to do
 * and one « OK ». The words are the package's (`notLinksWords`), the phone's the same.
 */
import { useId } from 'react';

import { t } from '@unlease/core/i18n';
import { notLinksWords } from '@unlease/notes/services/listToCollection';
import type { NoteKind } from '@unlease/notes/models/entities';

import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { Layer } from '@shared/ui/components/Layer';
import layers from '@shared/ui/components/layers.module.css';
import styles from './notLinks.module.css';

export function NotLinksDialog({ kind, lines, onClose }: { kind: NoteKind; lines: readonly string[] | null; onClose: () => void }) {
  const id = useId();
  const words = notLinksWords(kind, lines ?? []);
  return (
    <Layer open={lines !== null} onDismiss={onClose} role="alertdialog" labelledBy={`${id}-title`}>
      <DialogFrame
        title={words.title}
        titleId={`${id}-title`}
        className={layers.dialog}
        foot={
          <Button onClick={onClose}>
            {t('OK')}
          </Button>
        }
      >
        <p className={`${layers.dialogMessage} t-body`}>{words.message}</p>
        <ul className={styles.lines}>
          {words.items.map((line, index) => (
            <li key={`${index}:${line}`} className="t-body">
              {line}
            </li>
          ))}
        </ul>
        {words.more ? <p className={`${layers.dialogMessage} t-meta`}>{words.more}</p> : null}
      </DialogFrame>
    </Layer>
  );
}
