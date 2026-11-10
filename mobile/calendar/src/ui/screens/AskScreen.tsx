/**
 * « Demander à Claude »: a question about the calendar (« Quand ai-je vu Paul ? », « Qu'ai-je cette
 * semaine ? »), answered from the events of the three months past and the year ahead, built on the
 * phone (`askContext`); the conversation lasts while the screen is open. Off until the Administration
 * turns it on. As the web's panel: what Claude reads said first, questions to start from while the
 * conversation is empty, « Nouvelle conversation » once it is not, the question waiting with Claude's
 * reading line, and the field at the foot with its arrow.
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { getLocale, t } from '@unlease/core/i18n';
import { ASK_STARTERS, askContext } from '@unlease/calendar/services/ask';
import { birthdaysIn } from '@unlease/calendar/services/layers';
import { hiddenFeedIds, occurrencesIn } from '@unlease/calendar/services/occurrences';
import { addDays, instantToWall, today as todayOf } from '@unlease/calendar/services/time';
import type { CalendarAskTurn } from '@unlease/calendar/sync/routes';
import { nameOf } from '@app/mentionNames';
import { useLibraryStore } from '@app/store/libraryStore';
import { askCalendar } from '@app/sync/transport';
import { later } from '@app/later';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';

import { SHAPES } from '@unlease/design/shapes';
import { AppText, Button, FormMessage, Ground, IconButton, Organic, ReadingTrack, Tappable, TextField, TopBar } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import type { ScreenProps } from '../navigation/types';

/** What the question reads: the occurrences and birthdays around now. */
export function calendarContext(now: number): string {
  const state = useLibraryStore.getState();
  const from = addDays(todayOf(now), -90);
  const to = addDays(todayOf(now), 366);
  return askContext({
    occurrences: occurrencesIn(Object.values(state.events), from, to, { hiddenFeeds: hiddenFeedIds(Object.values(state.feeds)) }),
    birthdays: birthdaysIn(Object.values(state.people.contacts), from, to),
    labels: state.calendarLabels,
    feeds: state.feeds,
    name: target => nameOf(state, target) ?? '?',
    now,
  });
}

export function AskScreen({ navigation }: ScreenProps<'Ask'>) {
  const styles = useThemedStyles(makeStyles);
  const server = useSettingsStore(selectServer);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<readonly CalendarAskTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (typed: string = question): Promise<void> => {
    const asked = typed.trim();
    if (!server || !asked || busy) return;
    setBusy(true);
    setError(null);
    setQuestion(asked);
    try {
      const now = Date.now();
      const answer = await askCalendar(server, { question: asked, context: calendarContext(now), lang: getLocale(), now: instantToWall(now, ''), history: turns });
      setTurns([...turns, { question: asked, answer: answer.answer }]);
      setQuestion('');
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? t(failure.message) : t('Serveur injoignable'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Demander à Claude')} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!server ? <AppText variant="body">{t('Reliez un serveur pour poser des questions sur votre agenda.')}</AppText> : null}
          {server ? (
            <View style={styles.head}>
              <AppText variant="meta" style={styles.fill}>
                {t('Claude lit vos événements de trois mois en arrière à un an devant, et les anniversaires de vos contacts.')}
              </AppText>
              {turns.length > 0 ? <Button kind="text" icon="broom" label={t('Nouvelle conversation')} onPress={() => setTurns([])} /> : null}
            </View>
          ) : null}
          {turns.length === 0 && !busy && server ? (
            <View role="group" accessibilityLabel={t('Exemples de questions')} style={styles.starters}>
              {ASK_STARTERS.map(starter => (
                <Tappable key={starter} onPress={() => later(ask(t(starter)))} accessibilityLabel={t(starter)} style={styles.starter}>
                  <AppText variant="label">{t(starter)}</AppText>
                </Tappable>
              ))}
            </View>
          ) : null}
          {turns.map((turn, index) => (
            <View key={index} style={styles.turn}>
              <View style={styles.question}>
                <AppText variant="body" selectable>
                  {turn.question}
                </AppText>
              </View>
              <Organic outline="card" style={styles.answer}>
                <AppText variant="body" selectable>
                  {turn.answer}
                </AppText>
              </Organic>
            </View>
          ))}
          {busy ? (
            <View style={styles.turn}>
              <View style={styles.question}>
                <AppText variant="body">{question}</AppText>
              </View>
              <View style={styles.waiting} accessibilityLiveRegion="polite">
                <ReadingTrack width={72} />
                <AppText variant="meta" style={styles.fill}>
                  {t('Claude lit votre agenda…')}
                </AppText>
              </View>
            </View>
          ) : null}
          <FormMessage message={error} />
        </ScrollView>
        {server ? (
          <View style={styles.ask}>
            <View style={styles.field}>
              <TextField kind="prose" value={question} onChangeText={setQuestion} placeholder={t('Votre question sur votre agenda')} accessibilityLabel={t('Votre question')} onSubmitEditing={() => later(ask())} returnKeyType="send" submitBehavior="blurAndSubmit" maxLength={2000} />
            </View>
            <IconButton icon="arrowUp" label={t('Demander')} shape={1} disabled={!question.trim() || busy} onPress={() => later(ask())} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    fill: { flex: 1 },
    content: { padding: 16, gap: 16 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    starters: { gap: 8, alignItems: 'flex-start' },
    // A question to start from, as Pages' are drawn: an edged chip on paper.
    starter: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1.5, borderColor: theme.color.outline, backgroundColor: theme.color.paper, ...corners(SHAPES.chip) },
    turn: { gap: 8 },
    // The person's own words, set apart on the field's tone (Pages' too).
    question: { alignSelf: 'flex-end', maxWidth: '88%', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.color.field, ...corners(SHAPES.tab) },
    waiting: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    answer: { padding: 14, backgroundColor: theme.color.paper },
    // The field on the conversation's 16, the arrow's pebble ending on it (its slot's 4 inside the 12).
    ask: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.hairline },
    field: { flex: 1 },
  });
