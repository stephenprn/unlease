/**
 * What the caret stands on in a note (an address: the body's `linkAtCaret`, an item's `onLinkAtCaret`;
 * a mention: the body's `mentionAtCaret`), as a chip in the middle of the editor's bar, where the date
 * or the history's pair sits: a field cannot open what it holds, so this chip does. It takes their
 * place in place, the bar's height and its buttons left where they were, so nothing moves as the
 * caret walks through the words. Its words are cut to one line (no underline: the line may be cut).
 */
import React from 'react';
import { Linking, StyleSheet } from 'react-native';

import { t } from '@unlease/core/i18n';
import { prettyUrl } from '@unlease/core/services/url';
import { withAlpha } from '@unlease/design/color';
import { SHAPES } from '@unlease/design/shapes';
import type { GlyphName } from '@unlease/design/glyphs';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Icon, Tappable } from '../../components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

interface CaretChipProps {
  readonly icon: GlyphName;
  readonly text: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly role?: 'link' | 'button';
}

/** A chip in the bar's middle: a glyph and one line, in the link's ink. */
export function CaretChip({ icon, text, label, onPress, role = 'button' }: CaretChipProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Tappable onPress={onPress} accessibilityRole={role} accessibilityLabel={label} hitSlop={4} style={styles.chip}>
      <Icon name={icon} size={18} color={theme.color.link} />
      <AppText variant="label" color={theme.color.link} numberOfLines={1} style={styles.words}>
        {text}
      </AppText>
    </Tappable>
  );
}

/** The address the caret stands on: a tap away from the browser (or the app the address belongs to). */
export function CaretLink({ href }: { readonly href: string }) {
  const shown = prettyUrl(href, 120);
  const open = (): void => {
    Linking.openURL(href).catch(() => showSnack(t('Couldn’t open this link'), undefined, { tone: 'error' }));
  };
  return <CaretChip icon="external" text={shown} label={t('Open {address}', { address: shown })} onPress={open} role="link" />;
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // 40 high (48 under a finger), as wide as its words up to the bar's middle, the tab's corners and a wash of the link's ink.
    chip: {
      flexShrink: 1,
      minHeight: 40,
      maxWidth: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 12,
      paddingRight: 14,
      backgroundColor: withAlpha(theme.color.link, theme.mode === 'dark' ? 0.12 : 0.08),
      ...corners(SHAPES.tab),
    },
    words: { flexShrink: 1 },
  });
