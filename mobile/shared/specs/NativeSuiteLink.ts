/**
 * The link between the suite's apps on one phone (`SuiteLink`, `mobile/shared/android`): each app
 * keeps what it hands its siblings (its server's address, its token, its appearance, its grain, its language, the look it sent) and serves it
 * through its own ContentProvider (`<applicationId>.suite`), which only an app signed by the same
 * key may read (the signature permission `com.stephenprn.unlease.permission.SUITE`: the token is a
 * secret). The second app installed reads the first one's on its welcome, so nobody types them twice;
 * every app reads its siblings' grain and language whenever it comes to the front, so they are the suite's, and the look one sent it.
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface SiblingLink {
  /** The sibling's applicationId (`com.stephenprn.carnet`). */
  packageName: string;
  /** Its server's address, '' when it keeps everything on the phone. */
  server: string;
  /** Its token, '' with no server. */
  token: string;
  /** Its appearance as JSON (`design/appearance`), '' when never set. */
  appearance: string;
  /** Its grains and when they were chosen, as JSON (`GrainChoice`), '' when never chosen or from an older build. */
  grain: string;
  /** Its interface's language and when it was chosen, as JSON (`LocaleChoice`), '' when never chosen or from an older build. */
  locale: string;
  /** The look (theme, colours, ground) it last sent, when, and the apps it is for, as JSON (`LookOffer`), '' when it never sent one or from an older build. */
  look?: string;
}

export interface SiblingLinks {
  links: SiblingLink[];
}

export interface Spec extends TurboModule {
  /** What this app hands its siblings from now on; '' clears a value (disconnected). */
  share(server: string, token: string, appearance: string, grain: string, locale: string, look: string): void;
  /** What these siblings hold, those installed and signed alike that answer; never this app itself. */
  siblings(packages: string[]): Promise<SiblingLinks>;
}

export default TurboModuleRegistry.get<Spec>('SuiteLink');
