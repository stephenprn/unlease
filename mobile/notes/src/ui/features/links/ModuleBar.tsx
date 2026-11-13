/**
 * A link's modules (`notes/models/modules`), as its collection picked them: a row of small buttons
 * under its title, each only where it fits the link and works here. Most open a sheet, which the
 * screen mounts at its root (`ModuleSheets`); "En cuisine" opens the cook mode, "Y aller" Google
 * Maps, "SensCritique" its search, "Seerr" the title in it (with its state when Seerr says);
 * "Garder une copie" has the server make a page in Pages (then "Voir la copie" opens it, in Pages
 * when it is installed, else on the web); "Ajouter à l’agenda" has Claude read its date and opens
 * Agenda's new event with it (Agenda's app, else its web app); "Pour N personnes" is a stepper in the bar itself. The
 * web's `ModuleBar`.
 */
import React, { useEffect, useState } from 'react';
import { Keyboard, Linking, StyleSheet, View } from 'react-native';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import type { LinkItem } from '@unlease/notes/models/entities';
import { MODULE_ICONS, MODULE_NAMES, type LinkModule } from '@unlease/notes/models/modules';
import { directionsUrl, linkModules, seerrSearchUrl, sensCritiqueUrl } from '@unlease/notes/services/modules';
import { SEERR_STATUS_WORDS } from '@unlease/notes/services/works';
import type { SeerrResponse } from '@unlease/notes/sync/seerr';
import { agendaQuery, keepCopy, lookUpSeerr, runningCopy } from '@app/modules';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectSeerrUrl, useSettingsStore } from '@shared/app/store/settingsStore';
import { newEventPlace, openInApp, pagePlace } from '@shared/app/openApp';
import { useModuleAbilities } from '@app/hooks/useModuleAbilities';
import { showSnack } from '@shared/app/store/uiStore';

import { Button } from '../../components';
import { navigate } from '../../navigation/navigationRef';
import { AskSheet } from './AskSheet';
import { CouponsSheet } from './CouponsSheet';
import { CoverageSheet } from './CoverageSheet';
import { GroceriesSheet } from './GroceriesSheet';
import { OffersSheet } from './OffersSheet';
import { RatingsSheet } from './RatingsSheet';
import { RecapSheet } from './RecapSheet';
import { ServingsStepper } from './Servings';

/** The modules that open a sheet. */
export type SheetModule = Extract<LinkModule, 'coupons' | 'cheaper' | 'secondhand' | 'groceries' | 'ratings' | 'recap' | 'coverage' | 'ask'>;

const SHEET_MODULES: ReadonlySet<LinkModule> = new Set<SheetModule>(['coupons', 'cheaper', 'secondhand', 'groceries', 'ratings', 'recap', 'coverage', 'ask']);
const isSheetModule = (module: LinkModule): module is SheetModule => SHEET_MODULES.has(module);

const open = (url: string) => Linking.openURL(url).catch(() => showSnack(t('Couldn’t open this link'), undefined, { tone: 'error' }));

export function ModuleBar({ id, onOpen }: { id: string; onOpen: (module: SheetModule) => void }) {
  const link = useLibraryStore(s => s.links[id]);
  const line = useLibraryStore(s => (link ? s.notes[link.noteId] : undefined));
  const can = useModuleAbilities();
  const [copying, setCopying] = useState(() => runningCopy(id) !== null);
  const [dating, setDating] = useState(false);
  // The page made a moment ago, until the link's `copy` syncs back.
  const [made, setMade] = useState<string | null>(null);
  // « Suivi des prix » is no button: it speaks under the price (`PriceWatch`).
  const modules = link ? linkModules(link, line, can).filter(module => module !== 'pricewatch') : [];
  const copy = link?.copy ?? made;
  // Opened again while its copy is being made: busy until that copy is done (a press joins it).
  useEffect(() => {
    const running = runningCopy(id);
    if (!running) return;
    let live = true;
    running.catch(() => undefined).finally(() => live && setCopying(false));
    return () => {
      live = false;
    };
  }, [id]);
  if (!link || modules.length === 0) return null;

  const keep = () => {
    setCopying(true);
    keepCopy(id)
      .then(
        page => {
          setMade(page);
          showSnack(t('Copy kept in {app}', { app: APPS.pages.name }), { label: t('Open'), run: () => void openInApp('pages', pagePlace(page)) }, { tone: 'success' });
        },
        (error: unknown) => showSnack(error instanceof Error ? t(error.message) : t('unknown error'), undefined, { tone: 'error' }),
      )
      .finally(() => setCopying(false));
  };

  const toAgenda = () => {
    setDating(true);
    agendaQuery(id)
      .then(
        query => void openInApp('calendar', newEventPlace(query)),
        (error: unknown) => showSnack(error instanceof Error ? t(error.message) : t('unknown error'), undefined, { tone: 'error' }),
      )
      .finally(() => setDating(false));
  };

  const button = (module: LinkModule) => {
    if (module === 'pricewatch') return null;
    const label = MODULE_NAMES[module];
    const icon = MODULE_ICONS[module];
    if (module === 'servings') return <ServingsStepper key={module} id={id} inBar />;
    if (module === 'seerr') return <SeerrButton key={module} link={link} />;
    if (module === 'directions' || module === 'senscritique') {
      const url = module === 'directions' ? directionsUrl(link) : sensCritiqueUrl(link);
      return url ? <Button key={module} kind="tonal" small label={label} icon={icon} onPress={() => open(url)} /> : null;
    }
    if (module === 'agenda') return <Button key={module} kind="tonal" small label={label} icon={icon} busy={dating} onPress={toAgenda} />;
    if (module === 'archive') {
      return copy ? (
        <Button key={module} kind="tonal" small label={t('See the copy')} icon="page" onPress={() => void openInApp('pages', pagePlace(copy))} />
      ) : (
        <Button key={module} kind="tonal" small label={label} icon={icon} busy={copying} onPress={keep} />
      );
    }
    return (
      <Button
        key={module}
        kind="tonal"
        small
        label={label}
        icon={icon}
        onPress={() => {
          // The keyboard of the note field would cover the sheet.
          Keyboard.dismiss();
          if (isSheetModule(module)) onOpen(module);
          else if (module === 'cooking') navigate('Cooking', { id });
        }}
      />
    );
  };

  return <View style={styles.bar}>{modules.map(button)}</View>;
}

/**
 * "Seerr": the film or series in Seerr, its state beside the name once Seerr has said it (« Seerr ·
 * Disponible »). Until then, or when Seerr cannot be asked, the press opens Seerr's own search.
 */
function SeerrButton({ link }: { link: LinkItem }) {
  const base = useSettingsStore(selectSeerrUrl);
  const [found, setFound] = useState<SeerrResponse | null>(null);
  const { id, title } = link;
  // Asked again when a reading renames the title: that is another search.
  useEffect(() => {
    let live = true;
    setFound(null);
    // A failed lookup says nothing: the plain name stays, and the press searches.
    lookUpSeerr(id).then(
      answer => {
        if (live) setFound(answer);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [id, title]);
  const url = found?.url ?? seerrSearchUrl(base, link);
  if (!url) return null;
  const label = found?.status ? `${MODULE_NAMES.seerr} · ${SEERR_STATUS_WORDS[found.status]}` : MODULE_NAMES.seerr;
  return <Button kind="tonal" small label={label} icon={MODULE_ICONS.seerr} onPress={() => open(url)} />;
}

/** The sheets the bar opens, mounted at the screen's root: a sheet covers the box it is mounted in. */
export function ModuleSheets({ id, opened, onDismiss }: { id: string; opened: SheetModule | null; onDismiss: () => void }) {
  return (
    <>
      <CouponsSheet id={id} visible={opened === 'coupons'} onDismiss={onDismiss} />
      <OffersSheet id={id} market="new" visible={opened === 'cheaper'} onDismiss={onDismiss} />
      <OffersSheet id={id} market="used" visible={opened === 'secondhand'} onDismiss={onDismiss} />
      <GroceriesSheet id={id} visible={opened === 'groceries'} onDismiss={onDismiss} />
      <RatingsSheet id={id} visible={opened === 'ratings'} onDismiss={onDismiss} />
      <RecapSheet id={id} visible={opened === 'recap'} onDismiss={onDismiss} />
      <CoverageSheet id={id} visible={opened === 'coverage'} onDismiss={onDismiss} />
      <AskSheet id={id} visible={opened === 'ask'} onDismiss={onDismiss} />
    </>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
