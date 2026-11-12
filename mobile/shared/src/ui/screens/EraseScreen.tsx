/**
 * « Effacer des données » on the phone (the web's `EraseScreen`; `core/services/erase`), each app's
 * screen from Réglages › Données: the app's parts, each ticked with how many things it holds (all of
 * them at first: the person unticks what they keep), a backup to S3 first when the server has one,
 * then the server's token typed again and the word typed in capitals; the danger button, pinned at the
 * foot over the keyboard, counts what goes. Pressed with a problem, it says it under its field; the
 * server refusing the token says it under the token. Then what waits here is sent, the backup runs and
 * must succeed, the tombstones go in one batch, and the app opens on its home with a slip.
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APPS, type AppId } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { formatMoment } from '@unlease/core/services/admin';
import {
  ERASE_PROGRESS,
  eraseAction,
  eraseBackupWords,
  eraseDefaults,
  eraseLead,
  erasedMessage,
  erasePartsProblem,
  eraseTokenProblem,
  eraseTotal,
  eraseWord,
  eraseWordProblem,
  type ErasePart,
  type EraseProgress,
} from '@unlease/core/services/erase';
import { connectFailureField, setupFieldHelp } from '@unlease/core/services/setup';
import type { AdminStatus } from '@unlease/core/sync/admin';
import type { GlyphName } from '@unlease/design/glyphs';

import { useAdmin } from '../../app/hooks/useAdmin';
import { useMinute } from '../../app/hooks/useMinute';
import { selectServer, useSettingsStore, type ServerConfig } from '../../app/store/settingsStore';
import { showSnack } from '../../app/store/uiStore';
import { flushNow, pullNow, requestSync } from '../../app/sync/syncManager';
import { checkServer, fetchAdminStatus, startBackup, SyncError } from '../../app/sync/transport';
import { AppText, Button, EdgeScrollView, FormFoot, Ground, Icon, ListRow, TextField, TopBar, useForm } from '../components';
import { SwitchRow } from '../features/appearance/SwitchRow';
import { StatusRow } from '../features/admin/StatusRow';
import { Section } from '../features/settings/Section';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** How long a backup may take before the erase gives up waiting (a first one sends every photo). */
const BACKUP_WAIT_MS = 30 * 60_000;

/** A backup to S3 now, waited for: null once it succeeded, else why not (nothing is erased then). */
async function backupFirst(server: ServerConfig): Promise<string | null> {
  const asked = Date.now();
  let status: AdminStatus | null;
  try {
    status = await startBackup(server);
    while (status?.backup.running) {
      if (Date.now() - asked > BACKUP_WAIT_MS) return t('La sauvegarde prend trop de temps : rien n’a été effacé. Réessayez une fois finie.');
      await wait(2_000);
      status = (await fetchAdminStatus(server)) ?? status;
    }
  } catch (failure) {
    return t('La sauvegarde n’a pas pu démarrer : {problem}. Rien n’a été effacé.', { problem: failure instanceof Error ? t(failure.message) : t('Serveur injoignable') });
  }
  const last = status?.backup.last ?? null;
  if (last && last.ok && (last.finishedAt ?? 0) >= asked) return null;
  return t('La sauvegarde a échoué : {problem}. Rien n’a été effacé.', { problem: last?.error ? t(last.error) : t('raison inconnue') });
}

export interface EraseScreenProps {
  readonly app: AppId;
  /** The app's parts, counted from its records as they are now (`<app>/services/erase`). */
  readonly parts: readonly ErasePart[];
  /** Writes the tombstones of the parts chosen, as one batch; how many records went. */
  readonly run: (chosen: ReadonlySet<string>) => number;
  readonly onBack: () => void;
  /** Erased: the app's home. */
  readonly onDone: () => void;
}

export function EraseScreen({ app, parts, run, onBack, onDone }: EraseScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const server = useSettingsStore(selectServer);
  const admin = useAdmin(server, focused);
  const now = useMinute();
  const [ticked, setTicked] = useState<ReadonlySet<string> | null>(null);
  const chosen = ticked ?? eraseDefaults(parts);
  const [token, setToken] = useState('');
  const [word, setWord] = useState('');
  const [backup, setBackup] = useState(true);
  const [stage, setStage] = useState<EraseProgress | null>(null);
  const connected = server !== null;
  const configured = admin.settings?.backup.configured === true;
  const total = eraseTotal(parts, chosen);
  const form = useForm({ token: connected ? eraseTokenProblem(token) : null, word: eraseWordProblem(word) }, { order: ['token', 'word'] });

  const toggle = (id: string): void => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
  };

  const erase = async (): Promise<boolean> => {
    const problem = erasePartsProblem(parts, chosen);
    if (problem) {
      form.fail(null, problem);
      return false;
    }
    try {
      if (server) {
        setStage('checking');
        try {
          await checkServer({ url: server.url, token: token.trim() });
        } catch (failure) {
          const message = failure instanceof Error ? t(failure.message) : t('Serveur injoignable');
          if (failure instanceof SyncError && connectFailureField(failure.kind, failure.status) === 'token') form.fail('token', message);
          else form.fail(null, t('{problem} : rien n’a été effacé.', { problem: message }));
          return false;
        }
        // What waits here goes first, and what the server holds comes, so the tombstones cover everything.
        setStage('syncing');
        await flushNow();
        await pullNow();
        if (configured && backup) {
          setStage('backup');
          const failed = await backupFirst(server);
          if (failed) {
            form.fail(null, failed);
            return false;
          }
        }
      }
      setStage('erasing');
      const count = run(chosen);
      requestSync();
      showSnack(erasedMessage(count), undefined, { tone: 'success' });
      onDone();
      return true;
    } finally {
      setStage(null);
    }
  };

  const backupWords = eraseBackupWords(configured, admin.status?.backup.lastSuccessAt ?? null, at => formatMoment(at, now));

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <Ground />
      <TopBar title={t('Effacer des données')} onBack={onBack} />
      <EdgeScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="body" color={theme.color.inkMuted} style={styles.lead}>
          {eraseLead(APPS[app].name, connected)}
        </AppText>
        <Section title={t('Ce qui sera effacé')}>
          {parts.map(part => {
            const empty = part.count === 0;
            const on = !empty && chosen.has(part.id);
            return (
              <ListRow
                key={part.id}
                title={part.title}
                supporting={empty ? t('Rien à effacer') : part.detail}
                leading={<Icon name={on ? 'boxChecked' : 'box'} size={24} color={empty ? theme.color.inkFaint : theme.color.ink} />}
                trailing={<Icon name={part.glyph as GlyphName} size={22} color={theme.color.inkMuted} />}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: empty }}
                disabled={empty}
                onPress={() => !empty && toggle(part.id)}
              />
            );
          })}
        </Section>
        {connected ? (
          <Section title={t('Avant d’effacer')}>
            {configured ? <SwitchRow title={backupWords.title} supporting={backupWords.meta} value={backup} onChange={setBackup} /> : <StatusRow line={{ tone: 'waiting', title: backupWords.title, meta: backupWords.meta }} />}
          </Section>
        ) : null}
        <Section title={t('Confirmer')}>
          <View style={styles.fields}>
            {connected ? (
              <TextField
                label={t('Jeton du serveur')}
                kind="serverToken"
                value={token}
                onChangeText={setToken}
                field={form.field('token')}
                help={t('Le même que pour vous connecter. {where}', { where: setupFieldHelp('token') })}
                revealLabels={{ show: t('Afficher le jeton'), hide: t('Masquer le jeton') }}
              />
            ) : null}
            <TextField label={t('Pour confirmer, tapez {word}', { word: eraseWord() })} kind="confirmWord" value={word} onChangeText={setWord} field={form.field('word')} />
            {stage ? (
              <AppText variant="meta" accessibilityLiveRegion="polite">
                {t(ERASE_PROGRESS[stage])}
              </AppText>
            ) : null}
          </View>
        </Section>
      </EdgeScrollView>
      {/* Pinned over the keyboard, the screen's own room under it. */}
      <View style={{ paddingBottom: insets.bottom + 12 }}>
        <FormFoot message={form.message}>
          <Button kind="text" label={t('Annuler')} disabled={form.busy} onPress={onBack} />
          <Button kind="danger" icon="eraser" label={eraseAction(total)} busy={form.busy} onPress={() => void form.submit(erase)} />
        </FormFoot>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { padding: 12, paddingBottom: 32, gap: 20 },
    lead: { paddingHorizontal: 16 },
    fields: { gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
  });
