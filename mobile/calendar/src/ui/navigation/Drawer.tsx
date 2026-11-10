/**
 * Agenda's drawer, in the suite's frame (`NavDrawer`), as Google's but short: « Aujourd'hui » (the day
 * at a glance) as a place of its own over the calendar's views, a grid of six tiles; the labels (each narrows the calendar to its events); the calendars one subscribes to
 * and the holidays, each shown or hidden on every device, with what the other apps bring (birthdays,
 * Carnet's reminders, Pages' days, the weather) as toggles, two a row, shown or not on this phone (a
 * long press on either offers « Afficher uniquement celui-ci », and « Tout afficher »); Claude (while
 * the server offers the questions and has a key), the bin,
 * the settings (where the import is) and the Administration at the foot; the suite's other apps under
 * them (`NavDrawer`). What the top bar already does (a day, the search) is not repeated here.
 */
import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { APPS } from '@unlease/core/apps';
import { t, tc } from '@unlease/core/i18n';
import { PERIOD_VIEWS, VIEW_NAMES, type CalendarView } from '@unlease/calendar/services/eventText';
import { feedName } from '@unlease/calendar/services/holidays';
import { feedKey, layerKey, shownChoices, shownNow, type Shown } from '@unlease/calendar/services/shown';
import type { LineColor } from '@unlease/design/colors';
import type { GlyphName } from '@unlease/design/glyphs';
import { GEOMETRY } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import type { CalendarPrefs } from '@unlease/calendar/models/prefs';
import { selectPrefs, setPrefs, useCalendarUiStore } from '@app/store/calendarUi';
import { updateFeed } from '@app/store/actions';
import { showAllCalendars, showOnlyCalendar } from '@app/store/shown';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectCalendarAsk, useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Icon, LabelTag, ListRow, Sheet, SwitchMark, Tappable } from '@shared/ui/components';
import type { TappableProps } from '@shared/ui/components/Tappable';
import { listPressDelay } from '@shared/ui/theme/motion';
import { FeedStone } from '../features/calendar/FeedStone';
import { DrawerDivider, DrawerHeading, DrawerItem, NavDrawer, useDrawerGo } from '@shared/ui/components/NavDrawer';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

export type DrawerPlace = `view:${CalendarView}` | `label:${string}` | 'labels' | 'feeds' | 'ask' | 'trash' | 'settings' | 'admin';

export interface DrawerProps {
  readonly open: boolean;
  readonly view: CalendarView;
  readonly label: string | null;
  readonly onClose: () => void;
  readonly onPlace: (place: DrawerPlace) => void;
}

/** The views' glyphs: « Aujourd'hui »'s row, the tiles', and the « Changer de vue » menu's. */
export const VIEW_GLYPHS: Readonly<Record<CalendarView, GlyphName>> = { today: 'today', schedule: 'list', day: 'rows', threeDays: 'columns', week: 'grid', month: 'calendar', year: 'apps' };

/** What the other apps lay on the calendar, each a chip shown or not on this phone. */
type Layer = 'birthdays' | 'noteReminders' | 'pageDates' | 'weather';
const LAYER_GLYPHS: Readonly<Record<Layer, GlyphName>> = { birthdays: 'cake', noteReminders: 'bell', pageDates: 'page', weather: 'sun' };

/** The views, a grid of six tiles (three by two): the chosen one on the primary's wash, as a chosen row. */
const ViewTiles = memo(function ViewTiles({ chosen, onView }: { chosen: CalendarView | null; onView: (view: CalendarView) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const go = useDrawerGo();
  const order: CalendarView[] = ['schedule', ...PERIOD_VIEWS.filter(each => each !== 'schedule')];
  return (
    <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel={t('Vue')}>
      {order.map(each => {
        const on = each === chosen;
        const ink = on ? theme.color.onActionContainer : theme.color.ink;
        return (
          <Tappable
            key={each}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={VIEW_NAMES[each]}
            onPress={go(() => onView(each))}
            style={[styles.tile, on ? { backgroundColor: theme.color.actionContainer } : null]}
          >
            <Icon name={VIEW_GLYPHS[each]} size={24} color={ink} solid={on} />
            <AppText variant={on ? 'labelStrong' : 'label'} color={ink} numberOfLines={1}>
              {VIEW_NAMES[each]}
            </AppText>
          </Tappable>
        );
      })}
    </View>
  );
});

/**
 * A calendar as a switch row in the drawer's own geometry (`DrawerItem`'s: 52 high, its stone in the
 * marks' 24 slot, its name in label on the names' column), so it lines up with the labels above; a
 * press shows or hides it and leaves the drawer open.
 */
function FeedRow({ id, name, color, shown, onPress, hold }: { id: string; name: string; color: LineColor; shown: boolean; onPress: () => void; hold: Hold }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Tappable unstable_pressDelay={listPressDelay} accessibilityRole="switch" accessibilityState={{ checked: shown }} accessibilityLabel={name} onPress={onPress} {...hold} style={styles.feed}>
      <View style={styles.markSlot}>
        <FeedStone id={id} color={color} />
      </View>
      <AppText variant="label" numberOfLines={1} style={styles.feedName}>
        {name}
      </AppText>
      <SwitchMark checked={shown} />
    </Tappable>
  );
}

/** A layer as a toggle, two a row: its glyph and name, edged while hidden, filled with the primary's wash (its glyph solid) while shown. */
function LayerToggle({ title, icon, on, onPress, hold }: { title: string; icon: GlyphName; on: boolean; onPress: () => void; hold: Hold }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const ink = on ? theme.color.onActionContainer : theme.color.inkMuted;
  return (
    <Tappable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={title}
      onPress={onPress}
      {...hold}
      style={[styles.layer, on ? { backgroundColor: theme.color.actionContainer, borderColor: theme.color.focus } : null]}
    >
      <Icon name={icon} size={20} color={ink} solid={on} />
      <AppText variant="label" color={on ? theme.color.onActionContainer : theme.color.ink} numberOfLines={2} style={styles.layerName}>
        {title}
      </AppText>
    </Tappable>
  );
}

/** What a long press on a calendar or a layer brings: its sheet, and the same as TalkBack's actions. */
type Hold = Pick<TappableProps, 'onLongPress' | 'accessibilityActions' | 'onAccessibilityAction'>;
interface Held {
  readonly key: string;
  readonly name: string;
}

/** `key` alone shown; the slip takes it back. */
function onlyThis(key: string): void {
  showSnack(t('Les autres agendas sont masqués'), { label: tc('undo', 'Annuler'), run: showOnlyCalendar(key) }, { tone: 'success' });
}

/** What showed before (every calendar, when nothing is remembered); the slip takes it back. */
function everyCalendar(): void {
  showSnack(t('Les agendas sont de nouveau affichés'), { label: tc('undo', 'Annuler'), run: showAllCalendars() }, { tone: 'success' });
}

/** A calendar held down: its name, « Afficher uniquement celui-ci » unless it shows alone, « Tout afficher » while one shows alone (or none). */
function ShownSheet({ held, listed, onDismiss }: { held: Held | null; listed: Shown; onDismiss: () => void }) {
  // Kept while the sheet leaves, so its title and rows do not change on the way out.
  const [shown, setShown] = useState(held);
  if (held && held !== shown) setShown(held);
  const choices = shown ? shownChoices(listed, shown.key) : { only: false, all: false };
  const act = (run: () => void) => () => {
    onDismiss();
    run();
  };
  return (
    <Sheet visible={held !== null} onDismiss={onDismiss} title={shown?.name}>
      {choices.only && shown ? <ListRow icon="eye" title={t('Afficher uniquement celui-ci')} onPress={act(() => onlyThis(shown.key))} /> : null}
      {choices.all ? <ListRow icon="restore" title={t('Tout afficher')} onPress={act(everyCalendar)} /> : null}
    </Sheet>
  );
}

function DrawerComponent({ open, view, label, onClose, onPlace }: DrawerProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const prefs = useCalendarUiStore(selectPrefs);
  const labelOrder = useLibraryStore(s => s.calendarLabelOrder);
  const labels = useLibraryStore(s => s.calendarLabels);
  const feedOrder = useLibraryStore(s => s.feedOrder);
  const feeds = useLibraryStore(s => s.feeds);
  // As on the web: only while the server offers the questions and Claude has a key.
  const ask = useSettingsStore(selectCalendarAsk);
  const layers: { readonly key: Layer; readonly title: string }[] = [
    // Each named with the app it comes from, as on the web.
    { key: 'birthdays', title: t('Anniversaires ({app})', { app: APPS.contacts.name }) },
    { key: 'noteReminders', title: t('Rappels de {app}', { app: APPS.notes.name }) },
    { key: 'pageDates', title: t('Dates des pages ({app})', { app: APPS.pages.name }) },
    { key: 'weather', title: t('Météo') },
  ];
  const flip = (key: Layer): void => setPrefs({ [key]: !prefs[key] } as Partial<CalendarPrefs>);
  // A calendar or a layer held down: « Afficher uniquement celui-ci », « Tout afficher » (a sheet; TalkBack's actions too).
  const listed = useMemo(() => shownNow({ feeds: Object.values(feeds), prefs }), [feeds, prefs]);
  const [holding, setHolding] = useState<Held | null>(null);
  const holdOf = (key: string, name: string): Hold => {
    const choices = shownChoices(listed, key);
    const actions = [...(choices.only ? [{ name: 'only', label: t('Afficher uniquement celui-ci') }] : []), ...(choices.all ? [{ name: 'all', label: t('Tout afficher') }] : [])];
    if (actions.length === 0) return {};
    return {
      onLongPress: () => setHolding({ key, name }),
      accessibilityActions: actions,
      onAccessibilityAction: event => (event.nativeEvent.actionName === 'only' ? onlyThis(key) : everyCalendar()),
    };
  };
  return (
    <>
      <NavDrawer open={open} app="calendar" onClose={onClose}>
        {/* A seventh tile would stand alone on its row: « Aujourd'hui » is a place over the six, a row as the others are, its own the whole width. */}
        <DrawerItem label={VIEW_NAMES.today} icon={VIEW_GLYPHS.today} selected={!label && view === 'today'} onPress={() => onPlace('view:today')} />
        <ViewTiles chosen={label ? null : view} onView={each => onPlace(`view:${each}`)} />
        <DrawerDivider />
        <DrawerHeading title={t('Libellés')} action={labelOrder.length > 0 ? { label: t('Modifier'), accessibilityLabel: t('Gérer les libellés'), onPress: () => onPlace('labels') } : undefined} />
        {labelOrder.map(id => {
          const each = labels[id];
          if (!each) return null;
          return <DrawerItem key={id} label={each.name} selected={label === id} onPress={() => onPlace(`label:${id}`)} leading={<LabelTag color={each.color} size={20} />} wash={theme.line[each.color].tint} />;
        })}
        {labelOrder.length === 0 ? <DrawerItem label={t('Créer un libellé')} icon="tag" onPress={() => onPlace('labels')} /> : null}
        <DrawerDivider />
        <DrawerHeading title={t('Autres agendas')} action={{ label: t('Modifier'), accessibilityLabel: t('Gérer les abonnements'), onPress: () => onPlace('feeds') }} />
        {feedOrder.map(id => {
          const feed = feeds[id];
          if (!feed) return null;
          const name = feedName(feed) || t('Agenda sans nom');
          return <FeedRow key={id} id={id} name={name} color={feed.color} shown={!feed.hidden} onPress={() => updateFeed(id, { hidden: !feed.hidden })} hold={holdOf(feedKey(id), name)} />;
        })}
        {feedOrder.length === 0 ? <DrawerItem label={t('S’abonner à un agenda')} icon="plus" onPress={() => onPlace('feeds')} /> : null}
        <View style={styles.layers} accessibilityLabel={t('Des autres applications')}>
          {layers.map(layer => (
            <LayerToggle key={layer.key} title={layer.title} icon={LAYER_GLYPHS[layer.key]} on={prefs[layer.key]} onPress={() => flip(layer.key)} hold={holdOf(layerKey(layer.key), layer.title)} />
          ))}
        </View>
        <DrawerDivider />
        {ask ? <DrawerItem label={t('Demander à Claude')} icon="sparkle" onPress={() => onPlace('ask')} /> : null}
        <DrawerItem label={t('Corbeille')} icon="trash" onPress={() => onPlace('trash')} />
        <DrawerItem label={t('Réglages')} icon="settings" onPress={() => onPlace('settings')} />
        <DrawerItem label={t('Administration')} icon="server" onPress={() => onPlace('admin')} />
      </NavDrawer>
      {/* Over the drawer, which stays open: its switches show what changed. */}
      <ShownSheet held={holding} listed={listed} onDismiss={() => setHolding(null)} />
    </>
  );
}

export const Drawer = memo(DrawerComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Three tiles a row, 4 apart as rows are, so a press never runs into the next tile.
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: GEOMETRY.rowGap, paddingBottom: 4 },
    tile: { width: '32.4%', flexGrow: 1, height: 68, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4, ...corners(SHAPES.tab) },
    // Two a row, twice the rows' gap apart: their edges need the room a tint does not.
    layers: { flexDirection: 'row', flexWrap: 'wrap', gap: GEOMETRY.rowGap * 2, paddingTop: 8, paddingBottom: 4 },
    // 10 in and 8 to the name: « Anniversaires » keeps its line in a chip of a 360 phone's drawer.
    layer: { width: '48.6%', flexGrow: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: theme.color.edge, ...corners(SHAPES.chip) },
    layerName: { flexShrink: 1 },
    // `DrawerItem`'s geometry, number for number.
    feed: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, ...corners(SHAPES.tab) },
    markSlot: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    feedName: { flex: 1 },
  });
