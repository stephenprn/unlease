/**
 * Agenda's places as the shell draws them, and its frame: the navigation (Google Agenda's side:
 * the month in small, « Mes agendas » with one's own events and each label ticked or not,
 * « Autres agendas » with the subscriptions and the holidays, what the other apps add; the bin at its
 * foot: the import and the export are in Réglages, as on the phone), « Ajouter en quelques mots »
 * beside the search, the tab's title of each place.
 */
import { useMemo, useRef, useState, type AnimationEvent } from 'react';

import { APPS } from '@unlease/core/apps';
import { getLocale, t } from '@unlease/core/i18n';
import { spotKey } from '@unlease/core/services/spotlight';
import { readQuickAdd } from '@unlease/calendar/services/quickAdd';
import { stepDay } from '@unlease/calendar/services/eventText';
import { feedName } from '@unlease/calendar/services/holidays';
import { aloneShown, feedKey, labelKey, layerKey, OWN_KEY, shownChoices, type Shown } from '@unlease/calendar/services/shown';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import { addDays, deviceZone, instantToWall, monthGrid, startOfMonth } from '@unlease/calendar/services/time';

import { useSettingsStore } from '@shared/app/store/settings';
import { useServerSettingsStore } from '@shared/app/store/serverSettings';
import { showError } from '@shared/app/store/ui';
import { Icon } from '@shared/ui/components/Icon';
import { LabelCheck } from '@shared/ui/components/LabelMark';
import { Menu, type MenuItem } from '@shared/ui/components/Menu';
import { PebbleEdge } from '@shared/ui/components/Outline';
import { isApple } from '@shared/ui/dom';
import { NavFold, NavGlyph, NavRow, navStyles } from '@shared/ui/navigation/NavParts';
import shell from '@shared/ui/navigation/shell.module.css';
import { navigate, type Arrival, type Route } from '@shared/ui/router';
import { usePresence } from '@shared/ui/components/presence';
import { askParse } from '../app/api';
import { useItems, LAYER_COLORS } from '../app/hooks/useItems';
import { useNow } from '../app/hooks/useToday';
import { setFeedHidden } from '../app/store/actions';
import { useCalendarStore, type CalendarState } from '../app/store/library';
import { savePrefs, toggleLabelShown, usePrefsStore } from '../app/store/prefs';
import { showAllCalendars, showOnlyCalendar, useShownHere } from '../app/store/shown';
import styles from './calendar.module.css';
import { paths } from './routes';
import { BirthdayScreen } from './screens/BirthdayScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { EditEventScreen, NewEventScreen } from './screens/EditScreen';
import { EventScreen } from './screens/EventScreen';
import { FeedsScreen } from './screens/FeedsScreen';
import { ImportScreen } from './screens/ImportScreen';
import { LabelScreen } from './screens/LabelScreen';
import { LabelsScreen } from './screens/LabelsScreen';
import { TrashScreen } from './screens/TrashScreen';
import { MiniMonth } from './views/MiniMonth';


export function CalendarScreens({ route }: { route: Route }) {
  switch (route.name) {
    case 'agenda':
      return <CalendarScreen view={route.view} day={route.day} />;
    case 'agendaEvent':
      return <EventScreen key={route.id} id={route.id} />;
    case 'agendaEdit':
      return <EditEventScreen key={route.id} id={route.id} />;
    case 'agendaNew':
      return <NewEventScreen />;
    case 'agendaBirthday':
      return <BirthdayScreen id={route.id} />;
    case 'agendaLabels':
      return <LabelsScreen />;
    case 'agendaLabel':
      return <LabelScreen key={route.id} id={route.id} />;
    case 'agendaFeeds':
      return <FeedsScreen />;
    case 'agendaImport':
      return <ImportScreen />;
    case 'agendaTrash':
      return <TrashScreen />;
    default:
      return null;
  }
}

function titleFor(state: CalendarState, route: Route): string | null {
  switch (route.name) {
    case 'agendaEvent':
    case 'agendaEdit': {
      const event = state.events[route.id];
      return event ? event.title.trim() || t('Sans titre') : null;
    }
    case 'agendaNew':
      return t('Nouvel événement');
    case 'agendaBirthday':
      return t('Anniversaire');
    case 'agendaLabels':
      return t('Libellés');
    case 'agendaLabel':
      return state.labels[route.id]?.name ?? t('Libellés');
    case 'agendaFeeds':
      return t('Autres agendas');
    case 'agendaImport':
      return t('Importer');
    case 'agendaTrash':
      return t('Corbeille');
    default:
      return null;
  }
}

export const useCalendarTitle = (page: Route): string | null => useCalendarStore(state => titleFor(state, page));

export function calendarPathOf(route: Route): string {
  switch (route.name) {
    case 'agenda':
      return route.view ? paths.view(route.view, route.day ?? instantToWall(Date.now(), '').slice(0, 10)) : paths.home;
    case 'agendaEvent':
      return paths.event(route.id);
    case 'agendaEdit':
      return paths.edit(route.id);
    case 'agendaNew':
      return paths.newEvent();
    case 'agendaBirthday':
      return paths.birthday(route.id);
    case 'agendaLabels':
      return paths.labels;
    case 'agendaLabel':
      return paths.label(route.id);
    case 'agendaFeeds':
      return paths.feeds;
    case 'agendaImport':
      return paths.import;
    case 'agendaTrash':
      return paths.trash;
    default:
      return paths.home;
  }
}

/** An event is still there to go back to (not in the bin, not gone), a label too. */
export function calendarStillThere(route: Route): boolean {
  const state = useCalendarStore.getState();
  if (route.name === 'agendaEvent' || route.name === 'agendaEdit') {
    const event = state.events[route.id];
    return !!event && event.deletedAt === null && event.trashedAt === null;
  }
  if (route.name === 'agendaLabel') return state.labels[route.id]?.deletedAt === null;
  return true;
}

export const calendarOpened = (route: Route): string | null => (route.name === 'agendaEvent' ? spotKey('event', route.id) : null);

/** Back from a place with no history: a form to its event, the rest to the calendar. */
export const calendarBackTo = (route: Route): string => (route.name === 'agendaEdit' ? paths.event(route.id) : paths.home);

/** The day the calendar on screen shows (its address's, else today; « Aujourd'hui » is today's). */
function useShownDay(route: Route, today: string): string {
  return route.name === 'agenda' && route.day && route.view !== 'today' ? route.day : today;
}

/** A row that shows or hides something from the views: its colour's box ticked or not. */
/**
 * A calendar shown or hidden, by its colour: a small stone of its pigment (an event of it wears the
 * same at the head of its page), filled and ticked while it shows, its edge alone while hidden. A
 * label wears its tag; a calendar (one's own, a subscription, what another app brings) never does.
 */
function CalendarCheck({ stone, color, checked }: { stone: string; color: string; checked: boolean }) {
  const turn = pebbleTurnOf(stone);
  return (
    <span className={styles.calendarCheck} data-line={color} data-checked={checked || undefined} data-pebble-under={turn} data-still aria-hidden="true">
      <PebbleEdge turn={turn} />
      <Icon name="check" size={14} />
    </span>
  );
}

/** « Alt+clic » (« ⌥+clic » on a Mac): a stone so clicked shows its calendar alone, or all of them again. */
const altClick = (): string => t('{key}+clic', { key: isApple() ? '⌥' : 'Alt' });

/**
 * A calendar's menu (its row's ⋮, a right-click on the row): « Afficher uniquement celui-ci » unless
 * it shows alone already, « Tout afficher » while one shows alone (or none); empty when there is
 * nothing to offer. An Alt-click on its stone runs its first choice at once (`quick`).
 */
function onlyChoices(only: { readonly key: string; readonly shown: Shown } | undefined): { readonly items: MenuItem[]; readonly quick: () => void } | null {
  if (!only) return null;
  const choices = shownChoices(only.shown, only.key);
  const alone = aloneShown(only.shown) === only.key;
  const items: MenuItem[] = [
    ...(choices.only ? [{ label: t('Afficher uniquement celui-ci'), icon: 'eye' as const, shortcut: altClick(), onSelect: () => showOnlyCalendar(only.key) }] : []),
    ...(choices.all ? [{ label: t('Tout afficher'), icon: 'restore' as const, ...(alone ? { shortcut: altClick() } : {}), onSelect: showAllCalendars }] : []),
  ];
  if (items.length === 0) return null;
  return { items, quick: () => (alone ? showAllCalendars() : showOnlyCalendar(only.key)) };
}

function ToggleRow({ label, color, checked, onToggle, onNavigate, to, stone, only }: { label: string; color: string | null; checked: boolean; onToggle: () => void; onNavigate?: () => void; to?: string; stone?: string; only?: { readonly key: string; readonly shown: Shown } }) {
  const menu = onlyChoices(only);
  const [menuOpen, setMenuOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  return (
    <div
      className={menu ? `${navStyles.item} ${styles.calendarRow}` : navStyles.item}
      style={{ paddingRight: 4 }}
      onContextMenu={
        menu
          ? event => {
              event.preventDefault();
              setMenuOpen(true);
            }
          : undefined
      }
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        className={navStyles.markSlot}
        style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }}
        onClick={event => (menu && event.altKey ? menu.quick() : onToggle())}
      >
        {stone ? <CalendarCheck stone={stone} color={color ?? 'green'} checked={checked} /> : <LabelCheck color={(color ?? 'green') as Parameters<typeof LabelCheck>[0]['color']} checked={checked} size={22} />}
      </button>
      {to ? (
        <a
          className={`${navStyles.itemName} ${styles.navLink}`}
          href={to}
          onClick={event => {
            event.preventDefault();
            onNavigate?.();
            navigate(to);
          }}
        >
          {label}
        </a>
      ) : (
        <span className={navStyles.itemName}>{label}</span>
      )}
      {menu ? (
        <>
          <span className={styles.navMoreSlot}>
            <button ref={more} type="button" className={styles.navMore} aria-label={t('Plus d’actions pour {name}', { name: label })} aria-haspopup="menu" aria-expanded={menuOpen} data-tip={t('Plus d’actions')} onClick={() => setMenuOpen(true)}>
              <Icon name="more" size={18} />
            </button>
          </span>
          <Menu open={menuOpen} anchor={more} align="start" onDismiss={() => setMenuOpen(false)} items={menu.items} label={t('Actions pour {name}', { name: label })} />
        </>
      ) : null}
    </div>
  );
}

export function CalendarNav({ route, onNavigate }: { route: Route; onNavigate: () => void }) {
  const { today } = useNow();
  const shownDay = useShownDay(route, today);
  const [month, setMonth] = useState<string | null>(null);
  const showing = month ?? startOfMonth(shownDay);
  const weeks = useMemo(() => monthGrid(showing, usePrefsStore.getState().weekStart), [showing]);
  const items = useItems(weeks[0]![0]!, addDays(weeks[weeks.length - 1]![6]!, 1));
  const busy = useMemo(() => new Set(items.flatMap(item => (item.firstDay === item.lastDay ? [item.firstDay] : [item.firstDay, item.lastDay]))), [items]);
  const prefs = usePrefsStore();
  // Each calendar listed, shown or not: what its menu offers (« Afficher uniquement celui-ci »).
  const listed = useShownHere();
  const { labels, feeds } = useCalendarStore();
  const liveLabels = useMemo(() => Object.values(labels).filter(label => label.deletedAt === null).sort((a, b) => (a.position < b.position ? -1 : 1)), [labels]);
  const liveFeeds = useMemo(() => Object.values(feeds).filter(feed => feed.deletedAt === null).sort((a, b) => (a.position < b.position ? -1 : 1)), [feeds]);
  const view = route.name === 'agenda' && route.view ? route.view : prefs.view;
  const shown = useMemo(() => new Set(view === 'day' || view === 'today' ? [shownDay] : []), [view, shownDay]);
  return (
    <>
      <div className={styles.navMini}>
        <MiniMonth
          month={showing}
          weekStart={prefs.weekStart}
          today={today}
          busy={busy}
          shown={shown}
          onStep={direction => setMonth(stepDay('month', showing, direction))}
          onPick={day => {
            onNavigate();
            setMonth(null);
            navigate(paths.view(view === 'year' || view === 'schedule' || view === 'today' ? 'day' : view, day));
          }}
        />
      </div>
      {/* « Aujourd'hui », the day at a glance, then the calendar in the view chosen last. */}
      <NavRow to={paths.view('today', today)} label={t('Aujourd’hui')} leading={<NavGlyph name="today" />} current={route.name === 'agenda' && view === 'today'} onNavigate={onNavigate} />
      <NavRow to={paths.view(prefs.periodView, today)} label={t('Agenda')} leading={<NavGlyph name="calendar" />} current={route.name === 'agenda' && view !== 'today'} onNavigate={onNavigate} />
      <NavFold
        id="calendarOwn"
        title={t('Mes agendas')}
        action={
          <a
            href={paths.labels}
            className={navStyles.headingAction}
            onClick={event => {
              event.preventDefault();
              onNavigate();
              navigate(paths.labels);
            }}
          >
            {t('Modifier')}
          </a>
        }
      >
        <ToggleRow label={t('Mes événements')} color={null} stone="own" checked={!prefs.hideOwn} onToggle={() => savePrefs({ hideOwn: !prefs.hideOwn })} only={{ key: OWN_KEY, shown: listed }} />
        {liveLabels.map(label => (
          <ToggleRow key={label.id} label={label.name} color={label.color} checked={!prefs.hiddenLabels.includes(label.id)} onToggle={() => toggleLabelShown(label.id)} to={paths.label(label.id)} onNavigate={onNavigate} only={{ key: labelKey(label.id), shown: listed }} />
        ))}
      </NavFold>
      <NavFold
        id="calendarOthers"
        title={t('Autres agendas')}
        action={
          <a
            href={paths.feeds}
            className={navStyles.headingAction}
            onClick={event => {
              event.preventDefault();
              onNavigate();
              navigate(paths.feeds);
            }}
          >
            {t('Ajouter')}
          </a>
        }
      >
        {liveFeeds.map(feed => (
          <ToggleRow key={feed.id} label={feedName(feed)} color={feed.color} stone={feed.id} checked={!feed.hidden} onToggle={() => setFeedHidden(feed.id, !feed.hidden)} to={paths.feeds} onNavigate={onNavigate} only={{ key: feedKey(feed.id), shown: listed }} />
        ))}
        <ToggleRow label={t('Anniversaires ({app})', { app: APPS.contacts.name })} color={LAYER_COLORS.birthday} stone="birthday" checked={prefs.birthdays} onToggle={() => savePrefs({ birthdays: !prefs.birthdays })} only={{ key: layerKey('birthdays'), shown: listed }} />
        <ToggleRow label={t('Rappels de {app}', { app: APPS.notes.name })} color={LAYER_COLORS.reminder} stone="reminder" checked={prefs.noteReminders} onToggle={() => savePrefs({ noteReminders: !prefs.noteReminders })} only={{ key: layerKey('noteReminders'), shown: listed }} />
        <ToggleRow label={t('Dates des pages ({app})', { app: APPS.pages.name })} color={LAYER_COLORS.page} stone="page" checked={prefs.pageDates} onToggle={() => savePrefs({ pageDates: !prefs.pageDates })} only={{ key: layerKey('pageDates'), shown: listed }} />
        <ToggleRow label={t('Météo')} color="sky" stone="weather" checked={prefs.weather} onToggle={() => savePrefs({ weather: !prefs.weather })} only={{ key: layerKey('weather'), shown: listed }} />
      </NavFold>
    </>
  );
}

export function CalendarNavFoot({ route, onNavigate }: { route: Route; onNavigate: () => void }) {
  return <NavRow to={paths.trash} label={t('Corbeille')} leading={<NavGlyph name="trash" />} current={route.name === 'agendaTrash'} onNavigate={onNavigate} />;
}

/** What a few words open: the form, filled with what was read (`readQuickAdd`), or Claude's reading of them. */
export async function quickAdd(words: string, now: number = Date.now()): Promise<void> {
  const typed = words.trim();
  if (!typed) return;
  const today = instantToWall(now, '').slice(0, 10);
  const read = readQuickAdd(typed, today, usePrefsStore.getState().eventLength);
  const settings = useServerSettingsStore.getState().settings;
  const server = useSettingsStore.getState().server;
  if (!read.foundDay && !read.foundTime && server && settings?.analysis.enabled) {
    try {
      const { proposal } = await askParse(server, { text: typed, lang: getLocale(), now: instantToWall(now, ''), timeZone: deviceZone() });
      if (proposal) {
        navigate(paths.newEvent({ title: proposal.title, start: proposal.start, end: proposal.end, tz: proposal.timeZone, place: proposal.place, description: proposal.description, url: proposal.url }));
        return;
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : t('Le serveur ne répond pas'));
    }
  }
  navigate(paths.newEvent({ title: read.title, start: read.start, end: read.end, place: read.place }));
}

/** « Ajouter en quelques mots » and « Créer » beside the search, wide. */
export function CalendarHeaderActions({ route }: { route: Route }) {
  const [words, setWords] = useState('');
  if (route.name === 'agendaNew' || route.name === 'agendaEdit') return null;
  return (
    <form
      className={styles.quickAdd}
      onSubmit={event => {
        event.preventDefault();
        const typed = words;
        setWords('');
        void quickAdd(typed);
      }}
    >
      <input className={styles.quickInput} value={words} onChange={event => setWords(event.target.value)} placeholder={t('Ajouter en quelques mots')} aria-label={t('Ajouter en quelques mots')} autoComplete="off" enterKeyHint="go" title={t('« Dîner chez Paul jeudi 20h », « Congrès du 12 au 14 mars à Lyon »')} />
      <button type="submit" className={`${shell.classify} paper`} aria-label={t('Créer un événement')} data-tip={t('Créer un événement (C)')} onClick={event => (words.trim() ? undefined : (event.preventDefault(), navigate(paths.newEvent())))}>
        <Icon name="plus" size={20} />
        <span className={shell.classifyLabel}>{t('Créer')}</span>
      </button>
    </form>
  );
}

/** Its slide away (`--duration-short`), and a little longer for the fallback that lets it go. */
const BAR_EXIT_MS = 200;

/** A phone-sized window's bar on the calendar: its pebble makes an event. Mounted with its page: `enter` is how that page came. */
export function CalendarBottomBar({ route, enter }: { route: Route; enter: Arrival | null }) {
  const { present, closing, done } = usePresence(route.name === 'agenda', BAR_EXIT_MS);
  const [arrival] = useState(enter);
  if (!present) return null;
  const gone = (event: AnimationEvent<HTMLDivElement>): void => {
    if (closing && event.target === event.currentTarget) done();
  };
  return (
    <div className={`${shell.bottomBar} paper`} data-enter={(!closing && arrival) || undefined} data-closing={closing || undefined} inert={closing} onAnimationEnd={gone}>
      <div className={shell.bottomActions} />
      <button type="button" className={shell.fab} data-pebble-under={0} aria-label={t('Créer un événement')} onClick={() => navigate(paths.newEvent())}>
        <Icon name="plus" size={26} />
      </button>
    </div>
  );
}
