/**
 * « Déplacer vers… »: every page by its icon and title, the one the blocks are in marked, a field
 * to find one among many. A pick moves the blocks to the end of that page. A page being moved can
 * also go back to the top level (`onTop`).
 */
import { useId, useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/notes/models/blocks';
import { ancestorPages, isInBin } from '@unlease/notes/services/blocks';
import { foldText } from '@unlease/core/services/search';

import { useLibraryStore, type LibraryState } from '../../../app/store/library';
import { DialogFrame } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { Layer } from '../../components/Layer';
import lineStyles from '../lines/lines.module.css';
import styles from './pages.module.css';

const NONE: LibraryState['blocks'] = {};

export interface MovePageDialogProps {
  readonly open: boolean;
  /** Where it is now (marked, and picking it moves nothing); null for the top level. */
  readonly current: string | null;
  readonly exclude: (id: string) => boolean;
  readonly onDismiss: () => void;
  readonly onPick: (pageId: string) => void;
  /** Offers the top level, among the pages of the home. */
  readonly onTop?: () => void;
}

export function MovePageDialog({ open, current, exclude, onDismiss, onPick, onTop }: MovePageDialogProps) {
  const titleId = useId();
  const [query, setQuery] = useState('');
  // Read only while open; leaving, it keeps showing what it showed.
  const live = useLibraryStore(s => (open ? s.blocks : null));
  const [kept, setKept] = useState(live);
  if (live && live !== kept) setKept(live);
  const blocks = live ?? kept ?? NONE;
  const pages = useMemo(() => {
    const wanted = foldText(query.trim());
    return Object.values(blocks)
      .filter(block => block.kind === 'page' && !isInBin(blocks, block.id) && !exclude(block.id))
      .map(block => ({ block, path: ancestorPages(blocks, block.id).map(page => page.text.trim() || t(UNTITLED_PAGE)).join(' / ') }))
      .filter(({ block }) => !wanted || foldText(block.text).includes(wanted))
      .sort((a, b) => (a.path + (a.block.text || UNTITLED_PAGE)).localeCompare(b.path + (b.block.text || UNTITLED_PAGE), 'fr'))
      .slice(0, 60);
  }, [blocks, query, exclude]);
  const top = onTop && !query.trim() ? onTop : null;
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <DialogFrame kind="list" title={t('Déplacer vers')} titleId={titleId} onClose={onDismiss}>
        <input className={styles.pickerField} value={query} placeholder={t('Chercher une page')} aria-label={t('Chercher une page')} data-autofocus="" onChange={event => setQuery(event.target.value)} />
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
            <span className={lineStyles.moveMark}>
              <Icon name="page" size={24} />
            </span>
            <span className={lineStyles.moveText}>
              <span className="t-body-strong">{t('Au premier niveau')}</span>
              <span className={`${lineStyles.moveHint} t-meta`}>{t('Avec les pages de l’accueil')}</span>
            </span>
            {current === null ? <Icon name="check" size={20} /> : null}
          </button>
        ) : null}
        {pages.map(({ block, path }) => {
          const here = block.id === current;
          return (
            <button
              key={block.id}
              type="button"
              className={lineStyles.moveRow}
              aria-current={here || undefined}
              onClick={() => {
                onDismiss();
                if (!here) onPick(block.id);
              }}
            >
              <span className={lineStyles.moveMark}>{block.icon ? <span className={styles.emoji}>{block.icon}</span> : <Icon name="page" size={24} />}</span>
              <span className={lineStyles.moveText}>
                <span className="t-body-strong">{block.text.trim() || t(UNTITLED_PAGE)}</span>
                {path ? <span className={`${lineStyles.moveHint} t-meta`}>{path}</span> : null}
              </span>
              {here ? <Icon name="check" size={20} /> : null}
            </button>
          );
        })}
        {pages.length === 0 ? <p className={`${styles.pickerEmpty} t-meta`}>{t('Aucune page ne correspond.')}</p> : null}
      </DialogFrame>
    </Layer>
  );
}
