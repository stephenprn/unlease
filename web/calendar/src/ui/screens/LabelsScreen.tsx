/** The labels: each renamed, coloured or deleted (its events lose it), a new one made; a label opens its events. */
import { useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { EVENT_LIMITS, labelNameTaken } from '@unlease/calendar/models/events';

import { showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { IconButton } from '@shared/ui/components/IconButton';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { Link } from '@shared/ui/router';
import { createLabel, deleteLabel, renameLabel, setLabelColor } from '../../app/store/actions';
import { useCalendarStore } from '../../app/store/library';
import styles from '../calendar.module.css';
import { ColorPicker } from '../features/ColorPicker';
import { NameField } from '../features/NameField';
import { paths } from '../routes';

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
  const taken = (typed: string, except: string | null = null): string | null => (labelNameTaken(labels, typed, except) ? t('Ce libellé existe déjà : choisissez un autre nom.') : null);
  const form = useForm({ name: taken(name) });
  const create = (): void => {
    if (!name.trim()) return;
    createLabel(name);
    setName('');
    form.reset();
  };
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      <PageHead title={t('Libellés')} />
      <p className={`${styles.lead} t-body`}>{t('Un libellé range vos événements et leur donne sa couleur ; décochez-le dans la navigation pour cacher ses événements.')}</p>
      <form className={styles.newLabel} onSubmit={form.onSubmit(create)} noValidate>
        <TextField label={t('Nouveau libellé')} value={name} onChange={setName} field={form.field('name')} maxLength={EVENT_LIMITS.labelName} placeholder={t('Travail, Famille, Sport…')} className={styles.newLabelField} />
        <Button type="submit" icon="plus" disabled={!name.trim()} className={styles.newLabelButton}>
          {t('Créer')}
        </Button>
      </form>
      {live.length === 0 ? (
        <EmptyState scene="label" title={t('Aucun libellé')} text={t('Créez-en un pour ranger vos événements : Travail, Famille, Sport…')} />
      ) : (
        <OutlinedBox kind="panel" lift="card" className={`${styles.panel} paper`}>
          <ul className={styles.list}>
            {/* Each label: its name in its field (a list of names needs no « Nom » over each), its events and its bin on the field's line, its colours under it. */}
            {live.map(label => (
              <li key={label.id} className={styles.item}>
                <div className={styles.itemHead}>
                  <div className={styles.itemName}>
                    <NameField ariaLabel={t('Nom')} value={label.name} onSave={value => renameLabel(label.id, value)} maxLength={EVENT_LIMITS.labelName} check={value => taken(value, label.id)} />
                  </div>
                  <span className={styles.itemLine}>
                    <Link to={paths.label(label.id)} className={`${styles.itemCount} t-meta`}>
                      {plural(counts.get(label.id) ?? 0, 'événement')}
                    </Link>
                    <IconButton icon="trash" label={t('Supprimer le libellé {name}', { name: label.name })} onClick={() => showUndo(t('Libellé « {name} » supprimé', { name: label.name }), deleteLabel(label.id))} />
                  </span>
                </div>
                <ColorPicker label={t('Couleur de {name}', { name: label.name })} value={label.color} onChange={color => setLabelColor(label.id, color)} />
              </li>
            ))}
          </ul>
        </OutlinedBox>
      )}
    </div>
  );
}
