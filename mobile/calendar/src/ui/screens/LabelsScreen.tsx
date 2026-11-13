/**
 * « Gérer les libellés »: create, rename, recolour, delete (undoable; a deleted label leaves every
 * event). The screen's pieces are the suite's (`LabelsEditor`): a name another label has is said
 * under its field, what was typed kept.
 */
import React, { useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { EVENT_LIMITS, isLive, labelNameTaken as takenIn } from '@unlease/calendar/models/events';
import { createLabel, deleteLabel, renameLabel, setLabelColor } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';

import { EmptyState, Ground, LabelEditRow, LabelsList, LineColorPicker, NewLabelStrip, Sheet, SHEET_INSET, TopBar } from '@shared/ui/components';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import type { ScreenProps } from '../navigation/types';

/** Whether a live label has that name already (another than `except`). */
function labelNameTaken(name: string, except: string | null = null): boolean {
  return takenIn(useLibraryStore.getState().calendarLabels, name, except);
}

/** How many live events wear each label. */
function useLabelCounts(): Readonly<Record<string, number>> {
  const events = useLibraryStore(s => s.events);
  const counts: Record<string, number> = {};
  for (const event of Object.values(events)) if (isLive(event) && !event.recurringId) for (const id of event.labelIds) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

export function LabelsScreen({ navigation }: ScreenProps<'Labels'>) {
  const styles = useThemedStyles(makeStyles);
  const order = useLibraryStore(s => s.calendarLabelOrder);
  const [coloring, setColoring] = useState<string | null>(null);
  const coloringLabel = useLibraryStore(s => (coloring ? s.calendarLabels[coloring] : undefined));

  // The keyboard would cover the colours: they are picked, not typed.
  const openColors = (id: string): void => {
    Keyboard.dismiss();
    setColoring(id);
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Labels')} onBack={() => navigation.goBack()} />
      <NewLabelStrip
        placeholder={t('Create label')}
        accessibilityLabel={t('New label’s name')}
        submitLabel={t('Create')}
        takenMessage={t('This label already exists: choose another name.')}
        maxLength={EVENT_LIMITS.labelName}
        isTaken={name => labelNameTaken(name)}
        onCreate={name => {
          createLabel(name);
        }}
      />
      <LabelsList
        order={order}
        renderRow={id => <LabelRow id={id} onColor={() => openColors(id)} onOpen={() => navigation.navigate('Calendar', { label: id })} />}
        empty={<EmptyState scene="label" title={t('No labels')} text={t('Make one to sort your events: Work, Family, Sport…')} />}
      />
      <Sheet visible={coloring !== null} onDismiss={() => setColoring(null)} title={coloringLabel?.name ?? t('Colour')}>
        <View style={styles.sheet}>
          <LineColorPicker
            value={coloringLabel?.color ?? null}
            onChange={color => {
              if (coloring && color) setLabelColor(coloring, color);
              setColoring(null);
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

function LabelRow({ id, onColor, onOpen }: { id: string; onColor: () => void; onOpen: () => void }) {
  const label = useLibraryStore(s => s.calendarLabels[id]);
  const count = useLabelCounts()[id] ?? 0;
  if (!label) return null;
  return (
    <LabelEditRow
      name={label.name}
      color={label.color}
      maxLength={EVENT_LIMITS.labelName}
      words={{
        color: t('Colour of {name}', { name: label.name }),
        rename: t('Rename {name}', { name: label.name }),
        remove: t('Delete {name}', { name: label.name }),
        taken: t('This label already exists: choose another name.'),
      }}
      stored={() => {
        const current = useLibraryStore.getState().calendarLabels[id];
        return current && current.deletedAt === null ? current.name : null;
      }}
      isTaken={name => labelNameTaken(name, id)}
      onRename={name => renameLabel(id, name)}
      onColor={onColor}
      onDelete={() => {
        const undo = deleteLabel(id);
        showSnack(t('Label “{name}” deleted', { name: label.name }), { label: t('Undo'), run: undo }, { tone: 'success' });
      }}
      count={{ text: plural(count, 'event'), label: t('See {name}’s events', { name: label.name }), onPress: onOpen }}
    />
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    // The colours on the sheet's column, under its title.
    sheet: { paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  });
