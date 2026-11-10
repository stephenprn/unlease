/** Labels: create, rename, recolour, delete (undoable; a deleted label leaves every note). */
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, StyleSheet, TextInput, View } from 'react-native';

import { createLabel, deleteLabel, updateLabel } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';

import { SHAPES } from '@unlease/design/shapes';
import { t, tc } from '@unlease/core/i18n';
import { labelNameTaken } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';

import { AppText, Ground, ICON_PEBBLE, ICON_SLOP, Icon, IconButton, LabelTag, Organic, Sheet, SHEET_INSET, Tappable, TopBar } from '../components';
import { LineColorPicker } from '@shared/ui/components/LineColorPicker';
import type { ScreenProps } from '../navigation/types';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { variantStyle } from '@shared/ui/theme/typography';

export function LabelsScreen({ navigation }: ScreenProps<'Labels'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const order = useLibraryStore(s => s.labelOrder);
  const [name, setName] = useState('');
  // A name already worn is said under the strip, what was typed kept, until it is changed.
  const [problem, setProblem] = useState<string | null>(null);
  const [coloring, setColoring] = useState<string | null>(null);
  const coloringLabel = useLibraryStore(s => (coloring ? s.labels[coloring] : undefined));

  const add = () => {
    if (!name.trim()) return;
    if (labelNameTaken(useLibraryStore.getState().labels, name)) {
      setProblem(t('Ce label existe déjà : choisissez un autre nom.'));
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
      <Organic style={[styles.newRow, problem ? styles.newRowInvalid : null]}>
        {/* The tag every label wears, as the link strip leads with a link. */}
        <View style={styles.newGlyph}>
          <Icon name="tag" size={24} color={theme.color.ink} />
        </View>
        <TextInput
          value={name}
          onChangeText={text => {
            setName(text);
            setProblem(null);
          }}
          onSubmitEditing={add}
          // The keyboard stays for the next label.
          submitBehavior="submit"
          accessibilityLabel={[t('Nom du nouveau label'), problem].filter(Boolean).join(', ')}
          placeholder={t('Créer un label')}
          placeholderTextColor={theme.color.inkFaint}
          selectionColor={theme.color.highlight}
          selectionHandleColor={theme.color.focus}
          cursorColor={theme.color.focus}
          maxLength={60}
          returnKeyType="done"
          style={[variantStyle(theme, 'body'), styles.input]}
        />
        {name ? <IconButton icon="check" label={t('Créer')} onPress={add} /> : null}
      </Organic>
      {problem ? (
        <View style={styles.problem} accessibilityLiveRegion="polite">
          <Icon name="error" size={16} color={theme.color.danger} />
          <AppText variant="meta" color={theme.color.danger} style={styles.fill}>
            {problem}
          </AppText>
        </View>
      ) : null}
      {/* Edge to edge: the lower rows' fields would stay under the keyboard. */}
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <FlatList
        data={order}
        keyExtractor={id => id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <LabelRow id={item} onColor={() => openColors(item)} onOpen={() => navigation.navigate('Board', { view: `label:${item}` })} />}
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

function LabelRow({ id, onColor, onOpen }: { id: string; onColor: () => void; onOpen: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const label = useLibraryStore(s => s.labels[id]);
  // The notes wearing it, out of the bin, as the web counts them: a press shows them.
  const uses = useLibraryStore(s => s.noteOrder.filter(nid => s.notes[nid]?.labelIds.includes(id) && s.notes[nid]?.trashedAt === null).length);
  const [draft, setDraft] = useState(label?.name ?? '');
  const [focused, setFocused] = useState(false);
  // A rename refused once says why under the row, what was typed kept, until the name is free (the web's way).
  const [refused, setRefused] = useState(false);
  // While it is not typed in (nor refused), the name follows a rename made on another device.
  const [shown, setShown] = useState(label?.name ?? '');
  if (!focused && !refused && label && label.name !== shown) {
    setShown(label.name);
    setDraft(label.name);
  }
  const typedName = draft.trim();
  const taken = !!label && typedName !== '' && typedName !== label.name && labelNameTaken(useLibraryStore.getState().labels, typedName, id);
  const problem = refused && taken ? t('Ce label existe déjà : choisissez un autre nom.') : null;
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
      setRefused(false);
      return;
    }
    if (labelNameTaken(useLibraryStore.getState().labels, name, id)) {
      // Kept as typed and said under the row; nothing is saved.
      setRefused(true);
      return;
    }
    updateLabel(id, { name });
    setRefused(false);
  };
  const commitOnLeave = useRef(commit);
  commitOnLeave.current = commit;
  useEffect(() => () => commitOnLeave.current(), []);
  if (!label) return null;
  return (
    <View>
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
          maxLength={60}
          style={[variantStyle(theme, 'body'), styles.input]}
          accessibilityLabel={[t('Renommer {name}', { name: label.name }), problem].filter(Boolean).join(', ')}
        />
        <Tappable onPress={onOpen} hitSlop={ICON_SLOP} style={styles.count} accessibilityRole="link" accessibilityLabel={t('{notes} avec {name}', { notes: plural(uses, 'note'), name: label.name })}>
          <AppText variant="metaStrong" style={styles.tabular}>
            {uses}
          </AppText>
        </Tappable>
        <IconButton
          icon="trash"
          label={t('Supprimer {name}', { name: label.name })}
          shape={2}
          onPress={() => {
            const undo = deleteLabel(id);
            showSnack(t('Label « {name} » supprimé', { name: label.name }), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
          }}
        />
      </View>
      {problem ? (
        <View style={[styles.problem, styles.rowProblem]} accessibilityLiveRegion="polite">
          <Icon name="error" size={16} color={theme.color.danger} />
          <AppText variant="meta" color={theme.color.danger} style={styles.fill}>
            {problem}
          </AppText>
        </View>
      ) : null}
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
    empty: { padding: 24, textAlign: 'center' },
    // The edge thickens; the padding gives back what it takes, so the text never moves.
    newRowInvalid: { borderWidth: 2, borderColor: theme.color.danger, paddingHorizontal: 3 },
    problem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: 16, marginTop: -2, marginBottom: 8 },
    // Under the name it concerns: its words start where the name's do (the row's 17, the tag's 48).
    rowProblem: { marginLeft: 17 + 48, marginRight: 16 },
    // The count's target, its number at the end of the name's column.
    count: { minWidth: 40, height: 48, alignItems: 'center', justifyContent: 'center', ...corners(SHAPES.tab) },
    tabular: { fontVariant: ['tabular-nums'] },
    // The colours on the sheet's column, under its title.
    sheet: { paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  });
