/**
 * Reaching a contact: a call (at once once allowed, else the dialer), a message, WhatsApp (its chat
 * by wa.me in the device's region; its voice or video call where WhatsApp knows the number), an
 * email (an address and the way there open through the suite's `openPlace`), a birthday's wish
 * written into one of them (« Souhaiter »); and their card, shared or saved.
 */
import { Linking } from 'react-native';

import { t } from '@unlease/core/i18n';
import { APP_NAME } from '@unlease/contacts/brand';
import type { Contact, ContactLabel } from '@unlease/contacts/models/contacts';
import { contactName } from '@unlease/contacts/services/names';
import { dialNumber, regionOf, smsHref, whatsappUrl } from '@unlease/contacts/services/phones';
import { mailtoHref } from '@unlease/contacts/services/addresses';
import { toVCard, toVCards } from '@unlease/contacts/services/vcard';
import { wishWays, type WishWay } from '@unlease/contacts/services/wishes';
import { saveFile } from '@shared/platform/media';
import { deviceLanguage } from '@shared/platform/locale';
import { showSnack } from '@shared/app/store/uiStore';
import { askPermission, hasPermission, openWhatsappCall, placeCall, shareText, whatsappCalls, whatsappInstalled, type WhatsappCalls } from '@platform/phoneContacts';

import { isCallingRegion, setCallAsked, useContactsUiStore } from './store/contactsUi';
import { useLibraryStore } from './store/libraryStore';

const VCARD = 'text/x-vcard';

async function open(url: string | null): Promise<boolean> {
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    showSnack(t('No app on this phone can open this.'), undefined, { tone: 'error' });
    return false;
  }
}

/** The phone's own region (`FR` for fr-FR), when its calling code is known. */
export const phoneRegion = (): string | null => {
  const region = regionOf(deviceLanguage());
  return isCallingRegion(region) ? region : null;
};

/** The region a national number takes for `chosen` (Réglages' « Indicatif par défaut »): it, else the phone's. */
export const regionFor = (chosen: string | null): string | null => (chosen === 'none' ? null : (chosen ?? regionOf(deviceLanguage())));

/** The region a national number takes (to show and dial it, for WhatsApp, to compare numbers): the one chosen in Réglages, else the phone's. */
export const deviceRegion = (): string | null => regionFor(useContactsUiStore.getState().region);

/**
 * « Appeler »: the first time, Android asks whether Contacts may call directly; then a call starts at
 * once, or the dialer opens with the number when it may not. A national number is dialled with the
 * « Indicatif par défaut »'s code, so it reaches the person from abroad too.
 */
export async function callNumber(number: string): Promise<void> {
  if (!useContactsUiStore.getState().callAsked && !(await hasPermission('calls'))) {
    await askPermission('calls');
    setCallAsked();
  }
  const placed = await placeCall(dialNumber(number, deviceRegion()));
  if (placed === 'none') showSnack(t('This phone doesn’t make calls.'), undefined, { tone: 'warning' });
}

export const textNumber = (number: string): Promise<boolean> => open(smsHref(number, deviceRegion()));

export const writeEmail = (address: string): Promise<boolean> => open(mailtoHref(address));

/** « Souhaiter »: the way chosen opened with the wish written, to be changed there before it is sent. */
export const sendWish = (way: WishWay): Promise<boolean> => open(way.href);

/** The ways a wish can go from this phone: those the person has, WhatsApp once it is installed. */
export async function wishWaysHere(contact: Contact): Promise<WishWay[]> {
  const installed = await whatsappInstalled().catch(() => false);
  return wishWays(contact, deviceRegion(), { whatsapp: installed });
}

/** WhatsApp's chat with the number; a slip says why when its international form cannot be known. */
export async function whatsappChat(number: string): Promise<boolean> {
  const url = whatsappUrl(number, deviceRegion());
  if (!url) {
    showSnack(t('Add the country code to this number (+44…) to open it in WhatsApp.'), undefined, { tone: 'warning' });
    return false;
  }
  return open(url);
}

export interface WhatsappReach {
  readonly installed: boolean;
  /** WhatsApp's call rows for the number, read only once READ_CONTACTS is given. */
  readonly calls: WhatsappCalls;
}

/** What WhatsApp offers for this number on this phone. */
export async function whatsappReach(number: string | null): Promise<WhatsappReach> {
  const installed = await whatsappInstalled();
  const calls = installed && number && (await hasPermission('contacts')) ? await whatsappCalls(number) : { voice: '', video: '' };
  return { installed, calls };
}

export async function whatsappCall(uri: string, video: boolean): Promise<void> {
  if (!(await openWhatsappCall(uri, video))) showSnack(t('WhatsApp couldn’t open the call.'), undefined, { tone: 'error' });
}

const fileName = (name: string): string => `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'contact'}.vcf`;

/** « Partager »: the contact's card, through the share sheet. */
export async function shareContact(contact: Contact): Promise<void> {
  const labels: Readonly<Record<string, ContactLabel>> = useLibraryStore.getState().labels;
  if (!(await shareText(fileName(contactName(contact)), VCARD, toVCard(contact, labels)))) showSnack(t('Couldn’t share this contact.'), undefined, { tone: 'error' });
}

/** Text as UTF-8 bytes (the save screen takes bytes). */
export function utf8(text: string): Uint8Array {
  const bytes: number[] = [];
  // Each continuation byte holds six bits: 0x80 plus what is left after the bits above it.
  const tail = (code: number, shift: number): number => 0x80 + (Math.floor(code / 2 ** shift) % 64);
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 + Math.floor(code / 64), tail(code, 0));
    else if (code < 0x10000) bytes.push(0xe0 + Math.floor(code / 4096), tail(code, 6), tail(code, 0));
    else bytes.push(0xf0 + Math.floor(code / 262144), tail(code, 12), tail(code, 6), tail(code, 0));
  }
  return Uint8Array.from(bytes);
}

/** « Exporter »: every live contact as one `.vcf`, saved where the person chooses. */
export async function exportContacts(contacts: readonly Contact[]): Promise<'ok' | 'cancelled' | 'error'> {
  const labels = useLibraryStore.getState().labels;
  const saved = await saveFile(fileName(APP_NAME), VCARD, utf8(toVCards(contacts, labels)));
  return saved.status === 'ok' ? 'ok' : saved.status === 'cancelled' ? 'cancelled' : 'error';
}
