/**
 * Edit a collection. "Non classé" keeps its name, place and tray: only its colour and sentence change.
 * `onSaved` hears whether the name or sentence changed more than a typo: its links may be worth checking.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { type Emblem as EmblemKey } from '@unlease/design/emblems';
import { t } from '@unlease/core/i18n';
import { INBOX_ID, shownHint, shownTitle } from '@unlease/notes/models/entities';
import { asLineColor, type LineColor } from '@unlease/design/colors';
import { meaningChanged } from '@unlease/notes/services/sorting';
import { updateNote } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, Button, Emblem, Sheet, SheetScroll, TextField } from '../../components';
import { EmblemPicker } from './EmblemPicker';
import { LineColorPicker } from './LineColorPicker';
import { collectionEmblem, emblemOf } from '@unlease/notes/models/collections';

export function EditLineSheet({ id, visible, onDismiss, onSaved }: { id: string; visible: boolean; onDismiss: () => void; onSaved?: (meaningChanged: boolean) => void }) {
  const line = useLibraryStore(s => s.notes[id]);
  const [title, setTitle] = useState('');
  const [hint, setHint] = useState('');
  const [color, setColor] = useState<LineColor | null>(null);
  const [emblem, setEmblem] = useState<EmblemKey>('feuille');
  /** The form as it opened: only what the person changed is written, so an edit made elsewhere meanwhile stands. */
  const opened = useRef<Record<string, unknown>>({});
  useEffect(() => {
    if (!visible || !line) return;
    setTitle(line.title);
    setHint(shownHint(line));
    setColor(asLineColor(line.color));
    setEmblem(emblemOf(line.id, line.emblem));
    opened.current = { title: line.title, hint: shownHint(line), color: asLineColor(line.color), emblem: emblemOf(line.id, line.emblem) };
    // Reset only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  if (!line) return null;
  const inbox = id === INBOX_ID;
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Modifier la collection')} tall>
      <SheetScroll contentContainerStyle={styles.body}>
        <View style={styles.preview}>
          <Emblem emblem={inbox ? collectionEmblem(id, null) : emblem} color={color} size={56} />
          <AppText variant="bodyStrong" style={styles.flex} numberOfLines={1}>
            {(inbox ? shownTitle(line) : title) || t('Sans nom')}
          </AppText>
        </View>
        {!inbox ? <TextField label={t('Nom')} value={title} onChangeText={setTitle} maxLength={60} /> : null}
        <TextField
          label={t('Ce qui va dans cette collection')}
          value={hint}
          onChangeText={setHint}
          multiline
          maxLength={500}
          help={t('Claude lit cette phrase pour choisir la bonne collection.')}
        />
        {!inbox ? (
          <>
            <AppText variant="metaStrong">{t('Emblème')}</AppText>
            <EmblemPicker value={emblem} color={color} onChange={setEmblem} />
          </>
        ) : null}
        <AppText variant="metaStrong">{t('Couleur')}</AppText>
        <LineColorPicker value={color} onChange={next => next && setColor(next)} />
        <Button
          label={t('Enregistrer')}
          disabled={!inbox && !title.trim()}
          style={styles.submit}
          onPress={() => {
            const form: Record<string, unknown> = inbox ? { hint: hint.trim(), color } : { title: title.trim(), emblem, hint: hint.trim(), color };
            const changed = Object.fromEntries(Object.entries(form).filter(([field, value]) => value !== opened.current[field]));
            if (Object.keys(changed).length > 0) updateNote(id, changed);
            onDismiss();
            if (Object.keys(changed).length > 0) {
              const before = { title: String(opened.current.title), hint: String(opened.current.hint) };
              onSaved?.(!inbox && meaningChanged(before, { title: title.trim(), hint: hint.trim() }));
            }
          }}
        />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingHorizontal: 8, paddingBottom: 8 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  flex: { flex: 1 },
  submit: { alignSelf: 'flex-end' },
});
