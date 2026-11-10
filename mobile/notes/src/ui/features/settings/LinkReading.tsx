/**
 * Carnet's part of the Claude section (`ClaudeSection`'s `extra`, in the Administration and the
 * setup): what a link read costs, the links read this month, the links kept unread while Claude
 * had no key, read now in one press, and the way to « Modèles de fiche » (what Claude reads on each
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
        {t('Environ {cost} par lien lu, {search} par recherche d’un module sur le web.', { cost: usd(CLAUDE_COST_PER_LINK[model]), search: usd(CLAUDE_COST_PER_WEB_SEARCH[model]) })}
        {links !== null ? ` ${t('Ce mois-ci : {links}.', { links: plural(links, 'lien lu', 'liens lus') })}` : ''}
      </AppText>
      {enabled && skipped > 0 ? (
        <ListRow
          icon="refresh"
          title={skipped === 1 ? t('Lire le lien non lu') : t('Lire les {links}', { links: plural(skipped, 'lien non lu', 'liens non lus') })}
          supporting={skipped === 1 ? t('Gardé tel quel quand la lecture était désactivée · environ {cost}', { cost: usd(skipped * CLAUDE_COST_PER_LINK[model]) }) : t('Gardés tels quels quand la lecture était désactivée · environ {cost}', { cost: usd(skipped * CLAUDE_COST_PER_LINK[model]) })}
          onPress={() => showSnack(t('{links} en lecture', { links: plural(readSkippedLinks(), 'lien envoyé', 'liens envoyés') }), undefined, { tone: 'success' })}
        />
      ) : null}
      <ListRow
        icon="rows"
        title={t('Modèles de fiche')}
        supporting={t('Ce que Claude relève sur chaque type de lien')}
        trailing={<Icon name="chevronRight" size={20} color={theme.color.inkMuted} />}
        onPress={() => navigate('Templates')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cost: { paddingHorizontal: 16, paddingBottom: 12 },
});
