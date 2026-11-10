/** The SuiteLink TurboModule under Jest: what this app shared, and what its siblings hold, in `state`. */
import type { SiblingLink, SiblingLinks } from '../specs/NativeSuiteLink';

export const state = {
  shared: null as { server: string; token: string; appearance: string; grain: string; locale: string; look: string } | null,
  siblings: [] as SiblingLink[],
  asked: [] as string[][],
};

export function __reset(): void {
  state.shared = null;
  state.siblings = [];
  state.asked = [];
}

const NativeSuiteLink = {
  share: (server: string, token: string, appearance: string, grain: string, locale: string, look: string): void => {
    state.shared = { server, token, appearance, grain, locale, look };
  },
  siblings: async (packages: string[]): Promise<SiblingLinks> => {
    state.asked.push(packages);
    return { links: state.siblings.filter(link => packages.includes(link.packageName)) };
  },
};

export default NativeSuiteLink;
