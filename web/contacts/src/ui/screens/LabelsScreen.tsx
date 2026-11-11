/**
 * The labels (Google's « libellés »): make one, rename one where its name is written, change its
 * colour from its tag, delete one (it comes off every contact that wore it; the slip takes it back).
 * Each wears its paper tag, as Carnet's labels do, and its count leads to its contacts.
 */
import { memo, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { isBlank } from '@unlease/core/services/formChecks';
import { CONTACT_LIMITS } from '@unlease/contacts/models/contacts';

import { useLabelCounts, useLiveLabels } from '../../app/hooks/useContacts';
import { createLabel, deleteLabel, labelNameTaken, recolorLabel, renameLabel } from '../../app/store/actions';
import { useContactsStore } from '../../app/store/library';
import { showUndo, showWarning } from '@shared/app/store/ui';
import { BoundInput, FieldProblem } from '@shared/ui/components/BoundInput';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { LabelTag } from '@shared/ui/components/LabelMark';
import { Popover } from '@shared/ui/components/Popover';
import { useForm } from '@shared/ui/components/useForm';
import page from '@shared/ui/features/settings/settings.module.css';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { Link, useLocation } from '@shared/ui/router';
import { useListMotion } from '@shared/ui/useListMotion';
import { LabelColorPicker } from '../features/LabelColorPicker';
import { paths } from '../routes';

const LabelRow = memo(function LabelRow({ id, uses }: { id: string; uses: number }) {
  const label = useContactsStore(s => s.labels[id]);
  const [draft, setDraft] = useState<string | null>(null);
  const [coloring, setColoring] = useState(false);
  const tag = useRef<HTMLButtonElement>(null);
  if (!label) return null;
  const commit = (): void => {
    const name = draft?.trim() ?? '';
    if (name && name !== label.name) {
      if (labelNameTaken(name, id)) showWarning(t('Ce libellé existe déjà'));
      else renameLabel(id, name);
    }
    setDraft(null);
  };
  return (
    <li className={page.labelRow} data-motion={id}>
      <button ref={tag} type="button" className={page.tagButton} data-pebble-under={1} aria-label={t('Couleur de {name}', { name: label.name })} data-tip={t('Couleur')} aria-haspopup="dialog" aria-expanded={coloring} onClick={() => setColoring(true)}>
        <LabelTag color={label.color} size={26} />
      </button>
      <input
        className={`${page.labelName} t-body`}
        value={draft ?? label.name}
        maxLength={CONTACT_LIMITS.labelName}
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
      <Link to={paths.label(id)} className={`${page.labelCount} t-meta-strong tabular`} ariaLabel={t('{contacts} avec {name}', { contacts: plural(uses, 'contact'), name: label.name })} tip={t('Voir les contacts')}>
        {uses}
      </Link>
      <IconButton icon="trash" label={t('Supprimer {name}', { name: label.name })} shape={2} onClick={() => showUndo(t('Libellé « {name} » supprimé', { name: label.name }), deleteLabel(id))} />
      <Popover open={coloring} anchor={tag} onDismiss={() => setColoring(false)} label={t('Couleur de {name}', { name: label.name })} width={300}>
        <div className={page.labelColors}>
          <LabelColorPicker
            value={label.color}
            label={t('Couleur de {name}', { name: label.name })}
            onChange={color => {
              recolorLabel(id, color);
              setColoring(false);
            }}
          />
        </div>
      </Popover>
    </li>
  );
});

export function LabelsScreen() {
  const labels = useLiveLabels();
  const counts = useLabelCounts();
  // Reached through « Créer un libellé » (`?new`): the caret waits in the new label's field.
  const { search } = useLocation();
  const creating = new URLSearchParams(search).has('new');
  const [name, setName] = useState('');
  const list = useRef<HTMLUListElement>(null);
  // A label deleted fades where it was, the others close ranks; a new one, or one put back, settles in.
  useListMotion(list, { late: true });
  // A name already worn is said under the strip, what was typed kept.
  const form = useForm({ name: !isBlank(name) && labelNameTaken(name) ? t('Ce libellé existe déjà : choisissez un autre nom.') : null });
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
      <PageHead title={t('Libellés')} />
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
          <span className={page.labelNewGlyph}>
            <Icon name="tag" size={24} />
          </span>
          <BoundInput
            key={search}
            autoFocus={creating}
            field={form.field('name')}
            problemId="label-new-problem"
            className={`${page.labelNewInput} t-body`}
            value={name}
            onChange={setName}
            placeholder={t('Créer un libellé')}
            aria-label={t('Nom du nouveau libellé')}
            maxLength={CONTACT_LIMITS.labelName}
            enterKeyHint="done"
            autoCapitalize="sentences"
          />
          {name.trim() ? <IconButton icon="check" label={t('Créer')} onClick={add} /> : null}
        </form>
        <FieldProblem field={form.field('name')} id="label-new-problem" className={page.labelNewProblem} />
        {labels.length > 0 ? (
          <ul ref={list} className={page.labelList} aria-label={t('Libellés')}>
            {labels.map(label => (
              <LabelRow key={label.id} id={label.id} uses={counts.get(label.id) ?? 0} />
            ))}
          </ul>
        ) : (
          <EmptyState scene="label" title={t('Aucun libellé')} text={t('Les libellés regroupent des contacts : la famille, le travail, le club. Un contact peut en porter plusieurs.')} />
        )}
      </section>
    </div>
  );
}
