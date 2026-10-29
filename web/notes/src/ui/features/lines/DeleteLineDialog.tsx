/**
 * Deleting collections that hold links (one from its page, or a selection on the board): the
 * person says where the links go. The phone's `DeleteLineSheet`.
 */
import { useId, useState } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';
import { t } from '@unlease/core/i18n';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';

import { useLines } from '../../../app/hooks/useLines';
import { useLibraryStore } from '../../../app/store/library';
import { selectCanRead, useSettingsStore } from '../../../app/store/settings';
import { selectSorting, useUiStore } from '../../../app/store/ui';
import { DialogFrame } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { Layer } from '../../components/Layer';
import styles from './lines.module.css';

/** Where a deleted collection's links go: sorted by Claude, to one collection ("Non classé" included), or to the bin. */
export type LinksFate = { readonly kind: 'claude' } | { readonly kind: 'move'; readonly to: string } | { readonly kind: 'bin' };

function Choice({ icon, title, hint, onClick, danger }: { icon: GlyphName; title: string; hint?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={`${styles.moveRow} ${danger ? styles.dangerRow : ''}`} onClick={onClick}>
      <span className={styles.moveMark}>
        <Icon name={icon} size={24} />
      </span>
      <span className={styles.moveText}>
        <span className="t-body-strong">{title}</span>
        {hint ? <span className={`${styles.moveHint} t-meta`}>{hint}</span> : null}
      </span>
    </button>
  );
}

/** `ids`: the notes being deleted; the collections among them hold the links. */
export function DeleteLineDialog({ ids, open, onDismiss, onChoose, onPickLine }: { ids: readonly string[]; open: boolean; onDismiss: () => void; onChoose: (fate: LinksFate) => void; onPickLine: () => void }) {
  const titleId = useId();
  const lines = useLines();
  const deleting = lines.filter(line => ids.includes(line.id) && line.id !== INBOX_ID);
  const count = useLibraryStore(s => ids.reduce((sum, id) => sum + (id !== INBOX_ID && s.notes[id]?.kind === 'links' ? (s.linksByNote[id]?.length ?? 0) : 0), 0));
  const reading = useSettingsStore(selectCanRead);
  const sorting = useUiStore(selectSorting);
  const others = lines.some(line => !ids.includes(line.id) && line.id !== INBOX_ID);
  const words = {
    title: deleting.length === 1 ? t('Supprimer {collection}', { collection: shownTitle(deleting[0]!) }) : t('Supprimer {count} collections', { count: deleting.length }),
    lead: deleting.length === 1 ? t('Elle contient {links}. Où les mettre ?', { links: plural(count, 'lien') }) : t('Elles contiennent {links}. Où les mettre ?', { links: plural(count, 'lien') }),
  };
  // Once the choice is made the collections are gone: while it leaves, the dialog keeps the words it opened with.
  const [shown, setShown] = useState(words);
  if (open && (shown.title !== words.title || shown.lead !== words.lead)) setShown(words);
  const choose = (fate: LinksFate): void => {
    onDismiss();
    onChoose(fate);
  };
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <DialogFrame kind="list" title={shown.title} titleId={titleId} onClose={onDismiss}>
        <p className={`${styles.choiceLead} t-body`}>{shown.lead}</p>
        {reading && others && !sorting ? <Choice icon="sparkle" title={t('Les ranger avec Claude')} hint={t('Dans vos autres collections, sinon dans Non classé')} onClick={() => choose({ kind: 'claude' })} /> : null}
        <Choice icon="inbox" title={t('Les mettre dans Non classé')} onClick={() => choose({ kind: 'move', to: INBOX_ID })} />
        {others ? (
          <Choice
            icon="transfer"
            title={t('Les déplacer vers…')}
            hint={t('Une autre collection')}
            onClick={() => {
              onDismiss();
              onPickLine();
            }}
          />
        ) : null}
        <Choice icon="trash" title={t('Les supprimer aussi')} hint={deleting.length === 1 ? t('Avec la collection, dans la corbeille') : t('Avec les collections, dans la corbeille')} onClick={() => choose({ kind: 'bin' })} danger />
      </DialogFrame>
    </Layer>
  );
}
