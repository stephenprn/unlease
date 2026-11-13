/**
 * The pages in the bin, for the Corbeille (the pages' home only points there): each with when it
 * went there, « Restaurer » and « Supprimer définitivement » (asked first). The Corbeille's head
 * empties them all and says how long they stay (`emptyPagesBinAsked`). Nothing is drawn while no page
 * is in it.
 */
import { memo, useRef, useState } from 'react';

import { t, tc } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/pages/models/blocks';
import { formatRelative, plural } from '@unlease/core/services/format';

import { useMinute } from '@shared/app/hooks/useMinute';
import { useTrashedPages } from '../../../app/hooks/usePages';
import { useBlocksStore } from '../../../app/store/blocks';
import { deletePageForever, emptyPagesBin, restorePage } from '../../../app/store/pages';
import { showSnack, showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { Confirm } from '@shared/ui/components/Dialog';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { navigate } from '@shared/ui/router';
import { useListMotion } from '@shared/ui/useListMotion';
import { paths } from '../../routes';
import styles from './pages.module.css';

const BinRow = memo(function BinRow({ id, now, onDelete }: { id: string; now: number; onDelete: (id: string) => void }) {
  const page = useBlocksStore(s => s.blocks[id]);
  if (!page) return null;
  const title = page.text.trim() || t(UNTITLED_PAGE);
  return (
    <li className={styles.binRow} data-outline="panel" data-edge data-motion={id}>
      <span className={styles.binIcon}>{page.icon ? <span className={styles.tileEmoji}>{page.icon}</span> : <Icon name="page" size={22} />}</span>
      <span className={styles.binText}>
        <span className="t-body-strong">{title}</span>
        <span className="t-meta">{tc('f', 'Moved to the bin {when}', { when: formatRelative(page.trashedAt ?? now, now) })}</span>
      </span>
      <Button
        kind="tonal"
        small
        icon="restore"
        onClick={() => {
          const undo = restorePage(id);
          showUndo(t('Page restored'), undo, { label: t('See the page'), run: () => navigate(paths.page(id)) });
        }}
      >
        {t('Restore')}
      </Button>
      {/* Compact, as high as « Restaurer » beside it (Agenda's bin pairs them the same way). */}
      <IconButton icon="trash" label={t('Delete forever')} shape={2} compact onClick={() => onDelete(id)} />
    </li>
  );
});

export function PagesBinSection() {
  const binned = useTrashedPages();
  const now = useMinute();
  const [confirm, setConfirm] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);
  // A page restored or deleted fades where it was, the others close ranks; one put back by « Annuler » settles in.
  useListMotion(list, { late: true });
  return (
    <>
      {binned.length > 0 ? (
        // No head of its own: the Corbeille's title and its line on how long pages stay are right above, and Pages' bin holds pages alone.
        <ul ref={list} className={styles.binList} aria-label={t('Pages')}>
          {binned.map(id => (
            <BinRow key={id} id={id} now={now} onDelete={setConfirm} />
          ))}
        </ul>
      ) : null}
      {/* Kept while the last page goes, so the confirmation plays its exit. */}
      <Confirm
        open={confirm !== null}
        title={t('Delete forever?')}
        message={t('This page will disappear from all your devices, with everything in it.')}
        confirmLabel={t('Delete')}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) {
            deletePageForever([confirm]);
            showSnack(t('Page deleted forever'), undefined, { tone: 'success' });
          }
          setConfirm(null);
        }}
      />
    </>
  );
}

/** « Vider la corbeille », asked as Carnet's bin asks it: every page in it goes for good. */
export function EmptyPagesBinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Confirm
      open={open}
      title={t('Empty the bin?')}
      message={t('Every page in the bin will be deleted for good, on all your devices.')}
      confirmLabel={t('Empty')}
      danger
      onCancel={onClose}
      onConfirm={() => {
        onClose();
        const count = emptyPagesBin();
        showSnack(t('{deleted} forever', { deleted: plural(count, 'page deleted', 'pages deleted') }), undefined, { tone: 'success' });
      }}
    />
  );
}
