/**
 * « Questions sur les pages »: whether the pages offer « Demander à Claude », and how far one
 * question may read. Off until turned on here, and only with Claude's key (the section above):
 * nothing of the pages is sent before. The phone's PagesAskSection.
 */
import { useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { askWords } from '@unlease/pages/services/pagesAsk';
import { askCost } from '@unlease/pages/sync/pagesAsk';
import { CLAUDE_MODEL_NAMES, PAGES_REACH_CHARS, PAGES_REACH_NAMES, PAGES_REACHES, type PagesAskSettings, type PagesReach, type ServerSettings } from '@unlease/core/sync/settings';

import { setServerSettings } from '@shared/app/store/serverSettings';
import type { ServerConfig } from '@shared/app/store/settings';
import { showError, showSnack } from '@shared/app/store/ui';
import { saveServerSettings } from '@shared/app/sync/transport';
import { SwitchMark } from '@shared/ui/components/Checkbox';
import { Icon } from '@shared/ui/components/Icon';
import { Segmented } from '@shared/ui/components/Segmented';
import { formatUsd } from '@shared/ui/money';
import styles from '@shared/ui/features/settings/settings.module.css';

export function PagesAskSection({ server, settings }: { server: ServerConfig; settings: ServerSettings }) {
  const [busy, setBusy] = useState(false);
  const pages = settings.pages;
  const keyed = settings.analysis.enabled;
  const model = settings.analysis.model;

  const save = async (patch: Partial<PagesAskSettings>, done: string): Promise<void> => {
    setBusy(true);
    try {
      setServerSettings(await saveServerSettings(server, { pages: patch }));
      showSnack(done, undefined, { tone: 'success' });
    } catch (failure) {
      showError(t(failure instanceof Error ? failure.message : tx('Setting refused')));
    } finally {
      setBusy(false);
    }
  };

  const reachOptions = PAGES_REACHES.map(reach => ({ value: reach, label: PAGES_REACH_NAMES[reach] }));
  const chars = PAGES_REACH_CHARS[pages.reach];
  const on = pages.enabled && keyed;

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={styles.row}
        disabled={busy || !keyed}
        onClick={() => void save({ enabled: !pages.enabled }, pages.enabled ? t('Questions about pages turned off') : t('Questions about pages turned on'))}
      >
        <Icon name="sparkle" size={24} />
        <span className={styles.rowText}>
          <span className="t-body">{t('“Ask Claude” on pages')}</span>
          <span className="t-meta">
            {!keyed
              ? t('Add a Claude key first, above.')
              : on
                ? t('A quiet button on each page: Claude answers from your pages and cites the passages.')
                : t('Off: nothing from your pages is sent to Claude.')}
          </span>
        </span>
        <SwitchMark checked={on} />
      </button>

      {on ? (
        <>
          <button type="button" role="switch" aria-checked={pages.everywhere} className={styles.row} disabled={busy} onClick={() => void save({ everywhere: !pages.everywhere }, t('Setting saved'))}>
            <Icon name="collections" size={24} />
            <span className={styles.rowText}>
              <span className="t-body">{t('Questions about all pages')}</span>
              <span className="t-meta">{t('Claude then reads the pages closest to the question, not only the open one and its sub-pages.')}</span>
            </span>
            <SwitchMark checked={pages.everywhere} />
          </button>
          <button type="button" role="switch" aria-checked={pages.web} className={styles.row} disabled={busy} onClick={() => void save({ web: !pages.web }, t('Setting saved'))}>
            <Icon name="globe" size={24} />
            <span className={styles.rowText}>
              <span className="t-body">{t('Add the web')}</span>
              <span className="t-meta">{t('Each question may also search the web, when you tick it (dearer).')}</span>
            </span>
            <SwitchMark checked={pages.web} />
          </button>
          <div className={styles.block}>
            <p className="t-meta-strong">{t('Reading per question')}</p>
            <Segmented<PagesReach> label={t('Reading per question')} options={reachOptions} value={pages.reach} disabled={busy} onChange={reach => void save({ reach }, t('Reading per question: {reach}', { reach: PAGES_REACH_NAMES[reach] }))} />
            <p className="t-meta">
              {t('Up to about {words} words of your pages per question, {cost} at most with {model}. A follow-up costs less: the pages already read are cached.', {
                words: askWords(chars),
                cost: formatUsd(askCost(chars, model, false)),
                model: CLAUDE_MODEL_NAMES[model],
              })}
            </p>
          </div>
          <div className={styles.block}>
            <p className="t-meta">{t('“Keep away from Claude”, in a page’s menu, leaves it out of every question, with its sub-pages.')}</p>
          </div>
        </>
      ) : null}
    </>
  );
}
