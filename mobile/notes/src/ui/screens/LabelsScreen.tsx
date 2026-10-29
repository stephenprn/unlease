/** Labels: create, rename, recolour, delete (undoable; a deleted label leaves every note). */
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, StyleSheet, TextInput, View } from 'react-native';

import { createLabel, deleteLabel, updateLabel } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@app/store/uiStore';

import { SHAPES } from '@unlease/design/shapes';
import { t, tc } from '@unlease/core/i18n';
import { labelNameTaken } from '@unlease/notes/models/entities';

import { AppText, Ground, Icon, IconButton, LabelTag, Organic, Sheet, Tappable, TopBar } from '../components';
import { LineColorPicker } from '../features/lines/LineColorPicker';
import type { ScreenProps } from '../navigation/types';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { variantStyle } from '../theme/typography';

export function LabelsScreen({ navigation }: ScreenProps<'Labels'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const order = useLibraryStore(s => s.labelOrder);
  const [name, setName] = useState('');
  const [coloring, setColoring] = useState<string | null>(null);
  const coloringLabel = useLibraryStore(s => (coloring ? s.labels[coloring] : undefined));

  const add = () => {
    if (!name.trim()) return;
    if (labelNameTaken(useLibraryStore.getState().labels, name)) {
      showSnack(t('Ce label existe déjà'), undefined, { tone: 'warning' });
      return;
    }
    createLabel(name);
    setName('');
  };
  // The keyboard would cover the colours: they are picked, not typed.
  const openColors = (id: string) => {
    Keyboard.dismiss();
    setColoring(id);
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Labels')} onBack={() => navigation.goBack()} />
      <Organic style={styles.newRow}>
        {/* The tag every label wears, as the link strip leads with a link. */}
        <View style={styles.newGlyph}>
          <Icon name="tag" size={24} color={theme.color.ink} />
        </View>
        <TextInput
          value={name}
          onChangeText={setName}
          onSubmitEditing={add}
          placeholder={t('Créer un label')}
          placeholderTextColor={theme.color.inkFaint}
          selectionColor={theme.color.highlight}
          selectionHandleColor={theme.color.focus}
          cursorColor={theme.color.focus}
          maxLength={60}
          returnKeyType="done"
          style={[variantStyle(theme, 'body'), styles.input]}
        />
        {name ? <IconButton icon="check" label={t('Enregistrer')} onPress={add} /> : null}
      </Organic>
      {/* Edge to edge: the lower rows' fields would stay under the keyboard. */}
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <FlatList
        data={order}
        keyExtractor={id => id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <LabelRow id={item} onColor={() => openColors(item)} />}
        ListEmptyComponent={
          <AppText variant="meta" style={styles.empty}>
            {t('Les labels regroupent des notes sur le tableau. Une note peut en porter plusieurs.')}
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

function LabelRow({ id, onColor }: { id: string; onColor: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const label = useLibraryStore(s => s.labels[id]);
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
    const name = text.trim();
    if (!name || name === current.name) {
      setDraft(current.name);
      return;
    }
    if (labelNameTaken(useLibraryStore.getState().labels, name, id)) {
      showSnack(t('Ce label existe déjà'), undefined, { tone: 'warning' });
      setDraft(current.name);
      return;
    }
    updateLabel(id, { name });
  };
  const commitOnLeave = useRef(commit);
  commitOnLeave.current = commit;
  useEffect(() => () => commitOnLeave.current(), []);
  if (!label) return null;
  return (
    <View style={styles.row}>
      <Tappable accessibilityLabel={t('Couleur de {name}', { name: label.name })} onPress={onColor} hitSlop={2} pebble={1} style={styles.tag}>
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
        maxLength={60}
        style={[variantStyle(theme, 'body'), styles.input]}
        accessibilityLabel={t('Renommer {name}', { name: label.name })}
      />
      <IconButton
        icon="trash"
        label={t('Supprimer {name}', { name: label.name })}
        onPress={() => {
          const undo = deleteLabel(id);
          showSnack(t('Label « {name} » supprimé', { name: label.name }), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
        }}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    fill: { flex: 1 },
    newRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginHorizontal: 12, marginBottom: 8, ...corners(SHAPES.search), backgroundColor: theme.color.field, borderWidth: 1, borderColor: theme.color.outline },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 56 },
    tag: { width: 44, height: 44, margin: 2, alignItems: 'center', justifyContent: 'center' },
    newGlyph: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    input: { flex: 1, height: 52, paddingVertical: 0, color: theme.color.ink },
    empty: { padding: 24, textAlign: 'center' },
    sheet: { paddingHorizontal: 8, paddingBottom: 8 },
  });
