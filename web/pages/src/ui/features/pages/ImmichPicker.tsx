/**
 * Choosing what an Immich block shows (`immich`): one of the library's albums, whole (its latest
 * photos, as it grows), or photos picked one by one among the latest or those a search finds
 * (Immich's smart search, when its machine learning runs). Everything comes through the server,
 * which holds Immich's key. The phone's ImmichSheet.
 */
import { useEffect, useId, useState, type FormEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { IMMICH_BLOCK_ASSETS, type ImmichAlbum, type ImmichAsset } from '@unlease/core/sync/immich';

import { fetchImmichAlbums, fetchImmichAssets } from '@shared/app/immich';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { Button } from '@shared/ui/components/Button';
import { CheckMark } from '@shared/ui/components/Checkbox';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { Icon } from '@shared/ui/components/Icon';
import { Layer } from '@shared/ui/components/Layer';
import { Segmented } from '@shared/ui/components/Segmented';
import { TextField } from '@shared/ui/components/TextField';
import { ImmichPicture } from '@shared/ui/features/immich/ImmichPicture';
import immich from '@shared/ui/features/immich/immich.module.css';
import styles from './pages.module.css';

export type ImmichChoice = { readonly kind: 'album'; readonly album: ImmichAlbum } | { readonly kind: 'photos'; readonly ids: readonly string[] };

type Tab = 'albums' | 'photos';

type Loaded<T> = { readonly status: 'loading' } | { readonly status: 'failed'; readonly message: string } | { readonly status: 'ready'; readonly value: T };

const failure = (error: unknown): string => (error instanceof Error ? error.message : t('Immich unreachable'));

export function ImmichPicker({ open, onDismiss, onChoose, chosen }: { open: boolean; onDismiss: () => void; onChoose: (choice: ImmichChoice) => void; chosen?: readonly string[] }) {
  const titleId = useId();
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <PickerBody titleId={titleId} onDismiss={onDismiss} onChoose={onChoose} chosen={chosen ?? []} />
    </Layer>
  );
}

function PickerBody({ titleId, onDismiss, onChoose, chosen: initial }: { titleId: string; onDismiss: () => void; onChoose: (choice: ImmichChoice) => void; chosen: readonly string[] }) {
  const [tab, setTab] = useState<Tab>(initial.length > 0 ? 'photos' : 'albums');
  const [chosen, setChosen] = useState<readonly string[]>(initial);
  const toggle = (id: string): void => setChosen(ids => (ids.includes(id) ? ids.filter(each => each !== id) : ids.length >= IMMICH_BLOCK_ASSETS ? ids : [...ids, id]));
  const foot =
    tab === 'photos' ? (
      <>
        <Button kind="text" onClick={onDismiss}>
          {t('Cancel')}
        </Button>
        <Button disabled={chosen.length === 0} onClick={() => onChoose({ kind: 'photos', ids: chosen })}>
          {chosen.length === 0 ? t('Choose photos') : t('Show {photos}', { photos: plural(chosen.length, 'photo') })}
        </Button>
      </>
    ) : undefined;
  return (
    <DialogFrame title={t('Photos from Immich')} titleId={titleId} onClose={onDismiss} foot={foot} className={styles.immichPicker}>
      <Segmented
        label={t('Show')}
        value={tab}
        options={[
          { value: 'albums', label: t('Albums') },
          { value: 'photos', label: t('Photos') },
        ]}
        onChange={setTab}
      />
      {tab === 'albums' ? <Albums onChoose={album => onChoose({ kind: 'album', album })} /> : <Photos chosen={chosen} onToggle={toggle} />}
    </DialogFrame>
  );
}

function Albums({ onChoose }: { onChoose: (album: ImmichAlbum) => void }) {
  const server = useSettingsStore(selectServer);
  const [albums, setAlbums] = useState<Loaded<readonly ImmichAlbum[]>>({ status: 'loading' });
  useEffect(() => {
    if (!server) return;
    const controller = new AbortController();
    fetchImmichAlbums(server, controller.signal).then(
      value => setAlbums({ status: 'ready', value }),
      error => !controller.signal.aborted && setAlbums({ status: 'failed', message: failure(error) }),
    );
    return () => controller.abort();
  }, [server]);
  if (!server) return <EmptyLine text={t('Connect a server first')} />;
  if (albums.status === 'loading') return <p className="t-meta">{t('Reading Immich…')}</p>;
  if (albums.status === 'failed') return <EmptyLine text={albums.message} glyph="alert" />;
  if (albums.value.length === 0) return <EmptyLine text={t('No albums in Immich yet.')} glyph="image" />;
  return (
    <ul className={`${immich.grid} ${styles.immichAlbums}`}>
      {albums.value.map(album => (
        <li key={album.id} className={styles.immichAlbum}>
          <button type="button" className={immich.tile} onClick={() => onChoose(album)} aria-label={`${album.name || t('Untitled')}, ${plural(album.count, 'photo')}`}>
            {album.coverId ? <ImmichPicture id={album.coverId} /> : <Icon name="image" size={24} />}
          </button>
          <span className="t-body-strong">{album.name || t('Untitled')}</span>
          <span className="t-meta">{plural(album.count, 'photo')}</span>
        </li>
      ))}
    </ul>
  );
}

function Photos({ chosen, onToggle }: { chosen: readonly string[]; onToggle: (id: string) => void }) {
  const server = useSettingsStore(selectServer);
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [found, setFound] = useState<Loaded<{ assets: readonly ImmichAsset[]; next: number | null }>>({ status: 'loading' });
  useEffect(() => {
    if (!server) return;
    const controller = new AbortController();
    fetchImmichAssets(server, { page, query }, controller.signal).then(
      value => setFound(before => ({ status: 'ready', value: { assets: page > 1 && before.status === 'ready' ? [...before.value.assets, ...value.assets] : value.assets, next: value.next } })),
      error => !controller.signal.aborted && setFound({ status: 'failed', message: failure(error) }),
    );
    return () => controller.abort();
  }, [server, page, query]);

  const search = (event: FormEvent): void => {
    event.preventDefault();
    if (typed.trim() === query) return;
    setFound({ status: 'loading' });
    setPage(1);
    setQuery(typed.trim());
  };

  return (
    <>
      <form onSubmit={search} role="search">
        <TextField label={t('Search Immich')} value={typed} onChange={setTyped} enterKeyHint="search" help={t('What the photos show: “beach at sunset”, “birthday cake”…')} />
      </form>
      {!server ? (
        <EmptyLine text={t('Connect a server first')} />
      ) : found.status === 'loading' ? (
        <p className="t-meta">{t('Reading Immich…')}</p>
      ) : found.status === 'failed' ? (
        <EmptyLine text={found.message} glyph="alert" />
      ) : found.value.assets.length === 0 ? (
        <EmptyLine text={query ? t('No photo shows “{query}”.', { query }) : t('No photos in Immich yet.')} glyph="image" replayKey={query} />
      ) : (
        <>
          <ul className={immich.grid}>
            {found.value.assets.map(asset => {
              const on = chosen.includes(asset.id);
              return (
                <li key={asset.id}>
                  <button type="button" className={immich.tile} data-chosen={on || undefined} aria-pressed={on} aria-label={asset.name || t('Photo')} onClick={() => onToggle(asset.id)}>
                    <ImmichPicture id={asset.id} />
                    {asset.video ? (
                      <span className={immich.badge} aria-hidden="true">
                        <Icon name="play" size={14} />
                      </span>
                    ) : null}
                    {on ? <CheckMark checked className={immich.check} /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {found.value.next ? (
            <Button kind="text" onClick={() => setPage(found.value.next ?? page + 1)}>
              {t('More photos')}
            </Button>
          ) : null}
        </>
      )}
    </>
  );
}
