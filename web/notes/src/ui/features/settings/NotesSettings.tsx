/**
 * Carnet's part of the Réglages, in DESIGN's order as on the phone: how the board lays out (in
 * « Apparence », after the theme), where the reminders ring (a section of its own), cleaning the
 * links already saved (a row of « Données »), and the Keep import, done once, after « Données ».
 */
import { t, tc } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { KEEP_SETTINGS_SECTION, REMINDERS_SETTINGS_SECTION } from '@unlease/notes/services/settingsPlaces';

import { cleanSavedLinks, trackedLinkIds } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { setLayout, useLayout } from '../../../app/store/prefs';
import { showUndo } from '@shared/app/store/ui';
import { Icon } from '@shared/ui/components/Icon';
import { Segmented } from '@shared/ui/components/Segmented';
import { Section } from '@shared/ui/features/settings/Section';
import styles from '@shared/ui/features/settings/settings.module.css';
import type { SettingsSection } from '@shared/modules';
import { KeepImport } from './KeepImport';

/** In « Apparence », under the theme, as on the phone. */
function BoardLayout() {
  const layout = useLayout();
  return (
    <div className={styles.block}>
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
  );
}

function RemindersSection() {
  return (
    <Section title={t('Rappels')} id={REMINDERS_SETTINGS_SECTION}>
      <div className={styles.row}>
        <Icon name="bell" size={24} />
        <span className={styles.rowText}>
          <span className="t-body">{t('Les rappels sonnent sur votre téléphone')}</span>
          <span className="t-meta">{t('Ici, ils sont enregistrés et affichés ; l’application Android les fait sonner à l’heure dite.')}</span>
        </span>
      </div>
    </Section>
  );
}

/** A row of « Données », as on the phone. */
function CleanLinksRow() {
  const tracked = useLibraryStore(s => trackedLinkIds(s.links).length);
  return tracked > 0 ? (
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
  );
}

function ImportSection() {
  return (
    <Section title={t('Importer depuis Google Keep')} id={KEEP_SETTINGS_SECTION}>
      <KeepImport />
    </Section>
  );
}

export const NOTES_SETTINGS: readonly SettingsSection[] = [
  { id: 'board', Body: BoardLayout, place: 'appearance' },
  { id: 'reminders', Body: RemindersSection },
  { id: 'links', Body: CleanLinksRow, place: 'data' },
  { id: 'import', Body: ImportSection, place: 'last' },
];
