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

import { AppText, Button, CheckMark, Emblem, FormFoot, Sheet, SHEET_INSET, SheetScroll, Tappable, TextField, useForm, useUnsaved } from '../../components';
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
    { title: isBlank(title) ? t('Give the collection a name.') : lineTitleTaken(lines, title) ? t('A collection already has this name: choose another.') : null },
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
    <Sheet visible={visible} onDismiss={cancel} title={t('New collection')} tall>
      <SheetScroll contentContainerStyle={styles.body}>
        {suggestions.length > 0 ? (
          <View style={styles.suggestions}>
            {suggestions.map(s => (
              <Tappable
                key={s.id}
                onPress={() => createSuggested(s)}
                accessibilityLabel={t('Create the {collection} collection', { collection: s.title })}
                style={[styles.suggestion, corners(SHAPES.chip), { borderColor: theme.color.outline, backgroundColor: theme.color.paper }]}
              >
                <Emblem emblem={s.emblem} color={s.color} size={22} />
                <AppText variant="label">{s.title}</AppText>
              </Tappable>
            ))}
          </View>
        ) : null}
        <CollectionPreview emblem={emblem} color={color} title={title.trim() || t('Collection name')} hint={hint.trim() || t('A sentence about what it holds helps Claude file the right links in it.')} />
        <TextField label={t('Name')} kind="text" field={form.field('title')} value={title} onChangeText={setTitle} help={t('E.g. Gifts, Films to watch, Restaurants')} autoFocus maxLength={60} />
        <TextField
          label={t('What goes in this collection')}
          kind="prose"
          field={form.field('hint')}
          value={hint}
          onChangeText={setHint}
          multiline
          maxLength={500}
          help={t('Claude reads this sentence to pick the right collection. E.g. gift ideas for family and friends.')}
        />
        {/* The cut-outs and the swatches say what they are, and the preview above wears them: no word over them, but for TalkBack. */}
        <EmblemPicker value={emblem} color={color} onChange={setEmblem} />
        <View accessibilityRole="radiogroup" accessibilityLabel={t('Colour')}>
          <LineColorPicker value={color} onChange={next => next && setColor(next)} />
        </View>
        {offerFill ? (
          <Tappable onPress={() => setFill(!fill)} accessibilityRole="checkbox" accessibilityState={{ checked: fill }} accessibilityLabel={t('File the links from Unsorted that fit it')} style={styles.fill}>
            <CheckMark checked={fill} />
            <View style={styles.previewText}>
              <AppText variant="body">{t('File the links from Unsorted that fit it')}</AppText>
              <AppText variant="meta">{inboxLinks === 1 ? t('Claude picks from the link in Unsorted.') : t('Claude picks from the {count} links in Unsorted.', { count: inboxLinks })}</AppText>
            </View>
          </Tappable>
        ) : null}
      </SheetScroll>
      <FormFoot message={form.message}>
        <Button kind="text" label={t('Cancel')} onPress={cancel} />
        <Button label={t('Create the collection')} icon="plus" onPress={() => void form.submit(() => create({ title, hint: hint.trim(), color, emblem }))} />
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
