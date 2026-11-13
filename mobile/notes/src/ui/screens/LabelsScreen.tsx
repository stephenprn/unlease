/** Labels: create, rename, recolour, delete (undoable; a deleted label leaves every note). The screen's pieces are the suite's (`LabelsEditor`). */
import React, { useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { createLabel, deleteLabel, updateLabel } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';

import { t, tc } from '@unlease/core/i18n';
import { labelNameTaken } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';

import { EmptyState, Ground, LabelEditRow, LabelsList, NewLabelStrip, Sheet, SHEET_INSET, TopBar } from '../components';
import { LineColorPicker } from '@shared/ui/components/LineColorPicker';
import type { ScreenProps } from '../navigation/types';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** Whether a live label other than `except` wears that name already. */
const nameTaken = (name: string, except?: string): boolean => labelNameTaken(useLibraryStore.getState().labels, name, except);

export function LabelsScreen({ navigation }: ScreenProps<'Labels'>) {
  const styles = useThemedStyles(makeStyles);
  const order = useLibraryStore(s => s.labelOrder);
  const [coloring, setColoring] = useState<string | null>(null);
  const coloringLabel = useLibraryStore(s => (coloring ? s.labels[coloring] : undefined));

  // The keyboard would cover the colours: they are picked, not typed.
  const openColors = (id: string) => {
    Keyboard.dismiss();
    setColoring(id);
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={tc('notes', 'Labels')} onBack={() => navigation.goBack()} />
      {/* The tag every label wears leads the strip, as the link strip leads with a link. */}
      <NewLabelStrip
        placeholder={t('Create a label')}
        accessibilityLabel={tc('notes', 'New label’s name')}
        submitLabel={t('Create')}
        takenMessage={tc('notes', 'This label already exists: choose another name.')}
        maxLength={60}
        isTaken={name => nameTaken(name)}
        onCreate={name => {
          createLabel(name);
        }}
      />
      <LabelsList
        order={order}
        renderRow={id => <LabelRow id={id} onColor={() => openColors(id)} onOpen={() => navigation.navigate('Board', { view: `label:${id}` })} />}
        empty={<EmptyState scene="label" title={tc('notes', 'No labels')} text={t('Labels group notes on the board. A note can wear several.')} />}
      />
      <Sheet visible={coloring !== null} onDismiss={() => setColoring(null)} title={coloringLabel?.name ?? t('Colour')}>
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
  const label = useLibraryStore(s => s.labels[id]);
  // The notes wearing it, out of the bin, as the web counts them: a press shows them.
  const uses = useLibraryStore(s => s.noteOrder.filter(nid => s.notes[nid]?.labelIds.includes(id) && s.notes[nid]?.trashedAt === null).length);
  if (!label) return null;
  return (
    <LabelEditRow
      name={label.name}
      color={label.color}
      maxLength={60}
      words={{
        color: t('Colour of {name}', { name: label.name }),
        rename: t('Rename {name}', { name: label.name }),
        remove: t('Delete {name}', { name: label.name }),
        taken: tc('notes', 'This label already exists: choose another name.'),
      }}
      stored={() => {
        const current = useLibraryStore.getState().labels[id];
        return current && current.deletedAt === null ? current.name : null;
      }}
      isTaken={name => nameTaken(name, id)}
      onRename={name => updateLabel(id, { name })}
      onColor={onColor}
      onDelete={() => {
        const undo = deleteLabel(id);
        showSnack(tc('notes', 'Label “{name}” deleted', { name: label.name }), { label: t('Undo'), run: undo }, { tone: 'success' });
      }}
      count={{ text: String(uses), numeric: true, label: t('{notes} with {name}', { notes: plural(uses, 'note'), name: label.name }), onPress: onOpen }}
    />
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    // The colours on the sheet's column, under its title.
    sheet: { paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  });
