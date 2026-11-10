/**
 * Moving in from Google Keep: pick the Takeout archive, see what is in it, choose what the notes
 * made of links become (links Claude files, collections, or notes as they were), import, and read
 * what came in and what was left out.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { CLAUDE_COST_PER_LINK, type ClaudeModel } from '@unlease/core/sync/settings';
import { keepNoteName, keepPlanCounts, keepReportLines, linkListNotes, singleLinkNotes } from '@unlease/notes/services/keepImport';
import { alreadyHere, discardKeepImport, prepareKeepImport, runKeepImport, type PreparedImport } from '@app/keepImport';
import { rememberServerSettings, selectCanRead, selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { requestSync } from '@shared/app/sync/syncManager';
import { fetchServerSettings } from '@app/sync/transport';

import { SHAPES } from '@unlease/design/shapes';

import { AppText, Button, Checkbox, FormMessage, Ground, ListRow, Organic, Switch, TopBar } from '../components';
import { formatUsd } from '@shared/ui/features/settings/money';
import type { ScreenProps } from '../navigation/types';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

const STEPS = [
  tx('Ouvrez takeout.google.com sur un ordinateur ou ce téléphone.'),
  tx('Désélectionnez tout, puis cochez seulement « Keep ».'),
  tx('Exportez, téléchargez le fichier .zip, puis choisissez-le ici.'),
];

export function ImportScreen({ navigation }: ScreenProps<'Import'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const [already, setAlready] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convert, setConvert] = useState(true);
  /** The link lists that become collections, by their file in the export. */
  const [collections, setCollections] = useState<ReadonlySet<string>>(new Set());
  const [choosing, setChoosing] = useState(false);
  const [progress, setProgress] = useState<readonly [number, number] | null>(null);
  const [done, setDone] = useState<{ readonly imported: readonly string[]; readonly skipped: readonly string[] } | null>(null);
  const server = useSettingsStore(selectServer);
  const reading = useSettingsStore(selectCanRead);
  /** The server's model, for what a link read costs: no figure until the server has said. */
  const [model, setModel] = useState<ClaudeModel | null>(null);

  useEffect(() => {
    if (!server) return;
    let live = true;
    fetchServerSettings(server).then(settings => {
      if (!live || !settings) return;
      setModel(settings.analysis.model);
      rememberServerSettings(settings);
    });
    return () => {
      live = false;
    };
  }, [server]);

  const pick = async () => {
    setBusy(true);
    setError(null);
    const outcome = await prepareKeepImport();
    setBusy(false);
    if (outcome.status === 'ok') {
      // Every list becomes a collection unless the person says otherwise.
      setCollections(new Set(linkListNotes(outcome.prepared.plan).map(note => note.source)));
      setConvert(true);
      setChoosing(false);
      setAlready(alreadyHere(outcome.prepared.plan));
      setPrepared(outcome.prepared);
    }
    if (outcome.status === 'error') setError(outcome.message);
  };

  const importNow = async () => {
    if (!prepared) return;
    setBusy(true);
    const report = await runKeepImport(prepared, { singleLinks: convert, collections }, (count, total) => setProgress([count, total]));
    requestSync();
    setBusy(false);
    setProgress(null);
    setPrepared(null);
    setDone(keepReportLines(report));
  };

  // Back to the steps, the archive read set aside (as the web's « Annuler »).
  const cancel = () => {
    if (!prepared || busy) return;
    discardKeepImport(prepared);
    setPrepared(null);
  };

  const toggleList = (source: string) =>
    setCollections(current => {
      const next = new Set(current);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });

  // Back to the board under this screen; from the pages' home, the board takes its place (the two homes are peers).
  const toBoard = () => {
    if (navigation.getState().routes.some(route => route.name === 'Board')) navigation.popTo('Board', { view: 'notes' });
    else navigation.reset({ index: 0, routes: [{ name: 'Board', params: { view: 'notes' } }] });
  };

  const links = prepared ? singleLinkNotes(prepared.plan).length : 0;
  const counts = prepared ? keepPlanCounts(prepared.plan) : null;
  const lists = prepared ? linkListNotes(prepared.plan) : [];
  const chosenLinks = lists.filter(note => collections.has(note.source)).reduce((sum, note) => sum + (note.links?.length ?? 0), 0);

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar
        title={t('Importer depuis Keep')}
        onBack={() => {
          if (prepared && !busy) discardKeepImport(prepared);
          navigation.goBack();
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {done ? (
          <Organic outline="panel" style={styles.card}>
            <AppText variant="title">{t('Import terminé')}</AppText>
            {done.imported.length > 0 ? done.imported.map(line => <AppText key={line} variant="body">{line}</AppText>) : <AppText variant="body">{t('Rien de nouveau dans cette archive.')}</AppText>}
            {done.skipped.length > 0 ? (
              <View style={styles.skipped}>
                <AppText variant="bodyStrong">{t('Laissé de côté')}</AppText>
                {done.skipped.map(line => (
                  <AppText key={line} variant="meta">
                    {line}
                  </AppText>
                ))}
              </View>
            ) : null}
            <View style={styles.actions}>
              <Button kind="text" label={t('Importer une autre archive')} onPress={() => setDone(null)} />
              <Button label={t('Voir le tableau')} onPress={toBoard} />
            </View>
          </Organic>
        ) : prepared && counts ? (
          <Organic outline="panel" style={styles.card}>
            <AppText variant="title">{t('Dans cette archive')}</AppText>
            {/* The rows run to the panel's edges (their own inset), so their glyphs stand under the title and they lie 4 apart. */}
            <View style={styles.rows}>
              <ListRow
                icon="note"
                title={plural(counts.notes, 'note')}
                supporting={
                  [
                    already > 0 ? t('{notes} : ignorées, rien ne sera doublé', { notes: plural(already, 'note déjà importée', 'notes déjà importées') }) : null,
                    prepared.plan.trashed > 0
                      ? prepared.plan.trashed > 1
                        ? t('{notes} de la corbeille de Keep seront ignorées', { notes: plural(prepared.plan.trashed, 'note') })
                        : t('{notes} de la corbeille de Keep sera ignorée', { notes: plural(prepared.plan.trashed, 'note') })
                      : null,
                  ]
                    .filter(Boolean)
                    .join('\n') || undefined
                }
              />
              <ListRow icon="tag" title={plural(prepared.plan.labelNames.length, 'label')} />
              <ListRow
                icon="image"
                title={plural(counts.photos, 'photo')}
                supporting={counts.audio > 0 ? t('{recordings} : seul le texte transcrit est importé', { recordings: plural(counts.audio, 'enregistrement vocal', 'enregistrements vocaux') }) : undefined}
              />
              {prepared.plan.unreadable.length > 0 ? (
                <ListRow icon="alert" title={plural(prepared.plan.unreadable.length, 'fichier illisible', 'fichiers illisibles')} supporting={prepared.plan.unreadable.slice(0, 3).join(', ')} />
              ) : null}
            </View>
            {links > 0 ? (
              <View style={styles.toggle}>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{t('{notes} qu’un lien', { notes: plural(links, 'note ne contient', 'notes ne contiennent') })}</AppText>
                  <AppText variant="meta">
                    {reading
                      ? model
                        ? t('En faire des liens que Claude lit et range (environ {cost} chacun).', { cost: formatUsd(CLAUDE_COST_PER_LINK[model]) })
                        : t('En faire des liens que Claude lit et range.')
                      : t('En faire des liens, gardés tels quels dans Non classé : la lecture par Claude est désactivée.')}
                  </AppText>
                </View>
                <Switch value={convert} onValueChange={setConvert} accessibilityLabel={t('Transformer en liens')} />
              </View>
            ) : null}
            {lists.length > 0 ? (
              <View style={styles.toggle}>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{t('{notes} de liens', { notes: plural(lists.length, 'note faite', 'notes faites') })}</AppText>
                  <AppText variant="meta">
                    {t('Chacune peut devenir une collection : le texte autour d’un lien devient son commentaire, un élément coché un lien fait. Sinon, elle reste une note.')}
                    {chosenLinks > 0
                      ? ` ${
                          reading
                            ? model
                              ? t('Claude lit {links} (environ {cost} en tout).', { links: plural(chosenLinks, 'lien'), cost: formatUsd(CLAUDE_COST_PER_LINK[model] * chosenLinks) })
                              : t('Claude lit {links}.', { links: plural(chosenLinks, 'lien') })
                            : t('Les liens restent tels quels : la lecture par Claude est désactivée.')
                        }`
                      : ''}
                  </AppText>
                </View>
                <Switch value={collections.size === lists.length} onValueChange={all => setCollections(all ? new Set(lists.map(note => note.source)) : new Set())} accessibilityLabel={t('En faire des collections')} />
              </View>
            ) : null}
            {lists.length > 0 ? <Button kind="text" label={choosing ? t('Masquer la liste') : t('Choisir une par une')} onPress={() => setChoosing(open => !open)} style={styles.start} /> : null}
            {choosing ? (
              <View style={styles.rows}>
                {lists.map(note => (
                  <ListRow
                    key={note.source}
                    title={keepNoteName(note)}
                    supporting={collections.has(note.source) ? t('Collection de {links}', { links: plural(note.links?.length ?? 0, 'lien') }) : t('Note gardée telle quelle')}
                    leading={
                      // The box's target overhangs the rows' 24 slot, so its words start where the other rows' do.
                      <View style={styles.boxSlot}>
                        <Checkbox checked={collections.has(note.source)} onToggle={() => toggleList(note.source)} label={t('{note} en collection', { note: keepNoteName(note) })} />
                      </View>
                    }
                  />
                ))}
              </View>
            ) : null}
            {progress && progress[1] > 0 ? (
              <AppText variant="meta" accessibilityLiveRegion="polite">
                {t('Photos : {done} sur {total}', { done: progress[0], total: progress[1] })}
              </AppText>
            ) : null}
            <View style={styles.actions}>
              <Button kind="text" label={t('Annuler')} disabled={busy} onPress={cancel} />
              <Button label={t('Importer')} icon="download" busy={busy} onPress={importNow} />
            </View>
          </Organic>
        ) : (
          <Organic outline="panel" style={styles.card}>
            <AppText variant="title">{t('Depuis Google Takeout')}</AppText>
            {STEPS.map((step, index) => (
              <View key={step} style={styles.step}>
                <Organic style={[styles.stepNumber, { backgroundColor: theme.color.paperHigh }]}>
                  <AppText variant="labelSmall" color={theme.color.ink}>
                    {index + 1}
                  </AppText>
                </Organic>
                <AppText variant="body" style={styles.flex}>
                  {t(step)}
                </AppText>
              </View>
            ))}
            {/* The form's own line, its glyph saying it as well as its colour. */}
            <FormMessage message={error} />
            <Button label={t('Choisir l’archive')} icon="download" busy={busy} onPress={pick} style={styles.stretch} />
            <AppText variant="meta">{t('Les notes importées gardent leur date, leur couleur, leurs labels, leur mise en forme et leurs photos. Importer la même archive une seconde fois ne double rien. Rien n’est envoyé ailleurs que sur votre serveur.')}</AppText>
          </Organic>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { padding: 12, paddingBottom: 48 },
    card: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card, paddingHorizontal: 16, paddingVertical: 18, gap: 14 },
    step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    // A count, not a choice: a small round well, never matcha, never a pebble; centred on its step's first line (23).
    stepNumber: { width: 24, height: 24, ...corners(SHAPES.dot), alignItems: 'center', justifyContent: 'center' },
    flex: { flex: 1 },
    toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stretch: { alignSelf: 'stretch' },
    actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
    start: { alignSelf: 'flex-start' },
    skipped: { gap: 4 },
    // List rows inset themselves (6, then 10): out to the panel's edges, their glyph stands 16 in, as the title does.
    rows: { marginHorizontal: -16 },
    // A checkbox's 44 target on the rows' 24 slot.
    boxSlot: { width: 24, alignItems: 'center' },
  });
