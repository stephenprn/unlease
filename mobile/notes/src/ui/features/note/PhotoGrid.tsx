/**
 * A note's photos, as the web's: one at full width in its own proportion (420 high at most), more in a
 * grid of equal square tiles (three across from five). A tap opens it full screen, on black, held as
 * Google Photos holds one (`PictureStage`: pulled down it closes, pinched it zooms, swiped it turns),
 * with the previous and the next a tap away too; the corner × deletes it (with "Annuler"), on a slip
 * so it reads on any picture in either theme.
 */
import React, { memo, useState } from 'react';
import { Image, Modal, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseHex } from '@unlease/design/palette';
import { t, tc } from '@unlease/core/i18n';
import { useBlobSource } from '@shared/app/hooks/useImageSource';
import { removeAttachment } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';

import { IconButton, PictureStage, Tappable } from '../../components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

/** A single photo stands no taller than this (the web's `max-height`). */
const SINGLE_MAX = 420;
const GAP = 4;

const removed = (undo: () => void) => showSnack(t('Photo supprimée'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });

function PhotoGridComponent({ noteId, editable }: { noteId: string; editable: boolean }) {
  const ids = useLibraryStore(s => s.attachmentsByNote[noteId]);
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<number | null>(null);
  if (!ids || ids.length === 0) return null;
  const single = ids.length === 1;
  const columns = ids.length >= 5 ? 3 : 2;
  const tile = single ? width : (width - GAP * (columns - 1)) / columns;
  return (
    <View style={styles.grid}>
      {ids.map((id, index) => (
        <Photo key={id} id={id} width={tile} single={single} editable={editable} onPress={() => setOpen(index)} />
      ))}
      <Viewer ids={ids} index={open} editable={editable} onIndex={setOpen} />
    </View>
  );
}

const Photo = memo(function PhotoView({ id, width, single, editable, onPress }: { id: string; width: number; single: boolean; editable: boolean; onPress: () => void }) {
  const source = useBlobSource(id);
  const theme = useTheme();
  const ratio = useLibraryStore(s => {
    const attachment = s.attachments[id];
    return attachment && attachment.width > 0 && attachment.height > 0 ? attachment.width / attachment.height : null;
  });
  // Alone, the photo keeps its own proportion; in a grid, every tile is square.
  const height = single ? Math.min(SINGLE_MAX, Math.round(ratio ? width / ratio : width * 0.75)) : width;
  return (
    <View style={{ width, height }}>
      <Tappable onPress={onPress} accessibilityLabel={t('Ouvrir la photo')} style={[StyleSheet.absoluteFill, { backgroundColor: theme.color.paperHigh }]}>
        {source ? <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      </Tappable>
      {editable ? (
        <IconButton
          icon="close"
          label={t('Supprimer la photo')}
          onDark
          size={18}
          shape={1}
          style={[styles.remove, { backgroundColor: theme.color.slip }]}
          onPress={() => removed(removeAttachment(id))}
        />
      ) : null}
    </View>
  );
});

function Viewer({ ids, index, editable, onIndex }: { ids: readonly string[]; index: number | null; editable: boolean; onIndex: (index: number | null) => void }) {
  const id = index !== null ? (ids[index] ?? null) : null;
  const source = useBlobSource(id, 'original');
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const onClose = () => onIndex(null);
  return (
    <Modal visible={id !== null} onRequestClose={onClose} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent>
      <PictureStage
        source={source}
        backdrop={theme.color.viewer}
        onClose={onClose}
        onPrevious={index !== null && index > 0 ? () => onIndex(index - 1) : undefined}
        onNext={index !== null && index < ids.length - 1 ? () => onIndex(index + 1) : undefined}
      >
        {/* The viewer's own black, fading down from the top, so the controls read over a light photo. */}
        <View style={[styles.viewerBar, { paddingTop: insets.top, backgroundImage: `linear-gradient(to bottom, ${shade(theme.color.viewer, 0.55)}, ${shade(theme.color.viewer, 0)})` }]}>
          <IconButton icon="back" label={t('Fermer')} onDark onPress={onClose} />
          {editable && id ? (
            <IconButton
              icon="trash"
              label={t('Supprimer la photo')}
              onDark
              onPress={() => {
                const undo = removeAttachment(id);
                onClose();
                removed(undo);
              }}
            />
          ) : null}
        </View>
        {/* The other photos of the note, on either side, on the slip so they read over any picture (a swipe does the same). */}
        {index !== null && index > 0 ? (
          <IconButton icon="back" label={t('Photo précédente')} onDark shape={2} style={[styles.nav, styles.prev, { backgroundColor: theme.color.slip }]} onPress={() => onIndex(index - 1)} />
        ) : null}
        {index !== null && index < ids.length - 1 ? (
          // The mirror of the previous one's arrow.
          <IconButton icon="arrowRight" label={t('Photo suivante')} onDark shape={3} style={[styles.nav, styles.next, { backgroundColor: theme.color.slip }]} onPress={() => onIndex(index + 1)} />
        ) : null}
      </PictureStage>
    </Modal>
  );
}

const shade = (hex: string, alpha: number): string => `rgba(${parseHex(hex).join(', ')}, ${alpha})`;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  remove: { position: 'absolute', top: 4, right: 4 },
  nav: { position: 'absolute', top: '50%', marginTop: -24 },
  prev: { left: 8 },
  next: { right: 8 },
  viewerBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 24 },
});

export const PhotoGrid = memo(PhotoGridComponent);
