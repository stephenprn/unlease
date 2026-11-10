/**
 * An occurrence's details, in its popover and on its page: when (in the popover; the page heads with
 * it), its repeat in words, its own zone when it is not this device's; where (a menu opening it in
 * Google Maps or OpenStreetMap, the weather that day); with whom (each person's face and name,
 * opening them in Contacts); its reminders, labels, calendar, description (its mentions opening where
 * they live), files and link; and what can be done with it (`EventActions`): change it, copy it,
 * write its notes in Pages, delete it (one's own; a subscription's is only copied).
 */
import { useRef, useState } from 'react';

import { getLocale, t } from '@unlease/core/i18n';
import { isRichEmpty } from '@unlease/core/services/richText';
import { isOwn, type CalendarEvent } from '@unlease/calendar/models/events';
import { asksScope } from '@unlease/calendar/services/editing';
import { deletedWords, reminderWords, whenLine, zoneNote } from '@unlease/calendar/services/eventText';
import { feedName } from '@unlease/calendar/services/holidays';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { describeRule, parseRule } from '@unlease/calendar/services/recurrence';
import { temperatures, weatherKind, WEATHER_WORDS } from '@unlease/calendar/services/weather';
import type { GlyphName } from '@unlease/design/glyphs';

import { useMinute } from '@shared/app/hooks/useMinute';
import { selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settings';
import { showError, showUndo } from '@shared/app/store/ui';
import { suitePlace } from '@shared/app/suitePlaces';
import { Button } from '@shared/ui/components/Button';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { LabelTag } from '@shared/ui/components/LabelMark';
import { Menu, type MenuItem } from '@shared/ui/components/Menu';
import { navigate } from '@shared/ui/router';
import { makeEventPage } from '../../app/api';
import { saveEventFile } from '../../app/files';
import { useWeather } from '../../app/hooks/useWeather';
import { deleteEvent, duplicate } from '../../app/store/actions';
import { askScope } from '../../app/store/calendarUi';
import { useCalendarStore } from '../../app/store/library';
import { usePrefsStore } from '../../app/store/prefs';
import styles from '../calendar.module.css';
import { paths } from '../routes';
import { PersonChip } from './People';
import { LinkRow, PlaceButton } from './PlaceAndLink';
import { RichText } from './RichText';

/** A detail led by its glyph, centred on its first line: words', or chips' (`chips`: people, files). */
export function Detail({ icon, children, label, chips = false }: { icon: GlyphName; children: React.ReactNode; label?: string; chips?: boolean }) {
  return (
    <div className={styles.detail} role={label ? 'group' : undefined} aria-label={label} data-chips={chips || undefined}>
      <Icon name={icon} size={20} />
      <div className={styles.detailText}>{children}</div>
    </div>
  );
}

/** The calendar a subscribed event comes from, by its name. */
function calendarOf(event: CalendarEvent): string | null {
  if (!event.feedId) return null;
  const feed = useCalendarStore.getState().feeds[event.feedId];
  return feed ? feedName(feed) || t('Agenda sans nom') : t('Agenda supprimé');
}

/** « Supprimer »: a series asks which of its events first; the slip offers to take it back. */
export async function removeOccurrence(item: Occurrence): Promise<boolean> {
  const scope = asksScope(item) ? await askScope(t('Supprimer un événement périodique')) : 'all';
  if (!scope) return false;
  const seriesStart = useCalendarStore.getState().events[item.seriesId]?.start ?? item.start;
  const undo = deleteEvent(item, scope);
  showUndo(deletedWords(item, seriesStart, scope), undo);
  return true;
}

/** « Dupliquer »: a copy of one's own, opened in its form. */
export function duplicateOccurrence(item: Occurrence): void {
  const id = duplicate(item);
  navigate(paths.edit(id));
}

/** « Créer une page de notes »: Pages makes (or finds) the event's page, which opens there. */
export async function writeNotes(item: Occurrence): Promise<void> {
  const server = useSettingsStore.getState().server;
  if (!server) return;
  try {
    const made = await makeEventPage(server, { eventId: item.seriesId, title: item.event.title, start: item.start, contactIds: item.event.contactIds, lang: getLocale() });
    navigate(suitePlace('page', made.pageId)!);
  } catch (error) {
    showError(error instanceof Error ? error.message : t('Le serveur ne répond pas'));
  }
}

/** Its repeat in words and its own zone, when it has them: the line under when it happens. */
export function useWhenNotes(item: Occurrence): string[] {
  const series = useCalendarStore(s => s.events[item.seriesId]) ?? item.event;
  const rule = item.repeats ? parseRule(series.rrule) : null;
  const zone = zoneNote(item.event);
  return [rule ? describeRule(rule, series.start, series.timeZone) : '', zone ?? ''].filter(Boolean);
}

/**
 * `onCopy`: « Copier dans mon agenda » in sight on a subscribed event's read-only line (the popover;
 * the page leads with it among its actions already).
 */
export function EventDetails({ item, withWhen = false, onCopy }: { item: Occurrence; withWhen?: boolean; onCopy?: () => void }) {
  const now = useMinute();
  const twelveHours = usePrefsStore(s => s.twelveHours);
  const labels = useCalendarStore(s => s.labels);
  const weather = useWeather([item.firstDay], [item]).get(item.firstDay);
  const notes = useWhenNotes(item);
  const event = item.event;
  const place = event.place.trim();
  const worn = event.labelIds.map(id => labels[id]).filter(label => label && label.deletedAt === null);
  const from = calendarOf(event);
  const url = event.url.trim();
  return (
    <div className={styles.details}>
      {withWhen ? (
        <Detail icon="clock">
          <span className="t-body">{whenLine(item, now, twelveHours)}</span>
          {notes.map(note => (
            <span key={note} className="t-meta">
              {note}
            </span>
          ))}
        </Detail>
      ) : null}
      {place ? (
        <Detail icon="mapPin" label={t('Lieu')}>
          <PlaceButton place={place} />
          {weather ? (
            <span className={`${styles.weatherLine} t-meta`}>
              <Icon name={weatherKind(weather.day.code) === 'clear' ? 'sun' : 'cloud'} size={14} />
              {`${WEATHER_WORDS[weatherKind(weather.day.code)]} · ${temperatures(weather.day.max, weather.day.min)} · ${t('{chance} % de pluie', { chance: Math.round(weather.day.rain) })}`}
            </span>
          ) : null}
        </Detail>
      ) : null}
      {event.contactIds.length > 0 ? (
        <Detail icon="people" label={t('Avec')} chips>
          <div className={styles.people}>
            {event.contactIds.map(id => (
              <PersonChip key={id} id={id} />
            ))}
          </div>
        </Detail>
      ) : null}
      {event.reminders.length > 0 ? (
        <Detail icon="bell" label={t('Rappels')}>
          <span className="t-body">{event.reminders.map(minutes => reminderWords(minutes, item.allDay)).join(' · ')}</span>
        </Detail>
      ) : null}
      {/* Its labels need no glyph before them: each wears its own tag, the row starting where the glyphs do. */}
      {worn.length > 0 ? (
        <div className={styles.wornLabels} role="group" aria-label={t('Libellés : {names}', { names: worn.map(label => label!.name).join(', ') })}>
          {worn.map(label => (
            <span key={label!.id} className={styles.wornLabel} data-line={label!.color}>
              <LabelTag color={label!.color} size={16} />
              <span className="t-label">{label!.name}</span>
            </span>
          ))}
        </div>
      ) : null}
      {from ? (
        <Detail icon="calendar">
          <span className="t-body">{from}</span>
          <span className="t-meta">{t('Agenda abonné : en lecture seule')}</span>
          {onCopy ? (
            <span className={styles.detailButton}>
              <Button kind="tonal" small icon="copy" onClick={onCopy}>
                {t('Copier dans mon agenda')}
              </Button>
            </span>
          ) : null}
        </Detail>
      ) : null}
      {!isRichEmpty(event.description) ? (
        <Detail icon="text" label={t('Description')}>
          <RichText markup={event.description} />
        </Detail>
      ) : null}
      {event.files.length > 0 ? (
        <Detail icon="file" label={t('Fichiers')} chips>
          <div className={styles.files}>
            {event.files.map(file => (
              <button key={file.id} type="button" className={styles.file} onClick={() => void saveEventFile(file).then(ok => (ok ? undefined : showError(t('Ce fichier n’est pas encore sur le serveur.'))))}>
                <Icon name={file.mime.startsWith('image/') ? 'image' : file.mime === 'application/pdf' ? 'pdf' : 'file'} size={18} />
                <span className="t-body">{file.name || t('Fichier')}</span>
              </button>
            ))}
          </div>
        </Detail>
      ) : null}
      {url ? (
        <Detail icon="link" label={t('Lien')}>
          <LinkRow url={url} />
        </Detail>
      ) : null}
    </div>
  );
}

/** What can be done with an occurrence, from its menu: copy it, write its notes in Pages. */
function useMoreItems(item: Occurrence): MenuItem[] {
  const server = useSettingsStore(selectServer);
  const apps = useSettingsStore(selectServerApps);
  const own = isOwn(item.event);
  const pages = !!server && (!apps || apps.includes('pages'));
  return [
    { label: own ? t('Dupliquer') : t('Copier dans mon agenda'), icon: 'copy', onSelect: () => duplicateOccurrence(item) },
    ...(pages ? [{ label: t('Créer une page de notes'), icon: 'pagePlus' as const, onSelect: () => void writeNotes(item) }] : []),
  ];
}

/** The event page's actions: « Modifier » first (« Copier dans mon agenda » for a subscription's), the rest quieter, « Supprimer » last. */
export function EventActions({ item }: { item: Occurrence }) {
  const own = isOwn(item.event);
  const server = useSettingsStore(selectServer);
  const apps = useSettingsStore(selectServerApps);
  const pages = !!server && (!apps || apps.includes('pages'));
  return (
    <div className={styles.eventActions}>
      {own ? (
        <Button icon="edit" onClick={() => navigate(paths.edit(item.seriesId, item.repeats ? item.occurrence : null))}>
          {t('Modifier')}
        </Button>
      ) : null}
      <Button kind={own ? 'text' : 'filled'} icon="copy" onClick={() => duplicateOccurrence(item)}>
        {own ? t('Dupliquer') : t('Copier dans mon agenda')}
      </Button>
      {pages ? (
        <Button kind="text" icon="pagePlus" onClick={() => void writeNotes(item)}>
          {t('Page de notes')}
        </Button>
      ) : null}
      {own ? (
        <span className={styles.eventActionsEnd}>
          <Button kind="dangerText" icon="trash" onClick={() => void removeOccurrence(item).then(gone => (gone ? navigate(paths.home) : undefined))}>
            {t('Supprimer')}
          </Button>
        </span>
      ) : null}
    </div>
  );
}

/** The popover's tools: change, delete, the rest in a menu, open the page, close. */
export function PeekTools({ item, onClose, onOpen }: { item: Occurrence; onClose: () => void; onOpen: () => void }) {
  const own = isOwn(item.event);
  const more = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const items = useMoreItems(item);
  return (
    <div className={styles.peekTools}>
      {own ? (
        <IconButton
          icon="edit"
          label={t('Modifier')}
          compact
          shortcut="E"
          onClick={() => {
            onClose();
            navigate(paths.edit(item.seriesId, item.repeats ? item.occurrence : null));
          }}
        />
      ) : null}
      {own ? (
        <IconButton
          icon="trash"
          label={t('Supprimer')}
          compact
          shape={1}
          onClick={() => {
            onClose();
            void removeOccurrence(item);
          }}
        />
      ) : null}
      <IconButton ref={more} icon="more" label={t('Plus d’actions')} compact shape={2} hasPopup="menu" expanded={menu} onClick={() => setMenu(true)} />
      <Menu
        open={menu}
        anchor={more}
        onDismiss={() => setMenu(false)}
        label={t('Plus d’actions')}
        items={items.map(each => ({
          ...each,
          onSelect: () => {
            onClose();
            each.onSelect();
          },
        }))}
      />
      <IconButton icon="external" label={t('Ouvrir la page de l’événement')} compact shape={3} onClick={onOpen} />
      <IconButton icon="close" label={t('Fermer')} compact onClick={onClose} />
    </div>
  );
}
