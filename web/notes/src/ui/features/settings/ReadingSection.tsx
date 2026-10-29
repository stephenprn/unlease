/**
 * "Lecture des liens par Claude": the key, the model, the budget, what it cost.
 *
 * The key is stored on the owner's server (link reading runs there) but set
 * here, never in source code. The server checks it before keeping it, so a
 * typo is refused on the spot, in the server's own words. Without a key, links
 * are kept plain and nothing is read; without a server, the section says where
 * the key will live and leads to the server's address. The phone's
 * ReadingSection, on a desk.
 */
import { useCallback, useEffect, useId, useState, type CSSProperties } from 'react';

import { APP_NAME } from '@unlease/notes/brand';
import { getLocale, t, tx } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { CLAUDE_COST_PER_WEB_SEARCH, CLAUDE_COST_PER_LINK, CLAUDE_MODEL_NAMES, CLAUDE_MODELS, type ClaudeModel, type SettingsPatch } from '@unlease/core/sync/settings';

import { readSkippedLinks } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { selectServerSettings, setServerSettings, useServerSettingsStore } from '../../../app/store/serverSettings';
import type { ServerConfig } from '../../../app/store/settings';
import { showError, showSnack } from '../../../app/store/ui';
import { fetchServerSettings, fetchUsage, saveServerSettings, type Usage } from '../../../app/sync/transport';
import { Button } from '../../components/Button';
import { Confirm } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { Segmented } from '../../components/Segmented';
import { TextField } from '../../components/TextField';
import { formatUsd as usd } from '../../money';
import styles from './settings.module.css';

type Busy = 'key' | 'remove' | 'model' | 'budget' | null;

const parseAmount = (value: string): number => Number(value.replace(',', '.').trim());
const showAmount = (value: number): string => (getLocale() === 'en' ? String(value) : String(value).replace('.', ','));

/** The models, in the same segmented control as the theme, as on the phone. */
const MODEL_OPTIONS = CLAUDE_MODELS.map(model => ({ value: model, label: CLAUDE_MODEL_NAMES[model] }));

/** The month's spend, in the phone's words, over a strip filled against the budget. */
function UsagePanel({ usage, budgetUsd }: { usage: Usage | null; budgetUsd: number }) {
  if (!usage) {
    return (
      <div className={styles.block}>
        <p className="t-meta">{t('Consommation indisponible')}</p>
      </div>
    );
  }
  const share = budgetUsd > 0 ? Math.min(1, usage.month.costUsd / budgetUsd) : 0;
  return (
    <div className={styles.block}>
      <p className="t-body-strong tabular">{t('Ce mois-ci : {links}, {cost}', { links: plural(usage.month.analyses, 'lien lu', 'liens lus'), cost: usd(usage.month.costUsd) })}</p>
      <div className={styles.meter} role="meter" aria-label={t('Budget du mois utilisé')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
        <span className={styles.meterFill} data-high={share > 0.8 || undefined} style={{ width: `${share * 100}%` }} />
      </div>
      <p className="t-meta tabular">{t('Sur un budget de {budget} · depuis le début {total}', { budget: usd(budgetUsd), total: usd(usage.total.costUsd) })}</p>
    </div>
  );
}

/** Without a server there is nothing to set yet: say where the key lives and how to get there. */
export function ReadingSection({ server, onConnect }: { server: ServerConfig | null; onConnect: () => void }) {
  if (!server) return <NoServer onConnect={onConnect} />;
  return <ServerReading server={server} />;
}

function NoServer({ onConnect }: { onConnect: () => void }) {
  return (
    <>
      <div className={`${styles.status} ${styles.statusTop}`}>
        <span className={styles.dot} style={{ '--dot': 'var(--ink-faint)' } as CSSProperties} aria-hidden="true" />
        <div className={styles.rowText}>
          <p className="t-body-strong">{t('Lecture désactivée')}</p>
          <p className="t-meta">{t('Les liens sont gardés tels quels, sans titre, prix ni rangement automatique.')}</p>
        </div>
      </div>
      <div className={styles.block}>
        <p className={`${styles.prose} t-body`}>
          {t('Claude lit chaque lien enregistré (titre, prix, résumé, images) et le range dans la bonne collection. Les appels partent de votre serveur {app}, qui garde la clé API : connectez-le pour ajouter la clé, choisir le modèle et fixer un budget mensuel.', { app: APP_NAME })}
        </p>
        <div className={styles.buttons}>
          <Button kind="tonal" icon="server" onClick={onConnect}>
            {t('Connecter un serveur')}
          </Button>
        </div>
      </div>
    </>
  );
}

function ServerReading({ server }: { server: ServerConfig }) {
  const settings = useServerSettingsStore(selectServerSettings);
  const skipped = useLibraryStore(s => Object.values(s.links).filter(link => link.status === 'skipped' && link.deletedAt === null).length);
  const [unavailable, setUnavailable] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const budgetId = useId();

  const load = useCallback(() => {
    void fetchServerSettings(server).then(next => {
      setUnavailable(!next);
      if (next) setServerSettings(next);
    });
    void fetchUsage(server).then(setUsage);
  }, [server]);
  useEffect(load, [load]);

  const save = async (patch: SettingsPatch, what: Exclude<Busy, null>, done: string): Promise<void> => {
    setBusy(what);
    if (what === 'key') setKeyError(null);
    try {
      setServerSettings(await saveServerSettings(server, patch));
      if (what === 'key' || what === 'remove') setKey('');
      if (what === 'budget') setBudget(null);
      showSnack(done, undefined, { tone: 'success' });
      void fetchUsage(server).then(setUsage);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : tx('Réglage refusé');
      if (what === 'key') setKeyError(message);
      else showError(t(message));
    } finally {
      setBusy(null);
    }
  };

  if (!settings) {
    return (
      <div className={`${styles.status} ${styles.statusTop}`}>
        <span className={styles.dot} style={{ '--dot': 'var(--ink-faint)' } as CSSProperties} aria-hidden="true" />
        <div className={styles.rowText}>
          <p className="t-body">{unavailable ? t('Réglages du serveur indisponibles') : t('Lecture des réglages du serveur…')}</p>
          {unavailable ? <p className="t-meta">{t('Le serveur ne répond pas pour l’instant.')}</p> : null}
        </div>
        {unavailable ? (
          <Button kind="text" small onClick={load}>
            {t('Réessayer')}
          </Button>
        ) : null}
      </div>
    );
  }

  const analysis = settings.analysis;
  const budgetValue = budget ?? showAmount(analysis.budgetUsd);
  const budgetNumber = parseAmount(budgetValue);
  // An emptied field is no budget (Number('') would read as 0 and stop all reading).
  const budgetValid = budgetValue.trim() !== '' && Number.isFinite(budgetNumber) && budgetNumber >= 0;

  return (
    <>
      <div className={`${styles.status} ${styles.statusTop}`}>
        <span className={styles.dot} style={{ '--dot': analysis.enabled ? 'var(--ok)' : 'var(--ink-faint)' } as CSSProperties} aria-hidden="true" />
        <div className={styles.rowText}>
          <p className="t-body-strong">{analysis.enabled ? t('Lecture activée') : t('Lecture désactivée')}</p>
          <p className="t-meta">
            {analysis.enabled
              ? analysis.keySource === 'env'
                ? t('Clé {hint} (définie sur le serveur)', { hint: analysis.keyHint ?? '' })
                : t('Clé {hint}', { hint: analysis.keyHint ?? '' })
              : t('Sans clé, les liens sont gardés tels quels, sans titre, prix ni rangement automatique.')}
          </p>
        </div>
        {analysis.keySource === 'app' ? (
          <Button kind="dangerText" small busy={busy === 'remove'} onClick={() => setConfirmRemove(true)}>
            {t('Supprimer la clé')}
          </Button>
        ) : null}
      </div>

      <form
        className={styles.block}
        onSubmit={event => {
          event.preventDefault();
          if (key.trim().length >= 20) void save({ anthropicApiKey: key.trim() }, 'key', t('Clé enregistrée : les liens seront lus.'));
        }}
      >
        <div className={styles.tokenWrap}>
          <TextField
            label={analysis.enabled ? t('Remplacer la clé API Claude') : t('Clé API Claude')}
            value={key}
            onChange={value => {
              setKey(value);
              setKeyError(null);
            }}
            type={showKey ? 'text' : 'password'}
            placeholder="sk-ant-…"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            error={keyError ? t(keyError) : null}
            help={t('Créée sur console.anthropic.com. Elle est vérifiée puis gardée sur votre serveur, jamais dans ce navigateur.')}
            inputClassName={styles.tokenInput}
          />
          <IconButton icon={showKey ? 'eyeOff' : 'eye'} label={showKey ? t('Masquer la clé') : t('Afficher la clé')} className={styles.eyeTop} onClick={() => setShowKey(value => !value)} />
        </div>
        <div className={styles.buttons}>
          <Button type="submit" icon="key" busy={busy === 'key'} disabled={key.trim().length < 20}>
            {t('Enregistrer la clé')}
          </Button>
        </div>
      </form>

      <div className={styles.block}>
        <p className="t-meta-strong">{t('Modèle')}</p>
        <Segmented<ClaudeModel> label={t('Modèle')} options={MODEL_OPTIONS} value={analysis.model} disabled={busy !== null} onChange={model => void save({ model }, 'model', t('Modèle : {model}', { model: CLAUDE_MODEL_NAMES[model] }))} />
        <p className="t-meta">{t('Environ {cost} par lien lu, {search} par recherche d’un module sur le web.', { cost: usd(CLAUDE_COST_PER_LINK[analysis.model]), search: usd(CLAUDE_COST_PER_WEB_SEARCH[analysis.model]) })}</p>
      </div>

      <form
        className={styles.block}
        onSubmit={event => {
          event.preventDefault();
          if (budgetValid && budgetNumber !== analysis.budgetUsd) void save({ budgetUsd: budgetNumber }, 'budget', t('Budget enregistré'));
        }}
      >
        <div className={styles.budgetRow}>
          <TextField
            label={t('Budget mensuel ($)')}
            name={budgetId}
            value={budgetValue}
            onChange={setBudget}
            inputMode="decimal"
            autoComplete="off"
            error={budgetValid ? null : t('Un montant en dollars, 0 ou plus.')}
            className={styles.budgetField}
          />
          <Button type="submit" kind="tonal" busy={busy === 'budget'} disabled={!budgetValid || budgetNumber === analysis.budgetUsd} className={styles.apply}>
            {t('Appliquer')}
          </Button>
        </div>
        <p className="t-meta">{t('La lecture s’arrête pour le mois une fois le budget atteint.')}</p>
      </form>

      <UsagePanel usage={usage} budgetUsd={analysis.budgetUsd} />

      {analysis.enabled && skipped > 0 ? (
        <button type="button" className={styles.row} onClick={() => showSnack(t('{links} en lecture', { links: plural(readSkippedLinks(), 'lien envoyé', 'liens envoyés') }), undefined, { tone: 'success' })}>
          <Icon name="refresh" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{skipped === 1 ? t('Lire le lien non lu') : t('Lire les {links}', { links: plural(skipped, 'lien non lu', 'liens non lus') })}</span>
            <span className="t-meta">{skipped === 1 ? t('Gardé tel quel quand la lecture était désactivée · environ {cost}', { cost: usd(skipped * CLAUDE_COST_PER_LINK[analysis.model]) }) : t('Gardés tels quels quand la lecture était désactivée · environ {cost}', { cost: usd(skipped * CLAUDE_COST_PER_LINK[analysis.model]) })}</span>
          </span>
        </button>
      ) : null}

      <Confirm
        open={confirmRemove}
        title={t('Supprimer la clé ?')}
        message={t('Les nouveaux liens ne seront plus lus ni rangés automatiquement. Ceux déjà lus restent tels quels.')}
        confirmLabel={t('Supprimer')}
        danger
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          void save({ anthropicApiKey: null }, 'remove', t('Clé supprimée'));
        }}
      />
    </>
  );
}
