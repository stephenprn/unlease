/**
 * A calendar subscribed to, by its colour: a small stone of its pigment, as an event of it wears at
 * the head of its page. A label wears its tag; a calendar is never one, so it never wears a tag.
 */
import React, { memo } from 'react';

import type { LineColor } from '@unlease/design/colors';
import { pebbleTurnOf } from '@unlease/design/pebbles';

import { Organic } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

function FeedStoneComponent({ id, color, size = 20 }: { id: string; color: LineColor; size?: number }) {
  const theme = useTheme();
  return (
    <Organic
      pebble={pebbleTurnOf(id)}
      style={{ width: size, height: Math.round(size * 0.92), backgroundColor: theme.line[color].fill }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export const FeedStone = memo(FeedStoneComponent);
