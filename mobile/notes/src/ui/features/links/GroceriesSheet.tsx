/**
 * "Liste de courses": a recipe's ingredients, each ticked, to add to a new checklist or to one
 * already started (the five lately edited). The person unticks what is already in the cupboard;
 * the rest goes in as one gesture, at the quantities of "Pour N personnes". The web's `GroceriesDialog`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { GlyphName } from '@unlease/design/glyphs';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { shownTitle, type Note } from '@unlease/notes/models/entities';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { plural } from '@unlease/core/services/format';
import { linkShop } from '@unlease/notes/services/modules';
import { scaleIngredient } from '@unlease/notes/services/recipes';
import type { RecipeResponse } from '@unlease/notes/sync/recipe';
import { readRecipe } from '@app/modules';
import { addToChecklist } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Button, CheckMark, FormFoot, Icon, Sheet, SHEET_INSET, SheetScroll, Tappable } from '../../components';
import { navigate } from '../../navigation/navigationRef';
import { corners } from '@shared/ui/theme/shape';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { ReadingTrack } from '@shared/ui/components/ReadingTrack';
import { servingsLine, useServings } from './Servings';

type Phase = { readonly kind: 'asking' } | { readonly kind: 'failed'; readonly reason: string } | { readonly kind: 'ready'; readonly answer: RecipeResponse };

/** Checklists offered besides a new one. */
const RECENT_LISTS = 5;

const listTitle = (note: Note) => shownTitle(note).trim() || t('Untitled list');

export function GroceriesSheet({ id, visible, onDismiss }: { id: string; visible: boolean; onDismiss: () => void }) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={MODULE_NAMES.groceries} tall>
      <GroceriesBody id={id} onDismiss={onDismiss} />
    </Sheet>
  );
}

/** Mounted with the sheet each time it opens: it reads the recipe then (and on "Réessayer"), and drops the question when the sheet goes. */
function GroceriesBody({ id, onDismiss }: { id: string; onDismiss: () => void }) {
  const theme = useTheme();
  const link = useLibraryStore(s => s.links[id]);
  const notes = useLibraryStore(s => s.notes);
  const { factor, base, unit } = useServings(id);
  const [phase, setPhase] = useState<Phase>({ kind: 'asking' });
  const [attempt, setAttempt] = useState(0);
  // What the person unticked, by place in the recipe: everything starts ticked.
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
  /** The checklist chosen; null: a new one. */
  const [target, setTarget] = useState<string | null>(null);
  const lists = useMemo(
    () =>
      Object.values(notes)
        .filter(note => note.kind === 'checklist' && note.deletedAt === null && note.trashedAt === null && !note.archived)
        .sort((a, b) => b.editedAt - a.editedAt)
        .slice(0, RECENT_LISTS),
    [notes],
  );

  useEffect(() => {
    const controller = new AbortController();
    readRecipe(id, false, controller.signal).then(
      answer => {
        if (!controller.signal.aborted) setPhase({ kind: 'ready', answer });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setPhase({ kind: 'failed', reason: error instanceof Error ? t(error.message) : t('unknown error') });
      },
    );
    return () => controller.abort();
  }, [id, attempt]);

  if (!link) return null;

  if (phase.kind === 'asking') {
    return (
      <View style={styles.waiting} accessibilityLiveRegion="polite">
        <ReadingTrack width={120} />
        <AppText variant="body" color={theme.color.inkMuted}>
          {t('Reading the ingredients…')}
        </AppText>
      </View>
    );
  }
  if (phase.kind === 'failed') {
    return (
      <>
        <SheetScroll contentContainerStyle={styles.body}>
          <AppText variant="body" color={theme.color.danger} accessibilityLiveRegion="polite">
            {t('The ingredients couldn’t be read: {reason}', { reason: phase.reason })}
          </AppText>
        </SheetScroll>
        <FormFoot>
          <Button
            kind="text"
            label={t('Try again')}
            onPress={() => {
              setPhase({ kind: 'asking' });
              setAttempt(value => value + 1);
            }}
          />
        </FormFoot>
      </>
    );
  }

  const ingredients = phase.answer.ingredients.map(ingredient => scaleIngredient(ingredient, factor));
  const servings = servingsLine(phase.answer.servings, base, factor, unit);
  const ticked = ingredients.filter((_, index) => !skipped.has(index));
  const newTitle = t('Shopping: {recipe}', { recipe: link.title || linkShop(link) });
  // A list gone from the offer meanwhile (binned, archived elsewhere) leaves the new one chosen.
  const picked = lists.find(list => list.id === target) ?? null;
  const toggle = (index: number) =>
    setSkipped(current => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  const add = () => {
    const noteId = addToChecklist(picked?.id ?? null, newTitle, ticked);
    onDismiss();
    showSnack(t('{items} in “{list}”', { items: plural(ticked.length, 'ingredient'), list: picked ? listTitle(picked) : newTitle }), { label: t('Open'), run: () => navigate('Note', { id: noteId }) }, { tone: 'success' });
  };

  return (
    <>
    <SheetScroll contentContainerStyle={styles.body}>
      {servings ? <AppText variant="meta">{servings}</AppText> : null}
      <View>
        {ingredients.map((ingredient, index) => (
          <IngredientRow key={`${index}-${ingredient}`} text={ingredient} ticked={!skipped.has(index)} onToggle={() => toggle(index)} />
        ))}
      </View>
      <View accessibilityRole="radiogroup">
        <AppText variant="section" style={styles.section} accessibilityRole="header">
          {t('Add to')}
        </AppText>
        <TargetRow icon="plus" title={t('New list')} detail={newTitle} chosen={picked === null} onPress={() => setTarget(null)} />
        {lists.map(list => (
          <TargetRow key={list.id} icon="checklist" title={listTitle(list)} chosen={picked?.id === list.id} onPress={() => setTarget(list.id)} />
        ))}
      </View>
    </SheetScroll>
    <FormFoot>
      <Button kind="text" label={t('Cancel')} onPress={onDismiss} />
      <Button label={ticked.length > 0 ? t('Add {items}', { items: plural(ticked.length, 'ingredient') }) : t('Add')} icon="basket" disabled={ticked.length === 0} onPress={add} />
    </FormFoot>
    </>
  );
}

/** The row is the checkbox: an ingredient as the recipe writes it. */
function IngredientRow({ text, ticked, onToggle }: { text: string; ticked: boolean; onToggle: () => void }) {
  return (
    <Tappable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: ticked }} accessibilityLabel={text} style={styles.row}>
      <CheckMark checked={ticked} />
      <AppText variant="body" style={styles.rowText}>
        {text}
      </AppText>
    </Tappable>
  );
}

/** Where the ingredients go: the chosen one wears the tick in matcha, its row stays on the paper. */
function TargetRow({ icon, title, detail, chosen, onPress }: { icon: GlyphName; title: string; detail?: string; chosen: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Tappable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: chosen }} accessibilityLabel={[title, detail].filter(Boolean).join(', ')} style={[styles.row, styles.target]}>
      <Icon name={icon} size={22} color={theme.color.ink} />
      <View style={styles.rowText}>
        <AppText variant="body" numberOfLines={1}>
          {title}
        </AppText>
        {detail ? (
          <AppText variant="meta" numberOfLines={1}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {chosen ? <Icon name="check" size={22} color={theme.color.focus} /> : null}
    </Tappable>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  waiting: { gap: 16, paddingHorizontal: SHEET_INSET, paddingTop: 8, paddingBottom: 24, alignItems: 'flex-start' },
  // On the sheet's column, with the rows' marks.
  section: { paddingBottom: 4 },
  // A list row's: its mark on the column, its press 10 out of it.
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: -10, paddingHorizontal: 10, paddingVertical: 8, marginVertical: GEOMETRY.rowGap / 2, ...corners(SHAPES.tab) },
  target: { minHeight: 56 },
  rowText: { flex: 1, gap: 2 },
});
