/**
 * The labels, as Carnet's and Contacts': make one in the field-paper strip, rename one where its name
 * is written, change its colour from its tag, delete one (its events lose it; the slip takes it
 * back). Each wears its paper tag, and its count leads to its events.
 */
import { memo, useId, useMemo, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { isBlank } from '@unlease/core/services/formChecks';
import { fieldInput } from '@unlease/design/fields';
import { EVENT_LIMITS, labelNameTaken } from '@unlease/calendar/models/events';

import { showUndo } from '@shared/app/store/ui';
import { BoundInput, FieldProblem } from '@shared/ui/components/BoundInput';
import controls from '@shared/ui/components/controls.module.css';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { LabelTag } from '@shared/ui/components/LabelMark';
import { Popover } from '@shared/ui/components/Popover';
import { useForm } from '@shared/ui/components/useForm';
import page from '@shared/ui/features/settings/settings.module.css';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { Link } from '@shared/ui/router';
import { useListMotion } from '@shared/ui/useListMotion';
import { createLabel, deleteLabel, renameLabel, setLabelColor } from '../../app/store/actions';
import { useCalendarStore } from '../../app/store/library';
import styles from '../calendar.module.css';
import { ColorPicker } from '../features/ColorPicker';
import { paths } from '../routes';

const NAME_INPUT = fieldInput('text').web;

const LabelRow = memo(function LabelRow({ id, uses }: { id: string; uses: number }) {
  const label = useCalendarStore(s => s.labels[id]);
  const labels = useCalendarStore(s => s.labels);
  const [draft, setDraft] = useState<string | null>(null);
  // A rename refused once says why under the row, until the name is free (or Escape gives the old one back).
  const [refused, setRefused] = useState(false);
  const [coloring, setColoring] = useState(false);
  const tag = useRef<HTMLButtonElement>(null);
  const problemId = useId();
  if (!label) return null;
  const typed = draft?.trim().slice(0, EVENT_LIMITS.labelName) ?? '';
  const taken = typed !== '' && typed !== label.name && labelNameTaken(labels, typed, id);
  const problem = refused && taken ? t('This label already exists: choose another name.') : null;
  /** Renames to what is typed; a name another label wears is kept, said, and not saved. */
  const commit = (): boolean => {
    if (taken) {
      setRefused(true);
      return false;
    }
    if (typed && typed !== label.name) renameLabel(id, typed);
    setDraft(null);
    setRefused(false);
    return true;
  };
  return (
    <li className={page.labelRow} data-motion={id}>
      <button ref={tag} type="button" className={page.tagButton} data-pebble-under={1} aria-label={t('Colour of {name}', { name: label.name })} data-tip={t('Colour')} aria-haspopup="dialog" aria-expanded={coloring} onClick={() => setColoring(true)}>
        <LabelTag color={label.color} size={26} />
      </button>
      <input
        className={`${page.labelName} t-body`}
        value={draft ?? label.name}
        maxLength={EVENT_LIMITS.labelName}
        aria-label={t('Rename {name}', { name: label.name })}
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
      <Link to={paths.label(id)} className={`${page.labelCount} t-meta-strong tabular`} ariaLabel={t('{events} with {name}', { events: plural(uses, 'event'), name: label.name })} tip={t('See the events')}>
        {uses}
      </Link>
      <IconButton icon="trash" label={t('Delete the label {name}', { name: label.name })} shape={2} onClick={() => showUndo(t('Label “{name}” deleted', { name: label.name }), deleteLabel(id))} />
      <Popover open={coloring} anchor={tag} onDismiss={() => setColoring(false)} label={t('Colour of {name}', { name: label.name })} width={300}>
        <div className={page.labelColors}>
          <ColorPicker
            label={t('Colour of {name}', { name: label.name })}
            value={label.color}
            onChange={color => {
              setLabelColor(id, color);
              setColoring(false);
            }}
          />
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

export function LabelsScreen() {
  const labels = useCalendarStore(s => s.labels);
  const events = useCalendarStore(s => s.events);
  const [name, setName] = useState('');
  const live = useMemo(() => Object.values(labels).filter(label => label.deletedAt === null).sort((a, b) => (a.position < b.position ? -1 : 1)), [labels]);
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const event of Object.values(events)) if (event.deletedAt === null && event.trashedAt === null && !event.recurringId) for (const id of event.labelIds) out.set(id, (out.get(id) ?? 0) + 1);
    return out;
  }, [events]);
  // A name already worn is said under the strip, what was typed kept.
  const form = useForm({ name: !isBlank(name) && labelNameTaken(labels, name) ? t('This label already exists: choose another name.') : null });
  const list = useRef<HTMLUListElement>(null);
  // A label deleted fades where it was, the others close ranks; a new one, or one put back, settles in.
  useListMotion(list, { late: true });
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
      <div>
        <PageHead title={t('Labels')} />
        <p className={`${styles.headNote} t-meta`}>{t('A label sorts your events and gives them its colour; untick it in the navigation to hide its events.')}</p>
      </div>
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
            field={form.field('name')}
            problemId="label-new-problem"
            className={`${page.labelNewInput} t-body`}
            value={name}
            onChange={setName}
            placeholder={t('Create label')}
            aria-label={t('New label’s name')}
            maxLength={EVENT_LIMITS.labelName}
            enterKeyHint="done"
            autoCapitalize="sentences"
          />
          {name.trim() ? <IconButton icon="check" label={t('Create')} onClick={add} /> : null}
        </form>
        <FieldProblem field={form.field('name')} id="label-new-problem" className={page.labelNewProblem} />
        {live.length > 0 ? (
          <ul ref={list} className={page.labelList} aria-label={t('Labels')}>
            {live.map(label => (
              <LabelRow key={label.id} id={label.id} uses={counts.get(label.id) ?? 0} />
            ))}
          </ul>
        ) : (
          <EmptyState scene="label" title={t('No labels')} text={t('Make one to sort your events: Work, Family, Sport…')} />
        )}
      </section>
    </div>
  );
}
