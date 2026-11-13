/**
 * Carnet's part of the Claude section (`ClaudeSection`'s `extra`, in the Administration and the
 * setup): what a link read costs, the links read this month, the links kept unread while Claude
 * had no key, read now in one press, and the way to « Ce que Claude relève » (what Claude reads on each
 * kind of link).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { CLAUDE_COST_PER_LINK, CLAUDE_COST_PER_WEB_SEARCH } from '@unlease/core/sync/settings';
import type { ClaudeExtra } from '@shared/ui/features/admin/ClaudeSection';
import { formatUsd as usd } from '@shared/ui/features/settings/money';
import { readSkippedLinks } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Icon, ListRow } from '../../components';
import { navigate } from '../../navigation/navigationRef';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

export const linkReadingExtra: ClaudeExtra = ({ settings, usage }) => <LinkReading model={settings.analysis.model} enabled={settings.analysis.enabled} links={usage?.month.analyses ?? null} />;

function LinkReading({ model, enabled, links }: { model: keyof typeof CLAUDE_COST_PER_LINK; enabled: boolean; links: number | null }) {
  const theme = useTheme();
  const skipped = useLibraryStore(s => Object.values(s.links).filter(link => link.status === 'skipped' && link.deletedAt === null).length);
  return (
    <View>
      <AppText variant="meta" style={styles.cost}>
        {t('About {cost} per link read, {search} per web search by a module.', { cost: usd(CLAUDE_COST_PER_LINK[model]), search: usd(CLAUDE_COST_PER_WEB_SEARCH[model]) })}
        {links !== null ? ` ${t('This month: {links}.', { links: plural(links, 'link read', 'links read') })}` : ''}
      </AppText>
      {enabled && skipped > 0 ? (
        <ListRow
          icon="refresh"
          title={skipped === 1 ? t('Read the unread link') : t('Read the {links}', { links: plural(skipped, 'unread link', 'unread links') })}
          supporting={skipped === 1 ? t('Kept as it was while reading was off · about {cost}', { cost: usd(skipped * CLAUDE_COST_PER_LINK[model]) }) : t('Kept as they were while reading was off · about {cost}', { cost: usd(skipped * CLAUDE_COST_PER_LINK[model]) })}
          onPress={() => showSnack(t('{links} for reading', { links: plural(readSkippedLinks(), 'link sent', 'links sent') }), undefined, { tone: 'success' })}
        />
      ) : null}
      {/* Without a key, the facts lead nowhere: they wait for one. */}
      {enabled ? (
        <ListRow
          icon="list"
          title={t('Facts Claude notes')}
          supporting={t('What Claude notes on each link it reads')}
          trailing={<Icon name="chevronRight" size={20} color={theme.color.inkMuted} />}
          onPress={() => navigate('Templates')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cost: { paddingHorizontal: 16, paddingBottom: 12 },
});
