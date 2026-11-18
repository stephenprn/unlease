/**
 * The days an alarm rings: the suite's seven round toggles (`WeekdayToggles`) in the week's order
 * (the settings' first day), then the quick choices as chips, two by two (once, the working days,
 * the weekend, every day).
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { DAYS_CHOICES, daysChoiceName, daysChoiceOf, daysOfChoice } from '@unlease/clock/services/editor';

import { AppText, Tappable, WeekdayToggles } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

export interface DayTogglesProps {
  readonly days: readonly number[];
  /** 0 Sunday, 1 Monday, 6 Saturday. */
  readonly weekStart: number;
  /** The days the person works (Agenda's): the first quick choice's. */
  readonly workDays: readonly number[];
  readonly onDays: (days: number[]) => void;
}

function DayTogglesComponent({ days, weekStart, workDays, onDays }: DayTogglesProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const chosen = daysChoiceOf(days, workDays);
  return (
    <View style={styles.days}>
      <WeekdayToggles days={days} weekStart={weekStart} onChange={onDays} label={t('Days')} />
      <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={t('Quick choices')}>
        {DAYS_CHOICES.map(choice => {
          const on = chosen === choice;
          return (
            <Tappable
              key={choice}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={daysChoiceName(choice, workDays)}
              onPress={() => onDays([...daysOfChoice(choice, workDays)])}
              style={[styles.chip, on ? styles.chipOn : null]}
            >
              <AppText variant={on ? 'labelStrong' : 'label'} color={on ? theme.color.onActionContainer : theme.color.ink}>
                {daysChoiceName(choice, workDays)}
              </AppText>
            </Tappable>
          );
        })}
      </View>
    </View>
  );
}

export const DayToggles = memo(DayTogglesComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    days: { gap: 14 },
    // Two by two, each half the width: one even block, every target 48 high.
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    // As a form's label chips: the chip's corner, the control's edge on the field's veil; chosen, the primary's wash within its edge.
    chip: { flexBasis: '47%', flexGrow: 1, minHeight: 48, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.color.edge, backgroundColor: theme.color.fieldVeil, ...corners(SHAPES.chip) },
    chipOn: { borderColor: theme.color.focus, backgroundColor: theme.color.actionContainer },
  });
