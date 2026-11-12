/**
 * A released build names the released apps; a dev build (`….dev`) names the dev builds only: their
 * packages, their schemes, and so the siblings it asks, never a released app's connection.
 */
import { APP_IDS, APPS } from '@unlease/core/apps';

type Variant = typeof import('../variant');
type Link = typeof import('../suiteLink');
type Native = typeof import('../../../__mocks__/NativeSuiteLink');

// The siblings are asked from Carnet.
jest.mock('../store/library', () => ({ ownApp: () => 'notes' }));

/** The modules as a build with this applicationId loads them (`variant` reads it once, when first imported). */
function buildOf(ownPackage: string): { variant: Variant; link: Link; native: Native['state'] } {
  let loaded!: { variant: Variant; link: Link; native: Native['state'] };
  jest.isolateModules(() => {
    // The stand-in each app's jest.setup maps the module to, as this registry holds it.
    const native = require('../../../__mocks__/NativeSuiteLink') as Native;
    native.state.ownPackage = ownPackage;
    loaded = { variant: require('../variant') as Variant, link: require('../suiteLink') as Link, native: native.state };
  });
  return loaded;
}

describe('a released build', () => {
  it('names the released apps', () => {
    const { variant } = buildOf('com.stephenprn.carnet');
    expect(variant.DEV_BUILD).toBe(false);
    for (const app of APP_IDS) {
      expect(variant.appPackage(app)).toBe(variant.SUITE_PACKAGES[app]);
      expect(variant.appScheme(app)).toBe(APPS[app].scheme);
    }
  });

  it('is what a build without the module is', () => {
    expect(buildOf('').variant.DEV_BUILD).toBe(false);
  });
});

describe('a dev build', () => {
  it('names the dev builds: their packages and their schemes', () => {
    const { variant } = buildOf('com.stephenprn.carnet.dev');
    expect(variant.DEV_BUILD).toBe(true);
    for (const app of APP_IDS) {
      expect(variant.appPackage(app)).toBe(`${variant.SUITE_PACKAGES[app]}.dev`);
      expect(variant.appScheme(app)).toBe(`${APPS[app].scheme}-dev`);
    }
  });

  it('asks the dev builds for their connection, never a released app', async () => {
    const { link, native, variant } = buildOf('com.stephenprn.carnet.dev');
    native.siblings = [
      { packageName: variant.SUITE_PACKAGES.pages, server: 'https://unlease.example.org', token: 'released', appearance: '', grain: '', locale: '', look: '' },
      { packageName: `${variant.SUITE_PACKAGES.pages}.dev`, server: 'http://localhost:8080', token: 'dev', appearance: '', grain: '', locale: '', look: '' },
    ];
    const found = await link.findSiblings('notes');
    const others = ['pages', 'calendar', 'contacts'] as const;
    expect(native.asked).toEqual([others.map(app => `${variant.SUITE_PACKAGES[app]}.dev`)]);
    expect(found).toEqual([expect.objectContaining({ app: 'pages', server: { url: 'http://localhost:8080', token: 'dev' } })]);
  });
});
