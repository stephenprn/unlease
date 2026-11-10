/**
 * While contacts are picked, a matcha bar lies over the search strip, the same size and cut, so
 * nothing below moves (Carnet's selection bar): pick them all, star them, put a label on or take it
 * off, save them as a vCard, send them to the bin (and back, from the slip); in the bin, restore them
 * or delete them for good. Back and Escape end a pick.
 */
import { memo, useRef, useState, type AnimationEvent, type RefObject } from 'react';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';

import { useLiveLabels, useLiveContacts, useTrashedContacts } from '../../app/hooks/useContacts';
import { deleteForever, restoreContacts, setFavorite, setLabelOn, trashContacts } from '../../app/store/actions';
import { clearSelection, selectAll, useContactsUi } from '../../app/store/contactsUi';
import { useContactsStore } from '../../app/store/library';
import { useQuery } from '@shared/app/store/search';
import { showSnack, showUndo } from '@shared/app/store/ui';
import { Confirm } from '@shared/ui/components/Dialog';
import { IconButton } from '@shared/ui/components/IconButton';
import { LabelCheck } from '@shared/ui/components/LabelMark';
import { Popover } from '@shared/ui/components/Popover';
import { usePresence } from '@shared/ui/components/presence';
import shell from '@shared/ui/navigation/shell.module.css';
import { useBackCloses, type Route } from '@shared/ui/router';
import { NARROW, useMedia } from '@shared/ui/useMedia';
import { exportContacts } from './exporting';
import { visibleContacts } from './visible';

/** The bar's fade (`--duration-short`), and a little longer for the fallback that lets it go. */
const FADE_MS = 200;

/**
 * Contacts' labels in a popover by `anchor`: each tag is its checkbox, ticked when every one of `ids`
 * wears it; a press puts it on all, or takes it off all (the slip takes it back). The selection bar's
 * « Libellés », and a contact's menu's.
 */
export function LabelsPopover({ ids, open, anchor, label, onDismiss }: { ids: readonly string[]; open: boolean; anchor: RefObject<HTMLElement | null>; label: string; onDismiss: () => void }) {
  const labels = useLiveLabels();
  const contacts = useContactsStore(s => s.contacts);
  return (
    <Popover open={open} anchor={anchor} onDismiss={onDismiss} label={label} align="end" className={shell.bulkLabels}>
      {labels.length === 0 ? (
        <p className={`${shell.bulkEmpty} t-meta`}>{t('Aucun libellé. Créez-en depuis la navigation.')}</p>
      ) : (
        <ul className={shell.bulkList}>
          {labels.map(label => {
            const wearing = ids.filter(id => contacts[id]?.labelIds.includes(label.id)).length;
            const all = wearing === ids.length && ids.length > 0;
            return (
              <li key={label.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={all ? true : wearing > 0 ? 'mixed' : false}
                  className={shell.bulkRow}
                  onClick={() => {
                    const undo = setLabelOn(ids, label.id, !all);
                    showUndo(all ? t('« {name} » retiré', { name: label.name }) : t('« {name} » ajouté', { name: label.name }), undo);
                  }}
                >
                  <LabelCheck color={label.color} checked={all} size={22} />
                  <span className={shell.bulkName}>{label.name}</span>
                  {wearing > 0 && !all ? <span className={`${shell.bulkSome} t-meta`}>{t('{count} sur {total}', { count: wearing, total: ids.length })}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Popover>
  );
}

/** The picked contacts' labels (`LabelsPopover`). */
function BulkLabels({ ids }: { ids: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <IconButton ref={anchor} icon="tag" label={t('Libellés')} shape={2} hasPopup="dialog" expanded={open} onClick={() => setOpen(true)} />
      <LabelsPopover ids={ids} open={open} anchor={anchor} label={t('Libellés des contacts sélectionnés')} onDismiss={() => setOpen(false)} />
    </>
  );
}

interface BarProps {
  readonly route: Route;
  readonly closing: boolean;
  readonly onGone: () => void;
  readonly onDeleteForever: () => void;
}

function Bar({ route, closing, onGone, onDeleteForever }: BarProps) {
  const live = useContactsUi(s => s.selection);
  const contacts = useContactsStore(s => s.contacts);
  // Fading out, it keeps showing what was picked rather than "0".
  const [held, setHeld] = useState(live);
  if (live.size > 0 && live !== held) setHeld(live);
  const selection = live.size > 0 ? live : held;
  const ids = [...selection].filter(id => contacts[id]);
  const count = ids.length;
  const narrow = useMedia(NARROW);
  const all = useLiveContacts();
  const trashed = useTrashedContacts();
  const inTrash = route.name === 'contactsTrash';
  const labels = useContactsStore(s => s.labels);
  const query = useQuery();
  const shown = inTrash ? trashed : visibleContacts(route, all, labels, query);
  const allFavorite = count > 0 && ids.every(id => contacts[id]?.favorite);
  const done = (undo: () => void, message: string): void => {
    clearSelection();
    showUndo(message, undo);
  };
  const gone = (event: AnimationEvent<HTMLDivElement>): void => {
    if (closing && event.target === event.currentTarget) onGone();
  };
  return (
    <div className={shell.selectionBar} role="toolbar" aria-label={t('Contacts sélectionnés')} data-closing={closing || undefined} inert={closing} onAnimationEnd={gone}>
      <IconButton icon="close" label={t('Annuler la sélection')} onClick={clearSelection} shortcut={t('Échap')} />
      <p className={`${shell.selectionCount} t-title`} aria-live="polite">
        {narrow ? (
          <>
            <span aria-hidden="true">{count}</span>
            <span className="sr-only">{plural(count, 'sélectionné', 'sélectionnés')}</span>
          </>
        ) : (
          plural(count, 'sélectionné', 'sélectionnés')
        )}
      </p>
      {shown.length > count ? <IconButton icon="multiSelect" label={t('Tout sélectionner')} shape={3} onClick={() => selectAll(shown.map(contact => contact.id))} /> : null}
      {inTrash ? (
        <>
          <IconButton icon="restore" label={t('Restaurer')} shape={1} onClick={() => done(restoreContacts(ids), count > 1 ? t('Contacts restaurés') : t('Contact restauré'))} />
          <IconButton icon="trash" label={t('Supprimer définitivement')} shape={2} onClick={onDeleteForever} />
        </>
      ) : (
        <>
          <IconButton
            icon="star"
            label={allFavorite ? t('Retirer des favoris') : t('Ajouter aux favoris')}
            pressed={allFavorite}
            shape={1}
            onClick={() => done(setFavorite(ids, !allFavorite), allFavorite ? t('Retirés des favoris') : t('Ajoutés aux favoris'))}
          />
          <BulkLabels ids={ids} />
          <IconButton
            icon="upload"
            label={t('Exporter (.vcf)')}
            shape={3}
            onClick={() => {
              exportContacts(ids.map(id => contacts[id]!));
              clearSelection();
            }}
          />
          <IconButton icon="trash" label={t('Supprimer')} shortcut="#" onClick={() => done(trashContacts(ids), count > 1 ? t('Contacts placés dans la corbeille') : t('Contact placé dans la corbeille'))} />
        </>
      )}
    </div>
  );
}

/** Contacts are picked: the strip is out of reach under the bar. */
export const useSelecting = (): boolean => useContactsUi(s => s.selection.size > 0);

/** The bar over the strip while contacts are picked; « Supprimer définitivement » asks first. */
export const ContactsHeaderCover = memo(function ContactsHeaderCover({ route }: { route: Route }) {
  const selecting = useSelecting();
  const bar = usePresence(selecting, FADE_MS);
  useBackCloses(selecting, clearSelection);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      {bar.present ? <Bar route={route} closing={bar.closing} onGone={bar.done} onDeleteForever={() => setConfirm(true)} /> : null}
      <Confirm
        open={confirm}
        title={t('Supprimer définitivement ?')}
        message={t('Ces contacts disparaîtront de tous vos appareils. Cette action est irréversible.')}
        confirmLabel={t('Supprimer')}
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          const contacts = useContactsStore.getState().contacts;
          // Only what is in the bin is ever erased from here.
          const ids = [...useContactsUi.getState().selection].filter(id => contacts[id] && contacts[id]!.trashedAt !== null);
          deleteForever(ids);
          clearSelection();
          showSnack(ids.length > 1 ? t('{count} supprimés définitivement', { count: plural(ids.length, 'contact') }) : t('{count} supprimé définitivement', { count: plural(ids.length, 'contact') }), undefined, { tone: 'success' });
        }}
      />
    </>
  );
});
