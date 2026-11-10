/**
 * The suite's apps on this phone (`NativeSuiteLink`): what this app hands its siblings, and what
 * theirs hold. A build without the module (an older native build, a test) shares nothing and finds
 * nobody, never a crash.
 */
import NativeSuiteLink from '../../specs/NativeSuiteLink';

export interface SiblingHolding {
  readonly packageName: string;
  /** '' when it keeps everything on the phone. */
  readonly server: string;
  readonly token: string;
  /** JSON, '' when never set. */
  readonly appearance: string;
  /** JSON, '' when never chosen (or from a build before it was shared). */
  readonly grain: string;
  /** JSON, '' when never chosen (or from a build before it was shared). */
  readonly locale: string;
  /** The look it last sent, JSON, '' when it never sent one (or from a build before it was shared). */
  readonly look: string;
}

export function shareWithSiblings(server: string, token: string, appearance: string, grain: string, locale: string, look: string): void {
  try {
    NativeSuiteLink?.share(server, token, appearance, grain, locale, look);
  } catch {
    // Nothing to hand on: the siblings find nothing, as before they shipped.
  }
}

export async function siblingHoldings(packages: readonly string[]): Promise<SiblingHolding[]> {
  if (!NativeSuiteLink || packages.length === 0) return [];
  try {
    return (await NativeSuiteLink.siblings([...packages])).links.map(link => ({ ...link, grain: link.grain ?? '', locale: link.locale ?? '', look: link.look ?? '' }));
  } catch {
    return [];
  }
}
