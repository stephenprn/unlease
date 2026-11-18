/** Wallet's vault under Jest: keys kept in `state`, the fingerprint answering as `state.fingerprint` says. */
export const state = {
  keys: new Map<string, string>(),
  fingerprint: true as boolean,
  secure: false as boolean,
  till: false as boolean,
};

export function __reset(): void {
  state.keys.clear();
  state.fingerprint = true;
  state.secure = false;
  state.till = false;
}

let counter = 0;

export default {
  randomBytes: (length: number): string => {
    counter += 1;
    return Buffer.from(Array.from({ length }, (_, i) => (i * 31 + counter) & 255)).toString('base64url');
  },
  argon2id: async (): Promise<string> => Buffer.alloc(32, 7).toString('base64url'),
  sealFile: async (): Promise<number> => 0,
  openFile: async (): Promise<boolean> => true,
  biometrics: (): string => (state.fingerprint ? 'ready' : 'none'),
  hasTierKey: (tier: string): boolean => state.keys.has(tier),
  storeTierKey: async (tier: string, key: string): Promise<boolean> => {
    state.keys.set(tier, key);
    return true;
  },
  loadTierKey: async (tier: string): Promise<string> => (tier === 'papers' && !state.fingerprint ? '' : (state.keys.get(tier) ?? '')),
  forgetTierKey: (tier: string): void => {
    state.keys.delete(tier);
  },
  sealedDir: (): string => '/data/wallet',
  openedDir: (): string => '/cache/wallet-open',
  wipeOpened: (): void => {},
  viewFile: (_path: string, _mime: string): boolean => true,
  download: async (): Promise<boolean> => true,
  copySecret: (): boolean => true,
  setSecure: (on: boolean): void => {
    state.secure = on;
  },
  setTill: (on: boolean): void => {
    state.till = on;
  },
};
