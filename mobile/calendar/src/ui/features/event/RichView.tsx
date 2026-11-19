/**
 * An event's description as it reads: its words (bold, italic, underline kept, never underline on
 * text cut by `numberOfLines`: none here), its mentions as their names now, a tap opening each in its
 * app, its dates relative to today, each address written in it (`linksInText`: a description imported
 * or subscribed to holds them bare) in the link's ink, underlined, a tap opening it.
 */
import React, { memo } from 'react';
import { Linking, type TextStyle } from 'react-native';

import type { Ref } from '@unlease/core/refs';
import { t } from '@unlease/core/i18n';
import { dateShown } from '@unlease/core/services/dates';
import { parseRich } from '@unlease/core/services/richText';
import { linksInText, safeLink } from '@unlease/core/services/url';
import { later } from '@app/later';
import { nameOf } from '@app/mentionNames';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { fontFamily } from '@shared/ui/theme/typography';

/** What an address may open from here: the web, mail or a telephone number, never another app's scheme or a path. */
function openable(href: string): string | null {
  const address = safeLink(href);
  return address && !address.startsWith('/') ? address : null;
}

function open(href: string): void {
  later(Linking.openURL(href));
}

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
        const linkStyle: TextStyle = { ...style, color: theme.color.link, textDecorationLine: run.marks.s ? 'underline line-through' : 'underline' };
        if (run.marks.a) {
          const href = openable(run.marks.a);
          return (
            <AppText key={index} variant="body" style={href ? linkStyle : style} onPress={href ? () => open(href) : undefined} accessibilityRole={href ? 'link' : undefined}>
              {run.text}
            </AppText>
          );
        }
        const links = linksInText(run.text);
        if (links.length === 0) {
          return (
            <AppText key={index} variant="body" style={style}>
              {run.text}
            </AppText>
          );
        }
        const pieces: React.ReactNode[] = [];
        let at = 0;
        for (const link of links) {
          if (link.start > at) pieces.push(run.text.slice(at, link.start));
          const href = openable(link.href);
          const words = run.text.slice(link.start, link.end);
          pieces.push(
            href ? (
              <AppText key={link.start} variant="body" style={linkStyle} onPress={() => open(href)} accessibilityRole="link">
                {words}
              </AppText>
            ) : (
              words
            ),
          );
          at = link.end;
        }
        if (at < run.text.length) pieces.push(run.text.slice(at));
        return (
          <AppText key={index} variant="body" style={style}>
            {pieces}
          </AppText>
        );
      })}
    </AppText>
  );
}

export const RichView = memo(RichViewComponent);
