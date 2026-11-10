/**
 * Administration, the suite's own app, every phone app's (the web's `/admin`). Its home lists its
 * sections, each with its state in one line: first those every app shares (which apps the server
 * runs, the server itself, Claude's key, model and budget, the backup to S3, the files on Seafile),
 * then the app's own under its name (`appSections`: Carnet's Seerr, Pages' questions). Each section
 * is a screen of its own (the `Admin` screen with its `section`), its « how it works » first; one
 * that needs a server says so until one is connected.
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { t } from '@unlease/core/i18n';
import { APPS, type AppId } from '@unlease/core/apps';
import { appsLine, backupLine, claudeLine, driveLine, formatMoment, serverLine, SHARED_ADMIN_SECTIONS, SHARED_ADMIN_TITLES, type SharedAdminSection, type StatusLine } from '@unlease/core/services/admin';
import type { ServerSettings } from '@unlease/core/sync/settings';
import type { GlyphName } from '@unlease/design/glyphs';
import { serverEmpty } from '@unlease/core/services/setup';
import { formatBytes } from '@unlease/core/services/format';
import type { BackupSnapshot, RestoreMode } from '@unlease/core/sync/admin';
import { useAdmin, useBackups, type AdminState } from '@shared/app/hooks/useAdmin';
import { useMinute } from '@shared/app/hooks/useMinute';
import { selectServer, useSettingsStore, type ServerConfig } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { requestDownload, restoreFile, restoreSnapshot } from '@shared/app/sync/transport';
import { removePath } from '@shared/platform/media';

import { AppText, Dialog, Ground, Icon, ListRow, Organic, Sheet, Tappable, TopBar } from '../components';
import { APPS_INFO, AppsSection } from '../features/admin/AppsSection';
import { BACKUP_INFO, BackupSection } from '../features/admin/BackupSection';
import { ClaudeSection, type ClaudeExtra } from '../features/admin/ClaudeSection';
import { DRIVE_INFO, DriveSection } from '../features/admin/DriveSection';
import type { AdminOverlays, Confirmation, RestoreTarget } from '../features/admin/overlays';
import { RestoreDialog } from '../features/admin/RestoreDialog';
import { SERVER_INFO, ServerSection } from '../features/admin/ServerSection';
import { toneColor } from '../features/admin/StatusRow';
import { Section } from '../features/settings/Section';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { corners } from '../theme/shape';
import { SHAPES } from '@unlease/design/shapes';
import { withAlpha } from '@unlease/design/color';
import { GEOMETRY } from '@unlease/design/palette';

/** What an app's own sections are drawn with. */
export interface AdminContext {
  readonly server: ServerConfig;
  readonly admin: AdminState;
  readonly overlays: AdminOverlays;
  /** The row shown while the server's settings are not read. */
  readonly unavailable: React.ReactElement;
}

/** A section of the Administration, the app's own: a row of the home under the app's name, and a screen of its own. */
export interface AppAdminSection {
  /** Its address (the `Admin` screen's `section`, the web's `/admin/<id>`): never renamed. */
  readonly id: string;
  /** Its title, read where shown. */
  readonly title: () => string;
  readonly icon: GlyphName;
  /** « How it works », French (`tx`). */
  readonly info?: string;
  /** Its state in one line, on the home. */
  readonly line: (settings: ServerSettings) => StatusLine;
  /** What its sheet holds, once the server's settings are read. */
  readonly render: (context: AdminContext) => React.ReactNode;
  /** What the app asks of Claude (Pages' questions): the setup shows it under Claude's key (the web's `claude`). */
  readonly claude?: boolean;
}

export interface AdminScreenProps {
  /** The app this phone is. */
  readonly app: AppId;
  /** The section shown; null: the home. */
  readonly section: string | null;
  readonly onBack: () => void;
  /** A section's screen, from the home or from a section that sends there (« Relier un serveur »). */
  readonly onOpen: (section: string) => void;
  /** The app's part of the Claude section. */
  readonly claudeExtra?: ClaudeExtra;
  /** The app's own sections, after the shared ones. */
  readonly appSections?: readonly AppAdminSection[];
}

const SHARED_ICONS: Record<SharedAdminSection, GlyphName> = { apps: 'apps', server: 'server', reading: 'sparkle', backup: 'cloud', drive: 'file' };

const SHARED_INFO: Partial<Record<SharedAdminSection, string>> = { apps: APPS_INFO, server: SERVER_INFO, backup: BACKUP_INFO, drive: DRIVE_INFO };

/** A section as the home lists it and its screen heads it. */
interface Place {
  readonly id: string;
  readonly title: string;
  readonly icon: GlyphName;
  readonly info?: string;
  /** Every section but the server's own needs one connected. */
  readonly needsServer: boolean;
  readonly line: StatusLine | null;
  readonly own?: AppAdminSection;
}

export function AdminScreen({ app, section, onBack, onOpen, claudeExtra, appSections = [] }: AdminScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const server = useSettingsStore(selectServer);
  const focused = useIsFocused();
  const now = useMinute();
  const admin = useAdmin(server, focused);
  const backups = useBackups(server, admin.settings?.backup.configured === true && section === 'backup', admin.backupsVersion, focused);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  // Kept after the sheet closes, so it plays its exit with what it showed.
  const [snapshot, setSnapshot] = useState<BackupSnapshot | null>(null);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [restoring, setRestoring] = useState<RestoreTarget | null>(null);
  // A restore asked and not answered yet (a picked archive takes a while to send): the backup section says so.
  const [sending, setSending] = useState<RestoreTarget['kind'] | null>(null);
  const restoreBusy = sending !== null || admin.status?.restore.running === true;

  const overlays: AdminOverlays = {
    ask: setConfirmation,
    openSnapshot: chosen => {
      setSnapshot(chosen);
      setSnapshotOpen(true);
    },
    restore: setRestoring,
  };

  /** A picked archive lives in the cache only until it is sent or the restore is dropped. */
  const dropPicked = (target: RestoreTarget | null) => {
    if (target?.kind === 'file') removePath(target.path);
  };

  const restore = async (target: RestoreTarget, mode: RestoreMode) => {
    if (!server) return;
    setSending(target.kind);
    try {
      admin.setStatus(target.kind === 'snapshot' ? await restoreSnapshot(server, target.name, mode) : await restoreFile(server, target.path, target.name, mode));
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Restauration refusée'), undefined, { tone: 'error' });
    } finally {
      setSending(null);
      dropPicked(target);
    }
  };

  const download = async (name: string) => {
    if (!server) return;
    try {
      const ticket = await requestDownload(server, { snapshot: name });
      await Linking.openURL(ticket.url);
    } catch (failure) {
      showSnack(failure instanceof Error ? t(failure.message) : t('Téléchargement refusé'), undefined, { tone: 'error' });
    }
  };

  const unavailable = <ListRow icon="info" title={t('Réglages du serveur indisponibles')} supporting={admin.unavailable ? t('Le serveur ne répond pas pour l’instant.') : t('Lecture des réglages du serveur…')} onPress={admin.reload} />;
  const empty = serverEmpty(admin.status);
  const settings = server ? admin.settings : null;

  const sharedLine = (id: SharedAdminSection): StatusLine | null => {
    switch (id) {
      // Nothing is said of the apps or of Claude before the settings are read (never « Aucune clé » while they load).
      case 'apps':
        return server && settings ? appsLine(settings) : null;
      case 'server':
        return serverLine(server?.url ?? null, admin.status, admin.unavailable);
      case 'reading':
        return server && settings ? claudeLine(settings.analysis) : null;
      case 'backup':
        return settings ? backupLine(settings.backup, admin.status?.backup ?? null, now) : null;
      case 'drive':
        return settings ? driveLine(settings.drive, admin.status?.drive ?? null, now) : null;
    }
  };
  const shared: Place[] = SHARED_ADMIN_SECTIONS.map(id => ({ id, title: SHARED_ADMIN_TITLES[id], icon: SHARED_ICONS[id], info: SHARED_INFO[id], needsServer: id !== 'server', line: sharedLine(id) }));
  const own: Place[] = appSections.map(each => ({ id: each.id, title: each.title(), icon: each.icon, info: each.info, needsServer: true, line: settings ? each.line(settings) : null, own: each }));
  const place = section ? [...shared, ...own].find(each => each.id === section) ?? null : null;

  // As on the web: its glyph (22) on a tile of the primary's wash, its title in body strong over its state (the dot leading it), a chevron.
  const row = (each: Place) => {
    const state =
      each.needsServer && !server
        ? t('Reliez d’abord un serveur')
        : each.line
          ? [each.line.title, each.line.meta].filter(Boolean).join(' · ')
          : admin.unavailable
            ? t('Le serveur ne répond pas pour l’instant.')
            : t('Lecture des réglages du serveur…');
    return (
      <Tappable key={each.id} onPress={() => onOpen(each.id)} accessibilityRole="button" accessibilityLabel={each.title} accessibilityValue={{ text: state }} style={styles.row}>
        <Organic style={styles.glyph}>
          <Icon name={each.icon} size={22} color={theme.color.ink} />
        </Organic>
        <View style={styles.rowText}>
          <AppText variant="bodyStrong">{each.title}</AppText>
          <View style={styles.state}>
            <View style={[styles.dot, { backgroundColor: toneColor(theme, each.line?.tone ?? 'off') }]} />
            <AppText variant="meta" numberOfLines={1} style={styles.stateText}>
              {state}
            </AppText>
          </View>
        </View>
        <Icon name="chevronRight" size={20} color={theme.color.inkMuted} />
      </Tappable>
    );
  };

  const sectionBody = (shown: Place): React.ReactNode => {
    if (shown.id === 'server') return <ServerSection status={admin.status} ask={overlays.ask} />;
    if (!server) return <ListRow icon="server" title={t('Relier un serveur')} supporting={t('Reliez d’abord un serveur : ce réglage est le sien, pour tous vos appareils.')} onPress={() => onOpen('server')} />;
    if (shown.own) return admin.settings ? shown.own.render({ server, admin, overlays, unavailable }) : unavailable;
    switch (shown.id) {
      case 'apps':
        return admin.settings ? <AppsSection server={server} admin={admin} own={app} overlays={overlays} /> : unavailable;
      case 'reading':
        return <ClaudeSection server={server} ask={overlays.ask} extra={claudeExtra} />;
      case 'backup':
        return admin.settings ? <BackupSection server={server} admin={admin} backups={backups} overlays={overlays} now={now} sending={sending} /> : unavailable;
      case 'drive':
        return admin.settings ? <DriveSection server={server} admin={admin} overlays={overlays} now={now} /> : unavailable;
      default:
        return null;
    }
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={place ? place.title : t('Administration')} onBack={onBack} />
      {/* The app is edge to edge: without this the lower fields (Seafile, Seerr) stay under the keyboard. */}
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {place ? (
          <>
            {place.info ? (
              <AppText variant="body" color={theme.color.inkMuted} style={styles.lead}>
                {t(place.info)}
              </AppText>
            ) : null}
            <Section>{sectionBody(place)}</Section>
          </>
        ) : (
          <>
            <AppText variant="body" color={theme.color.inkMuted} style={styles.lead}>
              {t('Ce que votre serveur fait pour toutes vos applications et tous vos appareils.')}
            </AppText>
            {/* Named only beside the app's own: alone, the lead above already says they serve every app. */}
            <Section title={own.length > 0 ? t('Pour toutes les applications') : undefined}>{shared.map(row)}</Section>
            {own.length > 0 ? <Section title={APPS[app].name}>{own.map(row)}</Section> : null}
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={snapshotOpen} onDismiss={() => setSnapshotOpen(false)} title={snapshot ? t('Sauvegarde du {moment}', { moment: formatMoment(snapshot.at, now) }) : undefined}>
        <ListRow
          icon="download"
          title={t('Télécharger')}
          supporting={snapshot ? formatBytes(snapshot.bytes) : undefined}
          onPress={() => {
            setSnapshotOpen(false);
            if (snapshot) download(snapshot.name);
          }}
        />
        <ListRow
          icon="restore"
          title={t('Restaurer')}
          supporting={restoreBusy ? t('Restauration en cours…') : undefined}
          onPress={
            restoreBusy
              ? undefined
              : () => {
                  setSnapshotOpen(false);
                  if (snapshot) setRestoring({ kind: 'snapshot', name: snapshot.name });
                }
          }
        />
      </Sheet>

      <RestoreDialog
        visible={restoring !== null}
        empty={empty}
        onCancel={() => {
          dropPicked(restoring);
          setRestoring(null);
        }}
        onConfirm={mode => {
          const target = restoring;
          setRestoring(null);
          if (target) restore(target, mode);
        }}
      />

      <Dialog
        visible={confirmation !== null}
        title={confirmation?.title ?? ''}
        message={confirmation?.message}
        confirmLabel={confirmation?.confirmLabel ?? ''}
        danger={confirmation?.danger}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          const run = confirmation?.run;
          setConfirmation(null);
          run?.();
        }}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    fill: { flex: 1 },
    content: { padding: 12, paddingBottom: 48, gap: 20 },
    // In line with what the sheets hold (16 in from their edge).
    lead: { paddingHorizontal: 16 },
    // A list row's inset and press cut (the web's `.row`).
    row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 6, marginVertical: GEOMETRY.rowGap / 2, paddingHorizontal: 10, paddingVertical: 8, ...corners(SHAPES.tab) },
    glyph: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(theme.color.leaf, 0.14), ...corners(SHAPES.small) },
    rowText: { flex: 1, gap: 2 },
    state: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stateText: { flex: 1, color: theme.color.inkMuted },
    dot: { width: 8, height: 8, ...corners(SHAPES.dot) },
  });
