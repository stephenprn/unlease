/**
 * A picture, a video, a PDF or a file in a page, on the phone: uploaded (kept on this phone until
 * the server has it) or shown from its address. A picture lies in its frame at its own proportion
 * and opens full screen; a video site's address opens in its own app; a file shows its name and
 * size. Empty, it offers the system's picker or an address. The address sheet lives once at the
 * page's root (`MediaHost`), as sheets must.
 */
import React, { memo, useState } from 'react';
import { Image, Linking, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { create } from 'zustand';

import type { GlyphName } from '@unlease/design/glyphs';
import { parseHex } from '@unlease/design/palette';
import { t, tx } from '@unlease/core/i18n';
import type { Block, MediaKind } from '@unlease/notes/models/blocks';
import { fileNameFromUrl, videoEmbedUrl } from '@unlease/notes/services/media';
import { displayHost, extractUrls, isHttpUrl } from '@unlease/core/services/url';
import { useBlobSource, type ImageSource } from '@app/hooks/useImageSource';
import { attachPickedDocument, attachPickedImage } from '@app/pageFiles';
import { setMediaUrl } from '@app/store/pages';
import { showSnack } from '@app/store/uiStore';

import { AppText, Button, Grain, Icon, Organic, Sheet, Tappable, TextField } from '../../components';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { MediaViewer } from './MediaViewer';
import { usePageContext } from './PageContext';
import { formatBytes } from '@unlease/core/services/format';

/** A picture stands at most this high in the page; it narrows to keep its proportion. */
const MAX_HEIGHT = 360;
/** Until its size is known. */
const DEFAULT_RATIO = 4 / 3;

const WORDS: Record<MediaKind, { readonly add: string; readonly pick: string; readonly icon: GlyphName }> = {
  image: { add: tx('Ajouter une image'), pick: tx('Choisir une photo'), icon: 'image' },
  video: { add: tx('Ajouter une vidéo'), pick: tx('Choisir une vidéo'), icon: 'video' },
  pdf: { add: tx('Ajouter un PDF'), pick: tx('Choisir un PDF'), icon: 'pdf' },
  file: { add: tx('Ajouter un fichier'), pick: tx('Choisir un fichier'), icon: 'file' },
};

// ── the address sheet, mounted once at the page's root ────────────────────

interface AddressRequest {
  readonly page: string;
  readonly blockId: string;
  readonly kind: MediaKind;
}

const useAddressStore = create<{ readonly request: AddressRequest | null }>(() => ({ request: null }));

function askAddress(request: AddressRequest): void {
  useAddressStore.setState({ request });
}

const ADDRESS_HINTS: Record<MediaKind, string> = {
  image: tx('L’adresse d’une image (https://…).'),
  video: tx('Une vidéo YouTube, Vimeo, Dailymotion, ou l’adresse d’un fichier vidéo.'),
  pdf: tx('L’adresse d’un PDF (https://…).'),
  file: tx('L’adresse d’un fichier (https://…).'),
};

/** The sheet that takes an address for a media block: mount it once at the page screen's root. */
export function MediaHost() {
  const styles = useThemedStyles(makeStyles);
  const request = useAddressStore(s => s.request);
  // Kept while the sheet leaves, so its words do not change on the way out.
  const [shown, setShown] = useState<AddressRequest | null>(request);
  if (request && request !== shown) setShown(request);
  const [address, setAddress] = useState('');
  const close = () => {
    useAddressStore.setState({ request: null });
    setAddress('');
  };
  const embed = () => {
    if (!request) return;
    const url = extractUrls(address)[0];
    if (!url) {
      showSnack(t('Ce n’est pas une adresse'), undefined, { tone: 'error' });
      return;
    }
    setMediaUrl(request.page, request.blockId, url, fileNameFromUrl(url));
    close();
  };
  return (
    <Sheet visible={request !== null} onDismiss={close} title={t('Coller une adresse')}>
      <View style={styles.addressBody}>
        <TextField
          value={address}
          onChangeText={setAddress}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
          returnKeyType="done"
          onSubmitEditing={embed}
          placeholder="https://…"
          accessibilityLabel={t('Adresse à intégrer')}
          help={shown ? t(ADDRESS_HINTS[shown.kind]) : undefined}
        />
        <Button kind="filled" label={t('Intégrer')} icon="link" onPress={embed} disabled={!address.trim()} style={styles.addressButton} />
      </View>
    </Sheet>
  );
}

/** Right after a media block is made from the insert sheet: the system's picker for its kind. */
export function pickAndAttach(page: string, blockId: string, kind: MediaKind): void {
  const picking = kind === 'image' ? attachPickedImage(page, blockId) : attachPickedDocument(page, blockId, kind);
  picking
    .then(outcome => {
      if (outcome.status === 'error') showSnack(t(outcome.message), undefined, { tone: 'error' });
    })
    .catch(() => showSnack(t('Impossible d’ajouter ce fichier'), undefined, { tone: 'error' }));
}

// ── the block ─────────────────────────────────────────────────────────────

function EmptyMedia({ block, kind }: { block: Block; kind: MediaKind }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { page, readOnly } = usePageContext();
  const words = WORDS[kind];
  return (
    <Organic outline="panel" style={styles.empty}>
      <View style={styles.emptyHead}>
        <Icon name={words.icon} size={24} color={theme.color.inkMuted} />
        <AppText variant="body" color={theme.color.inkMuted} style={styles.flex}>
          {t(words.add)}
        </AppText>
      </View>
      {readOnly ? null : (
        <View style={styles.emptyActions}>
          <Button kind="tonal" label={t(words.pick)} icon="upload" onPress={() => pickAndAttach(page, block.id, kind)} />
          <Button kind="text" label={t('Coller une adresse')} icon="link" onPress={() => askAddress({ page, blockId: block.id, kind })} />
        </View>
      )}
    </Organic>
  );
}

/** A well where a picture or a file will be. */
function Waiting({ text }: { text: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Organic outline="frame" style={styles.waiting}>
      <AppText variant="meta">{text}</AppText>
    </Organic>
  );
}

function ImageMedia({ block }: { block: Block }) {
  const styles = useThemedStyles(makeStyles);
  const blob = useBlobSource(block.fileId);
  const whole = useBlobSource(block.fileId, 'original');
  const [room, setRoom] = useState(0);
  const [loaded, setLoaded] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<ImageSource | null>(null);
  // A file from another device shows once the server has it; this phone's own copy shows at once.
  const local = !!blob && blob.uri.startsWith('file://');
  const source: ImageSource | null = block.fileId ? (local || block.uploaded ? blob : null) : block.url ? { uri: block.url } : null;
  const name = block.fileName || (block.url ? fileNameFromUrl(block.url) : 'image');
  const ratio = block.width > 0 && block.height > 0 ? block.width / block.height : (loaded ?? DEFAULT_RATIO);
  const width = room > 0 ? Math.min(room, MAX_HEIGHT * ratio) : 0;
  const onLayout = (event: LayoutChangeEvent) => setRoom(Math.round(event.nativeEvent.layout.width));

  if (!source || failed) {
    const text = failed ? t('Image indisponible') : block.fileId && !block.uploaded ? t('En cours d’envoi depuis un autre appareil…') : t('Image indisponible sans serveur');
    return <Waiting text={text} />;
  }
  return (
    <View onLayout={onLayout}>
      {width > 0 ? (
        <Organic outline="frame" style={[styles.picture, { width, height: Math.round(width / ratio) }]}>
          <Tappable onPress={() => setOpen(block.fileId ? (local || block.uploaded ? whole : source) : source)} accessibilityRole="imagebutton" accessibilityLabel={t('Ouvrir l’image {name}', { name })} style={StyleSheet.absoluteFill}>
            <Image
              source={source}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
              onLoad={event => {
                const { width: w, height: h } = event.nativeEvent.source;
                if (w > 0 && h > 0) setLoaded(w / h);
              }}
              onError={() => setFailed(true)}
            />
          </Tappable>
        </Organic>
      ) : null}
      <MediaViewer source={open} onClose={() => setOpen(null)} />
    </View>
  );
}

const openAddress = (url: string) => {
  if (!isHttpUrl(url)) {
    showSnack(t('Impossible d’ouvrir cette adresse'), undefined, { tone: 'error' });
    return;
  }
  Linking.openURL(url).catch(() => showSnack(t('Impossible d’ouvrir cette adresse'), undefined, { tone: 'error' }));
};

/** A video site's player cannot live in the page: its frame, to open the video where it plays. */
function VideoCard({ url }: { url: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const site = displayHost(url);
  return (
    <Organic outline="frame" style={[styles.video, { backgroundColor: theme.color.viewer }]}>
      <Tappable onDark onPress={() => openAddress(url)} accessibilityRole="link" accessibilityLabel={t('Lire la vidéo sur {site}', { site })} style={styles.videoPress}>
        <Organic pebble={1} style={styles.play}>
          <Icon name="play" size={28} color={theme.color.onSlip} />
        </Organic>
        <View style={styles.videoFoot}>
          <AppText variant="labelSmall" color={theme.color.onSlip} numberOfLines={1} style={styles.flex}>
            {site}
          </AppText>
          <Icon name="external" size={16} color={theme.color.onSlipMuted} />
        </View>
      </Tappable>
    </Organic>
  );
}

/** A file's card: its kind, its name, a second line, and what a press does. */
function FileCard({ icon, name, detail, trailing, onPress, label }: { icon: GlyphName; name: string; detail: string; trailing: GlyphName | null; onPress: () => void; label: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Organic outline="frame" style={styles.fileCard}>
      <Grain />
      <Tappable onPress={onPress} accessibilityLabel={label} style={styles.filePress}>
        <Icon name={icon} size={24} color={theme.color.inkMuted} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {name}
          </AppText>
          <AppText variant="meta" numberOfLines={1}>
            {detail}
          </AppText>
        </View>
        {trailing ? <Icon name={trailing} size={18} color={theme.color.inkMuted} /> : null}
      </Tappable>
    </Organic>
  );
}

const KIND_GLYPHS: Record<MediaKind, GlyphName> = { image: 'image', video: 'video', pdf: 'pdf', file: 'file' };

function MediaBlockComponent({ block }: { block: Block }) {
  const kind = block.kind as MediaKind;
  if (!block.fileId && !block.url) return <EmptyMedia block={block} kind={kind} />;
  if (kind === 'image') return <ImageMedia block={block} />;
  const name = block.fileName || (block.url ? fileNameFromUrl(block.url) : t('fichier'));
  if (block.url) {
    const url = block.url;
    if (kind === 'video' && videoEmbedUrl(url)) return <VideoCard url={url} />;
    return <FileCard icon={KIND_GLYPHS[kind]} name={name} detail={displayHost(url)} trailing="external" onPress={() => openAddress(url)} label={t('Ouvrir {name}', { name })} />;
  }
  // The server keeps a page's files behind the device's token: the phone shows them, the web opens them.
  const detail = [formatBytes(block.bytes), block.uploaded ? null : t('pas encore envoyé')].filter(Boolean).join(' · ');
  return (
    <FileCard
      icon={KIND_GLYPHS[kind]}
      name={name}
      detail={detail}
      trailing={null}
      onPress={() => showSnack(t('Ce fichier s’ouvre depuis la version web, pour l’instant.'))}
      label={`${name}, ${detail}`}
    />
  );
}

export const MediaBlock = memo(MediaBlockComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    empty: { backgroundColor: theme.color.paperHigh, paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
    emptyHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
    emptyActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginLeft: -6 },
    waiting: { backgroundColor: theme.color.paperHigh, paddingVertical: 28, paddingHorizontal: 16, alignItems: 'center' },
    picture: { overflow: 'hidden', backgroundColor: theme.color.paperHigh },
    video: { aspectRatio: 16 / 9, overflow: 'hidden' },
    videoPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    // The play mark on its pebble, a veil of the cream ink: nothing else lies behind a glyph.
    play: { width: 64, height: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: `rgba(${parseHex(theme.color.onSlip).join(', ')}, 0.16)` },
    videoFoot: { position: 'absolute', left: 14, right: 12, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
    fileCard: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card, overflow: 'hidden' },
    filePress: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingLeft: 14, paddingRight: 14, paddingVertical: 10 },
    addressBody: { gap: 16, paddingHorizontal: 8, paddingBottom: 16 },
    addressButton: { alignSelf: 'flex-end' },
  });
