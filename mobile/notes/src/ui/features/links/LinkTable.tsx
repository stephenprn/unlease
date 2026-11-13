/**
 * A collection as a table (`LineLayout` `table`, the web's `LinkTable`): a line per link on one
 * sheet of paper, its picture small and its title held at the left while the other columns scroll
 * sideways under them (a hairline at that edge once they do): where it comes from, its price, a
 * column for each fact most of its links carry (`lineColumns`), the owner's note when one carries
 * any, the day it was saved. The price and the day order the table from their heads (the order's
 * button says the same). The links done follow under « Déjà faits », faded as their rows are.
 *
 * Every line stands at one height, so the held titles and the scrolling columns stay in step. A
 * line pressed (either half) opens the link's page, held it moves the link, as a row.
 */
import React, { memo, useMemo, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { t } from '@unlease/core/i18n';
import { formatDay } from '@unlease/core/services/format';
import { columnValue, lineColumns, type LineColumn } from '@unlease/notes/services/lineTable';
import { linkRowText, noteLine } from '@unlease/notes/services/linkRow';
import type { LineSort } from '@unlease/notes/services/lineView';
import { SHAPES } from '@unlease/design/shapes';
import { useBlobSource } from '@shared/app/hooks/useImageSource';
import { selectCanRead, useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, Icon, Organic, Tappable } from '../../components';
import { ReadingTrack } from '@shared/ui/components/ReadingTrack';
import { listPressDelay } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { KIND_ICONS } from './kindIcon';

const LINE = 56;
const HEAD = 44;
const GROUP = 52;
const LEAD = 188;
const WIDTHS = { site: 132, price: 104, fact: 140, note: 184, added: 92 } as const;

interface Columns {
  readonly facts: readonly LineColumn[];
  readonly notes: boolean;
}

interface LineProps {
  readonly id: string;
  readonly pressed: boolean;
  readonly onPressed: (id: string | null) => void;
  readonly onOpen: (id: string) => void;
  readonly onLongPress?: (id: string) => void;
}

/** The held half of a line: its picture small and its title. */
const LeadCell = memo(function LeadCell({ id, pressed, onPressed, onOpen, onLongPress }: LineProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const link = useLibraryStore(s => s.links[id]);
  const source = useBlobSource(link?.imageIds[0]);
  const [unloaded, setUnloaded] = useState<readonly string[]>([]);
  const reading = useSettingsStore(selectCanRead);
  if (!link) return <View style={styles.line} />;
  const { title, source: site, price } = linkRowText(link);
  const kept = source && !unloaded.includes(source.uri) ? source : null;
  const image = kept ?? (link.imageUrl && !unloaded.includes(link.imageUrl) ? { uri: link.imageUrl } : null);
  const failed = link.status === 'failed';
  const pending = link.status === 'pending' && reading;
  const muted = link.done || !link.title;
  return (
    <Tappable
      noTint
      unstable_pressDelay={listPressDelay}
      onPressIn={() => onPressed(id)}
      onPressOut={() => onPressed(null)}
      onPress={() => onOpen(id)}
      onLongPress={() => onLongPress?.(id)}
      accessibilityLabel={[title, site, pending ? null : price, failed ? (link.error ? t(link.error) : t('Couldn’t read it')) : null].filter(Boolean).join(', ')}
      accessibilityActions={[{ name: 'open', label: t('Open the link') }]}
      onAccessibilityAction={() => Linking.openURL(link.url).catch(() => showSnack(t('Couldn’t open this link'), undefined, { tone: 'error' }))}
      style={[styles.line, styles.lead, pressed ? styles.pressed : null]}
    >
      <Organic style={[styles.thumb, image ? styles.thumbPicture : null, link.done ? styles.faded : null]}>
        {image ? (
          <Image source={image} style={[StyleSheet.absoluteFill, theme.mode === 'dark' ? styles.photoNight : styles.photoDay]} resizeMode="cover" onError={() => setUnloaded(lost => [...lost, image.uri])} />
        ) : (
          <Icon name={KIND_ICONS[link.kind]} size={18} color={theme.color.inkMuted} />
        )}
      </Organic>
      {failed ? <Icon name="alert" size={16} color={theme.color.danger} /> : null}
      <AppText variant="bodyStrong" numberOfLines={1} color={muted ? theme.color.inkMuted : undefined} style={styles.shrink}>
        {title}
      </AppText>
    </Tappable>
  );
});

/** The half that scrolls: its columns. */
const RestCells = memo(function RestCells({ id, pressed, onPressed, onOpen, onLongPress, columns }: LineProps & { readonly columns: Columns }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const link = useLibraryStore(s => s.links[id]);
  const reading = useSettingsStore(selectCanRead);
  if (!link) return <View style={styles.line} />;
  const pending = link.status === 'pending' && reading;
  const failed = link.status === 'failed';
  const { source, price, priceChange } = linkRowText(link);
  const ink = link.done ? theme.color.inkMuted : theme.color.ink;
  const changeInk = priceChange?.direction === 'down' && !link.done ? theme.color.ok : theme.color.inkMuted;
  return (
    <Tappable
      noTint
      unstable_pressDelay={listPressDelay}
      onPressIn={() => onPressed(id)}
      onPressOut={() => onPressed(null)}
      onPress={() => onOpen(id)}
      onLongPress={() => onLongPress?.(id)}
      // The held half says the link; this one is its columns, heard from the page itself.
      accessible={false}
      style={[styles.line, styles.rest, pressed ? styles.pressed : null]}
    >
      <View style={[styles.cell, { width: WIDTHS.site }]}>
        {pending ? (
          <ReadingTrack width={48} />
        ) : (
          <AppText variant="meta" numberOfLines={1} color={failed ? theme.color.danger : undefined}>
            {failed ? (link.error ? t(link.error) : t('Couldn’t read it')) : source}
          </AppText>
        )}
      </View>
      <View style={[styles.cell, styles.end, { width: WIDTHS.price }]}>
        {price && !pending ? (
          <View style={styles.price}>
            {priceChange ? <Icon name={priceChange.direction === 'down' ? 'arrowDown' : 'arrowUp'} size={14} color={changeInk} /> : null}
            <AppText variant="price" color={ink} numberOfLines={1}>
              {price}
            </AppText>
          </View>
        ) : null}
      </View>
      {columns.facts.map(column => (
        <View key={column.key} style={[styles.cell, { width: WIDTHS.fact }]}>
          <AppText variant="meta" numberOfLines={1} color={ink}>
            {columnValue(link, column)}
          </AppText>
        </View>
      ))}
      {columns.notes ? (
        <View style={[styles.cell, { width: WIDTHS.note }]}>
          <AppText variant="meta" numberOfLines={1} style={styles.italic}>
            {noteLine(link.comment)}
          </AppText>
        </View>
      ) : null}
      <View style={[styles.cell, styles.end, { width: WIDTHS.added }]}>
        <AppText variant="meta">{formatDay(link.createdAt, Date.now())}</AppText>
      </View>
    </Tappable>
  );
});

/** A head that orders the table: pressed, its first order, then its second, then the collection's own. */
function SortHead({ label, orders, sort, disabled, width, onSort }: { label: string; orders: readonly LineSort[]; sort: LineSort; disabled: boolean; width: number; onSort: (sort: LineSort) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const at = orders.indexOf(sort);
  const next = at === -1 ? orders[0]! : (orders[at + 1] ?? 'own');
  const up = sort === 'priceUp';
  const ink = at === -1 ? theme.color.inkMuted : theme.color.onActionContainer;
  return (
    <View style={[styles.cell, styles.end, { width }]}>
      {disabled ? (
        <AppText variant="metaStrong">{label}</AppText>
      ) : (
        <Tappable onPress={() => onSort(next)} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: at !== -1 }} hitSlop={6} style={[styles.headButton, at !== -1 ? styles.headActive : null]}>
          <AppText variant="metaStrong" color={ink}>
            {label}
          </AppText>
          {at === -1 ? null : <Icon name={up ? 'arrowUp' : 'arrowDown'} size={14} color={ink} />}
        </Tappable>
      )}
    </View>
  );
}

export interface LinkTableProps {
  readonly open: readonly string[];
  readonly done: readonly string[];
  readonly sort: LineSort;
  readonly priced: number;
  readonly onSort: (sort: LineSort) => void;
  readonly onOpen: (id: string) => void;
  readonly onLongPress?: (id: string) => void;
}

function LinkTableComponent({ open, done, sort, priced, onSort, onOpen, onLongPress }: LinkTableProps) {
  const styles = useThemedStyles(makeStyles);
  const shape = useLibraryStore(
    useShallow(s => {
      const links = [...open, ...done].flatMap(id => (s.links[id] ? [s.links[id]!] : []));
      return { facts: JSON.stringify(lineColumns(links)), notes: links.some(link => noteLine(link.comment) !== '') };
    }),
  );
  const columns: Columns = useMemo(() => ({ facts: JSON.parse(shape.facts) as LineColumn[], notes: shape.notes }), [shape.facts, shape.notes]);
  const [pressed, setPressed] = useState<string | null>(null);
  const [under, setUnder] = useState(false);
  const groups: { readonly ids: readonly string[]; readonly title: string | null }[] = [
    { ids: open, title: null },
    ...(done.length > 0 ? [{ ids: done, title: t('Done · {count}', { count: done.length }) }] : []),
  ];

  return (
    <Organic outline="panel" style={styles.sheet}>
      <View style={styles.table}>
        <View style={[styles.held, under ? styles.heldUnder : null]}>
          <View style={[styles.headRow, styles.leadHead]}>
            <AppText variant="metaStrong">{t('Link')}</AppText>
          </View>
          {groups.map(group => (
            <React.Fragment key={group.title ?? 'open'}>
              {group.title ? (
                <View style={styles.group} accessibilityRole="header">
                  <AppText variant="section" numberOfLines={1}>
                    {group.title}
                  </AppText>
                </View>
              ) : null}
              {group.ids.map(id => (
                <LeadCell key={id} id={id} pressed={pressed === id} onPressed={setPressed} onOpen={onOpen} onLongPress={onLongPress} />
              ))}
            </React.Fragment>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={32} onScroll={event => setUnder(event.nativeEvent.contentOffset.x > 0)} style={styles.flex}>
          <View>
            <View style={styles.headRow}>
              <View style={[styles.cell, { width: WIDTHS.site }]}>
                <AppText variant="metaStrong">{t('Site')}</AppText>
              </View>
              <SortHead label={t('Price')} orders={['priceUp', 'priceDown']} sort={sort} disabled={priced < 2} width={WIDTHS.price} onSort={onSort} />
              {columns.facts.map(column => (
                <View key={column.key} style={[styles.cell, { width: WIDTHS.fact }]}>
                  <AppText variant="metaStrong" numberOfLines={1}>
                    {column.label}
                  </AppText>
                </View>
              ))}
              {columns.notes ? (
                <View style={[styles.cell, { width: WIDTHS.note }]}>
                  <AppText variant="metaStrong">{t('Your note')}</AppText>
                </View>
              ) : null}
              <SortHead label={t('Added')} orders={['added']} sort={sort} disabled={false} width={WIDTHS.added} onSort={onSort} />
            </View>
            {groups.map(group => (
              <React.Fragment key={group.title ?? 'open'}>
                {group.title ? <View style={styles.group} /> : null}
                {group.ids.map(id => (
                  <RestCells key={id} id={id} pressed={pressed === id} onPressed={setPressed} onOpen={onOpen} onLongPress={onLongPress} columns={columns} />
                ))}
              </React.Fragment>
            ))}
          </View>
        </ScrollView>
      </View>
    </Organic>
  );
}

export const LinkTable = memo(LinkTableComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // In the add strip's margins, on paper.
    sheet: { marginHorizontal: 12, marginTop: 8, overflow: 'hidden', backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.outline },
    table: { flexDirection: 'row' },
    held: { width: LEAD, zIndex: 1, backgroundColor: theme.color.paper },
    heldUnder: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: theme.color.hairline },
    headRow: { flexDirection: 'row', alignItems: 'center', height: HEAD, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.color.hairline },
    leadHead: { paddingHorizontal: 14 },
    group: { height: GROUP, justifyContent: 'flex-end', paddingHorizontal: 14, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.color.hairline },
    line: { height: LINE, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.color.hairline },
    lead: { gap: 10, paddingLeft: 10, paddingRight: 12 },
    rest: {},
    // The press across both halves of the line, in the ground's ink as every press.
    pressed: { backgroundColor: theme.press.tint },
    cell: { paddingHorizontal: 12, justifyContent: 'center', height: '100%' },
    end: { alignItems: 'flex-end' },
    price: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    thumb: { width: 32, height: 40, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.paperHigh, borderWidth: 1, borderColor: theme.color.outline, ...corners(SHAPES.detail) },
    thumbPicture: { backgroundColor: theme.color.paper, isolation: 'isolate' },
    photoDay: { mixBlendMode: 'multiply' },
    photoNight: { opacity: 0.86 },
    faded: { opacity: 0.55 },
    headButton: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, marginRight: -8, paddingHorizontal: 8, ...corners(SHAPES.small) },
    headActive: { backgroundColor: theme.color.actionContainer },
    italic: { fontStyle: 'italic' },
    shrink: { flexShrink: 1 },
    flex: { flex: 1 },
  });
