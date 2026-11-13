/**
 * Administration: what the server does for every app and every device, in each app
 * (`/notes/admin`, `/pages/admin`), opened from the launcher at the header's end.
 *
 * Its home lists its sections with each one's state in a line: first those every app shares (the
 * apps the server runs, the server itself, Claude, the backups to S3, the files on Seafile, Immich), then
 * the app's own under its name (Carnet's Seerr, Pages' questions). Each section is a page of its own
 * (`/notes/admin/<id>`): its « how it works » first, then its sheet of paper. A section that needs a
 * server says so until one is connected.
 */
import { useEffect, useRef, type CSSProperties } from 'react';

import { t } from '@unlease/core/i18n';
import { serverFacts, type StatusTone } from '@unlease/core/services/admin';

import { useMinute } from '../../app/hooks/useMinute';
import { selectServerSettings, useServerSettingsStore } from '../../app/store/serverSettings';
import { selectServer, selectServerApps, useSettingsStore } from '../../app/store/settings';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { OutlinedBox } from '../components/Outline';
import { adminGroups, adminPlace, type AdminFacts, type AdminPlace } from '../features/admin/places';
import admin from '../features/admin/admin.module.css';
import { AppsSection } from '../features/settings/AppsSection';
import { BackupSection } from '../features/settings/BackupSection';
import { ClaudeSection } from '../features/settings/ClaudeSection';
import { DriveSection } from '../features/settings/DriveSection';
import { ImmichSection } from '../features/settings/ImmichSection';
import { Section, StatusRow, toneColor } from '../features/settings/Section';
import { ServerSection } from '../features/settings/ServerSection';
import styles from '../features/settings/settings.module.css';
import { useAdmin, type Admin } from '../features/settings/useAdmin';
import { PageHead } from '../navigation/PageHead';
import { adminPath, Link, navigate, type Route } from '../router';

/** The server's page, its address field ready to type. */
const ADDRESS = 'address';
const connect = (): void => navigate(`${adminPath('server')}#${ADDRESS}`);

export function AdminScreen({ route }: { route: Route }) {
  const section = route.name === 'admin' ? route.section : null;
  const on = useSettingsStore(selectServerApps);
  const place = section ? adminPlace(section, on) : null;
  // A section no app the server runs has (an app turned off since, an address mistyped): the home.
  const lost = section !== null && place === null;
  useEffect(() => {
    if (lost) navigate(adminPath(), { replace: true });
  }, [lost]);
  // An older link to a section of the one long page (`/admin#reading`): its page now.
  useEffect(() => {
    const hash = location.hash.slice(1);
    if (section === null && hash && adminPlace(hash, on)) navigate(adminPath(hash), { replace: true });
  }, [section, on]);
  return place ? <SectionPage key={place.id} place={place} /> : <AdminHome />;
}

/** The facts every line is read from, asked again while something runs on the server. */
function useAdminFacts(): { readonly facts: AdminFacts; readonly admin: Admin } {
  const server = useSettingsStore(selectServer);
  const settings = useServerSettingsStore(selectServerSettings);
  const state = useAdmin(server);
  const now = useMinute();
  return { facts: { url: server?.url ?? null, settings: server ? settings : null, status: state.status, now, unavailable: state.unavailable }, admin: state };
}

function AdminHome() {
  const { facts } = useAdminFacts();
  const on = useSettingsStore(selectServerApps);
  const groups = adminGroups(on);
  // The shared sections alone (an app with none of its own): the lead above already says they are for every app.
  const titled = groups.length > 1;
  return (
    <div className={styles.page}>
      <PageHead title={t('Administration')} />
      <p className={`${admin.lead} t-body`}>{t('What your server does for all your apps and all your devices.')}</p>
      {groups.map(group => (
        <Section key={group.app ?? 'shared'} title={titled ? group.title : undefined} label={group.title}>
          <ul className={admin.rows}>
            {group.places.map(place => (
              <li key={place.id}>
                <PlaceRow place={place} facts={facts} />
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}

/** A section on the home: its mark, its title, its state in a line; a link to its page. */
function PlaceRow({ place, facts }: { place: AdminPlace; facts: AdminFacts }) {
  const waiting = place.needsServer && !facts.url;
  const line = waiting ? null : place.line(facts);
  const tone: StatusTone = line?.tone ?? 'off';
  return (
    <Link to={adminPath(place.id)} className={admin.row}>
      <span className={admin.glyph} aria-hidden="true">
        <Icon name={place.glyph} size={22} />
      </span>
      <span className={admin.rowText}>
        <span className="t-body-strong">{place.title}</span>
        <span className={`${admin.state} t-meta`}>
          <span className={admin.dot} style={{ '--dot': toneColor(tone) } as CSSProperties} aria-hidden="true" />
          <span className={admin.stateText}>{waiting ? t('Connect a server first') : line ? [line.title, line.meta].filter(Boolean).join(' · ') : facts.unavailable ? t('The server isn’t answering for now.') : t('Reading the server’s settings…')}</span>
        </span>
      </span>
      <Icon name="chevronRight" size={20} />
    </Link>
  );
}

function SectionPage({ place }: { place: AdminPlace }) {
  const { facts, admin: state } = useAdminFacts();
  const server = useSettingsStore(selectServer);
  const settings = facts.settings;
  return (
    <div className={styles.page}>
      <PageHead title={place.title} />
      {place.info ? <p className={`${admin.lead} t-body`}>{t(place.info)}</p> : null}
      <section className={styles.section} aria-label={place.title} id={place.id}>
        <OutlinedBox kind="panel" lift="card" className={styles.card}>
          {place.needsServer && !server ? (
            <NeedsServer />
          ) : place.needsServer && !settings ? (
            <Unavailable admin={state} />
          ) : (
            <SectionBody place={place} admin={state} />
          )}
        </OutlinedBox>
      </section>
    </div>
  );
}

function SectionBody({ place, admin: state }: { place: AdminPlace; admin: Admin }) {
  const server = useSettingsStore(selectServer);
  const settings = useServerSettingsStore(selectServerSettings);
  const address = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  // Sent here to connect (`/admin/server#address`, from Claude's page or one that needs a server): the address, ready to type.
  useEffect(() => {
    if (place.id === 'server' && location.hash === `#${ADDRESS}`) address.current?.focus({ preventScroll: true });
  }, [place.id]);
  // Keyed by address: another server has its own settings.
  const key = server?.url ?? 'none';
  if (place.own) {
    const Body = place.own.Body;
    return server && settings ? <Body key={key} server={server} settings={settings} /> : null;
  }
  switch (place.id) {
    case 'apps':
      return <AppsSection key={key} server={server} settings={settings} />;
    case 'server':
      return <ServerSection address={address} facts={server && state.status ? serverFacts(state.status.server) : null} />;
    case 'reading':
      return <ClaudeSection key={key} server={server} onConnect={connect} />;
    case 'backup':
      return server && settings ? <BackupSection key={key} server={server} backup={settings.backup} admin={state} /> : null;
    case 'drive':
      return server && settings ? <DriveSection key={key} server={server} drive={settings.drive} admin={state} /> : null;
    case 'immich':
      return server && settings ? <ImmichSection key={key} server={server} immich={settings.immich} /> : null;
    default:
      return null;
  }
}

/** A section that needs a server, on a browser without one. */
/** A section's settings not read yet, or the server not answering: then a way to ask again. */
function Unavailable({ admin: state }: { admin: Admin }) {
  if (!state.unavailable) return <p className={`${styles.help} t-meta`}>{t('Reading the server’s settings…')}</p>;
  return (
    <StatusRow tone="off" title={t('Server settings unavailable')} meta={t('The server isn’t answering for now.')}>
      <Button kind="text" small onClick={() => void state.refresh()}>
        {t('Try again')}
      </Button>
    </StatusRow>
  );
}

function NeedsServer() {
  return (
    <div className={styles.block}>
      <p className="t-body">{t('Connect a server first: this setting is the server’s, for all your devices.')}</p>
      <div>
        <Button kind="tonal" icon="server" onClick={connect}>
          {t('Connect a server')}
        </Button>
      </div>
    </div>
  );
}
