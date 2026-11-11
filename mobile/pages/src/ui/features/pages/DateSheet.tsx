/**
 * A date in a page's words, changed in a sheet (the phone's field takes no tap on its words): the
 * day in full as the head, today, tomorrow and next Monday at a touch, a month to pick from, a time
 * or none (the reminders' hours and quarters), and « Retirer la date ». Each change is written at
 * once through the block's field, so it lands in the page's undo as typing does; once closed, the
 * caret is back after the date.
 */
import React, { memo, useMemo, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { dateWords, isoDayOf, shiftDay, withTime } from '@unlease/core/services/dates';
import { dateRun, parseRich, serializeRich, type DateRun, type Run } from '@unlease/core/services/richText';
import { useLibraryStore } from '@app/store/libraryStore';
import { saveBlockText } from '@app/store/pages';

import { AppText, ListRow, Sheet, SHEET_INSET, SheetScroll, SwitchMark, Tappable } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { flushAll, focusBlock, richHandle } from './editorStore';
import { dateAt, defaultTime, nextMonday, replaceRange, withoutDate } from './inline';
import { MonthCalendar } from './MonthCalendar';
import { closePageSheet, openPageSheet, useSheetOf } from './sheetStore';

/** The sheet for the date at `at` in a block's words, in the keyboard's place; the caret goes back to `caret` once it is closed. */
export function openDateSheet(block: string, at: number, caret: number = at + 1): void {
  flushAll();
  Keyboard.dismiss();
  openPageSheet({ kind: 'date', block, at, caret });
}

/** The words as the field holds them, or as stored while the block is not drawn yet. */
function runsOf(block: string): Run[] {
  return richHandle(block)?.runs() ?? parseRich(useLibraryStore.getState().blocks[block]?.text ?? '');
}

/** New words for the block: through its field when it is drawn, else saved as typing is. */
function writeRuns(page: string, block: string, runs: readonly Run[]): void {
  const handle = richHandle(block);
  if (handle) handle.write(runs, null);
  else saveBlockText(page, block, useLibraryStore.getState().blocks[block]?.text ?? '', serializeRich(runs));
}

const pad = (value: number): string => String(value).padStart(2, '0');
/** The reminders' hours and quarters. */
const HOURS = Array.from({ length: 17 }, (_, index) => index + 6);
const MINUTES = [0, 15, 30, 45];

/** The hours in full rows of this many, so the grid spans the sheet as the quarters under it do. */
const HOURS_A_ROW = 6;

/** The values in rows of `size`. */
const rowsOf = (values: readonly number[], size: number): number[][] => Array.from({ length: Math.ceil(values.length / size) }, (_, row) => values.slice(row * size, row * size + size));

/** The values offered, with the one held when it is not among them (« 23:40 » typed), in order. */
const withHeld = (values: readonly number[], held: number): number[] => (values.includes(held) ? [...values] : [...values, held].sort((a, b) => a - b));

/** A choice as the reminders draw it: chosen, the matcha wash with a matcha edge. */
function Chip({ label, selected, onPress, accessibilityLabel, style }: { label: string; selected: boolean; onPress: () => void; accessibilityLabel?: string; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.chip, { borderColor: selected ? theme.color.focus : theme.color.hairline, backgroundColor: selected ? theme.color.actionContainer : theme.color.paper }, style]}
    >
      <AppText variant="label" color={selected ? theme.color.onActionContainer : undefined}>
        {label}
      </AppText>
    </Tappable>
  );
}

function DateSheetHostComponent({ page }: { page: string }) {
  const { visible, sheet } = useSheetOf('date');
  const [, refresh] = useState(0);
  // Drawn again when the words change elsewhere too.
  useLibraryStore(s => (sheet ? s.blocks[sheet.block]?.text : undefined));
  const now = useMemo(() => Date.now(), [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = isoDayOf(now);
  const found = sheet ? dateAt(runsOf(sheet.block), sheet.at) : null;
  // Kept while the sheet leaves once the date is taken out, so its head stays.
  const last = useRef<DateRun | null>(null);
  if (found) last.current = found;
  const run = found ?? last.current;
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const reveal = useRef(false);

  const write = (next: DateRun | null): void => {
    if (!sheet || !next || !dateAt(runsOf(sheet.block), sheet.at)) return;
    writeRuns(page, sheet.block, replaceRange(runsOf(sheet.block), sheet.at, sheet.at + 1, [next]));
    refresh(count => count + 1);
  };
  const dismiss = (): void => {
    closePageSheet();
    if (sheet) focusBlock(sheet.block, sheet.caret);
  };
  const remove = (): void => {
    if (!sheet) return;
    closePageSheet();
    writeRuns(page, sheet.block, withoutDate(runsOf(sheet.block), sheet.at));
    focusBlock(sheet.block, sheet.at);
  };

  const quick = [
    { label: t('Aujourd’hui'), day: today },
    { label: t('Demain'), day: shiftDay(now, 1) },
    { label: t('Lundi prochain'), day: nextMonday(now) },
  ];
  const [hour = 0, minute = 0] = run?.time ? run.time.split(':').map(Number) : [];

  return (
    <Sheet visible={visible} onDismiss={dismiss} title={run ? dateWords(run) : ''} tall>
      {run ? (
        <SheetScroll
          ref={scroll}
          style={styles.scroll}
          contentContainerStyle={styles.body}
          onContentSizeChange={() => {
            // The time just turned on: its hours come into view.
            if (!reveal.current) return;
            reveal.current = false;
            scroll.current?.scrollToEnd({ animated: true });
          }}
        >
          <View style={styles.quick}>
            {quick.map(choice => (
              <Chip key={choice.label} label={choice.label} selected={run.date === choice.day} onPress={() => write(dateRun(choice.day, run.time))} />
            ))}
          </View>
          <MonthCalendar chosen={run.date} today={today} onPick={day => write(dateRun(day, run.time))} />
          <View style={styles.rows}>
            <ListRow
              icon="clock"
              title={t('Heure')}
              accessibilityRole="switch"
              accessibilityState={{ checked: run.time !== null }}
              trailing={<SwitchMark checked={run.time !== null} />}
              onPress={() => {
                reveal.current = run.time === null;
                write(withTime(run, run.time ? null : defaultTime(run.date, Date.now())));
              }}
            />
          </View>
          {run.time ? (
            <View style={styles.time}>
              <View style={styles.hours}>
                {rowsOf(withHeld(HOURS, hour), HOURS_A_ROW).map(row => (
                  <View key={row[0]} style={styles.hourRow}>
                    {row.map(value => (
                      <Chip key={value} label={t('{hour} h', { hour: value })} selected={value === hour} onPress={() => write(withTime(run, `${pad(value)}:${pad(minute)}`))} style={styles.hour} />
                    ))}
                    {/* The last row keeps the grid's columns. */}
                    {Array.from({ length: HOURS_A_ROW - row.length }, (_, index) => (
                      <View key={`gap-${index}`} style={styles.hour} />
                    ))}
                  </View>
                ))}
              </View>
              <View style={styles.minutes}>
                {withHeld(MINUTES, minute).map(value => (
                  <Chip key={value} label={`:${pad(value)}`} accessibilityLabel={`${hour}:${pad(value)}`} selected={value === minute} onPress={() => write(withTime(run, `${pad(hour)}:${pad(value)}`))} style={styles.minute} />
                ))}
              </View>
            </View>
          ) : null}
          <View style={styles.rows}>
            <ListRow icon="trash" title={t('Retirer la date')} danger onPress={remove} />
          </View>
        </SheetScroll>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexShrink: 1 },
  // The chips, the month and the hours on the sheet's column, with its title.
  body: { gap: 12, paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', ...corners(SHAPES.chip) },
  // List rows keep their own inset, as straight in a sheet.
  rows: { marginHorizontal: -SHEET_INSET },
  time: { gap: 8 },
  hours: { gap: 8 },
  hourRow: { flexDirection: 'row', gap: 8 },
  hour: { flex: 1, minHeight: 48, paddingHorizontal: 0 },
  minutes: { flexDirection: 'row', gap: 8 },
  minute: { flex: 1, minHeight: 48, paddingHorizontal: 0 },
});

export const DateSheetHost = memo(DateSheetHostComponent);
