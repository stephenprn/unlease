/**
 * « Météo pour »: where the weather is read as an alarm rings. « Ici »: where the phone last was, to a
 * kilometre or so (Android's coarse location, asked only when it is chosen, saying what it is for);
 * « Un lieu »: the place picked. The place is picked through the suite's place search (`PlaceField`)
 * in either case: « Ici » falls back to it when the phone says nothing of where it is.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import type { Place } from '@unlease/core/sync/places';
import type { WeatherWhere as Where } from '@unlease/clock/models/prefs';
import { later } from '@app/later';
import { selectPrefs, setPrefs, useClockUiStore } from '@app/store/clockUi';
import { showSnack } from '@shared/app/store/uiStore';
import { askCoarseLocation, hasCoarseLocation } from '@platform/location';

import { AppText, PlaceField, Segmented } from '@shared/ui/components';

export function WeatherWhereFields() {
  const prefs = useClockUiStore(selectPrefs);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const picked = useRef(false);

  const check = useCallback(() => {
    hasCoarseLocation().then(setAllowed, () => setAllowed(false));
  }, []);
  useEffect(() => {
    check();
    const subscription = AppState.addEventListener('change', state => state === 'active' && check());
    return () => subscription.remove();
  }, [check]);

  const chooseHere = async (): Promise<void> => {
    const answer = await askCoarseLocation({
      title: t('The weather where you are'),
      message: t('Only for the weather as an alarm rings: where the phone last was, to a kilometre or so, goes to your server, which asks for the forecast.'),
      buttonPositive: t('Continue'),
    });
    if (answer === 'granted') {
      setAllowed(true);
      setPrefs({ weatherWhere: 'phone' });
    } else if (answer === 'blocked') {
      showSnack(t('The location is turned off for this app in Android’s settings.'), { label: t('Open settings'), run: () => later(Linking.openSettings()) }, { tone: 'warning' });
    } else {
      showSnack(t('Without the location, the weather is read for the place below.'), undefined, { tone: 'warning' });
    }
  };
  const choose = (where: Where): void => {
    if (where === 'phone') later(chooseHere());
    else setPrefs({ weatherWhere: 'place' });
  };

  // A place picked from the list has its coordinates; words kept as written have none to read the weather at.
  const onPick = (place: Place): void => {
    picked.current = true;
    if (place.lat !== null && place.lon !== null) setPrefs({ weatherPlace: { label: place.label, lat: place.lat, lon: place.lon } });
    else showSnack(t('Pick a place from the list, so its weather can be found.'), undefined, { tone: 'warning' });
  };
  const onWords = (text: string): void => {
    picked.current = false;
    // The search hands the words, then the place picked, at once: words alone are words kept as written.
    setTimeout(() => {
      if (picked.current) return;
      if (!text.trim()) setPrefs({ weatherPlace: null });
      else if (text !== prefs.weatherPlace?.label) showSnack(t('Pick a place from the list, so its weather can be found.'), undefined, { tone: 'warning' });
    }, 0);
  };

  const here = prefs.weatherWhere === 'phone';
  const help = here
    ? allowed === false
      ? t('The location isn’t allowed: the weather is read for the place below.')
      : t('Where the phone last was, to a kilometre or so.')
    : null;
  return (
    <View style={styles.fields}>
      <View style={styles.field}>
        <AppText variant="metaStrong" style={styles.words}>
          {t('Weather for')}
        </AppText>
        <Segmented
          label={t('Weather for')}
          value={prefs.weatherWhere}
          onChange={choose}
          options={[
            { value: 'phone', label: t('Here') },
            { value: 'place', label: t('A place') },
          ]}
        />
        {help ? (
          <AppText variant="meta" style={styles.words}>
            {help}
          </AppText>
        ) : null}
      </View>
      <PlaceField
        label={here ? t('Otherwise') : t('Place')}
        value={prefs.weatherPlace?.label ?? ''}
        onChangeText={onWords}
        onPick={onPick}
        placeholder={t('Search for a town')}
        help={here ? t('When the phone says nothing of where it is.') : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  // A field as the pickers are: its label, its control and its help 6 apart, the words 4 in.
  field: { gap: 6 },
  words: { marginHorizontal: 4 },
});
