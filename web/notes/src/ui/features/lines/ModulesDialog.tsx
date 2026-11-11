/**
 * "Modules": which link modules a collection shows (`notes/models/modules`), grouped by what they are
 * for, each switched on or off at once. A row says what the module does, which links it shows on,
 * what it costs, and why it would not show here. The phone's `ModulesSheet`.
 */
import { useId } from 'react';

import { t } from '@unlease/core/i18n';
import { shownTitle } from '@unlease/notes/models/entities';
import { MODULE_DESCRIPTIONS, MODULE_FITS, MODULE_GROUPS, MODULE_ICONS, MODULE_NAMES } from '@unlease/notes/models/modules';
import { lineModules, moduleCost, moduleMissing, moduleOffered, withModule } from '@unlease/notes/services/modules';

import { setLineModules } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { selectServerSettings, useServerFeature, useServerSettingsStore } from '@shared/app/store/serverSettings';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { useSeerr } from '../../../app/store/prefs';
import { useServerRuns } from '@shared/app/apps';
import { SwitchMark } from '@shared/ui/components/Checkbox';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { Icon } from '@shared/ui/components/Icon';
import { Layer } from '@shared/ui/components/Layer';
import { formatUsd } from '@shared/ui/money';
import styles from './lines.module.css';

export function ModulesDialog({ id, open, onDismiss }: { id: string; open: boolean; onDismiss: () => void }) {
  const titleId = useId();
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <ModulesBody id={id} titleId={titleId} onDismiss={onDismiss} />
    </Layer>
  );
}

function ModulesBody({ id, titleId, onDismiss }: { id: string; titleId: string; onDismiss: () => void }) {
  const line = useLibraryStore(s => s.notes[id]);
  const server = useSettingsStore(selectServer);
  // Claude's modules once the server has said it has a key (Seerr's once it gave Seerr's address).
  const reading = useServerFeature('claude');
  const seerr = useSeerr();
  const model = useServerSettingsStore(selectServerSettings)?.analysis.model ?? 'claude-opus-5-5';
  const pages = useServerRuns('pages');
  const agenda = useServerRuns('calendar');
  if (!line) return null;
  const on = lineModules(line);
  const can = { server: server !== null, reading, seerr, pages, agenda };
  // What leans on a service the Administration has not set up (Claude, Seerr) is not offered (one picked stays picked); a group left with none goes too.
  const groups = MODULE_GROUPS.map(group => ({ ...group, modules: group.modules.filter(module => moduleOffered(module, can)) })).filter(group => group.modules.length > 0);

  return (
    <DialogFrame kind="list" title={t('Modules')} titleId={titleId} onClose={onDismiss} className={styles.modulesFrame}>
      <p className={`${styles.choiceLead} t-body`}>{t('Les modules choisis apparaissent sur les liens de {collection} qui s’y prêtent.', { collection: shownTitle(line) })}</p>
      {groups.map(group => (
        <section key={group.title} className={styles.moduleGroup} aria-label={t(group.title)}>
          <h3 className={`${styles.moduleGroupTitle} t-section`}>{t(group.title)}</h3>
          {group.modules.map(module => {
            const checked = on.includes(module);
            const missing = moduleMissing(module, can);
            return (
              <button key={module} type="button" role="switch" aria-checked={checked} className={styles.moduleRow} onClick={() => setLineModules(line.id, withModule(line, module, !checked))}>
                <Icon name={MODULE_ICONS[module]} size={24} />
                <span className={styles.moduleText}>
                  <span className="t-body-strong">{MODULE_NAMES[module]}</span>
                  <span className="t-card-body">{MODULE_DESCRIPTIONS[module]}</span>
                  <span className="t-meta">{`${MODULE_FITS[module]} · ${moduleCost(module, model, formatUsd)}`}</span>
                  {/* Switched on, it would still not show here: what it waits for, in ink. */}
                  {missing ? (
                    <span className={`${styles.moduleMissing} t-meta-strong`}>
                      <Icon name="info" size={14} />
                      {missing}
                    </span>
                  ) : null}
                </span>
                <SwitchMark checked={checked} />
              </button>
            );
          })}
        </section>
      ))}
    </DialogFrame>
  );
}
