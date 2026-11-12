/**
 * « Importer », Réglages' page for the app's import (`/<app>/settings/import`): the app's own wizard
 * (`AppModule.importer`, `core/services/importFlow`), under the page's title. The first run offers the
 * same wizard as one of its steps.
 */
import { t } from '@unlease/core/i18n';

import { theApp } from '../../modules';
import { Section } from '../features/settings/Section';
import styles from '../features/settings/settings.module.css';
import { EmptyLine } from '../components/EmptyLine';
import { PageHead } from '../navigation/PageHead';

export function ImportScreen() {
  const Wizard = theApp().importer?.Wizard;
  return (
    <div className={styles.page}>
      <PageHead title={t('Importer')} />
      {Wizard ? (
        <Wizard />
      ) : (
        <Section label={t('Importer')}>
          <div className={styles.block}>
            <EmptyLine size="body" text={t('Cette application n’importe rien pour l’instant.')} />
          </div>
        </Section>
      )}
    </div>
  );
}
