/**
 * Administration: the server (its address, its token, what it holds), link reading by Claude, and,
 * once a server is connected, its backups to S3 and the Seafile folder that keeps the files. Each
 * section a sheet of paper pinned to the wall, as in the settings.
 */
import { useEffect, useRef } from 'react';

import { t } from '@unlease/core/i18n';
import { serverFacts } from '@unlease/core/services/admin';
import { PAGES_ASK_INFO } from '@unlease/notes/services/pagesAsk';

import { selectServerSettings, useServerSettingsStore } from '../../app/store/serverSettings';
import { selectServer, useSettingsStore } from '../../app/store/settings';
import { BACKUP_INFO, BackupSection } from '../features/settings/BackupSection';
import { DRIVE_INFO, DriveSection } from '../features/settings/DriveSection';
import { PagesAskSection } from '../features/settings/PagesAskSection';
import { ReadingSection } from '../features/settings/ReadingSection';
import { SEERR_INFO, SeerrSection } from '../features/settings/SeerrSection';
import { Section } from '../features/settings/Section';
import { SERVER_INFO, ServerSection } from '../features/settings/ServerSection';
import styles from '../features/settings/settings.module.css';
import { useAdmin } from '../features/settings/useAdmin';
import { PageHead } from '../navigation/PageHead';

export function AdminScreen() {
  const server = useSettingsStore(selectServer);
  const settings = useServerSettingsStore(selectServerSettings);
  const admin = useAdmin(server);
  const address = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // "Administration" from a link nothing could read, or from the sync's dot, lands on the section that fixes it
  // (the backup's and the drive's once the server's settings have come).
  const scrolled = useRef(false);
  const ready = settings !== null;
  useEffect(() => {
    if (scrolled.current || !location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    if (!target) return;
    scrolled.current = true;
    target.scrollIntoView?.({ block: 'start' });
  }, [ready]);

  const focusServer = (): void => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    document.getElementById('server')?.scrollIntoView?.({ block: 'start', behavior: still ? 'auto' : 'smooth' });
    address.current?.focus({ preventScroll: true });
  };

  return (
    <div className={styles.page}>
      <PageHead title={t('Administration')} />

      <Section title={t('Serveur')} id="server" info={SERVER_INFO}>
        <ServerSection address={address} facts={server && admin.status ? serverFacts(admin.status.server) : null} />
      </Section>

      <Section title={t('Lecture des liens par Claude')} id="reading">
        {/* Keyed by address: another server has its own key, model and budget. */}
        <ReadingSection key={server?.url ?? 'none'} server={server} onConnect={focusServer} />
      </Section>

      {server && settings ? (
        <>
          <Section title={t('Questions sur les pages')} id="pages-ask" info={PAGES_ASK_INFO}>
            <PagesAskSection key={server.url} server={server} settings={settings} />
          </Section>
          <Section title={t('Sauvegarde sur S3')} id="backup" info={BACKUP_INFO}>
            <BackupSection key={server.url} server={server} backup={settings.backup} admin={admin} />
          </Section>
          <Section title={t('Fichiers sur Seafile')} id="drive" info={DRIVE_INFO}>
            <DriveSection key={server.url} server={server} drive={settings.drive} admin={admin} />
          </Section>
          <Section title="Seerr" id="seerr" info={SEERR_INFO}>
            <SeerrSection key={server.url} server={server} seerr={settings.seerr} />
          </Section>
        </>
      ) : null}
    </div>
  );
}
