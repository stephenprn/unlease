/** The PhoneContacts TurboModule under Jest: a recorder driven through `state`. */
import type { PhonePhoto, WhatsappCalls } from '../specs/NativePhoneContacts';

export const state = {
  /** What `readContacts` pages through: each entry as the Kotlin writes it. */
  contacts: [] as Record<string, unknown>[],
  whatsapp: true,
  calls: { voice: '', video: '' } as WhatsappCalls,
  placed: [] as string[],
  opened: [] as { uri: string; video: boolean }[],
  imported: [] as string[],
  shared: [] as { fileName: string; mime: string; text: string }[],
};

export function __reset(): void {
  state.contacts = [];
  state.whatsapp = true;
  state.calls = { voice: '', video: '' };
  state.placed = [];
  state.opened = [];
  state.imported = [];
  state.shared = [];
}

const photo = (from: string): PhonePhoto => {
  state.imported.push(from);
  return { path: `/data/files/photos/${state.imported.length}.jpg`, mime: 'image/jpeg' };
};

const NativePhoneContacts = {
  readContacts: async (offset: number, limit: number): Promise<string> => JSON.stringify({ total: state.contacts.length, contacts: state.contacts.slice(offset, offset + limit) }),
  whatsappInstalled: async (): Promise<boolean> => state.whatsapp,
  whatsappCalls: async (): Promise<WhatsappCalls> => state.calls,
  openWhatsappCall: async (uri: string, video: boolean): Promise<boolean> => {
    state.opened.push({ uri, video });
    return true;
  },
  placeCall: async (number: string): Promise<string> => {
    state.placed.push(number);
    return 'dial';
  },
  importPhoto: async (uri: string): Promise<PhonePhoto> => photo(uri),
  importPhotoData: async (base64: string): Promise<PhonePhoto> => photo(`data:${base64.slice(0, 8)}`),
  shareText: async (fileName: string, mime: string, text: string): Promise<boolean> => {
    state.shared.push({ fileName, mime, text });
    return true;
  },
};

export default NativePhoneContacts;
