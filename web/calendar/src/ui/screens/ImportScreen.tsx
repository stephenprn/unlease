/**
 * « Importer » (from Réglages > Données, as on the phone, or an `.ics` dropped anywhere): a calendar
 * file (Google Agenda's export from Takeout, an `.ics` from Apple or Outlook, an invitation) read here
 * and, once its count is seen, written as one's own events in one batch (what is here already, by its
 * UID, is left out). The import comes in (`download`); the export is Réglages' own row.
 */
import { useEffect, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { parseIcs } from '@unlease/calendar/services/ics';
import { planImport, type ImportPlan } from '@unlease/calendar/services/importing';

import { showSnack } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { navigate } from '@shared/ui/router';
import { applyImport } from '../../app/store/actions';
import { setImportFile, useCalendarUi } from '../../app/store/calendarUi';
import { useCalendarStore } from '../../app/store/library';
import styles from '../calendar.module.css';
import { Detail } from '../features/EventDetails';
import { paths } from '../routes';

interface Read {
  readonly name: string;
  readonly plan: ImportPlan;
}

/** A file read and planned against the events here. */
export async function readCalendarFile(file: Blob & { readonly name?: string }): Promise<Read> {
  const text = await file.text();
  const calendar = parseIcs(text);
  const plan = planImport(calendar, Object.values(useCalendarStore.getState().events), Date.now());
  return { name: calendar.name || file.name || '', plan };
}

export function ImportScreen() {
  const dropped = useCalendarUi(s => s.importFile);
  const input = useRef<HTMLInputElement>(null);
  const [read, setRead] = useState<Read | null>(null);
  const [failed, setFailed] = useState(false);

  const take = (file: File): void => {
    void readCalendarFile(file).then(
      found => {
        setFailed(false);
        setRead(found);
      },
      () => setFailed(true),
    );
  };

  useEffect(() => {
    if (!dropped) return;
    setImportFile(null);
    take(dropped);
  }, [dropped]);

  const write = (): void => {
    if (!read) return;
    const count = applyImport(read.plan);
    setRead(null);
    showSnack(t('{count} importés', { count: plural(count, 'événement') }), undefined, { tone: 'success' });
    navigate(paths.home);
  };

  const count = read?.plan.creates.filter(entry => !entry.fields.recurringId).length ?? 0;
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      <PageHead title={t('Importer')} />
      <OutlinedBox kind="panel" lift="card" className={`${styles.panel} paper`}>
        <Detail icon="download">
          <span className="t-body-strong">{t('Importer un fichier .ics')}</span>
          <span className="t-meta">{t('L’export de Google Agenda (Google Takeout, dossier Agenda), ou un fichier .ics d’Apple, d’Outlook, d’une invitation. Glissez-le ici, ou choisissez-le.')}</span>
          <span className={styles.detailButton}>
            <Button kind="tonal" icon="download" onClick={() => input.current?.click()}>
              {t('Choisir un fichier')}
            </Button>
          </span>
          <input
            ref={input}
            type="file"
            accept=".ics,text/calendar"
            hidden
            aria-label={t('Fichier .ics')}
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) take(file);
              event.target.value = '';
            }}
          />
        </Detail>
        {failed ? (
          <Detail icon="alert">
            <span className="t-body">{t('Ce fichier ne se lit pas comme un agenda.')}</span>
          </Detail>
        ) : null}
        {read ? (
          <Detail icon="calendar">
            <span className="t-body-strong">{read.name || t('Agenda sans nom')}</span>
            <span className="t-body">
              {count > 0 ? t('{count} à importer', { count: plural(count, 'événement') }) : t('Rien de nouveau à importer.')}
              {read.plan.skipped > 0 ? ` · ${t('{count} déjà là', { count: read.plan.skipped })}` : ''}
            </span>
            <span className={styles.formFoot} style={{ justifyContent: 'flex-start' }}>
              <Button icon="check" disabled={read.plan.creates.length === 0} onClick={write}>
                {t('Importer')}
              </Button>
              <Button kind="text" onClick={() => setRead(null)}>
                {t('Annuler')}
              </Button>
            </span>
          </Detail>
        ) : null}
      </OutlinedBox>
    </div>
  );
}
