/** « Gérer les libellés »: create, rename, recolour, delete (undoable; a deleted label leaves every contact). */
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, StyleSheet, TextInput, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t, tc } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { CONTACT_LIMITS } from '@unlease/contacts/models/contacts';
import { useLabelCounts } from '@app/hooks/useContacts';
import { createLabel, deleteLabel, labelNameTaken, updateLabel } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Ground, ICON_PEBBLE, ICON_SLOP, Icon, IconButton, LabelTag, LineColorPicker, Organic, Sheet, SHEET_INSET, Tappable, TopBar } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { variantStyle } from '@shared/ui/theme/typography';
import type { ScreenProps } from '../navigation/types';

export function LabelsScreen({ navigation }: ScreenProps<'Labels'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const order = useLibraryStore(s => s.labelOrder);
  const [name, setName] = useState('');
  const [coloring, setColoring] = useState<string | null>(null);
  const coloringLabel = useLibraryStore(s => (coloring ? s.labels[coloring] : undefined));

  const add = (): void => {
    if (!name.trim()) return;
    if (labelNameTaken(name)) {
      showSnack(t('Ce libellé existe déjà'), undefined, { tone: 'warning' });
      return;
    }
    createLabel(name);
    setName('');
  };
  // The keyboard would cover the colours: they are picked, not typed.
  const openColors = (id: string): void => {
    Keyboard.dismiss();
    setColoring(id);
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Libellés')} onBack={() => navigation.goBack()} />
      <Organic style={styles.newRow}>
        <View style={styles.newGlyph}>
          <Icon name="tag" size={24} color={theme.color.ink} />
        </View>
        <TextInput
          value={name}
          onChangeText={setName}
          onSubmitEditing={add}
          placeholder={t('Créer un libellé')}
          accessibilityLabel={t('Nom du nouveau libellé')}
          autoCapitalize="sentences"
          // The keyboard stays up for the next one.
          submitBehavior="submit"
          placeholderTextColor={theme.color.inkFaint}
          selectionColor={theme.color.highlight}
          selectionHandleColor={theme.color.focus}
          cursorColor={theme.color.focus}
          maxLength={CONTACT_LIMITS.labelName}
          returnKeyType="done"
          style={[variantStyle(theme, 'body'), styles.input]}
        />
        {name.trim() ? <IconButton icon="check" label={t('Créer')} onPress={add} /> : null}
      </Organic>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <FlatList
          data={order}
          keyExtractor={id => id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <LabelRow id={item} onColor={() => openColors(item)} onOpen={() => navigation.navigate('Contacts', { label: item })} />}
          ListEmptyComponent={
            <AppText variant="meta" style={styles.empty}>
              {t('Les libellés regroupent des contacts : la famille, le travail, le club. Un contact peut en porter plusieurs.')}
            </AppText>
          }
        />
      </KeyboardAvoidingView>
      <Sheet visible={coloring !== null} onDismiss={() => setColoring(null)} title={coloringLabel?.name ?? t('Couleur')}>
        <View style={styles.sheet}>
          <LineColorPicker
            value={coloringLabel?.color ?? null}
            onChange={color => {
              if (coloring && color) updateLabel(coloring, { color });
              setColoring(null);
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

function LabelRow({ id, onColor, onOpen }: { id: string; onColor: () => void; onOpen: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const label = useLibraryStore(s => s.labels[id]);
  const count = useLabelCounts()[id] ?? 0;
  const [draft, setDraft] = useState(label?.name ?? '');
  const [focused, setFocused] = useState(false);
  // While it is not typed in, the name follows a rename made on another device.
  const [shown, setShown] = useState(label?.name ?? '');
  if (!focused && label && label.name !== shown) {
    setShown(label.name);
    setDraft(label.name);
  }
  // What is typed is saved on leaving the field, and on leaving the screen with the field still open.
  const typed = useRef<string | null>(null);
  const commit = (): void => {
    const text = typed.current;
    typed.current = null;
    const current = useLibraryStore.getState().labels[id];
    if (text === null || !current || current.deletedAt !== null) return;
    const next = text.trim();
    if (!next || next === current.name) {
      setDraft(current.name);
      return;
    }
    if (labelNameTaken(next, id)) {
      showSnack(t('Ce libellé existe déjà'), undefined, { tone: 'warning' });
      setDraft(current.name);
      return;
    }
    updateLabel(id, { name: next });
  };
  const commitOnLeave = useRef(commit);
  commitOnLeave.current = commit;
  useEffect(() => () => commitOnLeave.current(), []);
  if (!label) return null;
  return (
    <View style={styles.row}>
      <Tappable accessibilityLabel={t('Couleur de {name}', { name: label.name })} onPress={onColor} hitSlop={ICON_SLOP} pebble={1} style={ICON_PEBBLE}>
        <LabelTag color={label.color} size={26} />
      </Tappable>
      <TextInput
        value={draft}
        onChangeText={text => {
          typed.current = text;
          setDraft(text);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        selectionColor={theme.color.highlight}
        selectionHandleColor={theme.color.focus}
        cursorColor={theme.color.focus}
        maxLength={CONTACT_LIMITS.labelName}
        style={[variantStyle(theme, 'body'), styles.input]}
        accessibilityLabel={t('Renommer {name}', { name: label.name })}
      />
      <Tappable onPress={onOpen} style={styles.count} accessibilityRole="link" accessibilityLabel={t('Voir les contacts de {name}', { name: label.name })}>
        <AppText variant="meta">{plural(count, 'contact')}</AppText>
      </Tappable>
      <IconButton
        icon="trash"
        label={t('Supprimer {name}', { name: label.name })}
        onPress={() => {
          const undo = deleteLabel(id);
          showSnack(t('Libellé « {name} » supprimé', { name: label.name }), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
        }}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    fill: { flex: 1 },
    newRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginHorizontal: 12, marginBottom: 8, ...corners(SHAPES.search), backgroundColor: theme.color.fieldVeil, borderWidth: 1, borderColor: theme.color.outline },
    // On the new-label field's column (its 12 margin, its edge, its 4): each tag under its glyph, each name under its words.
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, minHeight: 56 },
    newGlyph: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    input: { flex: 1, height: 52, paddingVertical: 0, color: theme.color.ink },
    count: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, ...corners(SHAPES.chip) },
    empty: { padding: 24, textAlign: 'center' },
    // The colour sheet's swatches on its column.
    sheet: { paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  });
