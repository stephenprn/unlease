/** One Immich picture through the server (a photo, or a person's face on its pebble), in its frame; the image glyph where it cannot be had. */
import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useImmichSource } from '@shared/app/immich';

import { Icon, Organic, Tappable } from '../../components';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

export function ImmichPhoto({ id, size, width, height, onPress, label, kind = 'asset', round }: { id: string; size: 'thumbnail' | 'preview'; width: number; height: number; onPress?: () => void; label: string; kind?: 'asset' | 'person'; round?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const source = useImmichSource(kind, id, size);
  const [failed, setFailed] = useState(false);
  return (
    <Organic outline={round ? undefined : 'frame'} pebble={round ? 0 : undefined} style={[styles.photo, { width, height }]}>
      <Tappable onPress={onPress} disabled={!onPress} accessibilityRole="imagebutton" accessibilityLabel={label} style={StyleSheet.absoluteFill}>
        {source && !failed ? (
          <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors onError={() => setFailed(true)} />
        ) : (
          <View style={styles.missing}>
            <Icon name="image" size={22} color={theme.color.inkMuted} />
          </View>
        )}
      </Tappable>
    </Organic>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    photo: { overflow: 'hidden', backgroundColor: theme.color.paperHigh },
    missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
