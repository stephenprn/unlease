/**
 * A form's own line by its actions: what its save refused (« Le serveur ne répond pas »), or, once
 * sent with fields to correct, how many (`form.message`), so a press that saved nothing never goes
 * unexplained. Its glyph says it as well as its colour; TalkBack hears it from `useForm`.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';
import { Icon } from './Icon';

function FormMessageComponent({ message }: { readonly message?: string | null }) {
  const theme = useTheme();
  if (!message) return null;
  return (
    <View style={styles.line} accessibilityLiveRegion="polite">
      <View style={styles.glyph}>
        <Icon name="error" size={16} color={theme.color.danger} />
      </View>
      <AppText variant="meta" color={theme.color.danger} style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

export const FormMessage = memo(FormMessageComponent);

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: 4 },
  glyph: { marginTop: 1 },
  text: { flex: 1 },
});
