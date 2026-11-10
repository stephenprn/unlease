/**
 * What a number, an email or an address is (« Mobile », « Travail »…), picked in a sheet, or a name of
 * the person's own (« Personnalisé »), typed under the list and kept with the keyboard's « OK » or
 * « Utiliser ce nom », both pinned at the sheet's foot so the keyboard never covers them.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { CONTACT_LIMITS } from '@unlease/contacts/models/contacts';

import { Button, FormFoot, Icon, ListRow, Sheet, SHEET_INSET, SheetScroll, TextField } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

export interface KindChoice {
  readonly kind: string;
  readonly label: string;
}

export function KindSheet({ visible, kinds, names, value, onChange, onDismiss }: { visible: boolean; kinds: readonly string[]; names: Readonly<Record<string, string>>; value: KindChoice; onChange: (choice: KindChoice) => void; onDismiss: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [own, setOwn] = useState(value.label);
  useEffect(() => {
    if (visible) setOwn(value.label);
  }, [visible, value.label]);
  const keepOwn = (): void => {
    if (!own.trim()) return;
    onChange({ kind: 'other', label: own.trim() });
    onDismiss();
  };
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Type')}>
      <SheetScroll keyboardShouldPersistTaps="handled">
        {kinds.map(kind => {
          const chosen = !value.label && value.kind === kind;
          return (
            // The suite's list row, as the calling codes' sheet: 56 high, the words 16 in, the chosen one ticked.
            <ListRow
              key={kind}
              title={names[kind] ?? kind}
              onPress={() => {
                onChange({ kind, label: '' });
                onDismiss();
              }}
              trailing={chosen ? <Icon name="check" size={20} color={theme.color.focus} /> : undefined}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen }}
            />
          );
        })}
      </SheetScroll>
      <View style={styles.own}>
        <TextField kind="text" label={t('Personnalisé')} value={own} onChangeText={setOwn} placeholder={t('Bureau Lyon, Maison de vacances…')} maxLength={CONTACT_LIMITS.entryLabel} returnKeyType="done" onSubmitEditing={keepOwn} />
      </View>
      {/* The foot stands on the column by itself: outside the field's box, which insets it already. */}
      <View style={styles.ownFoot}>
        <FormFoot edge={false}>
          {/* Nothing to use until a name is typed. */}
          <Button label={t('Utiliser ce nom')} kind="tonal" disabled={!own.trim()} onPress={keepOwn} />
        </FormFoot>
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // On the sheet's column, as the suite's other sheets' fields, its hairline as wide as the field (as a form's foot's).
    own: { marginHorizontal: SHEET_INSET, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.hairline },
    // The field's gap to its foot.
    ownFoot: { paddingTop: 4 },
  });
