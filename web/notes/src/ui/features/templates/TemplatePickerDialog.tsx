/**
 * A collection's « Modèle de fiche »: « Selon le type de lien » (each link read with its kind's), or
 * one of the person's own, the chosen one ticked; a choice writes at once (« Modèle choisi », with
 * « Annuler »). Then « Nouveau modèle » (made for this collection, chosen once saved) and « Gérer
 * les modèles ». The phone's `TemplatePickerSheet`.
 */
import { useId, type KeyboardEvent } from 'react';

import { plural } from '@unlease/core/services/format';
import { t } from '@unlease/core/i18n';
import { collectionTemplate } from '@unlease/notes/services/templates';

import { setCollectionTemplate } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { ownTemplates } from '../../../app/templates';
import { showUndo } from '@shared/app/store/ui';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { Icon } from '@shared/ui/components/Icon';
import { Layer } from '@shared/ui/components/Layer';
import { navigate } from '@shared/ui/router';
import { paths } from '../../routes';
import styles from './templates.module.css';

/** The radio's value for « Selon le type de lien ». */
const BY_KIND = '';

export function TemplatePickerDialog({ lineId, open, onDismiss }: { lineId: string; open: boolean; onDismiss: () => void }) {
  const titleId = useId();
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <PickerBody lineId={lineId} titleId={titleId} onDismiss={onDismiss} />
    </Layer>
  );
}

function PickerBody({ lineId, titleId, onDismiss }: { lineId: string; titleId: string; onDismiss: () => void }) {
  const line = useLibraryStore(s => s.notes[lineId]);
  const templates = useLibraryStore(s => s.linkTemplates);
  if (!line) return null;
  const own = ownTemplates(templates);
  // A template deleted since reads as « Selon le type de lien ».
  const chosen = collectionTemplate(templates, line)?.id ?? BY_KIND;
  const choose = (value: string): void => {
    onDismiss();
    if (value === chosen) return;
    showUndo(t('Modèle choisi'), setCollectionTemplate(lineId, value === BY_KIND ? null : value));
  };
  // The arrows move between the choices; Enter, Space or a press chooses.
  const onKeys = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const radios = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
    const at = radios.findIndex(radio => radio === document.activeElement);
    radios[(at + step + radios.length) % radios.length]?.focus();
  };

  const radio = (value: string, icon: 'apps' | 'rows', name: string, meta: string) => (
    <button
      key={value || 'kind'}
      type="button"
      role="radio"
      aria-checked={value === chosen}
      tabIndex={value === chosen ? 0 : -1}
      data-autofocus={value === chosen || undefined}
      className={styles.pickRow}
      onClick={() => choose(value)}
    >
      <Icon name={icon} size={24} />
      <span className={styles.pickText}>
        <span className={`${styles.pickName} t-body-strong`}>{name}</span>
        <span className={`${styles.pickMeta} t-meta`}>{meta}</span>
      </span>
      {value === chosen ? <Icon name="check" size={20} className={styles.pickTick} /> : null}
    </button>
  );

  return (
    <DialogFrame kind="list" title={t('Modèle de fiche')} titleId={titleId} onClose={onDismiss}>
      <div role="radiogroup" aria-labelledby={titleId} onKeyDown={onKeys}>
        {radio(BY_KIND, 'apps', t('Selon le type de lien'), t('Chaque lien est lu avec le modèle de son type.'))}
        {own.map(template => radio(template.id, 'rows', template.name, plural(template.fields.length, 'champ')))}
      </div>
      <div className={styles.pickRule} role="presentation" />
      <button
        type="button"
        className={`${styles.pickRow} ${styles.pickLink}`}
        onClick={() => {
          onDismiss();
          navigate(paths.template('new', lineId));
        }}
      >
        <Icon name="plus" size={24} />
        <span className={`${styles.pickText} t-body`}>{t('Nouveau modèle')}</span>
      </button>
      <button
        type="button"
        className={styles.pickRow}
        onClick={() => {
          onDismiss();
          navigate(paths.templates);
        }}
      >
        <Icon name="settings" size={24} />
        <span className={`${styles.pickText} t-body`}>{t('Gérer les modèles')}</span>
        <Icon name="chevronRight" size={20} className={styles.chevron} />
      </button>
    </DialogFrame>
  );
}
