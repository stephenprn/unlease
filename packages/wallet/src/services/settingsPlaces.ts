/**
 * Wallet's places a search finds (`core/services/settingsSearch`): Réglages' « Coffre » section (when
 * the papers lock again, the fingerprint, the passphrase, the recovery kit) and « À la caisse » (the
 * screen's brightness, the barcode at the top).
 */
import { tx } from '@unlease/core/i18n';
import type { SettingsPlace } from '@unlease/core/services/settingsSearch';
import type { GlyphName } from '@unlease/design/glyphs';

/** Réglages' sections, as addresses: the web's `#wallet`, the phone's `section`. */
export const VAULT_SETTINGS_SECTION = 'wallet';
export const TILL_SETTINGS_SECTION = 'wallet-till';

const own = (section: string, within: string) => (place: Omit<SettingsPlace<GlyphName>, 'app' | 'area' | 'section' | 'within'>): SettingsPlace<GlyphName> => ({
  ...place,
  app: 'wallet',
  area: 'settings',
  section,
  within,
});
const vault = own(VAULT_SETTINGS_SECTION, tx('Vault'));
const till = own(TILL_SETTINGS_SECTION, tx('At the till'));

export const WALLET_SETTINGS_PLACES: readonly SettingsPlace<GlyphName>[] = [
  vault({ id: 'wallet-lock-after', title: tx('Lock papers again'), glyph: 'lock', words: ['verrouiller', 'delai', 'arriere-plan', 'minutes', 'lock', 'timeout', 'background'] }),
  vault({ id: 'wallet-fingerprint', title: tx('Unlock with your fingerprint'), glyph: 'fingerprint', words: ['empreinte', 'biometrie', 'visage', 'code', 'fingerprint', 'biometric', 'face', 'pin'], only: 'phone' }),
  vault({ id: 'wallet-passphrase', title: tx('Change the passphrase'), glyph: 'key', words: ['phrase secrete', 'mot de passe', 'passphrase', 'password'] }),
  vault({ id: 'wallet-recovery', title: tx('Recovery kit'), glyph: 'shield', words: ['secours', 'recuperation', 'code', 'perdu', 'oublie', 'recovery', 'lost', 'forgot'] }),
  vault({ id: 'wallet-remember-cards', title: tx('Keep cards open in this browser'), glyph: 'card', words: ['navigateur', 'cartes', 'memoriser', 'browser', 'remember', 'cards'], only: 'web' }),
  till({ id: 'wallet-brighten', title: tx('Brighten the screen'), glyph: 'sun', words: ['luminosite', 'ecran', 'caisse', 'brightness', 'screen', 'till'], only: 'phone' }),
  till({ id: 'wallet-barcode-top', title: tx('Barcode at the top of the screen'), glyph: 'barcode', words: ['haut', 'code-barres', 'lecteur', 'top', 'barcode', 'scanner'] }),
];
