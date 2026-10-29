/**
 * "Demander à Claude": a question about a link, answered from its page and, when the person ticks
 * it, from the web, with the pages it rests on. A few questions of the sort people ask of such a
 * link start it; the answer can go at the end of the link's own note. Nothing is kept on the server.
 * The web's `AskDialog`.
 */
import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { askSuggestions, moduleCost } from '@unlease/notes/services/modules';
import { siteDomain } from '@unlease/core/services/url';
import { ASK_LIMITS } from '@unlease/notes/sync/ask';
import { addToLinkNote, askAbout } from '@app/modules';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectModel, useSettingsStore } from '@app/store/settingsStore';
import { showSnack } from '@app/store/uiStore';

import { AppText, Button, Icon, Sheet, SheetScroll, SwitchMark, Tappable, TextField } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { formatUsd } from '../settings/money';
import { ReadingTrack } from './ReadingTrack';
import { useModuleSearch } from './useModuleSearch';

export function AskSheet({ id, visible, onDismiss }: { id: string; visible: boolean; onDismiss: () => void }) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={MODULE_NAMES.ask} tall>
      <AskBody id={id} onDismiss={onDismiss} />
    </Sheet>
  );
}

const open = (url: string) => Linking.openURL(url).catch(() => showSnack(t('Impossible d’ouvrir ce lien'), undefined, { tone: 'error' }));

/** An answer's lines: a paragraph's plain lines, and its "- " lines as a list. */
const LIST_LINE = /^[-•]\s+/;

/** Mounted with the sheet each time it opens: the form first, then the question, dropped when the sheet goes. */
function AskBody({ id, onDismiss }: { id: string; onDismiss: () => void }) {
  const theme = useTheme();
  const model = useSettingsStore(selectModel);
  const styles = useThemedStyles(makeStyles);
  const link = useLibraryStore(s => s.links[id]);
  const [question, setQuestion] = useState('');
  const [web, setWeb] = useState(false);
  const [writing, setWriting] = useState(true);
  // The form does not show while Claude answers, so what it holds is what was asked.
  const asked = question.trim();
  const { phase, search } = useModuleSearch((_fresh, signal) => askAbout(id, asked, web, signal), false);
  if (!link) return null;

  const ask = () => {
    setWriting(false);
    search(false);
  };
  const another = () => {
    setQuestion('');
    setWriting(true);
  };

  if (writing) {
    return (
      <SheetScroll contentContainerStyle={styles.body}>
        <TextField label={t('Votre question')} value={question} onChangeText={setQuestion} placeholder={askSuggestions(link.kind)[0]} multiline maxLength={ASK_LIMITS.question} style={styles.question} />
        <View role="group" accessibilityLabel={t('Questions pour commencer')} style={styles.suggestions}>
          {askSuggestions(link.kind).map(suggestion => (
            <Tappable key={suggestion} onPress={() => setQuestion(suggestion)} accessibilityLabel={suggestion} style={styles.suggestion}>
              <AppText variant="label">{suggestion}</AppText>
            </Tappable>
          ))}
        </View>
        {/* The whole row is the switch (the web's): its words name it. */}
        <Tappable onPress={() => setWeb(!web)} accessibilityRole="switch" accessibilityState={{ checked: web }} accessibilityLabel={t('Chercher aussi sur le web')} style={styles.check}>
          <AppText variant="body" style={styles.flex}>
            {t('Chercher aussi sur le web')}
          </AppText>
          <SwitchMark checked={web} />
        </Tappable>
        <AppText variant="meta">{moduleCost('ask', model, formatUsd)}</AppText>
        <Button label={t('Demander')} icon="sparkle" disabled={!asked} onPress={ask} style={styles.end} />
      </SheetScroll>
    );
  }

  if (phase.kind === 'asking') {
    return (
      <View style={styles.waiting} accessibilityLiveRegion="polite">
        <ReadingTrack width={120} />
        <AppText variant="body" color={theme.color.inkMuted}>
          {web ? t('Claude lit la page et cherche sur le web…') : t('Claude lit la page…')}
        </AppText>
        {web ? <AppText variant="meta">{t('Une recherche sur le web prend souvent une demi-minute.')}</AppText> : null}
      </View>
    );
  }
  if (phase.kind === 'failed') {
    return (
      <View style={styles.body}>
        <AppText variant="body" color={theme.color.danger} accessibilityLiveRegion="polite">
          {t('Claude n’a pas pu répondre : {reason}', { reason: phase.reason })}
        </AppText>
        <View style={styles.actions}>
          <Button kind="text" label={t('Autre question')} onPress={another} />
          <Button label={t('Réessayer')} onPress={() => search(false)} />
        </View>
      </View>
    );
  }

  const { answer, sources } = phase.answer;
  const add = () => {
    if (!addToLinkNote(id, `${asked}\n${answer}`)) {
      showSnack(t('Votre note est trop longue pour y ajouter cette réponse.'), undefined, { tone: 'warning' });
      return;
    }
    showSnack(t('Ajouté à votre note'), undefined, { tone: 'success' });
    onDismiss();
  };
  return (
    <SheetScroll contentContainerStyle={styles.body}>
      <AppText variant="metaStrong">{asked}</AppText>
      <View style={styles.answer}>
        {answer.split(/\n\s*\n/).map((paragraph, index) => (
          <View key={index} style={styles.paragraph}>
            {paragraph.split('\n').map((line, at) =>
              LIST_LINE.test(line) ? (
                <View key={at} style={styles.item}>
                  <AppText variant="body" accessibilityElementsHidden importantForAccessibility="no">
                    •
                  </AppText>
                  <AppText variant="body" selectable style={styles.flex}>
                    {line.replace(LIST_LINE, '')}
                  </AppText>
                </View>
              ) : (
                <AppText key={at} variant="body" selectable>
                  {line}
                </AppText>
              ),
            )}
          </View>
        ))}
      </View>
      {sources.length > 0 ? (
        <View>
          <AppText variant="section" accessibilityRole="header" style={styles.sourcesTitle}>
            {t('Sources')}
          </AppText>
          {sources.map(source => (
            <Tappable key={source.url} onPress={() => open(source.url)} accessibilityRole="link" accessibilityLabel={source.title} style={styles.source}>
              <Icon name="external" size={20} color={theme.color.link} />
              <View style={styles.flex}>
                <AppText variant="body" numberOfLines={2}>
                  {source.title}
                </AppText>
                <AppText variant="meta" numberOfLines={1}>
                  {siteDomain(source.url)}
                </AppText>
              </View>
            </Tappable>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button kind="text" label={t('Autre question')} onPress={another} />
        <Button kind="tonal" label={t('Ajouter à votre note')} icon="note" onPress={add} />
      </View>
    </SheetScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: 16, paddingHorizontal: 8, paddingBottom: 8 },
    waiting: { gap: 12, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 24, alignItems: 'flex-start' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
    end: { alignSelf: 'flex-end' },
    flex: { flex: 1 },
    question: { minHeight: 96, textAlignVertical: 'top' },
    suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    // A question to start from, as the new collection's suggestions are drawn: an edged chip on paper.
    suggestion: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1.5, borderColor: theme.color.outline, backgroundColor: theme.color.paper, ...corners(SHAPES.chip) },
    check: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: -8, paddingHorizontal: 8, ...corners(SHAPES.tab) },
    answer: { gap: 12 },
    paragraph: { gap: 4 },
    item: { flexDirection: 'row', gap: 10, paddingLeft: 4 },
    // In line with the rows' marks.
    sourcesTitle: { paddingHorizontal: 10, paddingBottom: 4 },
    source: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 10, paddingVertical: 8, ...corners(SHAPES.tab) },
  });
