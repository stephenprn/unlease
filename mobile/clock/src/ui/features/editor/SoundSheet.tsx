/**
 * An alarm's sound, picked by ear: Clock's own sounds grouped by mood (gentle, classic, lively), each
 * row playing as the alarm would (the alarm stream, at its volume) as it is chosen, the chosen one
 * ticked; then the phone's own alarm sounds (Android's picker) and « Silencieux (vibreur seul) ».
 * What plays stops when the sheet closes.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { isPhoneSound, MOOD_NAMES, phoneSound, readPhoneSound, SILENT, soundName, SOUNDS, type SoundMood } from '@unlease/clock/services/sounds';
import { later } from '@app/later';
import { pickPhoneSound, preview, stopPreview } from '@platform/alarmEngine';

import { AppText, Button, FormFoot, Icon, ListRow, Sheet, SHEET_INSET, SheetScroll } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

const MOODS: readonly SoundMood[] = ['gentle', 'classic', 'lively'];

export interface SoundSheetProps {
  readonly visible: boolean;
  /** The sound chosen: one of `SOUNDS`, `silent`, or a phone's (`phone:<uri>|<name>`). */
  readonly sound: string;
  readonly onSound: (sound: string) => void;
  readonly onDismiss: () => void;
  /** The sheet's title (« Son », « Son d’une nouvelle alarme »). */
  readonly title?: string;
}

export function SoundSheet({ visible, sound, onSound, onDismiss, title }: SoundSheetProps) {
  const theme = useTheme();
  // Closed, whatever plays stops.
  useEffect(() => {
    if (!visible) stopPreview();
  }, [visible]);
  useEffect(() => () => stopPreview(), []);

  const tick = (on: boolean) => (on ? <Icon name="check" size={22} color={theme.color.focus} /> : undefined);
  const choose = (key: string): void => {
    onSound(key);
    if (key === SILENT) stopPreview();
    else preview(key);
  };
  const fromPhone = async (): Promise<void> => {
    stopPreview();
    const picked = await pickPhoneSound(readPhoneSound(sound)?.uri ?? '');
    if (picked) onSound(phoneSound(picked.uri, picked.name));
  };
  const phone = isPhoneSound(sound);

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title ?? t('Sound')} tall>
      <SheetScroll>
        {MOODS.map(mood => (
          <View key={mood}>
            <AppText variant="section" style={styles.mood} accessibilityRole="header">
              {MOOD_NAMES[mood]}
            </AppText>
            {SOUNDS.filter(each => each.mood === mood).map(each => (
              <ListRow
                key={each.key}
                icon="music"
                title={soundName(each.key)}
                onPress={() => choose(each.key)}
                trailing={tick(sound === each.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: sound === each.key }}
              />
            ))}
          </View>
        ))}
        <AppText variant="section" style={styles.mood} accessibilityRole="header">
          {t('Others')}
        </AppText>
        <ListRow
          icon="phone"
          title={t('Phone sound…')}
          supporting={phone ? soundName(sound) : t('One of this phone’s alarm sounds')}
          onPress={() => later(fromPhone())}
          trailing={tick(phone)}
          accessibilityRole="radio"
          accessibilityState={{ selected: phone }}
        />
        <ListRow
          icon="bellOff"
          title={soundName(SILENT)}
          onPress={() => choose(SILENT)}
          trailing={tick(sound === SILENT)}
          accessibilityRole="radio"
          accessibilityState={{ selected: sound === SILENT }}
        />
      </SheetScroll>
      <FormFoot>
        <Button label={t('OK')} onPress={onDismiss} />
      </FormFoot>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // A group's head on the sheet's column, as a settings section's.
  mood: { paddingHorizontal: SHEET_INSET, paddingTop: 12, paddingBottom: 4 },
});
