/**
 * A place behind the suite's lock (`@shared/app/lock`): Carnet's protected notes, a protected page.
 * The lock above, what it keeps as shapes only under it (a wall of cards, a page's lines), fading down
 * the screen, as Wallet's locked places. Where this phone keeps the fingerprint, it is asked at once;
 * else the password (or, forgotten, the server's token, which then asks a new password). Opened, the
 * panel clears (250 decelerate; Remove animations: cut) and the place's content takes its place.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeOut, useReducedMotion } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import { openLock, openWithFingerprint, tokenOpensReset, useFingerprintOn, useLockState } from '@shared/app/lock';
import { showSnack } from '@shared/app/store/uiStore';
import { AppText, Button, Icon, Organic, TextField } from '@shared/ui/components';
import { decelerate, duration } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

import { LockPasswordSheet } from './LockPasswordSheet';

/** What the lock keeps: notes (a wall of cards) or a page (its lines). */
export type LockedGhosts = 'notes' | 'page';

// Two columns of cards, each as tall as some content would make it (lines of text under a title).
const WALL: readonly (readonly number[])[] = [
  [3, 1, 2],
  [1, 3, 2],
];
const PAGE: readonly (readonly number[])[] = [
  [96, 100, 88, 54],
  [100, 92, 70],
  [98, 84, 100, 62],
];

export function LockPanel({ ghosts, what }: { ghosts: LockedGhosts; what: string }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const still = useReducedMotion();
  const fingerprint = useFingerprintOn();
  const { check } = useLockState();
  const [mode, setMode] = useState<'password' | 'token'>(check ? 'password' : 'token');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renew, setRenew] = useState(false);
  const asked = useRef(false);

  const byFingerprint = useCallback(async (): Promise<void> => {
    const outcome = await openWithFingerprint();
    if (outcome === 'invalidated') showSnack(t('A new fingerprint was added to this phone: unlock with the password once.'), undefined, { tone: 'warning' });
    else if (outcome === 'changed') showSnack(t('The password changed on another device: type it once here.'), undefined, { tone: 'warning' });
  }, []);

  // Coming to a locked place: the fingerprint at once, where it is kept.
  useFocusEffect(
    useCallback(() => {
      if (fingerprint && check && !asked.current) {
        asked.current = true;
        void byFingerprint();
      }
      return () => {
        asked.current = false;
      };
    }, [fingerprint, check, byFingerprint]),
  );
  useEffect(() => setError(null), [typed]);

  const open = async (): Promise<void> => {
    if (!typed.trim()) {
      setError(mode === 'password' ? t('Type the password.') : t('Type the server’s token.'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'password') {
        if (!(await openLock(typed))) {
          setError(t('This password doesn’t open the lock.'));
          return;
        }
        setTyped('');
        return;
      }
      if (!tokenOpensReset(typed)) {
        setError(t('This isn’t this server’s token.'));
        return;
      }
      setTyped('');
      setRenew(true);
    } finally {
      setBusy(false);
    }
  };

  const withFingerprint = fingerprint && !!check && mode === 'password';
  return (
    <Animated.View exiting={still ? undefined : FadeOut.duration(duration.medium).easing(decelerate)} style={styles.place}>
      <Organic outline="panel" style={styles.panel}>
        <View style={styles.head}>
          <Organic pebble={1} style={[styles.pebble, { backgroundColor: theme.color.actionContainer }]}>
            <Icon name="lock" solid size={24} color={theme.color.onActionContainer} />
          </Organic>
          <View style={styles.headWords}>
            <AppText variant="title" accessibilityRole="header">
              {t('Locked')}
            </AppText>
            <AppText variant="meta">{mode === 'password' ? what : t('Type the server’s token (UNLEASE_TOKEN) to choose a new password.')}</AppText>
          </View>
        </View>
        {withFingerprint ? <Button icon="fingerprint" label={t('Unlock with your fingerprint')} onPress={() => void byFingerprint()} /> : null}
        <TextField
          label={mode === 'password' ? t('Password') : t('Server’s token')}
          kind="secret"
          revealLabels={mode === 'password' ? { show: t('Show the password'), hide: t('Hide the password') } : { show: t('Show the token'), hide: t('Hide the token') }}
          value={typed}
          onChangeText={setTyped}
          error={error}
          returnKeyType="go"
          onSubmitEditing={() => void open()}
        />
        <View style={styles.actions}>
          {check ? (
            <Button
              kind="text"
              small
              label={mode === 'password' ? t('Password forgotten?') : t('Use the password')}
              onPress={() => {
                setMode(mode === 'password' ? 'token' : 'password');
                setTyped('');
              }}
            />
          ) : (
            <View />
          )}
          <Button kind={withFingerprint ? 'tonal' : 'filled'} icon={mode === 'password' ? 'unlock' : 'key'} label={mode === 'password' ? t('Unlock') : t('Continue')} busy={busy} onPress={() => void open()} />
        </View>
      </Organic>
      {/* What waits behind the lock: its shapes, fading down the screen. */}
      <View style={styles.ghosts} importantForAccessibility="no-hide-descendants" pointerEvents="none">
        {ghosts === 'page'
          ? PAGE.map((lines, paragraph) => (
              <View key={paragraph} style={[styles.paragraph, { opacity: 0.5 - paragraph * 0.16 }]}>
                {paragraph === 0 ? <View style={[styles.ghostHeading, { backgroundColor: theme.color.hairline }]} /> : null}
                {lines.map((width, line) => (
                  <View key={line} style={[styles.ghostLine, styles.pageLine, { width: `${width}%`, backgroundColor: theme.color.hairline }]} />
                ))}
              </View>
            ))
          : (
            <View style={styles.wall}>
              {WALL.map((column, index) => (
                <View key={index} style={styles.column}>
                  {column.map((lines, card) => (
                    <Organic key={card} outline="card" style={[styles.ghost, { opacity: 0.5 - card * 0.17, backgroundColor: theme.color.paper }]}>
                      <View style={[styles.ghostBand, { width: `${48 + ((index + card) % 3) * 14}%`, backgroundColor: theme.color.paperHigh }]} />
                      {Array.from({ length: lines }, (_, line) => (
                        <View key={line} style={[styles.ghostLine, { width: line === lines - 1 ? '52%' : '86%', backgroundColor: theme.color.hairline }]} />
                      ))}
                    </Organic>
                  ))}
                </View>
              ))}
            </View>
          )}
      </View>
      <LockPasswordSheet
        visible={renew}
        reason={t('Choose the new password: every device asks it from now on.')}
        trusted
        onDismiss={() => {
          setRenew(false);
          setMode('password');
        }}
      />
    </Animated.View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    place: { paddingHorizontal: 12, paddingTop: 4, gap: 14 },
    panel: { padding: 20, gap: 14, backgroundColor: theme.color.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.color.hairline },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headWords: { flex: 1, gap: 2 },
    pebble: { width: 52, height: 48, alignItems: 'center', justifyContent: 'center' },
    actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    ghosts: { gap: 12 },
    wall: { flexDirection: 'row', gap: 12 },
    column: { flex: 1, gap: 12 },
    ghost: { padding: 14, gap: 9 },
    ghostBand: { height: 12, borderRadius: 4, marginBottom: 2 },
    ghostLine: { height: 6, borderRadius: 3 },
    paragraph: { gap: 9, paddingHorizontal: 8, paddingBottom: 10 },
    ghostHeading: { width: '46%', height: 18, borderRadius: 4, marginBottom: 6 },
    pageLine: { height: 8 },
  });
}
