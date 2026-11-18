/**
 * A world clock opened: its name, which the person may change (« Maman » rather than « Montréal »;
 * emptied, the city's comes back), where it is and its zone in meta, and « Retirer ». « OK » keeps
 * the name typed.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { WORLD_CLOCK_LIMITS, type WorldClock } from '@unlease/clock/models/worldClock';
import { countryName } from '@unlease/clock/services/worldClocks';
import { removeCity, renameCity } from '@app/store/actions';
import { AppText, Button, FormFoot, Sheet, SHEET_INSET, TextField } from '@shared/ui/components';

interface Props {
  readonly clock: WorldClock | null;
  readonly onDismiss: () => void;
}

export function CitySheet({ clock, onDismiss }: Props) {
  const [name, setName] = useState(clock?.name ?? '');
  useEffect(() => {
    if (clock) setName(clock.name);
  }, [clock]);
  const keep = (): void => {
    if (clock) renameCity(clock.id, name);
    onDismiss();
  };
  const remove = (): void => {
    if (clock) removeCity(clock.id);
    onDismiss();
  };
  const where = clock ? [countryName(clock.country), clock.zone.replace(/_/g, ' ')].filter(Boolean).join(' · ') : '';
  return (
    <Sheet visible={clock !== null} onDismiss={onDismiss} title={clock?.name ?? ''}>
      <View style={styles.body}>
        <AppText variant="meta">{where}</AppText>
        <TextField kind="text" label={t('Name')} value={name} onChangeText={setName} maxLength={WORLD_CLOCK_LIMITS.name} placeholder={t('Mum, office…')} returnKeyType="done" onSubmitEditing={keep} />
      </View>
      <FormFoot>
        <Button kind="dangerText" icon="trash" label={t('Remove')} onPress={remove} />
        <Button label={t('OK')} onPress={keep} />
      </FormFoot>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SHEET_INSET, paddingBottom: 16, gap: 16 },
});
