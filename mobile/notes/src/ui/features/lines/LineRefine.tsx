/**
 * A collection's layout, order and filter (`notes/services/lineView`), the web's in the phone's way:
 * the layout from its glyph in the head's top bar (`LAYOUT_GLYPHS`; its sheet names each with what
 * it is for), two quiet buttons at the list's end, each saying what is applied (in the matcha wash while set apart
 * from the default) and opening a sheet of choices, the chosen one ticked. A filter that keeps
 * nothing, and an order by price with fewer than two prices, wait in the second ink. The sheets
 * are mounted at the screen's root (`LineViewSheets`), the buttons in the list's head.
 *
 * Beside them, what the page says when Claude could read some of its links now (« Tout lire »),
 * and when its filter keeps nothing (« Tout afficher »).
 */
import React, { memo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import { GEOMETRY } from '@unlease/design/palette';
import { concentric, CORNER_CAP, RADII, SHAPES } from '@unlease/design/shapes';
import { emptyFilterSentence, LINE_FILTER_NAMES, LINE_FILTERS, LINE_LAYOUT_HINTS, LINE_LAYOUT_NAMES, LINE_LAYOUTS, LINE_SORT_NAMES, LINE_SORTS, type LineFilter, type LineLayout, type LineView } from '@unlease/notes/services/lineView';

import { AppText, Button, Icon, Organic, settleIn, Sheet, SheetScroll, Tappable } from '../../components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

export type LineViewSheet = 'layout' | 'filter' | 'sort';

/** Each layout's glyph, on its button and in its sheet (the web's switch). */
export const LAYOUT_GLYPHS: Readonly<Record<LineLayout, GlyphName>> = { list: 'thumbRows', gallery: 'grid', mosaic: 'masonry', table: 'table' };

/** 40 high (48 with its slop), as the web's under a finger. */
const REFINE_SLOP = { top: 4, bottom: 4, left: 2, right: 2 } as const;

function RefineButton({ icon, value, label, active, onPress }: { icon: GlyphName; value: string; label: string; active: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const ink = active ? theme.color.onActionContainer : theme.color.inkMuted;
  return (
    <Tappable onPress={onPress} hitSlop={REFINE_SLOP} accessibilityRole="button" accessibilityLabel={label} style={[styles.refine, active ? styles.refineActive : null]}>
      <Icon name={icon} size={18} color={ink} />
      <AppText variant={active ? 'labelStrong' : 'label'} color={ink} numberOfLines={1} style={styles.shrink}>
        {value}
      </AppText>
      <Icon name="chevronDown" size={16} color={ink} />
    </Tappable>
  );
}

export interface LineRefineBarProps {
  readonly view: LineView;
  readonly onOpen: (sheet: LineViewSheet) => void;
}

function LineRefineBarComponent({ view, onOpen }: LineRefineBarProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.bar}>
      <RefineButton icon="eye" value={LINE_FILTER_NAMES[view.filter]} label={t('Links shown: {filter}', { filter: LINE_FILTER_NAMES[view.filter] })} active={view.filter !== 'all'} onPress={() => onOpen('filter')} />
      <RefineButton icon="sort" value={LINE_SORT_NAMES[view.sort]} label={t('Order: {order}', { order: LINE_SORT_NAMES[view.sort] })} active={view.sort !== 'own'} onPress={() => onOpen('sort')} />
    </View>
  );
}

export const LineRefineBar = memo(LineRefineBarComponent);

/** A choice in the sheet: the suite's list row (56, the words 16 in), its count and its tick at the end; one with nothing to show waits in the second ink. A layout's leads with its glyph and says under its name what it is for. */
function ChoiceRow({ title, hint, icon, count, chosen, disabled, onPress }: { title: string; hint?: string; icon?: GlyphName; count?: number; chosen: boolean; disabled: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      ownDisabled
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityValue={count !== undefined ? { text: String(count) } : undefined}
      accessibilityState={{ selected: chosen, disabled }}
      style={styles.choice}
    >
      {icon ? <Icon name={icon} size={24} color={chosen ? theme.color.focus : theme.color.inkMuted} /> : null}
      {hint ? (
        <View style={styles.fill}>
          <AppText variant="body">{title}</AppText>
          <AppText variant="meta">{hint}</AppText>
        </View>
      ) : (
        <AppText variant="body" color={disabled ? theme.color.inkMuted : undefined} style={styles.fill}>
          {title}
        </AppText>
      )}
      {count !== undefined ? <AppText variant="meta">{String(count)}</AppText> : null}
      <View style={styles.tick}>{chosen ? <Icon name="check" size={20} color={theme.color.focus} /> : null}</View>
    </Tappable>
  );
}

export interface LineViewSheetsProps {
  readonly open: LineViewSheet | null;
  readonly view: LineView;
  readonly counts: Readonly<Record<LineFilter, number>>;
  /** How many links have a price. */
  readonly priced: number;
  readonly onChange: (view: LineView) => void;
  readonly onDismiss: () => void;
}

export function LineViewSheets({ open, view, counts, priced, onChange, onDismiss }: LineViewSheetsProps) {
  const choose = (next: LineView): void => {
    onChange(next);
    onDismiss();
  };
  return (
    <>
      <Sheet visible={open === 'layout'} onDismiss={onDismiss} title={t('Show as')}>
        <SheetScroll>
          {LINE_LAYOUTS.map(layout => (
            <ChoiceRow
              key={layout}
              icon={LAYOUT_GLYPHS[layout]}
              title={LINE_LAYOUT_NAMES[layout]}
              hint={LINE_LAYOUT_HINTS[layout]}
              chosen={layout === view.layout}
              disabled={false}
              onPress={() => choose({ ...view, layout })}
            />
          ))}
        </SheetScroll>
      </Sheet>
      <Sheet visible={open === 'filter'} onDismiss={onDismiss} title={t('Show')}>
        <SheetScroll>
          {LINE_FILTERS.map(filter => (
            <ChoiceRow
              key={filter}
              title={LINE_FILTER_NAMES[filter]}
              count={counts[filter]}
              chosen={filter === view.filter}
              disabled={filter !== view.filter && counts[filter] === 0}
              onPress={() => choose({ ...view, filter })}
            />
          ))}
        </SheetScroll>
      </Sheet>
      <Sheet visible={open === 'sort'} onDismiss={onDismiss} title={t('Sort')}>
        <SheetScroll>
          {LINE_SORTS.map(sort => (
            <ChoiceRow
              key={sort}
              title={LINE_SORT_NAMES[sort]}
              chosen={sort === view.sort}
              // Two prices at least, or there is nothing to order by.
              disabled={sort !== view.sort && (sort === 'priceUp' || sort === 'priceDown') && priced < 2}
              onPress={() => choose({ ...view, sort })}
            />
          ))}
        </SheetScroll>
      </Sheet>
    </>
  );
}

/** Links Claude could read now, here: what it would cost, and one press to send them all (the bin's banner well). */
/** `style`: where it stands, when not in a collection's add strip's margins (a template's form). */
export function ReadAllBanner({ text, action, onRead, style }: { text: string; action: string; onRead: () => void; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  // Its button stands in its right corners, 8 in: its corners there concentric with the banner's as drawn (a short sheet's are capped), the others a button's.
  const [corner, setCorner] = useState<number | null>(null);
  const measure = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setCorner(concentric(Math.min(RADII.panel, CORNER_CAP * Math.min(width, height)), BANNER_END));
  };
  return (
    <Organic style={[styles.banner, style]} onLayout={measure} accessibilityLiveRegion="polite">
      <Icon name="sparkle" size={20} color={theme.color.inkMuted} />
      <AppText variant="meta" color={theme.color.ink} style={styles.fill}>
        {text}
      </AppText>
      <Button kind="tonal" small label={action} onPress={onRead} style={corner === null ? undefined : { borderTopRightRadius: corner, borderBottomRightRadius: corner }} />
    </Organic>
  );
}

/** The filter keeps none of the collection's links: what it looked for, and the way back to all (the empty collection's dashed sheet). It settles in as that sheet does, afresh for another filter. */
export function FilteredEmpty({ filter, collection, onClear }: { filter: LineFilter; collection: string; onClear: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const sentence = emptyFilterSentence(filter, collection);
  return (
    <Animated.View key={sentence} entering={settleIn} accessibilityLiveRegion="polite">
      <Organic outline="panel" style={styles.empty}>
        <AppText variant="body" color={theme.color.inkMuted} style={styles.emptyText}>
          {sentence}
        </AppText>
        <Button kind="text" small label={t('Show all')} onPress={onClear} />
      </Organic>
    </Animated.View>
  );
}

/** How far the banner's button stands in from its end, its top and its foot. */
const BANNER_END = 8;

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // At the list's end, over the prices, its last chevron in line with the add strip's button.
    bar: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: GEOMETRY.rowGap, marginHorizontal: 16, marginTop: 4 },
    refine: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, maxWidth: '100%', paddingLeft: 8, paddingRight: 6, ...corners(SHAPES.small) },
    refineActive: { backgroundColor: theme.color.actionContainer },
    shrink: { flexShrink: 1 },
    choice: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 6, marginVertical: GEOMETRY.rowGap / 2, paddingHorizontal: 10, paddingVertical: 8, ...corners(SHAPES.tab) },
    fill: { flex: 1 },
    tick: { width: 20, alignItems: 'center' },
    // In the add strip's margins, as the bin's banner sits in its place.
    banner: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, marginTop: 4, marginBottom: 4, paddingLeft: 14, paddingRight: BANNER_END, paddingVertical: BANNER_END, backgroundColor: theme.color.paperHigh, ...corners(SHAPES.panel) },
    // Dashed in the outline's ink (the empty collection's).
    empty: { alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 12, paddingHorizontal: 28, paddingTop: 28, paddingBottom: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.color.outline },
    emptyText: { textAlign: 'center' },
  });
