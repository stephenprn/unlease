/**
 * Pages' web app: everything it brings to the shell (`shared/modules`). The pages' tree and editor,
 * their blocks, tables, embeds and mentions of Carnet's notes, collections and links (Carnet's data
 * is installed beside it, `notesData`), their files, their bin, and questions to Claude about them.
 */
import { t, tx } from '@unlease/core/i18n';
import { isUploadableImage } from '@unlease/pages/services/media';
import { PAGES_SETTINGS_PLACES } from '@unlease/pages/services/settingsPlaces';
import { pagesEraseParts } from '@unlease/pages/services/erase';

import { pagesProjection, useBlocksStore } from './app/store/blocks';
import { resetPageHistory } from './app/store/pageHistory';
import { createPage, emptyPagesBin, erasePages, markBlockFileUploaded, trashedPages } from './app/store/pages';
import { loadPagesUi } from './app/store/pagesUi';
import { navigate } from '@shared/ui/router';
import { ALT_KEY, MOD_ALT_KEY, MOD_KEY, type AppData, type AppModule, type ShortcutGroup } from '@shared/modules';
import { PAGES_ADMIN_SECTIONS } from './admin';
import { PagesImport } from './ui/features/importing/PagesImport';
import { openNewPage } from './ui/features/pages/PageTree';
import { PAGES_SPOT_KINDS } from './ui/features/spotlight/kinds';
import { PagesBottomBar, PagesHeaderActions, PagesNav, PagesNavFoot, pagesOpened, pagesPathOf, PagesShellScreen, pagesStillThere, usePagesTitle } from './ui/PagesShell';
import { HOME, PAGES_ROUTES, parsePagesRoute, paths } from './ui/routes';

/** Pages' records: their state, what this browser remembers of them, their files waiting to be sent. */
const pagesData: AppData = {
  id: 'pages',
  projection: pagesProjection,
  load: loadPagesUi,
  reset: resetPageHistory,
  // The file of one or more page blocks (a copied block shares it).
  fileOwner: id => {
    const owners = Object.values(useBlocksStore.getState().blocks).filter(block => block.fileId === id);
    if (owners.length === 0) return null;
    const live = owners.find(block => block.deletedAt === null && !block.uploaded);
    const mime = live?.mime ?? owners[0]!.mime;
    return { done: !live, mime, image: isUploadableImage(mime), mark: () => markBlockFileUploaded(id) };
  },
  refPaths: { page: paths.page },
};

/** Its keys in the shortcuts dialog beyond its commands': a page's editor's. */
const PAGES_SHORTCUTS: readonly ShortcutGroup[] = [
  {
    title: tx('In a page'),
    rows: [
      [[tx('Enter')], tx('New paragraph (Shift+Enter: new line)')],
      [[MOD_KEY, tx('Enter')], tx('Tick the to-do, or leave the code block')],
      [['/'], tx('Add a block')],
      [['@'], tx('Mention a page, a note, a collection or a link')],
      [[MOD_KEY, 'B'], tx('Bold (I: italic, U: underline, E: code)')],
      [[MOD_KEY, tx('Shift'), 'S'], tx('Strikethrough')],
      [[MOD_KEY, 'K'], tx('Link on the selected words')],
      [['Tab'], tx('Indent the block (Shift+Tab: outdent it)')],
      [[MOD_KEY, tx('Shift'), '↑'], tx('Move the block up (↓: move it down)')],
      [[MOD_KEY, 'D'], tx('Duplicate the block')],
      [[MOD_KEY, MOD_ALT_KEY, '0'], tx('Turn into text (1–3: a heading, 4: a to-do, 5: a bulleted list, 6: a numbered list, 7: a toggle, 8: code, 9: a page)')],
      [[MOD_KEY, '/'], tx('The block’s menu')],
      [[MOD_KEY, ALT_KEY, 'T'], tx('Open or close every toggle')],
      [[tx('Esc')], tx('Select the block')],
      [[MOD_KEY, 'Z'], tx('Undo (Ctrl+Shift+Z: redo)')],
    ],
  },
  {
    title: tx('Selected blocks'),
    rows: [
      [[tx('Shift'), tx('Click')], tx('Select every block up to this one')],
      [[MOD_KEY, tx('Click')], tx('Add a block to the selection, or take it out')],
      [[tx('Drag')], tx('Move the selected blocks (from anywhere on them)')],
      [['↑'], tx('Select the block above (↓: below; Shift: extend the selection)')],
      [[MOD_KEY, 'A'], tx('Select every block')],
      [[MOD_KEY, tx('Enter')], tx('Tick the to-dos, or open the toggles')],
      [[tx('Enter')], tx('Write in the block')],
      [[tx('Backspace')], tx('Delete the blocks')],
      [[MOD_KEY, 'C'], tx('Copy the blocks (X: cut, V: paste after them)')],
    ],
  },
  {
    title: tx('Pages in the sidebar'),
    rows: [
      [[tx('Shift'), tx('Click')], tx('Select every page up to this one')],
      [[MOD_KEY, tx('Click')], tx('Add a page to the selection, or take it out')],
      [[tx('Drag')], tx('Move the selected pages into a page, or between two')],
      [[tx('Shift'), '↑'], tx('Extend the selection (↓: downwards)')],
      [[tx('Space')], tx('Select the page, or let it go')],
      [[MOD_KEY, tx('Shift'), '↑'], tx('Move the pages up (↓: move them down)')],
      [[MOD_KEY, 'D'], tx('Duplicate the pages')],
      [[tx('Backspace')], tx('Move the pages to the bin')],
      [['*'], tx('Open every page at this level')],
      [[tx('Shift'), 'F10'], tx('The pages’ menu (also a right click)')],
    ],
  },
];

export const pagesModule: AppModule = {
  id: 'pages',
  home: HOME,
  data: pagesData,

  routes: { names: PAGES_ROUTES, parse: parsePagesRoute },
  Screen: PagesShellScreen,
  pathOf: pagesPathOf,
  isHome: route => route.name === 'pages',
  backTo: () => HOME,
  useTitle: page => usePagesTitle(page),
  stillThere: pagesStillThere,
  opened: pagesOpened,

  Nav: PagesNav,
  NavFoot: PagesNavFoot,
  HeaderActions: PagesHeaderActions,
  BottomBar: PagesBottomBar,
  searchHome: HOME,

  spotKinds: PAGES_SPOT_KINDS,
  // C makes the app's thing in every app; P, Pages' key before that, still does.
  commands: [{ title: tx('New page'), icon: 'pagePlus', key: 'c', aliases: ['p'], run: () => openNewPage(null) }],
  shortcuts: PAGES_SHORTCUTS,
  spotCreates: [{ type: 'page', title: typed => t('Create the page “{title}”', { title: typed }), icon: 'pagePlus', run: typed => navigate(paths.page(createPage({ title: typed }))) }],

  emptyBin: () => emptyPagesBin(),
  binCount: () => trashedPages().length,
  importer: { source: () => 'Notion', meta: () => t('A Notion export, or Markdown files (Obsidian…)'), Wizard: PagesImport },
  erase: { parts: () => pagesEraseParts(useBlocksStore.getState()), run: chosen => erasePages(chosen) },
  adminSections: PAGES_ADMIN_SECTIONS,
  settingsPlaces: PAGES_SETTINGS_PLACES,
};
