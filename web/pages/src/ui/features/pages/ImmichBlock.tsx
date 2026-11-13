/**
 * An Immich block (`immich`): an album of the person's Immich, its latest photos and how many more,
 * or photos picked one by one (one shown large, more as a grid). The photos come through the server
 * each time the page shows, so the block is Immich as it is now; its `fileName` keeps the album's name
 * for when Immich cannot be reached. A photo opens large, with a link into Immich. Nothing chosen
 * yet, it offers the picker (`ImmichPicker`); Immich not linked, it says so. The phone's ImmichBlock.
 */
import { useEffect, useId, useState } from 'react';
import { create } from 'zustand';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { IMMICH_ALBUM_SHOWN, immichPlace, type ImmichAlbumResponse } from '@unlease/core/sync/immich';
import type { Block } from '@unlease/pages/models/blocks';

import { fetchImmichAlbum } from '@shared/app/immich';
import { selectServerSettings, useServerSettingsStore } from '@shared/app/store/serverSettings';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { Layer } from '@shared/ui/components/Layer';
import { ImmichPicture } from '@shared/ui/features/immich/ImmichPicture';
import immich from '@shared/ui/features/immich/immich.module.css';
import { updateBlock } from '../../../app/store/pages';
import { ImmichPicker, type ImmichChoice } from './ImmichPicker';
import { usePageContext } from './PageContext';
import styles from './pages.module.css';

/** The Immich block whose picker is open (one just made from « / », or « Change »). */
const usePicking = create<{ readonly block: string | null }>(() => ({ block: null }));

export function pickImmichFor(blockId: string | null): void {
  usePicking.setState({ block: blockId });
}

type AlbumState = { readonly status: 'loading' } | { readonly status: 'failed'; readonly message: string } | { readonly status: 'ready'; readonly album: ImmichAlbumResponse };

export function ImmichBlock({ block }: { block: Block }) {
  const { page, readOnly } = usePageContext();
  const settings = useServerSettingsStore(selectServerSettings);
  const base = settings?.immich.url ?? '';
  const picking = usePicking(s => s.block === block.id);
  const setPicking = (open: boolean): void => pickImmichFor(open ? block.id : null);
  const [viewing, setViewing] = useState<number | null>(null);
  const album = useAlbum(block.immichAlbumId);
  const empty = block.immichAlbumId === null && block.immichAssetIds.length === 0;

  const choose = (choice: ImmichChoice): void => {
    setPicking(false);
    if (choice.kind === 'album') updateBlock(page, block.id, { immichAlbumId: choice.album.id, immichAssetIds: [], fileName: choice.album.name });
    else updateBlock(page, block.id, { immichAlbumId: null, immichAssetIds: [...choice.ids], fileName: '' });
  };

  const picker = readOnly ? null : <ImmichPicker open={picking} onDismiss={() => setPicking(false)} onChoose={choose} chosen={block.immichAssetIds} />;

  if (empty) {
    return (
      <>
        {readOnly ? (
          <div className={styles.immichEmpty} data-outline="panel">
            <Icon name="image" size={24} />
            <span className="t-body">{t('No photos chosen')}</span>
          </div>
        ) : (
          <button type="button" className={styles.immichEmpty} data-outline="panel" aria-haspopup="dialog" onClick={() => setPicking(true)}>
            <Icon name="image" size={24} />
            <span className="t-body">{settings && !base ? t('Link Immich in Administration to show its photos here') : t('Choose photos from Immich')}</span>
          </button>
        )}
        {picker}
      </>
    );
  }

  // The photos shown: an album's latest, or those picked.
  const ids = block.immichAlbumId ? (album.status === 'ready' ? album.album.assets.map(asset => asset.id).slice(0, IMMICH_ALBUM_SHOWN) : []) : block.immichAssetIds;
  const count = block.immichAlbumId ? (album.status === 'ready' ? album.album.album.count : 0) : ids.length;
  const more = Math.max(0, count - ids.length);
  const title = block.immichAlbumId ? (album.status === 'ready' ? album.album.album.name : block.fileName) || t('Untitled') : plural(ids.length, 'photo');
  const openHref = base ? (block.immichAlbumId ? immichPlace(base, 'album', block.immichAlbumId) : ids.length === 1 ? immichPlace(base, 'asset', ids[0]!) : null) : null;

  return (
    <section className={styles.immichBlock} data-outline="frame" aria-label={t('Photos from Immich')}>
      <header className={styles.calendarHead}>
        <Icon name="image" size={20} />
        <span className="t-body-strong">{title}</span>
        {block.immichAlbumId && album.status === 'ready' ? <span className="t-meta">{plural(count, 'photo')}</span> : null}
        {readOnly ? null : (
          <button type="button" className={`${styles.calendarPick} t-meta`} aria-haspopup="dialog" onClick={() => setPicking(true)}>
            {t('Change')}
          </button>
        )}
        {openHref ? (
          <a className={`${styles.calendarOpen} t-meta`} href={openHref} target="_blank" rel="noopener noreferrer">
            {t('Open in Immich')}
          </a>
        ) : null}
      </header>
      {settings && !base ? (
        <EmptyLine text={t('Immich is not linked on this server: its photos can’t be shown.')} glyph="image" />
      ) : block.immichAlbumId && album.status === 'failed' ? (
        <EmptyLine text={album.message} glyph="alert" />
      ) : block.immichAlbumId && album.status === 'loading' ? (
        <p className="t-meta">{t('Reading Immich…')}</p>
      ) : ids.length === 0 ? (
        <EmptyLine text={t('This album is empty.')} glyph="image" />
      ) : ids.length === 1 ? (
        <button type="button" className={styles.immichSingle} onClick={() => setViewing(0)} aria-label={t('See the photo')}>
          <ImmichPicture id={ids[0]!} size="preview" className={immich.wide} />
        </button>
      ) : (
        <ul className={immich.grid}>
          {ids.map((id, index) => (
            <li key={id}>
              <button type="button" className={immich.tile} onClick={() => setViewing(index)} aria-label={t('See photo {number}', { number: index + 1 })}>
                <ImmichPicture id={id} />
              </button>
            </li>
          ))}
          {more > 0 && openHref ? (
            <li>
              <a className={`${immich.tile} ${immich.more} t-body-strong`} href={openHref} target="_blank" rel="noopener noreferrer" aria-label={t('{photos} more in Immich', { photos: plural(more, 'photo') })}>
                +{more}
              </a>
            </li>
          ) : null}
        </ul>
      )}
      <Viewer ids={ids} at={viewing} base={base} onMove={setViewing} />
      {picker}
    </section>
  );
}

/** An album's latest photos and its name, asked of the server each time the block shows. */
function useAlbum(id: string | null): AlbumState {
  const server = useSettingsStore(selectServer);
  const [state, setState] = useState<{ key: string; value: AlbumState } | null>(null);
  const key = `${server?.url ?? ''}:${id ?? ''}`;
  useEffect(() => {
    if (!server || !id) return;
    const controller = new AbortController();
    fetchImmichAlbum(server, id, controller.signal).then(
      album => setState({ key, value: { status: 'ready', album } }),
      error => !controller.signal.aborted && setState({ key, value: { status: 'failed', message: error instanceof Error ? error.message : t('Immich unreachable') } }),
    );
    return () => controller.abort();
  }, [server, id, key]);
  if (!server) return { status: 'failed', message: t('Connect a server first') };
  return state?.key === key ? state.value : { status: 'loading' };
}

/** A photo large, the others a step away, and Immich's own page for it. */
function Viewer({ ids, at, base, onMove }: { ids: readonly string[]; at: number | null; base: string; onMove: (at: number | null) => void }) {
  const titleId = useId();
  const id = at === null ? null : (ids[at] ?? null);
  const close = (): void => onMove(null);
  return (
    <Layer open={id !== null} onDismiss={close} labelledBy={titleId} full>
      {id !== null && at !== null ? (
        <DialogFrame
          title={ids.length > 1 ? t('Photo {number} of {count}', { number: at + 1, count: ids.length }) : t('Photo')}
          titleId={titleId}
          onClose={close}
          page
          className={styles.immichViewer}
          foot={
            <>
              <IconButton icon="back" label={t('Previous photo')} disabled={at === 0} onClick={() => onMove(at - 1)} />
              <IconButton icon="chevronRight" label={t('Next photo')} disabled={at >= ids.length - 1} onClick={() => onMove(at + 1)} />
              {base ? (
                <Button kind="text" icon="external" href={immichPlace(base, 'asset', id)}>
                  {t('Open in Immich')}
                </Button>
              ) : null}
            </>
          }
        >
          <ImmichPicture id={id} size="preview" className={immich.wide} alt={t('Photo')} />
        </DialogFrame>
      ) : null}
    </Layer>
  );
}
