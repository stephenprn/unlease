/**
 * The favourites as cards, not as a list to look a name up in: a few people kept within reach, each
 * on a sheet of paper (the card outline, its lift, raised under the pointer), their face large (the
 * photo on its pebble, or their initials on their wash), their name, one quiet line (their work, else
 * the number a call dials, else their e-mail), and the ways to reach them in one tap at its foot, in
 * the contact page's order (a call, an SMS under a finger, WhatsApp, an e-mail). The card opens the
 * contact; its select pebble, over its top-right corner as a note card's, picks it for the selection
 * bar (under the pointer, on keyboard focus, and on every card while a pick is on; Maj+clic a run);
 * under a finger a hold picks it, as on the phone. While a pick is on, a tap on a card picks it too.
 */
import { memo, useMemo, useRef, type MouseEvent, type PointerEvent } from 'react';

import { t } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import type { Contact } from '@unlease/contacts/models/contacts';
import { mailtoHref } from '@unlease/contacts/services/addresses';
import { contactName, workLine } from '@unlease/contacts/services/names';
import { callNumber, shownNumber, smsHref, telHref, whatsappNumber, whatsappUrl } from '@unlease/contacts/services/phones';

import { pickRange, toggleSelected, useContactsUi } from '../../app/store/contactsUi';
import { useContactsStore } from '../../app/store/library';
import { useCallingRegion } from '../../app/store/prefs';
import controls from '@shared/ui/components/controls.module.css';
import { Icon } from '@shared/ui/components/Icon';
import { pebbleUnder } from '@shared/ui/components/IconButton';
import { OutlineEdge, OutlineRing, PebbleEdge, useOutline } from '@shared/ui/components/Outline';
import { isPlainClick, Link } from '@shared/ui/router';
import { useListMotion } from '@shared/ui/useListMotion';
import { useMedia } from '@shared/ui/useMedia';
import styles from './favorites.module.css';
import { paths } from '../routes';
import { Avatar } from './Avatar';

/** The face, large: the card is who they are. */
const FACE = 72;
/** The select pebble's turn, a note card's. */
const TICK_TURN = 2;
/** More cards than this coming or going at once (a whole pick unstarred): the grid just changes. */
const MOVING_AT_MOST = 40;
/** A finger held this long picks the card (the phone's long press, a note card's). */
const HOLD_MS = 500;
/** A finger that moved further than Android's touch slop is not holding still. */
const SLOP = 10;
/** The click a hold leaves behind, if the browser sends one, comes this soon after the finger lifts. */
const SWALLOW_MS = 500;

/**
 * How a card is picked besides its pebble: a finger's hold, and while a pick is on, a plain click
 * anywhere on it (its ways still reach them). Spread on the card's slot.
 */
function usePicking(id: string, picking: boolean) {
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; x: number; y: number; held: boolean; swallowUntil: number }>({ timer: null, x: 0, y: 0, held: false, swallowUntil: 0 });
  const stop = (): void => {
    if (hold.current.timer !== null) clearTimeout(hold.current.timer);
    hold.current.timer = null;
  };
  const onHit = (event: MouseEvent): boolean => !!(event.target as Element).closest(`.${styles.hit}`);
  return {
    onPointerDown: (event: PointerEvent) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      // Its ways and its pebble keep their own press.
      if (!onHit(event)) return;
      stop();
      Object.assign(hold.current, { x: event.clientX, y: event.clientY, held: false });
      hold.current.timer = setTimeout(() => {
        hold.current.timer = null;
        hold.current.held = true;
        toggleSelected(id);
      }, HOLD_MS);
    },
    onPointerMove: (event: PointerEvent) => {
      if (hold.current.timer !== null && Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > SLOP) stop();
    },
    onPointerUp: () => {
      stop();
      if (hold.current.held) hold.current.swallowUntil = performance.now() + SWALLOW_MS;
      hold.current.held = false;
    },
    onPointerCancel: () => {
      stop();
      hold.current.held = false;
    },
    // The browser's own long press (a link's menu, its preview) would cover the card: a finger's hold is the pick.
    onContextMenu: (event: MouseEvent) => {
      if (hold.current.timer !== null || hold.current.held) event.preventDefault();
    },
    onClickCapture: (event: MouseEvent) => {
      if (performance.now() < hold.current.swallowUntil) {
        hold.current.swallowUntil = 0;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // While picking, the card itself picks; its ways and its pebble keep their own click.
      if (picking && isPlainClick(event) && onHit(event)) {
        event.preventDefault();
        event.stopPropagation();
        toggleSelected(id);
      }
    },
  };
}

interface Way {
  readonly icon: GlyphName;
  readonly label: string;
  readonly href: string;
  readonly external?: boolean;
}

/** The ways this browser can reach them, in the contact page's order; one that cannot work here is left out. */
function waysOf(contact: Contact, name: string, region: string | null, finger: boolean): Way[] {
  const call = callNumber(contact);
  const chat = whatsappNumber(contact);
  const email = contact.emails.map(entry => mailtoHref(entry.address)).find(Boolean) ?? null;
  const ways: (Way | null)[] = [
    call ? when(telHref(call.number, region), href => ({ icon: 'phoneCall', label: t('Call {name}', { name }), href })) : null,
    // An SMS only where the browser is a phone's: a computer has nothing to send it with.
    call && finger ? when(smsHref(call.number, region), href => ({ icon: 'bubble', label: t('Text {name}', { name }), href })) : null,
    chat ? when(whatsappUrl(chat.number, region), href => ({ icon: 'phone', label: t('WhatsApp {name}', { name }), href, external: true })) : null,
    email ? { icon: 'email', label: t('Email {name}', { name }), href: email } : null,
  ];
  return ways.filter((way): way is Way => way !== null);
}

const when = (href: string | null, way: (href: string) => Way): Way | null => (href ? way(href) : null);

/** Their one quiet line: what they do, else the number a call dials, else their e-mail. */
function subLine(contact: Contact, region: string | null): string {
  const call = callNumber(contact);
  return workLine(contact) || (call ? shownNumber(call.number, region) : '') || (contact.emails.find(entry => entry.address.trim())?.address.trim() ?? '');
}

const FavoriteCard = memo(function FavoriteCard({ id, picking, run, finger }: { id: string; picking: boolean; run: readonly string[]; finger: boolean }) {
  const contact = useContactsStore(s => s.contacts[id]);
  const picked = useContactsUi(s => s.selection.has(id));
  const region = useCallingRegion();
  const { ref, d, vars, size } = useOutline<HTMLLIElement>('card');
  const pick = usePicking(id, picking);
  if (!contact) return null;
  const name = contactName(contact);
  const sub = subLine(contact, region);
  const ways = waysOf(contact, name, region, finger);
  return (
    <li ref={ref} className={styles.slot} data-motion={id} data-picked={picked || undefined} data-picking={picking || undefined} {...pick}>
      <div className={`${styles.card} paper`} style={vars}>
        <Link to={paths.contact(id)} className={styles.hit} ariaLabel={sub ? `${name}, ${sub}` : name}>
          {null}
        </Link>
        <span className={styles.face}>
          <Avatar contact={contact} size={FACE} />
        </span>
        <span className={`${styles.name} t-body-strong`}>{name}</span>
        {sub ? <span className={`${styles.sub} t-meta`}>{sub}</span> : null}
        {ways.length > 0 ? (
          <nav className={styles.ways} aria-label={t('Contact {name}', { name })}>
            {ways.map((way, index) => (
              <a
                key={way.icon}
                className={`${controls.iconButton} ${styles.way}`}
                {...pebbleUnder(index + 1)}
                href={way.href}
                target={way.external ? '_blank' : undefined}
                rel={way.external ? 'noopener noreferrer' : undefined}
                aria-label={way.label}
                data-tip={way.label}
              >
                <Icon name={way.icon} size={22} />
              </a>
            ))}
          </nav>
        ) : null}
        <OutlineEdge d={d} />
      </div>
      <OutlineRing kind="card" width={size?.width} height={size?.height} className={styles.ring} />
      <button
        type="button"
        role="checkbox"
        className={styles.select}
        data-pebble-under={TICK_TURN}
        data-still
        aria-checked={picked}
        aria-label={t('Select {name}', { name })}
        onClick={event => (event.shiftKey ? pickRange(run, id) : toggleSelected(id))}
      >
        <Icon name="check" size={15} />
        <PebbleEdge turn={TICK_TURN} />
      </button>
    </li>
  );
});

export function FavoriteCards({ contacts }: { contacts: readonly Contact[] }) {
  const picking = useContactsUi(s => s.selection.size > 0);
  const finger = useMedia('(pointer: coarse)');
  const root = useRef<HTMLUListElement>(null);
  // Maj+clic picks a run in the order the cards show.
  const key = contacts.map(contact => contact.id).join(' ');
  const run = useMemo(() => (key ? key.split(' ') : []), [key]);
  // A face unstarred fades where it was and the others close ranks; one starred again settles in.
  useListMotion(root, { scene: 'favorites', most: MOVING_AT_MOST, late: true });
  return (
    <ul ref={root} className={styles.cards} aria-label={t('Favourites')}>
      {contacts.map(contact => (
        <FavoriteCard key={contact.id} id={contact.id} picking={picking} run={run} finger={finger} />
      ))}
    </ul>
  );
}
