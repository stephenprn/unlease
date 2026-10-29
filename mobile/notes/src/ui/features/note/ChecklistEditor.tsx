/**
 * The checklist editor, with Keep's keyboard habits: Enter splits the item at the caret (what
 * follows starts the next one), Backspace at the start of an item joins it to the one above (an
 * empty one goes), a multi-line paste becomes several items, and × offers the item back.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, StyleSheet, TextInput, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { noteBackdrop } from '@unlease/design/backgrounds';
import { SHAPES } from '@unlease/design/shapes';
import { t, tc } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';
import { addCheck, deleteCheck, mergeIntoPrevious, moveCheck, pasteChecks, saveTypedText, splitCheck, toggleCheck } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@app/store/uiStore';
import { haptic } from '@platform/haptics';

import { AnimatedOrganic, AppText, Checkbox, Grain, Icon, IconButton, Organic, Tappable } from '../../components';
import { decelerate, duration, spatial, standard } from '../../theme/motion';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { variantStyle } from '../../theme/typography';

type InputRef = React.ComponentRef<typeof TextInput>;

/** Items glide to their new place when one is ticked, added, removed or dropped; an item arriving or leaving fades. */
const ROW_MOVE = LinearTransition.duration(duration.medium).easing(standard);
const ROW_IN = FadeIn.duration(duration.medium).easing(decelerate);
/** The ticked group (and what arrives in it) comes in once the open list has closed ranks above it. */
const ROW_IN_LATE = FadeIn.duration(duration.medium).easing(decelerate).delay(duration.short);
/** Out of the way before the next item slides into its place: a quick fade that starts at once. */
const ROW_OUT = FadeOut.duration(100).easing(Easing.out(Easing.quad));

/** An item to focus once its input exists, and where its caret goes. */
interface Focus {
  readonly id: string;
  readonly caret: number | 'end';
}

/** × on an item: it goes, and the slip offers it back (the keyboard would cover the slip). */
function removeItem(id: string): void {
  Keyboard.dismiss();
  showSnack(t('Élément supprimé'), { label: tc('undo', 'Annuler'), run: deleteCheck(id) }, { tone: 'success' });
}

export interface ChecklistEditorProps {
  readonly noteId: string;
  readonly editable: boolean;
  /** For a checklist just created from the board. */
  readonly autoFocusFirst?: boolean;
}

function ChecklistEditorComponent({ noteId, editable, autoFocusFirst = false }: ChecklistEditorProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const { open, done } = useLibraryStore(
    useShallow(s => {
      const ids = s.checksByNote[noteId] ?? [];
      const openIds: string[] = [];
      const doneIds: string[] = [];
      for (const id of ids) {
        const item = s.checks[id];
        if (!item) continue;
        (item.checked ? doneIds : openIds).push(id);
      }
      return { open: openIds.join(','), done: doneIds.join(',') };
    }),
  );
  // An item taken up is a strip of the note's own paper lifted off it, so it hides what it passes over.
  const color = useLibraryStore(s => s.notes[noteId]?.color ?? null);
  const paper = useMemo(() => [noteBackdrop(theme.mode, color, null), corners(SHAPES.tab), { boxShadow: theme.lift.raised }], [theme, color]);
  const openIds = useMemo(() => (open ? open.split(',') : []), [open]);
  const doneIds = useMemo(() => (done ? done.split(',') : []), [done]);
  const [showDone, setShowDone] = useState(true);
  const inputs = useRef(new Map<string, InputRef>());
  const pendingFocus = useRef<Focus | null>(autoFocusFirst && openIds[0] ? { id: openIds[0], caret: 'end' } : null);
  const rows = useRef(new Map<string, { y: number; height: number }>());
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  // A dropped item is drawn afresh in its new place (a new key), starting where the finger let it go;
  // while it is held, its old self leaves without a fade, so nothing is seen twice.
  const [held, setHeld] = useState<string | null>(null);
  const [dropped, setDropped] = useState<{ id: string; from: number } | null>(null);
  const [generations, setGenerations] = useState<ReadonlyMap<string, number>>(new Map());
  useEffect(() => {
    if (!dropped) return;
    const timer = setTimeout(() => setDropped(null), 600);
    return () => clearTimeout(timer);
  }, [dropped]);

  // Focus an item just created, split off or joined, once its input exists, the caret where the gesture left it.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target || !inputs.current.has(target.id)) return;
    pendingFocus.current = null;
    setTimeout(() => {
      const input = inputs.current.get(target.id);
      if (!input) return;
      input.focus();
      const caret = target.caret === 'end' ? useLibraryStore.getState().checks[target.id]?.text.length ?? 0 : target.caret;
      input.setSelection(caret, caret);
    }, 30);
  });

  const register = useCallback((id: string, ref: InputRef | null) => {
    if (ref) inputs.current.set(id, ref);
    else inputs.current.delete(id);
  }, []);

  const addAfter = useCallback(
    (afterId: string | null, text = '') => {
      const id = addCheck(noteId, text, afterId);
      pendingFocus.current = { id, caret: 'end' };
      return id;
    },
    [noteId],
  );

  /** Enter: the caret starts the new item. */
  const split = useCallback((id: string, text: string, caret: number) => {
    const next = splitCheck(id, text, caret);
    if (next) pendingFocus.current = { id: next, caret: 0 };
  }, []);

  /** Backspace at the start of an item: it joins the open item above, the caret where the two meet. */
  const mergeUp = useCallback(
    (id: string, text: string) => {
      const index = openIds.indexOf(id);
      const previous = index > 0 ? openIds[index - 1] : undefined;
      if (previous) pendingFocus.current = { id: previous, caret: mergeIntoPrevious(previous, id, text) };
    },
    [openIds],
  );

  /** Backspace on an empty item: it goes, the caret ends the item above (or starts the one below). */
  const removeEmpty = useCallback(
    (id: string) => {
      const index = openIds.indexOf(id);
      const previous = index > 0 ? openIds[index - 1] : undefined;
      const next = openIds[index + 1];
      deleteCheck(id);
      if (previous) pendingFocus.current = { id: previous, caret: 'end' };
      else if (next) pendingFocus.current = { id: next, caret: 0 };
    },
    [openIds],
  );

  /** A multi-line paste: one write, the caret at the end of the last new item. */
  const pasteLines = useCallback((id: string, since: string, lines: string[]) => {
    const { text, ids } = pasteChecks(id, since, lines);
    const last = ids[ids.length - 1];
    if (last) pendingFocus.current = { id: last, caret: 'end' };
    return text;
  }, []);

  const onLayoutRow = useCallback((id: string, event: LayoutChangeEvent) => {
    rows.current.set(id, { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height });
  }, []);

  /** `y` is relative to the list; returns an index into `openIds`. */
  const indexAt = useCallback(
    (y: number) => {
      let index = 0;
      for (const id of openIds) {
        const row = rows.current.get(id);
        if (row && y > row.y + row.height / 2) index += 1;
      }
      return index;
    },
    [openIds],
  );

  const onDrag = useCallback((id: string, y: number) => setDropIndex(indexAt(y)), [indexAt]);
  const onHold = useCallback((id: string | null) => {
    setHeld(id);
    if (!id) setDropIndex(null);
  }, []);

  const onDrop = useCallback(
    (id: string, y: number) => {
      setDropIndex(null);
      const target = indexAt(y);
      const from = openIds.indexOf(id);
      if (target === from || target === from + 1) {
        // Let go over its own place: it eases back still lifted, then lies down.
        setTimeout(() => setHeld(current => (current === id ? null : current)), duration.medium);
        return;
      }
      setHeld(null);
      const before = target > 0 ? openIds[target - 1] ?? null : null;
      const after = openIds[target] ?? null;
      // Where its top will be once the others have moved: under the item it follows, or on the one it precedes.
      const own = rows.current.get(id);
      const above = target > from ? rows.current.get(openIds[target - 1] ?? '') : undefined;
      const below = target <= from ? rows.current.get(openIds[target] ?? '') : undefined;
      const top = above && own ? above.y + above.height - own.height : below ? below.y : y;
      setDropped({ id, from: y - top });
      setGenerations(current => new Map(current).set(id, (current.get(id) ?? 0) + 1));
      moveCheck(id, before === id ? null : before, after === id ? null : after);
    },
    [indexAt, openIds],
  );

  const indicatorTop = (() => {
    if (dropIndex === null) return null;
    const id = openIds[dropIndex] ?? openIds[openIds.length - 1];
    const row = id ? rows.current.get(id) : undefined;
    if (!row) return null;
    return dropIndex < openIds.length ? row.y : row.y + row.height;
  })();

  return (
    // The list as it opens is simply there; what changes after it moves.
    <LayoutAnimationConfig skipEntering skipExiting>
      <View>
        <View>
          {openIds.map(id => (
            <Animated.View
              key={`${id}:${generations.get(id) ?? 0}`}
              layout={ROW_MOVE}
              entering={dropped?.id === id ? undefined : ROW_IN}
              exiting={held === id ? undefined : ROW_OUT}
              onLayout={event => onLayoutRow(id, event)}
              // Held or settling, it rides above every other item, those after it included.
              style={held === id || dropped?.id === id ? styles.above : undefined}
            >
              <CheckRow
                id={id}
                editable={editable}
                register={register}
                onSplit={split}
                onMergeUp={mergeUp}
                onEmptyBackspace={removeEmpty}
                onPasteLines={pasteLines}
                onDrag={onDrag}
                onDrop={onDrop}
                onHold={onHold}
                rowY={rows.current.get(id)?.y ?? 0}
                settleFrom={dropped?.id === id ? dropped.from : 0}
                raised={held === id || dropped?.id === id ? paper : null}
              />
            </Animated.View>
          ))}
          {indicatorTop !== null ? <View pointerEvents="none" style={[styles.indicator, { top: indicatorTop - 1, backgroundColor: theme.color.ink }]} /> : null}
        </View>
        {editable ? (
          <Animated.View layout={ROW_MOVE}>
            <Tappable onPress={() => addAfter(openIds[openIds.length - 1] ?? null)} accessibilityLabel={t('Ajouter un élément')} style={styles.addRow}>
              <View style={styles.gripSpace} />
              <View style={styles.addIcon}>
                <Icon name="plus" size={20} color={theme.color.inkMuted} />
              </View>
              <AppText variant="body" color={theme.color.inkMuted}>
                {t('Élément de liste')}
              </AppText>
            </Tappable>
          </Animated.View>
        ) : null}
        {doneIds.length > 0 ? (
          <Animated.View layout={ROW_MOVE} entering={ROW_IN_LATE} exiting={ROW_OUT} style={styles.doneSection}>
            <Tappable onPress={() => setShowDone(value => !value)} accessibilityLabel={showDone ? t('Masquer les éléments cochés') : t('Afficher les éléments cochés')} style={styles.doneHeader}>
              <Chevron open={showDone} color={theme.color.inkMuted} />
              <AppText variant="metaStrong">{plural(doneIds.length, 'élément coché', 'éléments cochés')}</AppText>
            </Tappable>
            {showDone
              ? doneIds.map(id => (
                  <Animated.View key={id} layout={ROW_MOVE} entering={ROW_IN_LATE} exiting={ROW_OUT}>
                    <DoneRow id={id} editable={editable} />
                  </Animated.View>
                ))
              : null}
          </Animated.View>
        ) : null}
      </View>
    </LayoutAnimationConfig>
  );
}

/** The group's chevron turns a quarter as it opens or folds. */
function Chevron({ open, color }: { open: boolean; color: string }) {
  const turn = useSharedValue(open ? 0 : -90);
  useEffect(() => {
    turn.value = withTiming(open ? 0 : -90, { duration: duration.short, easing: standard });
  }, [open, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <Icon name="chevronDown" size={20} color={color} />
    </Animated.View>
  );
}

interface CheckRowProps {
  readonly id: string;
  readonly editable: boolean;
  readonly register: (id: string, ref: InputRef | null) => void;
  /** Enter: what the field holds, to cut at the caret. */
  readonly onSplit: (id: string, text: string, caret: number) => void;
  /** Backspace at the start of an item that holds text. */
  readonly onMergeUp: (id: string, text: string) => void;
  readonly onEmptyBackspace: (id: string) => void;
  /** Returns the item's own text once written. */
  readonly onPasteLines: (id: string, since: string, lines: string[]) => string;
  readonly onDrag: (id: string, y: number) => void;
  readonly onDrop: (id: string, y: number) => void;
  /** Taken up (its id) or let go without a drop (null). */
  readonly onHold: (id: string | null) => void;
  readonly rowY: number;
  /** Just dropped: how far from its new place it was let go; it settles in from there. */
  readonly settleFrom: number;
  /** Taken up or settling: the paper it is drawn on. */
  readonly raised: StyleProp<ViewStyle> | null;
}

const CheckRow = memo(function CheckRowView({ id, editable, register, onSplit, onMergeUp, onEmptyBackspace, onPasteLines, onDrag, onDrop, onHold, rowY, settleFrom, raised }: CheckRowProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const item = useLibraryStore(s => s.checks[id]);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(item?.text ?? '');
  // The tick is drawn first, then the item leaves for the ticked group: it fades out ticked, one frame later.
  const [ticked, setTicked] = useState(false);
  const tick = useCallback(() => {
    setTicked(true);
    requestAnimationFrame(() => toggleCheck(id));
  }, [id]);
  const lastSaved = useRef(item?.text ?? '');
  /** The caret as the field last reported it; the native side reports only a change from 0, 0. */
  const selection = useRef({ start: 0, end: 0 });
  const offset = useSharedValue(settleFrom);

  // Dropped: it finishes the way into its slot from where the finger let it go.
  useEffect(() => {
    if (settleFrom !== 0) offset.value = withSpring(0, spatial);
  }, [settleFrom, offset]);

  // Follow edits that arrive from another device, unless this row is being typed in.
  useEffect(() => {
    if (!focused && item && item.text !== lastSaved.current) {
      lastSaved.current = item.text;
      setDraft(item.text);
    }
  }, [item, focused]);

  const save = useCallback(
    (text: string) => {
      // An edit from another device since the last keystroke is merged in, not overwritten.
      const stored = saveTypedText('check', id, 'text', lastSaved.current, text);
      lastSaved.current = stored;
      if (stored !== text) setDraft(stored);
      return stored;
    },
    [id],
  );

  // Enter cuts the item at the caret, once what is typed is saved (merged with any edit from elsewhere).
  const split = () => {
    const text = save(draft);
    const caret = Math.min(selection.current.start, text.length);
    lastSaved.current = text.slice(0, caret);
    setDraft(lastSaved.current);
    onSplit(id, text, caret);
  };

  const drag = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      runOnJS(haptic)('pick');
      runOnJS(onHold)(id);
    })
    .onUpdate(event => {
      offset.value = event.translationY;
      runOnJS(onDrag)(id, rowY + event.translationY);
    })
    .onEnd(event => {
      runOnJS(onDrop)(id, rowY + event.translationY);
      // A drop that moves it redraws it in its new place; one that does not lets it ease back, after a beat.
      offset.value = withDelay(80, withSpring(0, spatial));
    })
    .onFinalize((_event, success) => {
      if (success) return;
      runOnJS(onHold)(null);
      offset.value = withSpring(0, spatial);
    });

  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  if (!item) return null;
  return (
    <AnimatedOrganic style={[styles.row, raised, animated]}>
      {raised ? (
        <Organic style={[StyleSheet.absoluteFill, styles.grain]} pointerEvents="none">
          <Grain />
        </Organic>
      ) : null}
      {editable ? (
        <GestureDetector gesture={drag}>
          <View style={styles.grip} accessibilityLabel={t('Maintenir pour déplacer')} accessible>
            <Icon name="grip" size={18} color={theme.color.inkFaint} />
          </View>
        </GestureDetector>
      ) : (
        <View style={styles.gripSpace} />
      )}
      <Checkbox checked={ticked} onToggle={tick} label={item.text ? t('Cocher {item}', { item: item.text }) : t('Cocher l’élément')} disabled={!editable} />
      <TextInput
        ref={ref => register(id, ref)}
        value={draft}
        editable={editable}
        multiline
        submitBehavior="submit"
        onSubmitEditing={split}
        onSelectionChange={event => {
          selection.current = event.nativeEvent.selection;
        }}
        onChangeText={text => {
          if (text.includes('\n')) {
            const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
            if (lines.length > 1) {
              const stored = onPasteLines(id, lastSaved.current, lines);
              lastSaved.current = stored;
              setDraft(stored);
              return;
            }
            text = text.replace(/\n/g, '');
          }
          setDraft(text);
          save(text);
        }}
        onKeyPress={event => {
          if (event.nativeEvent.key !== 'Backspace') return;
          if (draft === '') onEmptyBackspace(id);
          else if (selection.current.start === 0 && selection.current.end === 0) onMergeUp(id, save(draft));
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={t('Élément')}
        placeholderTextColor={theme.color.inkFaint}
        selectionColor={theme.color.highlight}
        selectionHandleColor={theme.color.focus}
        cursorColor={theme.color.focus}
        style={[variantStyle(theme, 'editorBody'), styles.input]}
        maxLength={TEXT_LIMITS.check.text}
        accessibilityLabel={t('Texte de l’élément')}
      />
      {focused && editable ? <IconButton icon="close" label={t('Supprimer l’élément')} onPress={() => removeItem(id)} size={20} /> : <View style={styles.trailing} />}
    </AnimatedOrganic>
  );
});

const DoneRow = memo(function DoneRowView({ id, editable }: { id: string; editable: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const item = useLibraryStore(s => s.checks[id]);
  const [unticked, setUnticked] = useState(false);
  const untick = useCallback(() => {
    setUnticked(true);
    requestAnimationFrame(() => toggleCheck(id));
  }, [id]);
  if (!item) return null;
  return (
    <View style={styles.row}>
      <View style={styles.gripSpace} />
      <Checkbox checked={!unticked} onToggle={untick} label={t('Décocher {item}', { item: item.text })} disabled={!editable} />
      <AppText variant="editorBody" color={theme.color.inkMuted} style={styles.doneText}>
        {item.text}
      </AppText>
      {editable ? <IconButton icon="close" label={t('Supprimer l’élément')} onPress={() => removeItem(id)} size={20} /> : <View style={styles.trailing} />}
    </View>
  );
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 48 },
    grip: { width: 28, height: 48, alignItems: 'center', justifyContent: 'center' },
    gripSpace: { width: 28 },
    input: { flex: 1, paddingTop: 11, paddingBottom: 11, paddingHorizontal: 4, color: theme.color.ink },
    trailing: { width: 48 },
    addRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
    addIcon: { width: 44, alignItems: 'center' },
    indicator: { position: 'absolute', left: 28, right: 12, height: 2, borderRadius: 1 },
    above: { zIndex: 1 },
    grain: { ...corners(SHAPES.tab), overflow: 'hidden' },
    doneSection: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.hairline, paddingTop: 4 },
    doneHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingLeft: 8 },
    doneText: { flex: 1, paddingTop: 11, paddingBottom: 11, paddingHorizontal: 4, textDecorationLine: 'line-through' },
  });

export const ChecklistEditor = memo(ChecklistEditorComponent);
