/**
 * A new collection. Its sentence tells Claude what belongs in it, which is what makes filing
 * reliable; its emblem and gouache are how the owner spots it. When "Non classé" holds links,
 * Claude moves those that belong in it there (ticked by default, undone from the slip).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { type Emblem as EmblemKey } from '@unlease/design/emblems';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { asLineColor, nextLineColor, type LineColor } from '@unlease/design/colors';
import { suggestionsFor, type SuggestedCollection, nextEmblem } from '@unlease/notes/models/collections';
import { INBOX_ID } from '@unlease/notes/models/entities';
import { sortable } from '@unlease/notes/services/sorting';
import { createLine } from '@app/store/actions';
import { useLines } from '@app/hooks/useLines';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectCanRead, useSettingsStore } from '@app/store/settingsStore';
import { selectSorting, useUiStore } from '@app/store/uiStore';

import { AppText, Button, Emblem, Icon, Sheet, SheetScroll, Tappable, TextField } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';
import { EmblemPicker } from './EmblemPicker';
import { LineColorPicker } from './LineColorPicker';
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
  const reading = useSettingsStore(selectCanRead);
  const inboxLinks = useLibraryStore(s => (s.linksByNote[INBOX_ID] ?? []).filter(id => s.links[id] && sortable(s.links[id]!)).length);
  const sorting = useUiStore(selectSorting);
  const offerFill = reading && inboxLinks > 0 && !sorting;

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setHint('');
    setFill(true);
    setColor(nextLineColor(lines.map(line => asLineColor(line.color))));
    setEmblem(nextEmblem(lines));
    // Reset only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const suggestions = suggestionsFor(lines);

  const create = (init: { id?: string; title: string; hint: string; color: LineColor; emblem: EmblemKey; code?: string }) => {
    const id = createLine(init);
    onDismiss();
    onCreated?.(id);
    if (offerFill && fill) fillLineOnSlip(id);
  };
  const createSuggested = (s: SuggestedCollection) => create(s);

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Nouvelle collection')} tall>
      <SheetScroll contentContainerStyle={styles.body}>
        <AppText variant="body" color={theme.color.inkMuted}>
          {t('Une collection rassemble des liens du même genre : vêtements, films, restaurants… Claude lit chaque lien que vous enregistrez et le range dans la collection qui lui correspond.')}
        </AppText>
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
        <View style={styles.preview}>
          <Emblem emblem={emblem} color={color} size={56} />
          <View style={styles.previewText}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {title.trim() || t('Nom de la collection')}
            </AppText>
            <AppText variant="meta" numberOfLines={2}>
              {hint.trim() || t('Une phrase sur ce qu’elle contient aide Claude à y ranger les bons liens.')}
            </AppText>
          </View>
        </View>
        <TextField label={t('Nom')} value={title} onChangeText={setTitle} placeholder={t('Ex. Cadeaux')} autoFocus maxLength={60} />
        <TextField
          label={t('Ce qui va dans cette collection')}
          value={hint}
          onChangeText={setHint}
          placeholder={t('Ex. idées de cadeaux pour les proches')}
          multiline
          maxLength={500}
          help={t('Claude lit cette phrase pour choisir la bonne collection.')}
        />
        <AppText variant="metaStrong">{t('Emblème')}</AppText>
        <EmblemPicker value={emblem} color={color} onChange={setEmblem} />
        <AppText variant="metaStrong">{t('Couleur')}</AppText>
        <LineColorPicker value={color} onChange={next => next && setColor(next)} />
        {offerFill ? (
          <Tappable onPress={() => setFill(!fill)} accessibilityRole="checkbox" accessibilityState={{ checked: fill }} accessibilityLabel={t('Y ranger les liens de Non classé qui lui correspondent')} style={styles.fill}>
            <Icon name={fill ? 'boxChecked' : 'box'} size={22} color={fill ? theme.color.inkMuted : theme.color.ink} />
            <View style={styles.previewText}>
              <AppText variant="body">{t('Y ranger les liens de Non classé qui lui correspondent')}</AppText>
              <AppText variant="meta">{inboxLinks === 1 ? t('Claude choisit parmi le lien de Non classé.') : t('Claude choisit parmi les {count} liens de Non classé.', { count: inboxLinks })}</AppText>
            </View>
          </Tappable>
        ) : null}
        <Button label={t('Créer la collection')} icon="plus" disabled={!title.trim()} onPress={() => create({ title, hint: hint.trim(), color, emblem })} style={styles.submit} />
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingHorizontal: 8, paddingBottom: 8 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestion: { minHeight: 44, paddingLeft: 12, paddingRight: 15, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  previewText: { flex: 1, gap: 2 },
  fill: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: -2, paddingHorizontal: 2, paddingVertical: 6, ...corners(SHAPES.tab) },
  submit: { alignSelf: 'flex-end' },
});
