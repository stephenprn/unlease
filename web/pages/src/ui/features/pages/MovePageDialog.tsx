/**
 * « Déplacer vers… »: every page by its icon and title, the one the blocks are in marked, a field
 * to find one among many. While nothing is typed, the pages changed last come first under
 * « Récentes » (the home's own), then every page under « Toutes les pages », by where it sits
 * (`movePlaces`). A pick moves the blocks to the end of that page. A page being moved can also go
 * back to the top level (`onTop`).
 */
import { useId, useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/pages/models/blocks';
import { movePlaces, type MovePlace } from '@unlease/pages/services/recentPages';

import { useBlocksStore, type BlocksState } from '../../../app/store/blocks';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { Icon } from '@shared/ui/components/Icon';
import { Layer } from '@shared/ui/components/Layer';
import lineStyles from '@notes/ui/features/lines/lines.module.css';
import styles from './pages.module.css';

const NONE: Pick<BlocksState, 'blocks' | 'blocksByParent'> = { blocks: {}, blocksByParent: {} };

export interface MovePageDialogProps {
  readonly open: boolean;
  /** Where it is now (marked, and picking it moves nothing); null for the top level. */
  readonly current: string | null;
  readonly exclude: (id: string) => boolean;
  readonly onDismiss: () => void;
  readonly onPick: (pageId: string) => void;
  /** Offers the top level, among the pages of the home. */
  readonly onTop?: () => void;
  /** Its title, when it is not a move (« Importer dans »). */
  readonly title?: string;
}

export function MovePageDialog({ open, current, exclude, onDismiss, onPick, onTop, title }: MovePageDialogProps) {
  const titleId = useId();
  const [query, setQuery] = useState('');
  // Read only while open; leaving, it keeps showing what it showed.
  const blocks = useBlocksStore(s => (open ? s.blocks : null));
  const children = useBlocksStore(s => (open ? s.blocksByParent : null));
  const live = blocks && children ? { blocks, blocksByParent: children } : null;
  const [kept, setKept] = useState(live);
  if (live && (live.blocks !== kept?.blocks || live.blocksByParent !== kept.blocksByParent)) setKept(live);
  const shown = live ?? kept ?? NONE;
  const { recent, all } = useMemo(() => movePlaces(shown.blocks, shown.blocksByParent, { query, exclude, current, untitled: t(UNTITLED_PAGE) }), [shown.blocks, shown.blocksByParent, query, exclude, current]);
  const top = onTop && !query.trim() ? onTop : null;
  const headed = recent.length > 0;

  const row = ({ page, path }: MovePlace, key: string) => {
    const here = page.id === current;
    return (
      <button
        key={key}
        type="button"
        className={lineStyles.moveRow}
        aria-current={here || undefined}
        onClick={() => {
          onDismiss();
          if (!here) onPick(page.id);
        }}
      >
        <span className={`${lineStyles.moveMark} ${styles.moveSlot}`}>{page.icon ? <span className={styles.emoji}>{page.icon}</span> : <Icon name="page" size={24} />}</span>
        <span className={lineStyles.moveText}>
          <span className="t-body-strong">{page.text.trim() || t(UNTITLED_PAGE)}</span>
          {path ? <span className={`${lineStyles.moveHint} t-meta`}>{path}</span> : null}
        </span>
        {here ? <Icon name="check" size={20} /> : null}
      </button>
    );
  };

  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <DialogFrame kind="list" title={title ?? t('Déplacer vers')} titleId={titleId} onClose={onDismiss}>
        <input className={styles.pickerField} value={query} placeholder={t('Chercher une page')} aria-label={t('Chercher une page')} data-autofocus="" onChange={event => setQuery(event.target.value)} />
        {headed ? (
          <section className={styles.moveGroup} aria-labelledby={`${titleId}-recent`}>
            <h3 id={`${titleId}-recent`} className={`${styles.moveHead} t-section`}>
              {t('Récentes')}
            </h3>
            {recent.map(place => row(place, `recent-${place.page.id}`))}
          </section>
        ) : null}
        <section className={headed ? styles.moveGroup : styles.moveRows} aria-labelledby={headed ? `${titleId}-all` : undefined}>
          {headed ? (
            <h3 id={`${titleId}-all`} className={`${styles.moveHead} t-section`}>
              {t('Toutes les pages')}
            </h3>
          ) : null}
          {top ? (
            <button
              type="button"
              className={lineStyles.moveRow}
              aria-current={current === null || undefined}
              onClick={() => {
                onDismiss();
                if (current !== null) top();
              }}
            >
              <span className={`${lineStyles.moveMark} ${styles.moveSlot}`}>
                <Icon name="page" size={24} />
              </span>
              <span className={lineStyles.moveText}>
                <span className="t-body-strong">{t('Au premier niveau')}</span>
                <span className={`${lineStyles.moveHint} t-meta`}>{t('Avec les pages de l’accueil')}</span>
              </span>
              {current === null ? <Icon name="check" size={20} /> : null}
            </button>
          ) : null}
          {all.map(place => row(place, place.page.id))}
          {all.length === 0 ? <EmptyLine className={styles.pickerEmpty} role="status" text={t('Aucune page ne correspond.')} /> : null}
        </section>
      </DialogFrame>
    </Layer>
  );
}
