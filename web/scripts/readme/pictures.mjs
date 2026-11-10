/**
 * The README's pictures as pages, drawn in the apps' own materials: the ground under its grain, cream
 * sheets with the continuous corner, each app's mark on its pebble, Onde glyphs, threads in the link's
 * terracotta, Signika. Every value comes from `@unlease/design` (handed in as `design`) and the marks
 * from `web/build/brand.ts`; `readme-images.mjs` renders each page by day and by night.
 *
 * Threads are laid out in the page once it is drawn: each joins two items by the edges of the sheets
 * holding them (`data-threads`), so they follow the words wherever the text wraps.
 */

/** GitHub's page by day and by night: the picture lies on it with no edge. */
const SITE = { light: '#ffffff', dark: '#0d1117' };
/** The pictures' width, in CSS pixels (rendered at twice that): GitHub shows them about 0.9 as wide. */
export const WIDTH = 920;

/** What the README says each app replaces. */
const REPLACES = { notes: 'Google Keep', pages: 'Google Docs, Notion', calendar: 'Google Calendar', contacts: 'Google Contacts' };

/** The page's frame: the palette's roles for the scheme as custom properties, the font, the shared pieces. */
function frame(design, scheme, body, threads = []) {
  const roles = design.ROLES[scheme];
  const ground = design.GROUNDS[scheme];
  const lifts = design.LIFTS[scheme];
  const pigment = key => design.LINES[scheme][key];
  return `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Signika; src: url(/signika.woff2) format('woff2'); font-weight: 300 700; }
:root {
  --site: ${SITE[scheme]}; --ground-top: ${ground.top}; --ground-bottom: ${ground.bottom};
  --paper: ${roles.paper}; --field: ${roles.field}; --well: ${roles.paperHigh}; --ink: ${roles.ink}; --muted: ${roles.inkMuted};
  --hairline: ${roles.hairline}; --outline: ${roles.outline}; --dashed: ${roles.dashed}; --veil: ${roles.veil};
  --link: ${roles.link}; --wash: ${roles.actionContainer}; --on-wash: ${roles.onActionContainer}; --leaf: ${roles.leaf};
  --lift-card: ${lifts.card}; --lift-float: ${lifts.float}; --grain: ${scheme === 'light' ? 0.16 : 0.08}; --grad: ${scheme === 'light' ? 0 : -30};
  --pink: ${pigment('pink').fill}; --pink-wash: ${pigment('pink').tint}; --ochre: ${pigment('ochre').fill}; --ochre-wash: ${pigment('ochre').tint};
  --sky: ${pigment('sky').fill}; --sky-wash: ${pigment('sky').tint};  --red: ${pigment('red').fill}; --red-wash: ${pigment('red').tint}; --orange-wash: ${pigment('orange').tint}; --blue: ${pigment('blue').fill};
  --cs: 1;
}
@supports (corner-shape: squircle) { :root { --cs: 1.84; } * { corner-shape: squircle; } .dot { corner-shape: round; } }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--site); }
body { font: 400 16px/22px Signika, sans-serif; font-variation-settings: 'GRAD' var(--grad); color: var(--ink); font-synthesis: none; -webkit-font-smoothing: antialiased; }
p, h2, h3 { margin: 0; }
.ground { position: relative; width: ${WIDTH}px; padding: 32px; border-radius: calc(28px * var(--cs)); background: url(/ground-grain.png) repeat 0 0 / 256px 256px, linear-gradient(180deg, var(--ground-top), var(--ground-bottom)); }
.sheet { position: relative; isolation: isolate; background: var(--paper); border-radius: calc(20px * var(--cs)); box-shadow: inset 0 0 0 1px var(--hairline), var(--lift-card); }
.sheet::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: inherit; background: url(/grain.png) repeat 0 0 / 200px 200px; opacity: var(--grain); }
.panel { border-radius: calc(22px * var(--cs)); }
.frame { border-radius: calc(12px * var(--cs)); }
.optional { background: transparent; box-shadow: none; border: 1.5px dashed var(--dashed); }
.optional::before { display: none; }
.glyph { display: block; flex: none; color: var(--ink); }
.pebble { position: relative; display: inline-grid; place-items: center; flex: none; }
.pebble > svg:first-child { position: absolute; inset: 0; }
.pebble > :not(:first-child) { position: relative; }
.mark { display: block; flex: none; }
.app-head { display: flex; align-items: center; gap: 10px; margin: 0 0 12px 2px; }
.app-name { font-weight: 600; font-size: 20px; line-height: 26px; }
.replaces { font-size: 14px; line-height: 19px; color: var(--muted); }
.section { font-weight: 600; font-size: 14px; line-height: 20px; color: var(--muted); margin: 0 0 10px 2px; }
.title { font-weight: 600; font-size: 20px; line-height: 26px; }
.strong { font-weight: 600; }
.meta { font-size: 14px; line-height: 19px; color: var(--muted); }
.row { display: flex; align-items: center; gap: 12px; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: calc(9px * var(--cs)); box-shadow: inset 0 0 0 1px var(--outline); font-weight: 500; font-size: 14px; line-height: 20px; white-space: nowrap; }
.mono { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13.5px; }
svg.threads { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; z-index: 2; }
.thread-label { position: absolute; z-index: 3; transform: translate(-50%, -50%); padding: 2px 10px; background: var(--paper); border-radius: calc(9px * var(--cs)); box-shadow: inset 0 0 0 1px var(--outline), var(--lift-card); font-weight: 600; font-size: 14px; line-height: 20px; color: var(--link); white-space: nowrap; }
</style>
<main class="ground" data-threads='${JSON.stringify(threads)}'>${body}<svg class="threads"></svg></main>
<script>
${drawThreads.toString()}
document.fonts.ready.then(() => { drawThreads(); window.drawn = true; });
</script>`;
}

/**
 * Lays each thread between the edges of the sheets holding its two items: a curve leaving each edge
 * square to it, a dot where it meets the sheet, its label on a chip at its middle. Runs in the page.
 */
function drawThreads() {
  const ground = document.querySelector('.ground');
  const svg = ground.querySelector('svg.threads');
  const origin = ground.getBoundingClientRect();
  const normals = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
  const NS = 'http://www.w3.org/2000/svg';
  // On the `side` of `sheet` (else of the item itself), level with the item, or `along` that edge (0 to 1).
  const end = ({ item, sheet, side, along }) => {
    const at = document.querySelector(item).getBoundingClientRect();
    const edge = document.querySelector(sheet ?? item).getBoundingClientRect();
    const across = side === 'top' || side === 'bottom';
    const x = side === 'left' ? edge.left : side === 'right' ? edge.right : along === undefined ? at.left + at.width / 2 : edge.left + edge.width * along;
    const y = across ? (side === 'top' ? edge.top : edge.bottom) : along === undefined ? at.top + at.height / 2 : edge.top + edge.height * along;
    return { x: x - origin.left, y: y - origin.top, normal: normals[side] };
  };
  for (const thread of JSON.parse(ground.dataset.threads)) {
    const a = end(thread.from);
    const b = end(thread.to);
    const reach = thread.reach ?? Math.max(30, Math.hypot(b.x - a.x, b.y - a.y) * 0.42);
    const path = document.createElementNS(NS, 'path');
    path.setAttribute(
      'd',
      `M${a.x} ${a.y}C${a.x + a.normal[0] * reach} ${a.y + a.normal[1] * reach} ${b.x + b.normal[0] * reach} ${b.y + b.normal[1] * reach} ${b.x} ${b.y}`,
    );
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'var(--link)');
    path.setAttribute('stroke-width', thread.quiet ? '1.75' : '2.5');
    if (thread.quiet) path.setAttribute('stroke-opacity', '0.6');
    path.setAttribute('stroke-linecap', 'round');
    if (thread.dashed) path.setAttribute('stroke-dasharray', '0.5 7');
    if (thread.dashed) path.setAttribute('stroke-width', '2.75');
    svg.append(path);
    for (const point of [a, b]) {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', String(point.x));
      dot.setAttribute('cy', String(point.y));
      dot.setAttribute('r', thread.quiet ? '4' : '5');
      dot.setAttribute('fill', 'var(--link)');
      dot.setAttribute('stroke', 'var(--paper)');
      dot.setAttribute('stroke-width', '2');
      svg.append(dot);
    }
    if (thread.label) {
      const middle = path.getPointAtLength(path.getTotalLength() * (thread.at ?? 0.5));
      const label = document.createElement('span');
      label.className = 'thread-label';
      label.textContent = thread.label;
      label.style.left = `${middle.x}px`;
      label.style.top = `${middle.y}px`;
      ground.append(label);
    }
  }
}

/**
 * The demo's days as the screens taken in the same run show them (`web/demo`): Léa's birthday in three
 * days (born 1991), the trip from the first Thursday six weeks out to the Sunday.
 */
function demoDays(now) {
  const day = (offset, from = now) => new Date(from + offset * 86_400_000);
  const short = date => date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const birthday = day(3);
  const ahead = day(42);
  const start = day((4 - ahead.getDay() + 7) % 7, ahead.getTime());
  const end = day(3, start.getTime());
  const sameMonth = start.getMonth() === end.getMonth();
  const weekdayAndDay = date => date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
  return {
    birthday: short(birthday),
    birthdate: new Date(1991, birthday.getMonth(), birthday.getDate()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    age: birthday.getFullYear() - 1991,
    trip: `${sameMonth ? weekdayAndDay(start) : short(start)} – ${short(end)}`,
  };
}

/** The pieces every picture draws with. */
function pieces(design, brand) {
  const glyph = (name, size = 22, color = 'var(--ink)') => {
    const form = design.GLYPHS[name].line;
    return (
      `<svg class="glyph" viewBox="0 0 24 24" width="${size}" height="${size}" style="color:${color}" aria-hidden="true">` +
      (form.stroke ? `<path d="${form.stroke}" fill="none" stroke="currentColor" stroke-width="${design.GLYPH_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>` : '') +
      (form.fill ? `<path d="${form.fill}" fill="currentColor" fill-rule="evenodd"/>` : '') +
      '</svg>'
    );
  };
  /** Something on the brand's pebble (a glyph, a mark), the pebble `width` by `height`, turned `turn`. */
  const pebble = (inner, { width = 40, height = 36, turn = 0, fill = 'var(--wash)' } = {}) =>
    `<span class="pebble" style="width:${width}px;height:${height}px"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><path d="${design.pebblePath(width, height, turn)}" fill="${fill}"/></svg>${inner}</span>`;
  const mark = (app, size = 30) => brand.faviconSvg(app).replace('<svg ', `<svg class="mark" width="${size}" height="${size}" aria-hidden="true" `);
  /** A label's hand-cut tag in its pigment. */
  const tag = color => `<svg viewBox="0 0 96 68" width="21" height="15" aria-hidden="true"><path d="${design.LABEL_TAG_PATH}" fill="${color}" fill-rule="evenodd"/></svg>`;
  const appHead = (app, { replaces = false } = {}) =>
    `<div class="app-head">${mark(app)}<span class="app-name">${brand.webAppName(app)}</span>${replaces ? `<span class="replaces">replaces ${REPLACES[app]}</span>` : ''}</div>`;
  return { glyph, pebble, mark, tag, appHead };
}

/** The four apps' homes, two by two, each under its mark, its name and what it replaces. */
export function bannerPage(design, brand, scheme, shots) {
  const { appHead } = pieces(design, brand);
  const tiles = [
    ['notes', 'carnet-board'],
    ['pages', 'pages-home'],
    ['calendar', 'agenda-week'],
    ['contacts', 'contacts-list'],
  ]
    .map(
      ([app, shot]) =>
        `<figure>${appHead(app, { replaces: true })}<img class="shot" src="data:image/jpeg;base64,${shots[`${shot}-${scheme}`].toString('base64')}" alt=""></figure>`,
    )
    .join('');
  return frame(
    design,
    scheme,
    `<style>
.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 26px 32px; }
figure { margin: 0; }
.shot { display: block; width: 100%; aspect-ratio: 1440 / 900; border-radius: calc(20px * var(--cs)); box-shadow: 0 0 0 1px var(--hairline), var(--lift-float); }
</style><div class="tiles">${tiles}</div>`,
  );
}

/**
 * One person seen from the four apps, in the demo's own (French) records under the English interface:
 * Léa's card in the middle, reached from the trip's page that mentions her, the note about her birthday
 * dinner, and her birthday and the dinner at hers in Agenda; around her, quieter, the apps' other links
 * (the page's checklist in Carnet, the weekend's event pointing at the page, a note's reminder).
 */
export function linksPage(design, brand, scheme) {
  const { glyph, pebble, tag, appHead } = pieces(design, brand);
  const days = demoDays(Date.now());
  const check = (words, done = false) =>
    `<div class="row check${done ? ' done' : ''}">${glyph(done ? 'boxChecked' : 'box', 18, done ? 'var(--muted)' : 'var(--ink)')}<span>${words}</span></div>`;
  const dot = color => `<span class="dot" style="width:10px;height:10px;border-radius:50%;background:${color};margin:0 4px"></span>`;
  const event = (id, mark, words, wash) => `<div class="event" id="${id}" style="background:${wash}">${mark}<span>${words}</span></div>`;
  const fact = (id, name, words, meta = '') =>
    `<div class="row fact" id="${id}">${glyph(name, 20)}<div><div>${words}</div>${meta ? `<div class="meta">${meta}</div>` : ''}</div></div>`;
  return frame(
    design,
    scheme,
    `<style>
.board { display: grid; grid-template-columns: 284px 236px 256px; column-gap: 40px; }
.left { display: grid; gap: 34px; }
.middle { align-self: start; margin-top: 170px; }
.right { display: grid; grid-template-rows: auto 1fr; }
.wall { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; }
.stack { display: grid; gap: 10px; }
.note { padding: 12px; display: grid; gap: 5px; font-size: 15px; line-height: 21px; }
.note .strong { font-weight: 700; }
.note.sky { background: var(--sky-wash); }
.note.orange { background: var(--orange-wash); }
.check { gap: 7px; }
.check.done span { color: var(--muted); text-decoration: line-through; }
.who-chip { display: inline-flex; align-items: center; gap: 6px; justify-self: start; font-size: 14px; color: var(--muted); }
.doc { padding: 16px 18px 18px; display: grid; gap: 10px; }
.doc .name { font-weight: 700; font-size: 22px; line-height: 28px; }
.atom { display: inline-flex; align-items: center; gap: 4px; padding: 0 6px; border-radius: calc(5px * var(--cs)); background: var(--veil); font-weight: 600; vertical-align: -3px; line-height: 24px; white-space: nowrap; }
.mention { color: var(--link); }
.person { padding: 16px 16px 18px; display: grid; gap: 10px; }
.who { display: flex; align-items: center; gap: 12px; }
.who .name { font-weight: 700; font-size: 20px; line-height: 26px; }
.label { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; color: var(--muted); }
.fact { gap: 10px; align-items: flex-start; font-size: 15px; line-height: 21px; }
.group { margin-top: 4px; }
.agenda { padding: 14px; display: flex; flex-direction: column; justify-content: space-between; gap: 14px; }
.day { display: grid; gap: 6px; }
.event { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: calc(9px * var(--cs)); font-weight: 600; font-size: 15px; line-height: 20px; }
</style>
<div class="board">
  <div class="left">
    <section>${appHead('notes')}
      <div class="wall">
        <div class="sheet note sky" id="c-pack"><span class="strong">Valise Lisbonne</span>${check('Passeport')}${check('Adaptateur')}${check('Chargeur')}</div>
        <div class="stack">
          <div class="sheet note" id="c-garage"><span class="strong">Appeler le garage</span><span>Contrôle technique avant le 30.</span><span class="chip" style="justify-self:start">${glyph('bell', 15)}Tomorrow, 09:00</span></div>
          <div class="sheet note orange" id="c-lea"><span class="strong">Anniversaire de Léa</span><span>Réserver pour six samedi soir, plutôt vers Oberkampf.</span><span class="who-chip">${glyph('person', 15, 'var(--muted)')}Léa Martin</span></div>
        </div>
      </div>
    </section>
    <section>${appHead('pages')}
      <div class="sheet panel doc" id="page">
        <p class="name">Voyage à Lisbonne</p>
        <p>Quatre jours, du jeudi au dimanche. <span class="atom mention" id="p-lea">${glyph('person', 17, 'var(--link)')}Léa Martin</span> y a vécu : lui demander ses cafés.</p>
        <p>La liste de la valise est dans <span class="atom" id="p-pack">${glyph('checklist', 17)}Valise Lisbonne</span>.</p>
      </div>
    </section>
  </div>
  <section class="middle">${appHead('contacts')}
    <div class="sheet card person" id="person">
      <div class="who">${pebble(glyph('person', 24), { width: 50, height: 46, turn: 1, fill: 'var(--pink-wash)' })}<div><div class="name">Léa Martin</div><span class="label">${tag('var(--red)')}Famille</span></div></div>
      ${fact('k-bday', 'cake', days.birthdate, `In 3 days · ${days.age} years`)}
      <div class="meta strong group">Seen together</div>
      ${fact('k-dinner', 'calendar', 'Dîner chez Léa')}
      <div class="meta strong group">Mentioned in</div>
      ${fact('k-note', 'note', 'Anniversaire de Léa')}
      ${fact('k-link', 'link', 'Jardins de lumière')}
      ${fact('k-page', 'page', 'Voyage à Lisbonne')}
    </div>
  </section>
  <section class="right">${appHead('calendar')}
    <div class="sheet panel agenda" id="agenda">
      <div class="day"><span class="meta strong">Tomorrow</span>${event('a-garage', glyph('bell', 17, 'var(--ochre)'), '09:00 Appeler le garage', 'var(--ochre-wash)')}${event('a-team', dot('var(--blue)'), '09:30 Point d’équipe', 'var(--well)')}</div>
      <div class="day"><span class="meta strong">${days.birthday}</span>${event('a-bday', glyph('cake', 17, 'var(--pink)'), 'Léa Martin’s birthday', 'var(--pink-wash)')}${event('a-dinner', dot('var(--red)'), '20:00 Dîner chez Léa', 'var(--well)')}</div>
      <div class="day"><span class="meta strong">${days.trip}</span>${event('a-trip', dot('var(--red)'), 'Week-end à Lisbonne', 'var(--red-wash)')}</div>
    </div>
  </section>
</div>`,
    [
      // Léa, from the three other apps.
      { from: { item: '#c-lea', side: 'right' }, to: { item: '#k-note', sheet: '#person', side: 'left' } },
      { from: { item: '#p-lea', sheet: '#page', side: 'right' }, to: { item: '#k-page', sheet: '#person', side: 'left' } },
      { from: { item: '#a-bday', sheet: '#agenda', side: 'left' }, to: { item: '#k-bday', sheet: '#person', side: 'right' } },
      { from: { item: '#a-dinner', sheet: '#agenda', side: 'left' }, to: { item: '#k-dinner', sheet: '#person', side: 'right' } },
      // The apps' other links, quieter.
      { from: { item: '#p-pack', sheet: '#page', side: 'top', along: 0.42 }, to: { item: '#c-pack', side: 'bottom', along: 0.86 }, quiet: true, reach: 20 },
      { from: { item: '#a-garage', sheet: '#agenda', side: 'left' }, to: { item: '#c-garage', side: 'right', along: 0.3 }, label: 'reminder', quiet: true },
      { from: { item: '#a-trip', sheet: '#agenda', side: 'left' }, to: { item: '#page', side: 'right', along: 0.82 }, label: 'its programme', quiet: true },
    ],
  );
}

/** Your devices, the one container and its volume, and what it may talk to. */
export function runPage(design, brand, scheme) {
  const { glyph, pebble, mark } = pieces(design, brand);
  const apps = ['notes', 'pages', 'calendar', 'contacts'];
  const item = (name, title, meta) => `<div class="row item">${glyph(name)}<div><div class="strong">${title}</div><div class="meta">${meta}</div></div></div>`;
  const service = (id, name, title, meta, turn) =>
    `<div class="optional frame service" id="${id}">${pebble(glyph(name), { turn })}<div><div class="strong">${title}</div><div class="meta">${meta}</div></div></div>`;
  return frame(
    design,
    scheme,
    `<style>
.columns { display: grid; grid-template-columns: 220px 292px 196px; gap: 74px; align-items: start; }
.devices { display: grid; gap: 18px; }
.phone { width: 150px; padding: 26px 16px 22px; justify-self: center; border-radius: calc(26px * var(--cs)); background: linear-gradient(180deg, var(--ground-top), var(--ground-bottom)); }
.phone::before { opacity: calc(var(--grain) * 0.6); }
.phone .camera { position: absolute; top: 10px; left: 50%; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: var(--outline); }
.phone .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 10px; justify-items: center; }
.phone .app { display: grid; justify-items: center; gap: 4px; font-size: 12px; line-height: 16px; font-weight: 500; }
.browser { padding: 10px 12px 16px; }
.address { display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: calc(13px * var(--cs)); background: var(--field); box-shadow: inset 0 0 0 1px var(--hairline); font-size: 13px; color: var(--muted); }
.browser .marks { display: flex; justify-content: center; gap: 14px; margin-top: 14px; }
.caption { text-align: center; }
.server-column { padding-top: 30px; }
.server { padding: 18px; display: grid; gap: 14px; }
.server .head { display: flex; align-items: center; gap: 12px; }
.item { align-items: flex-start; gap: 12px; padding: 0 2px; }
.volume { padding: 12px 14px 14px; background: var(--well); display: grid; gap: 8px; }
.volume .file { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; line-height: 19px; }
.optional-column { align-self: stretch; display: flex; flex-direction: column; }
.services { flex: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 14px; }
.services .later { display: grid; gap: 14px; margin-bottom: 4px; }
.service { display: flex; align-items: center; gap: 12px; padding: 14px; }
</style>
<div class="columns">
  <section><p class="section">Your devices</p>
    <div class="devices">
      <div class="sheet phone" id="phone"><span class="camera dot"></span><div class="grid">${apps.map(app => `<div class="app">${mark(app, 40)}${brand.webAppName(app)}</div>`).join('')}</div></div>
      <p class="caption"><span class="strong">Android apps</span><br><span class="meta">offline first, synced when back online</span></p>
      <div class="sheet panel browser" id="browser"><div class="address">${glyph('globe', 15, 'var(--muted)')}unlease.example.org/notes</div><div class="marks">${apps.map(app => mark(app, 34)).join('')}</div></div>
      <p class="caption"><span class="strong">Web apps</span><br><span class="meta">in any browser, installable</span></p>
    </div>
  </section>
  <section class="server-column">
    <div class="sheet panel server" id="server">
      <div class="head">${pebble(glyph('server'), { width: 46, height: 42, turn: 2 })}<div><div class="title">Unlease, on your server</div><div class="meta">one Docker container</div></div></div>
      ${item('refresh', 'Sync for every app', 'each device’s changes, merged')}
      ${item('apps', 'The four web apps', '/notes · /pages · /agenda · /contacts')}
      ${item('key', 'Your token', 'one secret for your devices')}
      <div class="frame volume"><div class="row" style="gap:8px">${glyph('archive', 20)}<span class="strong">The /data volume</span></div>
        <div class="file"><span class="mono">unlease.sqlite</span><span class="meta">every record</span></div>
        <div class="file" id="v-blobs"><span class="mono">blobs/</span><span class="meta">photos and files</span></div>
        <div class="file" id="v-backups"><span class="mono">backups/</span><span class="meta">a copy each day</span></div>
      </div>
    </div>
  </section>
  <section class="optional-column"><p class="section">Optional, set in the apps</p>
    <div class="services">
      ${service('claude', 'sparkle', 'Claude API', 'reads links, answers questions', 0)}
      <div class="later">
        ${service('seafile', 'image', 'Seafile', 'photos and files in your library', 1)}
        ${service('s3', 'cloud', 'S3 storage', 'readable backups: Markdown, JSON, vCard, iCalendar', 3)}
      </div>
    </div>
  </section>
</div>`,
    [
      { from: { item: '#phone', side: 'right' }, to: { item: '#server .head', sheet: '#server', side: 'left' }, label: 'HTTPS' },
      { from: { item: '#browser', side: 'right' }, to: { item: '#server .volume', sheet: '#server', side: 'left' }, label: 'HTTPS' },
      { from: { item: '#server .head', sheet: '#server', side: 'right' }, to: { item: '#claude', side: 'left' }, dashed: true },
      { from: { item: '#v-blobs', sheet: '#server', side: 'right' }, to: { item: '#seafile', side: 'left' }, dashed: true, reach: 50 },
      { from: { item: '#v-backups', sheet: '#server', side: 'right' }, to: { item: '#s3', side: 'left' }, dashed: true, reach: 50 },
    ],
  );
}

/** What stays on the server, what leaves it, where to and when, and what the apps load themselves. */
export function privacyPage(design, brand, scheme) {
  const { glyph, pebble } = pieces(design, brand);
  const kept = (name, words) => `<div class="row kept">${glyph(name)}<span>${words}</span></div>`;
  const leaves = (id, name, title, what, when, turn, kind = 'sheet') =>
    `<div class="${kind} frame leaves" id="${id}">${pebble(glyph(name), { turn })}<div><div class="strong">${title}</div><div>${what}</div><div class="meta when">${when}</div></div></div>`;
  return frame(
    design,
    scheme,
    `<style>
.columns { display: grid; grid-template-columns: 262px 1fr; gap: 60px; align-items: center; }
.stays { padding: 18px 20px 20px; display: grid; gap: 12px; }
.stays .head { display: flex; align-items: center; gap: 12px; margin-bottom: 2px; }
.kept { gap: 12px; }
.never { margin-top: 4px; padding-top: 12px; box-shadow: inset 0 1px 0 var(--hairline); }
.out { display: grid; gap: 12px; }
.leaves { display: flex; align-items: flex-start; gap: 14px; padding: 12px 16px 13px 12px; font-size: 15px; line-height: 21px; }
.when { margin-top: 2px; }
</style>
<div class="columns">
  <section>
    <div class="sheet panel stays" id="stays">
      <div class="head">${pebble(glyph('server'), { width: 46, height: 42, turn: 2 })}<div class="title">Your data stays on your server</div></div>
      ${kept('note', 'Notes, lists and links')}
      ${kept('page', 'Pages')}
      ${kept('calendar', 'Events')}
      ${kept('people', 'Contacts')}
      ${kept('image', 'Photos and files')}
      ${kept('key', 'Keys and secrets')}
      <p class="meta never">No analytics, no tracker. Your notes and pages are never sent to read a link.</p>
    </div>
  </section>
  <section><p class="section">It leaves only when a feature needs it</p>
    <div class="out">
      ${leaves('o-claude', 'sparkle', 'Claude, by Anthropic', 'A link’s address and what your server read of it, your collections’ names and a few titles to file it, your template’s fields; its name, shop and price for a module’s web search; a page’s text when you ask about it.', 'Only with your API key, within your monthly budget.', 0)}
      ${leaves('o-web', 'globe', 'The pages you save', 'Your server reads each link to keep its words and pictures.', 'When you save a link.', 1)}
      ${leaves('o-storage', 'cloud', 'Your S3, Seafile and Seerr', 'Backups, photos and files; requests to your Seerr, with its key.', 'Only once you set them up.', 2)}
      ${leaves('o-places', 'mapPin', 'Calendars, holidays, weather, places', 'The calendars you subscribe to; your country to Nager.Date, a place’s name to Open-Meteo, what you type for an address to Photon.', 'When an event or an address needs it.', 3)}
      ${leaves('o-push', 'bell', 'Your browser’s push service', 'A reminder, encrypted end to end.', 'Only if you turn notifications on.', 0)}
      ${leaves('o-apps', 'phone', 'What the apps load themselves', 'A link’s own picture until your server keeps a copy; a video’s player when you play it (YouTube without cookies, Vimeo, Dailymotion); the sites you open.', 'From your device, not from the server.', 1, 'optional')}
    </div>
  </section>
</div>`,
    ['o-claude', 'o-web', 'o-storage', 'o-places', 'o-push'].map(id => ({
      from: { item: '#stays', side: 'right' },
      to: { item: `#${id}`, side: 'left' },
      reach: 30,
    })),
  );
}

/** A closer look at one app: its screen, cut to what it shows, lying on the ground as a sheet. */
export function closeupPage(design, brand, scheme, shot, size) {
  return frame(
    design,
    scheme,
    `<style>
.shot { display: block; width: 100%; aspect-ratio: ${size.width} / ${size.height}; border-radius: calc(20px * var(--cs)); box-shadow: 0 0 0 1px var(--hairline), var(--lift-float); }
</style><img class="shot" src="data:image/jpeg;base64,${shot.toString('base64')}" alt="">`,
  );
}

/** The install, in four steps from left to right. */
export function installPage(design, brand, scheme) {
  const { glyph, pebble } = pieces(design, brand);
  const step = (id, name, title, words, detail, turn) =>
    `<div class="sheet panel step" id="${id}">${pebble(glyph(name), { turn })}<span class="title">${title}</span><p>${words}</p><div class="frame detail">${detail}</div></div>`;
  return frame(
    design,
    scheme,
    `<style>
.steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 30px; align-items: stretch; }
.step { padding: 16px 16px 18px; display: grid; grid-template-rows: auto auto 1fr auto; justify-items: start; gap: 8px; font-size: 15px; line-height: 21px; }
.step .title { margin-top: 4px; }
.detail { justify-self: stretch; padding: 7px 8px; background: var(--well); font-size: 13.5px; line-height: 19px; color: var(--muted); }
.detail .mono { font-size: 12px; white-space: nowrap; }
</style>
<div class="steps">
  ${step('s1', 'download', 'Start the server', 'Download the Compose file, set a token, start one container.', '<span class="mono" style="color:var(--ink)">docker compose up -d</span>', 0)}
  ${step('s2', 'globe', 'Add HTTPS', 'Your phone reaches the server over HTTPS, through your proxy or a tunnel.', 'Caddy, nginx, Traefik, Cloudflare Tunnel', 1)}
  ${step('s3', 'settings', 'Run the setup', 'Open your address: pick the apps, then Claude, backups and files if you want them.', 'Asked once, for every app', 2)}
  ${step('s4', 'phone', 'Install the apps', 'Open the web apps in a browser; on Android, install the APKs.', 'One APK per app, from the release', 3)}
</div>`,
    [
      ['s1', 's2'],
      ['s2', 's3'],
      ['s3', 's4'],
    ].map(([from, to]) => ({ from: { item: `#${from} .pebble`, sheet: `#${from}`, side: 'right' }, to: { item: `#${to} .pebble`, sheet: `#${to}`, side: 'left' }, reach: 14 })),
  );
}
