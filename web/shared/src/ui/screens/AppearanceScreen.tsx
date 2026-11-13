/**
 * « Apparence », Réglages' page for the look (`/<app>/settings/appearance`), opened from its one row
 * on Réglages, as Android's settings give a large group a page of its own: the theme and the paper's
 * grain, then the colours and the ground (this app's look, given to the others on « Appliquer aux
 * autres »). A change of look here, once it settles, offers it to the suite's other apps, then, once
 * a session, points to the other services' sheets. The phone's `AppearanceScreen`.
 */
import { t } from '@unlease/core/i18n';
import { SETTINGS_SECTIONS } from '@unlease/core/services/settingsSearch';

import { selectGrain, selectThemePreference, setGrain, setTheme, useSettingsStore } from '../../app/store/settings';
import { SwitchMark } from '../components/Checkbox';
import { Segmented } from '../components/Segmented';
import { ColorsSection, GroundSection } from '../features/appearance/AppearanceSections';
import { useLookShareHint } from '../features/appearance/LookShareDialog';
import { useServicesCssHint } from '../features/appearance/ServicesCssDialog';
import { useSectionLanding } from '../features/settings/landing';
import { Section } from '../features/settings/Section';
import styles from '../features/settings/settings.module.css';
import { PageHead } from '../navigation/PageHead';

export function AppearanceScreen() {
  const theme = useSettingsStore(selectThemePreference);
  const grain = useSettingsStore(selectGrain);
  useServicesCssHint();
  // The look is this app's: a change of it offers to give it to the other apps.
  useLookShareHint();
  useSectionLanding('appearance');

  return (
    <div className={styles.page}>
      <PageHead title={t('Appearance')} />

      {/* Under the page's title, which names it: no title of its own. */}
      <Section id={SETTINGS_SECTIONS.appearance} label={t('Theme')}>
        <div className={styles.block}>
          <p className="t-meta-strong">{t('Theme')}</p>
          <Segmented
            label={t('Theme')}
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: t('System'), icon: 'settings' },
              { value: 'light', label: t('Light'), icon: 'sun' },
              { value: 'dark', label: t('Dark'), icon: 'moon' },
            ]}
          />
        </div>
        {/* What it is, said: the sheets' own grain (`--grain`), not the ground's (« Grain sur le fond », under Fond). */}
        <button type="button" role="switch" aria-checked={grain} className={styles.row} onClick={() => setGrain(!grain)}>
          <span className={styles.rowText}>
            <span className="t-body">{t('Paper grain')}</span>
            <span className="t-meta">{t('A fine paper texture on notes, cards and panels.')}</span>
          </span>
          <SwitchMark checked={grain} />
        </button>
      </Section>

      <ColorsSection />

      <GroundSection />
    </div>
  );
}
