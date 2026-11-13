/**
 * The facts Claude notes, as an editor shows them: each a line that reads as it will on a link (its
 * name, what Claude notes in it, the shape of the answer when it is not « quelques mots »), which opens
 * in place to be changed (its name, what Claude notes in it, « Réponse »), one at a time; its trash, at
 * the row's end, takes it off in one press (the slip puts it back). A grip drags a fact elsewhere (or Alt+↑/↓ anywhere on it). Under them « Ajouter une
 * information » and « Suggestions », the usual facts the list has not (those of its links' kinds
 * first), each added in one press; at eight both go and a line says so. A fact with a problem stays open, so the form can show
 * it and take the focus there. The rows move as the checklist's do (`useListMotion`).
 */
import { useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { t, tc } from '@unlease/core/i18n';
import type { LinkKind } from '@unlease/notes/models/entities';
import { TEMPLATE_LIMITS, type TemplateField } from '@unlease/notes/models/templates';
import { shownFieldAnswer, suggestedFields } from '@unlease/notes/services/templates';

import { addField, moveField } from '../../../app/templates';
import { showUndo } from '@shared/app/store/ui';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { SelectField } from '@shared/ui/components/SelectField';
import { TextField } from '@shared/ui/components/TextField';
import type { FieldBinding } from '@shared/ui/components/useForm';
import { useListMotion } from '@shared/ui/useListMotion';
import { FIELD_TYPE_GLYPHS, answerOptions } from './fieldTypes';
import styles from './templates.module.css';

/** How many suggestions are offered at once. */
const SUGGESTED = 8;

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

export interface FactRowsProps {
  readonly fields: readonly TemplateField[];
  readonly onChange: (fields: readonly TemplateField[]) => void;
  /** A fact's name as the form checks it (`field:<id>`): its problem, and where the focus goes. */
  readonly binding: (id: string) => FieldBinding;
  /** The facts that cannot be kept as they are (by id): they stay open. */
  readonly problems: Readonly<Record<string, string>>;
  /** The kinds these facts are for (the links', the page's own): their usual facts are suggested first. */
  readonly kinds: readonly LinkKind[];
}

export function FactRows({ fields, onChange, binding, problems, kinds }: FactRowsProps) {
  const list = useRef<HTMLUListElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const names = useRef(new Map<string, HTMLInputElement | HTMLTextAreaElement>());
  const settle = useListMotion(list);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ readonly index: number; readonly top: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const suggestionsId = useId();
  const baseId = useId();
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
      const name = fields[from]!.name.trim() || t('Unnamed fact');
      setSaid(t('{name}: position {index} of {count}', { name, index: to + 1, count: fields.length }));
    },
    [fields, onChange],
  );

  // A fact taken off in one press, from its row's trash: nothing is saved yet, and the slip puts it back where it was.
  const latest = useRef(fields);
  useLayoutEffect(() => {
    latest.current = fields;
  });
  const remove = (field: TemplateField): void => {
    const index = fields.findIndex(each => each.id === field.id);
    if (index < 0) return;
    onChange(fields.filter(each => each.id !== field.id));
    if (openId === field.id) setOpenId(null);
    showUndo(tc('field', '“{name}” removed', { name: field.name.trim() || t('Unnamed fact') }), () => {
      const now = latest.current;
      if (!now.some(each => each.id === field.id)) onChange([...now.slice(0, index), field, ...now.slice(index)]);
    });
  };

  const add = (suggestion?: TemplateField): void => {
    const next = addField(fields, suggestion);
    if (next.id === null) return;
    onChange(next.fields);
    if (suggestion) {
      setSaid(tc('field', '“{name}” added', { name: suggestion.name }));
      return;
    }
    // A fact written from nothing opens, its name taking the caret.
    setOpenId(next.id);
    focusName.current = next.id;
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

  const options = answerOptions();
  const suggestions = suggestedFields(fields, kinds).slice(0, SUGGESTED);
  const full = fields.length >= TEMPLATE_LIMITS.fields;

  return (
    <div className={styles.facts}>
      {fields.length === 0 ? (
        <EmptyLine text={t('No facts: Claude will only note the title, the summary and the price.')} className={styles.empty} />
      ) : (
        <ul ref={list} className={styles.factList} aria-label={t('Facts')}>
          {fields.map(field => {
            const label = field.name.trim() || t('Unnamed fact');
            const open = openId === field.id || problems[field.id] !== undefined;
            const bodyId = `${baseId}-${field.id}`;
            const answer = field.type === 'text' ? null : shownFieldAnswer(field.type);
            const summary = [field.hint.trim(), answer].filter(Boolean).join(' · ');
            return (
              <li
                key={field.id}
                ref={element => {
                  if (element) rows.current.set(field.id, element);
                  else rows.current.delete(field.id);
                }}
                className={styles.fact}
                data-motion={field.id}
                data-open={open || undefined}
                data-dragging={dragging === field.id || undefined}
                aria-label={label}
                onKeyDown={event => onRowKey(field.id, event)}
              >
                <button
                  type="button"
                  className={styles.grip}
                  aria-label={t('Move “{name}”', { name: label })}
                  data-tip={t('Drag to move, or Alt+↑ and Alt+↓')}
                  onPointerDown={event => onGripDown(field.id, event)}
                  onPointerMove={onGripMove}
                  onPointerUp={onGripUp}
                  onPointerCancel={onGripUp}
                  onKeyDown={event => onGripKey(field.id, event)}
                >
                  <Icon name="grip" size={18} />
                </button>
                <div className={styles.factBox}>
                  <div className={styles.factTop}>
                    <button
                      type="button"
                      className={styles.factHead}
                      aria-expanded={open}
                      aria-controls={open ? bodyId : undefined}
                      onClick={() => setOpenId(open && problems[field.id] === undefined ? null : field.id)}
                    >
                      <Icon name={FIELD_TYPE_GLYPHS[field.type]} size={20} className={styles.factGlyph} />
                      <span className={styles.factText}>
                        <span className={`${styles.factName} t-body-strong`}>{label}</span>
                        {summary && !open ? <span className={`${styles.factMeta} t-meta`}>{summary}</span> : null}
                      </span>
                      <Icon name="chevronDown" size={20} className={styles.factChevron} />
                    </button>
                    <IconButton icon="trash" size={20} label={t('Remove “{name}”', { name: label })} className={styles.factTrash} onClick={() => remove(field)} />
                  </div>
                  {open ? (
                    <div id={bodyId} className={styles.factBody}>
                      <TextField
                        ref={element => {
                          if (element) names.current.set(field.id, element);
                          else names.current.delete(field.id);
                        }}
                        field={binding(field.id)}
                        label={t('Name of the fact')}
                        placeholder={t('Price, author, address…')}
                        value={field.name}
                        maxLength={TEMPLATE_LIMITS.fieldName}
                        onChange={name => set(field.id, { name })}
                      />
                      {/* One sentence that wraps as it grows: Enter saves, as in a one-line field. */}
                      <TextField
                        multiline
                        label={t('What Claude writes in it')}
                        inputClassName={styles.hintInput}
                        placeholder={t('For example: the year it came out')}
                        value={field.hint}
                        maxLength={TEMPLATE_LIMITS.hint}
                        onChange={hint => set(field.id, { hint: hint.replace(/\s*\n\s*/g, ' ') })}
                        onKeyDown={event => {
                          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }}
                      />
                      <SelectField
                        className={styles.factAnswer}
                        label={t('Answer')}
                        value={field.type}
                        options={options}
                        icon={FIELD_TYPE_GLYPHS[field.type]}
                        onChange={type => set(field.id, { type })}
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
          {drop && dragging ? <li className={styles.dropLine} style={{ top: drop.top }} aria-hidden="true" /> : null}
        </ul>
      )}
      {full ? (
        <p className={`${styles.full} t-meta`}>{t('{count} facts at most.', { count: TEMPLATE_LIMITS.fields })}</p>
      ) : (
        <>
          <button type="button" className={`${styles.add} t-label`} onClick={() => add()}>
            <Icon name="plus" size={20} />
            {t('Add a fact')}
          </button>
          {suggestions.length > 0 ? (
            <section className={styles.common} aria-labelledby={suggestionsId}>
              <h3 id={suggestionsId} className="t-meta-strong">
                {t('Suggestions')}
              </h3>
              <ul className={styles.chips}>
                {suggestions.map(suggestion => (
                  <li key={suggestion.name}>
                    <button type="button" className={styles.chip} aria-label={t('Add “{name}”', { name: suggestion.name })} data-tip={suggestion.hint || undefined} onClick={() => add(suggestion)}>
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
    </div>
  );
}
