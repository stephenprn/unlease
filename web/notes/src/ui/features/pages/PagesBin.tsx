/**
 * The pages in the bin, for the Corbeille (the pages' home only points there): each with when it
 * went there, « Restaurer » and « Supprimer définitivement », and a way to delete them all. The bin
 * empties itself after a week. Nothing is drawn while no page is in it. `embedded` (in the
 * Corbeille, whose own head empties notes and pages and says how long they stay): the heading and
 * the rows alone.
 */
import { memo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/notes/models/blocks';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import { formatRelative, plural } from '@unlease/core/services/format';

import { useMinute } from '../../../app/hooks/useMinute';
import { useTrashedPages } from '../../../app/hooks/usePages';
import { useLibraryStore } from '../../../app/store/library';
import { deletePageForever, emptyPagesBin, restorePage } from '../../../app/store/pages';
import { showSnack, showUndo } from '../../../app/store/ui';
import { Button } from '../../components/Button';
import { Confirm } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import styles from './pages.module.css';

const BinRow = memo(function BinRow({ id, now, onDelete }: { id: string; now: number; onDelete: (id: string) => void }) {
  const page = useLibraryStore(s => s.blocks[id]);
  if (!page) return null;
  const title = page.text.trim() || t(UNTITLED_PAGE);
  return (
    <li className={styles.binRow} data-outline="panel" data-edge>
      <span className={styles.binIcon}>{page.icon ? <span className={styles.tileEmoji}>{page.icon}</span> : <Icon name="page" size={22} />}</span>
      <span className={styles.binText}>
        <span className="t-body-strong">{title}</span>
        <span className="t-meta">{t('Mise à la corbeille {when}', { when: formatRelative(page.trashedAt ?? now, now) })}</span>
      </span>
      <Button
        kind="tonal"
        small
        icon="restore"
        onClick={() => {
          const undo = restorePage(id);
          showUndo(t('Page restaurée'), undo);
        }}
      >
        {t('Restaurer')}
      </Button>
      <IconButton icon="trash" label={t('Supprimer définitivement')} shape={2} onClick={() => onDelete(id)} />
    </li>
  );
});

export function PagesBinSection({ embedded = false }: { embedded?: boolean }) {
  const binned = useTrashedPages();
  const now = useMinute();
  const [confirm, setConfirm] = useState<'all' | string | null>(null);
  return (
    <>
      {binned.length > 0 ? (
        <section className={styles.bin} aria-labelledby="pages-bin">
          <div className={styles.binHead}>
            <h2 id="pages-bin" className="t-section">
              {t('Pages · {count}', { count: binned.length })}
            </h2>
            {embedded ? null : (
              <Button kind="text" small onClick={() => setConfirm('all')}>
                {t('Supprimer les pages')}
              </Button>
            )}
          </div>
          {embedded ? null : <p className={`${styles.binNote} t-meta`}>{t('Les pages restent {days} jours dans la corbeille, avec tout ce qu’elles contiennent.', { days: TRASH_RETENTION_DAYS })}</p>}
          <ul className={styles.binList}>
            {binned.map(id => (
              <BinRow key={id} id={id} now={now} onDelete={setConfirm} />
            ))}
          </ul>
        </section>
      ) : null}
      {/* Kept while the last page goes, so the confirmation plays its exit. */}
      <Confirm
        open={confirm !== null}
        title={confirm === 'all' ? t('Supprimer les pages de la corbeille ?') : t('Supprimer définitivement ?')}
        message={confirm === 'all' ? t('Ces pages disparaîtront de tous vos appareils, avec tout ce qu’elles contiennent.') : t('Cette page disparaîtra de tous vos appareils, avec tout ce qu’elle contient.')}
        confirmLabel={t('Supprimer')}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === 'all') {
            const count = emptyPagesBin();
            showSnack(t('{pages} définitivement', { pages: plural(count, 'page supprimée', 'pages supprimées') }), undefined, { tone: 'success' });
          } else if (confirm) {
            deletePageForever([confirm]);
            showSnack(t('Page supprimée définitivement'), undefined, { tone: 'success' });
          }
          setConfirm(null);
        }}
      />
    </>
  );
}
