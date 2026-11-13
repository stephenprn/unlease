import { t } from '@unlease/core/i18n';

import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { navigate } from '../router';

/** A place that does not exist (any more): say so, and offer the way home. */
export function NotFound({ what = t('This page doesn’t exist.') }: { what?: string }) {
  return (
    <EmptyState scene="trash" title={t('Not found')} text={what} as="h1">
      <Button kind="tonal" icon="back" onClick={() => navigate('/', { replace: true })}>
        {t('Back home')}
      </Button>
    </EmptyState>
  );
}
