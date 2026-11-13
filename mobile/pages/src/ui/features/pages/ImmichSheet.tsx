/**
 * Choosing what an Immich block shows: one of the library's albums, whole, or photos picked one by
 * one among the latest or those a search finds (Immich's smart search). Everything comes through
 * the server, which holds Immich's key. The web's `ImmichPicker`.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { IMMICH_BLOCK_ASSETS, type ImmichAlbum, type ImmichAsset } from '@unlease/core/sync/immich';
import { fetchImmichAlbums, fetchImmichAssets } from '@shared/app/immich';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';

import { AppText, Button, CheckMark, EmptyLine, FormFoot, ListRow, Segmented, Sheet, SheetScroll, TextField } from '@shared/ui/components';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { ImmichPhoto as Photo } from '@shared/ui/features/immich/ImmichPhoto';

export type ImmichChoice = { readonly kind: 'album'; readonly album: ImmichAlbum } | { readonly kind: 'photos'; readonly ids: readonly string[] };

type Tab = 'albums' | 'photos';

type Loaded<T> = { readonly status: 'loading' } | { readonly status: 'failed'; readonly message: string } | { readonly status: 'ready'; readonly value: T };

const GAP = 6;
const COLUMNS = 3;

const failure = (error: unknown): string => (error instanceof Error ? error.message : t('Immich unreachable'));

export function ImmichSheet({ visible, onDismiss, onChoose, chosen: initial }: { visible: boolean; onDismiss: () => void; onChoose: (choice: ImmichChoice) => void; chosen: readonly string[] }) {
  const styles = useThemedStyles(makeStyles);
  const [tab, setTab] = useState<Tab>(initial.length > 0 ? 'photos' : 'albums');
  const [chosen, setChosen] = useState<readonly string[]>(initial);
  const toggle = (id: string): void => setChosen(ids => (ids.includes(id) ? ids.filter(each => each !== id) : ids.length >= IMMICH_BLOCK_ASSETS ? ids : [...ids, id]));
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Photos from Immich')} tall keepsKeyboard>
      <View style={styles.tabs}>
        <Segmented
          label={t('Show')}
          value={tab}
          options={[
            { value: 'albums', label: t('Albums') },
            { value: 'photos', label: t('Photos') },
          ]}
          onChange={setTab}
        />
      </View>
      {visible ? tab === 'albums' ? <Albums onChoose={album => onChoose({ kind: 'album', album })} /> : <Photos chosen={chosen} onToggle={toggle} /> : null}
      {tab === 'photos' ? (
        <FormFoot>
          <Button kind="text" label={t('Cancel')} onPress={onDismiss} />
          <Button label={chosen.length === 0 ? t('Choose photos') : t('Show {photos}', { photos: plural(chosen.length, 'photo') })} disabled={chosen.length === 0} onPress={() => onChoose({ kind: 'photos', ids: chosen })} />
        </FormFoot>
      ) : null}
    </Sheet>
  );
}

function Albums({ onChoose }: { onChoose: (album: ImmichAlbum) => void }) {
  const styles = useThemedStyles(makeStyles);
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
  return (
    <SheetScroll contentContainerStyle={styles.list}>
      {!server ? (
        <EmptyLine text={t('Connect a server first')} />
      ) : albums.status === 'loading' ? (
        <AppText variant="meta" style={styles.pad}>
          {t('Reading Immich…')}
        </AppText>
      ) : albums.status === 'failed' ? (
        <EmptyLine text={albums.message} glyph="alert" />
      ) : albums.value.length === 0 ? (
        <EmptyLine text={t('No albums in Immich yet.')} glyph="image" />
      ) : (
        albums.value.map(album => (
          <ListRow
            key={album.id}
            leading={album.coverId ? <Photo id={album.coverId} size="thumbnail" width={48} height={48} label={album.name} /> : undefined}
            icon={album.coverId ? undefined : 'image'}
            title={album.name || t('Untitled')}
            supporting={plural(album.count, 'photo')}
            onPress={() => onChoose(album)}
          />
        ))
      )}
    </SheetScroll>
  );
}

function Photos({ chosen, onToggle }: { chosen: readonly string[]; onToggle: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const server = useSettingsStore(selectServer);
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [room, setRoom] = useState(0);
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
  const search = (): void => {
    if (typed.trim() === query) return;
    setFound({ status: 'loading' });
    setPage(1);
    setQuery(typed.trim());
  };
  const tile = room > 0 ? Math.floor((room - GAP * (COLUMNS - 1)) / COLUMNS) : 0;

  return (
    <SheetScroll contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <View style={styles.pad}>
        <TextField label={t('Search Immich')} value={typed} onChangeText={setTyped} onSubmitEditing={search} returnKeyType="search" help={t('What the photos show: “beach at sunset”, “birthday cake”…')} />
      </View>
      <View style={styles.pad} onLayout={(event: LayoutChangeEvent) => setRoom(Math.round(event.nativeEvent.layout.width))}>
        {!server ? (
          <EmptyLine text={t('Connect a server first')} />
        ) : found.status === 'loading' ? (
          <AppText variant="meta">{t('Reading Immich…')}</AppText>
        ) : found.status === 'failed' ? (
          <EmptyLine text={found.message} glyph="alert" />
        ) : found.value.assets.length === 0 ? (
          <EmptyLine text={query ? t('No photo shows “{query}”.', { query }) : t('No photos in Immich yet.')} glyph="image" />
        ) : tile === 0 ? null : (
          <View style={styles.grid}>
            {found.value.assets.map(asset => {
              const on = chosen.includes(asset.id);
              return (
                <View key={asset.id} accessibilityState={{ selected: on }}>
                  <Photo id={asset.id} size="thumbnail" width={tile} height={tile} onPress={() => onToggle(asset.id)} label={asset.name || t('Photo')} />
                  {on ? (
                    <View style={styles.check} pointerEvents="none">
                      <CheckMark checked />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
        {found.status === 'ready' && found.value.next ? <Button kind="text" label={t('More photos')} onPress={() => setPage(found.value.next ?? page + 1)} /> : null}
      </View>
    </SheetScroll>
  );
}

const makeStyles = (_theme: Theme) =>
  StyleSheet.create({
    tabs: { paddingHorizontal: 16, paddingBottom: 8 },
    list: { paddingBottom: 16 },
    pad: { paddingHorizontal: 16, gap: 10, paddingTop: 6 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    check: { position: 'absolute', top: 6, right: 6 },
  });
