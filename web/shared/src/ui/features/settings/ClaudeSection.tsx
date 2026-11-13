/**
 * "Claude": the key, the model, the budget, what it cost, shared by every app (Carnet reads links
 * with it, Pages answers questions), each app on saying what it does with it (`claudeUse`) and
 * adding its own lines after (`AppModule.ClaudeExtras`: Carnet's links not read yet).
 *
 * The key is stored on the owner's server (Claude is called from there) but set here, never in
 * source code. The server checks it before keeping it, so a typo is refused on the spot, in the
 * server's own words. Without a key nothing is asked of Claude; without a server, the section says
 * where the key will live and leads to the server's address. The phone's ReadingSection, on a desk.
 */
import { useCallback, useEffect, useId, useState, type CSSProperties } from 'react';

import { READY_APPS, SUITE_NAME } from '@unlease/core/apps';
import { around, getLocale, t, tc, tx } from '@unlease/core/i18n';
import { claudeKeyProblem, claudeUse } from '@unlease/core/services/setup';
import { ANTHROPIC_CONSOLE, CLAUDE_MODEL_NAMES, CLAUDE_MODELS, type ClaudeModel, type SettingsPatch } from '@unlease/core/sync/settings';

import { selectServerApps, useSettingsStore } from '../../../app/store/settings';
import { selectServerSettings, setServerSettings, useServerSettingsStore } from '../../../app/store/serverSettings';
import type { ServerConfig } from '../../../app/store/settings';
import { showError, showSnack } from '../../../app/store/ui';
import { fetchServerSettings, fetchUsage, saveServerSettings, type Usage } from '../../../app/sync/transport';
import { Button } from '../../components/Button';
import { Confirm } from '../../components/Dialog';
import { Segmented } from '../../components/Segmented';
import { TextField } from '../../components/TextField';
import { useForm } from '../../components/useForm';
import { formatUsd as usd } from '../../money';
import { theApp } from '../../../modules';
import controls from '../../components/controls.module.css';
import styles from './settings.module.css';

type Busy = 'key' | 'remove' | 'model' | 'budget' | null;

const parseAmount = (value: string): number => Number(value.replace(',', '.').trim());
const showAmount = (value: number): string => (getLocale() === 'en' ? String(value) : String(value).replace('.', ','));

/** The models, in the same segmented control as the theme, as on the phone. */
const MODEL_OPTIONS = CLAUDE_MODELS.map(model => ({ value: model, label: CLAUDE_MODEL_NAMES[model] }));

/** The month's spend, in the phone's words, over a strip filled against the budget (the phone's too). */
function UsagePanel({ usage, budgetUsd }: { usage: Usage | null; budgetUsd: number }) {
  if (!usage) {
    return (
      <div className={styles.block}>
        <p className="t-meta">{t('Usage unavailable')}</p>
      </div>
    );
  }
  const share = budgetUsd > 0 ? Math.min(1, usage.month.costUsd / budgetUsd) : 0;
  return (
    <div className={styles.block}>
      {/* The apps' own counts are theirs (Carnet's links read, `ClaudeExtras`): every app shares the spend. */}
      <p className="t-body-strong tabular">{t('This month: {cost}', { cost: usd(usage.month.costUsd) })}</p>
      <div className={styles.meter} role="meter" aria-label={t('Monthly budget used')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
        <span className={styles.meterFill} data-high={share > 0.8 || undefined} style={{ width: `${share * 100}%` }} />
      </div>
      <p className="t-meta tabular">{t('Out of a budget of {budget} · since the start {total}', { budget: usd(budgetUsd), total: usd(usage.total.costUsd) })}</p>
    </div>
  );
}

/** What Claude does for each app the server runs (every one until it says), one line each: the key is every app's. */
function ClaudeUses() {
  const on = useSettingsStore(selectServerApps) ?? READY_APPS;
  const uses = on.flatMap(app => claudeUse(app) ?? []);
  if (uses.length === 0) return null;
  return (
    <ul className={`${styles.block} ${styles.uses}`}>
      {uses.map(use => (
        <li key={use} className="t-body">
          {use}
        </li>
      ))}
    </ul>
  );
}

/** Without a server there is nothing to set yet: say where the key lives and how to get there. */
export function ClaudeSection({ server, onConnect }: { server: ServerConfig | null; onConnect: () => void }) {
  if (!server) return <NoServer onConnect={onConnect} />;
  return <ServerClaude server={server} />;
}

function NoServer({ onConnect }: { onConnect: () => void }) {
  return (
    <>
      <div className={`${styles.status} ${styles.statusTop}`}>
        <span className={styles.dot} style={{ '--dot': 'var(--ink-faint)' } as CSSProperties} aria-hidden="true" />
        <div className={styles.rowText}>
          <p className="t-body-strong">{t('Claude off')}</p>
          <p className="t-meta">{t('Without a key, nothing is asked of Claude: the apps work without it.')}</p>
        </div>
      </div>
      <ClaudeUses />
      <div className={styles.block}>
        <p className={`${styles.prose} t-body`}>
          {t('Calls go out from your {suite} server, which keeps the API key: connect it to add the key, choose the model and set a monthly budget, for every app.', { suite: SUITE_NAME })}
        </p>
        <div className={styles.buttons}>
          <Button kind="tonal" icon="server" onClick={onConnect}>
            {tc('claude', 'Connect a server')}
          </Button>
        </div>
      </div>
    </>
  );
}

function ServerClaude({ server }: { server: ServerConfig }) {
  const settings = useServerSettingsStore(selectServerSettings);
  const Extras = theApp().ClaudeExtras;
  const [unavailable, setUnavailable] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [key, setKey] = useState('');
  const [budget, setBudget] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const budgetId = useId();
  const keyForm = useForm({ key: claudeKeyProblem(key) });
  const budgetValue = budget ?? (settings ? showAmount(settings.analysis.budgetUsd) : '');
  const budgetNumber = parseAmount(budgetValue);
  // An emptied field is no budget (Number('') would read as 0 and stop all reading).
  const budgetValid = budgetValue.trim() !== '' && Number.isFinite(budgetNumber) && budgetNumber >= 0;
  const budgetForm = useForm({ budget: budgetValid ? null : t('An amount in dollars, 0 or more.') });

  const load = useCallback(() => {
    void fetchServerSettings(server).then(next => {
      setUnavailable(!next);
      if (next) setServerSettings(next);
    });
    void fetchUsage(server).then(setUsage);
  }, [server]);
  useEffect(load, [load]);

  /** Saves; what the server refuses comes back under the field typed (the key, the budget), else on a slip. */
  const save = async (patch: SettingsPatch, what: Exclude<Busy, null>, done: string): Promise<boolean> => {
    setBusy(what);
    try {
      setServerSettings(await saveServerSettings(server, patch));
      if (what === 'key' || what === 'remove') {
        setKey('');
        keyForm.reset();
      }
      if (what === 'budget') setBudget(null);
      showSnack(done, undefined, { tone: 'success' });
      void fetchUsage(server).then(setUsage);
      return true;
    } catch (failure) {
      const message = t(failure instanceof Error ? failure.message : tx('Setting refused'));
      if (what === 'key') keyForm.fail('key', message);
      else if (what === 'budget') budgetForm.fail('budget', message);
      else showError(message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (!settings) {
    return (
      <div className={`${styles.status} ${styles.statusTop}`}>
        <span className={styles.dot} style={{ '--dot': 'var(--ink-faint)' } as CSSProperties} aria-hidden="true" />
        <div className={styles.rowText}>
          <p className="t-body">{unavailable ? t('Server settings unavailable') : t('Reading the server’s settings…')}</p>
          {unavailable ? <p className="t-meta">{t('The server isn’t answering for now.')}</p> : null}
        </div>
        {unavailable ? (
          <Button kind="text" small onClick={load}>
            {t('Try again')}
          </Button>
        ) : null}
      </div>
    );
  }

  const analysis = settings.analysis;

  return (
    <>
      <div className={`${styles.status} ${styles.statusTop}`}>
        <span className={styles.dot} style={{ '--dot': analysis.enabled ? 'var(--ok)' : 'var(--ink-faint)' } as CSSProperties} aria-hidden="true" />
        <div className={styles.rowText}>
          <p className="t-body-strong">{analysis.enabled ? t('Claude on') : t('Claude off')}</p>
          <p className="t-meta">
            {analysis.enabled
              ? analysis.keySource === 'env'
                ? t('Key {hint} (set on the server)', { hint: analysis.keyHint ?? '' })
                : t('Key {hint}', { hint: analysis.keyHint ?? '' })
              : t('Without a key, nothing is asked of Claude: the apps work without it.')}
          </p>
        </div>
        {analysis.keySource === 'app' ? (
          <Button kind="dangerText" small busy={busy === 'remove'} onClick={() => setConfirmRemove(true)}>
            {t('Delete the key')}
          </Button>
        ) : null}
      </div>

      <ClaudeUses />

      <form className={styles.block} onSubmit={keyForm.onSubmit(() => save({ anthropicApiKey: key.trim() }, 'key', t('Key saved')))} noValidate>
        <TextField
          label={analysis.enabled ? t('Replace the Claude API key') : t('Claude API key')}
          kind="secret"
          value={key}
          onChange={setKey}
          field={keyForm.field('key')}
          placeholder="sk-ant-…"
          help={<ConsoleHelp />}
          revealLabels={{ show: t('Show the key'), hide: t('Hide the key') }}
        />
        <div className={styles.buttons}>
          <Button type="submit" icon="key" busy={keyForm.busy}>
            {t('Save the key')}
          </Button>
        </div>
      </form>

      <div className={styles.block}>
        {/* In line with the fields' labels around it. */}
        <p className={`${controls.fieldLabel} t-meta-strong`}>{t('Model')}</p>
        <Segmented<ClaudeModel> label={t('Model')} options={MODEL_OPTIONS} value={analysis.model} disabled={busy !== null} onChange={model => void save({ model }, 'model', t('Model: {model}', { model: CLAUDE_MODEL_NAMES[model] }))} />
      </div>

      <form className={styles.block} onSubmit={budgetForm.onSubmit(() => (budgetNumber === analysis.budgetUsd ? true : save({ budgetUsd: budgetNumber }, 'budget', t('Budget saved'))))} noValidate>
        <div className={styles.budgetRow}>
          <TextField
            label={t('Monthly budget ($)')}
            kind="decimal"
            name={budgetId}
            value={budgetValue}
            onChange={setBudget}
            field={budgetForm.field('budget')}
            className={styles.budgetField}
          />
          <Button type="submit" kind="tonal" busy={budgetForm.busy} disabled={budgetValid && budgetNumber === analysis.budgetUsd} className={styles.apply}>
            {t('Apply')}
          </Button>
        </div>
        <p className={`${controls.fieldNoteAlone} t-meta`}>{t('Claude stops for the month, in every app, once the budget is reached.')}</p>
      </form>

      <UsagePanel usage={usage} budgetUsd={analysis.budgetUsd} />

      {Extras ? <Extras server={server} settings={settings} usage={usage} /> : null}

      <Confirm
        open={confirmRemove}
        title={t('Delete the key?')}
        message={t('Nothing will be asked of Claude any more, in any app. What it has already done stays as it is.')}
        confirmLabel={t('Delete')}
        danger
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          void save({ anthropicApiKey: null }, 'remove', t('Key deleted'));
        }}
      />
    </>
  );
}

/** Where the key comes from, the console a link that opens beside the app. */
function ConsoleHelp() {
  const [before, after] = around(t('Created on {site}. It is checked, then kept on your server, never in this browser.'), 'site');
  return (
    <>
      {before}
      <a href={ANTHROPIC_CONSOLE.url} target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>
        {ANTHROPIC_CONSOLE.name}
      </a>
      {after}
    </>
  );
}
