/**
 * « Questions sur les pages »: whether the pages offer « Demander à Claude », and how far one
 * question may read. Off until turned on here, and only with Claude's key (the section above):
 * nothing of the pages is sent before. The phone's PagesAskSection.
 */
import { useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { askWords } from '@unlease/notes/services/pagesAsk';
import { askCost } from '@unlease/notes/sync/pagesAsk';
import { CLAUDE_MODEL_NAMES, PAGES_REACH_CHARS, PAGES_REACH_NAMES, PAGES_REACHES, type PagesAskSettings, type PagesReach, type ServerSettings } from '@unlease/core/sync/settings';

import { setServerSettings } from '../../../app/store/serverSettings';
import type { ServerConfig } from '../../../app/store/settings';
import { showError, showSnack } from '../../../app/store/ui';
import { saveServerSettings } from '../../../app/sync/transport';
import { SwitchMark } from '../../components/Checkbox';
import { Icon } from '../../components/Icon';
import { Segmented } from '../../components/Segmented';
import { formatUsd } from '../../money';
import styles from './settings.module.css';

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
      showError(t(failure instanceof Error ? failure.message : tx('Réglage refusé')));
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
        onClick={() => void save({ enabled: !pages.enabled }, pages.enabled ? t('Questions sur les pages désactivées') : t('Questions sur les pages activées'))}
      >
        <Icon name="sparkle" size={24} />
        <span className={styles.rowText}>
          <span className="t-body">{t('« Demander à Claude » sur les pages')}</span>
          <span className="t-meta">
            {!keyed
              ? t('Ajoutez d’abord une clé Claude, plus haut.')
              : on
                ? t('Un bouton discret sur chaque page : Claude répond d’après vos pages et cite les passages.')
                : t('Désactivé : rien de vos pages n’est envoyé à Claude.')}
          </span>
        </span>
        <SwitchMark checked={on} />
      </button>

      {on ? (
        <>
          <button type="button" role="switch" aria-checked={pages.everywhere} className={styles.row} disabled={busy} onClick={() => void save({ everywhere: !pages.everywhere }, t('Réglage enregistré'))}>
            <Icon name="collections" size={24} />
            <span className={styles.rowText}>
              <span className="t-body">{t('Questions sur toutes les pages')}</span>
              <span className="t-meta">{t('Claude lit alors les pages les plus proches de la question, pas seulement celle ouverte et ses sous-pages.')}</span>
            </span>
            <SwitchMark checked={pages.everywhere} />
          </button>
          <button type="button" role="switch" aria-checked={pages.web} className={styles.row} disabled={busy} onClick={() => void save({ web: !pages.web }, t('Réglage enregistré'))}>
            <Icon name="globe" size={24} />
            <span className={styles.rowText}>
              <span className="t-body">{t('Compléter par le web')}</span>
              <span className="t-meta">{t('Chaque question peut aussi chercher sur le web, si vous le cochez (plus cher).')}</span>
            </span>
            <SwitchMark checked={pages.web} />
          </button>
          <div className={styles.block}>
            <p className="t-meta-strong">{t('Lecture par question')}</p>
            <Segmented<PagesReach> label={t('Lecture par question')} options={reachOptions} value={pages.reach} disabled={busy} onChange={reach => void save({ reach }, t('Lecture par question : {reach}', { reach: PAGES_REACH_NAMES[reach] }))} />
            <p className="t-meta">
              {t('Jusqu’à environ {words} mots de vos pages par question, {cost} au plus avec {model}. Une suite de conversation coûte moins : les pages déjà lues sont en cache.', {
                words: askWords(chars),
                cost: formatUsd(askCost(chars, model, false)),
                model: CLAUDE_MODEL_NAMES[model],
              })}
            </p>
          </div>
          <div className={styles.block}>
            <p className="t-meta">{t('« Garder hors de Claude », dans le menu d’une page, la retire de toute question, avec ses sous-pages.')}</p>
          </div>
        </>
      ) : null}
    </>
  );
}
