/**
 * « Ce que Claude relève »: the collections that have their own facts (each its name and its facts,
 * opening its page), then the usual facts of every kind of link (its glyph, its name, its facts,
 * « Modifiées » once changed). A collection takes its own from its menu: the line at the top says
 * so. A row opens `TemplateScreen`. The web's `/notes/facts`.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { t } from '@unlease/core/i18n';
import { INBOX_ID, LINK_KIND_NAMES, LINK_KINDS, shownTitle } from '@unlease/notes/models/entities';
import { collectionTemplate } from '@unlease/notes/services/templates';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, EdgeScrollView, Ground, TopBar } from '../components';
import { Section } from '@shared/ui/features/settings/Section';
import { KIND_ICONS } from '../features/links/kindIcon';
import { TemplateRow } from '../features/templates/TemplateRow';
import { useLeaveWithoutClaude } from './TemplateScreen';
import { factNames, kindFactsMeta } from '../features/templates/templateWords';
import type { ScreenProps } from '../navigation/types';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** Every kind but « Lien », which keeps its title and summary alone. */
const KINDS = LINK_KINDS.filter(kind => kind !== 'other');

export function TemplatesScreen({ navigation }: ScreenProps<'Templates'>) {
  const styles = useThemedStyles(makeStyles);
  useLeaveWithoutClaude(navigation);
  const templates = useLibraryStore(s => s.linkTemplates);
  // The collections with their own facts, in the board's order.
  const own = useLibraryStore(
    useShallow(s =>
      s.noteOrder.filter(id => {
        const note = s.notes[id];
        return !!note && id !== INBOX_ID && note.kind === 'links' && note.trashedAt === null && note.deletedAt === null && collectionTemplate(s.linkTemplates, note) !== null;
      }),
    ),
  );
  const notes = useLibraryStore(s => s.notes);

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Facts Claude notes')} onBack={() => navigation.goBack()} />
      <EdgeScrollView contentContainerStyle={styles.content}>
        <AppText variant="meta" style={styles.intro}>
          {t('A collection can have its own: “Facts Claude notes” in its menu.')}
        </AppText>
        {own.length > 0 ? (
          <Section title={t('Collections with their own')}>
            {own.map(id => (
              <TemplateRow
                key={id}
                icon="collections"
                title={shownTitle(notes[id]!)}
                meta={factNames(collectionTemplate(templates, notes[id])?.fields ?? [])}
                metaLine
                chevron
                onPress={() => navigation.navigate('Template', { collection: id })}
              />
            ))}
          </Section>
        ) : null}
        <Section title={t('Usual facts, by kind of link')}>
          {KINDS.map(kind => (
            <TemplateRow key={kind} icon={KIND_ICONS[kind]} title={LINK_KIND_NAMES[kind]} meta={kindFactsMeta(templates, kind)} metaLine chevron onPress={() => navigation.navigate('Template', { kind })} />
          ))}
        </Section>
      </EdgeScrollView>
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
  });
