/**
 * « Souhaiter »: a birthday's wish written for the person in the device's language (« Joyeux
 * anniversaire, Léa ! »), and the ways it can go, those they have, in the suite's order: an SMS to
 * their number, WhatsApp on it (where its international form is known), an e-mail. Each opens its app
 * with the message written, to be changed there before it is sent. Offered on the day and the day
 * after: a wish a day late is still welcome. The message stays in GSM's alphabet where the name does
 * (a plain space before « ! »), so an SMS keeps its 160 characters.
 */
import { t, tc } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import type { Contact } from '../models/contacts';
import { mailtoHref } from './addresses';
import { daysToBirthday, type Birthday } from './birthdays';
import { callNumber, shownNumber, smsHref, whatsappNumber, whatsappUrl } from './phones';

/** Where a wish can go, in the order they are offered (the ways to reach someone's: SMS, WhatsApp, e-mail). */
export const WISH_CHANNELS = ['sms', 'whatsapp', 'email'] as const;
export type WishChannel = (typeof WISH_CHANNELS)[number];

/** Each way's glyph, as the ways to reach someone show it (SMS `bubble`, WhatsApp `phone`, e-mail `email`). */
export const WISH_GLYPHS: Readonly<Record<WishChannel, GlyphName>> = { sms: 'bubble', whatsapp: 'phone', email: 'email' };

export interface WishWay {
  readonly channel: WishChannel;
  /** What opens it with the message written: `sms:+336…?body=…`, `https://wa.me/336…?text=…`, `mailto:…?subject=…&body=…`. */
  readonly href: string;
  /** Where it goes, as the contact's page shows it: the number with its calling code, or the address. */
  readonly to: string;
}

export interface WishOptions {
  /** Offer the SMS (a phone, a browser under a finger; a computer has nothing to text with). */
  readonly sms?: boolean;
  /** Offer WhatsApp (the phone knows whether it is installed). */
  readonly whatsapp?: boolean;
}

/** « SMS », « WhatsApp », « E-mail ». */
export function wishChannelName(channel: WishChannel): string {
  switch (channel) {
    case 'sms':
      return tc('message', 'Text');
    case 'whatsapp':
      return t('WhatsApp');
    case 'email':
      return t('Email');
    default:
      return channel;
  }
}

/** « Joyeux anniversaire, Léa ! », by the first name; « Joyeux anniversaire ! » without one. */
export function wishMessage(contact: Pick<Contact, 'firstName'>): string {
  const name = contact.firstName.trim();
  return name ? t('Happy birthday, {name}!', { name }) : t('Happy birthday!');
}

/** An e-mail's subject: « Joyeux anniversaire ». */
export const wishSubject = (): string => t('Happy birthday');

/** The SMS to `number` with `body` written; null when it has no number to text. */
export function smsWishHref(number: string, region: string | null, body: string): string | null {
  const href = smsHref(number, region);
  return href ? `${href}?body=${encodeURIComponent(body)}` : null;
}

/** WhatsApp's chat with `number`, `text` written; null when its international form cannot be known. */
export function whatsappWishHref(number: string, region: string | null, text: string): string | null {
  const href = whatsappUrl(number, region);
  return href ? `${href}?text=${encodeURIComponent(text)}` : null;
}

/** An e-mail to `address`, its subject and body written; null for no address. */
export function emailWishHref(address: string, subject: string, body: string): string | null {
  const href = mailtoHref(address);
  return href ? `${href}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null;
}

/**
 * The ways a wish can reach the person, each once: an SMS to the number a call dials (their mobile
 * first, as the page's « SMS »), WhatsApp on their mobile (as the page's « WhatsApp »), an e-mail to
 * their first address. Numbers take `region`'s calling code (« Indicatif par défaut »). Empty for
 * someone with no number nor e-mail.
 */
export function wishWays(contact: Pick<Contact, 'firstName' | 'phones' | 'emails'>, region: string | null, options: WishOptions = {}): WishWay[] {
  const message = wishMessage(contact);
  const ways: WishWay[] = [];
  const text = callNumber(contact);
  const sms = options.sms !== false && text ? smsWishHref(text.number, region, message) : null;
  if (text && sms) ways.push({ channel: 'sms', href: sms, to: shownNumber(text.number, region) });
  const chat = whatsappNumber(contact);
  const whatsapp = options.whatsapp !== false && chat ? whatsappWishHref(chat.number, region, message) : null;
  if (chat && whatsapp) ways.push({ channel: 'whatsapp', href: whatsapp, to: shownNumber(chat.number, region) });
  for (const entry of contact.emails) {
    const email = emailWishHref(entry.address, wishSubject(), message);
    if (!email) continue;
    ways.push({ channel: 'email', href: email, to: entry.address.trim() });
    break;
  }
  return ways;
}

/** How many days after a birthday « Souhaiter » is still offered: the day itself, and the day after. */
export const WISH_DAYS_LATE = 1;

/** Whether a birthday `days` after the day it fell on (0: today) is still to be wished. */
export const wishDueAfter = (days: number): boolean => days >= 0 && days <= WISH_DAYS_LATE;

/** The days since the birthday while it is still to be wished (0 on the day itself, 1 the day after); null the rest of the year. */
export function wishDaysLate(birthday: Birthday, now: number): number | null {
  for (let late = 0; late <= WISH_DAYS_LATE; late += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() - late);
    if (daysToBirthday(birthday, day.getTime()) === 0) return late;
  }
  return null;
}
