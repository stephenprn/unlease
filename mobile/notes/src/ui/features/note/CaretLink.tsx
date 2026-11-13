/**
 * The address the caret stands on in a note (the body's `linkAtCaret`, an item's `onLinkAtCaret`), as
 * the first row of the editor's footer: a field cannot open what it holds, so this row does, in the
 * browser (or the app the address belongs to). It draws the footer's edge (`footEdge`), comes and goes
 * with the caret, and its address is cut to one line (no underline: the line may be cut).
 */
import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import { prettyUrl } from '@unlease/core/services/url';
import { SHAPES } from '@unlease/design/shapes';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, footEdge, Icon, Tappable } from '../../components';
import { accelerate, decelerate, duration } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

const ROW_IN = FadeIn.duration(duration.short).easing(decelerate);
const ROW_OUT = FadeOut.duration(duration.short).easing(accelerate);

export function CaretLink({ href }: { readonly href: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const shown = prettyUrl(href, 120);
  const open = (): void => {
    Linking.openURL(href).catch(() => showSnack(t('Couldn’t open this link'), undefined, { tone: 'error' }));
  };
  return (
    <Animated.View entering={ROW_IN} exiting={ROW_OUT} style={styles.foot}>
      <Tappable onPress={open} accessibilityRole="link" accessibilityLabel={t('Open {address}', { address: shown })} style={styles.row}>
        <Icon name="external" size={20} color={theme.color.link} />
        <View style={styles.fill}>
          <AppText variant="label" color={theme.color.link} numberOfLines={1}>
            {shown}
          </AppText>
        </View>
      </Tappable>
    </Animated.View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // The footer's first row: its edge on top, its press 6 in and 2 off the edge, as a list row's.
    foot: { paddingHorizontal: 6, paddingVertical: 2, ...footEdge(theme) },
    // The glyph on the bar's first button's (its centre 28 from the screen's edge).
    row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, paddingRight: 16, ...corners(SHAPES.tab) },
    fill: { flex: 1 },
  });
