/** A page's picture full screen, on the viewer's black, as a note's photo opens: pulled down it closes, pinched it zooms (`PictureStage`). */
import React, { memo } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseHex } from '@unlease/design/palette';
import { t } from '@unlease/core/i18n';
import type { ImageSource } from '@shared/app/hooks/useImageSource';

import { IconButton, PictureStage } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

const shade = (hex: string, alpha: number): string => `rgba(${parseHex(hex).join(', ')}, ${alpha})`;

function MediaViewerComponent({ source, onClose }: { source: ImageSource | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  return (
    <Modal visible={source !== null} onRequestClose={onClose} animationType="fade" transparent statusBarTranslucent navigationBarTranslucent>
      <PictureStage source={source} backdrop={theme.color.viewer} onClose={onClose}>
        {/* The viewer's own black, fading down from the top, so the control reads over a light picture. */}
        <View style={[styles.bar, { paddingTop: insets.top, backgroundImage: `linear-gradient(to bottom, ${shade(theme.color.viewer, 0.55)}, ${shade(theme.color.viewer, 0)})` }]}>
          {/* Where the page's own back button stood, in a top bar's 64. */}
          <View style={styles.row}>
            <IconButton icon="back" label={t('Close')} onDark onPress={onClose} />
          </View>
        </View>
      </PictureStage>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 16 },
  row: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
});

export const MediaViewer = memo(MediaViewerComponent);
