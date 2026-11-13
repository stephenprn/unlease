/**
 * Edit a collection. "Non classé" keeps its name, place and tray: only its colour and sentence change.
 * `onSaved` hears whether the name or sentence changed more than a typo: its links may be worth checking.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { type Emblem as EmblemKey } from '@unlease/design/emblems';
import { t } from '@unlease/core/i18n';
import { isBlank } from '@unlease/core/services/formChecks';
import { INBOX_ID, lineTitleTaken, shownHint, shownTitle } from '@unlease/notes/models/entities';
import { asLineColor, type LineColor } from '@unlease/design/colors';
import { meaningChanged } from '@unlease/notes/services/sorting';
import { useLines } from '@app/hooks/useLines';
import { updateNote } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';

import { Button, FormFoot, Sheet, SHEET_INSET, SheetScroll, TextField, useForm, useUnsaved } from '../../components';
import { CollectionPreview } from './CollectionPreview';
import { EmblemPicker } from './EmblemPicker';
import { LineColorPicker } from '@shared/ui/components/LineColorPicker';
import { collectionEmblem, emblemOf } from '@unlease/notes/models/collections';

export function EditLineSheet({ id, visible, onDismiss, onSaved }: { id: string; visible: boolean; onDismiss: () => void; onSaved?: (meaningChanged: boolean) => void }) {
  const line = useLibraryStore(s => s.notes[id]);
  const [title, setTitle] = useState('');
  const [hint, setHint] = useState('');
  const [color, setColor] = useState<LineColor | null>(null);
  const [emblem, setEmblem] = useState<EmblemKey>('feuille');
  /** The form as it opened: only what the person changed is written, so an edit made elsewhere meanwhile stands. */
  const [opened, setOpened] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (!visible || !line) return;
    setTitle(line.title);
    setHint(shownHint(line));
    setColor(asLineColor(line.color));
    setEmblem(emblemOf(line.id, line.emblem));
    setOpened({ title: line.title, hint: shownHint(line), color: asLineColor(line.color), emblem: emblemOf(line.id, line.emblem) });
    // Reset only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const inbox = id === INBOX_ID;
  const lines = useLines();
  // A name it already had is never refused (two collections that came to share one keep it until renamed).
  const renamedTo = !inbox && 'title' in opened && title.trim() !== String(opened.title).trim();
  const titleProblem = inbox ? null : isBlank(title) ? t('Give the collection a name.') : renamedTo && lineTitleTaken(lines, title, id) ? t('A collection already has this name: choose another.') : null;
  const form = useForm({ title: titleProblem }, { order: inbox ? ['hint'] : ['title', 'hint'] });
  const dirty = visible && 'title' in opened && (title !== opened.title || hint !== opened.hint || color !== opened.color || emblem !== opened.emblem);
  const unsaved = useUnsaved(dirty);
  const cancel = unsaved.guard(onDismiss);
  if (!line) return null;
  const save = () => {
    const values: Record<string, unknown> = inbox ? { hint: hint.trim(), color } : { title: title.trim(), emblem, hint: hint.trim(), color };
    const changed = Object.fromEntries(Object.entries(values).filter(([field, value]) => value !== opened[field]));
    if (Object.keys(changed).length > 0) updateNote(id, changed);
    onDismiss();
    if (Object.keys(changed).length > 0) {
      const before = { title: String(opened.title), hint: String(opened.hint) };
      onSaved?.(!inbox && meaningChanged(before, { title: title.trim(), hint: hint.trim() }));
    }
  };
  return (
    <>
    <Sheet visible={visible} onDismiss={cancel} title={t('Edit the collection')} tall>
      <SheetScroll contentContainerStyle={styles.body}>
        <CollectionPreview
          emblem={inbox ? collectionEmblem(id, null) : emblem}
          color={color}
          title={(inbox ? shownTitle(line) : title.trim()) || t('No name')}
          hint={hint.trim() || t('A sentence about what it holds helps Claude file the right links in it.')}
        />
        {!inbox ? <TextField label={t('Name')} kind="text" field={form.field('title')} value={title} onChangeText={setTitle} maxLength={60} /> : null}
        <TextField
          label={t('What goes in this collection')}
          kind="prose"
          field={form.field('hint')}
          value={hint}
          onChangeText={setHint}
          multiline
          maxLength={500}
          help={t('Claude reads this sentence to pick the right collection.')}
        />
        {/* The cut-outs and the swatches say what they are, and the preview above wears them: no word over them, but for TalkBack. */}
        {!inbox ? <EmblemPicker value={emblem} color={color} onChange={setEmblem} /> : null}
        <View accessibilityRole="radiogroup" accessibilityLabel={t('Colour')}>
          <LineColorPicker value={color} onChange={next => next && setColor(next)} />
        </View>
      </SheetScroll>
      <FormFoot message={form.message}>
        <Button kind="text" label={t('Cancel')} onPress={cancel} />
        <Button label={t('Save')} onPress={() => void form.submit(save)} />
      </FormFoot>
    </Sheet>
    {unsaved.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
});
