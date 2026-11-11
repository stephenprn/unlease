/**
 * Moving in from Google, or from this phone: a `.vcf` or Google's CSV (contacts.google.com ›
 * Exporter, or Takeout), or the phone's own contacts (Google's synced ones with them, photos too).
 * What was read is shown before anything is written: who is new, who is here already and gains what
 * they lacked, the labels to make. A card shared to the app lands here, read already.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { tx, t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import type { ImportedContact } from '@unlease/contacts/services/importing';
import { planFor, readPhoneBook, readPickedFile, runImport, type ImportReport, type ImportSource } from '@app/importing';
import { setPendingImport, useImportStore } from '@app/store/importStore';
import { askPermission, openAppSettings } from '@platform/phoneContacts';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Button, EdgeScrollView, FormMessage, Ground, Icon, Organic, TopBar } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import type { ScreenProps } from '../navigation/types';
import { later } from '@app/later';

const GOOGLE_STEPS = [
  tx('Ouvrez contacts.google.com, puis « Exporter » (ou takeout.google.com, « Contacts »).'),
  tx('Choisissez « vCard » ou « Google CSV », puis enregistrez le fichier sur ce téléphone.'),
  tx('Choisissez-le ici : rien n’est écrit avant votre accord.'),
];

interface Read {
  readonly source: ImportSource;
  readonly contacts: readonly ImportedContact[];
}

export function ImportScreen({ navigation, route }: ScreenProps<'Import'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const pending = useImportStore(s => s.pending);
  const server = useSettingsStore(selectServer);
  const [read, setRead] = useState<Read | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  /** What could not be read, said in the panel it came from (the access refused offers Android's settings). */
  const [problem, setProblem] = useState<{ readonly from: ImportSource; readonly message: string; readonly blocked?: boolean } | null>(null);

  // A shared card, read before the screen opened.
  useEffect(() => {
    if (!pending) return;
    setRead({ source: pending.source, contacts: pending.contacts });
    setReport(null);
    setPendingImport(null);
  }, [pending, route.params?.source]);

  const plan = useMemo(() => (read ? planFor(read.contacts) : null), [read]);
  const urlPhotos = useMemo(() => (read ? read.contacts.filter(contact => contact.photo?.kind === 'url').length : 0), [read]);

  const fromFile = async (): Promise<void> => {
    setProblem(null);
    setBusy(t('Lecture du fichier…'));
    const outcome = await readPickedFile();
    setBusy(null);
    if (outcome.status === 'ok') setRead({ source: 'file', contacts: outcome.contacts });
    else if (outcome.status === 'error') setProblem({ from: 'file', message: outcome.message });
  };

  const fromPhone = async (): Promise<void> => {
    setProblem(null);
    const answer = await askPermission('contacts');
    if (answer !== 'granted') {
      if (answer === 'blocked') setProblem({ from: 'phone', message: t('L’accès aux contacts du téléphone est refusé : il se donne dans les réglages d’Android.'), blocked: true });
      return;
    }
    setBusy(t('Lecture des contacts du téléphone…'));
    try {
      const contacts = await readPhoneBook((done, total) => setBusy(t('Lecture des contacts du téléphone… {done} sur {total}', { done, total })));
      if (contacts.length === 0) showSnack(t('Aucun contact sur ce téléphone.'), undefined, { tone: 'info' });
      else setRead({ source: 'phone', contacts });
    } catch {
      setProblem({ from: 'phone', message: t('Les contacts du téléphone n’ont pas pu être lus.') });
    } finally {
      setBusy(null);
    }
  };

  const confirm = async (): Promise<void> => {
    if (!read) return;
    setBusy(t('Import…'));
    try {
      // Planned again: the address book may have changed since it was read.
      const done = await runImport(planFor(read.contacts), (photo, total) => setBusy(t('Photos : {done} sur {total}', { done: photo, total })));
      setReport(done);
      setRead(null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Importer')} onBack={() => navigation.goBack()} />
      <EdgeScrollView contentContainerStyle={styles.content}>
        {report ? (
          <Organic outline="card" style={styles.panel}>
            <Icon name="check" size={28} color={theme.color.ok} />
            <AppText variant="title">{t('Import terminé')}</AppText>
            <AppText variant="body">{[plural(report.created, 'contact ajouté', 'contacts ajoutés'), report.updated > 0 ? plural(report.updated, 'contact complété', 'contacts complétés') : null, report.unchanged > 0 ? plural(report.unchanged, 'déjà là', 'déjà là') : null].filter(Boolean).join(' · ')}</AppText>
            {report.labels > 0 ? <AppText variant="meta">{plural(report.labels, 'libellé créé', 'libellés créés')}</AppText> : null}
            {report.photos > 0 ? <AppText variant="meta">{plural(report.photos, 'photo', 'photos')}</AppText> : null}
            {report.photosMissed > 0 ? <AppText variant="meta">{t('{photos} n’ont pas pu être reprises.', { photos: plural(report.photosMissed, 'photo') })}</AppText> : null}
            <Button label={t('Voir les contacts')} onPress={() => navigation.navigate('Contacts')} />
          </Organic>
        ) : read && plan ? (
          <Organic outline="card" style={styles.panel}>
            <AppText variant="title">{plural(read.contacts.length, 'contact lu', 'contacts lus')}</AppText>
            <View style={styles.facts}>
              <Fact icon="personPlus" text={plural(plan.creates.length, 'nouveau contact', 'nouveaux contacts')} />
              {plan.updates.length > 0 ? <Fact icon="person" text={t('{contacts} déjà là, complétés de ce qui leur manquait', { contacts: plural(plan.updates.length, 'contact') })} /> : null}
              {plan.unchanged > 0 ? <Fact icon="check" text={t('{contacts} déjà là, rien à ajouter', { contacts: plural(plan.unchanged, 'contact') })} /> : null}
              {plan.labels.length > 0 ? <Fact icon="tag" text={plural(plan.labels.length, 'nouveau libellé', 'nouveaux libellés')} /> : null}
              {plan.photos > 0 ? <Fact icon="image" text={plural(plan.photos, 'photo', 'photos')} /> : null}
            </View>
            {urlPhotos > 0 && !server ? <AppText variant="meta">{t('Les photos de Google se reprennent par le serveur : reliez-en un pour les garder.')}</AppText> : null}
            <AppText variant="meta">{t('Rien de ce qui est déjà là n’est remplacé.')}</AppText>
            <View style={styles.buttons}>
              <Button label={t('Annuler')} kind="text" onPress={() => setRead(null)} disabled={busy !== null} />
              <Button label={plan.creates.length + plan.updates.length > 0 ? t('Importer') : t('Fermer')} busy={busy !== null} onPress={() => (plan.creates.length + plan.updates.length > 0 ? later(confirm()) : setRead(null))} />
            </View>
          </Organic>
        ) : (
          <>
            <Organic outline="card" style={styles.panel}>
              <AppText variant="title">{t('Depuis Google Contacts')}</AppText>
              {GOOGLE_STEPS.map((step, index) => (
                <View key={step} style={styles.step}>
                  <AppText variant="bodyStrong" color={theme.color.action}>
                    {`${index + 1}.`}
                  </AppText>
                  <AppText variant="body" style={styles.fill}>
                    {t(step)}
                  </AppText>
                </View>
              ))}
              <FormMessage message={problem?.from === 'file' ? problem.message : null} />
              <Button label={t('Choisir un fichier')} icon="file" onPress={() => later(fromFile())} disabled={busy !== null} />
            </Organic>
            <Organic outline="card" style={styles.panel}>
              <AppText variant="title">{t('Depuis ce téléphone')}</AppText>
              <AppText variant="body">{t('Les contacts enregistrés sur ce téléphone, dont ceux de votre compte Google, avec leurs photos et leurs groupes.')}</AppText>
              <FormMessage message={problem?.from === 'phone' ? problem.message : null} />
              {problem?.from === 'phone' && problem.blocked ? <Button label={t('Ouvrir les réglages d’Android')} icon="settings" kind="text" onPress={openAppSettings} style={styles.start} /> : null}
              <Button label={t('Lire les contacts du téléphone')} icon="phone" kind="tonal" onPress={() => later(fromPhone())} disabled={busy !== null} />
            </Organic>
          </>
        )}
        {busy ? (
          <AppText variant="meta" style={styles.busy} accessibilityLiveRegion="polite">
            {busy}
          </AppText>
        ) : null}
      </EdgeScrollView>
    </View>
  );
}

function Fact({ icon, text }: { icon: 'personPlus' | 'person' | 'check' | 'tag' | 'image'; text: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.fact}>
      <View style={styles.factIcon}>
        <Icon name={icon} size={20} color={theme.color.inkMuted} />
      </View>
      <AppText variant="body" style={styles.fill}>
        {text}
      </AppText>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { padding: 12, paddingBottom: 48, gap: 16 },
    panel: { gap: 12, padding: 18, backgroundColor: theme.color.paper },
    step: { flexDirection: 'row', gap: 10 },
    fill: { flex: 1 },
    facts: { gap: 8 },
    // The glyph on the first line of its words, which may wrap.
    fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    factIcon: { height: 23, justifyContent: 'center' },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    busy: { textAlign: 'center' },
    start: { alignSelf: 'flex-start' },
  });
