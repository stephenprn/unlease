/** Only for decisions that cannot be undone; anything undoable is a snackbar instead. */
import React, { memo, useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, Keyframe } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';

import { accelerate, decelerate, duration, standard } from '../theme/motion';
import { useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Grain } from './Grain';
import { AnimatedOrganic, Organic } from './Organic';
import { Tappable } from './Tappable';

/** The scrim dims, the card settles in from a touch smaller; it leaves faster than it came, both together. */
/** A confirmation's own outline. */
const OUTLINE = 'dialog';
const SCRIM_IN = FadeIn.duration(duration.medium).easing(standard);
const SCRIM_OUT = FadeOut.duration(duration.short).easing(standard);
const CARD_IN = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 0.94 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } }).duration(duration.medium);
const CARD_OUT = new Keyframe({ 0: { opacity: 1, transform: [{ scale: 1 }] }, 100: { opacity: 0, transform: [{ scale: 0.97 }], easing: accelerate } }).duration(duration.short);

export interface DialogProps {
  readonly visible: boolean;
  readonly title: string;
  readonly message?: string;
  /** Under the message: a choice the confirmation depends on. */
  readonly children?: React.ReactNode;
  readonly confirmLabel: string;
  readonly danger?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

function DialogComponent({ visible, title, message, children, confirmLabel, danger, onConfirm, onCancel }: DialogProps) {
  const styles = useThemedStyles(makeStyles);
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onCancel]);
  // The host stays, empty and untouchable (and unflattened, so what leaves keeps its place above the page), so the dialog's own exit can play.
  return (
    <View style={styles.host} pointerEvents="box-none" collapsable={false}>
      {visible ? (
        <Animated.View entering={SCRIM_IN} exiting={SCRIM_OUT} style={StyleSheet.absoluteFill}>
          <Tappable accessibilityLabel={t('Annuler')} onPress={onCancel} style={styles.scrim} noTint />
        </Animated.View>
      ) : null}
      {visible ? (
        <AnimatedOrganic entering={CARD_IN} exiting={CARD_OUT} outline={OUTLINE} style={styles.dialog} accessibilityViewIsModal>
          <Organic outline={OUTLINE} style={styles.paper} pointerEvents="none">
            <Grain />
          </Organic>
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
          {message ? (
            <AppText variant="body" color={styles.message.color}>
              {message}
            </AppText>
          ) : null}
          {children}
          <View style={styles.actions}>
            <Button kind="text" label={t('Annuler')} onPress={onCancel} />
            <Button kind={danger ? 'danger' : 'filled'} label={confirmLabel} onPress={onConfirm} />
          </View>
        </AnimatedOrganic>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    host: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
    scrim: { flex: 1, backgroundColor: theme.color.scrim },
    dialog: { width: '86%', maxWidth: 400, backgroundColor: theme.color.wall, borderWidth: 1, borderColor: theme.color.outline, padding: 24, gap: 16, boxShadow: theme.lift.float },
    paper: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
    message: { color: theme.color.inkMuted },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  });

export const Dialog = memo(DialogComponent);
