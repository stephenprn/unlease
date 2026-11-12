/**
 * Which build of the suite this is. A dev build (debug and devRelease, `com.stephenprn.<app>.dev`,
 * named « … Dev »: mobile/shared/android/dev-builds.gradle) lives beside the released apps on one
 * phone and never reaches them: its siblings are the other dev builds, and its links answer
 * `carnet-dev://`, `unlease-pages-dev://`… So the phone never writes a package or a scheme of the
 * suite out: `appPackage(id)`, `appScheme(id)`.
 */
import { APPS, type AppId } from '@unlease/core/apps';
import { ownPackage } from '@shared/platform/suiteLink';

/** Each app's released applicationId. Append only (the next apps' ids are kept for them). */
export const SUITE_PACKAGES: Readonly<Record<AppId, string>> = {
  notes: 'com.stephenprn.carnet',
  pages: 'com.stephenprn.pages',
  calendar: 'com.stephenprn.agenda',
  contacts: 'com.stephenprn.contacts',
};

/** A dev build's suffixes: its applicationIds', its schemes'. */
const DEV_PACKAGE = '.dev';
const DEV_SCHEME = '-dev';

/** Whether this app is a dev build (its applicationId ends in `.dev`). */
export const DEV_BUILD = ownPackage().endsWith(DEV_PACKAGE);

/** An app's applicationId in this build: its released one, `….dev` in a dev build. */
export const appPackage = (app: AppId): string => SUITE_PACKAGES[app] + (DEV_BUILD ? DEV_PACKAGE : '');

/** An app's URL scheme in this build (`APPS.<id>.scheme`, `…-dev` in a dev build): what its links start with. */
export const appScheme = (app: AppId): string => APPS[app].scheme + (DEV_BUILD ? DEV_SCHEME : '');
