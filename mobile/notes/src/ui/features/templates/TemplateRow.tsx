/**
 * The templates' rows, on a list row's anatomy (`ListRow`: 56 high, inset 6, the glyph in a 24 slot
 * 16 in, the words at 56): a field's name in body strong over its type and hint on one line, a « new »
 * row in link ink, an action that cannot be done now in the second ink, a problem said under the name
 * by its glyph and in danger ink.
 */
import React, { memo } from 'react';
import { StyleSheet, View, type AccessibilityRole, type AccessibilityState } from 'react-native';

import type { GlyphName } from '@unlease/design/glyphs';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';

import { AppText, Icon, Tappable } from '../../components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

export interface TemplateRowProps {
  readonly icon: GlyphName;
  readonly title: string;
  readonly meta?: string;
  /** The name of what the row holds (a field), in body strong. */
  readonly strong?: boolean;
  /** One line of meta at most (a field's type and hint). */
  readonly metaLine?: boolean;
  /** A row that makes something (« Nouveau modèle »): its glyph and words in link ink. */
  readonly adds?: boolean;
  readonly danger?: boolean;
  /** Nothing to do now (« Monter » on the first field): the second ink, no press. */
  readonly disabled?: boolean;
  readonly error?: string | null;
  /** It opens a screen: a chevron at its end. */
  readonly chevron?: boolean;
  readonly trailing?: React.ReactNode;
  readonly onPress?: () => void;
  readonly accessibilityRole?: AccessibilityRole;
  readonly accessibilityState?: AccessibilityState;
}

function TemplateRowComponent({ icon, title, meta, strong, metaLine, adds, danger, disabled, error, chevron, trailing, onPress, accessibilityRole, accessibilityState }: TemplateRowProps) {
  const theme = useTheme();
  const ink = disabled ? theme.color.inkMuted : danger ? theme.color.danger : adds ? theme.color.link : theme.color.ink;
  const body = (
    <>
      <Icon name={icon} size={24} color={ink} />
      <View style={styles.text}>
        <AppText variant={strong ? 'bodyStrong' : 'body'} color={ink} numberOfLines={strong ? 2 : undefined}>
          {title}
        </AppText>
        {error ? (
          <View style={styles.problem}>
            <View style={styles.problemGlyph}>
              <Icon name="error" size={16} color={theme.color.danger} />
            </View>
            <AppText variant="meta" color={theme.color.danger} style={styles.fill}>
              {error}
            </AppText>
          </View>
        ) : meta ? (
          <AppText variant="meta" numberOfLines={metaLine ? 1 : undefined}>
            {meta}
          </AppText>
        ) : null}
      </View>
      {trailing}
      {chevron ? <Icon name="chevronRight" size={20} color={theme.color.inkMuted} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      ownDisabled
      accessibilityLabel={title}
      accessibilityValue={error || meta ? { text: error ?? meta } : undefined}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityState={disabled ? { ...accessibilityState, disabled: true } : accessibilityState}
      style={styles.row}
    >
      {body}
    </Tappable>
  );
}

export const TemplateRow = memo(TemplateRowComponent);

const styles = StyleSheet.create({
  // `ListRow`'s, number for number: its press stays inside the panel or sheet it lists in.
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 6, marginVertical: GEOMETRY.rowGap / 2, paddingHorizontal: 10, paddingVertical: 8, ...corners(SHAPES.tab) },
  text: { flex: 1, gap: 2 },
  problem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  problemGlyph: { marginTop: 1 },
  fill: { flex: 1 },
});
