/**
 * A link's modules (`notes/models/modules`), as its collection picked them: a row of small buttons
 * under its title, each only where it fits the link and works here. Most open a dialog, "En cuisine"
 * its cook mode; "Y aller", "SensCritique" and "Seerr" open those sites, "Garder une copie" asks
 * Pages for a page (then "Voir la copie" opens the link's `copy`, when the server runs Pages),
 * "Ajouter à l’agenda" has Claude read its date and opens Agenda's new event with it, and
 * "Pour N personnes" is a stepper of its own. The phone's
 * `ModuleBar`.
 */
import { useEffect, useState } from 'react';

import { APPS } from '@unlease/core/apps';

import { t } from '@unlease/core/i18n';
import { MODULE_ICONS, MODULE_NAMES, type LinkModule } from '@unlease/notes/models/modules';
import { directionsUrl, linkModules, sensCritiqueUrl } from '@unlease/notes/services/modules';

import { agendaDraft, keepCopy, runningCopy } from '../../../app/modules';
import { useLibraryStore } from '../../../app/store/library';
import { useServerRuns } from '@shared/app/apps';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { pathOfRef } from '@shared/modules';
import { useCanRead, useSeerr } from '../../../app/store/prefs';
import { showError, showSnack } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { navigate } from '@shared/ui/router';
import { AskDialog } from './AskDialog';
import { CookMode } from './CookMode';
import { CouponsDialog } from './CouponsDialog';
import { CoverageDialog } from './CoverageDialog';
import { GroceriesDialog } from './GroceriesDialog';
import { OffersDialog } from './OffersDialog';
import { RatingsDialog } from './RatingsDialog';
import { RecapDialog } from './RecapDialog';
import { SeerrButton } from './SeerrButton';
import { ServingsStepper } from './ServingsStepper';
import styles from './links.module.css';

/** The modules that open a dialog (or the cook mode). */
type Opened = Extract<LinkModule, 'coupons' | 'cheaper' | 'secondhand' | 'groceries' | 'cooking' | 'ratings' | 'recap' | 'coverage' | 'ask'>;

export function ModuleBar({ id }: { id: string }) {
  const link = useLibraryStore(s => s.links[id]);
  const line = useLibraryStore(s => (link ? s.notes[link.noteId] : undefined));
  const server = useSettingsStore(selectServer);
  const reading = useCanRead();
  const seerr = useSeerr();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [copying, setCopying] = useState(() => runningCopy(id) !== null);
  const pages = useServerRuns('pages');
  const agenda = useServerRuns('calendar');
  const [dating, setDating] = useState(false);
  // The page « Garder une copie » made, in Pages' web app, once its change has come.
  const copy = link?.copy ? pathOfRef('page', link.copy) : null;
  // Opened again while its copy is being made: busy until that copy is done (a press joins it).
  useEffect(() => {
    const running = runningCopy(id);
    if (!running) return;
    let live = true;
    void running.catch(() => undefined).finally(() => live && setCopying(false));
    return () => {
      live = false;
    };
  }, [id]);
  if (!link) return null;
  // « Suivi des prix » is no button: it speaks under the price (`PriceWatch`).
  const modules = linkModules(link, line, { server: server !== null, reading, seerr, pages, agenda }).filter(module => module !== 'pricewatch');
  if (modules.length === 0) return null;
  const close = (): void => setOpened(null);

  const keep = (): void => {
    setCopying(true);
    keepCopy(id).then(
      page => {
        const path = pathOfRef('page', page);
        showSnack(t('Copie gardée dans {app}', { app: APPS.pages.name }), path ? { label: t('Ouvrir'), run: () => navigate(path) } : undefined, { tone: 'success' });
      },
      (error: unknown) => showError(error instanceof Error ? t(error.message) : t('erreur inconnue')),
    ).finally(() => setCopying(false));
  };

  const toAgenda = (): void => {
    setDating(true);
    agendaDraft(id).then(
      path => navigate(path),
      (error: unknown) => showError(error instanceof Error ? t(error.message) : t('erreur inconnue')),
    ).finally(() => setDating(false));
  };

  const button = (module: LinkModule) => {
    if (module === 'pricewatch') return null;
    const label = MODULE_NAMES[module];
    const icon = MODULE_ICONS[module];
    if (module === 'directions') {
      const url = directionsUrl(link);
      return url ? (
        <Button key={module} kind="tonal" small icon={icon} href={url}>
          {label}
        </Button>
      ) : null;
    }
    if (module === 'servings') return <ServingsStepper key={module} link={link} inBar />;
    if (module === 'seerr') return <SeerrButton key={module} link={link} />;
    if (module === 'senscritique') {
      const url = sensCritiqueUrl(link);
      return url ? (
        <Button key={module} kind="tonal" small icon={icon} href={url}>
          {label}
        </Button>
      ) : null;
    }
    if (module === 'agenda') {
      return (
        <Button key={module} kind="tonal" small icon={icon} busy={dating} onClick={toAgenda}>
          {label}
        </Button>
      );
    }
    if (module === 'archive') {
      return copy ? (
        <Button key={module} kind="tonal" small icon="page" onClick={() => navigate(copy)}>
          {t('Voir la copie')}
        </Button>
      ) : (
        <Button key={module} kind="tonal" small icon={icon} busy={copying} onClick={keep}>
          {label}
        </Button>
      );
    }
    return (
      <Button key={module} kind="tonal" small icon={icon} onClick={() => setOpened(module)}>
        {label}
      </Button>
    );
  };

  return (
    <>
      <div className={styles.moduleBar}>{modules.map(button)}</div>
      {modules.includes('coupons') ? <CouponsDialog id={id} open={opened === 'coupons'} onDismiss={close} /> : null}
      {modules.includes('cheaper') ? <OffersDialog id={id} market="new" open={opened === 'cheaper'} onDismiss={close} /> : null}
      {modules.includes('secondhand') ? <OffersDialog id={id} market="used" open={opened === 'secondhand'} onDismiss={close} /> : null}
      {modules.includes('groceries') ? <GroceriesDialog id={id} open={opened === 'groceries'} onDismiss={close} /> : null}
      {modules.includes('cooking') ? <CookMode id={id} open={opened === 'cooking'} onDismiss={close} /> : null}
      {modules.includes('ratings') ? <RatingsDialog id={id} open={opened === 'ratings'} onDismiss={close} /> : null}
      {modules.includes('recap') ? <RecapDialog id={id} open={opened === 'recap'} onDismiss={close} /> : null}
      {modules.includes('coverage') ? <CoverageDialog id={id} open={opened === 'coverage'} onDismiss={close} /> : null}
      {modules.includes('ask') ? <AskDialog id={id} open={opened === 'ask'} onDismiss={close} /> : null}
    </>
  );
}
