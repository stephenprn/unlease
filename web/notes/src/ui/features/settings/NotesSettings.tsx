/**
 * Carnet's part of the Réglages, in DESIGN's order as on the phone: its own section first (« Carnet »:
 * how the board lays out, where the reminders ring), then cleaning the links already saved (a row of
 * « Données »). The Keep import is the shell's « Importer » row (`importer`, `KeepWizard`).
 */
import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { APP_NAME } from '@unlease/notes/brand';
import { NOTES_SETTINGS_SECTION } from '@unlease/notes/services/settingsPlaces';

import { cleanSavedLinks, trackedLinkIds } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { setLayout, useLayout } from '../../../app/store/prefs';
import { showUndo } from '@shared/app/store/ui';
import { Icon } from '@shared/ui/components/Icon';
import { Segmented } from '@shared/ui/components/Segmented';
import { Section } from '@shared/ui/features/settings/Section';
import styles from '@shared/ui/features/settings/settings.module.css';
import type { SettingsSection } from '@shared/modules';

/** The board's layout, the section's first: Mur or Liste. */
function BoardLayout() {
  const layout = useLayout();
  return (
    <div className={styles.block}>
      <p className="t-meta-strong">{t('Board')}</p>
      <Segmented
        label={t('Board layout')}
        value={layout}
        onChange={setLayout}
        options={[
          { value: 'wall', label: t('Wall'), icon: 'grid' },
          { value: 'list', label: t('List'), icon: 'rows' },
        ]}
      />
    </div>
  );
}

/** Réglages' first section, as Agenda's « Agenda » and Contacts' « Contacts »: the board, then where the reminders ring. */
function NotesSection() {
  return (
    <Section title={APP_NAME} id={NOTES_SETTINGS_SECTION}>
      <BoardLayout />
      <div className={styles.row}>
        <Icon name="bell" size={24} />
        <span className={styles.rowText}>
          <span className="t-body">{t('Reminders ring on your phone')}</span>
          <span className="t-meta">{t('Here they are saved and shown; the Android app rings them at the set time.')}</span>
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
        showUndo(plural(count, 'link cleaned', 'links cleaned'), undo);
      }}
    >
      <Icon name="broom" size={24} />
      <span className={styles.rowText}>
        <span className="t-body">{t('Clean saved links')}</span>
        <span className="t-meta">{t('{links} tracking parameters (utm, fbclid…): they will be removed, the rest of the address is kept.', { links: plural(tracked, 'link keeps', 'links keep') })}</span>
      </span>
    </button>
  ) : (
    <div className={styles.row}>
      <Icon name="broom" size={24} />
      <span className={styles.rowText}>
        <span className="t-body">{t('Clean saved links')}</span>
        <span className="t-meta">{t('No tracking parameters in your links: new ones are cleaned as they arrive.')}</span>
      </span>
    </div>
  );
}

export const NOTES_SETTINGS: readonly SettingsSection[] = [
  { id: 'notes', Body: NotesSection },
  { id: 'links', Body: CleanLinksRow, place: 'data' },
];
