/**
 * An event's description as it reads: its words (bold, italic, underline kept, never underline on
 * text cut by `numberOfLines`: none here), its mentions as their names now, a tap opening each in its
 * app, its dates relative to today.
 */
import React, { memo } from 'react';
import type { TextStyle } from 'react-native';

import type { Ref } from '@unlease/core/refs';
import { t } from '@unlease/core/i18n';
import { dateShown } from '@unlease/core/services/dates';
import { parseRich } from '@unlease/core/services/richText';
import { nameOf } from '@app/mentionNames';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { fontFamily } from '@shared/ui/theme/typography';

function RichViewComponent({ markup, now, onRef }: { markup: string; now: number; onRef: (target: Ref) => void }) {
  const theme = useTheme();
  const state = useLibraryStore.getState();
  const runs = parseRich(markup);
  return (
    <AppText variant="body" selectable>
      {runs.map((run, index) => {
        if (run.kind === 'mention') {
          const name = nameOf(state, run.target);
          return (
            <AppText key={index} variant="bodyStrong" color={theme.color.link} onPress={() => onRef(run.target)} accessibilityRole="link">
              {name ?? t('Not available here')}
            </AppText>
          );
        }
        if (run.kind === 'date') {
          return (
            <AppText key={index} variant="bodyStrong" color={theme.color.link}>
              {dateShown(run, now)}
            </AppText>
          );
        }
        const style: TextStyle = {
          ...(run.marks.b ? { fontFamily: fontFamily(theme, 'SemiBold') } : {}),
          ...(run.marks.i ? { fontStyle: 'italic' as const } : {}),
          ...(run.marks.u || run.marks.s ? { textDecorationLine: run.marks.u && run.marks.s ? ('underline line-through' as const) : run.marks.u ? ('underline' as const) : ('line-through' as const) } : {}),
        };
        return (
          <AppText key={index} variant="body" style={style}>
            {run.text}
          </AppText>
        );
      })}
    </AppText>
  );
}

export const RichView = memo(RichViewComponent);
