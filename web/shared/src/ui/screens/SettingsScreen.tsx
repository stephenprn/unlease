/**
 * Réglages, this device's own, in the same order in every app and on both clients (DESIGN's): the
 * app's own sections first, the ones used most (Carnet's board and reminders, Agenda's calendar,
 * Contacts' order); then « Apparence », one row saying the look now and opening its own page (the
 * theme, the paper's grain, the colours and the ground: `AppearanceScreen`); the language and the
 * languages a search by word understands; the data (the app's rows, Carnet's links cleaned; every
 * app's bin, the keyboard shortcuts), then what is done once (the Keep import); last, the way to the
 * Administration (the server and what it does for every app). Each section is a sheet of paper
 * pinned to the wall.
 */
import { useId, useState } from 'react';

import { APPS, SUITE_NAME } from '@unlease/core/apps';
import { languageWords } from '@unlease/core/appWords';
import { LOCALE_NAMES, LOCALES, t } from '@unlease/core/i18n';
import { eraseRowWords } from '@unlease/core/services/erase';
import { plural } from '@unlease/core/services/format';
import { SETTINGS_SECTIONS } from '@unlease/core/services/settingsSearch';
import { lookWords } from '@unlease/design/appearance';

import { LANGUAGES, selectAppearance, selectLanguages, selectLocale, selectThemePreference, setInterfaceLocale, setLanguage, useSettingsStore } from '../../app/store/settings';
import { useRecordsRevision } from '../../app/store/records';
import { useServerFeature } from '../../app/store/serverSettings';
import { setShortcutsOpen, showSnack } from '../../app/store/ui';
import { theApp } from '../../modules';
import { Confirm } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { LookPebbles } from '../features/appearance/AppearanceSections';
import { useSectionLanding } from '../features/settings/landing';
import { Section } from '../features/settings/Section';
import styles from '../features/settings/settings.module.css';
import { PageHead } from '../navigation/PageHead';
import { ADMIN_GLYPH, navigate, paths } from '../router';

/** Days a bin keeps what is thrown away before the server deletes it (every app's, the same). */
const TRASH_DAYS = 7;

/** "3 éléments supprimés définitivement": the app's bin. */
function emptiedMessage(count: number): string {
  if (count === 0) return t('La corbeille était déjà vide');
  return t('{items} définitivement', { items: plural(count, 'élément supprimé', 'éléments supprimés') });
}

/**
 * « Apparence » on Réglages: one row, its own page behind it (the colours' and the ground's
 * galleries are long), the look now in its second line and in its two pebbles. It names itself, so
 * no title repeats it.
 */
function AppearanceRow() {
  const theme = useSettingsStore(selectThemePreference);
  const appearance = useSettingsStore(selectAppearance);
  const titleId = useId();
  return (
    <Section labelledBy={titleId}>
      <button type="button" className={styles.row} onClick={() => navigate(paths.appearance)}>
        <Icon name="palette" size={24} />
        <span className={styles.rowText}>
          <span id={titleId} className="t-body">
            {t('Apparence')}
          </span>
          <span className="t-meta">{lookWords(theme, appearance)}</span>
        </span>
        <LookPebbles />
        <Icon name="chevronRight" size={20} />
      </button>
    </Section>
  );
}

export function SettingsScreen() {
  const languages = useSettingsStore(selectLanguages);
  const locale = useSettingsStore(selectLocale);
  const app = theApp();
  // Carnet's and Pages' language note names what Claude writes: only once Claude has a key.
  const words = languageWords(app.id, useServerFeature('claude'));
  const sections = app.settingsSections ?? [];
  /** The app's own pieces that go in one place (`SettingsSection.place`). */
  const placed = (place: 'data' | 'last' | undefined) => sections.filter(section => section.place === place).map(({ id, Body }) => <Body key={id} />);
  const [confirmTrash, setConfirmTrash] = useState(false);
  // What the bin holds, read again at every write.
  useRecordsRevision();
  const binned = app.binCount?.() ?? null;
  const adminId = useId();
  // `#language`, `#import` from a search; `#colors` (the look's, from before its page) goes on there.
  useSectionLanding(null);

  return (
    <div className={styles.page}>
      <PageHead title={t('Réglages')} />

      {/* The app's own first: what is set most (Carnet's board, Agenda's calendar, Contacts' order). */}
      {placed(undefined)}

      <AppearanceRow />

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

      <Section title={t('Données')} id={SETTINGS_SECTIONS.data}>
        {/* Imports first, wearing `download`; the app's exports and cleanings after. */}
        {app.importer ? (
          <button type="button" className={styles.row} onClick={() => navigate(paths.importer)}>
            <Icon name="download" size={24} />
            <span className={styles.rowText}>
              <span className="t-body">{t('Importer')}</span>
              <span className="t-meta">{app.importer.meta()}</span>
            </span>
            <Icon name="chevronRight" size={20} />
          </button>
        ) : null}
        {placed('data')}
        {/* The app's bin, when it has one: as on the phone, nothing to press while it is empty. */}
        {app.emptyBin && binned === 0 ? (
          <div className={styles.row}>
            <Icon name="trash" size={24} />
            <span className={styles.rowText}>
              <span className="t-body">{t('Vider la corbeille')}</span>
              <span className="t-meta">{t('La corbeille est vide.')}</span>
            </span>
          </div>
        ) : app.emptyBin ? (
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
        {/* Last, and in danger ink: its own page asks what goes, the token and the word. */}
        {app.erase ? (
          <button type="button" className={styles.row} onClick={() => navigate(paths.erase)}>
            <Icon name="eraser" size={24} />
            <span className={styles.rowText}>
              <span className={`${styles.error} t-body`}>{eraseRowWords(APPS[app.id].name).title}</span>
              <span className="t-meta">{eraseRowWords(APPS[app.id].name).meta}</span>
            </span>
            <Icon name="chevronRight" size={20} />
          </button>
        ) : null}
      </Section>

      {placed('last')}

      {/* Last, the server's: its one row names it, no section title over it saying the same. */}
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
