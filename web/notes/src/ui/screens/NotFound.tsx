import { t } from '@unlease/core/i18n';

import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { navigate } from '../router';

/** A place that does not exist (any more): say so, and offer the way home. */
export function NotFound({ what = t('Cette page n’existe pas.') }: { what?: string }) {
  return (
    <EmptyState scene="trash" title={t('Introuvable')} text={what} as="h1">
      <Button kind="tonal" icon="back" onClick={() => navigate('/', { replace: true })}>
        {t('Retour au tableau')}
      </Button>
    </EmptyState>
  );
}
