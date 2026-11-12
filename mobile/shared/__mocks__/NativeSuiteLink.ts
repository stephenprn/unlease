/** The SuiteLink TurboModule under Jest: what this app shared, and what its siblings hold, in `state`. */
import type { SiblingLink, SiblingLinks } from '../specs/NativeSuiteLink';

export const state = {
  shared: null as { server: string; token: string; appearance: string; grain: string; locale: string; look: string } | null,
  siblings: [] as SiblingLink[],
  asked: [] as string[][],
  /** The applicationId this build answers (`@shared/app/variant` reads it once, when first imported). */
  ownPackage: '',
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
  ownPackage: (): string => state.ownPackage,
};

export default NativeSuiteLink;
