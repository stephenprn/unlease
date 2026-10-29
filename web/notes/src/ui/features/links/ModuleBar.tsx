/**
 * A link's modules (`notes/models/modules`), as its collection picked them: a row of small buttons
 * under its title, each only where it fits the link and works here. Most open a dialog, "En cuisine"
 * its cook mode; "Y aller", "SensCritique" and "Seerr" open those sites, "Garder une copie" makes a
 * page (then "Voir la copie" opens it), and "Pour N personnes" is a stepper of its own. The phone's
 * `ModuleBar`.
 */
import { useEffect, useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { MODULE_ICONS, MODULE_NAMES, type LinkModule } from '@unlease/notes/models/modules';
import { copyOf, directionsUrl, linkModules, sensCritiqueUrl } from '@unlease/notes/services/modules';

import { keepCopy, runningCopy } from '../../../app/modules';
import { useLibraryStore } from '../../../app/store/library';
import { selectCanRead, selectSeerr, selectServer, useSettingsStore } from '../../../app/store/settings';
import { showError, showSnack } from '../../../app/store/ui';
import { Button } from '../../components/Button';
import { navigate, paths } from '../../router';
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
  const blocks = useLibraryStore(s => s.blocks);
  const blocksByParent = useLibraryStore(s => s.blocksByParent);
  const server = useSettingsStore(selectServer);
  const reading = useSettingsStore(selectCanRead);
  const seerr = useSettingsStore(selectSeerr);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [copying, setCopying] = useState(() => runningCopy(id) !== null);
  const copy = useMemo(() => copyOf(id, blocks, blocksByParent), [id, blocks, blocksByParent]);
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
  const modules = linkModules(link, line, { server: server !== null, reading, seerr });
  if (modules.length === 0) return null;
  const close = (): void => setOpened(null);

  const keep = (): void => {
    setCopying(true);
    keepCopy(id).then(
      page => showSnack(t('Copie gardée dans Pages'), { label: t('Ouvrir'), run: () => navigate(paths.page(page)) }, { tone: 'success' }),
      (error: unknown) => showError(error instanceof Error ? t(error.message) : t('erreur inconnue')),
    ).finally(() => setCopying(false));
  };

  const button = (module: LinkModule) => {
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
    if (module === 'archive') {
      return copy ? (
        <Button key={module} kind="tonal" small icon="page" onClick={() => navigate(paths.page(copy))}>
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
