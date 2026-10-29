/**
 * A note's labels, with a field that filters them and creates one when
 * nothing matches, as Keep's picker does (the phone's LabelsSheet).
 */
import { useMemo, useRef, useState, type RefObject } from 'react';

import { t } from '@unlease/core/i18n';
import { foldText } from '@unlease/core/services/search';

import { createLabel } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { Icon } from '../../components/Icon';
import { LabelCheck } from '../../components/LabelMark';
import { Popover } from '../../components/Popover';
import inputs from '../../components/controls.module.css';
import { NARROW, useMedia } from '../../useMedia';
import styles from './editor.module.css';

export interface LabelPickerProps {
  readonly open: boolean;
  readonly anchor: RefObject<HTMLElement | null>;
  readonly selected: readonly string[];
  readonly onDismiss: () => void;
  readonly onChange: (ids: string[]) => void;
}

function LabelList({ selected, onChange, narrow, holder }: { selected: readonly string[]; onChange: (ids: string[]) => void; narrow: boolean; holder: RefObject<HTMLDivElement | null> }) {
  const order = useLibraryStore(s => s.labelOrder);
  const labels = useLibraryStore(s => s.labels);
  const [filter, setFilter] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const wanted = foldText(filter.trim());
  const shown = useMemo(() => order.filter(id => labels[id] && foldText(labels[id]!.name).includes(wanted)), [order, labels, wanted]);
  const exact = order.some(id => labels[id] && foldText(labels[id]!.name) === wanted);
  const toggle = (id: string): void => onChange(selected.includes(id) ? selected.filter(l => l !== id) : [...selected, id]);
  const create = (): void => {
    if (!filter.trim()) return;
    const id = createLabel(filter);
    onChange([...selected, id]);
    setFilter('');
    field.current?.focus();
  };
  return (
    <div ref={holder} className={styles.picker} tabIndex={-1}>
      <h2 className={`${styles.pickerTitle} ${narrow ? 't-title' : 't-label'}`}>{t('Labels')}</h2>
      <input
        ref={field}
        data-autofocus={narrow ? undefined : true}
        className={`${inputs.input} ${styles.labelFilter}`}
        value={filter}
        onChange={event => setFilter(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (wanted && !exact) create();
            else if (shown[0]) toggle(shown[0]);
          }
        }}
        placeholder={t('Chercher ou créer un label')}
        aria-label={t('Chercher ou créer un label')}
        maxLength={60}
      />
      <div className={styles.labelList}>
        {filter.trim() && !exact ? (
          <button type="button" className={`${styles.pickerRow} ${styles.pickerAdd}`} onClick={create}>
            <Icon name="plus" size={20} />
            {t('Créer « {name} »', { name: filter.trim() })}
          </button>
        ) : null}
        {shown.map(id => {
          const label = labels[id]!;
          const checked = selected.includes(id);
          return (
            <label key={id} className={styles.labelRow}>
              <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(id)} />
              <LabelCheck color={label.color} checked={checked} />
              <span className={`${styles.labelName} t-body`}>{label.name}</span>
            </label>
          );
        })}
        {order.length === 0 && !filter ? <p className={`${styles.emptyLabels} t-meta`}>{t('Aucun label pour l’instant. Tapez un nom pour en créer un.')}</p> : null}
      </div>
    </div>
  );
}

export function LabelPicker({ open, anchor, selected, onDismiss, onChange }: LabelPickerProps) {
  const narrow = useMedia(NARROW);
  // On a phone the sheet opens on its labels with the keyboard down, as the phone's does; the field is one tap away.
  const holder = useRef<HTMLDivElement>(null);
  return (
    <Popover open={open} anchor={anchor} onDismiss={onDismiss} label={t('Labels')} width={300} initialFocus={narrow ? holder : undefined}>
      <LabelList selected={selected} onChange={onChange} narrow={narrow} holder={holder} />
    </Popover>
  );
}
