/** A field for a token or a key: hidden as typed, with the eye that shows it. */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';

import { IconButton, TextField } from '../../components';

export interface SecretFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  /** What the eye says it shows ("le jeton", "la clé"), translated. */
  readonly what: string;
  readonly placeholder?: string;
  readonly help?: string;
  readonly error?: string | null;
}

export function SecretField({ label, value, onChangeText, what, placeholder, help, error }: SecretFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <View>
      <TextField
        label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        help={help}
        error={error}
        style={styles.input}
      />
      <View style={styles.eye}>
        <IconButton icon={shown ? 'eyeOff' : 'eye'} label={shown ? t('Masquer {what}', { what }) : t('Afficher {what}', { what })} onPress={() => setShown(visible => !visible)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { paddingRight: 52 },
  eye: { position: 'absolute', right: 2, top: 24 },
});
