/**
 * The only spelling of text in the app: a variant sets family, size and ink role.
 * `color` overrides the ink on coloured fills; `highlight` marks search matches.
 */
import React, { memo } from 'react';
import { Text, type TextProps, type TextStyle, type StyleProp } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { variantStyle, type TextVariant } from '../theme/typography';

export interface AppTextProps extends TextProps {
  readonly variant?: TextVariant;
  readonly color?: string;
  readonly style?: StyleProp<TextStyle>;
  /** Sorted, non-overlapping [start, end) ranges to mark. */
  readonly highlight?: readonly (readonly [number, number])[];
  readonly children?: React.ReactNode;
}

function AppTextComponent({ variant = 'body', color, style, highlight, children, ...rest }: AppTextProps) {
  const theme = useTheme();
  const base = variantStyle(theme, variant);
  let content = children;
  if (highlight && highlight.length > 0 && typeof children === 'string') {
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    highlight.forEach(([start, end], index) => {
      if (start > cursor) parts.push(children.slice(cursor, start));
      // The peach alone, no underline: React Native 0.88 draws underlines by hand and crashes on one
      // that falls past a cut text's last line (a card's match below its "…").
      parts.push(
        <Text key={index} style={{ backgroundColor: theme.color.highlight }}>
          {children.slice(start, end)}
        </Text>,
      );
      cursor = end;
    });
    if (cursor < children.length) parts.push(children.slice(cursor));
    content = parts;
  }
  return (
    <Text {...rest} style={[base, color ? { color } : null, style]}>
      {content}
    </Text>
  );
}

export const AppText = memo(AppTextComponent);
