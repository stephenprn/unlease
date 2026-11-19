/**
 * Only for decisions that cannot be undone, and for Material's own dialogs (a time picked on its
 * dial); anything undoable is a snackbar instead. A dialog that
 * holds a field (a password asked before confirming) stands centred in what the keyboard leaves of
 * the screen, its buttons above it: the app draws under the keyboard (edge to edge), nothing resizes.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
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
import { OverlayFocus, useKeyboardTop, useOverlayKeyboard } from './useKeyboardVisible';
import { useModalLayer } from './useModalLayer';

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
  /** « Annuler » unless the choice reads better named (« Continuer à modifier »); null for a dialog that only tells (one « OK »: the confirm; the scrim and Back cancel it). */
  readonly cancelLabel?: string | null;
  readonly danger?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** At the start of the actions' row, apart from them (Material's time picker: the keyboard's button). */
  readonly lead?: React.ReactNode;
}

function DialogComponent({ visible, title, message, children, confirmLabel, cancelLabel, danger, onConfirm, onCancel, lead }: DialogProps) {
  const styles = useThemedStyles(makeStyles);
  // Opened while a field held the keyboard: the field steps aside, unless one of its own takes it.
  const overlay = useOverlayKeyboard(visible);
  // Open, it is all TalkBack reaches (with the slip).
  const layer = useModalLayer(visible);
  // Where the host ends in the window: the keyboard's overlap with it is the room kept under the card.
  const heard = useKeyboardTop();
  const keyboardTop = overlay.aside ? null : heard;
  const [hostBottom, setHostBottom] = useState<number | null>(null);
  const host = useRef<React.ComponentRef<typeof View> | null>(null);
  const measure = useCallback(() => host.current?.measureInWindow((_x, y, _width, height) => setHostBottom(y + height)), []);
  const lift = keyboardTop !== null && hostBottom !== null ? Math.max(0, hostBottom - keyboardTop) : 0;
  const attach = useCallback(
    (node: React.ComponentRef<typeof View> | null) => {
      host.current = node;
      (layer as React.RefObject<React.ComponentRef<typeof View> | null>).current = node;
    },
    [layer],
  );
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
    <View ref={attach} onLayout={measure} style={[styles.host, lift > 0 ? { paddingBottom: lift } : null]} pointerEvents="box-none" collapsable={false}>
      {visible ? (
        <Animated.View entering={SCRIM_IN} exiting={SCRIM_OUT} style={StyleSheet.absoluteFill}>
          <Tappable accessibilityLabel={t('Cancel')} onPress={onCancel} style={styles.scrim} noTint />
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
          <OverlayFocus.Provider value={overlay.focus}>{children}</OverlayFocus.Provider>
          <View style={styles.actions}>
            {lead ? <View style={styles.lead}>{lead}</View> : null}
            {cancelLabel === null ? null : <Button kind="text" label={cancelLabel ?? t('Cancel')} onPress={onCancel} />}
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
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
    lead: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  });

export const Dialog = memo(DialogComponent);
