/**
 * An Immich block (`immich`): an album of the person's Immich, its latest photos and how many more,
 * or photos picked one by one (one shown wide, more as a grid of three). The photos come through the
 * server (the image cache keeps them for offline); the album's name is kept in the block's
 * `fileName` for when Immich cannot be reached. A photo opens full screen; the head opens Immich
 * itself. Nothing chosen yet, it offers the picker (`ImmichSheet`). The web's `ImmichBlock`.
 */
import React, { memo, useEffect, useState } from 'react';
import { Linking, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { create } from 'zustand';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { IMMICH_ALBUM_SHOWN, immichPicturePath, immichPlace, type ImmichAlbumResponse } from '@unlease/core/sync/immich';
import { authHeader } from '@unlease/core/sync/protocol';
import { SHAPES } from '@unlease/design/shapes';
import type { Block } from '@unlease/pages/models/blocks';
import { updateBlock } from '@app/store/pages';
import { fetchImmichAlbum } from '@shared/app/immich';
import type { ImageSource } from '@shared/app/hooks/useImageSource';
import { selectImmichUrl, selectServer, useSettingsStore } from '@shared/app/store/settingsStore';

import { AppText, EmptyLine, Icon, Organic, Tappable } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { ImmichPhoto as Photo } from '@shared/ui/features/immich/ImmichPhoto';
import { ImmichSheet, type ImmichChoice } from './ImmichSheet';
import { MediaViewer } from './MediaViewer';
import { usePageContext } from './PageContext';

const GAP = 6;
const COLUMNS = 3;
const WIDE = 4 / 3;
/** The head's chip reaches a finger's 48. */
const CHIP_SLOP = { top: 11, bottom: 11, left: 4, right: 4 } as const;

/** The Immich block whose picker is open (one just made from « / », or « Change »). */
const usePicking = create<{ readonly block: string | null }>(() => ({ block: null }));

export function pickImmichFor(blockId: string | null): void {
  usePicking.setState({ block: blockId });
}

type AlbumState = { readonly status: 'loading' } | { readonly status: 'failed'; readonly message: string } | { readonly status: 'ready'; readonly album: ImmichAlbumResponse };

function ImmichBlockComponent({ block }: { block: Block }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { page, readOnly } = usePageContext();
  const server = useSettingsStore(selectServer);
  const base = useSettingsStore(selectImmichUrl);
  const picking = usePicking(s => s.block === block.id);
  const album = useAlbum(block.immichAlbumId);
  const [room, setRoom] = useState(0);
  const [open, setOpen] = useState<ImageSource | null>(null);
  const empty = block.immichAlbumId === null && block.immichAssetIds.length === 0;

  const choose = (choice: ImmichChoice): void => {
    pickImmichFor(null);
    if (choice.kind === 'album') updateBlock(page, block.id, { immichAlbumId: choice.album.id, immichAssetIds: [], fileName: choice.album.name });
    else updateBlock(page, block.id, { immichAlbumId: null, immichAssetIds: [...choice.ids], fileName: '' });
  };
  const sheet = readOnly ? null : <ImmichSheet visible={picking} onDismiss={() => pickImmichFor(null)} onChoose={choose} chosen={block.immichAssetIds} />;

  if (empty) {
    return (
      <>
        <Tappable onPress={readOnly ? undefined : () => pickImmichFor(block.id)} disabled={readOnly} outline="panel" style={styles.empty} accessibilityRole="button">
          <Icon name="image" size={24} color={theme.color.inkMuted} />
          <AppText variant="body" style={[styles.fill, styles.muted]}>
            {readOnly ? t('No photos chosen') : t('Choose photos from Immich')}
          </AppText>
        </Tappable>
        {sheet}
      </>
    );
  }

  const ids = block.immichAlbumId ? (album.status === 'ready' ? album.album.assets.map(asset => asset.id).slice(0, IMMICH_ALBUM_SHOWN) : []) : block.immichAssetIds;
  const count = block.immichAlbumId ? (album.status === 'ready' ? album.album.album.count : 0) : ids.length;
  const more = Math.max(0, count - ids.length);
  const title = block.immichAlbumId ? (album.status === 'ready' ? album.album.album.name : block.fileName) || t('Untitled') : plural(ids.length, 'photo');
  const openHref = base ? (block.immichAlbumId ? immichPlace(base, 'album', block.immichAlbumId) : ids.length === 1 ? immichPlace(base, 'asset', ids[0]!) : null) : null;
  const tile = room > 0 ? Math.floor((room - GAP * (COLUMNS - 1)) / COLUMNS) : 0;
  const preview = (id: string): ImageSource | null => (server ? { uri: `${server.url}${immichPicturePath('asset', id, 'preview')}`, headers: authHeader(server.token) } : null);

  return (
    <Organic outline="frame" style={styles.frame}>
      <View style={styles.head}>
        <Icon name="image" size={20} color={theme.color.ink} />
        <AppText variant="bodyStrong" style={styles.fill} numberOfLines={1}>
          {title}
        </AppText>
        {block.immichAlbumId && album.status === 'ready' ? <AppText variant="meta">{plural(count, 'photo')}</AppText> : null}
        {readOnly ? null : (
          <Tappable onPress={() => pickImmichFor(block.id)} hitSlop={CHIP_SLOP} style={styles.chip} accessibilityRole="button">
            <AppText variant="meta">{t('Change')}</AppText>
          </Tappable>
        )}
        {openHref ? (
          <Tappable onPress={() => void Linking.openURL(openHref).catch(() => undefined)} hitSlop={CHIP_SLOP} style={styles.chip} accessibilityRole="link" accessibilityLabel={t('Open in Immich')}>
            <Icon name="external" size={18} color={theme.color.inkMuted} />
          </Tappable>
        ) : null}
      </View>
      <View onLayout={(event: LayoutChangeEvent) => setRoom(Math.round(event.nativeEvent.layout.width))}>
        {!server ? (
          <EmptyLine text={t('Connect a server first')} />
        ) : block.immichAlbumId && album.status === 'failed' ? (
          <EmptyLine text={album.message} glyph="alert" />
        ) : block.immichAlbumId && album.status === 'loading' ? (
          <AppText variant="meta">{t('Reading Immich…')}</AppText>
        ) : ids.length === 0 ? (
          <EmptyLine text={t('This album is empty.')} glyph="image" />
        ) : room === 0 ? null : ids.length === 1 ? (
          <Photo id={ids[0]!} size="preview" width={room} height={Math.round(room / WIDE)} onPress={() => setOpen(preview(ids[0]!))} label={t('See the photo')} />
        ) : (
          <View style={styles.grid}>
            {ids.map((id, index) => (
              <Photo key={id} id={id} size="thumbnail" width={tile} height={tile} onPress={() => setOpen(preview(id))} label={t('See photo {number}', { number: index + 1 })} />
            ))}
            {more > 0 && openHref ? (
              <Tappable onPress={() => void Linking.openURL(openHref).catch(() => undefined)} outline="frame" style={[styles.more, { width: tile, height: tile }]} accessibilityRole="link" accessibilityLabel={t('{photos} more in Immich', { photos: plural(more, 'photo') })}>
                <AppText variant="bodyStrong">{`+${more}`}</AppText>
              </Tappable>
            ) : null}
          </View>
        )}
      </View>
      <MediaViewer source={open} onClose={() => setOpen(null)} />
      {sheet}
    </Organic>
  );
}

export const ImmichBlock = memo(ImmichBlockComponent);

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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    frame: { gap: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: theme.color.paperHigh },
    empty: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 18, backgroundColor: theme.color.paperHigh },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 4, ...corners(SHAPES.chip) },
    fill: { flex: 1 },
    muted: { color: theme.color.inkMuted },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    more: { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.paperHigh },
  });
