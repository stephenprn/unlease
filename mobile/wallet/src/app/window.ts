/** The window's guards, as the screens ask for them: a card at the till, a number copied for a minute. */
import { vaultNative } from '@platform/vault';

/** The screen at full brightness and kept on while a card shows at a till. */
export const tillScreen = (on: boolean): void => vaultNative.setTill(on);

/** A number copied, sensitive, wiped from the clipboard after a minute. */
export const copySecret = (text: string): boolean => vaultNative.copySecret(text);

export { biometrics } from '@platform/vault';
