/**
 * « Modèles de fiche »: what Claude reads on the links kept. The person's own templates first (each
 * with its fields and the collections that pick it), then « Nouveau modèle »; then each kind of link
 * with the fields it is read with, « Modifié » once the person changed them. A row opens its editor
 * (`TemplateScreen`). The web's `/notes/templates`.
 */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { LINK_KIND_NAMES, LINK_KINDS } from '@unlease/notes/models/entities';
import { TEMPLATE_LIMITS } from '@unlease/notes/models/templates';
import { useLibraryStore } from '@app/store/libraryStore';
import { ownTemplates } from '@app/templates';

import { AppText, Ground, TopBar } from '../components';
import { Section } from '@shared/ui/features/settings/Section';
import { KIND_ICONS } from '../features/links/kindIcon';
import { TemplateRow } from '../features/templates/TemplateRow';
import { kindTemplateMeta, ownTemplateMeta } from '../features/templates/templateWords';
import type { ScreenProps } from '../navigation/types';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** Every kind but « Autre », which keeps its title and summary alone. */
const KINDS = LINK_KINDS.filter(kind => kind !== 'other');

export function TemplatesScreen({ navigation }: ScreenProps<'Templates'>) {
  const styles = useThemedStyles(makeStyles);
  const templates = useLibraryStore(s => s.linkTemplates);
  const notes = useLibraryStore(s => s.notes);
  const own = ownTemplates(templates);

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Modèles de fiche')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="meta" style={styles.intro}>
          {t('Ce que Claude relève sur les liens que vous gardez.')}
        </AppText>
        <Section title={own.length > 0 ? t('Vos modèles') : undefined}>
          {own.map(template => (
            <TemplateRow key={template.id} icon="rows" title={template.name} meta={ownTemplateMeta(template, notes)} chevron onPress={() => navigation.navigate('Template', { id: template.id })} />
          ))}
          {own.length < TEMPLATE_LIMITS.templates ? (
            <TemplateRow icon="plus" title={t('Nouveau modèle')} adds onPress={() => navigation.navigate('Template', {})} />
          ) : (
            <AppText variant="meta" style={styles.limit}>
              {t('{count} modèles au plus.', { count: TEMPLATE_LIMITS.templates })}
            </AppText>
          )}
        </Section>
        <Section title={t('Par type de lien')}>
          {KINDS.map(kind => (
            <TemplateRow key={kind} icon={KIND_ICONS[kind]} title={LINK_KIND_NAMES[kind]} meta={kindTemplateMeta(templates, kind)} chevron onPress={() => navigation.navigate('Template', { kind })} />
          ))}
        </Section>
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    // Réglages' column: the panels 12 from the screen's edges, 20 apart.
    content: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 48, gap: 20 },
    // On the section heads (16 in from the panels' edge).
    intro: { paddingHorizontal: 16 },
    limit: { paddingHorizontal: 16, paddingVertical: 12 },
  });
