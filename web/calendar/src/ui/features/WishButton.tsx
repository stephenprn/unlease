/**
 * « Souhaiter » on a birthday in Agenda (its page and its popover), as Contacts draws it. Several
 * ways (WhatsApp, an e-mail; an SMS under a finger, where the browser is a phone's: a computer has
 * nothing to text with) hang from it in a menu; one goes at once. The message is changed, if wished,
 * in the app it opens. Nothing is drawn without a way to write to them.
 */
import { useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import type { Contact } from '@unlease/contacts/models/contacts';
import { contactName } from '@unlease/contacts/services/names';
import { WISH_GLYPHS, wishChannelName, wishWays, type WishWay } from '@unlease/contacts/services/wishes';

import { Button } from '@shared/ui/components/Button';
import { Menu } from '@shared/ui/components/Menu';
import { useMedia } from '@shared/ui/useMedia';

/** WhatsApp's page in a tab of its own; an SMS or an e-mail in its app, the page left where it is. */
export function openWish(way: WishWay): void {
  if (way.href.startsWith('https:')) {
    window.open(way.href, '_blank', 'noopener,noreferrer');
    return;
  }
  const link = document.createElement('a');
  link.href = way.href;
  link.rel = 'noopener';
  link.click();
}

/** The ways a wish can go from this browser: the SMS only under a finger. */
export function useWishWays(contact: Contact, region: string | null): WishWay[] {
  const finger = useMedia('(pointer: coarse)');
  return wishWays(contact, region, { sms: finger });
}

export function WishButton({ contact, region, small = false, className }: { contact: Contact; region: string | null; small?: boolean; className?: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const ways = useWishWays(contact, region);
  if (ways.length === 0) return null;
  const name = contactName(contact);
  return (
    <span ref={anchor} className={className}>
      <Button kind="tonal" icon="bubble" small={small} onClick={() => (ways.length === 1 ? openWish(ways[0]!) : setOpen(true))}>
        {/* The word in sight; the whole sentence heard, so a list of them says whose each is. */}
        <span aria-hidden="true">{t('Send wishes')}</span>
        <span className="sr-only">{t('Wish {name} a happy birthday', { name })}</span>
      </Button>
      {ways.length > 1 ? (
        <Menu
          open={open}
          anchor={anchor}
          align="end"
          onDismiss={() => setOpen(false)}
          label={t('Wish {name} a happy birthday', { name })}
          items={ways.map(way => ({ label: wishChannelName(way.channel), icon: WISH_GLYPHS[way.channel], onSelect: () => openWish(way) }))}
        />
      ) : null}
    </span>
  );
}
