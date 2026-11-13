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
import { MOD_KEY, type AppData, type AppModule, type ShortcutGroup } from '@shared/modules';
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
      [[tx('Esc')], tx('Select the block')],
      [[MOD_KEY, 'Z'], tx('Undo (Ctrl+Shift+Z: redo)')],
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
