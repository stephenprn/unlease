/**
 * « Ajouter en quelques mots » (the web's words): an event typed in a few words (« Dîner chez Paul jeudi 20h »), read on the phone
 * (`readQuickAdd`) and shown as it will be kept before it is; « Créer » keeps it, « Détails » opens the
 * form with it. Words the phone cannot read go to Claude (`POST /api/calendar/parse`) when asked (« Demander
 * à Claude », under the line saying no date was read, once the server has said Claude has a key); what
 * Claude could not do is said by the actions, pinned at the sheet's foot. Words selected in another app
 * (« Créer un événement ») open it with them in its field, read at once.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getLocale, t } from '@unlease/core/i18n';
import { blankDraft } from '@unlease/calendar/services/editing';
import { weekdayDay, timeRange } from '@unlease/calendar/services/eventText';
import { readQuickAdd, type QuickDraft } from '@unlease/calendar/services/quickAdd';
import { deviceZone, instantToWall, isDay, wallToInstant } from '@unlease/calendar/services/time';
import type { EventProposal } from '@unlease/calendar/sync/routes';
import { addEvent } from '@app/store/actions';
import { selectPrefs, useCalendarUiStore } from '@app/store/calendarUi';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { useServerFeature } from '@shared/app/hooks/useServerFeature';
import { parseWithClaude, SyncError } from '@app/sync/transport';
import { later } from '@app/later';

import { AppText, Button, FormFoot, Sheet, SHEET_INSET, TextField } from '@shared/ui/components';

export interface QuickAddSheetProps {
  readonly visible: boolean;
  /** The words it opens with (another app's selection); none from the button. */
  readonly words?: string;
  readonly today: string;
  readonly onDismiss: () => void;
  readonly onCreated: (id: string) => void;
  /** The form, filled with what was read. */
  readonly onDetails: (draft: QuickDraft | EventProposal) => void;
}

/** What a draft says of when: « jeu. 5 nov. · 20:00 – 21:00 ». */
function whenWords(draft: Pick<QuickDraft, 'start' | 'end'>, zone: string): string {
  if (isDay(draft.start)) return [weekdayDay(draft.start), t('All day')].join(' · ');
  return `${weekdayDay(draft.start)} · ${timeRange({ allDay: false, startAt: wallToInstant(draft.start, zone), endAt: wallToInstant(draft.end, zone) })}`;
}

export function QuickAddSheet({ visible, words = '', today, onDismiss, onCreated, onDetails }: QuickAddSheetProps) {
  const prefs = useCalendarUiStore(selectPrefs);
  const server = useSettingsStore(selectServer);
  const claude = useServerFeature('claude');
  const [text, setText] = useState('');
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    setText(words);
    setProblem(null);
  }, [visible, words]);
  const zone = deviceZone();
  const draft = text.trim() ? readQuickAdd(text, today, prefs.eventLength) : null;
  const understood = draft !== null && (draft.foundDay || draft.foundTime);

  const create = (): void => {
    if (!draft || !draft.title) return;
    const reminders = isDay(draft.start) ? prefs.allDayReminders : prefs.reminders;
    const id = addEvent({ ...blankDraft(draft.start, draft.end, zone, reminders), title: draft.title, place: draft.place });
    onDismiss();
    onCreated(id);
  };

  const ask = async (): Promise<void> => {
    if (!server) return;
    setAsking(true);
    setProblem(null);
    try {
      const answer = await parseWithClaude(server, { text: text.trim(), lang: getLocale(), now: instantToWall(Date.now(), ''), timeZone: zone });
      if (answer.proposal) {
        onDismiss();
        onDetails(answer.proposal);
      } else setProblem(t('Claude found no event in these words.'));
    } catch (error) {
      setProblem(error instanceof SyncError && error.status === 409 ? t(error.message) : error instanceof Error && error.message ? t(error.message) : t('Server unreachable'));
    } finally {
      setAsking(false);
    }
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Add in a few words')}>
      <View style={styles.body}>
        <TextField
          kind="text"
          value={text}
          onChangeText={value => {
            setText(value);
            setProblem(null);
          }}
          placeholder={t('Dinner at Paul’s Thursday 8pm')}
          accessibilityLabel={t('The event in a few words')}
          autoFocus
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={create}
        />
        {draft ? (
          <View style={styles.preview}>
            <AppText variant="bodyStrong">{draft.title || t('Untitled')}</AppText>
            <AppText variant="meta">{draft.place ? `${whenWords(draft, zone)} · ${draft.place}` : whenWords(draft, zone)}</AppText>
            {!understood ? <AppText variant="meta">{t('No date recognised: the event will be today.')}</AppText> : null}
            {/* Under the line it answers, beside text: three buttons in the foot run off a 360 phone. */}
            {server && claude && !understood ? <Button label={t('Ask Claude')} icon="sparkle" kind="text" small busy={asking} onPress={() => later(ask())} style={styles.claude} /> : null}
          </View>
        ) : (
          <AppText variant="meta" style={styles.preview}>
            {t('A title, a day, a time, a place: “Conference March 12 to 14 at Lyon”, “Gym Monday 6pm for 1h”.')}
          </AppText>
        )}
      </View>
      <FormFoot message={problem}>
        <Button label={t('Details')} kind="tonal" disabled={!draft} onPress={() => draft && (onDismiss(), onDetails(draft))} />
        <Button label={t('Create')} icon="check" disabled={!draft?.title} onPress={create} />
      </FormFoot>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The field on the sheet's column, under its title.
  body: { gap: 12, paddingHorizontal: SHEET_INSET, paddingBottom: 12 },
  // The examples, then what was read, both where a field's help line lies: 4 in from its edge.
  preview: { gap: 2, paddingHorizontal: 4 },
  // Its glyph on the text's start (the button's own 14 taken back).
  claude: { marginLeft: -14, marginTop: 4 },
});
