/**
 * A « Modèle de fiche », shaped: a kind's (its name, not editable) or one of the person's own (its
 * name typed), its fields as rows (each opens its sheet: name, type, what to put in it; moved or
 * removed there), « Ajouter un champ » and the fields common to the presets one tap away, then
 * « Essayer » on one of its links before saving. A full-screen form, as Material's: × to leave
 * (asking first when something changed, `useUnsaved`), « Enregistrer » at the bar's end, which saves
 * the template whole in one batch (`saveTemplate`). A kind's changed template is set back to its
 * preset by a quiet button under its fields, one of the person's own deleted by one at the form's
 * end, each with « Annuler » (the bar keeps its room for the title on a narrow phone). Once saved,
 * links read with an older version can all be read again from the well at the top. The web's
 * `/notes/templates/:id`.
 */
import React, { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';

import { t, tc } from '@unlease/core/i18n';
import { formatUsd, plural } from '@unlease/core/services/format';
import { SHAPES } from '@unlease/design/shapes';
import { CLAUDE_COST_PER_LINK } from '@unlease/core/sync/settings';
import { INBOX_ID, LINK_KIND_NAMES, shownTitle, type LinkKind } from '@unlease/notes/models/entities';
import { TEMPLATE_LIMITS, type TemplateField } from '@unlease/notes/models/templates';
import { changedKindTemplate, kindFields, kindOfTemplateId, kindTemplateId, linksOfTemplate, linksReadBefore, newFieldId, suggestedFields, templateProblems } from '@unlease/notes/services/templates';
import { deleteTemplate, readLinks, resetKindTemplate, saveTemplate } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { linksToTry } from '@app/templates';
import { selectCanRead, selectModel, useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Button, EmptyState, FormMessage, Ground, Icon, RevealScrollView, Tappable, TextField, TopBar, useForm, useUnsaved } from '../components';
import { Section } from '@shared/ui/features/settings/Section';
import { ReadAllBanner } from '../features/lines/LineRefine';
import { KIND_ICONS } from '../features/links/kindIcon';
import { FieldSheet } from '../features/templates/FieldSheet';
import { FIELD_TYPE_GLYPHS } from '../features/templates/fieldTypes';
import { TemplateRow } from '../features/templates/TemplateRow';
import { fieldMeta, rereadWords, templateCollections } from '../features/templates/templateWords';
import { TryLinkSheet, TrySection, useTemplateTry } from '../features/templates/TryTemplate';
import type { ScreenProps } from '../navigation/types';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** How many common fields are offered under « Ajouter un champ ». */
const SUGGESTED = 10;

export function TemplateScreen({ navigation, route }: ScreenProps<'Template'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const params = route.params ?? {};
  // A kind's template is opened by its kind, or by its fixed id.
  const kind: LinkKind | null = params.kind ?? (params.id ? kindOfTemplateId(params.id) : null);
  const ownId = kind === null ? (params.id ?? null) : null;
  const forCollection = kind === null && ownId === null ? params.collection : undefined;
  const templates = useLibraryStore(s => s.linkTemplates);
  const links = useLibraryStore(s => s.links);
  const notes = useLibraryStore(s => s.notes);
  const linksByNote = useLibraryStore(s => s.linksByNote);
  const reading = useSettingsStore(selectCanRead);
  const model = useSettingsStore(selectModel);
  const stored = ownId ? templates[ownId] : undefined;
  // Gone when it is opened (deleted elsewhere, a stale way to it); deleted from here, the form leaves as it was.
  const [missing] = useState(() => ownId !== null && (!stored || stored.deletedAt !== null || stored.kind !== null));

  // The form starts from the template as it was opened: a kind's as it reads now, one's own as kept, a new one empty.
  const [opened, setOpened] = useState(() => ({ name: stored?.name ?? '', fields: kind ? [...kindFields(templates, kind)] : [...(stored?.fields ?? [])] }));
  const scroller = useRef<React.ComponentRef<typeof RevealScrollView>>(null);
  const [name, setName] = useState(opened.name);
  const [fields, setFields] = useState<TemplateField[]>(opened.fields);
  // The field sheet, and the field it is open on (kept while it sinks away).
  const [sheet, setSheet] = useState<{ readonly open: boolean; readonly fieldId: string | null }>({ open: false, fieldId: null });

  const identity = useMemo(() => (kind ? { id: kindTemplateId(kind), kind } : ownId ? { id: ownId, kind: null } : null), [kind, ownId]);
  const allLinks = useMemo(() => Object.values(links), [links]);
  // Read with an older version of what is saved: « Tout relire » (nothing for a template not saved yet).
  const readBefore = useMemo(() => (identity && !missing ? linksReadBefore(identity, allLinks, notes, templates) : []), [identity, missing, allLinks, notes, templates]);
  // What it can be tried on: the links it reads, or those of the collection a new one is made for.
  const tryLinks = useMemo(() => {
    if (identity) return linksToTry(linksOfTemplate(identity, allLinks, notes, templates));
    return linksToTry((forCollection ? (linksByNote[forCollection] ?? []) : []).flatMap(id => (links[id] ? [links[id]!] : [])));
  }, [identity, allLinks, notes, templates, forCollection, linksByNote, links]);
  const trying = useTemplateTry(fields, tryLinks);

  const others = useMemo(() => Object.values(templates).filter(other => other.id !== ownId), [templates, ownId]);
  const problems = templateProblems({ name, kind, fields }, others);
  const checks: Record<string, string | null> = { name: problems.name };
  for (const [id, problem] of Object.entries(problems.fields)) checks[`field:${id}`] = problem;
  const form = useForm(checks, { order: ['name'] });
  const dirty = name !== opened.name || JSON.stringify(fields) !== JSON.stringify(opened.fields);
  const unsaved = useUnsaved(dirty, { screen: true });

  if (missing) {
    // Deleted on another device, or a stale link to it: a way back, never a blank form.
    return (
      <View style={styles.screen}>
        <Ground />
        <TopBar onBack={() => navigation.goBack()} />
        <EmptyState scene="trash" title={t('Introuvable')} text={t('Ce modèle n’existe plus.')} />
      </View>
    );
  }

  const leave = (): void => {
    unsaved.saved();
    navigation.goBack();
  };
  const save = (): void => {
    if (!dirty && (kind !== null || ownId !== null)) {
      leave();
      return;
    }
    const saved = saveTemplate({ id: ownId, name, kind, fields }, { forCollection });
    showSnack(t('Modèle enregistré'), undefined, { tone: 'success' });
    // Links read with the version before: the form stays, its well at the top offering to read them again (as the web's).
    const { links: now, notes: collections, linkTemplates } = useLibraryStore.getState();
    const waiting = reading ? linksReadBefore({ id: saved.id, kind }, Object.values(now), collections, linkTemplates) : [];
    if (waiting.length === 0) {
      leave();
      return;
    }
    setOpened({ name, fields });
    if (kind === null && ownId === null) navigation.setParams({ id: saved.id, collection: undefined });
    scroller.current?.scrollTo({ y: 0, animated: true });
  };
  const reread = (): void => {
    const sent = readLinks(readBefore.map(link => link.id));
    // No « Annuler »: the server starts reading at once (a collection's « Tout lire »).
    if (sent > 0) showSnack(t('{links} en lecture', { links: plural(sent, 'lien envoyé', 'liens envoyés') }), undefined, { tone: 'success' });
  };
  const add = (field: TemplateField): void => setFields(before => [...before, { ...field, id: before.some(each => each.id === field.id) ? newFieldId(before) : field.id }]);

  const changed = kind ? changedKindTemplate(templates, kind) !== null : false;
  // « Rétablir l’original »: no question, the slip takes it back.
  const reset = (): void => {
    if (!kind) return;
    const undo = resetKindTemplate(kind);
    leave();
    showSnack(t('Modèle d’origine rétabli'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  };
  const remove = (): void => {
    if (!ownId) return;
    const undo = deleteTemplate(ownId);
    leave();
    showSnack(t('Modèle supprimé'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  };

  // Where one of the person's own is read: its collections, or the one it is made for, once saved.
  const readOn = stored ? templateCollections(stored, notes) : '';
  const madeFor = !stored && forCollection && forCollection !== INBOX_ID && notes[forCollection] ? shownTitle(notes[forCollection]!) : '';
  const full = fields.length >= TEMPLATE_LIMITS.fields;
  const suggestions = full ? [] : suggestedFields(fields).slice(0, SUGGESTED);
  const cost = formatUsd(readBefore.length * CLAUDE_COST_PER_LINK[model]);

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar
        title={t('Modèle de fiche')}
        closes
        onBack={() => navigation.goBack()}
        actions={<Button label={t('Enregistrer')} small busy={form.busy} onPress={() => void form.submit(save)} style={styles.saveButton} />}
      />
      {form.message ? (
        <View style={styles.message}>
          <FormMessage message={form.message} />
        </View>
      ) : null}
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <RevealScrollView ref={scroller} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {reading && readBefore.length > 0 ? (
            <ReadAllBanner
              text={rereadWords(readBefore.length, cost)}
              action={readBefore.length === 1 ? t('Relire') : t('Tout relire')}
              onRead={reread}
              style={styles.banner}
            />
          ) : null}

          {kind ? (
            <View style={styles.kindHead}>
              <View style={styles.kindName}>
                <Icon name={KIND_ICONS[kind]} size={24} color={theme.color.ink} />
                <AppText variant="title" accessibilityRole="header" style={styles.fill}>
                  {LINK_KIND_NAMES[kind]}
                </AppText>
              </View>
              <AppText variant="meta" style={styles.kindLine}>
                {t('Pour les liens que Claude reconnaît comme « {kind} ».', { kind: LINK_KIND_NAMES[kind] })}
              </AppText>
            </View>
          ) : (
            <TextField
              label={t('Nom du modèle')}
              kind="text"
              field={form.field('name')}
              value={name}
              onChangeText={setName}
              placeholder={t('Vin, plante, jeu de société…')}
              maxLength={TEMPLATE_LIMITS.name}
              autoFocus={ownId === null}
              help={
                readOn
                  ? t('Lu sur les liens de {collections}.', { collections: readOn })
                  : madeFor
                    ? t('Lu sur les liens de {collections} une fois enregistré.', { collections: madeFor })
                    : t('Choisissez-le dans le menu d’une collection.')
              }
            />
          )}

          <Section title={t('Champs')}>
            {fields.length === 0 ? (
              <AppText variant="meta" style={styles.line}>
                {t('Aucun champ : Claude ne relèvera que le titre, le résumé et le prix.')}
              </AppText>
            ) : null}
            {fields.map(field => (
              <TemplateRow
                key={field.id}
                icon={FIELD_TYPE_GLYPHS[field.type]}
                title={field.name || t('Sans nom')}
                meta={fieldMeta(field)}
                strong
                metaLine
                error={problems.fields[field.id] ?? null}
                onPress={() => setSheet({ open: true, fieldId: field.id })}
              />
            ))}
            {full ? (
              <AppText variant="meta" style={styles.line}>
                {t('{count} champs au plus.', { count: TEMPLATE_LIMITS.fields })}
              </AppText>
            ) : (
              <>
                <TemplateRow icon="plus" title={t('Ajouter un champ')} adds onPress={() => setSheet({ open: true, fieldId: null })} />
                {suggestions.length > 0 ? (
                  <View style={styles.common}>
                    <AppText variant="metaStrong">{t('Champs courants')}</AppText>
                    <View style={styles.chips}>
                      {suggestions.map(field => (
                        <Tappable key={field.name} onPress={() => add(field)} accessibilityRole="button" accessibilityLabel={t('Ajouter le champ « {name} »', { name: field.name })} style={styles.chip}>
                          <Icon name="plus" size={16} color={theme.color.link} />
                          <AppText variant="label">{field.name}</AppText>
                        </Tappable>
                      ))}
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </Section>
          {/* Its fields as the person changed them, set back in one press: quiet, under them. */}
          {changed ? <Button kind="text" icon="restore" label={t('Rétablir l’original')} onPress={reset} style={styles.quiet} /> : null}

          <TrySection state={trying} fields={fields} />
          {/* A quiet destructive action at the form's end, as « Supprimer la clé » is in its section. */}
          {ownId ? <Button kind="dangerText" icon="trash" label={t('Supprimer le modèle')} onPress={remove} style={styles.quiet} /> : null}
        </RevealScrollView>
      </KeyboardAvoidingView>

      <FieldSheet visible={sheet.open} fieldId={sheet.fieldId} fields={fields} onChange={setFields} onDismiss={() => setSheet(before => ({ ...before, open: false }))} />
      <TryLinkSheet state={trying} />
      {unsaved.dialog}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    fill: { flex: 1 },
    // Réglages' column, as the event form's: fields and panels 12 from the screen's edges, 20 apart.
    content: { padding: 12, paddingBottom: 64, gap: 20 },
    saveButton: { marginRight: 8 },
    message: { paddingHorizontal: 16, paddingBottom: 8 },
    banner: { marginHorizontal: 0, marginTop: 0, marginBottom: 0 },
    // A text button's glyph on the panels' rows' glyphs; close under what it acts on.
    quiet: { marginLeft: 2, marginTop: -8 },
    // On the panels' words: its glyph on the rows' glyphs (16 in), its line on their words' edge.
    kindHead: { gap: 4, paddingHorizontal: 16 },
    kindName: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    // Under the name, past its glyph (24 and 16).
    kindLine: { marginLeft: 40 },
    // A line in the panel, on the rows' glyphs.
    line: { paddingHorizontal: 16, paddingVertical: 12 },
    // The common fields, on the rows' glyphs, under « Ajouter un champ ».
    common: { gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    // An edged chip on paper (a question's starters, a new collection's suggestions), its plus in link ink.
    chip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 14, borderWidth: 1.5, borderColor: theme.color.outline, backgroundColor: theme.color.paper, ...corners(SHAPES.chip) },
  });
