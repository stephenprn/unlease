/**
 * What a number, an email or an address is (« Mobile », « Travail »…), picked in a sheet, or a name of
 * the person's own (« Personnalisé »), typed under the list and kept with the keyboard's « OK » or
 * « Utiliser ce nom », both pinned at the sheet's foot so the keyboard never covers them.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { CONTACT_LIMITS } from '@unlease/contacts/models/contacts';

import { Button, footEdge, FormFoot, Icon, ListRow, Sheet, SHEET_INSET, SheetScroll, TextField } from '@shared/ui/components';
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
      {/* The field's box above draws the footer's edge already. */}
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
    // The footer under the kinds: the field on the sheet's column, its edge across the sheet (as a form's foot's).
    own: { paddingHorizontal: SHEET_INSET, paddingTop: 12, ...footEdge(theme) },
    // The field's gap to its foot.
    ownFoot: { paddingTop: 4 },
  });
