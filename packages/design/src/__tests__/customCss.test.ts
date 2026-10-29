import { transform } from 'lightningcss';

import { DEFAULT_APPEARANCE, PALETTE_COLORS, resolveAppearance, type Appearance } from '../appearance';
import { CSS_SERVICES, customCss, tokensKnown, tokensUsed, type CssService } from '../customCss';
import { CSS_RULES } from '../customCssRules';
import { ROLES } from '../palette';

/** Looks a person can set: the default, a palette on clouds without grain, loud colours picked by hand on black, a generated blend. */
const LOOKS: readonly Appearance[] = [
  DEFAULT_APPEARANCE,
  { ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.myrtille, ground: { kind: 'preset', key: 'nacre' }, grain: false },
  { ...DEFAULT_APPEARANCE, primary: '#FF00FF', accent: '#00FF00', ground: { kind: 'color', color: '#000000' } },
  { ...DEFAULT_APPEARANCE, ground: { kind: 'gradient', colors: ['#FFD1DC', '#B5EAD7', '#C7CEEA'], form: 'fondu', seed: 3 } },
];

/** Paint, never layout: the only properties the rules may set (custom properties aside). */
const PAINTS = /^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?-color|outline-color|box-shadow|caret-color|accent-color|scrollbar-color|fill|stroke|text-decoration-color|border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius)$/;

/** CSS's named colours (and the system's), which would paint a colour of the rules' own. */
const NAMED =
  /\b(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen|canvas|canvastext|linktext|buttonface|buttontext|field|fieldtext|highlight|highlighttext|graytext|mark|marktext)\b/i;

/** The rules' declarations, comments gone: each property with its value. */
function declarations(rules: string): readonly (readonly [property: string, value: string])[] {
  const bare = rules.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...bare.matchAll(/([a-z-]+)\s*:\s*([^;{}]+?)\s*(?:;|(?=\}))/gi)].map(([, property, value]) => [property!.toLowerCase(), value!] as const);
}

/** Why a declaration cannot hold: a property that is not paint, a colour of its own, or a token where its kind does not fit. */
function fault(property: string, value: string): string | null {
  const custom = property.startsWith('--');
  if (!custom && !PAINTS.test(property)) return 'not a paint property';
  // Token names are not colours: look at what is left once every var() name is gone.
  const literal = value.replace(/var\(\s*--[a-z0-9-]+/gi, 'var(');
  if (/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(\s*[\d.+-]/i.test(literal) || NAMED.test(literal)) return 'a colour of its own';
  for (const [, token] of value.matchAll(/var\(--carnet-([a-z0-9-]+)/g)) {
    if (token === 'ground' && !custom && property !== 'background') return 'the ground outside a background';
    if (token!.endsWith('-rgb') && !new RegExp(`rgba?\\(var\\(--carnet-${token}\\)`).test(value) && !(custom && value.trim() === `var(--carnet-${token})`)) return 'channels outside rgb()';
    if (token!.startsWith('lift-') && !custom && property !== 'box-shadow') return 'a lift outside a shadow';
    if (token === 'checked-box' && !custom && property !== 'background-image') return 'a picture outside a background image';
    if (token!.startsWith('radius-') && !custom && !property.endsWith('radius')) return 'a corner outside a radius';
    if (!/^(?:ground|checked-box|lift-|radius-)|-rgb$/.test(token!) && property.endsWith('radius')) return 'a colour in a radius';
  }
  // A service's own picture is replaced only by a gradient of the tokens, the tokens' own picture, or none (a glow taken off).
  if (property === 'background-image' && value.trim() !== 'none' && !/gradient\(|var\(--carnet-checked-box\)/.test(value)) return 'a background image that is no gradient';
  return null;
}

/** The declarations of the block a selector opens in a sheet. */
function blockOf(css: string, selector: string): string {
  const start = css.indexOf(`\n${selector} {\n`);
  expect(start, `no block for ${selector}`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n}', start));
}

describe.each<CssService>(CSS_SERVICES)('%s', service => {
  const sheet = CSS_RULES[service];
  const used = tokensUsed(sheet.rules);

  it('reads only tokens a block writes', () => {
    expect([...used].filter(name => !tokensKnown().has(name))).toEqual([]);
  });

  it('paints with the tokens alone, each in a property of its kind, never a layout', () => {
    const found = declarations(sheet.rules);
    expect(found.length).toBeGreaterThan(0);
    expect(found.flatMap(([property, value]) => {
      const why = fault(property, value);
      return why ? [`${property}: ${value} (${why})`] : [];
    })).toEqual([]);
  });

  it('closes every block it opens', () => {
    const bare = sheet.rules.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"|'[^']*'/g, '');
    let depth = 0;
    for (const char of bare) {
      depth += char === '{' ? 1 : char === '}' ? -1 : 0;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it('writes the day on the root, then every theme what the rules read', () => {
    expect(sheet.modes[0]![1]).toBe(':root');
    for (const look of LOOKS) {
      const css = customCss(service, look);
      sheet.modes.forEach(([, selector], index) => {
        const declared = blockOf(css, selector);
        // The corners and the grain are the root's alone, inherited below it.
        const expected = [...used].filter(name => index === 0 || !name.startsWith('radius-'));
        expect(expected.filter(name => !declared.includes(`--carnet-${name}:`))).toEqual([]);
      });
    }
  });

  it('parses without an error or a warning, whatever the look', () => {
    for (const look of LOOKS) {
      const { warnings } = transform({ filename: `${service}.css`, code: new TextEncoder().encode(customCss(service, look)), errorRecovery: true });
      expect(warnings.map(warning => warning.message)).toEqual([]);
    }
  });

  it('is ASCII, read the same whatever charset the service serves it with (Seafile names none)', () => {
    for (const look of LOOKS) expect(customCss(service, look).match(/[^\t\n\x20-\x7e]/g) ?? []).toEqual([]);
  });

  it('says where it goes, and lays the grain only when it is on', () => {
    const grainy = customCss(service, DEFAULT_APPEARANCE);
    expect(grainy).toContain(` * ${sheet.paste}`);
    if (used.has('ground')) expect(grainy).toContain('--carnet-grain: url("data:image/svg+xml,');
    expect(customCss(service, { ...DEFAULT_APPEARANCE, grain: false })).not.toContain('--carnet-grain');
  });
});

describe('the tokens', () => {
  it('carry the palette itself for the default look, and a picked colour fitted as the app paints it', () => {
    const plain = customCss('immich', DEFAULT_APPEARANCE);
    if (tokensUsed(CSS_RULES.immich.rules).has('paper')) expect(plain).toContain(`--carnet-paper: ${ROLES.light.paper};`);
    const loud = { ...DEFAULT_APPEARANCE, accent: '#FFEE00' };
    const fitted = resolveAppearance(loud, 'light').roles.action;
    expect(fitted).not.toBe('#FFEE00');
    if (tokensUsed(CSS_RULES.immich.rules).has('action')) expect(customCss('immich', loud)).toContain(`--carnet-action: ${fitted};`);
  });

  it('give a colour its channels for rgb(var(…) / alpha), in each theme', () => {
    for (const service of CSS_SERVICES) {
      const css = customCss(service, DEFAULT_APPEARANCE);
      for (const [mode, selector] of CSS_RULES[service].modes) {
        const roles = resolveAppearance(DEFAULT_APPEARANCE, mode).roles as unknown as Record<string, string>;
        for (const [, name, value] of blockOf(css, selector).matchAll(/--carnet-([a-z-]+)-rgb: ([^;]+);/g)) {
          const hex = roles[name!.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())];
          if (hex) expect(value, `${service} ${mode} ${name}`).toBe(hex.slice(1).match(/../g)!.map(pair => parseInt(pair, 16)).join(' '));
          else expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
        }
      }
    }
  });
});
