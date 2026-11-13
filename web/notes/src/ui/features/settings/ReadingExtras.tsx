/**
 * Carnet's lines in the Claude form (the Administration's, the setup's): what reading a link and a
 * module's search cost with the model chosen, the links read this month, the links kept plain
 * while nothing read them, to read now, and, in the Administration, the way to « Ce que Claude relève »
 * (what Claude notes on each kind of link) (the phone's `linkReadingExtra`).
 */
import type { ServerSettings } from '@unlease/core/sync/settings';
import { CLAUDE_COST_PER_LINK, CLAUDE_COST_PER_WEB_SEARCH } from '@unlease/core/sync/settings';
import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';

import { readSkippedLinks } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { selectOnboarded, useSettingsStore, type ServerConfig } from '@shared/app/store/settings';
import type { Usage } from '@shared/app/sync/transport';
import { showSnack } from '@shared/app/store/ui';
import { Icon } from '@shared/ui/components/Icon';
import styles from '@shared/ui/features/settings/settings.module.css';
import { formatUsd as usd } from '@shared/ui/money';
import { navigate } from '@shared/ui/router';
import { paths } from '../../routes';

export function ReadingExtras({ settings, usage }: { server: ServerConfig; settings: ServerSettings; usage: Usage | null }) {
  const skipped = useLibraryStore(s => Object.values(s.links).filter(link => link.status === 'skipped' && link.deletedAt === null).length);
  const { model, enabled } = settings.analysis;
  // The first run's form stays where it is: the facts wait for the Administration, and for a key.
  const onboarded = useSettingsStore(selectOnboarded);
  return (
    <>
      <div className={styles.block}>
        {/* The links read this month, as on the phone (the spend is every app's, over it). */}
        <p className="t-meta">
          {[
            t('About {cost} per link read, {search} per web search by a module.', { cost: usd(CLAUDE_COST_PER_LINK[model]), search: usd(CLAUDE_COST_PER_WEB_SEARCH[model]) }),
            usage ? t('This month: {links}.', { links: plural(usage.month.analyses, 'link read', 'links read') }) : '',
          ]
            .filter(Boolean)
            .join(' ')}
        </p>
      </div>
      {enabled && skipped > 0 ? (
        <button type="button" className={styles.row} onClick={() => showSnack(t('{links} for reading', { links: plural(readSkippedLinks(), 'link sent', 'links sent') }), undefined, { tone: 'success' })}>
          <Icon name="refresh" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{skipped === 1 ? t('Read the unread link') : t('Read the {links}', { links: plural(skipped, 'unread link', 'unread links') })}</span>
            <span className="t-meta">{skipped === 1 ? t('Kept as it was while reading was off · about {cost}', { cost: usd(skipped * CLAUDE_COST_PER_LINK[model]) }) : t('Kept as they were while reading was off · about {cost}', { cost: usd(skipped * CLAUDE_COST_PER_LINK[model]) })}</span>
          </span>
        </button>
      ) : null}
      {onboarded && enabled ? (
        <button type="button" className={styles.row} onClick={() => navigate(paths.templates)}>
          <Icon name="list" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Facts Claude notes')}</span>
            <span className="t-meta">{t('What Claude notes on each link it reads')}</span>
          </span>
          <Icon name="chevronRight" size={20} />
        </button>
      ) : null}
    </>
  );
}
