/**
 * "En cuisine": a recipe followed at the stove, the screen kept on while it is open. Its method one
 * step at a time in big type (the foot's buttons or a swipe turn the steps), its ingredients to
 * tick for the servings chosen, and a timer from any duration a step names. The steps come from the
 * page's own data, or Claude reads them when it has none. The web's `CookMode`.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Keyframe, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { linkShop } from '@unlease/notes/services/modules';
import { scaleIngredient, stepTimers } from '@unlease/notes/services/recipes';
import type { RecipeStep } from '@unlease/notes/sync/recipe';
import { readRecipe } from '@app/modules';
import { startTimer, useKitchenStore } from '@app/store/kitchen';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@app/store/uiStore';
import { keepScreenOn } from '@platform/screen';

import { AppText, Button, Ground, Icon, IconButton, Organic, Segmented, Tappable, TopBar } from '../components';
import { KitchenTimers } from '../features/links/KitchenTimers';
import { ReadingTrack } from '../features/links/ReadingTrack';
import { servingsLine, ServingsStepper, useServings } from '../features/links/Servings';
import { useModuleSearch } from '../features/links/useModuleSearch';
import type { ScreenProps } from '../navigation/types';
import { decelerate, duration } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { fontFamily } from '../theme/typography';

type Part = 'ingredients' | 'steps';

/** A step comes in with a short shift and a fade, from the left going back. */
const stepIn = (from: number) =>
  new Keyframe({ 0: { opacity: 0, transform: [{ translateX: from }] }, 100: { opacity: 1, transform: [{ translateX: 0 }], easing: decelerate } }).duration(duration.medium);
const STEP_ON = stepIn(24);
const STEP_BACK = stepIn(-24);
/** A swipe this long turns the step. */
const SWIPE = 64;
/** A step read from arm's length: the body's family, larger. */
const STEP_TYPE = { fontSize: 22, lineHeight: 32 } as const;

const open = (url: string) => Linking.openURL(url).catch(() => showSnack(t('Impossible d’ouvrir ce lien'), undefined, { tone: 'error' }));

export function CookingScreen({ navigation, route }: ScreenProps<'Cooking'>) {
  const { id } = route.params;
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const link = useLibraryStore(s => s.links[id]);
  const { factor, base, unit } = useServings(id);
  const timing = useKitchenStore(s => s.timers.length > 0);
  const { phase, search } = useModuleSearch((_fresh, signal) => readRecipe(id, true, signal));
  // Until the person picks: the steps, when the recipe gives some.
  const [part, setPart] = useState<Part | null>(null);
  const [place, setPlace] = useState({ step: 0, back: false });
  const [ticked, setTicked] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    keepScreenOn(true);
    return () => keepScreenOn(false);
  }, []);

  const steps = phase.kind === 'ready' ? phase.answer.steps : [];
  const count = steps.length;
  const turn = useCallback(
    (by: 1 | -1) =>
      setPlace(current => {
        const step = Math.max(0, Math.min(count - 1, current.step + by));
        return step === current.step ? current : { step, back: by < 0 };
      }),
    [count],
  );
  // Sideways only: a scroll starting up or down stays a scroll.
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-24, 24])
        .failOffsetY([-16, 16])
        .onEnd(event => {
          if (event.translationX <= -SWIPE) runOnJS(turn)(1);
          else if (event.translationX >= SWIPE) runOnJS(turn)(-1);
        }),
    [turn],
  );

  if (!link) {
    return (
      <View style={styles.screen}>
        <TopBar onBack={() => navigation.goBack()} />
      </View>
    );
  }

  const ready = phase.kind === 'ready' ? phase.answer : null;
  const lines = ready ? ready.ingredients.map(line => scaleIngredient(line, factor)) : [];
  const shown: Part = count === 0 ? 'ingredients' : lines.length === 0 ? 'steps' : (part ?? 'steps');
  const at = Math.min(place.step, Math.max(0, count - 1));
  const current = steps[at];
  const stepping = ready !== null && shown === 'steps' && current !== undefined;
  const toggle = (index: number) =>
    setTicked(previous => {
      const next = new Set(previous);
      if (!next.delete(index)) next.add(index);
      return next;
    });

  const body = (): React.ReactNode => {
    if (phase.kind === 'asking') {
      return (
        <View style={styles.waiting} accessibilityLiveRegion="polite">
          <ReadingTrack width={120} />
          <AppText variant="body" color={theme.color.inkMuted}>
            {t('Lecture de la recette…')}
          </AppText>
        </View>
      );
    }
    if (phase.kind === 'failed') {
      return (
        <View style={styles.waiting}>
          <AppText variant="body" color={theme.color.danger} accessibilityLiveRegion="polite">
            {t('La recette n’a pas pu être lue : {reason}', { reason: phase.reason })}
          </AppText>
          <Button kind="text" label={t('Réessayer')} onPress={() => search(false)} style={styles.retry} />
        </View>
      );
    }
    const words = servingsLine(phase.answer.servings, base, factor, unit);
    const ingredients = (
      <View>
        {words ? (
          <AppText variant="meta" style={styles.servings}>
            {words}
          </AppText>
        ) : null}
        {lines.map((line, index) => (
          <IngredientRow key={`${index}-${line}`} text={line} ticked={ticked.has(index)} onToggle={() => toggle(index)} />
        ))}
      </View>
    );
    return (
      <ScrollView contentContainerStyle={[styles.scroll, stepping || timing ? null : { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {lines.length > 0 ? <ServingsStepper id={id} /> : null}
        {count > 0 && lines.length > 0 ? (
          <Segmented<Part>
            value={shown}
            onChange={setPart}
            options={[
              { value: 'steps', label: t('Étapes') },
              { value: 'ingredients', label: t('Ingrédients') },
            ]}
          />
        ) : null}
        {stepping ? (
          <GestureDetector gesture={swipe}>
            <View collapsable={false} style={styles.stepArea}>
              <Animated.View key={at} entering={place.back ? STEP_BACK : STEP_ON} style={styles.step}>
                <StepView id={id} step={current} index={at} count={count} />
              </Animated.View>
            </View>
          </GestureDetector>
        ) : (
          <>
            {count === 0 ? (
              <Organic outline="panel" style={styles.notice}>
                <AppText variant="body">{t('Cette page ne donne pas ses étapes : suivez-la sur le site.')}</AppText>
                <Button kind="tonal" label={t('Ouvrir la recette')} icon="external" onPress={() => open(link.url)} />
              </Organic>
            ) : null}
            {ingredients}
          </>
        )}
      </ScrollView>
    );
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={link.title || linkShop(link)} onBack={() => navigation.goBack()} actions={<IconButton icon="external" label={t('Ouvrir la recette')} onPress={() => open(link.url)} />} />
      <View style={styles.fill}>{body()}</View>
      {stepping || timing ? (
        <View style={[styles.foot, { paddingBottom: insets.bottom + 12 }]}>
          <KitchenTimers linkId={id} />
          {stepping ? (
            <View style={styles.turns}>
              <Button kind="text" label={t('Précédente')} accessibilityLabel={t('Étape précédente')} icon="back" disabled={at === 0} onPress={() => turn(-1)} />
              {at < count - 1 ? (
                <Button label={t('Suivante')} accessibilityLabel={t('Étape suivante')} icon="arrowRight" onPress={() => turn(1)} style={styles.next} />
              ) : (
                <Button label={t('Terminé')} icon="check" onPress={() => navigation.goBack()} style={styles.next} />
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** A step: its part of the recipe, where it stands, its words with their durations marked, and a timer for each. */
function StepView({ id, step, index, count }: { id: string; step: RecipeStep; index: number; count: number }) {
  const styles = useThemedStyles(makeStyles);
  const timers = stepTimers(step.text);
  const label = t('Étape {n}', { n: index + 1 });
  const words: React.ReactNode[] = [];
  let cursor = 0;
  timers.forEach((timer, at) => {
    if (timer.start > cursor) words.push(step.text.slice(cursor, timer.start));
    words.push(
      <AppText key={at} variant="editorBody" style={styles.duration}>
        {step.text.slice(timer.start, timer.end)}
      </AppText>,
    );
    cursor = timer.end;
  });
  if (cursor < step.text.length) words.push(step.text.slice(cursor));
  return (
    <>
      <AppText variant="metaStrong">
        {t('Étape {n} sur {total}', { n: index + 1, total: count })}
        {step.section ? ` · ${step.section}` : ''}
      </AppText>
      <AppText variant="editorBody" style={styles.stepText}>
        {words}
      </AppText>
      {timers.length > 0 ? (
        <View style={styles.timers}>
          {timers.map((timer, at) => {
            const written = step.text.slice(timer.start, timer.end).trim();
            return <Button key={at} kind="tonal" small icon="clock" label={written} accessibilityLabel={t('Lancer un minuteur de {duration}', { duration: written })} onPress={() => startTimer(id, label, timer.seconds)} />;
          })}
        </View>
      ) : null}
    </>
  );
}

/** The row is the checkbox: an ingredient at the quantity cooked; ticked, it dims (no line through it). */
function IngredientRow({ text, ticked, onToggle }: { text: string; ticked: boolean; onToggle: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Tappable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: ticked }} accessibilityLabel={text} style={styles.ingredient}>
      <Icon name={ticked ? 'boxChecked' : 'box'} size={24} color={ticked ? theme.color.inkMuted : theme.color.ink} />
      <AppText variant="editorBody" color={ticked ? theme.color.inkMuted : undefined} style={styles.fill}>
        {text}
      </AppText>
    </Tappable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.paper },
    fill: { flex: 1 },
    waiting: { gap: 16, paddingHorizontal: 20, paddingTop: 16, alignItems: 'flex-start' },
    // Its label lines up with the words above.
    retry: { marginLeft: -14 },
    scroll: { flexGrow: 1, gap: 16, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
    // The whole room under the parts takes the swipe, not only the words.
    stepArea: { flexGrow: 1 },
    step: { gap: 16 },
    stepText: STEP_TYPE,
    duration: { ...STEP_TYPE, fontFamily: fontFamily(theme, 'SemiBold') },
    timers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    // In line with the rows' marks.
    servings: { paddingBottom: 4 },
    ingredient: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: -10, paddingHorizontal: 10, paddingVertical: 8, ...corners(SHAPES.tab) },
    notice: { gap: 12, alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: theme.color.paperHigh },
    foot: { gap: 10, paddingHorizontal: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.color.hairline },
    turns: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    next: { flex: 1 },
  });
