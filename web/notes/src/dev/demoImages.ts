/**
 * Synthetic pictures for the dev demo: flat drawings standing in for product
 * shots, posters and a phone photo, so screenshots show registered images
 * without any real content. Development only.
 */

const W = 400;
const H = 500;

function frame(ground: string, body: string, width = W, height = H): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${ground}"/>${body}</svg>`;
}

const DRAWINGS: Record<string, () => string> = {
  jacket: () =>
    frame(
      '#E8E2D8',
      `<ellipse cx="200" cy="452" rx="130" ry="10" fill="#D6CEC1"/>
       <path d="M140 92 L200 120 L260 92 L318 120 L352 300 L318 310 L300 200 L300 440 L100 440 L100 200 L82 310 L48 300 L82 120 Z" fill="#B88A5B"/>
       <path d="M160 96 L200 230 L240 96 L222 92 L200 150 L178 92 Z" fill="#9E7449"/>
       <path d="M200 230 L200 440" stroke="#8C6640" stroke-width="3"/>
       <circle cx="214" cy="270" r="5" fill="#5B4128"/><circle cx="214" cy="330" r="5" fill="#5B4128"/><circle cx="214" cy="390" r="5" fill="#5B4128"/>
       <path d="M120 330 h46 v26 h-46 z M234 330 h46 v26 h-46 z" fill="#A87C4F"/>`,
    ),
  sneakers: () =>
    frame(
      '#E3E7EA',
      `<ellipse cx="200" cy="350" rx="150" ry="10" fill="#CBD1D6"/>
       <path d="M70 330 C70 300 90 262 130 250 L196 226 C214 220 226 206 236 196 L262 200 C278 236 300 262 344 276 C364 282 370 300 366 330 Z" fill="#FBFBF8"/>
       <path d="M62 330 H372 V346 C372 352 366 356 360 356 H72 C66 356 62 352 62 346 Z" fill="#C9C2B6"/>
       <path d="M150 248 L176 300 M176 238 L200 286 M200 230 L222 276" stroke="#D5D9DD" stroke-width="5" stroke-linecap="round"/>
       <path d="M262 200 C276 232 300 258 340 272" stroke="#2B4F7A" stroke-width="10" fill="none" stroke-linecap="round"/>`,
    ),
  sweater: () =>
    frame(
      '#ECE5DE',
      `<path d="M150 100 C170 120 230 120 250 100 L320 130 L360 300 L322 312 L300 210 L300 420 L100 420 L100 210 L78 312 L40 300 L80 130 Z" fill="#2E3B5E"/>
       <path d="M150 100 C170 132 230 132 250 100 L250 82 C230 98 170 98 150 82 Z" fill="#26324F"/>
       <path d="M100 396 H300 V420 H100 Z M40 290 L78 302 L74 316 L36 304 Z M360 290 L322 302 L326 316 L364 304 Z" fill="#26324F"/>
       <path d="M130 170 V380 M170 160 V380 M210 160 V380 M250 160 V380 M282 170 V380" stroke="#35446B" stroke-width="6"/>`,
    ),
  scarf: () =>
    frame(
      '#E9E6E1',
      `<path d="M120 70 C170 110 230 110 280 70 L300 100 C250 150 230 160 230 230 L250 440 L190 440 L184 230 C150 170 110 140 100 100 Z" fill="#B23A48"/>
       <path d="M190 440 L194 470 M205 440 L208 470 M220 440 L222 470 M235 440 L236 470 M248 440 L249 470" stroke="#B23A48" stroke-width="4" stroke-linecap="round"/>
       <path d="M188 300 H244 M190 330 H246" stroke="#8F2B38" stroke-width="5"/>`,
    ),
  poster1: () =>
    frame(
      '#123A44',
      `<circle cx="200" cy="230" r="96" fill="#F08A3C"/>
       <rect y="300" width="400" height="200" fill="#0C2B33"/>
       <path d="M0 300 H400" stroke="#F5CD4E" stroke-width="3"/>
       <path d="M40 340 H360 M80 372 H320 M120 404 H280" stroke="#1F5560" stroke-width="5" stroke-linecap="round"/>
       <path d="M150 300 L178 262 L196 280 L222 246 L256 300 Z" fill="#0C2B33"/>
       <rect x="60" y="440" width="180" height="12" rx="6" fill="#F5CD4E"/><rect x="60" y="462" width="110" height="8" rx="4" fill="#7FA8B5"/>`,
    ),
  poster2: () =>
    frame(
      '#3B2A5C',
      `<rect x="70" y="70" width="260" height="260" fill="#6739A5"/>
       <circle cx="200" cy="200" r="90" fill="none" stroke="#D4B6E4" stroke-width="10"/>
       <path d="M110 290 L200 120 L290 290 Z" fill="#E07CC0"/>
       <rect x="70" y="380" width="200" height="14" rx="7" fill="#F2F4F8"/><rect x="70" y="406" width="130" height="9" rx="4.5" fill="#B394E6"/>`,
    ),
  poster3: () =>
    frame(
      '#1C2742',
      `<rect x="0" y="330" width="400" height="170" fill="#141D33"/>
       <path d="M200 70 L214 330 H186 Z" fill="#F2F4F8"/>
       <path d="M150 70 H250 L240 96 H160 Z" fill="#CF3F33"/>
       <path d="M200 84 L20 30 L20 140 Z" fill="#F5CD4E" opacity="0.85"/>
       <path d="M40 380 H360 M90 420 H310" stroke="#24365F" stroke-width="6" stroke-linecap="round"/>`,
    ),
  poster4: () =>
    frame(
      '#D9A22B',
      `<rect x="40" y="40" width="320" height="420" fill="none" stroke="#13213F" stroke-width="6"/>
       <path d="M80 380 L160 210 L210 300 L250 240 L320 380 Z" fill="#13213F"/>
       <circle cx="280" cy="140" r="34" fill="#FBFBF8"/>`,
    ),
  plate: () =>
    frame(
      '#D8C3A5',
      `<circle cx="200" cy="250" r="150" fill="#F7F4EE"/>
       <circle cx="200" cy="250" r="118" fill="none" stroke="#E6E0D4" stroke-width="4"/>
       <ellipse cx="180" cy="236" rx="62" ry="40" fill="#A64B2A"/>
       <path d="M220 280 C250 266 274 280 280 300 C250 312 228 304 220 280 Z" fill="#5CBB86"/>
       <circle cx="240" cy="210" r="14" fill="#F2C230"/><circle cx="150" cy="292" r="10" fill="#CF3F33"/>`,
    ),
  mezze: () =>
    frame(
      '#2F3B36',
      `<circle cx="140" cy="190" r="80" fill="#EDE6D6"/><circle cx="140" cy="190" r="56" fill="#E0B36A"/>
       <circle cx="268" cy="250" r="80" fill="#EDE6D6"/><circle cx="268" cy="250" r="56" fill="#76A85E"/>
       <circle cx="160" cy="350" r="70" fill="#EDE6D6"/><circle cx="160" cy="350" r="48" fill="#C2452D"/>`,
    ),
  article: () =>
    frame(
      '#F3F1EC',
      `<rect x="40" y="50" width="320" height="200" fill="#7DC8E4"/>
       <path d="M40 250 L120 160 L180 210 L250 130 L360 250 Z" fill="#2B63C7"/>
       <rect x="40" y="280" width="260" height="16" rx="8" fill="#13213F"/>
       <rect x="40" y="310" width="300" height="10" rx="5" fill="#9AA3B2"/><rect x="40" y="332" width="280" height="10" rx="5" fill="#9AA3B2"/><rect x="40" y="354" width="200" height="10" rx="5" fill="#9AA3B2"/>`,
    ),
  lamp: () =>
    frame(
      '#E6E8E3',
      `<ellipse cx="200" cy="440" rx="90" ry="12" fill="#C9CCC4"/>
       <rect x="140" y="420" width="120" height="18" rx="9" fill="#2E3B5E"/>
       <path d="M200 420 L170 270 L250 170" stroke="#2E3B5E" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
       <path d="M228 150 L300 120 L318 200 L262 214 Z" fill="#F2C230"/>
       <circle cx="170" cy="270" r="10" fill="#2E3B5E"/>`,
    ),
  lake: () =>
    frame(
      '#BFE0EE',
      `<path d="M0 260 L90 150 L150 210 L230 110 L330 230 L400 180 V300 H0 Z" fill="#6E8C78"/>
       <path d="M230 110 L260 146 L246 150 L232 136 L216 150 L206 140 Z" fill="#FBFBF8"/>
       <rect y="290" width="400" height="210" fill="#7DB4CF"/>
       <path d="M40 340 H140 M220 370 H340 M90 410 H200" stroke="#A9D2E4" stroke-width="5" stroke-linecap="round"/>
       <rect x="280" y="230" width="60" height="44" fill="#E9E2D3"/><path d="M272 232 L310 204 L348 232 Z" fill="#B85C38"/>`,
    ),
  balcony: () =>
    frame(
      '#DCE8EE',
      `<rect y="300" width="640" height="180" fill="#C7B9A6"/>
       <path d="M0 300 H640" stroke="#A89A86" stroke-width="6"/>
       <path d="M40 220 V300 M120 220 V300 M200 220 V300 M280 220 V300 M360 220 V300 M440 220 V300 M520 220 V300 M600 220 V300 M20 220 H620" stroke="#4D5873" stroke-width="6"/>
       <path d="M90 400 h80 l-10 60 h-60 z" fill="#B85C38"/><circle cx="130" cy="370" r="44" fill="#5CBB86"/><circle cx="104" cy="350" r="26" fill="#3E9E6A"/>
       <path d="M280 410 h70 l-8 50 h-54 z" fill="#B85C38"/><circle cx="315" cy="382" r="36" fill="#76CB9A"/>
       <path d="M450 380 h96 l-12 80 h-72 z" fill="#9C4A2E"/><path d="M498 380 C470 300 520 260 500 200 M498 380 C520 320 560 300 560 250" stroke="#3E9E6A" stroke-width="8" fill="none"/><circle cx="560" cy="250" r="12" fill="#CF3F33"/><circle cx="500" cy="200" r="12" fill="#CF3F33"/>`,
      640,
      480,
    ),
};

export function demoImage(id: string): Blob | null {
  const name = id.replace(/^demo-/, '').replace(/-\d+$/, '');
  const draw = DRAWINGS[name];
  return draw ? new Blob([draw()], { type: 'image/svg+xml' }) : null;
}
