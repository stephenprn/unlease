/**
 * Pages' web app: everything it brings to the shell (`shared/modules`). The pages' tree and editor,
 * their blocks, tables, embeds and mentions of Carnet's notes, collections and links (Carnet's data
 * is installed beside it, `notesData`), their files, their bin, and questions to Claude about them.
 */
import { t, tx } from '@unlease/core/i18n';
import { isUploadableImage } from '@unlease/pages/services/media';
import { PAGES_SETTINGS_PLACES } from '@unlease/pages/services/settingsPlaces';

import { pagesProjection, useBlocksStore } from './app/store/blocks';
import { resetPageHistory } from './app/store/pageHistory';
import { createPage, emptyPagesBin, markBlockFileUploaded } from './app/store/pages';
import { loadPagesUi } from './app/store/pagesUi';
import { navigate } from '@shared/ui/router';
import type { AppData, AppModule } from '@shared/modules';
import { PAGES_ADMIN_SECTIONS } from './admin';
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
  commands: [{ title: tx('Nouvelle page'), icon: 'pagePlus', key: 'p', run: () => openNewPage(null) }],
  spotCreates: [{ type: 'page', title: typed => t('Créer la page « {title} »', { title: typed }), icon: 'pagePlus', run: typed => navigate(paths.page(createPage({ title: typed }))) }],

  emptyBin: () => emptyPagesBin(),
  adminSections: PAGES_ADMIN_SECTIONS,
  settingsPlaces: PAGES_SETTINGS_PLACES,
};
