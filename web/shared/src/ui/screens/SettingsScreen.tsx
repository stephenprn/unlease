/**
 * Réglages, this device's own: the way to the Administration (the server and what it does for
 * every app), appearance (the theme, the paper's grain), the colours and the ground (this app's look,
 * given to the others on « Appliquer aux autres »), the languages a
 * search by word understands, then each app's own (Carnet's reminders), the data (the app's rows,
 * Carnet's links cleaned; every app's bin, the keyboard shortcuts), and last what is done once (the
 * Keep import). An app's piece may sit inside « Apparence » (Carnet's board layout): its `place`.
 * Each section is a sheet of paper pinned to the wall.
 */
import { useEffect, useId, useState } from 'react';

import { APPS, SUITE_NAME } from '@unlease/core/apps';
import { APP_WORDS } from '@unlease/core/appWords';
import { LOCALE_NAMES, LOCALES, t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { SETTINGS_SECTIONS } from '@unlease/core/services/settingsSearch';

import { LANGUAGES, selectGrain, selectLanguages, selectLocale, selectThemePreference, setGrain, setInterfaceLocale, setLanguage, setTheme, useSettingsStore } from '../../app/store/settings';
import { setShortcutsOpen, showSnack } from '../../app/store/ui';
import { theApp } from '../../modules';
import { SwitchMark } from '../components/Checkbox';
import { Confirm } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { ColorsSection, GroundSection } from '../features/appearance/AppearanceSections';
import { useLookShareHint } from '../features/appearance/LookShareDialog';
import { useServicesCssHint } from '../features/appearance/ServicesCssDialog';
import { Section } from '../features/settings/Section';
import styles from '../features/settings/settings.module.css';
import { PageHead } from '../navigation/PageHead';
import { ADMIN_GLYPH, decodePart, navigate, paths, useLocation } from '../router';

/** Days a bin keeps what is thrown away before the server deletes it (every app's, the same). */
const TRASH_DAYS = 7;

/** "3 éléments supprimés définitivement": the app's bin. */
function emptiedMessage(count: number): string {
  if (count === 0) return t('La corbeille était déjà vide');
  return t('{items} définitivement', { items: plural(count, 'élément supprimé', 'éléments supprimés') });
}

export function SettingsScreen() {
  const theme = useSettingsStore(selectThemePreference);
  const languages = useSettingsStore(selectLanguages);
  const locale = useSettingsStore(selectLocale);
  const grain = useSettingsStore(selectGrain);
  const app = theApp();
  const words = APP_WORDS[app.id];
  const sections = app.settingsSections ?? [];
  /** The app's own pieces that go in one place (`SettingsSection.place`). */
  const placed = (place: 'appearance' | 'data' | 'last' | undefined) => sections.filter(section => section.place === place).map(({ id, Body }) => <Body key={id} />);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const adminId = useId();
  useServicesCssHint();
  // The look is this app's: a change of it offers to give it to the other apps.
  useLookShareHint();

  // A section named in the address (`#import`, `#ground` from a search) lands in view, from here too (the spotlight over Réglages).
  const { hash } = useLocation();
  useEffect(() => {
    const target = hash ? document.getElementById(decodePart(hash.slice(1))) : null;
    target?.scrollIntoView?.({ block: 'start' });
  }, [hash]);

  return (
    <div className={styles.page}>
      <PageHead title={t('Réglages')} />

      {/* Its one row names it: no section title over it saying the same. */}
      <Section labelledBy={adminId}>
        <button type="button" className={styles.row} onClick={() => navigate(paths.admin)}>
          <Icon name={ADMIN_GLYPH} size={24} />
          <span className={styles.rowText}>
            <span id={adminId} className="t-body">
              {t('Administration')}
            </span>
            <span className="t-meta">{t('Serveur, applications, Claude, sauvegardes et fichiers')}</span>
          </span>
          <Icon name="chevronRight" size={20} />
        </button>
      </Section>

      <Section title={t('Apparence')} id={SETTINGS_SECTIONS.appearance}>
        <div className={styles.block}>
          <p className="t-meta-strong">{t('Thème')}</p>
          <Segmented
            label={t('Thème')}
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: t('Système'), icon: 'settings' },
              { value: 'light', label: t('Clair'), icon: 'sun' },
              { value: 'dark', label: t('Sombre'), icon: 'moon' },
            ]}
          />
        </div>
        {placed('appearance')}
        <button type="button" role="switch" aria-checked={grain} className={styles.row} onClick={() => setGrain(!grain)}>
          <span className={`${styles.rowText} t-body`}>{t('Grain du papier')}</span>
          <SwitchMark checked={grain} />
        </button>
      </Section>

      <ColorsSection />

      <GroundSection />

      {/* As on the phone: the app says what its language changes (Carnet's, what Claude writes of a link). */}
      <Section title={t('Langue')} id={SETTINGS_SECTIONS.language}>
        {/* The section's title and the note under the choice say what it is: its name is read out, not shown. */}
        <div className={styles.block}>
          {/* Each language named in itself, so it is found whichever is shown. */}
          <Segmented label={words.language} value={locale} onChange={setInterfaceLocale} options={LOCALES.map(id => ({ value: id, label: LOCALE_NAMES[id] }))} />
          <p className="t-meta">{words.languageNote}</p>
        </div>
        <p className={`${styles.help} t-meta`}>{t('Les recherches par mot, comme celle d’un emoji par son nom, comprennent les langues cochées.')}</p>
        {LANGUAGES.map(language => {
          const on = languages.includes(language.id);
          // The last language left stays: a search needs one.
          const last = on && languages.length === 1;
          return (
            <button key={language.id} type="button" role="checkbox" aria-checked={on} aria-disabled={last || undefined} className={styles.row} lang={language.id} onClick={() => !last && setLanguage(language.id, !on)}>
              <Icon name={on ? 'boxChecked' : 'box'} size={24} />
              <span className={`${styles.rowText} t-body`}>{language.name}</span>
            </button>
          );
        })}
      </Section>

      {placed(undefined)}

      <Section title={t('Données')} id={SETTINGS_SECTIONS.data}>
        {placed('data')}
        {/* The app's bin, when it has one. */}
        {app.emptyBin ? (
          <button type="button" className={styles.row} onClick={() => setConfirmTrash(true)}>
            <Icon name="trash" size={24} />
            <span className={styles.rowText}>
              <span className="t-body">{t('Vider la corbeille')}</span>
              <span className="t-meta">{t('Sinon, le serveur supprime ce qui est dans la corbeille au bout de {days} jours.', { days: TRASH_DAYS })}</span>
            </span>
          </button>
        ) : null}
        {/* Only where there is a keyboard to press them: a mouse or a trackpad says so. */}
        <button type="button" className={`${styles.row} ${styles.keysRow}`} onClick={() => setShortcutsOpen(true)}>
          <Icon name="info" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Raccourcis clavier')}</span>
            <span className="t-meta">{t('Appuyez sur ? n’importe où pour les afficher.')}</span>
          </span>
        </button>
      </Section>

      {placed('last')}

      <p className={`${styles.about} t-meta`}>{t('{suite} · vos applications, chez vous', { suite: SUITE_NAME })}</p>

      <Confirm
        open={confirmTrash}
        title={t('Vider la corbeille ?')}
        message={t('Ce qui est dans la corbeille de {app} sera supprimé définitivement, sur tous vos appareils.', { app: APPS[app.id].name })}
        confirmLabel={t('Vider')}
        danger
        onCancel={() => setConfirmTrash(false)}
        onConfirm={() => {
          setConfirmTrash(false);
          showSnack(emptiedMessage(app.emptyBin?.() ?? 0), undefined, { tone: 'success' });
        }}
      />
    </div>
  );
}
