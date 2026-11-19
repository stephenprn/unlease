/**
 * A time of day in two taps, never a scroll: the time large at the top, then every hour and every
 * five minutes laid out as targets 48 high (Material's dial, its hour then its minutes, without the
 * dial's aim nor its two rings of 24 hours). An hour and a minute picked, in either order, keep the
 * time and close; one alone waits for « OK ». An end offers how long first (30 min to 2 h, from the
 * start) and says how long the time picked lasts. Any other time is typed as one says it (« 20h »,
 * « 8:30 », « 9 pm », `readClock`, as on the web) behind the keyboard's button.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { plural } from '@unlease/core/services/format';
import { t } from '@unlease/core/i18n';
import { SHAPES } from '@unlease/design/shapes';
import { clockWords, lengthWords, shortLengthWords } from '@unlease/calendar/services/eventText';
import { readClock } from '@unlease/calendar/services/time';
import { later } from '@app/later';

import { AppText, Button, FormFoot, IconButton, Segmented, Sheet, SHEET_INSET, SheetScroll, Tappable, TextField, useForm } from '@shared/ui/components';
import { duration } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { fontFamily } from '@shared/ui/theme/typography';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

const pad = (value: number): string => String(value).padStart(2, '0');
const clockOf = (hour: number, minute: number): string => `${pad(hour)}:${pad(minute)}`;
const hourOf = (clock: string): number => Number(clock.slice(0, 2)) || 0;
const minuteOf = (clock: string): number => Number(clock.slice(3, 5)) || 0;

const COLUMNS = 6;
const HOURS_24 = Array.from({ length: 24 }, (_, hour) => hour);
/** On a 12-hour clock: 12, then 1 to 11, the half of the day chosen beside them. */
const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);
/** How long an event usually lasts, as Clock's « before the event » chips. */
const LENGTHS = [30, 60, 90, 120];
/** The night's hours (before 7, from 22) lie back, so the day's are found at a glance. */
const isNight = (hour: number): boolean => hour < 7 || hour >= 22;

const rowsOf = <T,>(items: readonly T[]): T[][] => Array.from({ length: Math.ceil(items.length / COLUMNS) }, (_, row) => items.slice(row * COLUMNS, row * COLUMNS + COLUMNS));

export interface TimeSheetProps {
  readonly visible: boolean;
  readonly title: string;
  /** `HH:MM`. */
  readonly value: string;
  readonly twelveHours: boolean;
  readonly onDismiss: () => void;
  readonly onTime: (clock: string) => void;
  /** An end's: how many minutes the event lasts if it ends at this time. */
  readonly lengthAt?: (clock: string) => number;
  /** An end's: the event made this long from its start. */
  readonly onLength?: (minutes: number) => void;
  /** Whether a time ending before the start ends the next day (an end's, on the start's day). */
  readonly nextDayAt?: (clock: string) => boolean;
}

/** One target of a grid: its words, chosen on the primary's wash within the focus edge (as Clock's chips). */
function Cell({ label, words, on, faint, onPress }: { label: string; words: string; on: boolean; faint?: boolean; onPress: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Tappable accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={onPress} style={[styles.cell, on ? styles.cellOn : null]}>
      <AppText variant={on ? 'bodyStrong' : 'body'} color={on ? theme.color.onActionContainer : faint ? theme.color.inkMuted : theme.color.ink}>
        {words}
      </AppText>
    </Tappable>
  );
}

export function TimeSheet({ visible, title, value, twelveHours, onDismiss, onTime, lengthAt, onLength, nextDayAt }: TimeSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState(value);
  // What this opening has picked: both, and the time is kept.
  const [picked, setPicked] = useState<{ hour: boolean; minute: boolean }>({ hour: false, minute: false });
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keep = (clock: string): void => {
    if (closing.current) clearTimeout(closing.current);
    closing.current = null;
    if (clock !== value) onTime(clock);
    onDismiss();
  };
  const keepTyped = (): void => {
    const clock = readClock(typed);
    if (clock) keep(clock);
  };
  const form = useForm({ time: !typing || readClock(typed) ? null : t('A time such as 8 pm, 20:00 or 8:30.') }, { sendOnDone: keepTyped });
  const { reset } = form;

  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    setPicked({ hour: false, minute: false });
    setTyping(false);
    setTyped(clockWords(value, twelveHours));
    reset();
    // Opened again: it shows the time it holds, nothing picked, nothing said yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, value, twelveHours]);
  useEffect(
    () => () => {
      if (closing.current) clearTimeout(closing.current);
    },
    [],
  );

  // The second of the two picks keeps the time, a beat after it shows as chosen.
  const choose = (clock: string, part: 'hour' | 'minute'): void => {
    const next = { ...picked, [part]: true };
    setDraft(clock);
    setPicked(next);
    if (next.hour && next.minute) {
      if (closing.current) clearTimeout(closing.current);
      closing.current = setTimeout(() => keep(clock), duration.short);
    }
  };

  const hour = hourOf(draft);
  const minute = minuteOf(draft);
  const afternoon = hour >= 12;
  const length = lengthAt ? lengthAt(draft) : null;
  const lengthLine = length === null ? null : nextDayAt?.(draft) ? t('{length}, until the next day', { length: lengthWords(length) }) : lengthWords(length);

  const hourCells = twelveHours
    ? HOURS_12.map(shown => {
        const real = (shown % 12) + (afternoon ? 12 : 0);
        return { key: shown, real, words: String(shown) };
      })
    : HOURS_24.map(real => ({ key: real, real, words: pad(real) }));

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title} tall>
      <SheetScroll keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        {/* The time as it stands, large; the keyboard's button beside it types any other. */}
        <View style={styles.readout}>
          <View style={styles.readoutWords} accessibilityLiveRegion="polite">
            <AppText style={styles.time} accessibilityLabel={clockWords(draft, twelveHours)}>
              {clockWords(draft, twelveHours)}
            </AppText>
            {lengthLine ? <AppText variant="meta">{lengthLine}</AppText> : null}
          </View>
          <IconButton icon={typing ? 'clock' : 'keyboard'} label={typing ? t('Pick on the grid') : t('Type a time')} onPress={() => setTyping(!typing)} />
        </View>

        {typing ? (
          <TextField kind="time" value={typed} onChangeText={setTyped} accessibilityLabel={t('Time')} field={form.field('time')} selectTextOnFocus autoFocus />
        ) : (
          <>
            {onLength && lengthAt ? (
              <View style={styles.lengths} accessibilityRole="radiogroup" accessibilityLabel={t('Duration')}>
                {LENGTHS.map(minutes => (
                  <Cell
                    key={minutes}
                    label={lengthWords(minutes)}
                    words={shortLengthWords(minutes)}
                    on={length === minutes}
                    onPress={() => {
                      onLength(minutes);
                      onDismiss();
                    }}
                  />
                ))}
              </View>
            ) : null}

            <View style={styles.head}>
              <AppText variant="section">{t('Hour')}</AppText>
              {twelveHours ? (
                <View style={styles.half}>
                  <Segmented
                    label={t('Half of the day')}
                    options={[
                      { value: 'am', label: 'AM' },
                      { value: 'pm', label: 'PM' },
                    ]}
                    value={afternoon ? 'pm' : 'am'}
                    onChange={half => setDraft(clockOf((hour % 12) + (half === 'pm' ? 12 : 0), minute))}
                  />
                </View>
              ) : null}
            </View>
            <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={t('Hour')}>
              {rowsOf(hourCells).map((row, index) => (
                <View key={index} style={styles.row}>
                  {row.map(cell => (
                    <Cell key={cell.key} label={clockWords(clockOf(cell.real, 0), twelveHours)} words={cell.words} on={cell.real === hour} faint={isNight(cell.real)} onPress={() => choose(clockOf(cell.real, minute), 'hour')} />
                  ))}
                </View>
              ))}
            </View>

            <AppText variant="section" style={styles.head}>
              {t('Minutes')}
            </AppText>
            <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={t('Minutes')}>
              {rowsOf(MINUTES).map((row, index) => (
                <View key={index} style={styles.row}>
                  {row.map(each => (
                    <Cell key={each} label={plural(each, 'minute')} words={`:${pad(each)}`} on={each === minute} onPress={() => choose(clockOf(hour, each), 'minute')} />
                  ))}
                </View>
              ))}
            </View>
          </>
        )}
      </SheetScroll>
      <FormFoot message={form.message}>
        <Button label={t('Cancel')} kind="text" onPress={onDismiss} />
        <Button label={t('OK')} disabled={typing && !typed.trim()} onPress={() => (typing ? later(form.submit(keepTyped)) : keep(draft))} />
      </FormFoot>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { paddingHorizontal: SHEET_INSET, paddingBottom: 16, gap: 8 },
    readout: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 72 },
    readoutWords: { flex: 1, gap: 2 },
    // The time read at arm's length, in the suite's figures (tabular, as Clock's).
    time: { fontFamily: fontFamily(theme, 'SemiBold'), fontSize: 44, lineHeight: 52, letterSpacing: -0.5, color: theme.color.ink },
    lengths: { flexDirection: 'row', gap: 6, marginBottom: 4 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32, marginTop: 8 },
    half: { width: 148 },
    grid: { gap: 6 },
    row: { flexDirection: 'row', gap: 6 },
    // Material's 48 to the finger; the veil alone at rest, so the figures carry the grid.
    cell: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', backgroundColor: theme.color.fieldVeil, ...corners(SHAPES.chip) },
    cellOn: { borderWidth: 2, borderColor: theme.color.focus, backgroundColor: theme.color.actionContainer },
  });
