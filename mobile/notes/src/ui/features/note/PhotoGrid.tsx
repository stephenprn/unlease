/** A note's photos: one at full width, more in a grid of equal tiles; a tap opens full screen. */
import React, { memo, useState } from 'react';
import { Image, Modal, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseHex } from '@unlease/design/palette';
import { t, tc } from '@unlease/core/i18n';
import { useBlobSource } from '@app/hooks/useImageSource';
import { removeAttachment } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@app/store/uiStore';

import { IconButton, Tappable } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';

function PhotoGridComponent({ noteId, editable }: { noteId: string; editable: boolean }) {
  const ids = useLibraryStore(s => s.attachmentsByNote[noteId]);
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<string | null>(null);
  if (!ids || ids.length === 0) return null;
  const single = ids.length === 1;
  const tile = single ? width : (width - 4) / 2;
  return (
    <View style={styles.grid}>
      {ids.map(id => (
        <Photo key={id} id={id} width={tile} height={single ? Math.round(width * 0.75) : tile} onPress={() => setOpen(id)} />
      ))}
      <Viewer id={open} editable={editable} onClose={() => setOpen(null)} />
    </View>
  );
}

const Photo = memo(function PhotoView({ id, width, height, onPress }: { id: string; width: number; height: number; onPress: () => void }) {
  const source = useBlobSource(id);
  const theme = useTheme();
  return (
    <Tappable onPress={onPress} accessibilityLabel={t('Ouvrir la photo')} style={{ width, height, backgroundColor: theme.color.paperHigh }}>
      {source ? <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
    </Tappable>
  );
});

function Viewer({ id, editable, onClose }: { id: string | null; editable: boolean; onClose: () => void }) {
  const source = useBlobSource(id, 'original');
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  return (
    <Modal visible={id !== null} onRequestClose={onClose} animationType="fade" statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.viewer, { backgroundColor: theme.color.viewer }]}>
        {source ? <Image source={source} style={StyleSheet.absoluteFill} resizeMode="contain" /> : null}
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
                showSnack(t('Photo supprimée'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
              }}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const shade = (hex: string, alpha: number): string => `rgba(${parseHex(hex).join(', ')}, ${alpha})`;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  viewer: { flex: 1 },
  viewerBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 24 },
});

export const PhotoGrid = memo(PhotoGridComponent);
