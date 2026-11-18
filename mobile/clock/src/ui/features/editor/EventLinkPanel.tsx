/**
 * An alarm for an Agenda event, in the editor (in place of the days: it rings once): the event it is
 * for and when that is, « Délier » to make it an alarm of its own, then how long before the event it
 * rings, as the presets' chips (30 min, 1 h, 1 h 30, 2 h). Its wheels move it too, the link kept.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { spanWords } from '@unlease/calendar/services/today';
import { SHAPES } from '@unlease/design/shapes';
import { BEFORE_CHOICES } from '@unlease/clock/services/editor';
import { beforeWords, forEventWords } from '@unlease/clock/services/words';
import { AppText, Button, Icon, Tappable } from '@shared/ui/components';
import { Section } from '@shared/ui/features/settings/Section';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

interface Props {
  readonly title: string;
  /** When the event is (« mar. 17 nov., 07:45 »); '' when it is not on this phone (yet). */
  readonly when: string;
  readonly before: number;
  readonly onBefore: (minutes: number) => void;
  readonly onUnlink: () => void;
}

function EventLinkPanelComponent({ title, when, before, onBefore, onUnlink }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.panel}>
      <Section>
        <View style={styles.row}>
          <Icon name="today" size={24} color={theme.color.ink} />
          <View style={styles.words}>
            <AppText variant="bodyStrong" numberOfLines={2}>
              {forEventWords(title)}
            </AppText>
            <AppText variant="meta">{[when, beforeWords(before)].filter(Boolean).join(' · ')}</AppText>
          </View>
          <Button kind="text" small label={t('Unlink')} onPress={onUnlink} />
        </View>
      </Section>
      <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={t('Rings before the event')}>
        {BEFORE_CHOICES.map(minutes => {
          const on = before === minutes;
          return (
            <Tappable
              key={minutes}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t('Rings {span} before', { span: spanWords(minutes) })}
              onPress={() => onBefore(minutes)}
              style={[styles.chip, on ? styles.chipOn : null]}
            >
              <AppText variant={on ? 'labelStrong' : 'label'} color={on ? theme.color.onActionContainer : theme.color.ink}>
                {spanWords(minutes)}
              </AppText>
            </Tappable>
          );
        })}
      </View>
    </View>
  );
}

export const EventLinkPanel = memo(EventLinkPanelComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    panel: { gap: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 72, paddingLeft: 16, paddingRight: 8, paddingVertical: 10 },
    words: { flex: 1, gap: 2 },
    // As the days' quick choices: two by two, every target 48 high.
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { flexBasis: '47%', flexGrow: 1, minHeight: 48, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.color.edge, backgroundColor: theme.color.fieldVeil, ...corners(SHAPES.chip) },
    chipOn: { borderColor: theme.color.focus, backgroundColor: theme.color.actionContainer },
  });
