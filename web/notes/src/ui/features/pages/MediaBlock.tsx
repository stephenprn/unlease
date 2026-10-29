/**
 * A picture, a video, a PDF or a file in a page: uploaded (kept in this browser until the server
 * has it) or shown from its address (a video site plays in its own frame). Empty, it offers both,
 * and takes a file dropped on it. A file shows its name and size, and saves itself to the computer.
 */
import { memo, useRef, useState, type DragEvent } from 'react';

import { t, tx } from '@unlease/core/i18n';
import type { Block, MediaKind } from '@unlease/notes/models/blocks';
import { fileNameFromUrl, isVideoFileUrl, mediaKindFor, videoEmbedUrl } from '@unlease/notes/services/media';
import { extractUrls } from '@unlease/core/services/url';

import { attachBlockFile, fileRefusal, saveBlockFile } from '../../../app/media/blockFiles';
import { useBlobUrl } from '../../../app/media/images';
import { setMediaUrl } from '../../../app/store/pages';
import { showError, showWarning } from '../../../app/store/ui';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { safeHref } from './richDom';
import { usePageContext } from './PageContext';
import styles from './pages.module.css';
import { formatBytes } from '@unlease/core/services/format';

const WORDS: Record<MediaKind, { readonly add: string; readonly accept: string; readonly icon: 'image' | 'video' | 'pdf' | 'file' }> = {
  image: { add: tx('Ajouter une image'), accept: 'image/*', icon: 'image' },
  video: { add: tx('Ajouter une vidéo'), accept: 'video/*', icon: 'video' },
  pdf: { add: tx('Ajouter un PDF'), accept: 'application/pdf', icon: 'pdf' },
  file: { add: tx('Ajouter un fichier'), accept: '', icon: 'file' },
};

function EmptyMedia({ block, kind }: { block: Block; kind: MediaKind }) {
  const { page, readOnly } = usePageContext();
  const input = useRef<HTMLInputElement>(null);
  const [linking, setLinking] = useState(false);
  const [address, setAddress] = useState('');
  const [over, setOver] = useState(false);
  const words = WORDS[kind];

  const attach = async (file: File): Promise<void> => {
    const outcome = await attachBlockFile(page, block.id, file);
    if (outcome !== 'ok') showError(fileRefusal(outcome, mediaKindFor(file.type) === 'image'));
  };
  const embed = (): void => {
    const url = extractUrls(address)[0];
    if (!url) {
      showError(t('Ce n’est pas une adresse'));
      return;
    }
    setMediaUrl(page, block.id, url, fileNameFromUrl(url));
    setLinking(false);
  };

  return (
    <div
      className={styles.mediaEmpty}
      data-outline="panel"
      data-edge
      data-over={over || undefined}
      onDragOver={event => {
        if (readOnly || ![...event.dataTransfer.types].includes('Files')) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event: DragEvent) => {
        setOver(false);
        const file = event.dataTransfer.files[0];
        if (readOnly || !file) return;
        event.preventDefault();
        // Taken here: the page's own drop would add it again as a new block.
        event.stopPropagation();
        void attach(file);
      }}
    >
      <Icon name={words.icon} size={24} />
      {linking ? (
        <form
          className={styles.mediaLink}
          onSubmit={event => {
            event.preventDefault();
            embed();
          }}
        >
          <input className={styles.pickerField} value={address} autoFocus placeholder={t('Collez l’adresse (https://…)')} aria-label={t('Adresse à intégrer')} onChange={event => setAddress(event.target.value)} />
          <Button kind="tonal" small type="submit">
            {t('Intégrer')}
          </Button>
        </form>
      ) : (
        <>
          <span className={`${styles.mediaEmptyLabel} t-body`}>{t(words.add)}</span>
          {readOnly ? null : (
            <span className={styles.mediaActions}>
              <Button kind="tonal" small icon="upload" onClick={() => input.current?.click()}>
                {t('Téléverser')}
              </Button>
              <Button kind="text" small icon="link" onClick={() => setLinking(true)}>
                {t('Intégrer un lien')}
              </Button>
            </span>
          )}
        </>
      )}
      <input
        ref={input}
        type="file"
        accept={words.accept || undefined}
        hidden
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void attach(file);
        }}
      />
    </div>
  );
}

/** An address shown as itself, to open: what cannot be shown in the page. */
function AddressCard({ url, name, icon }: { url: string; name: string; icon: 'video' | 'pdf' | 'file' | 'image' }) {
  return (
    <a className={styles.fileCard} data-outline="frame" data-edge href={safeHref(url)} target="_blank" rel="noopener noreferrer">
      <Icon name={icon} size={22} />
      <span className={styles.fileText}>
        <span className="t-body-strong">{name}</span>
        <span className="t-meta">{url}</span>
      </span>
      <Icon name="external" size={18} />
    </a>
  );
}

function MediaBlockComponent({ block }: { block: Block }) {
  const kind = block.kind as MediaKind;
  const fileId = block.fileId;
  const image = useBlobUrl(kind === 'image' ? fileId : null, 'display', block.uploaded);
  const whole = useBlobUrl(kind === 'video' || kind === 'pdf' ? fileId : null, 'original', block.uploaded);
  if (!fileId && !block.url) return <EmptyMedia block={block} kind={kind} />;
  const name = block.fileName || (block.url ? fileNameFromUrl(block.url) : t('fichier'));
  const waiting = <div className={`${styles.mediaWaiting} t-meta`} data-outline="frame">{block.uploaded ? t('Chargement…') : t('En cours d’envoi depuis un autre appareil…')}</div>;

  switch (kind) {
    case 'image': {
      const source = fileId ? image : block.url;
      return (
        <figure className={styles.mediaImage}>
          {source ? <img src={source} alt={name} loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} data-outline="frame" /> : waiting}
        </figure>
      );
    }
    case 'video': {
      if (block.url) {
        const frame = videoEmbedUrl(block.url);
        if (frame) return <iframe className={styles.mediaFrame} data-outline="frame" src={frame} title={name} allow="fullscreen; picture-in-picture; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" loading="lazy" />;
        if (isVideoFileUrl(block.url)) return <video className={styles.mediaVideo} src={block.url} controls preload="metadata" />;
        return <AddressCard url={block.url} name={name} icon="video" />;
      }
      return whole ? <video className={styles.mediaVideo} src={whole} controls preload="metadata" /> : waiting;
    }
    case 'pdf':
      if (block.url) return <AddressCard url={block.url} name={name} icon="pdf" />;
      return whole ? <iframe className={styles.mediaPdf} data-outline="frame" src={whole} title={name} /> : waiting;
    default:
      if (block.url) return <AddressCard url={block.url} name={name} icon="file" />;
      return (
        <div className={styles.fileCard} data-outline="frame" data-edge>
          <Icon name="file" size={22} />
          <span className={styles.fileText}>
            <span className="t-body-strong">{name}</span>
            <span className="t-meta">{[formatBytes(block.bytes), block.uploaded ? null : t('pas encore envoyé')].filter(Boolean).join(' · ')}</span>
          </span>
          <Button
            kind="text"
            small
            icon="download"
            onClick={() =>
              void saveBlockFile(fileId!, name).then(saved => {
                if (!saved) showWarning(t('Ce fichier n’est pas disponible pour l’instant.'));
              })
            }
          >
            {t('Télécharger')}
          </Button>
        </div>
      );
  }
}

export const MediaBlock = memo(MediaBlockComponent);
