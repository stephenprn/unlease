/**
 * A fact Claude notes, shaped in a sheet (the web's fact opened in place): its name, what Claude notes
 * in it, and « Réponse », the shape of its answer as a grid of choices (each its glyph and its words:
 * « un nombre »); for a fact already there, « Monter », « Descendre » and « Supprimer l'information »
 * under them. « Ajouter une information » opens it empty. What is typed reaches the page's draft only
 * on « Ajouter » or « OK » (a move takes it along), which the page's own « Enregistrer » then keeps;
 * closing it with changes asks first.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import { TEMPLATE_FIELD_TYPES, TEMPLATE_LIMITS, type TemplateField, type TemplateFieldType } from '@unlease/notes/models/templates';
import { newFieldId, shownFieldAnswer, templateProblems } from '@unlease/notes/services/templates';

import { AppText, Button, FormFoot, Icon, Sheet, SHEET_INSET, SheetScroll, Tappable, TextField, useForm, useUnsaved } from '../../components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { FIELD_TYPE_GLYPHS } from './fieldTypes';
import { TemplateRow } from './TemplateRow';

export interface FieldSheetProps {
  readonly visible: boolean;
  /** The field shaped, or null for a new one. */
  readonly fieldId: string | null;
  /** The template's fields as the draft holds them. */
  readonly fields: readonly TemplateField[];
  /** The fields once this one is added, changed, moved or removed. */
  readonly onChange: (fields: TemplateField[]) => void;
  readonly onDismiss: () => void;
}

export function FieldSheet({ visible, fieldId, fields, onChange, onDismiss }: FieldSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const live = fieldId ? fields.find(field => field.id === fieldId) : undefined;
  // While it sinks away, it shows the field it opened on (even one just removed).
  const held = useRef(live);
  if (visible) held.current = live;
  const existing = visible ? live : held.current;
  const [name, setName] = useState('');
  const [type, setType] = useState<TemplateFieldType>('text');
  const [hint, setHint] = useState('');
  const id = existing?.id ?? newFieldId(fields);
  const candidate: TemplateField = { id, name: name.trim(), type, hint: hint.trim() };
  // Its name is checked against the others' (`templateProblems`, this one last, so the problem is its own).
  const others = fields.filter(field => field.id !== id);
  const problem = templateProblems({ name: '', kind: 'other', fields: [...others, candidate] }, []).fields[id] ?? null;
  const form = useForm({ name: problem }, { order: ['name', 'hint'] });
  // Filled each time it opens, from the field or empty, saying nothing yet.
  useEffect(() => {
    if (!visible) return;
    setName(existing?.name ?? '');
    setType(existing?.type ?? 'text');
    setHint(existing?.hint ?? '');
    form.reset();
    // Only as it opens: a field changed meanwhile is this sheet's own doing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, fieldId]);
  const dirty = visible && (name !== (existing?.name ?? '') || type !== (existing?.type ?? 'text') || hint !== (existing?.hint ?? ''));
  const unsaved = useUnsaved(dirty);
  const cancel = unsaved.guard(onDismiss);
  const index = existing ? fields.indexOf(existing) : -1;

  /** The fields with this one as typed, in its place (at the end when new). */
  const kept = (): TemplateField[] => (existing ? fields.map(field => (field.id === id ? candidate : field)) : [...fields, candidate]);
  const save = (): void => {
    onChange(kept());
    onDismiss();
  };
  // A move keeps what was typed, once it reads.
  const move = (by: -1 | 1): void => {
    const next = kept();
    const to = index + by;
    [next[index], next[to]] = [next[to]!, next[index]!];
    onChange(next);
    onDismiss();
  };
  const remove = (): void => {
    onChange(fields.filter(field => field.id !== id));
    onDismiss();
  };

  return (
    <>
      <Sheet visible={visible} onDismiss={cancel} title={existing ? t('Modifier l’information') : t('Ajouter une information')} tall>
        <SheetScroll keyboardShouldPersistTaps="handled">
          <View style={styles.body}>
            <TextField
              label={t('Nom de l’information')}
              kind="text"
              field={form.field('name')}
              value={name}
              onChangeText={setName}
              placeholder={t('Prix, auteur, adresse…')}
              maxLength={TEMPLATE_LIMITS.fieldName}
              autoFocus={!existing}
            />
            <TextField
              label={t('Ce que Claude y note')}
              kind="prose"
              field={form.field('hint')}
              value={hint}
              onChangeText={setHint}
              placeholder={t('Par exemple : l’année de sortie')}
              multiline
              maxLength={TEMPLATE_LIMITS.hint}
              style={styles.hint}
            />
            <View style={styles.group}>
              <AppText variant="metaStrong" style={styles.label}>
                {t('Réponse')}
              </AppText>
              <View style={styles.types} accessibilityRole="radiogroup" accessibilityLabel={t('Réponse')}>
                {TEMPLATE_FIELD_TYPES.map(each => (
                  <AnswerChoice key={each} type={each} chosen={each === type} onPress={() => setType(each)} />
                ))}
              </View>
            </View>
          </View>
          {existing ? (
            <View>
              <View style={styles.rule} />
              {/* Alone in its template, a field has nowhere to go. */}
              {fields.length > 1 ? (
                <>
                  <TemplateRow icon="arrowUp" title={t('Monter')} disabled={index <= 0} onPress={() => void form.submit(() => move(-1))} />
                  <TemplateRow icon="arrowDown" title={t('Descendre')} disabled={index >= fields.length - 1} onPress={() => void form.submit(() => move(1))} />
                </>
              ) : null}
              <TemplateRow icon="trash" title={t('Supprimer l’information')} danger onPress={remove} />
            </View>
          ) : null}
        </SheetScroll>
        <FormFoot message={form.message}>
          <Button kind="text" label={t('Annuler')} onPress={cancel} />
          <Button label={existing ? t('OK') : t('Ajouter')} onPress={() => void form.submit(save)} />
        </FormFoot>
      </Sheet>
      {unsaved.dialog}
    </>
  );
}

/** An answer's shape to pick, two a row: its glyph and its words (« un nombre »); chosen, on the primary's wash with its glyph solid. */
function AnswerChoice({ type, chosen, onPress }: { type: TemplateFieldType; chosen: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const words = shownFieldAnswer(type);
  const ink = chosen ? theme.color.onActionContainer : theme.color.ink;
  return (
    <Tappable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: chosen }} accessibilityLabel={words} style={[styles.type, chosen ? styles.typeChosen : null]}>
      <Icon name={FIELD_TYPE_GLYPHS[type]} size={20} color={chosen ? ink : theme.color.inkMuted} solid={chosen} />
      <AppText variant={chosen ? 'labelStrong' : 'label'} color={ink} numberOfLines={2} style={styles.typeWords}>
        {words}
      </AppText>
    </Tappable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // The fields on the sheet's column (24 from its edge), 16 apart.
    body: { gap: 16, paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
    group: { gap: 6 },
    // A field's own label: 4 in from its edge.
    label: { marginHorizontal: 4 },
    // Two a row, twice the rows' gap apart (their edges need the room a tint does not), as Agenda's layers.
    types: { flexDirection: 'row', flexWrap: 'wrap', gap: GEOMETRY.rowGap * 2 },
    // A field's height at least, the chip radius, edged as a field; words on two lines make the row taller, both chips with it.
    type: { width: '47%', flexGrow: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: theme.color.edge, ...corners(SHAPES.chip) },
    typeChosen: { backgroundColor: theme.color.actionContainer, borderColor: theme.color.focus },
    typeWords: { flex: 1, gap: 1 },
    hint: { minHeight: 96, textAlignVertical: 'top' },
    // Over the rows (their glyphs on the sheet's column: its 8, their 6 and 10), a hairline as wide as the fields.
    rule: { height: StyleSheet.hairlineWidth, backgroundColor: theme.color.hairline, marginHorizontal: SHEET_INSET, marginTop: 8, marginBottom: 4 },
  });
