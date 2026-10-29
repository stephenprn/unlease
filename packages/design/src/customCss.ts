/**
 * The appearance carried to the services people run beside the suite (Seafile, Seerr, Immich): a
 * stylesheet to paste into each, laying this device's ground, papers, inks and two colours over the
 * service's own, by day and at night where it has both. The sheet opens on those colours as custom
 * properties (`--carnet-*`, resolved as the app paints them, so a colour picked by hand comes out
 * fitted the same way), then the service's rules (`customCssRules.ts`), which read nothing else.
 */
import { APPS, SUITE_NAME } from '@unlease/core/apps';
import { localized, tx } from '@unlease/core/i18n';
import { appearanceKey, groundBackground, resolveAppearance, type Appearance, type GroundChoice, type ResolvedAppearance } from './appearance';
import { CSS_RULES } from './customCssRules';
import { LIFTS, parseHex, type Mode, type Roles } from './palette';
import { RADII } from './shapes';

export const CSS_SERVICES = ['seafile', 'seerr', 'immich'] as const;

export type CssService = (typeof CSS_SERVICES)[number];

/** The way to the sheets, the same words on both clients: the button at the foot of the ground, the dialog it opens, and the slip that points to it once the colours change. */
export const SERVICES_CSS_WORDS = localized({
  open: tx('Habiller vos autres services…'),
  title: tx('Habiller vos autres services'),
  intro: tx('Le CSS de vos couleurs et de votre fond, de jour comme de nuit, à coller dans chacun. Reprenez-le après avoir changé l’apparence.'),
  hint: tx('Seafile, Seerr et Immich peuvent aussi prendre ces couleurs.'),
  see: tx('Voir'),
  copy: tx('Copier'),
  notCopied: tx('Impossible de copier le CSS'),
});

/** What the dialog says of each service: the copy button's full name, where the sheet goes (in the service's own screens' words), and the slip once copied. */
export const CUSTOM_CSS_WORDS: Readonly<Record<CssService, { readonly copy: string; readonly where: string; readonly copied: string }>> = {
  seafile: localized({
    copy: tx('Copier le CSS pour Seafile'),
    where: tx('Collez-le dans Administration système, Paramètres, « CSS personnalisé », validez avec ✓, puis cochez « Utiliser un CSS personalisé ».'),
    copied: tx('CSS pour Seafile copié'),
  }),
  seerr: localized({
    copy: tx('Copier le CSS pour Seerr'),
    where: tx('Toujours sombre, Seerr prend vos couleurs de nuit. Il n’a pas encore de réglage pour le CSS : ajoutez-le avec une extension comme Stylus, ou par votre proxy.'),
    copied: tx('CSS pour Seerr copié'),
  }),
  immich: localized({
    copy: tx('Copier le CSS pour Immich'),
    where: tx('Collez-le dans Administration, Paramètres, « Paramètres du thème », « CSS personnalisé », puis « Sauvegarder ».'),
    copied: tx('CSS pour Immich copié'),
  }),
};

/** A service's name, as the dialog heads its part. */
export const cssServiceName = (service: CssService): string => CSS_RULES[service].name;

/** What makes two appearances give the same sheets: the colours, the ground and its grain (one's own colour and gradient kept aside do not). */
export const customCssKey = (appearance: Appearance): string => `${appearanceKey(appearance)}|${appearance.grain}`;

/** A service's rules: where each theme's tokens go (the day's on the root, the night's on its dark selector; a dark-only service has its night on the root), what they paint, and where its admin pastes them. */
export interface CssRules {
  readonly name: string;
  readonly modes: readonly (readonly [mode: Mode, selector: string])[];
  readonly rules: string;
  /** Where it goes, in the service's own English words: the sheet's head says it. */
  readonly paste: string;
}

/** The ground's film grain as an SVG filter, so the sheet carries it without a file: each pixel black or white, as strong as `ground-grain.png` (same seed). */
const GRAIN_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='g' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='1.3' numOctaves='1' seed='1947' stitchTiles='stitch'/><feColorMatrix values='1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0'/><feComponentTransfer><feFuncR type='discrete' tableValues='0 1'/><feFuncG type='discrete' tableValues='0 1'/><feFuncB type='discrete' tableValues='0 1'/><feFuncA type='table' tableValues='0.24 0 0.24'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>";

/** An SVG as a CSS `url()`, its markup escaped for a data URI. */
const svgUrl = (svg: string): string => `url("data:image/svg+xml,${svg.replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}")`;

const GRAIN_LAYER = `${svgUrl(GRAIN_SVG)} repeat fixed 0 0 / 256px 256px`;

/** A ticked box where a service draws one as a picture (Seafile 14's check-square): the square in the focus colour, the tick cut out of it (what lies behind shows through), since a picture cannot read a variable. */
const checkedBox = (focus: string): string =>
  svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path fill='${focus}' d='M13.5.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2zM6.999 9.44l-2.47-2.47-1.06 1.06 3.53 3.53 6.03-6.03-1.06-1.06z'/></svg>`);

interface Paint {
  readonly look: ResolvedAppearance;
  readonly mode: Mode;
  readonly grain: boolean;
}

/** The roles a sheet carries, by their token names. */
const ROLE_TOKENS: readonly (keyof Roles)[] = [
  'paper',
  'field',
  'paperHigh',
  'ink',
  'inkMuted',
  'inkFaint',
  'hairline',
  'outline',
  'edge',
  'track',
  'veil',
  'action',
  'onAction',
  'link',
  'highlight',
  'actionContainer',
  'onActionContainer',
  'focus',
  'leaf',
  'onLeaf',
  'danger',
  'onDanger',
  'ok',
  'waiting',
  'scrim',
];

const kebab = (name: string): string => name.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);

/** Every token a theme's block may write, in the order it writes them. */
const TOKENS: readonly (readonly [name: string, value: (paint: Paint) => string])[] = [
  ['ground', ({ look, grain }) => (grain ? `var(--carnet-grain), ${groundBackground(look.ground)}` : groundBackground(look.ground))],
  ['wall', ({ look }) => look.ground.base],
  ['ground-top', ({ look }) => look.ground.top],
  ['ground-bottom', ({ look }) => look.ground.bottom],
  ...ROLE_TOKENS.map((role): readonly [string, (paint: Paint) => string] => [kebab(role), ({ look }) => look.roles[role]]),
  ['lift-card', ({ mode }) => LIFTS[mode].card],
  ['lift-raised', ({ mode }) => LIFTS[mode].raised],
  ['lift-float', ({ mode }) => LIFTS[mode].float],
  ['checked-box', ({ look }) => checkedBox(look.roles.focus)],
];

/** The corners, the same in both themes: written once, on the root (the first block's selector). */
const RADIUS_TOKENS: readonly (readonly [name: string, radius: number])[] = [
  ['radius-control', RADII.control],
  ['radius-chip', RADII.chip],
  ['radius-menu', RADII.menu],
  ['radius-card', RADII.card],
  ['radius-dialog', RADII.dialog],
];

/** The tokens a sheet's rules read (each `-rgb` twin as itself). */
export function tokensUsed(rules: string): ReadonlySet<string> {
  return new Set([...rules.matchAll(/var\(--carnet-([a-z0-9-]+)/g)].map(found => found[1]!));
}

/** Every token a block can write: the rules may read nothing else. */
export function tokensKnown(): ReadonlySet<string> {
  const plain = TOKENS.map(([name]) => name);
  return new Set([...plain, ...plain.map(name => `${name}-rgb`), ...RADIUS_TOKENS.map(([name]) => name)]);
}

/** One theme's block: the tokens the rules read, a colour's `-rgb` twin as its channels (`R G B`) for `rgb(var(…) / alpha)`. */
function block(selector: string, paint: Paint, used: ReadonlySet<string>, first: boolean): string {
  const lines: string[] = [];
  // The grain is the same in both themes: written once, on the root, under the ground that lays it.
  if (first && paint.grain && used.has('ground')) lines.push(`  --carnet-grain: ${GRAIN_LAYER};`);
  for (const [name, value] of TOKENS) {
    if (!used.has(name) && !used.has(`${name}-rgb`)) continue;
    const written = value(paint);
    if (used.has(name)) lines.push(`  --carnet-${name}: ${written};`);
    if (used.has(`${name}-rgb`) && /^#[0-9A-F]{6}$/i.test(written)) lines.push(`  --carnet-${name}-rgb: ${parseHex(written).join(' ')};`);
  }
  if (first) for (const [name, radius] of RADIUS_TOKENS) if (used.has(name)) lines.push(`  --carnet-${name}: ${radius}px;`);
  return `${selector} {\n${lines.join('\n')}\n}`;
}

/** The ground as the sheet's head names it. */
function groundWords(ground: GroundChoice): string {
  if (ground.kind === 'preset') return ground.key;
  if (ground.kind === 'color') return ground.color;
  return `${ground.form} ${ground.colors.join(' ')}`;
}

/** The stylesheet that gives `service` this appearance: its head (what it carries, where it goes), each theme's tokens, the service's rules. */
export function customCss(service: CssService, appearance: Appearance): string {
  const sheet = CSS_RULES[service];
  const used = tokensUsed(sheet.rules);
  const head = [
    '/*',
    ` * ${APPS.notes.name}'s look for ${sheet.name} (${SUITE_NAME}): primary ${appearance.primary}, accent ${appearance.accent}, ground ${groundWords(appearance.ground)}${appearance.grain ? ' with grain' : ''}.`,
    ` * ${sheet.paste}`,
    ' * Copy it again after changing the colours or the ground.',
    ' */',
  ].join('\n');
  const blocks = sheet.modes.map(([mode, selector], index) => block(selector, { look: resolveAppearance(appearance, mode), mode, grain: appearance.grain }, used, index === 0));
  return `${[head, ...blocks, sheet.rules.trim()].join('\n\n')}\n`;
}
