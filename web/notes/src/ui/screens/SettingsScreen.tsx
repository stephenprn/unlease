/**
 * Settings: the way to the Administration (the server, link reading by Claude, backups and files),
 * appearance (the theme, the board, the paper's grain), the colours and the ground, the languages a
 * search by word understands, reminders, data (cleaning saved links, the bin, the keyboard
 * shortcuts) and, last, the Keep import, done once. Each section is a sheet of paper pinned to the wall.
 */
import { useEffect, useState } from 'react';

import { APP_NAME } from '@unlease/notes/brand';
import { LOCALE_NAMES, LOCALES, t, tc } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';

import { cleanSavedLinks, emptyTrash, trackedLinkIds } from '../../app/store/actions';
import { useLibraryStore } from '../../app/store/library';
import { emptyPagesBin } from '../../app/store/pages';
import { LANGUAGES, selectGrain, selectLanguages, selectLayout, selectLocale, selectThemePreference, setGrain, setInterfaceLocale, setLanguage, setLayout, setTheme, useSettingsStore } from '../../app/store/settings';
import { setShortcutsOpen, showSnack, showUndo } from '../../app/store/ui';
import { SwitchMark } from '../components/Checkbox';
import { Confirm } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { ColorsSection, GroundSection } from '../features/appearance/AppearanceSections';
import { useServicesCssHint } from '../features/appearance/ServicesCssDialog';
import { KeepImport } from '../features/settings/KeepImport';
import { Section } from '../features/settings/Section';
import styles from '../features/settings/settings.module.css';
import { PageHead } from '../navigation/PageHead';
import { navigate, paths } from '../router';

/** "3 notes et 1 page supprimées définitivement": the bin holds both. */
function emptiedMessage(notes: number, pages: number): string {
  if (notes + pages === 0) return t('La corbeille était déjà vide');
  if (notes > 0 && pages > 0) return t('{notes} et {pages} supprimées définitivement', { notes: plural(notes, 'note'), pages: plural(pages, 'page') });
  const count = notes > 0 ? plural(notes, 'note') : plural(pages, 'page');
  return notes + pages > 1 ? t('{count} supprimées définitivement', { count }) : t('{count} supprimée définitivement', { count });
}

export function SettingsScreen() {
  const theme = useSettingsStore(selectThemePreference);
  const layout = useSettingsStore(selectLayout);
  const languages = useSettingsStore(selectLanguages);
  const locale = useSettingsStore(selectLocale);
  const grain = useSettingsStore(selectGrain);
  const tracked = useLibraryStore(s => trackedLinkIds(s.links).length);
  const [confirmTrash, setConfirmTrash] = useState(false);
  useServicesCssHint();

  // A section named in the address (`#import`) lands in view.
  useEffect(() => {
    const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
    target?.scrollIntoView?.({ block: 'start' });
  }, []);

  return (
    <div className={styles.page}>
      <PageHead title={t('Réglages')} />

      <Section title={t('Administration')}>
        <button type="button" className={styles.row} onClick={() => navigate(paths.admin)}>
          <Icon name="server" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Administration')}</span>
            <span className="t-meta">{t('Serveur, lecture des liens par Claude, sauvegardes et fichiers')}</span>
          </span>
          <Icon name="chevronRight" size={20} />
        </button>
      </Section>

      <Section title={t('Apparence')}>
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
          <p className="t-meta-strong">{tc('layout', 'Tableau')}</p>
          <Segmented
            label={t('Disposition du tableau')}
            value={layout}
            onChange={setLayout}
            options={[
              { value: 'wall', label: t('Mur'), icon: 'grid' },
              { value: 'list', label: t('Liste'), icon: 'rows' },
            ]}
          />
        </div>
        <button type="button" role="switch" aria-checked={grain} className={styles.row} onClick={() => setGrain(!grain)}>
          <span className={styles.rowText}>
            <span className="t-body">{t('Grain du papier')}</span>
            <span className="t-meta">{t('Le grain du papier sur les notes et les feuilles, sur cet appareil.')}</span>
          </span>
          <SwitchMark checked={grain} />
        </button>
      </Section>

      <ColorsSection />

      <GroundSection />

      <Section title={t('Langues')}>
        <div className={styles.block}>
          <p className="t-meta-strong">{t('Langue de l’interface et des lectures')}</p>
          {/* Each language named in itself, so it is found whichever is shown. */}
          <Segmented label={t('Langue de l’interface et des lectures')} value={locale} onChange={setInterfaceLocale} options={LOCALES.map(id => ({ value: id, label: LOCALE_NAMES[id] }))} />
          <p className="t-meta">{t('Les écrans de l’application, et ce que Claude écrit quand il lit un lien enregistré depuis cet appareil : titre, résumé, détails. Un lien déjà lu garde sa langue ; « Relire la page » le relit dans celle-ci.')}</p>
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

      <Section title={t('Rappels')}>
        <div className={styles.row}>
          <Icon name="bell" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Les rappels sonnent sur votre téléphone')}</span>
            <span className="t-meta">{t('Ici, ils sont enregistrés et affichés ; l’application Android les fait sonner à l’heure dite.')}</span>
          </span>
        </div>
      </Section>

      <Section title={t('Données')}>
        {tracked > 0 ? (
          <button
            type="button"
            className={styles.row}
            onClick={() => {
              const { count, undo } = cleanSavedLinks();
              showUndo(plural(count, 'lien nettoyé', 'liens nettoyés'), undo);
            }}
          >
            <Icon name="broom" size={24} />
            <span className={styles.rowText}>
              <span className="t-body">{t('Nettoyer les liens enregistrés')}</span>
              <span className="t-meta">{t('{links} des paramètres de suivi (utm, fbclid…) : ils seront retirés, le reste de l’adresse est gardé.', { links: plural(tracked, 'lien garde', 'liens gardent') })}</span>
            </span>
          </button>
        ) : (
          <div className={styles.row}>
            <Icon name="broom" size={24} />
            <span className={styles.rowText}>
              <span className="t-body">{t('Nettoyer les liens enregistrés')}</span>
              <span className="t-meta">{t('Aucun paramètre de suivi dans vos liens : les nouveaux sont nettoyés en arrivant.')}</span>
            </span>
          </div>
        )}
        <button type="button" className={styles.row} onClick={() => setConfirmTrash(true)}>
          <Icon name="trash" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Vider la corbeille')}</span>
            <span className="t-meta">{t('Sinon, le serveur supprime les notes et les pages de la corbeille au bout de {days} jours.', { days: TRASH_RETENTION_DAYS })}</span>
          </span>
        </button>
        {/* Only where there is a keyboard to press them: a mouse or a trackpad says so. */}
        <button type="button" className={`${styles.row} ${styles.keysRow}`} onClick={() => setShortcutsOpen(true)}>
          <Icon name="info" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Raccourcis clavier')}</span>
            <span className="t-meta">{t('Appuyez sur ? n’importe où pour les afficher.')}</span>
          </span>
        </button>
      </Section>

      <Section title={t('Importer depuis Google Keep')} id="import">
        <KeepImport />
      </Section>

      <p className={`${styles.about} t-meta`}>{t('{app} · notes, listes et liens, chez vous', { app: APP_NAME })}</p>

      <Confirm
        open={confirmTrash}
        title={t('Vider la corbeille ?')}
        message={t('Les notes et les pages de la corbeille seront supprimées définitivement, sur tous vos appareils.')}
        confirmLabel={t('Vider')}
        danger
        onCancel={() => setConfirmTrash(false)}
        onConfirm={() => {
          setConfirmTrash(false);
          showSnack(emptiedMessage(emptyTrash(), emptyPagesBin()), undefined, { tone: 'success' });
        }}
      />
    </div>
  );
}
