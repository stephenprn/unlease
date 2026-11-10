/**
 * Agenda's own sections of the Administration (and of the setup's « Votre serveur »): the public
 * holidays the server fetches from Nager.Date (a country, and a region when it has days of its own),
 * the calendar published at a secret address (for Google Agenda, Apple or Thunderbird to subscribe
 * to), and questions about the calendar to Claude.
 */
import { useEffect, useState } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { COUNTRY_NAMES, countryName } from '@unlease/core/services/setup';
import { ASK_INFO, askLine, HOLIDAYS_INFO, holidaysLine, PUBLISH_INFO, publishLine } from '@unlease/calendar/services/admin';
import type { CalendarPatch, ServerSettings } from '@unlease/core/sync/settings';
import type { HolidayCountry } from '@unlease/calendar/sync/routes';

import type { AdminSection } from '@shared/modules';
import { setServerSettings } from '@shared/app/store/serverSettings';
import type { ServerConfig } from '@shared/app/store/settings';
import { showError, showSnack } from '@shared/app/store/ui';
import { saveServerSettings } from '@shared/app/sync/transport';
import { Button } from '@shared/ui/components/Button';
import { SelectField } from '@shared/ui/components/SelectField';
import { StatusRow } from '@shared/ui/features/settings/Section';
import { SwitchMark } from '@shared/ui/components/Checkbox';
import { Confirm } from '@shared/ui/components/Dialog';
import { Icon } from '@shared/ui/components/Icon';
import settingsStyles from '@shared/ui/features/settings/settings.module.css';
import { fetchCountries, fetchRegions } from './app/api';
import styles from './ui/calendar.module.css';

async function save(server: ServerConfig, patch: CalendarPatch, done: string): Promise<boolean> {
  try {
    setServerSettings(await saveServerSettings(server, { calendar: patch }));
    showSnack(done, undefined, { tone: 'success' });
    return true;
  } catch (failure) {
    showError(t(failure instanceof Error ? failure.message : tx('Réglage refusé')));
    return false;
  }
}

// ── the holidays ───────────────────────────────────────────────────────────

/** The browser's country (`fr-FR` -> `FR`), proposed first. */
function browserCountry(): string | null {
  const tag = typeof navigator === 'undefined' ? '' : navigator.language;
  const region = /[-_]([A-Za-z]{2})$/.exec(tag)?.[1];
  return region ? region.toUpperCase() : null;
}

/** A select's value for « Aucun ». */
const NONE = 'none';

function HolidaysSection({ server, settings }: { server: ServerConfig; settings: ServerSettings }) {
  const { country, region } = settings.calendar.holidays;
  const [countries, setCountries] = useState<HolidayCountry[] | null>(null);
  const [regionsOf, setRegionsOf] = useState<{ readonly country: string; readonly regions: readonly string[] } | null>(null);
  const [chosen, setChosen] = useState(country ?? browserCountry() ?? '');
  // The region goes with the country, and is sent with it by « Enregistrer » (one save for the form).
  const [chosenRegion, setChosenRegion] = useState<string | null>(region);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchCountries(server).then(
      list => alive && setCountries(list),
      () => alive && setCountries([]),
    );
    return () => {
      alive = false;
    };
  }, [server]);
  useEffect(() => {
    if (!chosen) return;
    let alive = true;
    void fetchRegions(server, chosen).then(
      list => alive && setRegionsOf({ country: chosen, regions: list }),
      () => alive && setRegionsOf({ country: chosen, regions: [] }),
    );
    return () => {
      alive = false;
    };
  }, [server, chosen]);
  const regions = regionsOf?.country === chosen ? regionsOf.regions : [];
  const pickedRegion = chosenRegion && chosenRegion.startsWith(`${chosen}-`) ? chosenRegion : null;
  // The countries this build names first, then the others as Nager.Date names them.
  const known = Object.keys(COUNTRY_NAMES);
  const options = [
    ...known.map(code => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name)),
    ...(countries ?? []).filter(each => !known.includes(each.code)).sort((a, b) => a.name.localeCompare(b.name)),
  ];
  const apply = async (next: string | null, nextRegion: string | null): Promise<void> => {
    setBusy(true);
    await save(server, { holidays: { country: next, region: nextRegion } }, next ? t('Jours fériés : {country}', { country: countryName(next) }) : t('Jours fériés retirés'));
    setBusy(false);
  };
  // What the server holds now, as the other sections say it: the field below may propose this browser's country.
  const line = holidaysLine(settings);
  return (
    <div className={settingsStyles.block}>
      <StatusRow tone={line.tone} title={line.title} meta={line.meta} />
      <SelectField
        label={t('Pays')}
        value={chosen || NONE}
        disabled={busy}
        onChange={code => {
          setChosen(code === NONE ? '' : code);
          setChosenRegion(null);
        }}
        options={[{ value: NONE, label: t('Aucun') }, ...options.map(each => ({ value: each.code, label: each.name }))]}
      />
      {chosen && regions.length > 0 ? (
        <SelectField
          label={t('Région')}
          value={pickedRegion ?? NONE}
          disabled={busy}
          onChange={each => setChosenRegion(each === NONE ? null : each)}
          options={[{ value: NONE, label: t('Les jours de tout le pays') }, ...regions.map(each => ({ value: each, label: each }))]}
          help={t('Certaines régions ont des jours fériés de plus : choisissez la vôtre pour les voir aussi.')}
        />
      ) : null}
      <div className={styles.formFoot} style={{ justifyContent: 'flex-start' }}>
        <Button icon="check" busy={busy} disabled={(chosen || null) === country && pickedRegion === region} onClick={() => void apply(chosen || null, chosen ? pickedRegion : null)}>
          {t('Enregistrer')}
        </Button>
      </div>
    </div>
  );
}

// ── the published calendar ─────────────────────────────────────────────────

function PublishSection({ server, settings }: { server: ServerConfig; settings: ServerSettings }) {
  const [busy, setBusy] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const path = settings.calendar.publishPath;
  const address = path ? `${server.url}${path}` : null;
  const run = async (patch: CalendarPatch, done: string): Promise<void> => {
    setBusy(true);
    await save(server, patch, done);
    setBusy(false);
  };
  return (
    <>
      <button type="button" role="switch" aria-checked={!!path} className={settingsStyles.row} disabled={busy} onClick={() => void run({ publish: !path }, path ? t('Agenda dépublié') : t('Agenda publié'))}>
        <Icon name="share" size={24} />
        <span className={settingsStyles.rowText}>
          <span className="t-body">{t('Publier mon agenda')}</span>
          <span className="t-meta">{path ? t('Vos événements, à l’adresse ci-dessous.') : t('Désactivé : rien n’est servi hors de l’application.')}</span>
        </span>
        <SwitchMark checked={!!path} />
      </button>
      {address ? (
        <div className={settingsStyles.block}>
          <p className="t-body" style={{ overflowWrap: 'anywhere' }}>
            <code>{address}</code>
          </p>
          <div className={styles.formFoot} style={{ justifyContent: 'flex-start' }}>
            <Button
              kind="tonal"
              icon="copy"
              onClick={() =>
                void navigator.clipboard?.writeText(address).then(
                  () => showSnack(t('Adresse copiée'), undefined, { tone: 'success' }),
                  () => showError(t('Copie impossible : sélectionnez l’adresse.')),
                )
              }
            >
              {t('Copier l’adresse')}
            </Button>
            <Button kind="text" icon="refresh" disabled={busy} onClick={() => setRenewing(true)}>
              {t('Nouvelle adresse')}
            </Button>
          </div>
          <p className="t-meta">{t('Dans Google Agenda : Autres agendas, +, « À partir de l’URL », puis collez l’adresse. Google la relit de lui-même, toutes les quelques heures.')}</p>
        </div>
      ) : null}
      <Confirm
        open={renewing}
        title={t('Nouvelle adresse ?')}
        message={t('L’adresse actuelle cesse de marcher : les agendas abonnés devront prendre la nouvelle.')}
        confirmLabel={t('Nouvelle adresse')}
        onCancel={() => setRenewing(false)}
        onConfirm={() => {
          setRenewing(false);
          void run({ publish: 'renew' }, t('Nouvelle adresse créée'));
        }}
      />
    </>
  );
}

// ── questions to Claude ────────────────────────────────────────────────────

function AskSection({ server, settings }: { server: ServerConfig; settings: ServerSettings }) {
  const [busy, setBusy] = useState(false);
  const keyed = settings.analysis.enabled;
  const on = settings.calendar.ask && keyed;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={settingsStyles.row}
      disabled={busy || !keyed}
      onClick={() => {
        setBusy(true);
        void save(server, { ask: !settings.calendar.ask }, settings.calendar.ask ? t('Questions sur l’agenda désactivées') : t('Questions sur l’agenda activées')).finally(() => setBusy(false));
      }}
    >
      <Icon name="sparkle" size={24} />
      <span className={settingsStyles.rowText}>
        <span className="t-body">{t('« Demander à Claude » sur l’agenda')}</span>
        <span className="t-meta">{!keyed ? t('Ajoutez d’abord une clé Claude, plus haut.') : on ? t('Claude répond d’après vos événements.') : t('Désactivé : rien de votre agenda n’est envoyé à Claude.')}</span>
      </span>
      <SwitchMark checked={on} />
    </button>
  );
}

export const CALENDAR_ADMIN_SECTIONS: readonly AdminSection[] = [
  { id: 'calendar-holidays', app: 'calendar', title: () => t('Jours fériés'), glyph: 'sun', line: holidaysLine, info: HOLIDAYS_INFO, task: 'holidays', Body: HolidaysSection },
  { id: 'calendar-publish', app: 'calendar', title: () => t('Publication'), glyph: 'share', line: publishLine, info: PUBLISH_INFO, Body: PublishSection },
  { id: 'calendar-ask', app: 'calendar', title: () => t('Questions sur l’agenda'), glyph: 'bubble', line: askLine, info: ASK_INFO, claude: true, Body: AskSection },
];

