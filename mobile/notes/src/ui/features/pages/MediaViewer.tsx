/** A page's picture full screen, on the viewer's black, as a note's photo opens. */
import React, { memo } from 'react';
import { Image, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseHex } from '@unlease/design/palette';
import { t } from '@unlease/core/i18n';
import type { ImageSource } from '@app/hooks/useImageSource';

import { IconButton } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';

const shade = (hex: string, alpha: number): string => `rgba(${parseHex(hex).join(', ')}, ${alpha})`;

function MediaViewerComponent({ source, onClose }: { source: ImageSource | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  return (
    <Modal visible={source !== null} onRequestClose={onClose} animationType="fade" statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.viewer, { backgroundColor: theme.color.viewer }]}>
        {source ? <Image source={source} style={StyleSheet.absoluteFill} resizeMode="contain" /> : null}
        {/* The viewer's own black, fading down from the top, so the control reads over a light picture. */}
        <View style={[styles.bar, { paddingTop: insets.top, backgroundImage: `linear-gradient(to bottom, ${shade(theme.color.viewer, 0.55)}, ${shade(theme.color.viewer, 0)})` }]}>
          <IconButton icon="back" label={t('Fermer')} onDark onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', paddingHorizontal: 4, paddingBottom: 24 },
});

export const MediaViewer = memo(MediaViewerComponent);
