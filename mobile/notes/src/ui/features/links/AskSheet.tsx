/**
 * "Demander à Claude": a question about a link, answered from its page and, when the person ticks
 * it, from the web, with the pages it rests on. A few questions of the sort people ask of such a
 * link start it; the answer can go at the end of the link's own note. Nothing is kept on the server.
 * The web's `AskDialog`.
 */
import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { askSuggestions, moduleCost } from '@unlease/notes/services/modules';
import { siteDomain } from '@unlease/core/services/url';
import { ASK_LIMITS } from '@unlease/notes/sync/ask';
import { addToLinkNote, askAbout } from '@app/modules';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectModel, useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Button, FormFoot, Icon, Sheet, SHEET_INSET, SheetScroll, SwitchMark, Tappable, TextField, useUnsaved } from '../../components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { formatUsd } from '@shared/ui/features/settings/money';
import { ReadingTrack } from '@shared/ui/components/ReadingTrack';
import { useModuleSearch } from './useModuleSearch';

export function AskSheet({ id, visible, onDismiss }: { id: string; visible: boolean; onDismiss: () => void }) {
  // A question typed and not asked is asked about before the sheet closes on it.
  const [dirty, setDirty] = useState(false);
  const unsaved = useUnsaved(visible && dirty);
  const cancel = unsaved.guard(onDismiss);
  return (
    <>
      <Sheet visible={visible} onDismiss={cancel} title={MODULE_NAMES.ask} tall>
        <AskBody id={id} onDismiss={onDismiss} onCancel={cancel} onDirty={setDirty} />
      </Sheet>
      {unsaved.dialog}
    </>
  );
}

const open = (url: string) => Linking.openURL(url).catch(() => showSnack(t('Couldn’t open this link'), undefined, { tone: 'error' }));

/** An answer's lines: a paragraph's plain lines, and its "- " lines as a list. */
const LIST_LINE = /^[-•]\s+/;

/** Mounted with the sheet each time it opens: the form first, then the question, dropped when the sheet goes. */
function AskBody({ id, onDismiss, onCancel, onDirty }: { id: string; onDismiss: () => void; onCancel: () => void; onDirty: (dirty: boolean) => void }) {
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
  const dirty = writing && asked.length > 0;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
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
      <>
      <SheetScroll contentContainerStyle={styles.body}>
        <TextField label={t('Your question')} kind="prose" value={question} onChangeText={setQuestion} multiline autoFocus maxLength={ASK_LIMITS.question} style={styles.question} />
        <View role="group" accessibilityLabel={t('Questions to start with')} style={styles.suggestions}>
          {askSuggestions(link.kind).map(suggestion => (
            <Tappable key={suggestion} onPress={() => setQuestion(suggestion)} accessibilityLabel={suggestion} style={styles.suggestion}>
              <AppText variant="label">{suggestion}</AppText>
            </Tappable>
          ))}
        </View>
        {/* The whole row is the switch (the web's): its words name it. */}
        <Tappable onPress={() => setWeb(!web)} accessibilityRole="switch" accessibilityState={{ checked: web }} accessibilityLabel={t('Search the web too')} style={styles.check}>
          <AppText variant="body" style={styles.flex}>
            {t('Search the web too')}
          </AppText>
          <SwitchMark checked={web} />
        </Tappable>
        <AppText variant="meta">{moduleCost('ask', model, formatUsd)}</AppText>
      </SheetScroll>
      <FormFoot>
        <Button kind="text" label={t('Cancel')} onPress={onCancel} />
        <Button label={t('Ask')} icon="sparkle" disabled={!asked} onPress={ask} />
      </FormFoot>
      </>
    );
  }

  if (phase.kind === 'asking') {
    return (
      <View style={styles.waiting} accessibilityLiveRegion="polite">
        <ReadingTrack width={120} />
        <AppText variant="body" color={theme.color.inkMuted}>
          {web ? t('Claude is reading the page and searching the web…') : t('Claude is reading the page…')}
        </AppText>
        {web ? <AppText variant="meta">{t('A web search often takes half a minute.')}</AppText> : null}
      </View>
    );
  }
  if (phase.kind === 'failed') {
    // The actions at the sheet's foot, as the answer's and every module's.
    return (
      <>
        <SheetScroll contentContainerStyle={styles.body}>
          <AppText variant="body" color={theme.color.danger} accessibilityLiveRegion="polite">
            {t('Claude could not answer: {reason}', { reason: phase.reason })}
          </AppText>
        </SheetScroll>
        <FormFoot>
          <Button kind="text" label={t('Another question')} onPress={another} />
          <Button label={t('Try again')} onPress={() => search(false)} />
        </FormFoot>
      </>
    );
  }

  const { answer, sources } = phase.answer;
  const add = () => {
    if (!addToLinkNote(id, `${asked}\n${answer}`)) {
      showSnack(t('Your note is too long to add this answer to it.'), undefined, { tone: 'warning' });
      return;
    }
    showSnack(t('Added to your note'), undefined, { tone: 'success' });
    onDismiss();
  };
  return (
    <>
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
    </SheetScroll>
    <FormFoot>
      <Button kind="text" label={t('Another question')} onPress={another} />
      <Button kind="tonal" label={t('Add to your note')} icon="note" onPress={add} />
    </FormFoot>
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: 16, paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
    waiting: { gap: 12, paddingHorizontal: SHEET_INSET, paddingTop: 8, paddingBottom: 24, alignItems: 'flex-start' },
    flex: { flex: 1 },
    question: { minHeight: 96, textAlignVertical: 'top' },
    suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    // A question to start from, as the new collection's suggestions are drawn: an edged chip on paper.
    suggestion: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1.5, borderColor: theme.color.outline, backgroundColor: theme.color.paper, ...corners(SHAPES.chip) },
    // A list row's 6 and 10 out of the column: its words on it, its press reaching where a row's does.
    check: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: -10, paddingHorizontal: 10, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
    answer: { gap: 12 },
    paragraph: { gap: 4 },
    item: { flexDirection: 'row', gap: 10, paddingLeft: 4 },
    // On the sheet's column, with the title, the answer and the rows' marks.
    sourcesTitle: { paddingBottom: 4 },
    // A list row's: its mark on the column, its press 10 out of it.
    source: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: -10, paddingHorizontal: 10, paddingVertical: 8, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
  });
