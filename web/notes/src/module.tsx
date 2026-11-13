/**
 * Carnet's web app: everything it brings to the shell (`shared/modules`). Notes, checklists,
 * drawings, collections of links and their modules, labels, the capture links, the Keep import's
 * wizard, the kitchen's timers, its bin, and « Effacer des données ».
 */
import { t, tx } from '@unlease/core/i18n';
import { eraseParts } from '@unlease/notes/services/erase';
import { KEEP_SOURCE, KEEP_WIZARD_WORDS } from '@unlease/notes/services/keepImport';
import { NOTES_SETTINGS_PLACES } from '@unlease/notes/services/settingsPlaces';

import { emptyTrash, eraseData, trashedNoteIds } from './app/store/actions';
import { resetBoard } from './app/store/board';
import { useLibraryStore } from './app/store/library';
import { openCapture } from './app/store/notesUi';
import { MOD_KEY, type AppModule, type ShortcutGroup, type SpotLabel } from '@shared/modules';
import { NOTES_ADMIN_SECTIONS } from './admin';
import { notesData } from './data';
import { handleCaptureRoute } from './ui/captureRoute';
import { classifyClipboard, newChecklist, newDrawing, newNote, newTitledNote } from './ui/commands';
import { KeepWizard } from './ui/features/importing/KeepWizard';
import { NOTES_SPOT_KINDS } from './ui/features/spotlight/kinds';
import { NOTES_SETTINGS } from './ui/features/settings/NotesSettings';
import { ReadingExtras } from './ui/features/settings/ReadingExtras';
import { onNotesDrop, onNotesKey, onNotesPaste } from './ui/keys';
import { BottomBar } from './ui/navigation/BottomBar';
import { NotesHeaderActions, NotesHeaderCover, NotesNarrowTools, useSelecting } from './ui/navigation/NotesHeader';
import { NotesNav, NotesNavFoot } from './ui/navigation/NotesNav';
import { notesOpened, notesPageUnder, notesPathOf, NotesOverlays, NotesScreen, notesStillThere, useNotesTitle } from './ui/NotesShell';
import { HOME, NOTES_ROUTES, parseNotesRoute, paths } from './ui/routes';
import { adminPath } from '@shared/ui/router';

let labelsCache: { readonly state: ReturnType<typeof useLibraryStore.getState>; readonly labels: readonly SpotLabel[] } | null = null;

/** The live labels and how many live notes wear each: the spotlight's # filter. */
function spotLabels(): readonly SpotLabel[] {
  const state = useLibraryStore.getState();
  if (labelsCache?.state === state) return labelsCache.labels;
  const counts = new Map<string, number>();
  for (const id of state.noteOrder) {
    const note = state.notes[id];
    if (!note || note.deletedAt !== null || note.trashedAt !== null) continue;
    for (const labelId of note.labelIds) counts.set(labelId, (counts.get(labelId) ?? 0) + 1);
  }
  const labels = state.labelOrder.flatMap(id => {
    const label = state.labels[id];
    return label && label.deletedAt === null ? [{ id, name: label.name, color: label.color, notes: counts.get(id) ?? 0 }] : [];
  });
  labelsCache = { state, labels };
  return labels;
}

/** Its keys in the shortcuts dialog beyond its commands': a link pasted anywhere, a note's, a checklist's. */
const NOTES_SHORTCUTS: readonly ShortcutGroup[] = [
  { rows: [[[MOD_KEY, 'V'], tx('Paste a link on the board: it is filed in the right collection')]] },
  {
    title: tx('On a note'),
    rows: [
      [['E'], tx('Archive')],
      [['#'], tx('Delete')],
      [['X'], tx('Select (on the board)')],
      [[tx('Shift'), tx('click')], tx('Select several notes')],
      [[MOD_KEY, tx('Enter')], tx('Close the editor')],
    ],
  },
  {
    title: tx('In a checklist'),
    rows: [
      [[tx('Enter')], tx('Next item')],
      [[tx('Backspace')], tx('On an empty item: delete it')],
      [['Alt', '↑'], tx('Move the item up')],
      [['Alt', '↓'], tx('Move the item down')],
    ],
  },
];

export const notesModule: AppModule = {
  id: 'notes',
  data: notesData,
  home: HOME,
  start: handleCaptureRoute,

  routes: { names: NOTES_ROUTES, parse: parseNotesRoute },
  Screen: NotesScreen,
  pageUnder: notesPageUnder,
  pathOf: notesPathOf,
  isHome: route => route.name === 'board',
  backTo: route => (route.name === 'line' ? paths.lines : route.name === 'template' ? (route.id.startsWith('kind-') ? paths.templates : paths.line(route.id)) : route.name === 'templates' ? adminPath('reading') : HOME),
  overHead: route => route.name === 'line',
  useTitle: useNotesTitle,
  stillThere: notesStillThere,
  opened: notesOpened,
  onPageChange: resetBoard,
  Overlays: NotesOverlays,

  Nav: NotesNav,
  NavFoot: NotesNavFoot,
  HeaderActions: NotesHeaderActions,
  NarrowTools: NotesNarrowTools,
  HeaderCover: NotesHeaderCover,
  useHeaderCovered: useSelecting,
  BottomBar,
  searchHome: HOME,

  spotKinds: NOTES_SPOT_KINDS,
  spotLabels,
  commands: [
    { title: tx('New note'), icon: 'note', key: 'c', run: () => void newNote() },
    { title: tx('New checklist'), icon: 'checklist', key: 'l', run: () => void newChecklist() },
    { title: tx('New drawing'), icon: 'draw', key: 'd', run: () => void newDrawing() },
    { title: tx('File a link'), icon: 'link', key: 'k', run: () => openCapture('') },
    { title: tx('File the copied link'), icon: 'link', key: 'v', spotlight: false, run: () => void classifyClipboard() },
  ],
  spotCreates: [{ type: 'note', title: typed => t('Create the note “{title}”', { title: typed }), icon: 'note', run: typed => void newTitledNote(typed) }],
  onKey: onNotesKey,
  shortcuts: NOTES_SHORTCUTS,
  onPaste: onNotesPaste,
  onDropFiles: onNotesDrop,

  settingsSections: NOTES_SETTINGS,
  importer: { source: () => KEEP_SOURCE, meta: () => KEEP_WIZARD_WORDS.importerMeta, Wizard: KeepWizard },
  erase: { parts: () => eraseParts(useLibraryStore.getState()), run: chosen => eraseData(chosen) },
  emptyBin: () => emptyTrash(),
  binCount: () => trashedNoteIds().length,
  adminSections: NOTES_ADMIN_SECTIONS,
  settingsPlaces: NOTES_SETTINGS_PLACES,
  ClaudeExtras: ReadingExtras,
};
