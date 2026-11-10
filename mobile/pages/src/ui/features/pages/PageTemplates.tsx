/**
 * A new page's templates on the phone, as the web's: while the page holds nothing (`isBlankPage`),
 * quiet choices under its title (« Journal du jour », « Réunion »…), drawn as « Ajouter une icône »
 * is, never a step before writing: a word typed makes them go. A choice fills the page in one step
 * of its undo (`fillPage`), written in the phone's language; the caret goes to the title while it
 * has none, else where the template asks to write.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { getLocale, t } from '@unlease/core/i18n';
import { isoDayOf } from '@unlease/core/services/dates';
import { SHAPES } from '@unlease/design/shapes';
import { isBlankPage, pageTemplate, TEMPLATE_CHOICES, type PageTemplateKey } from '@unlease/pages/services/templates';
import { useLibraryStore } from '@app/store/libraryStore';
import { fillPage } from '@app/store/pages';

import { AppText, Icon, Tappable } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { flushAll, focusBlock, resyncFields } from './editorStore';

/** Fills `page` from a template, for today on this phone; every field takes its words back, and the caret goes where it goes. */
export function startFromTemplate(page: string, key: PageTemplateKey, now: number = Date.now()): void {
  flushAll();
  const { caret } = fillPage(page, pageTemplate(key, isoDayOf(now), getLocale()), now);
  resyncFields();
  focusBlock(caret.block, caret.offset);
}

/** Whether `page` holds nothing yet: its templates show. */
export function useBlankPage(page: string): boolean {
  return useLibraryStore(s => isBlankPage(s.blocks, s.blocksByParent, page));
}

export function PageTemplates({ page }: { page: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View role="group" accessibilityLabel={t('Partir d’un modèle')} style={styles.group}>
      <AppText variant="meta" color={theme.color.inkMuted}>
        {t('Partir d’un modèle')}
      </AppText>
      <View style={styles.row}>
        {TEMPLATE_CHOICES.map(choice => (
          <Tappable key={choice.key} onPress={() => startFromTemplate(page, choice.key)} hitSlop={{ top: 4, bottom: 4 }} style={styles.choice} accessibilityRole="button" accessibilityLabel={t(choice.label)}>
            <Icon name={choice.glyph} size={18} color={theme.color.inkMuted} />
            <AppText variant="label" color={theme.color.inkMuted}>
              {t(choice.label)}
            </AppText>
          </Tappable>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (_theme: Theme) =>
  StyleSheet.create({
    group: { gap: 4, marginTop: 4, marginBottom: 8 },
    // « Ajouter une icône »'s own shape: the words on the title's column, each a 40 row 8 apart (48 to the finger).
    row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 4, rowGap: 8, marginLeft: -8 },
    choice: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 8, ...corners(SHAPES.chip) },
  });
