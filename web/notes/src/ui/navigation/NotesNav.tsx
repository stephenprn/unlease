/**
 * Carnet's navigation (Keep's side): the notes and the reminders, the collections by their
 * cut-outs, the labels by their tags, each section folding shut on its title; at the foot, the
 * archive and the bin. Drawn in the shell's frame (`NavList`).
 */
import { memo, type ReactNode } from 'react';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';

import { useLines } from '../../app/hooks/useLines';
import { resetBoard } from '../../app/store/board';
import { useLibraryStore, type LibraryState } from '../../app/store/library';
import { setNewLineOpen } from '../../app/store/notesUi';
import { Emblem } from '@shared/ui/components/Emblem';
import { LabelTag } from '@shared/ui/components/LabelMark';
import { NavAction, NavFold, NavGlyph, NavRow, navStyles as styles } from '@shared/ui/navigation/NavParts';
import { Link, type Route } from '@shared/ui/router';
import { pathForView, paths } from '../routes';

function isCurrent(route: Route, path: string): boolean {
  switch (route.name) {
    case 'board':
      return pathForView(route.view) === path;
    case 'line':
      return paths.line(route.id) === path;
    case 'lines':
      return path === paths.lines;
    case 'labels':
      return path === paths.labels;
    default:
      return false;
  }
}

const openLinks = (id: string) => (s: LibraryState): number => (s.linksByNote[id] ?? []).filter(lid => s.links[lid] && !s.links[lid]!.done).length;

const CollectionCount = memo(function CollectionCount({ id }: { id: string }) {
  const count = useLibraryStore(openLinks(id));
  return count > 0 ? <span className={styles.itemCount}>{count}</span> : null;
});

/** "Non classé" shows only while it holds a link, as its chip on the phone. */
function InboxGate({ children }: { children: ReactNode }) {
  const count = useLibraryStore(openLinks(INBOX_ID));
  return count > 0 ? <>{children}</> : null;
}

interface NavProps {
  readonly route: Route;
  readonly onNavigate: () => void;
}

export function NotesNav({ route, onNavigate }: NavProps) {
  const lines = useLines();
  const labelOrder = useLibraryStore(s => s.labelOrder);
  const labels = useLibraryStore(s => s.labels);
  const go = (): void => {
    resetBoard();
    onNavigate();
  };
  return (
    <>
      <NavRow to={paths.board} label={t('Notes')} leading={<NavGlyph name="note" />} current={isCurrent(route, paths.board)} onNavigate={go} />
      <NavRow to={pathForView('reminders')} label={t('Rappels')} leading={<NavGlyph name="bell" />} current={isCurrent(route, pathForView('reminders'))} onNavigate={go} />
      <NavFold
        id="collections"
        title={t('Collections')}
        action={
          <Link to={paths.lines} className={styles.headingAction} onNavigate={go} ariaLabel={t('Toutes les collections')}>
            {t('Tout voir')}
          </Link>
        }
      >
        {lines.map(line => {
          const color = asLineColor(line.color) ?? 'grey';
          const row = (
            <NavRow
              key={line.id}
              to={paths.line(line.id)}
              label={shownTitle(line)}
              leading={
                <span className={styles.markSlot} data-line={color}>
                  <Emblem emblem={collectionEmblem(line.id, line.emblem)} color={asLineColor(line.color)} size={24} />
                </span>
              }
              trailing={<CollectionCount id={line.id} />}
              wash={color}
              current={isCurrent(route, paths.line(line.id))}
              onNavigate={go}
            />
          );
          return line.id === INBOX_ID ? <InboxGate key={line.id}>{row}</InboxGate> : row;
        })}
        <NavAction
          label={t('Nouvelle collection')}
          icon="plus"
          onClick={() => {
            onNavigate();
            setNewLineOpen(true);
          }}
        />
      </NavFold>
      <NavFold
        id="labels"
        title={t('Labels')}
        action={
          <Link to={paths.labels} className={styles.headingAction} onNavigate={go} ariaLabel={t('Modifier les labels')}>
            {t('Modifier')}
          </Link>
        }
      >
        {labelOrder.map(id => {
          const label = labels[id];
          if (!label) return null;
          const to = pathForView(`label:${id}`);
          return (
            <NavRow
              key={id}
              to={to}
              label={label.name}
              leading={
                <span className={styles.markSlot} data-line={label.color}>
                  <LabelTag color={label.color} size={20} />
                </span>
              }
              wash={label.color}
              current={isCurrent(route, to)}
              onNavigate={go}
            />
          );
        })}
        {labelOrder.length === 0 ? <NavRow to={paths.labels} label={t('Créer un label')} leading={<NavGlyph name="tag" />} current={false} onNavigate={go} /> : null}
      </NavFold>
    </>
  );
}

/** The archive and the bin, at the navigation's foot. */
export function NotesNavFoot({ route, onNavigate }: NavProps) {
  const go = (): void => {
    resetBoard();
    onNavigate();
  };
  return (
    <>
      <NavRow to={pathForView('archive')} label={t('Archives')} leading={<NavGlyph name="archive" />} current={isCurrent(route, pathForView('archive'))} onNavigate={go} />
      <NavRow to={paths.trash} label={t('Corbeille')} leading={<NavGlyph name="trash" />} current={isCurrent(route, paths.trash)} onNavigate={go} />
    </>
  );
}
