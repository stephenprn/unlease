/**
 * "Lecture des liens par Claude", shown once a server is connected: key, model, budget, cost. The
 * key is set here but stored on the server, which checks it with Anthropic first, so a typo is
 * refused on the spot.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { CLAUDE_COST_PER_WEB_SEARCH, CLAUDE_COST_PER_LINK, CLAUDE_MODEL_NAMES, CLAUDE_MODELS, type ClaudeModel, type ServerSettings } from '@unlease/core/sync/settings';
import { readSkippedLinks } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { rememberServerSettings, type ServerConfig } from '@app/store/settingsStore';
import { showSnack } from '@app/store/uiStore';
import { fetchServerSettings, fetchUsage, saveServerSettings, type Usage } from '@app/sync/transport';

import { AppText, Button, IconButton, ListRow, Segmented, TextField } from '../../components';
import type { Confirmation } from '../admin/overlays';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';
import { formatUsd as usd } from './money';

/** `ask`: the screen's confirmation, drawn at its root (in place, a dialog here would be cut by the section's sheet). */
export function ReadingSection({ server, ask }: { server: ServerConfig; ask: (confirmation: Confirmation) => void }) {
  const theme = useTheme();
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [budget, setBudget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipped = useLibraryStore(s => Object.values(s.links).filter(link => link.status === 'skipped' && link.deletedAt === null).length);

  const load = useCallback(() => {
    fetchServerSettings(server).then(next => {
      if (!next) return;
      setSettings(next);
      rememberServerSettings(next);
      setBudget(String(next.analysis.budgetUsd).replace('.', ','));
    });
    fetchUsage(server).then(setUsage);
  }, [server]);
  useEffect(load, [load]);

  const save = async (patch: Parameters<typeof saveServerSettings>[1], done?: string) => {
    setBusy(true);
    setError(null);
    try {
      const next = await saveServerSettings(server, patch);
      setSettings(next);
      rememberServerSettings(next);
      setKey('');
      if (done) showSnack(done, undefined, { tone: 'success' });
    } catch (failure) {
      setError(failure instanceof Error ? t(failure.message) : t('Réglage refusé'));
    } finally {
      setBusy(false);
    }
  };

  if (!settings) {
    return <ListRow icon="info" title={t('Réglages du serveur indisponibles')} supporting={t('Le serveur ne répond pas pour l’instant.')} onPress={load} />;
  }
  const analysis = settings.analysis;
  const model = analysis.model;

  return (
    <View>
      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: analysis.enabled ? theme.color.ok : theme.color.inkFaint }]} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{analysis.enabled ? t('Lecture activée') : t('Lecture désactivée')}</AppText>
          <AppText variant="meta">
            {analysis.enabled
              ? analysis.keySource === 'env'
                ? t('Clé {hint} (définie sur le serveur)', { hint: analysis.keyHint ?? '' })
                : t('Clé {hint}', { hint: analysis.keyHint ?? '' })
              : t('Sans clé, les liens sont gardés tels quels, sans titre, prix ni rangement automatique.')}
          </AppText>
        </View>
      </View>

      <View style={styles.fields}>
        <View>
          <TextField
            label={analysis.enabled ? t('Remplacer la clé API Claude') : t('Clé API Claude')}
            value={key}
            onChangeText={setKey}
            placeholder="sk-ant-…"
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
            error={error}
            help={t('Créée sur console.anthropic.com. Elle est vérifiée puis gardée sur votre serveur.')}
            style={styles.keyInput}
          />
          <View style={styles.eye}>
            <IconButton icon={showKey ? 'eyeOff' : 'eye'} label={showKey ? t('Masquer la clé') : t('Afficher la clé')} onPress={() => setShowKey(v => !v)} />
          </View>
        </View>
        <View style={styles.row}>
          <Button label={t('Enregistrer la clé')} icon="key" busy={busy} disabled={key.trim().length < 20} onPress={() => save({ anthropicApiKey: key.trim() }, t('Clé enregistrée : les liens seront lus.'))} />
          {analysis.keySource === 'app' ? <Button kind="dangerText" label={t('Supprimer la clé')} onPress={() => ask({
              title: t('Supprimer la clé ?'),
              message: t('Les nouveaux liens ne seront plus lus ni rangés automatiquement. Ceux déjà lus restent tels quels.'),
              confirmLabel: t('Supprimer'),
              danger: true,
              run: () => save({ anthropicApiKey: null }, t('Clé supprimée')),
            })} /> : null}
        </View>

        <AppText variant="metaStrong">{t('Modèle')}</AppText>
        <Segmented<ClaudeModel>
          value={model}
          onChange={next => save({ model: next }, t('Modèle : {model}', { model: CLAUDE_MODEL_NAMES[next] }))}
          options={CLAUDE_MODELS.map(id => ({ value: id, label: CLAUDE_MODEL_NAMES[id] }))}
        />
        <AppText variant="meta">
          {t('Environ {cost} par lien lu, {search} par recherche d’un module sur le web.', { cost: usd(CLAUDE_COST_PER_LINK[model]), search: usd(CLAUDE_COST_PER_WEB_SEARCH[model]) })}
        </AppText>

        <View style={styles.budgetRow}>
          <View style={styles.flex}>
            <TextField label={t('Budget mensuel ($)')} value={budget} onChangeText={setBudget} keyboardType="decimal-pad" help={t('La lecture s’arrête pour le mois une fois le budget atteint.')} />
          </View>
          <Button
            kind="tonal"
            label={t('Appliquer')}
            // An emptied field is no budget: Number('') would read as 0 and stop all reading.
            disabled={budget.trim() === '' || Number(budget.replace(',', '.')) === analysis.budgetUsd || !(Number(budget.replace(',', '.')) >= 0)}
            onPress={() => save({ budgetUsd: Number(budget.replace(',', '.')) }, t('Budget enregistré'))}
            style={styles.apply}
          />
        </View>
      </View>

      <ListRow
        icon="info"
        title={usage ? t('Ce mois-ci : {links}, {cost}', { links: plural(usage.month.analyses, 'lien lu', 'liens lus'), cost: usd(usage.month.costUsd) }) : t('Consommation indisponible')}
        supporting={usage ? t('Sur un budget de {budget} · depuis le début {total}', { budget: usd(analysis.budgetUsd), total: usd(usage.total.costUsd) }) : undefined}
        onPress={load}
      />
      {analysis.enabled && skipped > 0 ? (
        <ListRow
          icon="refresh"
          title={skipped === 1 ? t('Lire le lien non lu') : t('Lire les {links}', { links: plural(skipped, 'lien non lu', 'liens non lus') })}
          supporting={skipped === 1 ? t('Gardé tel quel quand la lecture était désactivée · environ {cost}', { cost: usd(skipped * CLAUDE_COST_PER_LINK[model]) }) : t('Gardés tels quels quand la lecture était désactivée · environ {cost}', { cost: usd(skipped * CLAUDE_COST_PER_LINK[model]) })}
          onPress={() => showSnack(t('{links} en lecture', { links: plural(readSkippedLinks(), 'lien envoyé', 'liens envoyés') }), undefined, { tone: 'success' })}
        />
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  // Centred on the title's 23 dp line.
  dot: { width: 10, height: 10, ...corners(SHAPES.dot), marginTop: 6.5 },
  flex: { flex: 1 },
  fields: { gap: 14, paddingHorizontal: 16, paddingBottom: 12 },
  keyInput: { paddingRight: 52 },
  eye: { position: 'absolute', right: 2, top: 24 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  budgetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  apply: { marginTop: 26 },
});
