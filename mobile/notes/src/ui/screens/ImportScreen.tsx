/** Moving in from Google Keep: pick the Takeout archive, preview it, import. */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { CLAUDE_COST_PER_LINK, type ClaudeModel } from '@unlease/core/sync/settings';
import { linkOnlyCount, prepareKeepImport, runKeepImport, type PreparedImport } from '@app/keepImport';
import { rememberServerSettings, selectCanRead, selectServer, useSettingsStore } from '@app/store/settingsStore';
import { requestSync } from '@app/sync/syncManager';
import { fetchServerSettings } from '@app/sync/transport';
import { removePath } from '@platform/media';

import { SHAPES } from '@unlease/design/shapes';

import { AppText, Button, Ground, ListRow, Organic, Switch, TopBar } from '../components';
import { formatUsd } from '../features/settings/money';
import type { ScreenProps } from '../navigation/types';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

const STEPS = [
  tx('Ouvrez takeout.google.com sur un ordinateur ou ce téléphone.'),
  tx('Désélectionnez tout, puis cochez seulement « Keep ».'),
  tx('Exportez, téléchargez le fichier .zip, puis choisissez-le ici.'),
];

export function ImportScreen({ navigation }: ScreenProps<'Import'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convert, setConvert] = useState(true);
  const [done, setDone] = useState<string | null>(null);
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
    if (outcome.status === 'ok') setPrepared(outcome.prepared);
    if (outcome.status === 'error') setError(outcome.message);
  };

  const importNow = async () => {
    if (!prepared) return;
    setBusy(true);
    const result = await runKeepImport(prepared, convert);
    requestSync();
    setBusy(false);
    setPrepared(null);
    setDone(
      [plural(result.notes, 'note importée', 'notes importées'), result.links > 0 ? plural(result.links, 'lien à lire', 'liens à lire') : null, result.photos > 0 ? plural(result.photos, 'photo') : null]
        .filter(Boolean)
        .join(' · '),
    );
  };

  // Back to the board under this screen; from the pages' home, the board takes its place (the two homes are peers).
  const toBoard = () => {
    if (navigation.getState().routes.some(route => route.name === 'Board')) navigation.popTo('Board', { view: 'notes' });
    else navigation.reset({ index: 0, routes: [{ name: 'Board', params: { view: 'notes' } }] });
  };

  const links = prepared ? linkOnlyCount(prepared.plan) : 0;
  const photos = prepared ? prepared.plan.notes.reduce((n, note) => n + note.attachments.length, 0) : 0;

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar
        title={t('Importer depuis Keep')}
        onBack={() => {
          if (prepared) removePath(prepared.dir);
          navigation.goBack();
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {done ? (
          <Organic outline="panel" style={styles.card}>
            <AppText variant="title">{t('Import terminé')}</AppText>
            <AppText variant="body">{done}</AppText>
            <Button label={t('Voir le tableau')} onPress={toBoard} />
          </Organic>
        ) : prepared ? (
          <Organic outline="panel" style={styles.card}>
            <AppText variant="title">{t('Dans cette archive')}</AppText>
            <ListRow icon="note" title={plural(prepared.plan.notes.length, 'note')} supporting={prepared.plan.trashed > 0 ? (prepared.plan.trashed > 1 ? t('{notes} de la corbeille de Keep seront ignorées', { notes: plural(prepared.plan.trashed, 'note') }) : t('{notes} de la corbeille de Keep sera ignorée', { notes: plural(prepared.plan.trashed, 'note') })) : undefined} />
            <ListRow icon="tag" title={plural(prepared.plan.labelNames.length, 'label')} />
            <ListRow icon="image" title={plural(photos, 'photo')} />
            {prepared.plan.unreadable.length > 0 ? (
              <ListRow icon="alert" title={plural(prepared.plan.unreadable.length, 'fichier illisible', 'fichiers illisibles')} supporting={prepared.plan.unreadable.slice(0, 3).join(', ')} />
            ) : null}
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
            <Button label={t('Importer')} icon="download" busy={busy} onPress={importNow} style={styles.stretch} />
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
            {error ? (
              <AppText variant="body" color={theme.color.danger}>
                {error}
              </AppText>
            ) : null}
            <Button label={t('Choisir l’archive')} icon="download" busy={busy} onPress={pick} style={styles.stretch} />
            <AppText variant="meta">{t('Les notes importées gardent leur date, leur couleur, leurs labels et leurs photos. Rien n’est envoyé ailleurs que sur votre serveur.')}</AppText>
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
    // A count, not a choice: a small round well, never matcha, never a pebble.
    stepNumber: { width: 26, height: 26, ...corners(SHAPES.dot), alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    flex: { flex: 1 },
    toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stretch: { alignSelf: 'stretch' },
  });
