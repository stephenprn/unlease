/** Wallet's native vault (`specs/NativeWalletVault.ts`): the platform layer the app goes through. */
import NativeWalletVault from '../../../shared/specs/NativeWalletVault';

export const vaultNative = NativeWalletVault;

export type Biometrics = 'ready' | 'none' | 'unavailable';

export const biometrics = (): Biometrics => {
  const state = NativeWalletVault.biometrics();
  return state === 'ready' || state === 'none' ? state : 'unavailable';
};
