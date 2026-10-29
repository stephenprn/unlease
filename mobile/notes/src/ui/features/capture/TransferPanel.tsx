/**
 * The snip, the app's one authored moment: while the server reads a shared link, scissors work
 * along a dashed cut line from "Non classé"; once filed, the cut runs through in the
 * collection's pigment and its emblem lands with a small bounce.
 */
import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Keyframe,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { displayHost, prettyUrl } from '@unlease/core/services/url';
import { formatPrice, plural } from '@unlease/core/services/format';
import { asLineColor } from '@unlease/design/colors';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';
import { moveLink } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectServer, useSettingsStore } from '@app/store/settingsStore';
import { endTransfer, selectTransfers, showSnack, useUiStore } from '@app/store/uiStore';

import { AnimatedOrganic, AppText, Emblem, Grain, Icon, IconButton, Organic, Tappable } from '../../components';
import { accelerate, decelerate, duration, land, standard } from '../../theme/motion';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { MoveSheet } from '../lines/MoveSheet';
import { navigate } from '../../navigation/navigationRef';

/** The slip rises into place from below the bar it sits over, and sinks away faster. */
const SLIP_IN = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 48 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.long);
const SLIP_OUT = new Keyframe({ 0: { opacity: 1, transform: [{ translateY: 0 }] }, 100: { opacity: 0, transform: [{ translateY: 24 }], easing: accelerate } }).duration(duration.exit);

/** The slip's two actions: habits-garden chips, never the same shape side by side. */
const CHIP = corners(SHAPES.chip);

const TRACK = 168;
const MARK = 32;
const SCISSORS = 22;
const DASHES = 12;

export function TransferPanel() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const transfers = useUiStore(selectTransfers);
  const current = transfers[transfers.length - 1];
  // « Changer »: the sheet is the screen's, never squeezed into the slip's small host; the slip waits while it is open.
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const movingLine = useLibraryStore(s => (movingId ? s.links[movingId]?.noteId : undefined));
  // The host stays, so the slip's own exit can play when the last transfer ends.
  return (
    <>
      <View pointerEvents="box-none" collapsable={false} style={[styles.host, { bottom: insets.bottom + 92 }]}>
        {current ? (
          <Transfer
            key={current.linkId}
            linkId={current.linkId}
            cleaned={current.cleaned}
            queued={transfers.length - 1}
            paused={moveOpen && movingId === current.linkId}
            onMove={() => {
              setMovingId(current.linkId);
              setMoveOpen(true);
            }}
          />
        ) : null}
      </View>
      <MoveSheet
        visible={moveOpen && movingLine !== undefined}
        currentLineId={movingLine ?? INBOX_ID}
        onDismiss={() => setMoveOpen(false)}
        onPick={target => {
          if (!movingId) return;
          moveLink(movingId, target);
          endTransfer(movingId);
          const moved = useLibraryStore.getState().notes[target];
          showSnack(t('Déplacé dans {collection}', { collection: moved ? shownTitle(moved) : '' }), undefined, { tone: 'success' });
        }}
      />
    </>
  );
}

const Transfer = memo(function TransferView({ linkId, cleaned, queued, paused, onMove }: { linkId: string; cleaned: number; queued: number; paused: boolean; onMove: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const reduced = useReducedMotion();
  const server = useSettingsStore(selectServer);
  const link = useLibraryStore(s => s.links[linkId]);
  const line = useLibraryStore(s => (link ? s.notes[link.noteId] : undefined));
  const inbox = useLibraryStore(s => s.notes[INBOX_ID]);
  const cut = useSharedValue(0);
  const snip = useSharedValue(0);
  const landed = useSharedValue(0);

  // Reading and filing land in one change: "not pending" means the destination is known.
  const settled = !!link && link.status !== 'pending';
  const filed = settled && link!.noteId !== INBOX_ID;

  useEffect(() => {
    if (reduced) {
      cut.value = settled ? (filed ? 1 : 0) : 0.5;
      landed.value = filed ? 1 : 0;
      return;
    }
    if (!settled) {
      cut.value = withTiming(0.62, { duration: duration.transfer * 2.6, easing: decelerate });
      snip.value = withRepeat(withSequence(withTiming(1, { duration: 130, easing: standard }), withTiming(0, { duration: 130, easing: standard })), -1);
    } else {
      cancelAnimation(snip);
      snip.value = withTiming(0, { duration: duration.short });
      cut.value = withTiming(filed ? 1 : 0, { duration: duration.long, easing: decelerate });
      if (filed) landed.value = withSpring(1, land);
    }
  }, [settled, filed, reduced, cut, snip, landed]);

  // Leaves on its own once filed, or soon when no server will ever read it.
  useEffect(() => {
    if (!link || link.deletedAt !== null) {
      endTransfer(linkId);
      return;
    }
    if ((settled || !server) && !paused) {
      const timer = setTimeout(() => endTransfer(linkId), settled ? 6000 : 5000);
      return () => clearTimeout(timer);
    }
  }, [settled, server, link, linkId, paused]);

  const scissorsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: cut.value * (TRACK - SCISSORS) }, { rotate: `${snip.value * 14 - 4}deg` }],
  }));
  // Drawn full length and scaled from its left end: a transform, not a width the layout must redo every frame.
  const cutStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: cut.value }] }));
  const landStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, landed.value * 1.6),
    transform: [{ scale: 0.4 + landed.value * 0.6 }, { rotate: `${(1 - landed.value) * -24}deg` }],
  }));

  if (!link) return null;
  // The site under the title, unless it is the title again (« Septime », « Septime »): then its address.
  const host = link.siteName && link.siteName.trim().toLowerCase() !== link.title.trim().toLowerCase() ? link.siteName : displayHost(link.url);
  const destination = settled ? line : undefined;
  const headline = !server
    ? t('Pas de serveur : le lien attend dans Non classé')
    : link.status === 'skipped'
      ? t('Lecture désactivée : gardé dans Non classé')
      : !settled
        ? t('Claude lit la page…')
        : link.status === 'failed'
          ? t('Lecture impossible, gardé dans Non classé')
          : filed
            ? t('Rangé dans {collection}', { collection: line ? shownTitle(line) : '' })
            : t('Gardé dans Non classé');
  const cutInk = destination && filed ? theme.slipLine[asLineColor(destination.color) ?? 'grey'].fill : theme.color.onSlipMuted;

  return (
    <>
      <AnimatedOrganic entering={SLIP_IN} exiting={SLIP_OUT} style={styles.panel} accessibilityLiveRegion="polite">
        <Organic style={styles.clip}>
          <Grain />
          <View style={styles.head}>
            <AppText variant="bodyStrong" color={theme.color.onSlip} numberOfLines={1} style={styles.flex}>
              {link.title || prettyUrl(link.url)}
            </AppText>
            {queued > 0 ? (
              <AppText variant="metaStrong" color={theme.color.onSlipMuted} accessibilityLabel={t('{others} en attente', { others: plural(queued, 'autre') })}>
                {`+${queued}`}
              </AppText>
            ) : null}
            <IconButton icon="close" label={t('Fermer')} color={theme.color.onSlip} onDark size={20} onPress={() => endTransfer(linkId)} />
          </View>
          <AppText variant="meta" color={theme.color.onSlipMuted} numberOfLines={1} style={styles.site}>
            {cleaned > 0 ? `${host} · ${plural(cleaned, 'traceur retiré', 'traceurs retirés')}` : host}
          </AppText>

          <View style={styles.trackRow}>
            <Emblem emblem="bac" color={asLineColor(inbox?.color ?? null) ?? 'grey'} size={MARK} onSlip />
            <View style={styles.track}>
              <View style={styles.dashes}>
                {Array.from({ length: DASHES }, (_, index) => (
                  <View key={index} style={[styles.dash, { backgroundColor: theme.color.onSlipMuted }]} />
                ))}
              </View>
              <Animated.View style={[styles.cut, { backgroundColor: cutInk }, cutStyle]} />
              <Animated.View style={[styles.scissors, scissorsStyle]}>
                <Icon name="scissors" size={SCISSORS} color={theme.color.onSlip} />
              </Animated.View>
            </View>
            {destination && filed ? (
              <Animated.View style={landStyle}>
                <Emblem emblem={collectionEmblem(destination.id, destination.emblem)} color={asLineColor(destination.color)} size={MARK} onSlip />
              </Animated.View>
            ) : (
              <Organic pebble={1} style={[styles.emptyStop, { borderColor: theme.color.onSlipMuted }, settled ? styles.unused : null]} />
            )}
          </View>

          <View style={styles.foot}>
            <AppText variant="meta" color={theme.color.onSlip} numberOfLines={1} style={styles.flex}>
              {headline}
              {settled && link.price !== null ? ` · ${formatPrice(link.price, link.currency)}` : ''}
            </AppText>
            {settled ? (
              <>
                <Tappable onDark onPress={onMove} accessibilityLabel={t('Changer de collection')} style={[styles.action, CHIP]}>
                  <AppText variant="label" color={theme.color.slipAction}>
                    {t('Changer')}
                  </AppText>
                </Tappable>
                <Tappable
                  onDark
                  onPress={() => {
                    endTransfer(linkId);
                    navigate('Line', { id: link.noteId });
                  }}
                  accessibilityLabel={t('Voir la collection')}
                  style={[styles.action, CHIP]}
                >
                  <AppText variant="label" color={theme.color.slipAction}>
                    {t('Voir')}
                  </AppText>
                </Tappable>
              </>
            ) : null}
          </View>
        </Organic>
      </AnimatedOrganic>
    </>
  );
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    host: { position: 'absolute', left: 12, right: 12 },
    panel: { ...corners(SHAPES.slip), backgroundColor: theme.color.slip, boxShadow: theme.lift.float },
    clip: { ...corners(SHAPES.slip), overflow: 'hidden', paddingLeft: 18, paddingRight: 4, paddingBottom: 6 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 46 },
    flex: { flex: 1 },
    site: { marginTop: -8, paddingRight: 12 },
    trackRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
    track: { width: TRACK, height: SCISSORS, justifyContent: 'center' },
    dashes: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between' },
    dash: { width: 8, height: 2, borderRadius: 1 },
    cut: { position: 'absolute', left: 0, width: TRACK, height: 3, borderRadius: 2, transformOrigin: 'left' },
    scissors: { position: 'absolute', left: 0, width: SCISSORS, height: SCISSORS },
    emptyStop: { width: MARK, height: MARK, borderWidth: 2, borderStyle: 'dashed' },
    unused: { opacity: 0.35 },
    foot: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
    action: { minHeight: 44, minWidth: 48, marginVertical: 2, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  });
