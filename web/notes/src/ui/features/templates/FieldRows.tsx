/**
 * A template's fields as its editor shows them: each a row of the form's own fields (its name, its
 * type, what to put in it), a grip to drag it elsewhere (or its arrows, Alt+↑/↓ anywhere in the row),
 * and ⋮ (« Monter », « Descendre », « Supprimer le champ »). Under them « Ajouter un champ » and
 * « Champs courants », the presets' fields the template has not, each added in one press; at eight
 * fields both go and a line says so. The rows move as the checklist's do (`useListMotion`).
 */
import { useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { TEMPLATE_LIMITS, type TemplateField } from '@unlease/notes/models/templates';
import { shownFieldType, suggestedFields } from '@unlease/notes/services/templates';

import { addField, moveField } from '../../../app/templates';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { Menu } from '@shared/ui/components/Menu';
import { SelectField } from '@shared/ui/components/SelectField';
import { TextField } from '@shared/ui/components/TextField';
import type { FieldBinding } from '@shared/ui/components/useForm';
import { useListMotion } from '../note/useListMotion';
import { FIELD_TYPE_GLYPHS, fieldTypeOptions } from './fieldTypes';
import styles from './templates.module.css';

/** How many « Champs courants » are offered at once. */
const SUGGESTED = 10;

interface Slot {
  readonly id: string;
  readonly top: number;
  readonly bottom: number;
}

interface Drag {
  readonly id: string;
  readonly startY: number;
  readonly pointerId: number;
  readonly rowTop: number;
  readonly rowHeight: number;
  readonly slots: readonly Slot[];
}

/** Where a row whose middle is at `center` would land among the others: its index, and the line's place. */
function dropAt(slots: readonly Slot[], center: number): { readonly index: number; readonly top: number } {
  const index = slots.filter(slot => (slot.top + slot.bottom) / 2 < center).length;
  const after = slots[index];
  const before = slots[index - 1];
  return { index, top: after ? after.top - 2 : before ? before.bottom + 1 : 0 };
}

export interface FieldRowsProps {
  readonly fields: readonly TemplateField[];
  readonly onChange: (fields: readonly TemplateField[]) => void;
  /** A field's name as the form checks it (`field:<id>`): its problem, and where the focus goes. */
  readonly binding: (id: string) => FieldBinding;
}

export function FieldRows({ fields, onChange, binding }: FieldRowsProps) {
  const list = useRef<HTMLUListElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const names = useRef(new Map<string, HTMLInputElement | HTMLTextAreaElement>());
  const settle = useListMotion(list);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ readonly index: number; readonly top: number } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuAnchor = useRef<HTMLButtonElement | null>(null);
  const [said, setSaid] = useState('');
  const commonId = useId();
  /** After a move the focus stays where it was (the row's node moved); after an add it goes to the new name. */
  const refocus = useRef<HTMLElement | null>(null);
  const focusName = useRef<string | null>(null);

  useLayoutEffect(() => {
    const element = refocus.current;
    refocus.current = null;
    if (element && element.isConnected && document.activeElement !== element) element.focus({ preventScroll: true });
    const id = focusName.current;
    if (id && names.current.get(id)) {
      focusName.current = null;
      names.current.get(id)!.focus();
    }
  });

  const set = (id: string, patch: Partial<TemplateField>): void => onChange(fields.map(field => (field.id === id ? { ...field, ...patch } : field)));

  const move = useCallback(
    (id: string, index: number): void => {
      const from = fields.findIndex(field => field.id === id);
      const to = Math.max(0, Math.min(fields.length - 1, index));
      if (from < 0 || from === to) return;
      refocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      onChange(moveField(fields, id, to));
      const name = fields[from]!.name.trim() || t('Champ sans nom');
      setSaid(t('{name} : position {index} sur {count}', { name, index: to + 1, count: fields.length }));
    },
    [fields, onChange],
  );

  const remove = (id: string): void => {
    const index = fields.findIndex(field => field.id === id);
    onChange(fields.filter(field => field.id !== id));
    const neighbour = fields[index + 1] ?? fields[index - 1];
    if (neighbour) focusName.current = neighbour.id;
  };

  const add = (suggestion?: TemplateField): void => {
    const next = addField(fields, suggestion);
    if (next.id === null) return;
    onChange(next.fields);
    // A field typed from nothing takes the caret; a suggestion is whole already.
    if (!suggestion) focusName.current = next.id;
    else setSaid(t('Champ « {name} » ajouté', { name: suggestion.name }));
  };

  // ── dragging by the grip ──────────────────────────────────────────────
  const onGripDown = (id: string, event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0 || fields.length < 2) return;
    const row = rows.current.get(id);
    if (!row) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const origin = list.current?.getBoundingClientRect().top ?? 0;
    const rect = row.getBoundingClientRect();
    const slots = fields
      .filter(field => field.id !== id)
      .map(field => {
        const box = rows.current.get(field.id)?.getBoundingClientRect();
        return { id: field.id, top: (box?.top ?? 0) - origin, bottom: (box?.bottom ?? 0) - origin };
      });
    drag.current = { id, startY: event.clientY, pointerId: event.pointerId, rowTop: rect.top - origin, rowHeight: rect.height, slots };
    setDragging(id);
    setDrop(dropAt(slots, rect.top - origin + rect.height / 2));
  };

  const onGripMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dy = event.clientY - current.startY;
    const row = rows.current.get(current.id);
    if (row) row.style.transform = `translateY(${dy}px)`;
    setDrop(dropAt(current.slots, current.rowTop + current.rowHeight / 2 + dy));
  };

  const onGripUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    const row = rows.current.get(current.id);
    // Let go, it settles from where the hand left it: into its new place, or back into its own.
    if (row) settle(row);
    const target = dropAt(current.slots, current.rowTop + current.rowHeight / 2 + (event.clientY - current.startY)).index;
    setDragging(null);
    setDrop(null);
    move(current.id, target);
  };

  const onRowKey = (id: string, event: KeyboardEvent<HTMLLIElement>): void => {
    if (!event.altKey || event.metaKey || event.ctrlKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const index = fields.findIndex(field => field.id === id);
    move(id, index + (event.key === 'ArrowUp' ? -1 : 1));
  };

  const onGripKey = (id: string, event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    event.stopPropagation();
    const index = fields.findIndex(field => field.id === id);
    move(id, index + (event.key === 'ArrowUp' ? -1 : 1));
  };

  const options = fieldTypeOptions();
  const suggestions = suggestedFields(fields).slice(0, SUGGESTED);
  const full = fields.length >= TEMPLATE_LIMITS.fields;
  const opened = menuFor ? fields.findIndex(field => field.id === menuFor) : -1;

  return (
    <div className={styles.fieldsBox}>
      {fields.length === 0 ? (
        <p className={`${styles.empty} t-body`}>{t('Aucun champ : Claude ne relèvera que le titre, le résumé et le prix.')}</p>
      ) : (
        <>
          {/* The columns' names over the rows; each field still names itself to screen readers. */}
          <div className={`${styles.fieldsHead} t-meta-strong`} aria-hidden="true">
            <span>{t('Nom')}</span>
            <span>{t('Type')}</span>
            <span>{t('Ce qu’il faut y mettre')}</span>
          </div>
          <ul ref={list} className={styles.fields} aria-label={t('Champs')}>
            {fields.map((field, index) => {
              const label = field.name.trim() || t('Champ {index}', { index: index + 1 });
              return (
                <li
                  key={field.id}
                  ref={element => {
                    if (element) rows.current.set(field.id, element);
                    else rows.current.delete(field.id);
                  }}
                  className={styles.field}
                  data-motion={field.id}
                  data-dragging={dragging === field.id || undefined}
                  aria-label={label}
                  onKeyDown={event => onRowKey(field.id, event)}
                >
                  <button
                    type="button"
                    className={styles.grip}
                    aria-label={t('Déplacer « {name} »', { name: label })}
                    data-tip={t('Glisser pour déplacer, ou Alt+↑ et Alt+↓')}
                    onPointerDown={event => onGripDown(field.id, event)}
                    onPointerMove={onGripMove}
                    onPointerUp={onGripUp}
                    onPointerCancel={onGripUp}
                    onKeyDown={event => onGripKey(field.id, event)}
                  >
                    <Icon name="grip" size={18} />
                  </button>
                  <TextField
                    ref={element => {
                      if (element) names.current.set(field.id, element);
                      else names.current.delete(field.id);
                    }}
                    className={styles.fieldName}
                    field={binding(field.id)}
                    ariaLabel={t('Nom du champ {index}', { index: index + 1 })}
                    placeholder={t('Nom du champ')}
                    value={field.name}
                    maxLength={TEMPLATE_LIMITS.fieldName}
                    onChange={name => set(field.id, { name })}
                  />
                  <SelectField
                    className={styles.fieldType}
                    ariaLabel={t('Type du champ {index}', { index: index + 1 })}
                    value={field.type}
                    options={options}
                    icon={FIELD_TYPE_GLYPHS[field.type]}
                    shown={shownFieldType(field.type).name}
                    onChange={type => set(field.id, { type })}
                  />
                  {/* One sentence that wraps as it grows: Enter saves, as in a one-line field. */}
                  <TextField
                    className={styles.fieldHint}
                    inputClassName={styles.hintInput}
                    multiline
                    ariaLabel={t('Ce qu’il faut y mettre, champ {index}', { index: index + 1 })}
                    placeholder={t('Ce que Claude doit y relever')}
                    value={field.hint}
                    maxLength={TEMPLATE_LIMITS.hint}
                    onChange={hint => set(field.id, { hint: hint.replace(/\s*\n\s*/g, ' ') })}
                    onKeyDown={event => {
                      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }}
                  />
                  <IconButton
                    className={styles.fieldMore}
                    icon="more"
                    label={t('Actions de « {name} »', { name: label })}
                    hasPopup="menu"
                    expanded={menuFor === field.id}
                    shape={index + 1}
                    onClick={event => {
                      menuAnchor.current = event.currentTarget;
                      setMenuFor(field.id);
                    }}
                  />
                </li>
              );
            })}
            {drop && dragging ? <li className={styles.dropLine} style={{ top: drop.top }} aria-hidden="true" /> : null}
          </ul>
        </>
      )}
      {full ? (
        <p className={`${styles.full} t-meta`}>{t('{count} champs au plus.', { count: TEMPLATE_LIMITS.fields })}</p>
      ) : (
        <>
          <button type="button" className={`${styles.add} t-label`} onClick={() => add()}>
            <Icon name="plus" size={20} />
            {t('Ajouter un champ')}
          </button>
          {suggestions.length > 0 ? (
            <section className={styles.common} aria-labelledby={commonId}>
              <h3 id={commonId} className="t-meta-strong">
                {t('Champs courants')}
              </h3>
              <ul className={styles.chips}>
                {suggestions.map(suggestion => (
                  <li key={suggestion.name}>
                    <button type="button" className={styles.chip} aria-label={t('Ajouter le champ « {name} »', { name: suggestion.name })} data-tip={suggestion.hint || undefined} onClick={() => add(suggestion)}>
                      <Icon name="plus" size={16} />
                      <span>{suggestion.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      <p className="sr-only" role="status">
        {said}
      </p>
      <Menu
        open={menuFor !== null && opened >= 0}
        anchor={menuAnchor}
        onDismiss={() => setMenuFor(null)}
        label={t('Actions du champ')}
        items={
          opened < 0
            ? []
            : [
                { label: t('Monter'), icon: 'arrowUp', disabled: opened === 0, onSelect: () => move(menuFor!, opened - 1) },
                { label: t('Descendre'), icon: 'arrowDown', disabled: opened === fields.length - 1, onSelect: () => move(menuFor!, opened + 1) },
                { label: t('Supprimer le champ'), icon: 'trash', danger: true, onSelect: () => remove(menuFor!) },
              ]
        }
      />
    </div>
  );
}
