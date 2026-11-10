/**
 * An event's time zone (its hour there, Google's « Fuseau horaire »): the phone's, the usual ones, or
 * any IANA name typed (the list narrows to what is typed); the keyboard's « OK » or the button keeps a
 * typed one, and a name that is no zone is said under the field.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { foldText } from '@unlease/core/services/search';
import { deviceZone, isKnownZone, USUAL_ZONES } from '@unlease/calendar/services/time';
import { later } from '@app/later';

import { Button, ListRow, Sheet, SHEET_INSET, TextField, useForm } from '@shared/ui/components';

/** « europe/paris » typed as it came: the platform's own spelling (« Europe/Paris »). */
function canonicalZone(zone: string): string {
  try {
    return Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone ?? zone;
  } catch {
    return zone;
  }
}

export function ZoneSheet({ visible, zone, onDismiss, onZone }: { visible: boolean; zone: string; onDismiss: () => void; onZone: (zone: string) => void }) {
  const [typed, setTyped] = useState('');
  const own = deviceZone();
  const pick = (chosen: string): void => {
    onZone(chosen);
    onDismiss();
  };
  const name = typed.trim().replace(/ /g, '_');
  const keepTyped = (): void => {
    if (isKnownZone(name)) pick(canonicalZone(name));
  };
  const form = useForm({ zone: isKnownZone(name) ? null : t('Un fuseau comme Europe/Paris ou America/New_York.') }, { sendOnDone: keepTyped });
  const { reset } = form;
  useEffect(() => {
    if (!visible) return;
    setTyped('');
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const wanted = foldText(typed.trim());
  const zones = [...new Set([own, ...USUAL_ZONES].filter(Boolean))].filter(each => !wanted || foldText(each.replace(/_/g, ' ')).includes(wanted.replace(/_/g, ' ')));
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Fuseau horaire')} tall>
      <View style={styles.typed}>
        <View style={styles.field}>
          <TextField kind="code" value={typed} onChangeText={setTyped} placeholder="Europe/Paris" accessibilityLabel={t('Fuseau horaire')} field={form.field('zone')} />
        </View>
        <Button label={t('OK')} kind="tonal" disabled={!typed.trim()} onPress={() => later(form.submit(keepTyped))} style={styles.ok} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        {zones.map(each => (
          <ListRow key={each} title={each.replace(/_/g, ' ')} supporting={each === own ? t('Fuseau de ce téléphone') : undefined} icon={each === zone ? 'check' : 'globe'} onPress={() => pick(each)} />
        ))}
      </ScrollView>
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
