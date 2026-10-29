/**
 * Labels: create, rename, recolour, delete. Deleting a label takes it off
 * every note that wore it, and can be undone. Each wears its paper tag, as on
 * the notes. As on the phone, the rows lie on the wall under the field-paper
 * strip that makes a new one, and a name is renamed where it is written.
 */
import { memo, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { labelNameTaken } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';

import { createLabel, deleteLabel, updateLabel } from '../../app/store/actions';
import { useLibraryStore } from '../../app/store/library';
import { showUndo, showWarning } from '../../app/store/ui';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { LabelTag } from '../components/LabelMark';
import { Popover } from '../components/Popover';
import { LineColorPicker } from '../features/lines/LineColorPicker';
import editor from '../features/note/editor.module.css';
import page from '../features/settings/settings.module.css';
import { PageHead } from '../navigation/PageHead';
import { Link, pathForView } from '../router';
import { NARROW, useMedia } from '../useMedia';


const LabelRow = memo(function LabelRow({ id }: { id: string }) {
  const label = useLibraryStore(s => s.labels[id]);
  const uses = useLibraryStore(s => s.noteOrder.filter(nid => s.notes[nid]?.labelIds.includes(id) && s.notes[nid]?.trashedAt === null).length);
  const [draft, setDraft] = useState<string | null>(null);
  const [coloring, setColoring] = useState(false);
  const tag = useRef<HTMLButtonElement>(null);
  const narrow = useMedia(NARROW);
  if (!label) return null;
  const commit = (): void => {
    const name = draft?.trim().slice(0, 60) ?? '';
    if (name && name !== label.name) {
      if (labelNameTaken(useLibraryStore.getState().labels, name, id)) showWarning(t('Ce label existe déjà'));
      else updateLabel(id, { name });
    }
    setDraft(null);
  };
  return (
    <li className={page.labelRow}>
      <button ref={tag} type="button" className={page.tagButton} data-pebble-under={1} aria-label={t('Couleur de {name}', { name: label.name })} data-tip={t('Couleur')} aria-haspopup="dialog" aria-expanded={coloring} onClick={() => setColoring(true)}>
        <LabelTag color={label.color} size={26} />
      </button>
      <input
        className={`${page.labelName} t-body`}
        value={draft ?? label.name}
        maxLength={60}
        aria-label={t('Renommer {name}', { name: label.name })}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape' && draft !== null) {
            event.preventDefault();
            setDraft(null);
          }
        }}
      />
      <Link to={pathForView(`label:${id}`)} className={`${page.labelCount} t-meta-strong tabular`} ariaLabel={t('{notes} avec {name}', { notes: plural(uses, 'note'), name: label.name })} tip={t('Voir les notes')}>
        {uses}
      </Link>
      <IconButton icon="trash" label={t('Supprimer {name}', { name: label.name })} shape={2} onClick={() => showUndo(t('Label « {name} » supprimé', { name: label.name }), deleteLabel(id))} />
      <Popover open={coloring} anchor={tag} onDismiss={() => setColoring(false)} label={t('Couleur de {name}', { name: label.name })} width={300}>
        <div className={editor.picker}>
          {/* A sheet on a phone, away from the tag it came from: it says whose colour it is, as the phone's does. */}
          {narrow ? <h2 className={`${editor.pickerTitle} t-title`}>{label.name}</h2> : null}
          <div className={page.labelColors}>
            <LineColorPicker
              value={label.color}
              label={t('Couleur de {name}', { name: label.name })}
              onChange={color => {
                if (color) updateLabel(id, { color });
                setColoring(false);
              }}
            />
          </div>
        </div>
      </Popover>
    </li>
  );
});

export function LabelsScreen() {
  const order = useLibraryStore(s => s.labelOrder);
  const [name, setName] = useState('');
  const add = (): void => {
    if (!name.trim()) return;
    if (labelNameTaken(useLibraryStore.getState().labels, name)) {
      showWarning(t('Ce label existe déjà'));
      return;
    }
    createLabel(name);
    setName('');
  };
  return (
    <div className={page.page}>
      <PageHead title={t('Labels')} />
      <section className={page.labels}>
        <form
          className={page.labelNew}
          onSubmit={event => {
            event.preventDefault();
            add();
          }}
        >
          {/* The tag every label wears, as the link strip leads with a link. */}
          <span className={page.labelNewGlyph}>
            <Icon name="tag" size={24} />
          </span>
          <input className={`${page.labelNewInput} t-body`} value={name} onChange={event => setName(event.target.value)} placeholder={t('Créer un label')} aria-label={t('Nom du nouveau label')} maxLength={60} />
          {name.trim() ? <IconButton icon="check" label={t('Créer')} onClick={add} /> : null}
        </form>
        {order.length > 0 ? (
          <ul aria-label={t('Labels')}>
            {order.map(id => (
              <LabelRow key={id} id={id} />
            ))}
          </ul>
        ) : (
          <p className={`${page.labelsEmpty} t-meta`}>{t('Les labels regroupent des notes sur le tableau. Une note peut en porter plusieurs.')}</p>
        )}
      </section>
    </div>
  );
}
