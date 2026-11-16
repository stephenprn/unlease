/**
 * A contact as a row of the list, on the list's one sheet of paper (`sheetLayout.ts`): their face and
 * their name, the sort's word first; while searching, what was found besides. The first row of a
 * letter's people keeps its letter's band over it and announces that letter to TalkBack as a
 * heading there (the band drawn over it is the list's, pinned as the list scrolls).
 * Slid sideways, as Google Contacts' rows: to the right it calls them, to the left it texts them, on
 * the number a call dials (their mobile first, the page's « Appeler » and « SMS »). What the slide
 * uncovers says which (`phoneCall` and « Appeler » at the start, « SMS » and `bubble` at the end);
 * past its threshold it clicks and turns full strength, and only let go there does it act: a throw
 * short of it springs back. Someone without a number does not slide. The slide starts only once the
 * finger has gone sideways (the list's scroll keeps the rest), the row slid takes its paper with it
 * and stays inside the sheet (never over its edge or the rail), and TalkBack has both as the row's
 * actions. Under Reduce Motion the row stays put and what
 * the slide would uncover fades in over it instead.
 */
import React, { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { t, tc } from '@unlease/core/i18n';
import { GEOMETRY } from '@unlease/design/palette';
import { RADII, type Corners } from '@unlease/design/shapes';
import { listName, workLine } from '@unlease/contacts/services/names';
import type { SortOrder } from '@unlease/contacts/services/names';
import { callNumber as numberToCall } from '@unlease/contacts/services/phones';
import { useContact } from '@app/hooks/useContacts';
import { later } from '@app/later';
import { callNumber, textNumber } from '@app/reach';
import { haptic } from '@shared/platform/haptics';

import { AnimatedOrganic, AppText, Grain, Icon, Organic, Tappable } from '@shared/ui/components';
import { duration, listPressDelay, spatial, standard, SWIPE_SHARE } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { ContactAvatar } from './ContactAvatar';
import { BAND, FACE_IN, ROW_SLOT, SHEET_EDGE, SHEET_INSET, SHEET_PAD, SHEET_ROW_CORNER, sheetRight, type SheetRow } from './sheetLayout';

/** The sheet's corner inside its hairline edge: the rows' column is cut there, so a row slid aside never leaves the paper. */
const INNER = RADII.panel - 1;
const ROW = RADII.row;

/** The row's press and slide: a tab's corners, concentric with the sheet's where it meets them (a band over the first row keeps it from the sheet's top). */
function rowShape(row: Pick<SheetRow, 'top' | 'foot' | 'heading'>): Corners {
  const top = row.top && row.heading === null ? SHEET_ROW_CORNER : ROW;
  const foot = row.foot ? SHEET_ROW_CORNER : ROW;
  return [top, top, foot, foot];
}

/** The sheet at this row, inside its hairline edge: cut along its curve at its top and foot. */
function columnShape(row: Pick<SheetRow, 'top' | 'foot'>): Corners {
  const top = row.top ? INNER : 0;
  const foot = row.foot ? INNER : 0;
  return [top, top, foot, foot];
}

/** Past this share of the screen (the suite's swipe, `SWIPE_SHARE`) the slide acts once let go; beyond it the row follows the hand at a third of its speed. */
const THRESHOLD = SWIPE_SHARE;
const RESIST = 0.35;

type Way = 'call' | 'text';

export interface ContactRowProps {
  readonly id: string;
  readonly order: SortOrder;
  /** While searching: what was found besides the name. */
  readonly detail?: boolean;
  /** Its place on the sheet. */
  readonly row: Pick<SheetRow, 'heading' | 'top' | 'foot'>;
  /** Beside the letters' rail: the sheet stops short of it. */
  readonly railed?: boolean;
  readonly onOpen: (id: string) => void;
}

function ContactRowComponent({ id, order, detail = false, row: place, railed = false, onOpen }: ContactRowProps) {
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
  // Off its place, the row is a strip of the paper pulled aside: it takes its paper with it, so what it uncovers reads.
  const [lifted, setLifted] = useState(false);

  const act = useCallback(
    (way: Way) => {
      if (!number) return;
      later(way === 'call' ? callNumber(number.number) : textNumber(number.number));
    },
    [number],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(`contact-slide-${id}`)
        .enabled(number !== null)
        .activeOffsetX([-14, 14])
        .failOffsetY([-12, 12])
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
    [id, number, reduced, threshold, act, drag, over, armed, taken],
  );

  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: reduced ? 0 : drag.value }] }));
  // Uncovered, it shows at once; laid over the row (Reduce Motion), it fades in as the hand nears the threshold.
  const hole = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(drag.value), [0, reduced ? threshold : 12], [0, 1], Extrapolation.CLAMP) }));
  const start = useAnimatedStyle(() => ({ opacity: drag.value > 0 ? 0.55 + 0.45 * armed.value : 0, transform: [{ scale: reduced ? 1 : 0.88 + 0.12 * armed.value }] }));
  const end = useAnimatedStyle(() => ({ opacity: drag.value < 0 ? 0.55 + 0.45 * armed.value : 0, transform: [{ scale: reduced ? 1 : 0.88 + 0.12 * armed.value }] }));

  if (!contact) return null;
  const name = listName(contact, order);
  const shape = rowShape(place);
  const meta = detail ? workLine(contact) || contact.phones[0]?.number || contact.emails[0]?.address || '' : '';
  const ink = theme.color.onActionContainer;
  const press = corners(shape);

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

  const slot = (
    <View style={styles.slot}>
      {reduced ? null : uncovered}
      <GestureDetector gesture={pan}>
        <Animated.View style={strip}>
          {/* Slid off its place, it takes its paper with it (and its grain), so what it uncovers reads. */}
          {lifted ? (
            <Organic pointerEvents="none" shape={shape} style={[StyleSheet.absoluteFill, styles.lifted]}>
              <Grain />
            </Organic>
          ) : null}
          <Tappable
            unstable_pressDelay={listPressDelay}
            onPress={() => onOpen(id)}
            style={[styles.row, press]}
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
  // The rows' column at this row: inside the sheet's hairline edge, cut along its curve at its top and foot, so a row slid aside goes under the paper's edge.
  // Its letter's band over it, when it is the first of its letter's people: the list draws the band there, TalkBack reads the letter as a heading, once, before them.
  const band = place.heading !== null ? <View style={styles.band} accessible accessibilityRole="header" accessibilityLabel={place.heading} /> : null;
  const column = columnShape(place);
  const columnStyle = [styles.column, place.top ? styles.columnTop : null, place.foot ? styles.columnFoot : null];
  return (
    <View style={[styles.line, { marginRight: sheetRight(railed) }]}>
      {column.some(value => value !== 0) ? (
        <Organic shape={column} style={columnStyle}>
          {band}
          {slot}
        </Organic>
      ) : (
        <View style={columnStyle}>
          {band}
          {slot}
        </View>
      )}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // The row across the sheet.
    line: { flexDirection: 'row', marginLeft: SHEET_EDGE },
    // Inside the sheet's hairline edge (1) all round.
    column: { flex: 1, marginLeft: 1, marginRight: 1, overflow: 'hidden' },
    // The letter's band's room over its first person.
    band: { height: BAND },
    columnTop: { marginTop: 1, paddingTop: SHEET_PAD - 1 },
    columnFoot: { marginBottom: 1, paddingBottom: SHEET_PAD - 1 },
    // The row's slot, 6 from the sheet's edges (its inset, less the edge), the rows' gap between two.
    slot: { height: ROW_SLOT, marginVertical: GEOMETRY.rowGap / 2, marginHorizontal: SHEET_INSET - 1 },
    // Its face 10 in, a list row's; its name 16 after the face.
    row: { flexDirection: 'row', alignItems: 'center', gap: 16, height: ROW_SLOT, paddingLeft: FACE_IN, paddingRight: 12, paddingVertical: 8 },
    lifted: { overflow: 'hidden', backgroundColor: theme.color.paper },
    // What the slid row uncovers: a well in the primary's container, the glyph centred on the faces' column (8 in its 40).
    hole: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: FACE_IN + 8, paddingRight: 16, backgroundColor: theme.color.actionContainer },
    side: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    text: { flex: 1, gap: 1 },
  });

export const ContactRow = memo(ContactRowComponent);
