/**
 * A time of day, by the quarter hour (Google's list), the chosen one in view; any other typed as one
 * says it (« 20h », « 8:30 », « 9 pm », `readClock`, as on the web): the keyboard's « OK » or the
 * button keeps it, and a time that does not read is said under the field.
 */
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { clockWords } from '@unlease/calendar/services/eventText';
import { readClock } from '@unlease/calendar/services/time';
import { later } from '@app/later';

import { Button, Icon, LIST_ROW_PITCH, ListRow, Sheet, SHEET_INSET, TextField, useForm } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

const TIMES = Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`);
const ROW = LIST_ROW_PITCH;

export function TimeSheet({ visible, title, value, twelveHours, onDismiss, onTime }: { visible: boolean; title: string; value: string; twelveHours: boolean; onDismiss: () => void; onTime: (clock: string) => void }) {
  const theme = useTheme();
  const list = useRef<FlatList<string>>(null);
  const [typed, setTyped] = useState('');
  const index = Math.max(0, TIMES.findIndex(each => each >= value));
  const pick = (clock: string): void => {
    onTime(clock);
    onDismiss();
  };
  const keepTyped = (): void => {
    const clock = readClock(typed);
    if (clock) pick(clock);
  };
  const form = useForm({ time: readClock(typed) ? null : t('Une heure comme 20h, 8:30 ou 9 pm.') }, { sendOnDone: keepTyped });
  const { reset } = form;
  useEffect(() => {
    if (!visible) return;
    setTyped(clockWords(value, twelveHours));
    reset();
    // Opened again: what it shows is the time it holds, nothing said yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, value, twelveHours]);
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title} tall>
      <View style={styles.typed}>
        <View style={styles.field}>
          <TextField kind="time" value={typed} onChangeText={setTyped} accessibilityLabel={t('Heure')} field={form.field('time')} selectTextOnFocus />
        </View>
        <Button label={t('OK')} kind="tonal" disabled={!typed.trim()} onPress={() => later(form.submit(keepTyped))} style={styles.ok} />
      </View>
      <FlatList
        ref={list}
        data={TIMES}
        keyExtractor={item => item}
        keyboardShouldPersistTaps="handled"
        initialScrollIndex={Math.max(0, index - 2)}
        getItemLayout={(_, at) => ({ length: ROW, offset: ROW * at, index: at })}
        // Every time on the sheet's column, the chosen one ticked at its end (as the reminders' sheet).
        renderItem={({ item }) => <ListRow title={clockWords(item, twelveHours)} trailing={item === value ? <Icon name="check" size={22} color={theme.color.focus} /> : null} onPress={() => pick(item)} />}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The field on the sheet's column, under its title.
  typed: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  field: { flex: 1 },
  // As tall as the field beside it and level with it, whatever is said under the field.
  ok: { minHeight: 52 },
});
