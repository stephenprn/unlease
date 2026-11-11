/**
 * A new collection. Its sentence tells Claude what belongs in it, which is what makes filing
 * reliable; its emblem and gouache are how the owner spots it. When "Non classé" holds links,
 * Claude moves those that belong in it there (ticked by default, undone from the slip).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { type Emblem as EmblemKey } from '@unlease/design/emblems';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { isBlank } from '@unlease/core/services/formChecks';
import { asLineColor, nextLineColor, type LineColor } from '@unlease/design/colors';
import { suggestionsFor, type SuggestedCollection, nextEmblem } from '@unlease/notes/models/collections';
import { INBOX_ID, lineTitleTaken } from '@unlease/notes/models/entities';
import { sortable } from '@unlease/notes/services/sorting';
import { createLine } from '@app/store/actions';
import { useLines } from '@app/hooks/useLines';
import { useLibraryStore } from '@app/store/libraryStore';
import { useServerFeature } from '@shared/app/hooks/useServerFeature';
import { selectSorting, useCaptureStore } from '@app/store/captureStore';

import { AppText, Button, Emblem, FormFoot, Icon, Sheet, SHEET_INSET, SheetScroll, Tappable, TextField, useForm, useUnsaved } from '../../components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { CollectionPreview } from './CollectionPreview';
import { EmblemPicker } from './EmblemPicker';
import { LineColorPicker } from '@shared/ui/components/LineColorPicker';
import { fillLineOnSlip } from './sortingSlips';

export interface NewLineSheetProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
  readonly onCreated?: (id: string) => void;
}

export function NewLineSheet({ visible, onDismiss, onCreated }: NewLineSheetProps) {
  const theme = useTheme();
  const lines = useLines();
  const [title, setTitle] = useState('');
  const [hint, setHint] = useState('');
  const [color, setColor] = useState<LineColor>('yellow');
  const [emblem, setEmblem] = useState<EmblemKey>('feuille');
  const [fill, setFill] = useState(true);
  /** The emblem and colour it opened with: picking others is a change too. */
  const [opened, setOpened] = useState<{ color: LineColor; emblem: EmblemKey } | null>(null);
  // Claude fills it from « Non classé » once the server said it has a key.
  const reading = useServerFeature('claude');
  const inboxLinks = useLibraryStore(s => (s.linksByNote[INBOX_ID] ?? []).filter(id => s.links[id] && sortable(s.links[id]!)).length);
  const sorting = useCaptureStore(selectSorting);
  const offerFill = reading && inboxLinks > 0 && !sorting;

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setHint('');
    setFill(true);
    const start = { color: nextLineColor(lines.map(line => asLineColor(line.color))), emblem: nextEmblem(lines) };
    setColor(start.color);
    setEmblem(start.emblem);
    setOpened(start);
    // Reset only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const suggestions = suggestionsFor(lines);
  const form = useForm(
    { title: isBlank(title) ? t('Donnez un nom à la collection.') : lineTitleTaken(lines, title) ? t('Une collection porte déjà ce nom : choisissez-en un autre.') : null },
    { order: ['title', 'hint'] },
  );
  const dirty = visible && (!isBlank(title) || !isBlank(hint) || (opened !== null && (color !== opened.color || emblem !== opened.emblem)));
  const unsaved = useUnsaved(dirty);
  const cancel = unsaved.guard(onDismiss);

  const create = (init: { id?: string; title: string; hint: string; color: LineColor; emblem: EmblemKey; code?: string }) => {
    const id = createLine(init);
    onDismiss();
    onCreated?.(id);
    if (offerFill && fill) fillLineOnSlip(id);
  };
  const createSuggested = (s: SuggestedCollection) => create(s);

  return (
    <>
    <Sheet visible={visible} onDismiss={cancel} title={t('Nouvelle collection')} tall>
      <SheetScroll contentContainerStyle={styles.body}>
        {suggestions.length > 0 ? (
          <View style={styles.suggestions}>
            {suggestions.map(s => (
              <Tappable
                key={s.id}
                onPress={() => createSuggested(s)}
                accessibilityLabel={t('Créer la collection {collection}', { collection: s.title })}
                style={[styles.suggestion, corners(SHAPES.chip), { borderColor: theme.color.outline, backgroundColor: theme.color.paper }]}
              >
                <Emblem emblem={s.emblem} color={s.color} size={22} />
                <AppText variant="label">{s.title}</AppText>
              </Tappable>
            ))}
          </View>
        ) : null}
        <CollectionPreview emblem={emblem} color={color} title={title.trim() || t('Nom de la collection')} hint={hint.trim() || t('Une phrase sur ce qu’elle contient aide Claude à y ranger les bons liens.')} />
        <TextField label={t('Nom')} kind="text" field={form.field('title')} value={title} onChangeText={setTitle} help={t('Ex. Cadeaux, Films à voir, Restaurants')} autoFocus maxLength={60} />
        <TextField
          label={t('Ce qui va dans cette collection')}
          kind="prose"
          field={form.field('hint')}
          value={hint}
          onChangeText={setHint}
          multiline
          maxLength={500}
          help={t('Claude lit cette phrase pour choisir la bonne collection. Ex. idées de cadeaux pour les proches.')}
        />
        {/* The cut-outs and the swatches say what they are, and the preview above wears them: no word over them, but for TalkBack. */}
        <EmblemPicker value={emblem} color={color} onChange={setEmblem} />
        <View accessibilityRole="radiogroup" accessibilityLabel={t('Couleur')}>
          <LineColorPicker value={color} onChange={next => next && setColor(next)} />
        </View>
        {offerFill ? (
          <Tappable onPress={() => setFill(!fill)} accessibilityRole="checkbox" accessibilityState={{ checked: fill }} accessibilityLabel={t('Y ranger les liens de Non classé qui lui correspondent')} style={styles.fill}>
            <Icon name={fill ? 'boxChecked' : 'box'} size={22} color={fill ? theme.color.inkMuted : theme.color.ink} />
            <View style={styles.previewText}>
              <AppText variant="body">{t('Y ranger les liens de Non classé qui lui correspondent')}</AppText>
              <AppText variant="meta">{inboxLinks === 1 ? t('Claude choisit parmi le lien de Non classé.') : t('Claude choisit parmi les {count} liens de Non classé.', { count: inboxLinks })}</AppText>
            </View>
          </Tappable>
        ) : null}
      </SheetScroll>
      <FormFoot message={form.message}>
        <Button kind="text" label={t('Annuler')} onPress={cancel} />
        <Button label={t('Créer la collection')} icon="plus" onPress={() => void form.submit(() => create({ title, hint: hint.trim(), color, emblem }))} />
      </FormFoot>
    </Sheet>
    {unsaved.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestion: { minHeight: 44, paddingLeft: 12, paddingRight: 15, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' },
  previewText: { flex: 1, gap: 2 },
  // A list row's: its box on the sheet's column, its press 10 out of it.
  fill: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: -10, paddingHorizontal: 10, paddingVertical: 6, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
});
