/**
 * A note's photos at the top of the editor: one at full width, more in a
 * registered grid of equal tiles. A click opens it full screen, on black; the
 * corner button deletes it (with "Annuler"), on a slip so it reads on any
 * picture in either theme. Full screen, the controls lie on a shade of the
 * black that fades down from the top, as on the phone.
 */
import { memo, useState } from 'react';

import { t } from '@unlease/core/i18n';

import { useBlobUrl } from '@shared/app/media/images';
import { removeAttachment } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { showUndo } from '@shared/app/store/ui';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { Layer } from '@shared/ui/components/Layer';
import styles from './editor.module.css';

function PhotoGridComponent({ noteId, editable }: { noteId: string; editable: boolean }) {
  const ids = useLibraryStore(s => s.attachmentsByNote[noteId]);
  const [open, setOpen] = useState<number | null>(null);
  if (!ids || ids.length === 0) return null;
  const columns = ids.length >= 5 ? 3 : 2;
  return (
    <>
      <div className={styles.photos} data-single={ids.length === 1 || undefined} style={{ '--photo-columns': columns } as React.CSSProperties}>
        {ids.map((id, index) => (
          <div key={id} className={styles.photoCell}>
            <Photo id={id} onOpen={() => setOpen(index)} />
            {editable ? (
              <IconButton
                icon="close"
                label={t('Delete the photo')}
                onSlip
                compact
                size={18}
                className={styles.photoRemove}
                onClick={() => showUndo(t('Photo deleted'), removeAttachment(id))}
              />
            ) : null}
          </div>
        ))}
      </div>
      <Viewer ids={ids} index={open} onIndex={setOpen} editable={editable} />
    </>
  );
}

const Photo = memo(function Photo({ id, onOpen }: { id: string; onOpen: () => void }) {
  const attachment = useLibraryStore(s => s.attachments[id]);
  const url = useBlobUrl(id, 'display', attachment?.uploaded ?? false);
  const ratio = attachment && attachment.width > 0 && attachment.height > 0 ? attachment.width / attachment.height : undefined;
  return (
    <button type="button" className={styles.photo} onClick={onOpen} aria-label={t('Open the photo')} style={ratio ? { aspectRatio: String(ratio) } : undefined}>
      {url ? (
        <img src={url} alt="" draggable={false} />
      ) : (
        <span className={styles.photoPlaceholder}>
          <Icon name="image" size={28} />
        </span>
      )}
    </button>
  );
});

function Viewer({ ids, index, onIndex, editable }: { ids: readonly string[]; index: number | null; onIndex: (index: number | null) => void; editable: boolean }) {
  // Closing, the photo it showed stays on the black while it fades (by id: a removed photo's neighbour must not flash in).
  const current = index !== null ? ids[index] : undefined;
  const [last, setLast] = useState(current);
  if (current !== undefined && current !== last) setLast(current);
  const id = index !== null ? current : last;
  const uploaded = useLibraryStore(s => (id ? (s.attachments[id]?.uploaded ?? false) : false));
  const url = useBlobUrl(id, 'original', uploaded);
  const close = (): void => onIndex(null);
  return (
    <Layer open={index !== null} onDismiss={close} kind="bare" label={t('Photo')} bare>
      <div
        className={styles.viewer}
        role="dialog"
        aria-modal="true"
        aria-label={t('Photo')}
        tabIndex={-1}
        onKeyDown={event => {
          if (index === null) return;
          if (event.key === 'ArrowRight' && index < ids.length - 1) onIndex(index + 1);
          if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
        }}
      >
        {url ? <img src={url} alt="" /> : null}
        <div className={styles.viewerBar}>
          <IconButton icon="back" label={t('Close')} onSlip onClick={close} shortcut={t('Esc')} />
          {editable && id ? (
            <IconButton
              icon="trash"
              label={t('Delete the photo')}
              onSlip
              onClick={() => {
                const undo = removeAttachment(id);
                close();
                showUndo(t('Photo deleted'), undo);
              }}
            />
          ) : null}
        </div>
        {index !== null && index > 0 ? (
          <IconButton icon="back" label={t('Previous photo')} onSlip className={`${styles.viewerNav} ${styles.viewerPrev}`} onClick={() => onIndex(index - 1)} />
        ) : null}
        {index !== null && index < ids.length - 1 ? (
          <IconButton icon="chevronRight" label={t('Next photo')} onSlip className={`${styles.viewerNav} ${styles.viewerNext}`} onClick={() => onIndex(index + 1)} />
        ) : null}
      </div>
    </Layer>
  );
}

export const PhotoGrid = memo(PhotoGridComponent);
