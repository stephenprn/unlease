/**
 * The wallet's one authored moment: a locked place shows the shapes of what it holds (cards in
 * their washes, papers on paper), fading down the screen, and the lock above them. Where this phone keeps the papers behind the fingerprint, it is asked at
 * once; else the passphrase (or, lost, the recovery code). Opened, they clear (250 decelerate;
 * Reduce Motion: cut).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeOut, useReducedMotion } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';
import { showSnack } from '@shared/app/store/uiStore';
import { AppText, Button, Icon, Organic, TextField } from '@shared/ui/components';
import { decelerate, duration } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { unlockWithFingerprint, unlockWithPassphrase, unlockWithRecovery, useVaultStore } from '@app/store/vault';

import { TILE_RATIO } from '../Tiles';
import { PassphraseSheet } from './PassphraseSheet';

/** What a locked place holds. */
export type LockedSubject = 'cards' | 'papers' | 'documents' | 'paper';

const WASHES: readonly LineColor[] = ['sky', 'orange', 'green', 'lilac', 'yellow', 'pink'];

function words(subject: LockedSubject, fingerprint: boolean): string {
  if (subject === 'cards') return t('Your cards open with the vault’s passphrase, once on this phone.');
  if (fingerprint) {
    if (subject === 'papers') return t('Your identity papers open with your fingerprint or the passphrase.');
    if (subject === 'documents') return t('Your documents open with your fingerprint or the passphrase.');
    return t('This paper opens with your fingerprint or the passphrase.');
  }
  if (subject === 'papers') return t('Your identity papers open with the vault’s passphrase.');
  if (subject === 'documents') return t('Your documents open with the vault’s passphrase.');
  return t('This paper opens with the vault’s passphrase.');
}

export function LockPanel({ subject }: { subject: LockedSubject }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const still = useReducedMotion();
  const fingerprint = useVaultStore(s => s.fingerprint);
  const [mode, setMode] = useState<'passphrase' | 'recovery'>('passphrase');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renew, setRenew] = useState(false);
  const asked = useRef(false);
  const cards = subject === 'cards';

  const byFingerprint = useCallback(async (): Promise<void> => {
    const outcome = await unlockWithFingerprint();
    if (outcome === 'invalidated') showSnack(t('A new fingerprint was added to this phone: unlock with the passphrase once.'), undefined, { tone: 'warning' });
  }, []);

  // Coming to a locked place: the fingerprint at once, where it is kept. Only with the app in front:
  // the papers lock as it leaves the screen, and this panel, drawn again then, would raise Android's
  // prompt over the app the person went to. It asks once the app is back instead.
  useFocusEffect(
    useCallback(() => {
      if (!fingerprint || cards) return undefined;
      const ask = (): void => {
        if (asked.current || AppState.currentState !== 'active') return;
        asked.current = true;
        void byFingerprint();
      };
      ask();
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'active') ask();
        else asked.current = false;
      });
      return () => {
        subscription.remove();
        asked.current = false;
      };
    }, [fingerprint, cards, byFingerprint]),
  );
  useEffect(() => setError(null), [typed]);

  const open = async (): Promise<void> => {
    if (!typed.trim()) {
      setError(mode === 'passphrase' ? t('Type the vault’s passphrase.') : t('Type the code from your recovery kit.'));
      return;
    }
    setBusy(true);
    try {
      const ok = mode === 'passphrase' ? await unlockWithPassphrase(typed) : await unlockWithRecovery(typed);
      if (!ok) {
        setError(mode === 'passphrase' ? t('This passphrase doesn’t open the vault.') : t('This code doesn’t open the vault.'));
        return;
      }
      setTyped('');
      if (mode === 'recovery') setRenew(true);
    } finally {
      setBusy(false);
    }
  };

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
            <AppText variant="meta">{words(subject, fingerprint)}</AppText>
          </View>
        </View>
        {fingerprint && !cards && mode === 'passphrase' ? <Button icon="fingerprint" label={t('Unlock with your fingerprint')} onPress={() => void byFingerprint()} /> : null}
        <TextField
          label={mode === 'passphrase' ? t('Passphrase') : t('Recovery code')}
          value={typed}
          onChangeText={setTyped}
          secureTextEntry={mode === 'passphrase'}
          autoCapitalize={mode === 'recovery' ? 'characters' : 'none'}
          autoCorrect={false}
          error={error}
          returnKeyType="go"
          onSubmitEditing={() => void open()}
        />
        <View style={styles.actions}>
          <Button
            kind="text"
            small
            label={mode === 'passphrase' ? t('Passphrase forgotten?') : t('Use the passphrase')}
            onPress={() => {
              setMode(mode === 'passphrase' ? 'recovery' : 'passphrase');
              setTyped('');
            }}
          />
          <Button kind={fingerprint && !cards ? 'tonal' : 'filled'} icon="unlock" label={t('Unlock')} busy={busy} onPress={() => void open()} />
        </View>
      </Organic>
      {/* What waits behind the lock: its shapes (tiles; the documents' rows), fading down the screen. */}
      <View style={styles.ghosts} importantForAccessibility="no-hide-descendants" pointerEvents="none">
        {subject === 'documents'
          ? [0.5, 0.36, 0.24, 0.12].map(opacity => (
              <Organic key={opacity} outline="card" style={[styles.ghostRow, styles.ghostDocument, { opacity, backgroundColor: theme.color.paper }]}>
                <Organic pebble={2} style={[styles.ghostStone, { backgroundColor: theme.color.paperHigh }]} />
                <View style={styles.ghostWords}>
                  <View style={[styles.ghostBand, { width: '52%', backgroundColor: theme.color.paperHigh }]} />
                  <View style={[styles.ghostLine, { width: '34%', backgroundColor: theme.color.hairline }]} />
                </View>
              </Organic>
            ))
          : [0.5, 0.28, 0.12].map((opacity, row) => (
              <View key={row} style={[styles.ghostRow, { opacity }]}>
                {[0, 1].map(column => (
                  <Organic key={column} outline="card" style={[styles.ghost, { backgroundColor: cards ? theme.line[WASHES[(row * 2 + column) % WASHES.length]!].tint : theme.color.paper }]}>
                    <View style={[styles.ghostBand, { backgroundColor: cards ? theme.line[WASHES[(row * 2 + column) % WASHES.length]!].fill : theme.color.paperHigh }]} />
                    <View style={[styles.ghostLine, { backgroundColor: theme.color.hairline }]} />
                  </Organic>
                ))}
              </View>
            ))}
      </View>
      <PassphraseSheet visible={renew} reason={t('You opened the vault with your recovery kit: choose a new passphrase for every device.')} onDismiss={() => setRenew(false)} />
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
    ghostRow: { flexDirection: 'row', gap: 12 },
    ghost: { flex: 1, aspectRatio: TILE_RATIO, padding: 14, justifyContent: 'space-between' },
    ghostBand: { width: '34%', height: 14, borderRadius: 4 },
    ghostLine: { width: '46%', height: 6, borderRadius: 3 },
    ghostDocument: { height: 72, alignItems: 'center', paddingHorizontal: 14, gap: 14 },
    ghostStone: { width: 44, height: 40 },
    ghostWords: { flex: 1, gap: 8 },
  });
}
