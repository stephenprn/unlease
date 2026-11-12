/**
 * « Ce que Claude relève » for one collection, or the usual facts of one kind of link (the web's
 * `/notes/facts/<collection>` and `/notes/facts/kind-recipe`): a full-screen form, as Material's: × to
 * leave (asking first when something changed, `useUnsaved`), « Enregistrer » at the bar's end.
 *
 * A collection's asks one thing first: « Informations adaptatives » (each link gets those of its
 * kind; the kinds its links have are listed, each opening its usual facts) or « Informations
 * personnalisées » (one list for every link here, starting from a starter's own facts, else the
 * usual facts of its most frequent kind). A kind's is that list alone, with « Rétablir celles de Claude » under it while it
 * is changed. The facts are rows (each opens its sheet: name, what Claude notes in it, the answer's
 * shape; moved or removed there; a trash at the row's end removes it in one press, the slip putting it
 * back), « Ajouter une information » and suggestions one tap away, then a
 * preview on one link. Saved, links read before the change can all be read again from the well at
 * the top. Opened with an old template's id, it shows the first collection noting with it.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { t, tc } from '@unlease/core/i18n';
import { formatUsd, plural } from '@unlease/core/services/format';
import { asLineColor } from '@unlease/design/colors';
import { SHAPES } from '@unlease/design/shapes';
import { CLAUDE_COST_PER_LINK } from '@unlease/core/sync/settings';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { INBOX_ID, LINK_KIND_NAMES, shownTitle, type LinkItem, type LinkKind, type Note } from '@unlease/notes/models/entities';
import { TEMPLATE_LIMITS, type TemplateField } from '@unlease/notes/models/templates';
import {
  changedKindTemplate,
  collectionKinds,
  collectionTemplate,
  collectionsOfTemplate,
  kindFields,
  kindOfTemplateId,
  kindsOfLinks,
  kindTemplateId,
  linksOfTemplate,
  linksReadBefore,
  linkTemplateSource,
  newFieldId,
  otherCollectionsOf,
  readingSignature,
  startingFacts,
  suggestedFields,
  templateProblems,
} from '@unlease/notes/services/templates';
import { readLinks, resetKindTemplate, saveCollectionFacts, saveTemplate } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { linksToTry } from '@app/templates';
import { selectModel, useSettingsStore } from '@shared/app/store/settingsStore';
import { useServerFeatureState } from '@shared/app/hooks/useServerFeature';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Button, EmblemStone, EmptyLine, EmptyState, FormMessage, Ground, Icon, IconButton, RevealScrollView, Tappable, TopBar, useForm, useUnsaved } from '../components';
import { Section } from '@shared/ui/features/settings/Section';
import { ReadAllBanner } from '../features/lines/LineRefine';
import { KIND_ICONS } from '../features/links/kindIcon';
import { FieldSheet } from '../features/templates/FieldSheet';
import { FIELD_TYPE_GLYPHS } from '../features/templates/fieldTypes';
import { TemplateRow } from '../features/templates/TemplateRow';
import { factMeta, factNames, readAgainWords } from '../features/templates/templateWords';
import { TryLinkSheet, TrySection, useTemplateTry } from '../features/templates/TryTemplate';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, ScreenProps } from '../navigation/types';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** How many suggestions are offered under « Ajouter une information ». */
const SUGGESTED = 8;

/** A collection that can note its own facts: a live collection of links, never « Non classé ». */
function ownsFacts(note: Note | undefined): note is Note {
  return !!note && note.id !== INBOX_ID && note.kind === 'links' && note.deletedAt === null && note.trashedAt === null;
}

export function TemplateScreen({ navigation, route }: ScreenProps<'Template'>) {
  const styles = useThemedStyles(makeStyles);
  const params = route.params ?? {};
  const notes = useLibraryStore(s => s.notes);
  // A kind's usual facts, by its kind or by its fixed id; a collection's facts, by the collection or by an old template id.
  const kind: LinkKind | null = params.kind ?? (params.id ? kindOfTemplateId(params.id) : null);
  const lineId = kind ? null : (params.collection ?? (params.id ? (collectionsOfTemplate(params.id, notes).find(ownsFacts)?.id ?? null) : null));
  useLeaveWithoutClaude(navigation, lineId);
  if (kind) return <FactsForm navigation={navigation} kind={kind} />;
  if (lineId && ownsFacts(notes[lineId])) return <FactsForm navigation={navigation} lineId={lineId} />;
  // Deleted on another device, or a stale way to it: a way back, never a blank form.
  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar onBack={() => navigation.goBack()} />
      <EmptyState scene="trash" title={t('Cette liste d’informations n’existe plus')} text={t('Elle a été supprimée, sur cet appareil ou sur un autre.')} />
    </View>
  );
}

/**
 * Claude's facts lead nowhere once the server says it has no key: the screen goes back where it was
 * opened from (its collection, or the Board). While the server has not said, it stays.
 */
export function useLeaveWithoutClaude(navigation: Pick<NativeStackNavigationProp<RootStackParamList>, 'canGoBack' | 'goBack' | 'navigate'>, lineId: string | null = null): void {
  const claude = useServerFeatureState('claude');
  useFocusEffect(
    useCallback(() => {
      if (claude !== 'off') return;
      if (navigation.canGoBack()) navigation.goBack();
      else if (lineId) navigation.navigate('Line', { id: lineId });
      else navigation.navigate('Board');
    }, [claude, navigation, lineId]),
  );
}

type FormProps = { readonly navigation: ScreenProps<'Template'>['navigation'] } & ({ readonly kind: LinkKind; readonly lineId?: undefined } | { readonly lineId: string; readonly kind?: undefined });

function FactsForm({ navigation, kind, lineId }: FormProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const templates = useLibraryStore(s => s.linkTemplates);
  const links = useLibraryStore(s => s.links);
  const notes = useLibraryStore(s => s.notes);
  const linksByNote = useLibraryStore(s => s.linksByNote);
  // « Tout relire » once the server said Claude has a key.
  const reading = useServerFeatureState('claude') === 'on';
  const model = useSettingsStore(selectModel);
  const line = lineId ? notes[lineId]! : null;
  const collection = line ? shownTitle(line) : '';

  // The form starts from the facts as they were opened: a kind's as they read now, a collection's own list or none.
  const [opened, setOpened] = useState(() => {
    if (kind) return { own: true, fields: [...kindFields(templates, kind)] };
    const template = collectionTemplate(templates, line!);
    return { own: template !== null, fields: [...(template?.fields ?? [])] };
  });
  const scroller = useRef<React.ComponentRef<typeof RevealScrollView>>(null);
  const [own, setOwn] = useState(opened.own);
  const [fields, setFields] = useState<TemplateField[]>(opened.fields);
  // The fact sheet, and the fact it is open on (kept while it sinks away).
  const [sheet, setSheet] = useState<{ readonly open: boolean; readonly fieldId: string | null }>({ open: false, fieldId: null });

  const allLinks = useMemo(() => Object.values(links), [links]);
  // The links these facts are for: the collection's, or those a kind's usual facts note.
  const theirLinks = useMemo((): LinkItem[] => {
    if (kind) return linksOfTemplate({ id: kindTemplateId(kind), kind }, allLinks, notes, templates);
    return (linksByNote[lineId!] ?? []).flatMap(id => (links[id] && links[id]!.deletedAt === null ? [links[id]!] : []));
  }, [kind, lineId, allLinks, notes, templates, linksByNote, links]);
  const kinds = useMemo(() => kindsOfLinks(theirLinks), [theirLinks]);
  // What the facts are for: the page's kind, or the collection's links' kinds then those its title names (« Films & séries »).
  const expected = useMemo((): LinkKind[] => (kind ? [kind] : collectionKinds(theirLinks, collection)), [kind, theirLinks, collection]);
  // Noted before the facts they read with now, as saved: « Tout relever à nouveau ».
  const noteBefore = useMemo((): LinkItem[] => {
    if (kind) return linksReadBefore({ id: kindTemplateId(kind), kind }, allLinks, notes, templates);
    return theirLinks.filter(link => link.status === 'ready' && (link.readWith ?? 'preset') !== readingSignature(linkTemplateSource(templates, link, notes)));
  }, [kind, allLinks, notes, templates, theirLinks]);
  const tryLinks = useMemo(() => linksToTry(theirLinks), [theirLinks]);
  const trying = useTemplateTry(fields, tryLinks);
  const template = line ? collectionTemplate(templates, line) : null;
  const others = template && lineId ? otherCollectionsOf(template.id, notes, lineId).map(shownTitle) : [];

  // A collection's list is named after it: only its facts are checked (a kind given, the name is not).
  const problems = templateProblems({ name: '', kind: kind ?? 'other', fields: own ? fields : [] }, []);
  const checks: Record<string, string | null> = {};
  for (const [id, problem] of Object.entries(problems.fields)) checks[`field:${id}`] = problem;
  const form = useForm(checks);
  const dirty = own !== opened.own || (own && JSON.stringify(fields) !== JSON.stringify(opened.fields));
  const unsaved = useUnsaved(dirty, { screen: true });

  const leave = (): void => {
    unsaved.saved();
    navigation.goBack();
  };
  const choose = (value: boolean): void => {
    if (value === own) return;
    // Its own list taken for the first time: a starter's own facts, else the usual facts of its links' most frequent kind, to change.
    if (value && fields.length === 0) setFields(startingFacts(templates, expected, lineId));
    setOwn(value);
  };
  const save = (): void => {
    if (!dirty) {
      leave();
      return;
    }
    if (kind) {
      saveTemplate({ id: null, name: '', kind, fields });
      showSnack(t('Informations enregistrées'), undefined, { tone: 'success' });
    } else {
      const undo = saveCollectionFacts(lineId!, own ? fields : null);
      showSnack(t('Informations enregistrées'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
    }
    // Links noted before the change: the form stays, its well at the top offering to note them again (as the web's).
    const { links: now, notes: collections, linkTemplates } = useLibraryStore.getState();
    const waiting = !reading
      ? []
      : kind
        ? linksReadBefore({ id: kindTemplateId(kind), kind }, Object.values(now), collections, linkTemplates)
        : (useLibraryStore.getState().linksByNote[lineId!] ?? []).filter(id => {
            const link = now[id];
            return !!link && link.deletedAt === null && link.status === 'ready' && (link.readWith ?? 'preset') !== readingSignature(linkTemplateSource(linkTemplates, link, collections));
          });
    if (waiting.length === 0) {
      leave();
      return;
    }
    setOpened({ own, fields: own ? fields : [] });
    scroller.current?.scrollTo({ y: 0, animated: true });
  };
  const noteAgain = (): void => {
    const sent = readLinks(noteBefore.map(link => link.id));
    // No « Annuler »: the server starts reading at once (a collection's « Tout lire »).
    if (sent > 0) showSnack(t('{links} en lecture', { links: plural(sent, 'lien envoyé', 'liens envoyés') }), undefined, { tone: 'success' });
  };
  // A fact taken off in one press, from its row: nothing is saved yet, and the slip puts it back where it was.
  const remove = (field: TemplateField): void => {
    const index = fields.findIndex(each => each.id === field.id);
    if (index < 0) return;
    setFields(before => before.filter(each => each.id !== field.id));
    const put = (): void => setFields(before => (before.some(each => each.id === field.id) ? before : [...before.slice(0, index), field, ...before.slice(index)]));
    showSnack(t('« {name} » supprimée', { name: field.name || t('Information sans nom') }), { label: tc('undo', 'Annuler'), run: put }, { tone: 'success' });
  };
  const add = (field: TemplateField): void => setFields(before => [...before, { ...field, id: before.some(each => each.id === field.id) ? newFieldId(before) : field.id }]);

  const changed = kind ? changedKindTemplate(templates, kind) !== null : false;
  // « Rétablir celles de Claude »: no question, the slip takes it back.
  const reset = (): void => {
    if (!kind) return;
    const undo = resetKindTemplate(kind);
    leave();
    showSnack(t('Informations de Claude rétablies'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  };

  const full = fields.length >= TEMPLATE_LIMITS.fields;
  // The usual facts of its links' kinds (or of the page's kind) first.
  const suggestions = full ? [] : suggestedFields(fields, expected).slice(0, SUGGESTED);
  const cost = formatUsd(noteBefore.length * CLAUDE_COST_PER_LINK[model]);

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar
        title={kind ? t('Informations habituelles · {kind}', { kind: LINK_KIND_NAMES[kind] }) : t('Ce que Claude relève')}
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
          {reading && noteBefore.length > 0 && !dirty ? (
            <ReadAllBanner
              text={readAgainWords(noteBefore.length, cost)}
              action={noteBefore.length === 1 ? t('Relire') : t('Tout relire')}
              onRead={noteAgain}
              style={styles.banner}
            />
          ) : null}

          {kind ? (
            <View style={styles.lead}>
              <AppText variant="meta">{t('Claude les relève sur chaque lien qu’il reconnaît comme « {kind} », sauf dans une collection qui a les siennes.', { kind: LINK_KIND_NAMES[kind] })}</AppText>
            </View>
          ) : (
            <>
              <View style={[styles.lead, styles.collection]}>
                <EmblemStone id={lineId!} emblem={collectionEmblem(lineId!, line!.emblem)} color={asLineColor(line!.color)} size={18} width={30} height={27} />
                <AppText variant="label" color={theme.color.inkMuted} style={styles.fill}>
                  {t('Sur les liens de {collection}', { collection })}
                </AppText>
              </View>
              <View accessibilityRole="radiogroup" accessibilityLabel={t('Ce que Claude relève')} style={styles.choices}>
                <SourceChoice chosen={!own} mark={<Icon name="sparkle" size={24} color={!own ? theme.color.onActionContainer : theme.color.ink} />} title={t('Informations adaptatives')} meta={t('Claude les choisit selon le type de chaque lien : la marque d’un produit, le réalisateur d’un film…')} onPress={() => choose(false)} />
                <SourceChoice chosen={own} mark={<EmblemStone id={lineId!} emblem={collectionEmblem(lineId!, line!.emblem)} color={asLineColor(line!.color)} size={16} width={28} height={25} />} title={t('Informations personnalisées')} meta={t('Celles que vous choisissez, les mêmes sur chaque lien d’ici.')} onPress={() => choose(true)} />
              </View>
            </>
          )}

          {own ? (
            <Section title={t('Informations')}>
              {fields.length === 0 ? <EmptyLine text={t('Aucune information : Claude ne relèvera que le titre, le résumé et le prix.')} style={styles.line} /> : null}
              {fields.map(field => (
                <TemplateRow
                  key={field.id}
                  icon={FIELD_TYPE_GLYPHS[field.type]}
                  title={field.name || t('Information sans nom')}
                  meta={factMeta(field) || undefined}
                  strong
                  metaLine
                  error={problems.fields[field.id] ?? null}
                  onPress={() => setSheet({ open: true, fieldId: field.id })}
                  trailing={<IconButton icon="trash" label={t('Supprimer « {name} »', { name: field.name || t('Information sans nom') })} color={theme.color.inkMuted} size={20} onPress={() => remove(field)} style={styles.rowTrash} />}
                />
              ))}
              {full ? (
                <AppText variant="meta" style={styles.line}>
                  {t('{count} informations au plus.', { count: TEMPLATE_LIMITS.fields })}
                </AppText>
              ) : (
                <>
                  <TemplateRow icon="plus" title={t('Ajouter une information')} adds onPress={() => setSheet({ open: true, fieldId: null })} />
                  {suggestions.length > 0 ? (
                    <View style={styles.common}>
                      <AppText variant="metaStrong">{t('Suggestions')}</AppText>
                      <View style={styles.chips}>
                        {suggestions.map(field => (
                          <Tappable key={field.name} onPress={() => add(field)} accessibilityRole="button" accessibilityLabel={t('Ajouter « {name} »', { name: field.name })} style={styles.chip}>
                            <Icon name="plus" size={16} color={theme.color.link} />
                            <AppText variant="label">{field.name}</AppText>
                          </Tappable>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </>
              )}
              {others.length > 0 ? (
                <AppText variant="meta" style={styles.line}>
                  {t('Aussi relevées sur les liens de {collections}.', { collections: others.join(', ') })}
                </AppText>
              ) : null}
            </Section>
          ) : (
            <Section title={t('Types de liens ici')}>
              {kinds.length === 0 ? <EmptyLine text={t('Ses liens n’ont pas encore de type : Claude en donne un à chaque lien qu’il lit.')} style={styles.line} /> : null}
              {kinds.map(each => (
                <TemplateRow key={each} icon={KIND_ICONS[each]} title={LINK_KIND_NAMES[each]} meta={factNames(kindFields(templates, each))} metaLine chevron onPress={() => navigation.push('Template', { kind: each })} />
              ))}
              <TemplateRow icon="rows" title={t('Informations habituelles, par type de lien')} adds chevron onPress={() => navigation.navigate('Templates')} />
            </Section>
          )}
          {/* The usual facts as the person changed them, set back in one press: quiet, under them. */}
          {changed ? <Button kind="text" icon="restore" label={t('Rétablir celles de Claude')} onPress={reset} style={styles.quiet} /> : null}

          {own ? <TrySection state={trying} fields={fields} /> : null}
        </RevealScrollView>
      </KeyboardAvoidingView>

      <FieldSheet visible={sheet.open} fieldId={sheet.fieldId} fields={fields} onChange={setFields} onDismiss={() => setSheet(before => ({ ...before, open: false }))} />
      <TryLinkSheet state={trying} />
      {unsaved.dialog}
    </View>
  );
}

/** One of a collection's two sources of facts (Claude's sparkle, or the collection's stone): a card, the chosen one on the primary's wash with its edge and a tick. */
function SourceChoice({ chosen, mark, title, meta, onPress }: { chosen: boolean; mark: React.ReactNode; title: string; meta: string; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const ink = chosen ? theme.color.onActionContainer : theme.color.ink;
  return (
    <Tappable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: chosen }} accessibilityLabel={`${title}, ${meta}`} style={[styles.choice, chosen ? styles.choiceChosen : null]}>
      <View style={styles.choiceMark}>{mark}</View>
      <View style={styles.fill}>
        <AppText variant="bodyStrong" color={ink}>
          {title}
        </AppText>
        <AppText variant="meta" color={chosen ? ink : undefined}>
          {meta}
        </AppText>
      </View>
      {chosen ? <Icon name="check" size={20} color={ink} /> : null}
    </Tappable>
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
    // On the panels' words: 16 in, as the section heads.
    lead: { paddingHorizontal: 16 },
    collection: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10 },
    // The two sources, one over the other, the rows' gap apart twice.
    choices: { gap: 12 },
    choice: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      paddingVertical: 16,
      paddingLeft: 16,
      paddingRight: 16,
      borderWidth: 1,
      borderColor: theme.color.hairline,
      backgroundColor: theme.color.paper,
      ...corners(SHAPES.panel),
    },
    choiceMark: { width: 28, alignItems: 'center' },
    choiceChosen: { backgroundColor: theme.color.actionContainer, borderColor: theme.color.focus, borderWidth: 1.5 },
    // The row's trash, its pebble inside the row's 56 (a 48 target, 4 over the row's padding each way) and on its end.
    rowTrash: { marginVertical: -4, marginRight: -6 },
    // A line in the panel, on the rows' glyphs.
    line: { paddingHorizontal: 16, paddingVertical: 12 },
    // The suggestions, on the rows' glyphs, under « Ajouter une information ».
    common: { gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    // An edged chip on paper (a question's starters, a new collection's suggestions), its plus in link ink.
    chip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 14, borderWidth: 1.5, borderColor: theme.color.outline, backgroundColor: theme.color.paper, ...corners(SHAPES.chip) },
  });
