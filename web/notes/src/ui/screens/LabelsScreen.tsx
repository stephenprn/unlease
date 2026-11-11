/**
 * Labels: create, rename, recolour, delete. Deleting a label takes it off
 * every note that wore it, and can be undone. Each wears its paper tag, as on
 * the notes. As on the phone, the rows lie on the wall under the field-paper
 * strip that makes a new one, and a name is renamed where it is written.
 */
import { memo, useId, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { isBlank } from '@unlease/core/services/formChecks';
import { fieldInput } from '@unlease/design/fields';
import { labelNameTaken } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';

import { createLabel, deleteLabel, updateLabel } from '../../app/store/actions';
import { useLibraryStore } from '../../app/store/library';
import { showUndo } from '@shared/app/store/ui';
import controls from '@shared/ui/components/controls.module.css';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { LabelTag } from '@shared/ui/components/LabelMark';
import { Popover } from '@shared/ui/components/Popover';
import { useForm } from '@shared/ui/components/useForm';
import { BoundInput, FieldProblem } from '../features/BoundInput';
import { LineColorPicker } from '../features/lines/LineColorPicker';
import editor from '../features/note/editor.module.css';
import page from '@shared/ui/features/settings/settings.module.css';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { Link } from '@shared/ui/router';
import { pathForView } from '../routes';
import { NARROW, useMedia } from '@shared/ui/useMedia';
import { useListMotion } from '@shared/ui/useListMotion';


const LabelRow = memo(function LabelRow({ id }: { id: string }) {
  const label = useLibraryStore(s => s.labels[id]);
  const labels = useLibraryStore(s => s.labels);
  const uses = useLibraryStore(s => s.noteOrder.filter(nid => s.notes[nid]?.labelIds.includes(id) && s.notes[nid]?.trashedAt === null).length);
  const [draft, setDraft] = useState<string | null>(null);
  // A rename refused once says why under the row, until the name is free (or Escape gives the old one back).
  const [refused, setRefused] = useState(false);
  const [coloring, setColoring] = useState(false);
  const tag = useRef<HTMLButtonElement>(null);
  const narrow = useMedia(NARROW);
  const problemId = useId();
  if (!label) return null;
  const typed = draft?.trim().slice(0, 60) ?? '';
  const taken = typed !== '' && typed !== label.name && labelNameTaken(labels, typed, id);
  const problem = refused && taken ? t('Ce label existe déjà : choisissez un autre nom.') : null;
  /** Renames to what is typed; a name another label wears is kept, said, and not saved. */
  const commit = (): boolean => {
    if (taken) {
      setRefused(true);
      return false;
    }
    if (typed && typed !== label.name) updateLabel(id, { name: typed });
    setDraft(null);
    setRefused(false);
    return true;
  };
  return (
    <li className={page.labelRow} data-motion={id}>
      <button ref={tag} type="button" className={page.tagButton} data-pebble-under={1} aria-label={t('Couleur de {name}', { name: label.name })} data-tip={t('Couleur')} aria-haspopup="dialog" aria-expanded={coloring} onClick={() => setColoring(true)}>
        <LabelTag color={label.color} size={26} />
      </button>
      <input
        className={`${page.labelName} t-body`}
        value={draft ?? label.name}
        maxLength={60}
        aria-label={t('Renommer {name}', { name: label.name })}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? problemId : undefined}
        enterKeyHint="done"
        autoCapitalize={NAME_INPUT.autoCapitalize}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (commit()) event.currentTarget.blur();
          }
          if (event.key === 'Escape' && draft !== null) {
            event.preventDefault();
            setDraft(null);
            setRefused(false);
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
      {problem ? (
        <p id={problemId} className={[controls.error, page.labelRowProblem, 't-meta'].join(' ')}>
          <Icon name="error" size={16} className={controls.errorGlyph} />
          <span>{problem}</span>
        </p>
      ) : null}
    </li>
  );
});

const NAME_INPUT = fieldInput('text').web;

export function LabelsScreen() {
  const order = useLibraryStore(s => s.labelOrder);
  const labels = useLibraryStore(s => s.labels);
  const [name, setName] = useState('');
  const list = useRef<HTMLUListElement>(null);
  // A label deleted fades where it was, the others close ranks; a new one, or one put back, settles in.
  useListMotion(list, { late: true });
  // A name already worn is said under the strip, what was typed kept.
  const form = useForm({ name: !isBlank(name) && labelNameTaken(labels, name) ? t('Ce label existe déjà : choisissez un autre nom.') : null });
  const add = (): void => {
    if (isBlank(name)) return;
    void form.submit(() => {
      createLabel(name);
      setName('');
      form.reset();
    });
  };
  return (
    <div className={page.page}>
      <PageHead title={t('Labels')} />
      <section className={page.labels}>
        <form
          className={page.labelNew}
          data-invalid={form.error('name') ? '' : undefined}
          noValidate
          onSubmit={event => {
            event.preventDefault();
            add();
          }}
        >
          {/* The tag every label wears, as the link strip leads with a link. */}
          <span className={page.labelNewGlyph}>
            <Icon name="tag" size={24} />
          </span>
          <BoundInput
            field={form.field('name')}
            problemId="label-new-problem"
            className={`${page.labelNewInput} t-body`}
            value={name}
            onChange={setName}
            placeholder={t('Créer un label')}
            aria-label={t('Nom du nouveau label')}
            maxLength={60}
            enterKeyHint="done"
            autoCapitalize={NAME_INPUT.autoCapitalize}
          />
          {name.trim() ? <IconButton icon="check" label={t('Créer')} onClick={add} /> : null}
        </form>
        <FieldProblem field={form.field('name')} id="label-new-problem" className={page.labelNewProblem} />
        {order.length > 0 ? (
          <ul ref={list} className={page.labelList} aria-label={t('Labels')}>
            {order.map(id => (
              <LabelRow key={id} id={id} />
            ))}
          </ul>
        ) : (
          <EmptyState scene="label" title={t('Aucun label')} text={t('Les labels regroupent des notes sur le tableau. Une note peut en porter plusieurs.')} />
        )}
      </section>
    </div>
  );
}
