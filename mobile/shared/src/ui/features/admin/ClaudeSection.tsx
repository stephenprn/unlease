/**
 * "Claude", shown once a server is connected: the key every app of the suite shares, the model, the
 * monthly budget, what was spent; what each app the server runs asks of it (`claudeUse`), and the
 * app's own part (`extra`: Carnet's cost per link and its links kept unread). The key is set here but
 * stored on the server, which checks it with Anthropic first, so a typo is refused on the spot.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { around, t } from '@unlease/core/i18n';
import { claudeKeyProblem, claudeUse } from '@unlease/core/services/setup';
import { ANTHROPIC_CONSOLE, CLAUDE_MODEL_NAMES, CLAUDE_MODELS, type ClaudeModel, type ServerSettings } from '@unlease/core/sync/settings';
import { rememberServerSettings, type ServerConfig } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { fetchServerSettings, fetchUsage, saveServerSettings, type Usage } from '@shared/app/sync/transport';

import { AppText, Button, ListRow, Segmented, TextField, useForm } from '../../components';
import { StatusRow } from './StatusRow';
import type { Confirmation } from './overlays';
import { corners } from '@shared/ui/theme/shape';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { formatUsd as usd } from '../settings/money';

/** What an app adds under the shared part, from the settings and the usage as read. */
export type ClaudeExtra = (state: { readonly settings: ServerSettings; readonly usage: Usage | null }) => React.ReactNode;

/** `ask`: the screen's confirmation, drawn at its root (in place, a dialog here would be cut by the section's sheet). */
export function ClaudeSection({ server, ask, extra }: { server: ServerConfig; ask: (confirmation: Confirmation) => void; extra?: ClaudeExtra }) {
  const theme = useTheme();
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [key, setKey] = useState('');
  const [budget, setBudget] = useState('');
  const [busy, setBusy] = useState(false);
  const amount = Number(budget.replace(',', '.').trim());
  // An emptied field is no budget: Number('') would read as 0 and stop all reading.
  const budgetValid = budget.trim() !== '' && Number.isFinite(amount) && amount >= 0;
  // Each typed value is its own little form: the key's « OK » saves the key, the budget's applies it.
  const keyForm = useForm({ key: claudeKeyProblem(key) }, { order: ['key'], sendOnDone: () => save({ anthropicApiKey: key.trim() }, 'key', t('Clé enregistrée')) });
  const budgetForm = useForm(
    { budget: budgetValid ? null : t('Un montant en dollars, 0 ou plus.') },
    { order: ['budget'], sendOnDone: () => (settings && amount === settings.analysis.budgetUsd ? true : save({ budgetUsd: amount }, 'budget', t('Budget enregistré'))) },
  );

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

  /** Saves; what the server refuses comes back under the field typed (the key, the budget), else on a slip. */
  async function save(patch: Parameters<typeof saveServerSettings>[1], what: 'key' | 'budget' | 'other', done?: string): Promise<boolean> {
    setBusy(true);
    try {
      const next = await saveServerSettings(server, patch);
      setSettings(next);
      rememberServerSettings(next);
      if (what === 'key' || patch.anthropicApiKey === null) {
        setKey('');
        keyForm.reset();
      }
      if (done) showSnack(done, undefined, { tone: 'success' });
      return true;
    } catch (failure) {
      const message = failure instanceof Error ? t(failure.message) : t('Réglage refusé');
      if (what === 'key') keyForm.fail('key', message);
      else if (what === 'budget') budgetForm.fail('budget', message);
      else showSnack(message, undefined, { tone: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <ListRow icon="info" title={t('Réglages du serveur indisponibles')} supporting={t('Le serveur ne répond pas pour l’instant.')} onPress={load} />;
  }
  const analysis = settings.analysis;
  const model = analysis.model;
  const uses = settings.apps.enabled.map(claudeUse).filter((use): use is string => use !== null);

  return (
    <View>
      {/* Its removal in the status row, as on the web (and Seerr's, S3's, Seafile's). */}
      <StatusRow
        line={{
          tone: analysis.enabled ? 'ok' : 'off',
          title: analysis.enabled ? t('Claude activé') : t('Claude désactivé'),
          meta: analysis.enabled
            ? analysis.keySource === 'env'
              ? t('Clé {hint} (définie sur le serveur)', { hint: analysis.keyHint ?? '' })
              : t('Clé {hint}', { hint: analysis.keyHint ?? '' })
            : t('Sans clé, rien n’est demandé à Claude : les applications marchent sans lui.'),
        }}
      >
        {analysis.keySource === 'app' ? (
          <Button
            kind="dangerText"
            small
            label={t('Supprimer la clé')}
            onPress={() =>
              ask({
                title: t('Supprimer la clé ?'),
                message: t('Plus rien ne sera demandé à Claude, dans aucune application. Ce qu’il a déjà fait reste tel quel.'),
                confirmLabel: t('Supprimer'),
                danger: true,
                run: () => void save({ anthropicApiKey: null }, 'other', t('Clé supprimée')),
              })
            }
          />
        ) : null}
      </StatusRow>
      {uses.length > 0 ? (
        <View style={styles.uses}>
          {uses.map(use => (
            <View key={use} style={styles.use}>
              <View style={styles.useSlot}>
                <View style={[styles.useDot, { backgroundColor: theme.color.inkMuted }]} />
              </View>
              <AppText variant="meta" style={styles.flex}>
                {use}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.fields}>
        <TextField
          label={analysis.enabled ? t('Remplacer la clé API Claude') : t('Clé API Claude')}
          kind="secret"
          value={key}
          onChangeText={setKey}
          field={keyForm.field('key')}
          placeholder="sk-ant-…"
          help={<ConsoleHelp />}
          revealLabels={{ show: t('Afficher la clé'), hide: t('Masquer la clé') }}
        />
        <View style={styles.row}>
          <Button label={t('Enregistrer la clé')} icon="key" busy={keyForm.busy} onPress={() => void keyForm.submit(() => save({ anthropicApiKey: key.trim() }, 'key', t('Clé enregistrée')))} />
        </View>

        <AppText variant="metaStrong">{t('Modèle')}</AppText>
        <Segmented<ClaudeModel>
          label={t('Modèle')}
          value={model}
          disabled={busy}
          onChange={next => void save({ model: next }, 'other', t('Modèle : {model}', { model: CLAUDE_MODEL_NAMES[next] }))}
          options={CLAUDE_MODELS.map(id => ({ value: id, label: CLAUDE_MODEL_NAMES[id] }))}
        />
        <View style={styles.budgetRow}>
          <View style={styles.flex}>
            <TextField
              label={t('Budget mensuel ($)')}
              kind="decimal"
              value={budget}
              onChangeText={setBudget}
              field={budgetForm.field('budget')}
              help={t('Claude s’arrête pour le mois, dans toutes les applications, une fois le budget atteint.')}
            />
          </View>
          <Button
            kind="tonal"
            label={t('Appliquer')}
            busy={budgetForm.busy}
            disabled={budgetValid && amount === analysis.budgetUsd}
            onPress={() => void budgetForm.submit(() => (amount === analysis.budgetUsd ? true : save({ budgetUsd: amount }, 'budget', t('Budget enregistré'))))}
            style={styles.apply}
          />
        </View>
      </View>

      <UsagePanel usage={usage} budgetUsd={analysis.budgetUsd} />
      {extra?.({ settings, usage })}
    </View>
  );
}

/** The month's spend over a strip filled against the budget (the web's, the same words: the apps' own counts are theirs, Carnet's links read). */
function UsagePanel({ usage, budgetUsd }: { usage: Usage | null; budgetUsd: number }) {
  const theme = useTheme();
  if (!usage) {
    return (
      <View style={styles.usage}>
        <AppText variant="meta">{t('Consommation indisponible')}</AppText>
      </View>
    );
  }
  const share = budgetUsd > 0 ? Math.min(1, usage.month.costUsd / budgetUsd) : 0;
  return (
    <View style={styles.usage}>
      <AppText variant="bodyStrong">{t('Ce mois-ci : {cost}', { cost: usd(usage.month.costUsd) })}</AppText>
      <View
        style={[styles.meter, { backgroundColor: theme.color.paperHigh, borderColor: theme.color.outline }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('Budget du mois utilisé')}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
      >
        <View style={[styles.meterFill, { width: `${share * 100}%`, backgroundColor: share > 0.8 ? theme.color.waiting : theme.color.action }]} />
      </View>
      <AppText variant="meta">{t('Sur un budget de {budget} · depuis le début {total}', { budget: usd(budgetUsd), total: usd(usage.total.costUsd) })}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  usage: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  // A strip at the detail radius, sunk in paper with an outline edge, filled in the action's colour (waiting past 80%).
  meter: { height: 10, borderWidth: 1, overflow: 'hidden', ...corners(SHAPES.detail) },
  meterFill: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  uses: { gap: 6, paddingHorizontal: 16, paddingBottom: 12 },
  // What Claude does in each app: a line on a small dot, its words hanging beside it (as on the web), on the status row's columns.
  use: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  // The status dot's 10 slot, the small dot in its middle.
  useSlot: { width: 10, alignItems: 'center' },
  // Centred on meta's 18 dp line.
  useDot: { width: 5, height: 5, ...corners(SHAPES.dot), marginTop: 6.5 },
  fields: { gap: 14, paddingHorizontal: 16, paddingBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  budgetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  apply: { marginTop: 26 },
});

/** Where the key comes from, the console a link that opens in the browser (nested in the field's help line). */
function ConsoleHelp() {
  const theme = useTheme();
  const [before, after] = around(t('Créée sur {site}. Elle est vérifiée puis gardée sur votre serveur.'), 'site');
  return (
    <>
      {before}
      <AppText variant="metaStrong" color={theme.color.link} accessibilityRole="link" onPress={() => void Linking.openURL(ANTHROPIC_CONSOLE.url)}>
        {ANTHROPIC_CONSOLE.name}
      </AppText>
      {after}
    </>
  );
}
