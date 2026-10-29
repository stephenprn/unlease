/**
 * "Liste de courses": a recipe's ingredients, each ticked, to add to a new checklist or to one
 * already started (the five lately edited). The person unticks what is already in the cupboard;
 * the rest goes in as one gesture, at the quantities of "Pour N personnes". The web's `GroceriesDialog`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { GlyphName } from '@unlease/design/glyphs';
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
import { showSnack } from '@app/store/uiStore';

import { AppText, Button, Icon, Sheet, SheetScroll, Tappable } from '../../components';
import { navigate } from '../../navigation/navigationRef';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';
import { ReadingTrack } from './ReadingTrack';
import { servingsLine, useServings } from './Servings';

type Phase = { readonly kind: 'asking' } | { readonly kind: 'failed'; readonly reason: string } | { readonly kind: 'ready'; readonly answer: RecipeResponse };

/** Checklists offered besides a new one. */
const RECENT_LISTS = 5;

const listTitle = (note: Note) => shownTitle(note).trim() || t('Liste sans titre');

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
        if (!controller.signal.aborted) setPhase({ kind: 'failed', reason: error instanceof Error ? t(error.message) : t('erreur inconnue') });
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
          {t('Lecture des ingrédients…')}
        </AppText>
      </View>
    );
  }
  if (phase.kind === 'failed') {
    return (
      <View style={styles.body}>
        <AppText variant="body" color={theme.color.danger} accessibilityLiveRegion="polite">
          {t('Les ingrédients n’ont pas pu être lus : {reason}', { reason: phase.reason })}
        </AppText>
        <Button
          kind="text"
          label={t('Réessayer')}
          onPress={() => {
            setPhase({ kind: 'asking' });
            setAttempt(value => value + 1);
          }}
          style={styles.end}
        />
      </View>
    );
  }

  const ingredients = phase.answer.ingredients.map(ingredient => scaleIngredient(ingredient, factor));
  const servings = servingsLine(phase.answer.servings, base, factor, unit);
  const ticked = ingredients.filter((_, index) => !skipped.has(index));
  const newTitle = t('Courses : {recipe}', { recipe: link.title || linkShop(link) });
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
    showSnack(t('{items} dans « {list} »', { items: plural(ticked.length, 'ingrédient'), list: picked ? listTitle(picked) : newTitle }), { label: t('Ouvrir'), run: () => navigate('Note', { id: noteId }) }, { tone: 'success' });
  };

  return (
    <SheetScroll contentContainerStyle={styles.body}>
      {servings ? <AppText variant="meta">{servings}</AppText> : null}
      <View>
        {ingredients.map((ingredient, index) => (
          <IngredientRow key={`${index}-${ingredient}`} text={ingredient} ticked={!skipped.has(index)} onToggle={() => toggle(index)} />
        ))}
      </View>
      <View accessibilityRole="radiogroup">
        <AppText variant="section" style={styles.section} accessibilityRole="header">
          {t('Ajouter à')}
        </AppText>
        <TargetRow icon="plus" title={t('Nouvelle liste')} detail={newTitle} chosen={picked === null} onPress={() => setTarget(null)} />
        {lists.map(list => (
          <TargetRow key={list.id} icon="checklist" title={listTitle(list)} chosen={picked?.id === list.id} onPress={() => setTarget(list.id)} />
        ))}
      </View>
      <Button label={ticked.length > 0 ? t('Ajouter {items}', { items: plural(ticked.length, 'ingrédient') }) : t('Ajouter')} icon="basket" disabled={ticked.length === 0} onPress={add} style={styles.end} />
    </SheetScroll>
  );
}

/** The row is the checkbox: an ingredient as the recipe writes it. */
function IngredientRow({ text, ticked, onToggle }: { text: string; ticked: boolean; onToggle: () => void }) {
  const theme = useTheme();
  return (
    <Tappable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: ticked }} accessibilityLabel={text} style={styles.row}>
      <Icon name={ticked ? 'boxChecked' : 'box'} size={22} color={ticked ? theme.color.inkMuted : theme.color.ink} />
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
  body: { gap: 16, paddingHorizontal: 8, paddingBottom: 8 },
  waiting: { gap: 16, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 24, alignItems: 'flex-start' },
  end: { alignSelf: 'flex-end' },
  // In line with the rows' marks.
  section: { paddingHorizontal: 10, paddingBottom: 4 },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 10, paddingVertical: 8, ...corners(SHAPES.tab) },
  target: { minHeight: 56 },
  rowText: { flex: 1, gap: 2 },
});
