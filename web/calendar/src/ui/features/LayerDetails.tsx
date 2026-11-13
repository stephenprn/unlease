/**
 * What the other apps' items say in Agenda: a contact's birthday (their age, how far it is, on the
 * day and the day after « Souhaiter » (`WishButton`), the ways to reach them in Contacts' order and
 * glyphs: call `phoneCall`, WhatsApp `phone`, e-mail `email`, the way there `mapPin`; Contacts to
 * open them, Carnet's gift ideas for them and « Ajouter une idée »; nothing of notifications, which
 * only Contacts' phone app gives), a note's reminder (opening the note in Carnet), a day written in a page (opening the page
 * in Pages).
 */
import { useId, useMemo, useRef, useState } from 'react';

import { APPS } from '@unlease/core/apps';
import { getLocale, t } from '@unlease/core/i18n';
import { formatClock } from '@unlease/core/services/format';
import { birthdayTitle, clockWords, dayDistance, longDay } from '@unlease/calendar/services/eventText';
import { daysBetween, instantToDay } from '@unlease/calendar/services/time';
import { readBirthday } from '@unlease/contacts/services/birthdays';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { contactName } from '@unlease/contacts/services/names';
import { addressLine, directionsUrl, mailtoHref, MAP_APP_NAMES, OFFERED_MAP_APPS } from '@unlease/contacts/services/addresses';
import { CALLING_CODES, callNumber, regionOf, telHref, whatsappNumber, whatsappUrl } from '@unlease/contacts/services/phones';
import type { LinkItem } from '@unlease/notes/models/entities';
import { giftIdeasFor } from '@unlease/notes/services/gifts';
import { wishDueAfter } from '@unlease/contacts/services/wishes';

import { useContactsStore } from '@contacts/app/store/library';
import { useLibraryStore } from '@notes/app/store/library';
import { selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settings';
import { showSnack } from '@shared/app/store/ui';
import { suitePlace } from '@shared/app/suitePlaces';
import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import layers from '@shared/ui/components/layers.module.css';
import { Layer } from '@shared/ui/components/Layer';
import { Menu } from '@shared/ui/components/Menu';
import { FormMessage } from '@shared/ui/components/FormMessage';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { useUnsaved } from '@shared/ui/components/useUnsaved';
import { browserPath, Link, navigate } from '@shared/ui/router';
import { addGiftIdea } from '../../app/api';
import { pageTitle, usePageBlocksStore } from '../../app/store/pageBlocks';
import { usePrefsStore } from '../../app/store/prefs';
import { useMinute } from '@shared/app/hooks/useMinute';
import styles from '../calendar.module.css';
import { Detail } from './EventDetails';
import { WishButton } from './WishButton';

/** The country national numbers belong to here: the browser's (WhatsApp needs its calling code). */
export function callingRegion(): string | null {
  const languages = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of languages) {
    const region = regionOf(tag);
    if (region && Object.hasOwn(CALLING_CODES, region)) return region;
  }
  return getLocale() === 'fr' ? 'FR' : null;
}

/** Carnet's gift ideas still to buy for someone: the links of its « Cadeaux » collection that name them (or those merged into them). */
export function useGiftIdeas(contactId: string | null, name: string): readonly LinkItem[] {
  const notes = useLibraryStore(s => s.notes);
  const links = useLibraryStore(s => s.links);
  const contacts = useContactsStore(s => s.contacts);
  return useMemo(() => {
    if (!contactId) return [];
    const ids = [contactId, ...Object.values(contacts).flatMap(other => (other.mergedInto === contactId ? [other.id] : []))];
    return giftIdeasFor(notes, links, { ids, name }).filter(link => !link.done);
  }, [notes, links, contacts, contactId, name]);
}

/** What is wrong with a product's link typed, or null. */
function giftLinkProblem(url: string): string | null {
  const typed = url.trim();
  if (!typed) return t('Paste the product’s link.');
  return /^https?:\/\/\S+\.\S+$/i.test(typed) ? null : t('A link starting with https://, such as https://example.com/product.');
}

function GiftForm({ contactId, name, url, onUrl, onClose }: { contactId: string; name: string; url: string; onUrl: (url: string) => void; onClose: () => void }) {
  const titleId = useId();
  const server = useSettingsStore(selectServer);
  const form = useForm({ url: giftLinkProblem(url) });
  const submit = async (): Promise<boolean> => {
    if (!server) {
      form.fail(null, t('Ideas go through your server: connect one first.'));
      return false;
    }
    try {
      const answer = await addGiftIdea(server, { url: url.trim(), forName: name, contactId, lang: getLocale() });
      onClose();
      // As Contacts' slip: where it went, and « Ouvrir » on Carnet's collection (its web app's address).
      const place = `/notes/line/${encodeURIComponent(answer.collectionId)}`;
      showSnack(
        answer.existing ? t('Already in Gifts, in {app}: {name} is added to it.', { app: APPS.notes.name, name }) : t('Added to Gifts in {app}', { app: APPS.notes.name }),
        { label: t('Open'), run: () => window.open(browserPath(place), '_blank', 'noopener') },
        { tone: 'success' },
      );
      return true;
    } catch (error) {
      form.fail(null, error instanceof Error ? t(error.message) : t('The server isn’t responding'));
      return false;
    }
  };
  return (
    <DialogFrame
      title={t('Gift idea for {name}', { name })}
      titleId={titleId}
      onClose={onClose}
      className={layers.dialog}
      onSubmit={form.onSubmit(submit)}
      foot={
        <>
          <FormMessage form={form} className={styles.footMessage} />
          <Button kind="text" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" icon="plus" busy={form.busy} disabled={!url.trim()}>
            {t('Add')}
          </Button>
        </>
      }
    >
      <TextField
        label={t('Product link')}
        kind="url"
        value={url}
        onChange={onUrl}
        field={form.field('url')}
        autoFocus
        placeholder="https://"
        help={t('It goes to the Gifts collection in {app}, for {name}.', { app: APPS.notes.name, name })}
      />
    </DialogFrame>
  );
}

/** A contact's birthday that day: who, how old, and how to wish it. */
export function BirthdayDetails({ contactId, day }: { contactId: string; day: string }) {
  const now = useMinute();
  const contact = useContactsStore(s => resolveContact(s.contacts, contactId));
  const server = useSettingsStore(selectServer);
  const apps = useSettingsStore(selectServerApps);
  const [gifting, setGifting] = useState(false);
  // The link typed is kept here, so a slip that closes the dialog asks first.
  const [giftUrl, setGiftUrl] = useState('');
  const routeButton = useRef<HTMLSpanElement>(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const unsaved = useUnsaved(gifting && giftUrl.trim() !== '');
  const closeGift = (): void => {
    setGifting(false);
    setGiftUrl('');
  };
  const name = contact ? contactName(contact) : '';
  const gifts = useGiftIdeas(contact?.id ?? null, name);
  if (!contact) return <p className="t-body">{t('This contact no longer exists')}</p>;
  const birthday = readBirthday(contact.birthday);
  const age = birthday && birthday.year !== null && Number(day.slice(0, 4)) > birthday.year ? Number(day.slice(0, 4)) - birthday.year : null;
  const region = callingRegion();
  const call = callNumber(contact);
  const chat = whatsappNumber(contact);
  const whatsapp = chat ? whatsappUrl(chat.number, region) : null;
  const email = contact.emails.find(entry => mailtoHref(entry.address));
  const place = contact.addresses.find(entry => addressLine(entry));
  const today = instantToDay(now);
  const soon = daysBetween(today, day);
  const notesOn = !!server && (!apps || apps.includes('notes'));
  return (
    <>
      <Detail icon="cake">
        <span className="t-body">{longDay(day)}</span>
        <span className="t-meta">{[birthdayTitle(name, age), dayDistance(day, today)].join(' · ')}</span>
      </Detail>
      {soon >= 0 && soon <= 7 && notesOn ? (
        <div className={styles.gift}>
          <span className="t-body">{gifts.length > 0 ? t('Find a gift: your ideas are here.') : t('Find a gift: keep an idea in {app}.', { app: APPS.notes.name })}</span>
        </div>
      ) : null}
      {gifts.length > 0 ? (
        <Detail icon="bag" label={t('Gift ideas')}>
          {gifts.map(link => (
            <Link key={link.id} to={suitePlace('link', link.id)!} className="t-body">
              {link.title.trim() || link.url}
            </Link>
          ))}
        </Detail>
      ) : null}
      {/* On the day and the day after, the wish first; then the ways to reach them in Contacts' order and glyphs (the phone's SMS and WhatsApp video are the phone's own), then Contacts, then a gift idea. */}
      <div className={styles.detailActions}>
        {wishDueAfter(-soon) ? <WishButton contact={contact} region={region} small /> : null}
        {call ? (
          <Button kind="text" icon="phoneCall" small href={telHref(call.number, region) ?? undefined}>
            {t('Call')}
          </Button>
        ) : null}
        {whatsapp ? (
          <Button kind="text" icon="phone" small href={whatsapp}>
            {t('WhatsApp')}
          </Button>
        ) : null}
        {email ? (
          <Button kind="text" icon="email" small href={mailtoHref(email.address) ?? undefined}>
            {t('Email')}
          </Button>
        ) : null}
        {place ? (
          // The menu of map apps hangs from it (Contacts' « Itinéraire »).
          <span ref={routeButton}>
            <Button kind="text" icon="mapPin" small onClick={() => setRouteOpen(true)}>
              {t('Directions')}
            </Button>
          </span>
        ) : null}
        <Button kind="tonal" icon="person" small onClick={() => navigate(suitePlace('contact', contact.id)!)}>
          {t('Open in {app}', { app: APPS.contacts.name })}
        </Button>
        {notesOn ? (
          <Button kind="text" icon="plus" small onClick={() => setGifting(true)}>
            {t('Add an idea')}
          </Button>
        ) : null}
      </div>
      {place ? (
        <Menu
          open={routeOpen}
          anchor={routeButton}
          align="start"
          onDismiss={() => setRouteOpen(false)}
          label={t('Directions to {name}', { name })}
          items={OFFERED_MAP_APPS.map(app => ({ label: t('Directions in {maps}', { maps: MAP_APP_NAMES[app] }), icon: 'external' as const, onSelect: () => window.open(directionsUrl(place, app)!, '_blank', 'noopener,noreferrer') }))}
        />
      ) : null}
      <Layer open={gifting} onDismiss={unsaved.guard(closeGift)} label={t('Gift idea')}>
        {gifting ? <GiftForm contactId={contact.id} name={name} url={giftUrl} onUrl={setGiftUrl} onClose={closeGift} /> : null}
      </Layer>
      {unsaved.dialog}
    </>
  );
}

/** A note of Carnet's with its reminder. */
export function ReminderDetails({ noteId }: { noteId: string }) {
  const note = useLibraryStore(s => s.notes[noteId]);
  const twelve = usePrefsStore(s => s.twelveHours);
  if (!note || note.reminderAt === null) return <p className="t-body">{t('This reminder no longer exists')}</p>;
  return (
    <>
      <Detail icon="bell">
        <span className="t-body">{`${longDay(instantToDay(note.reminderAt))} · ${clockWords(formatClock(note.reminderAt), twelve)}`}</span>
        <span className="t-meta">{t('Reminder of a note in {app}', { app: APPS.notes.name })}</span>
      </Detail>
      <div className={styles.detailActions}>
        <Button kind="tonal" icon="note" small onClick={() => navigate(suitePlace('note', noteId)!)}>
          {t('Open in {app}', { app: APPS.notes.name })}
        </Button>
      </div>
    </>
  );
}

/** A page that names this day. */
export function PageDateDetails({ pageId, day, time }: { pageId: string; day: string; time: string | null }) {
  usePageBlocksStore(s => s.blocks[pageId]);
  const title = pageTitle(pageId);
  if (title === null) return <p className="t-body">{t('This page no longer exists')}</p>;
  return (
    <>
      <Detail icon="page">
        <span className="t-body">{time ? `${longDay(day)} · ${time}` : longDay(day)}</span>
        <span className="t-meta">{t('A date written in a page of {app}', { app: APPS.pages.name })}</span>
      </Detail>
      <div className={styles.detailActions}>
        <Button kind="tonal" icon="page" small onClick={() => navigate(suitePlace('page', pageId)!)}>
          {t('Open in {app}', { app: APPS.pages.name })}
        </Button>
      </div>
    </>
  );
}
