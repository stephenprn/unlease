/**
 * A contact, read from the top down: who they are (their face, their name, their work, their labels)
 * with what is done to the card itself at the head's end (the star, « Modifier », a menu: the vCard,
 * its labels, a gift idea kept in Carnet, the bin, back from the slip); then the ways to reach them,
 * one row of pebbles in the phone's order (a call `phoneCall`, WhatsApp `phone`, an e-mail `email`,
 * the way to their address `mapPin` in Google Maps or OpenStreetMap; the phone adds the SMS `bubble`
 * after the call and WhatsApp's video `video` after WhatsApp);
 * then what is known of them: « Coordonnées » (each number with its calling code, a national one
 * taking the « Indicatif par défaut »'s, and called with it; each e-mail; copied in a press), each
 * address on a card of its own with its little plan and the two maps to open it in, « À propos »
 * (the birthday and how far it is, the note); and where they are mentioned, in Agenda, Pages and
 * Carnet. On their birthday and the day after, a notice under the ways to reach them offers
 * « Souhaiter » (the wish written into WhatsApp, an e-mail, or an SMS under a finger: `WishButton`).
 */
import { useContext, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';

import { t } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import { pebbleTurn } from '@unlease/design/pebbles';
import type { AddressEntry, Contact } from '@unlease/contacts/models/contacts';
import { addressLine, addressLines, directionsUrl, mailtoHref, MAP_APP_NAMES, mapsUrl, OFFERED_MAP_APPS, phoneKindName, placeKindName } from '@unlease/contacts/services/addresses';
import { ageToday, birthdayWhen, formatBirthday, readBirthday } from '@unlease/contacts/services/birthdays';
import { wishDaysLate } from '@unlease/contacts/services/wishes';
import { plural } from '@unlease/core/services/format';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { contactName, workLine } from '@unlease/contacts/services/names';
import { callNumber, shownNumber, telHref, whatsappNumber, whatsappUrl } from '@unlease/contacts/services/phones';

import { useMinute } from '@shared/app/hooks/useMinute';
import { restoreContacts, trashContacts } from '../../app/store/actions';
import { useContactsStore } from '../../app/store/library';
import { useCallingRegion } from '../../app/store/prefs';
import { showSnack, showUndo, showWarning } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { LabelMark } from '@shared/ui/components/LabelMark';
import { Menu } from '@shared/ui/components/Menu';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { PageHeadSlot } from '@shared/ui/navigation/PageHead';
import { copyText } from '@shared/ui/dom';
import { navigate } from '@shared/ui/router';
import { NARROW, useMedia } from '@shared/ui/useMedia';
import styles from '../contacts.module.css';
import { AddressPlan } from '../features/AddressPlan';
import { Avatar } from '../features/Avatar';
import { toggleFavorite } from '../features/ContactList';
import { exportContacts } from '../features/exporting';
import { GiftDialog, useGiftsUnavailable } from '../features/GiftDialog';
import { MentionedIn } from '../features/MentionedIn';
import { LabelsPopover } from '../features/SelectionBar';
import { paths } from '../routes';
import { useWishWays, WishButton } from '../features/WishButton';

const openOut = (url: string): void => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

const copy = (text: string): void => {
  void copyText(text).then(done => (done ? showSnack(t('Copied'), undefined, { tone: 'success' }) : showWarning(t('This browser did not allow copying.'))));
};

/** A way to reach them: its glyph on its pebble, its name under it; greyed, saying why, when it cannot work yet. */
function QuickAction({ icon, label, href, turn, external = false, why, onClick, expanded, anchor }: { icon: GlyphName; label: string; href?: string | null; turn: number; external?: boolean; why?: string; onClick?: () => void; expanded?: boolean; anchor?: Ref<HTMLButtonElement> }) {
  const body = (
    <>
      <span className={styles.actionStone} data-pebble-under={pebbleTurn(turn)}>
        <Icon name={icon} size={24} />
      </span>
      <span className={`${styles.actionName} t-label`}>{label}</span>
    </>
  );
  if (onClick) {
    return (
      <button ref={anchor} type="button" className={styles.action} aria-haspopup="menu" aria-expanded={expanded} onClick={onClick}>
        {body}
      </button>
    );
  }
  if (!href) {
    return (
      <span className={styles.action} aria-disabled="true" data-tip={why} title={why}>
        {body}
      </span>
    );
  }
  return (
    <a className={styles.action} href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>
      {body}
    </a>
  );
}

/** A line of « Coordonnées » or « À propos »: its glyph, its value over what it is, its tools at its end. */
function Detail({ icon, children, tools }: { icon: GlyphName; children: ReactNode; tools?: ReactNode }) {
  return (
    <li className={styles.detail}>
      <Icon name={icon} size={22} />
      <div className={styles.detailText}>{children}</div>
      <div className={styles.detailTools}>{tools}</div>
    </li>
  );
}

/** A value that leaves the app when followed (`tel:`, `mailto:`), in the link's ink. */
function Out({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return <span className="t-body">{children}</span>;
  return (
    <a className={`${styles.out} t-body`} href={href}>
      {children}
    </a>
  );
}

function CopyButton({ text, label, turn }: { text: string; label: string; turn: number }) {
  return <IconButton icon="copy" label={label} shape={turn} className={styles.quiet} onClick={() => copy(text)} />;
}

function Coordinates({ contact }: { contact: Contact }) {
  const region = useCallingRegion();
  if (contact.phones.length === 0 && contact.emails.length === 0) return null;
  return (
    <section className={styles.block} aria-labelledby="contact-coordinates">
      <h2 id="contact-coordinates" className={`${styles.sectionHead} t-section`}>
        {t('Contact details')}
      </h2>
      <OutlinedBox kind="panel" lift="card" className={`${styles.details} paper`}>
        <ul className={styles.group}>
          {contact.phones.map((phone, index) => {
            const whatsapp = whatsappUrl(phone.number, region);
            // With its calling code, a national number taking the « Indicatif par défaut »'s.
            const shown = shownNumber(phone.number, region);
            return (
              <Detail
                key={phone.id}
                icon="phoneCall"
                tools={
                  <>
                    {whatsapp ? <IconButton icon="phone" label={t('WhatsApp with {number}', { number: shown })} shape={index + 1} onClick={() => openOut(whatsapp)} /> : null}
                    <CopyButton text={shown} label={t('Copy {number}', { number: shown })} turn={index + 2} />
                  </>
                }
              >
                <Out href={telHref(phone.number, region)}>
                  <span className="tabular">{shown}</span>
                </Out>
                <span className={`${styles.detailMeta} t-meta`}>{phoneKindName(phone)}</span>
              </Detail>
            );
          })}
          {contact.emails.map((email, index) => (
            <Detail key={email.id} icon="email" tools={<CopyButton text={email.address} label={t('Copy {address}', { address: email.address })} turn={index + 3} />}>
              <Out href={mailtoHref(email.address)}>{email.address}</Out>
              <span className={`${styles.detailMeta} t-meta`}>{placeKindName(email)}</span>
            </Detail>
          ))}
        </ul>
      </OutlinedBox>
    </section>
  );
}

/** An address on its card: its plan, its lines (the street first), what it is, and the two maps it opens in. */
function PlaceCard({ address, index }: { address: AddressEntry; index: number }) {
  const lines = addressLines(address);
  const line = addressLine(address);
  if (!line) return null;
  return (
    <OutlinedBox kind="panel" lift="card" className={`${styles.placeCard} paper`}>
      <OutlinedBox kind="frame" className={styles.planFrame}>
        <AddressPlan address={line} />
      </OutlinedBox>
      <div className={styles.placeText}>
        <address className={styles.placeLines}>
          {lines.map((each, at) => (
            <span key={at} className={at === 0 ? 't-body-strong' : `${styles.placeRest} t-body`}>
              {each}
            </span>
          ))}
        </address>
        <span className={`${styles.detailMeta} t-meta`}>{placeKindName(address)}</span>
      </div>
      <div className={styles.placeTools}>
        {OFFERED_MAP_APPS.map(app => (
          <Button key={app} kind="outlined" small icon="external" href={mapsUrl(address, app) ?? undefined} title={t('Open in {maps}', { maps: MAP_APP_NAMES[app] })}>
            {MAP_APP_NAMES[app]}
          </Button>
        ))}
        <IconButton icon="copy" label={t('Copy the address')} shape={index + 2} onClick={() => copy(lines.join('\n'))} />
      </div>
    </OutlinedBox>
  );
}

function Addresses({ contact }: { contact: Contact }) {
  const shown = contact.addresses.filter(address => addressLine(address));
  if (shown.length === 0) return null;
  return (
    <section className={styles.block} aria-labelledby="contact-addresses">
      <h2 id="contact-addresses" className={`${styles.sectionHead} t-section`}>
        {shown.length > 1 ? t('Addresses') : t('Address')}
      </h2>
      {shown.map((address, index) => (
        <PlaceCard key={address.id} address={address} index={index} />
      ))}
    </section>
  );
}

function About({ contact }: { contact: Contact }) {
  const now = useMinute();
  const birthday = readBirthday(contact.birthday);
  const note = contact.note.trim();
  if (!birthday && !note) return null;
  return (
    <section className={styles.block} aria-labelledby="contact-about">
      <h2 id="contact-about" className={`${styles.sectionHead} t-section`}>
        {t('About')}
      </h2>
      <OutlinedBox kind="panel" lift="card" className={`${styles.details} paper`}>
        <ul className={styles.group}>
          {birthday ? (
            <Detail icon="cake">
              <span className="t-body">{formatBirthday(birthday)}</span>
              <span className={`${styles.detailMeta} t-meta`}>{birthdayWhen(birthday, now)}</span>
            </Detail>
          ) : null}
          {note ? (
            <Detail icon="note" tools={<CopyButton text={contact.note} label={t('Copy the note')} turn={1} />}>
              <span className={`${styles.noteText} t-body`}>{contact.note}</span>
            </Detail>
          ) : null}
        </ul>
      </OutlinedBox>
    </section>
  );
}

/** Their birthday today or yesterday, with a way to write to them: the day and the age reached, and « Souhaiter ». */
function BirthdayNotice({ contact, region }: { contact: Contact; region: string | null }) {
  const now = useMinute();
  const ways = useWishWays(contact, region);
  const birthday = readBirthday(contact.birthday);
  const late = birthday ? wishDaysLate(birthday, now) : null;
  if (!birthday || late === null || ways.length === 0) return null;
  const age = ageToday(birthday, now);
  return (
    <OutlinedBox kind="panel" className={`${styles.notice} ${styles.wishNotice} paper`}>
      <Icon name="cake" size={22} />
      <span className={styles.wishText}>
        <span className="t-body-strong">{t('Their birthday')}</span>
        <span className="t-meta">{[late === 0 ? t('Today') : t('Yesterday'), age !== null && age > 0 ? plural(age, 'year') : null].filter(Boolean).join(' · ')}</span>
      </span>
      <WishButton contact={contact} region={region} className={styles.wishEnd} />
    </OutlinedBox>
  );
}

/** What is done to the card (the star, « Modifier », the menu): at the head's end, or in the phone-sized window's top bar, beside Back, as the phone's top bar holds them. */
function HeroTools({ children }: { children: ReactNode }) {
  const slot = useContext(PageHeadSlot);
  if (slot) return createPortal(<div className={styles.barTools}>{children}</div>, slot);
  return <div className={styles.heroTools}>{children}</div>;
}

export function ContactScreen({ id }: { id: string }) {
  const contact = useContactsStore(s => s.contacts[id]);
  // A contact merged into another: its address (an old link, a mention) opens the one kept.
  const kept = useContactsStore(s => (s.contacts[id]?.mergedInto ? (resolveContact(s.contacts, id)?.id ?? null) : null));
  useEffect(() => {
    if (kept && kept !== id) navigate(paths.contact(kept), { replace: true });
  }, [kept, id]);
  const labels = useContactsStore(s => s.labels);
  const narrow = useMedia(NARROW);
  const region = useCallingRegion();
  const gifts = useGiftsUnavailable();
  const [gifting, setGifting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [labelling, setLabelling] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const routeButton = useRef<HTMLButtonElement>(null);
  if (!contact || contact.deletedAt !== null) {
    return (
      <div className={`${styles.screen} ${styles.narrowScreen}`}>
        <EmptyState scene="trash" as="h1" title={t('This contact no longer exists')} text={t('It was deleted, on this device or another.')} />
      </div>
    );
  }
  const name = contactName(contact);
  const work = workLine(contact);
  const worn = contact.labelIds.map(labelId => labels[labelId]).filter(label => label && label.deletedAt === null);
  const trashed = contact.trashedAt !== null;
  const call = callNumber(contact);
  const chat = whatsappNumber(contact);
  const email = contact.emails.find(entry => mailtoHref(entry.address));
  const place = contact.addresses.find(entry => addressLine(entry));
  const nothing = contact.phones.length === 0 && contact.emails.length === 0 && !place && !readBirthday(contact.birthday) && !contact.note.trim();
  const trash = (): void => {
    const undo = trashContacts([id]);
    navigate(paths.contacts);
    showUndo(t('Contact moved to the bin'), undo);
  };
  // Neighbours on different turns of the pebble.
  let turn = 0;
  const nextTurn = (): number => {
    turn += 1;
    return turn - 1;
  };
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      {trashed ? (
        <OutlinedBox kind="panel" className={`${styles.notice} paper`}>
          <Icon name="trash" size={22} />
          <span className="t-body">{t('This contact is in the bin.')}</span>
          <Button kind="text" icon="restore" onClick={() => showUndo(t('Contact restored'), restoreContacts([id]))}>
            {t('Restore')}
          </Button>
        </OutlinedBox>
      ) : null}
      <header className={styles.hero}>
        <Avatar contact={contact} size={narrow ? 112 : 120} />
        <div className={styles.heroText}>
          <h1 className={`${styles.heroName} t-display`}>{name}</h1>
          {work ? <p className={`${styles.heroWork} t-body`}>{work}</p> : null}
          {worn.length > 0 ? (
            <div className={styles.heroLabels}>
              {worn.map(label => (
                <LabelMark key={label!.id} name={label!.name} color={label!.color} />
              ))}
            </div>
          ) : null}
        </div>
        {trashed ? null : (
          <HeroTools>
            <IconButton icon="star" label={contact.favorite ? t('Remove from favourites') : t('Add to favourites')} pressed={contact.favorite} shape={1} onClick={() => toggleFavorite(contact)} />
            {narrow ? (
              <IconButton icon="edit" label={t('Edit')} shape={3} onClick={() => navigate(paths.edit(id))} />
            ) : (
              <Button kind="tonal" icon="edit" onClick={() => navigate(paths.edit(id))}>
                {t('Edit')}
              </Button>
            )}
            <IconButton ref={more} icon="more" label={t('More actions')} shape={2} hasPopup="menu" expanded={menuOpen} onClick={() => setMenuOpen(true)} />
            <Menu
              open={menuOpen}
              anchor={more}
              onDismiss={() => setMenuOpen(false)}
              label={t('Actions on {name}', { name })}
              items={[
                // The phone's order: the card handed on (here as a file), its labels, a gift idea, the bin.
                { label: t('Export (.vcf)'), icon: 'upload', onSelect: () => exportContacts([contact]) },
                { label: t('Labels'), icon: 'tag', onSelect: () => setLabelling(true) },
                { label: t('Gift idea…'), icon: 'bag', onSelect: () => (gifts ? showWarning(gifts) : setGifting(true)) },
                { label: t('Delete'), icon: 'trash', danger: true, separatorBefore: true, onSelect: trash },
              ]}
            />
            <LabelsPopover ids={[id]} open={labelling} anchor={more} label={t('{name}’s labels', { name })} onDismiss={() => setLabelling(false)} />
          </HeroTools>
        )}
      </header>
      {call || email || chat || place ? (
        <nav className={styles.actions} aria-label={t('Contact {name}', { name })}>
          {call ? <QuickAction icon="phoneCall" label={t('Call')} href={telHref(call.number, region)} turn={nextTurn()} /> : null}
          {chat ? (
            <QuickAction
              icon="phone"
              label={t('WhatsApp')}
              href={whatsappUrl(chat.number, region)}
              turn={nextTurn()}
              external
              why={whatsappUrl(chat.number, region) ? undefined : t('This number has no country code: choose the default country code in Settings, or write it with its +.')}
            />
          ) : null}
          {email ? <QuickAction icon="email" label={t('Email')} href={mailtoHref(email.address)} turn={nextTurn()} /> : null}
          {place ? <QuickAction icon="mapPin" label={t('Directions')} turn={nextTurn()} anchor={routeButton} expanded={routeOpen} onClick={() => setRouteOpen(true)} /> : null}
          {place ? (
            <Menu
              open={routeOpen}
              anchor={routeButton}
              align="start"
              onDismiss={() => setRouteOpen(false)}
              label={t('Directions to {name}', { name })}
              items={OFFERED_MAP_APPS.map(app => ({ label: t('Directions in {maps}', { maps: MAP_APP_NAMES[app] }), icon: 'external' as const, onSelect: () => openOut(directionsUrl(place, app)!) }))}
            />
          ) : null}
        </nav>
      ) : null}
      {trashed ? null : <BirthdayNotice contact={contact} region={region} />}
      {/* Nothing but a name: where the details would be, how to add them (as on the phone). */}
      {nothing && !trashed ? <EmptyLine text={t('Nothing else yet: “Edit” adds a number, an email, an address, a birthday.')} align="center" className={styles.noDetails} /> : null}
      <Coordinates contact={contact} />
      <Addresses contact={contact} />
      <About contact={contact} />
      <MentionedIn id={id} />
      <GiftDialog contact={contact} open={gifting} onClose={() => setGifting(false)} />
    </div>
  );
}
