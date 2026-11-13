/**
 * A contact as a row of the list: their face and their name, the sort's word first; while searching,
 * what was found besides. Slid sideways, as Google Contacts' rows: to the right it calls them, to the
 * left it texts them, on the number a call dials (their mobile first, the page's « Appeler » and
 * « SMS »). What the slide uncovers says which (`phoneCall` and « Appeler » at the start, « SMS » and
 * `bubble` at the end); past its threshold it clicks and turns full strength, and only let go there
 * does it act: a throw short of it springs back. Someone without a number does not slide. The slide
 * starts only once the finger has gone sideways (the list's scroll keeps the rest), the letters'
 * rail lies beside the rows, and TalkBack has both as the row's actions. Under Reduce Motion the row
 * stays put and what the slide would uncover fades in over it instead.
 */
import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { t, tc } from '@unlease/core/i18n';
import { GEOMETRY } from '@unlease/design/palette';
import { RADII, SHAPES } from '@unlease/design/shapes';
import { listName, workLine } from '@unlease/contacts/services/names';
import type { SortOrder } from '@unlease/contacts/services/names';
import { callNumber as numberToCall } from '@unlease/contacts/services/phones';
import { useContact } from '@app/hooks/useContacts';
import { later } from '@app/later';
import { callNumber, textNumber } from '@app/reach';
import { haptic } from '@shared/platform/haptics';

import { AnimatedOrganic, AppText, GroundSlice, Icon, Organic, Tappable } from '@shared/ui/components';
import { duration, listPressDelay, spatial, standard, SWIPE_SHARE } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { ContactAvatar } from './ContactAvatar';
import { RAIL_WIDTH } from './LetterRail';

export const ROW_HEIGHT = 60;

/**
 * Where a row lies in its letter's panel (`placeOf`): the panel is drawn row by row, so a list of
 * fixed heights keeps its jumps exact. Its first and last rows add the panel's
 * inset (6 from its edge, less the rows' own half gap).
 */
export type PanelPlace = 'first' | 'middle' | 'last' | 'only';
const PANEL_PAD = 6 - GEOMETRY.rowGap / 2;
/** The panel's edge from the screen's (as the event form's panels and the settings groups). */
export const PANEL_EDGE = 12;
/** A row's inset in its panel, and its own padding there (a list row's 10, `ListRow`). */
const ROW_INSET = 6;
const ROW_PAD = 10;
/** The faces' column inside a panel, 16 in from its edge (as a settings section's title): a letter over the panel starts on it. */
export const PANEL_FACES = PANEL_EDGE + ROW_INSET + ROW_PAD;

/** A row's height in its panel. */
export function rowHeight(place: PanelPlace | null): number {
  return ROW_HEIGHT + (place === 'first' || place === 'only' ? PANEL_PAD : 0) + (place === 'last' || place === 'only' ? PANEL_PAD : 0);
}

/** Where the row at `index` of a run of `count` lies in its panel. */
export function placeOf(index: number, count: number): PanelPlace {
  return count === 1 ? 'only' : index === 0 ? 'first' : index === count - 1 ? 'last' : 'middle';
}

const R = RADII.panel;
/** The panel's paper, row by row: its corners on its first and last rows only. */
const PANEL_CORNERS: Record<PanelPlace, readonly [number, number, number, number]> = { first: [R, R, 0, 0], middle: [0, 0, 0, 0], last: [0, 0, R, R], only: [R, R, R, R] };
/** The row's press and slide, concentric with the panel's corners where it meets them. */
const ROW_SHAPES = { first: SHAPES.panelRowFirst, middle: SHAPES.tab, last: SHAPES.panelRowLast, only: SHAPES.panelRowOnly } as const;

/** Past this share of the screen (the suite's swipe, `SWIPE_SHARE`) the slide acts once let go; beyond it the row follows the hand at a third of its speed. */
const THRESHOLD = SWIPE_SHARE;
const RESIST = 0.35;

type Way = 'call' | 'text';

function ContactRowComponent({ id, order, detail = false, railed = false, place = null, onOpen }: { id: string; order: SortOrder; detail?: boolean; /** Beside the letters' rail: its panel stops short of it. */ railed?: boolean; /** Its place in its letter's panel; null on the ground. */ place?: PanelPlace | null; onOpen: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const reduced = useReducedMotion();
  const { width: screen } = useWindowDimensions();
  const contact = useContact(id);
  const number = contact ? numberToCall(contact) : null;
  const threshold = screen * THRESHOLD;

  // Where the hand has taken the row (signed, eased past the threshold); the row follows it unless motion is reduced.
  const drag = useSharedValue(0);
  const over = useSharedValue(false);
  const armed = useSharedValue(0);
  // Whether the hand took the row (a scroll or a tap that began on it never did: it stays still).
  const taken = useSharedValue(false);
  // Off its place, the row is a strip of the ground pulled aside: the ground's slice under it, so what it uncovers reads.
  const [lifted, setLifted] = useState(false);
  const [top, setTop] = useState(0);
  const slot = useRef<React.ComponentRef<typeof View>>(null);

  const act = useCallback(
    (way: Way) => {
      if (!number) return;
      later(way === 'call' ? callNumber(number.number) : textNumber(number.number));
    },
    [number],
  );
  const measure = useCallback(() => slot.current?.measureInWindow((_x, y) => setTop(y)), []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(`contact-slide-${id}`)
        .enabled(number !== null)
        .activeOffsetX([-14, 14])
        .failOffsetY([-12, 12])
        .onBegin(() => {
          runOnJS(measure)();
        })
        .onStart(() => {
          taken.value = true;
          if (!reduced) runOnJS(setLifted)(true);
        })
        .onUpdate(event => {
          const reach = Math.abs(event.translationX);
          drag.value = Math.sign(event.translationX) * (reach <= threshold ? reach : threshold + (reach - threshold) * RESIST);
          if (reach > threshold !== over.value) {
            over.value = reach > threshold;
            armed.value = reduced ? (over.value ? 1 : 0) : withTiming(over.value ? 1 : 0, { duration: duration.short, easing: standard });
            runOnJS(haptic)(over.value ? 'threshold' : 'release');
          }
        })
        .onEnd(event => {
          // Only let go past the threshold: a call is not placed by a throw.
          if (over.value) runOnJS(act)(event.translationX > 0 ? 'call' : 'text');
        })
        .onFinalize(event => {
          if (!taken.value) return;
          taken.value = false;
          const past = over.value;
          over.value = false;
          armed.value = reduced ? 0 : withTiming(0, { duration: duration.short, easing: standard });
          // Back to its place with the hand's speed, whatever was decided; under Reduce Motion what showed over it fades.
          if (reduced) drag.value = withTiming(0, { duration: duration.short, easing: standard });
          else
            drag.value = withSpring(0, { ...spatial, velocity: event.velocityX * (past ? RESIST : 1) }, finished => {
              if (finished) runOnJS(setLifted)(false);
            });
        }),
    [id, number, reduced, threshold, act, measure, drag, over, armed, taken],
  );

  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: reduced ? 0 : drag.value }] }));
  // Uncovered, it shows at once; laid over the row (Reduce Motion), it fades in as the hand nears the threshold.
  const hole = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(drag.value), [0, reduced ? threshold : 12], [0, 1], Extrapolation.CLAMP) }));
  const start = useAnimatedStyle(() => ({ opacity: drag.value > 0 ? 0.55 + 0.45 * armed.value : 0, transform: [{ scale: reduced ? 1 : 0.88 + 0.12 * armed.value }] }));
  const end = useAnimatedStyle(() => ({ opacity: drag.value < 0 ? 0.55 + 0.45 * armed.value : 0, transform: [{ scale: reduced ? 1 : 0.88 + 0.12 * armed.value }] }));

  if (!contact) return null;
  const name = listName(contact, order);
  const shape = place ? ROW_SHAPES[place] : SHAPES.tab;
  const meta = detail ? workLine(contact) || contact.phones[0]?.number || contact.emails[0]?.address || '' : '';
  const ink = theme.color.onActionContainer;

  const uncovered = number ? (
    <AnimatedOrganic pointerEvents="none" shape={shape} style={[StyleSheet.absoluteFill, styles.hole, hole]}>
      <Animated.View style={[styles.side, start]}>
        <Icon name="phoneCall" size={24} color={ink} />
        <AppText variant="label" color={ink}>
          {t('Call')}
        </AppText>
      </Animated.View>
      <Animated.View style={[styles.side, end]}>
        <AppText variant="label" color={ink}>
          {tc('message', 'Text')}
        </AppText>
        <Icon name="bubble" size={24} color={ink} />
      </Animated.View>
    </AnimatedOrganic>
  ) : null;

  const row = (
    <View ref={slot} style={[styles.slot, place ? styles.inPanel : railed ? styles.railed : null]}>
      {reduced ? null : uncovered}
      <GestureDetector gesture={pan}>
        <Animated.View style={strip}>
          {/* Slid off its place, it takes its paper with it (the panel's, or the ground's slice under it), so what it uncovers reads. */}
          {lifted ? (
            <Organic pointerEvents="none" shape={shape} style={[StyleSheet.absoluteFill, styles.lifted, place ? styles.liftedPaper : null]}>
              {place ? null : <GroundSlice top={top} />}
            </Organic>
          ) : null}
          <Tappable
            unstable_pressDelay={listPressDelay}
            onPress={() => onOpen(id)}
            style={[styles.row, place ? styles.rowInPanel : null, corners(shape)]}
            accessibilityRole="link"
            accessibilityLabel={name}
            accessibilityActions={number ? [{ name: 'call', label: t('Call') }, { name: 'text', label: t('Send a text') }] : undefined}
            onAccessibilityAction={event => {
              const action = event.nativeEvent.actionName;
              if (action === 'call' || action === 'text') act(action);
            }}
          >
            <ContactAvatar contact={contact} size={40} />
            <View style={styles.text}>
              <AppText variant="body" numberOfLines={1}>
                {name}
              </AppText>
              {meta ? (
                <AppText variant="meta" numberOfLines={1}>
                  {meta}
                </AppText>
              ) : null}
            </View>
            {contact.favorite ? <Icon name="star" size={16} color={theme.color.inkFaint} solid /> : null}
          </Tappable>
        </Animated.View>
      </GestureDetector>
      {reduced ? uncovered : null}
    </View>
  );
  if (!place) return row;
  return (
    <Organic shape={PANEL_CORNERS[place]} style={[styles.panel, railed ? styles.panelRailed : null, place === 'first' || place === 'only' ? styles.panelTop : null, place === 'last' || place === 'only' ? styles.panelFoot : null]}>
      {row}
    </Organic>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // The face 20 from the screen's edge (the column the list's heads and letters start on), the name at 76.
    slot: { height: ROW_HEIGHT - GEOMETRY.rowGap, marginHorizontal: 8, marginVertical: GEOMETRY.rowGap / 2 },
    // Clear of the rail by the rows' gap.
    railed: { marginRight: RAIL_WIDTH + GEOMETRY.rowGap },
    // A letter's people lie on one sheet of paper, as a settings group's rows: 6 in from its edge, its corners on its first and last.
    // A row slid aside stays inside its panel, clipped to its curve: it goes under the panel's edge, never over the letters' rail.
    panel: { marginLeft: PANEL_EDGE, marginRight: PANEL_EDGE, overflow: 'hidden', backgroundColor: theme.color.paper },
    // Clear of the rail by the rows' gap, as a row on the ground.
    panelRailed: { marginRight: RAIL_WIDTH + GEOMETRY.rowGap },
    panelTop: { paddingTop: PANEL_PAD },
    panelFoot: { paddingBottom: PANEL_PAD },
    inPanel: { marginHorizontal: ROW_INSET },
    liftedPaper: { backgroundColor: theme.color.paper },
    row: { flexDirection: 'row', alignItems: 'center', gap: 16, height: ROW_HEIGHT - GEOMETRY.rowGap, paddingHorizontal: 12, paddingVertical: 8 },
    // In a panel, a list row's 10 (`ListRow`).
    rowInPanel: { paddingHorizontal: ROW_PAD },
    lifted: { overflow: 'hidden' },
    // What the slid row uncovers: a well in the primary's container, the glyph centred on the faces' column (20 + 8 of its 40).
    hole: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, backgroundColor: theme.color.actionContainer },
    side: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    text: { flex: 1, gap: 1 },
  });

export const ContactRow = memo(ContactRowComponent);
