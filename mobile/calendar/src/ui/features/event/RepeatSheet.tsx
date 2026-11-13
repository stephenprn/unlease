/**
 * « Répéter »: Google's list from the event's start (every day, every weekday, every week on its day,
 * every month on its date or its weekday, every year), and « Personnaliser »: every so many days,
 * weeks, months or years, on which weekdays, until a day or so many times; its « Retour » and « OK »
 * pinned at the sheet's foot, a count that cannot be said under its field.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { localized, t, tx } from '@unlease/core/i18n';
import { SHAPES } from '@unlease/design/shapes';
import { weekdayNames } from '@unlease/core/services/format';
import { choiceOf, choiceRule, choiceWords, describeRule, makeRule, parseRule, repeatChoices, serializeRule, weekCodesFrom, type Frequency } from '@unlease/calendar/services/recurrence';
import { addMonths, weekdayOf } from '@unlease/calendar/services/time';
import { shortDay, shortWeekday } from '@unlease/calendar/services/eventText';

import { later } from '@app/later';

import { AppText, Button, FormFoot, Icon, ListRow, PickerField, Segmented, Sheet, SHEET_INSET, SheetScroll, Tappable, TextField, useForm } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { DayPickerSheet } from '../calendar/DayPickerSheet';

const FREQUENCY_NAMES: Readonly<Record<Frequency, string>> = localized({ DAILY: tx('Days'), WEEKLY: tx('Weeks'), MONTHLY: tx('Months'), YEARLY: tx('Years') });

type End = 'never' | 'until' | 'count';

/** A count typed, 1 to 999, or null. */
const readCount = (typed: string): number | null => (/^\d{1,3}$/.test(typed.trim()) && Number(typed) >= 1 ? Number(typed) : null);

export function RepeatSheet({ visible, start, rrule, today, weekStart, onDismiss, onRule }: { visible: boolean; start: string; rrule: string; today: string; weekStart: number; onDismiss: () => void; onRule: (rrule: string) => void }) {
  const theme = useTheme();
  const [custom, setCustom] = useState(false);
  const [freq, setFreq] = useState<Frequency>('WEEKLY');
  const [interval, setInterval] = useState('1');
  const [days, setDays] = useState<number[]>([]);
  const [end, setEnd] = useState<End>('never');
  const [until, setUntil] = useState(addMonths(start.slice(0, 10), 3));
  const [count, setCount] = useState('10');
  const [pickingUntil, setPickingUntil] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const rule = parseRule(rrule);
    setCustom(false);
    setFreq(rule?.freq ?? 'WEEKLY');
    setInterval(String(rule?.interval ?? 1));
    setDays(rule?.byDay.filter(day => day.nth === 0).map(day => day.weekday) ?? [weekdayOf(start)]);
    setEnd(rule?.count ? 'count' : rule?.until ? 'until' : 'never');
    if (rule?.count) setCount(String(rule.count));
    if (rule?.until?.kind === 'day') setUntil(rule.until.day);
  }, [visible, rrule, start]);

  const pick = (value: string): void => {
    onRule(value);
    onDismiss();
  };

  const every = readCount(interval);
  const times = readCount(count);
  const form = useForm({ every: every === null ? t('A number from 1 to 999.') : null, times: end === 'count' && times === null ? t('A number from 1 to 999.') : null }, { order: ['every', 'times'] });
  const { reset } = form;
  useEffect(() => {
    if (visible) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const built = (): string => {
    const rule = makeRule({
      freq,
      interval: every ?? 1,
      byDay: freq === 'WEEKLY' ? (days.length > 0 ? days : [weekdayOf(start)]).map(weekday => ({ weekday, nth: 0 })) : [],
      count: end === 'count' ? (times ?? 1) : null,
      until: end === 'until' ? { kind: 'day', day: until } : null,
    });
    return serializeRule(rule);
  };

  const current = choiceOf(rrule, start);
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={custom ? t('Custom repeat') : t('Repeat')} tall={custom}>
      {!custom ? (
        // The current one ticked at the row's end, as the other choice sheets do: every choice's words on one column.
        repeatChoices(start).map(choice => (
          <ListRow
            key={choice}
            title={choiceWords(choice, start)}
            trailing={choice === current ? <Icon name="check" size={22} color={theme.color.focus} /> : null}
            accessibilityRole="radio"
            accessibilityState={{ checked: choice === current }}
            onPress={() => (choice === 'custom' ? setCustom(true) : pick(choiceRule(choice, start)))}
          />
        ))
      ) : (
        <>
          <SheetScroll contentContainerStyle={styles.custom}>
            <View style={styles.group}>
              <AppText variant="metaStrong" style={styles.label}>
                {t('Every')}
              </AppText>
              <View style={styles.row}>
                <View style={styles.number}>
                  <TextField kind="number" value={interval} onChangeText={setInterval} accessibilityLabel={t('Interval')} field={form.field('every')} maxLength={3} />
                </View>
                <View style={styles.fill}>
                  <Segmented label={t('Frequency')} options={(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).map(value => ({ value, label: FREQUENCY_NAMES[value] }))} value={freq} onChange={setFreq} />
                </View>
              </View>
            </View>
            {freq === 'WEEKLY' ? (
              <View style={styles.group}>
                <AppText variant="metaStrong" style={styles.label}>
                  {t('The days')}
                </AppText>
                <View style={styles.days}>
                  {weekCodesFrom(weekStart).map(weekday => {
                    const on = days.includes(weekday);
                    return (
                      <Tappable
                        key={weekday}
                        pebble={on ? weekday % 4 : null}
                        onPress={() => setDays(on ? days.filter(each => each !== weekday) : [...days, weekday])}
                        style={[styles.day, { backgroundColor: on ? theme.color.action : theme.color.field }]}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={weekdayNames()[weekday]}
                      >
                        <AppText variant="labelSmall" color={on ? theme.color.onAction : theme.color.ink}>
                          {shortWeekday(weekday)}
                        </AppText>
                      </Tappable>
                    );
                  })}
                </View>
              </View>
            ) : null}
            <View style={styles.group}>
              <AppText variant="metaStrong" style={styles.label}>
                {t('Ends')}
              </AppText>
              <Segmented label={t('Ends')} options={[{ value: 'never' as End, label: t('Never') }, { value: 'until' as End, label: t('On') }, { value: 'count' as End, label: t('After') }]} value={end} onChange={setEnd} />
              {end === 'until' ? <PickerField accessibilityLabel={t('Last day')} value={shortDay(until, 0)} icon="calendar" onPress={() => setPickingUntil(true)} /> : null}
              {end === 'count' ? (
                <View style={styles.row}>
                  <View style={styles.number}>
                    <TextField kind="number" value={count} onChangeText={setCount} accessibilityLabel={t('Number of times')} field={form.field('times')} maxLength={3} />
                  </View>
                  <AppText variant="body" style={styles.word}>
                    {t('occurrences')}
                  </AppText>
                </View>
              ) : null}
            </View>
            <AppText variant="meta" style={styles.label}>
              {describeRule(parseRule(built())!, start)}
            </AppText>
          </SheetScroll>
          <FormFoot message={form.message}>
            <Button label={t('Back')} kind="text" onPress={() => setCustom(false)} />
            <Button label={t('OK')} onPress={() => later(form.submit(() => pick(built())))} />
          </FormFoot>
        </>
      )}
      <DayPickerSheet visible={pickingUntil} title={t('Last day')} day={until} today={today} weekStart={weekStart} onDismiss={() => setPickingUntil(false)} onDay={setUntil} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The fields on the sheet's column, under its title; a group's name close over it, the groups apart.
  custom: { gap: 16, paddingHorizontal: SHEET_INSET, paddingBottom: 16 },
  group: { gap: 6 },
  // Where a field's own label and help lie: 4 in from its edge.
  label: { marginHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  // The track is 52, as the field beside it: their tops and feet meet.
  fill: { flex: 1 },
  number: { width: 96 },
  word: { lineHeight: 52 },
  // The seven days share the width, on one line on any phone.
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', ...corners(SHAPES.chip) },
});
