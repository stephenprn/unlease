/**
 * A table with typed columns: text, number (with its unit), box, link, e-mail, telephone, date,
 * select and multi-select. A cell shows its value as its type reads it and is edited in place (a
 * box ticks at once, a select opens its choices, where a new one can be made); a column's head
 * opens its settings (name, type, unit, choices, place); its edge is dragged to widen it. Changing
 * a column's type converts its cells.
 *
 * A cell of a strict type (number, date, e-mail, link, telephone) takes only what fits it: Enter
 * on something else keeps the cell open and says what it expects; leaving it keeps the old value
 * and offers to correct. A cell that no longer fits after its column changed type is flagged.
 */
import { memo, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';
import { t } from '@unlease/core/i18n';
import { COLUMN_TYPE_NAMES, COLUMN_TYPES, type Block, type CellValue, type ColumnType, type SelectOption, type TableColumn } from '@unlease/notes/models/blocks';
import { LINE_COLORS, type LineColor } from '@unlease/design/colors';
import { createId } from '@unlease/core/services/ids';
import { foldText } from '@unlease/core/services/search';
import { CELL_FORMATS, cellFits, cellHref, cellText, columnType, formatNumberCell, parseDay, readCellInput } from '@unlease/notes/services/table';
import { prettyUrl } from '@unlease/core/services/url';

import { useLibraryStore } from '../../../app/store/library';
import { addColumn, addRow, changeColumnType, deleteBlocks, deleteColumn, moveColumn, setCell, setColumnOptions, updateColumn } from '../../../app/store/pages';
import { showError } from '../../../app/store/ui';
import { Checkbox } from '../../components/Checkbox';
import { Icon } from '../../components/Icon';
import { Popover } from '../../components/Popover';
import { LineColorPicker } from '../lines/LineColorPicker';
import { usePageContext } from './PageContext';
import styles from './pages.module.css';

const NO_ROWS: readonly string[] = [];

/** A column never widened by hand: narrow for a box or a number, wider for words. */
const DEFAULT_WIDTHS: Partial<Record<ColumnType, number>> = { checkbox: 80, number: 120, date: 150 };
const widthOf = (column: TableColumn): number => column.width ?? DEFAULT_WIDTHS[columnType(column)] ?? 180;

export const COLUMN_ICONS: Record<ColumnType, GlyphName> = {
  text: 'textAlign',
  number: 'hash',
  checkbox: 'boxChecked',
  url: 'link',
  email: 'email',
  phone: 'phoneCall',
  date: 'calendar',
  select: 'select',
  multi: 'multiSelect',
};

/** A choice as a chip on its pigment's wash. */
function OptionChip({ option }: { option: SelectOption }) {
  return (
    <span className={styles.optionChip} data-line={option.color}>
      {option.name}
    </span>
  );
}

/** A select's or a multi-select's choices for one cell: tick them, find one, or make a new one by typing it. */
function OptionsPicker({ page, table, column, value, multi, onDone }: { page: string; table: string; column: TableColumn; value: CellValue | undefined; multi: boolean; onDone: (value: CellValue) => void }) {
  const [query, setQuery] = useState('');
  const chosen = new Set(multi ? (Array.isArray(value) ? value : []) : typeof value === 'string' && value ? [value] : []);
  const options = column.options ?? [];
  const wanted = foldText(query.trim());
  const shown = options.filter(option => !wanted || foldText(option.name).includes(wanted));
  const exact = options.some(option => option.name.toLowerCase() === query.trim().toLowerCase());
  const choose = (id: string): void => {
    if (!multi) {
      onDone(chosen.has(id) ? null : id);
      return;
    }
    const next = chosen.has(id) ? [...chosen].filter(other => other !== id) : [...chosen, id];
    onDone(next);
  };
  const create = (): void => {
    const name = query.trim().slice(0, 100);
    if (!name) return;
    const option: SelectOption = { id: createId(), name, color: LINE_COLORS[options.length % LINE_COLORS.length]! };
    setColumnOptions(page, table, column.id, [...options, option]);
    setQuery('');
    choose(option.id);
  };
  return (
    <div className={styles.optionsPanel}>
      <input
        className={styles.pickerField}
        value={query}
        placeholder={options.length > 0 ? t('Chercher ou créer une option') : t('Créer une option')}
        aria-label={t('Chercher ou créer une option')}
        data-autofocus=""
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          if (shown[0] && (exact || !query.trim())) choose(shown[0].id);
          else create();
        }}
      />
      <div className={styles.optionsList} role="listbox" aria-multiselectable={multi} aria-label={column.name}>
        {shown.map(option => (
          <button key={option.id} type="button" role="option" aria-selected={chosen.has(option.id)} className={styles.optionRow} onClick={() => choose(option.id)}>
            <OptionChip option={option} />
            {chosen.has(option.id) ? <Icon name="check" size={16} /> : null}
          </button>
        ))}
        {query.trim() && !exact ? (
          <button type="button" className={styles.optionRow} onClick={create}>
            <Icon name="plus" size={16} />
            {t('Créer « {name} »', { name: query.trim() })}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** What a cell shows when it is not being edited. */
function CellView({ column, value }: { column: TableColumn; value: CellValue | undefined }) {
  const type = columnType(column);
  if (type === 'select' || type === 'multi') {
    const ids = type === 'multi' ? (Array.isArray(value) ? value : []) : typeof value === 'string' && value ? [value] : [];
    const options = ids.flatMap(id => column.options?.find(option => option.id === id) ?? []);
    return (
      <span className={styles.cellChips}>
        {options.map(option => (
          <OptionChip key={option.id} option={option} />
        ))}
      </span>
    );
  }
  if (type === 'number') return <span className={`${styles.cellNumber} tabular`}>{typeof value === 'number' ? formatNumberCell(value, column.unit) : ''}</span>;
  const text = cellText(value, column);
  // Typed before the column took its type, and not what the type expects: said beside it, never drawn as a link.
  const format = CELL_FORMATS[type];
  if (format && !cellFits(value, column)) {
    return (
      <span className={styles.cellMisfit}>
        <span className={styles.cellText}>{text}</span>
        <span className={styles.cellMisfitMark} aria-hidden="true">
          <Icon name="alert" size={14} />
        </span>
      </span>
    );
  }
  const href = type === 'url' || type === 'email' || type === 'phone' ? cellHref(type, text) : null;
  if (href) return <span className={styles.cellLink}>{type === 'url' ? prettyUrl(text) : text}</span>;
  return <span className={styles.cellText}>{text}</span>;
}

/** The text a cell opens with: what it holds, as one types it. */
function draftOf(type: ColumnType, value: CellValue | undefined, column: TableColumn): string {
  if (type === 'number') return typeof value === 'number' ? String(value).replace('.', ',') : '';
  if (type === 'date') return typeof value === 'string' ? value : '';
  return cellText(value, column);
}

/** The keyboard a phone shows for each type. */
const INPUT_MODES: Partial<Record<ColumnType, 'decimal' | 'email' | 'url' | 'tel'>> = { number: 'decimal', email: 'email', url: 'url', phone: 'tel' };

const Cell = memo(function Cell({ page, table, rowId, column, value }: { page: string; table: string; rowId: string; column: TableColumn; value: CellValue | undefined }) {
  const { readOnly } = usePageContext();
  const type = columnType(column);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Enter pressed on something the type refuses: the cell stays open and says what it expects.
  const [refused, setRefused] = useState(false);
  const cell = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  // Set once Enter or Escape has closed the cell, so the blur that follows does not close it again.
  const settled = useRef(false);
  // The cell's button takes the focus back once the editor has gone (Enter, Escape).
  const refocus = useRef(false);
  const problemId = useId();
  const write = (next: CellValue): void => setCell(page, rowId, column.id, next);

  // Opened, the caret goes to the end of what the cell holds, as a spreadsheet's does.
  useLayoutEffect(() => {
    const node = field.current;
    if (!editing || !node || type === 'date') return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, [editing, type]);

  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    cell.current?.focus();
  }, [editing]);

  if (type === 'checkbox') {
    return (
      <td className={styles.cell} data-type={type}>
        <Checkbox checked={value === true} label={value === true ? t('{name} : coché', { name: column.name }) : t('{name} : non coché', { name: column.name })} disabled={readOnly} onToggle={() => write(value !== true)} />
      </td>
    );
  }

  const format = CELL_FORMATS[type];
  const open = (text: string, refusedBefore = false): void => {
    settled.current = false;
    setDraft(text);
    setRefused(refusedBefore);
    setEditing(true);
  };
  const begin = (): void => {
    if (readOnly) return;
    open(draftOf(type, value, column));
  };
  const close = (): void => {
    setEditing(false);
    setRefused(false);
  };
  /** What was typed, as the cell will hold it; null when the type refuses it (a date field half filled in counts as refused). */
  const read = (): { value: CellValue } | null => {
    if (type === 'date' && field.current?.validity.badInput) return null;
    const input = readCellInput(type, draft);
    return input.ok ? { value: input.value } : null;
  };
  const save = (next: CellValue): void => {
    // Nothing changed: no write, no undo step.
    if (next === value || (next === '' && (value === undefined || value === null)) || (next === null && value === undefined)) return;
    write(next);
  };
  const commitOnEnter = (): void => {
    const typed = read();
    if (!typed) {
      setRefused(true);
      return;
    }
    settled.current = true;
    refocus.current = true;
    close();
    save(typed.value);
  };
  const commitOnBlur = (): void => {
    if (settled.current) return;
    settled.current = true;
    const typed = read();
    close();
    if (typed) {
      save(typed.value);
      return;
    }
    // Left with something the type refuses: the cell keeps what it held, and the slip offers to go back to it.
    const kept = draft;
    showError(format ? t('Ce n’est pas {expected} : la cellule n’a pas changé.', { expected: format.expected }) : t('La cellule n’a pas changé.'), { label: t('Corriger'), run: () => open(kept, true) });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>): void => {
    // Shift+Enter writes a new line in a text cell; Enter closes every cell.
    if (event.key === 'Enter' && !(event.shiftKey && type === 'text')) {
      event.preventDefault();
      commitOnEnter();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      settled.current = true;
      refocus.current = true;
      close();
    }
  };
  const href = (type === 'url' || type === 'email' || type === 'phone') && typeof value === 'string' ? cellHref(type, value) : null;
  const misfit = format && !cellFits(value, column) ? t('Ce n’est pas {expected}', { expected: format.expected }) : null;
  const inline = editing && type !== 'select' && type !== 'multi';
  const problem = refused && format ? t('Ce n’est pas {expected}. Exemple : {example}', { expected: format.expected, example: format.example }) : null;

  return (
    <td className={styles.cell} data-type={type} data-editing={inline || undefined} data-refused={problem ? '' : undefined}>
      {inline ? (
        <>
          {/* The text in the cell's own place: the editor lies over a copy of it, so the row keeps its height and grows as lines are typed. */}
          <div className={styles.cellEditor}>
            <span className={`${styles.cellSizer} ${type === 'number' ? styles.cellSizerNumber : ''}`} aria-hidden="true">{`${draft}\u200b`}</span>
            {type === 'date' ? (
              <input
                ref={field}
                className={styles.cellInput}
                type="date"
                value={parseDay(draft) ?? draft}
                autoFocus
                aria-label={column.name}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? problemId : undefined}
                onChange={event => {
                  setDraft(event.target.value);
                  setRefused(false);
                }}
                onBlur={commitOnBlur}
                onKeyDown={onKeyDown}
              />
            ) : (
              <textarea
                ref={field}
                className={`${styles.cellInput} ${type === 'number' ? styles.cellInputNumber : ''}`}
                rows={1}
                value={draft}
                inputMode={INPUT_MODES[type]}
                enterKeyHint="done"
                spellCheck={type === 'text'}
                autoCapitalize={type === 'text' ? undefined : 'off'}
                autoComplete="off"
                aria-label={column.name}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? problemId : undefined}
                onChange={event => {
                  setDraft(event.target.value);
                  setRefused(false);
                }}
                onBlur={commitOnBlur}
                onKeyDown={onKeyDown}
              />
            )}
          </div>
          {problem ? (
            <p id={problemId} className={styles.cellProblem} role="alert">
              <Icon name="alert" size={14} />
              <span>{problem}</span>
            </p>
          ) : null}
        </>
      ) : (
        <>
          {/* The value as its type reads it; the button under it fills the whole cell, so a press anywhere in it opens it. */}
          <span className={styles.cellShow}>
            <CellView column={column} value={value} />
          </span>
          <button
            ref={cell}
            type="button"
            className={styles.cellButton}
            aria-label={misfit ? t('{name} : {value} ({problem})', { name: column.name, value: cellText(value, column) || t('vide'), problem: misfit }) : t('{name} : {value}', { name: column.name, value: cellText(value, column) || t('vide') })}
            data-tip={misfit ?? undefined}
            onClick={begin}
            onKeyDown={event => {
              // A key typed on a cell writes in it, as in a spreadsheet: the app's one-key shortcuts never fire from a table.
              if (readOnly || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 || event.key === ' ') return;
              event.preventDefault();
              if (type === 'text' || type === 'number' || type === 'url' || type === 'email' || type === 'phone') open(event.key);
              else begin();
            }}
            disabled={readOnly && !href}
          />
        </>
      )}
      {href && !editing ? (
        <a className={styles.cellOpen} href={href} target="_blank" rel="noopener noreferrer" aria-label={t('Ouvrir {title}', { title: cellText(value, column) })} data-tip={t('Ouvrir')}>
          <Icon name="external" size={14} />
        </a>
      ) : null}
      {type === 'select' || type === 'multi' ? (
        <Popover open={editing} anchor={cell} onDismiss={() => setEditing(false)} label={column.name} width={260} align="start">
          <OptionsPicker
            page={page}
            table={table}
            column={column}
            value={value}
            multi={type === 'multi'}
            onDone={next => {
              write(next);
              if (type === 'select') setEditing(false);
            }}
          />
        </Popover>
      ) : null}
    </td>
  );
});

const Row = memo(function Row({ page, table, id, columns }: { page: string; table: string; id: string; columns: readonly TableColumn[] }) {
  const { readOnly } = usePageContext();
  const row = useLibraryStore(s => s.blocks[id]);
  if (!row) return null;
  return (
    <tr className={styles.tableRow}>
      {columns.map(column => (
        <Cell key={column.id} page={page} table={table} rowId={id} column={column} value={row.cells[column.id]} />
      ))}
      <td className={styles.rowEnd}>
        {readOnly ? null : (
          <button type="button" className={styles.rowDelete} aria-label={t('Supprimer la ligne')} data-tip={t('Supprimer la ligne')} onClick={() => deleteBlocks(page, [id])}>
            <Icon name="close" size={14} />
          </button>
        )}
      </td>
    </tr>
  );
});

/** A select's choices, as the column's settings edit them: renamed, recoloured, removed, added. */
function OptionsEditor({ page, table, column }: { page: string; table: string; column: TableColumn }) {
  const options = column.options ?? [];
  const [painting, setPainting] = useState<string | null>(null);
  const swatch = useRef<HTMLButtonElement | null>(null);
  const save = (next: readonly SelectOption[]): void => setColumnOptions(page, table, column.id, next);
  const painted = options.find(option => option.id === painting) ?? null;
  return (
    <div className={styles.optionsEditor}>
      <span className="t-meta-strong">{t('Options')}</span>
      {options.map(option => (
        <div key={option.id} className={styles.optionEdit}>
          <button
            type="button"
            className={styles.optionSwatch}
            data-line={option.color}
            aria-label={t('Couleur de {name}', { name: option.name })}
            onClick={event => {
              swatch.current = event.currentTarget;
              setPainting(option.id);
            }}
          />
          <input
            className={styles.optionName}
            defaultValue={option.name}
            aria-label={t('Nom de l’option')}
            onBlur={event => {
              const name = event.target.value.trim().slice(0, 100);
              if (name && name !== option.name) save(options.map(other => (other.id === option.id ? { ...other, name } : other)));
            }}
          />
          <button type="button" className={styles.optionRemove} aria-label={t('Supprimer l’option {name}', { name: option.name })} onClick={() => save(options.filter(other => other.id !== option.id))}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
      <button type="button" className={styles.optionAdd} onClick={() => save([...options, { id: createId(), name: `Option ${options.length + 1}`, color: LINE_COLORS[options.length % LINE_COLORS.length]! }])}>
        <Icon name="plus" size={16} />
        {t('Ajouter une option')}
      </button>
      <Popover open={painted !== null} anchor={swatch} onDismiss={() => setPainting(null)} label={t('Couleur de l’option')} width={300} align="start">
        <div className={styles.colorPopover}>
          <LineColorPicker
            label={t('Couleur de l’option')}
            value={painted?.color ?? null}
            onChange={(color: LineColor | null) => {
              if (painted && color) save(options.map(other => (other.id === painted.id ? { ...other, color } : other)));
              setPainting(null);
            }}
          />
        </div>
      </Popover>
    </div>
  );
}

/** A column's head: its type's glyph and name; pressed, its settings. Its right edge widens it. */
function ColumnHead({ page, table, column, index, count }: { page: string; table: string; column: TableColumn; index: number; count: number }) {
  const { readOnly } = usePageContext();
  const [open, setOpen] = useState(false);
  const head = useRef<HTMLButtonElement>(null);
  const type = columnType(column);
  const width = widthOf(column);

  const resize = (event: ReactPointerEvent<HTMLSpanElement>): void => {
    if (readOnly || event.button !== 0) return;
    event.preventDefault();
    const start = event.clientX;
    const cell = event.currentTarget.parentElement as HTMLElement;
    let next = width;
    const move = (moved: PointerEvent): void => {
      next = Math.round(Math.max(80, Math.min(800, width + moved.clientX - start)));
      cell.style.width = `${next}px`;
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (next !== width) updateColumn(page, table, column.id, { width: next });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <th className={styles.headCell} style={{ width } as CSSProperties} scope="col">
      <button ref={head} type="button" className={styles.headButton} aria-haspopup="dialog" aria-expanded={open} disabled={readOnly} onClick={() => setOpen(true)}>
        <Icon name={COLUMN_ICONS[type]} size={16} />
        <span className={styles.headName}>{column.name}</span>
        {type === 'number' && column.unit ? <span className={styles.headUnit}>{column.unit}</span> : null}
      </button>
      {readOnly ? null : <span className={styles.resize} role="separator" aria-orientation="vertical" aria-label={t('Largeur de {name}', { name: column.name })} onPointerDown={resize} />}
      <Popover open={open} anchor={head} onDismiss={() => setOpen(false)} label={t('Colonne {name}', { name: column.name })} width={300} align="start">
        <div className={styles.columnPanel}>
          <input
            className={styles.pickerField}
            defaultValue={column.name}
            aria-label={t('Nom de la colonne')}
            data-autofocus=""
            maxLength={200}
            onBlur={event => {
              const name = event.target.value.trim();
              if (name && name !== column.name) updateColumn(page, table, column.id, { name });
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
          <span className="t-meta-strong">{t('Type')}</span>
          <div className={styles.typeList} role="radiogroup" aria-label={t('Type de la colonne')}>
            {COLUMN_TYPES.map(choice => (
              <button key={choice} type="button" role="radio" aria-checked={choice === type} className={styles.typeChoice} onClick={() => changeColumnType(page, table, column.id, choice)}>
                <Icon name={COLUMN_ICONS[choice]} size={18} />
                {COLUMN_TYPE_NAMES[choice]}
                {choice === type ? <Icon name="check" size={16} /> : null}
              </button>
            ))}
          </div>
          {type === 'number' ? (
            <label className={styles.unitField}>
              <span className="t-meta-strong">{t('Unité')}</span>
              <input
                className={styles.pickerField}
                defaultValue={column.unit ?? ''}
                placeholder="€, kg, %, min…"
                maxLength={20}
                onBlur={event => {
                  const unit = event.target.value.trim();
                  if (unit !== (column.unit ?? '')) updateColumn(page, table, column.id, { unit: unit || undefined });
                }}
              />
            </label>
          ) : null}
          {type === 'select' || type === 'multi' ? <OptionsEditor page={page} table={table} column={column} /> : null}
          <div className={styles.columnActions}>
            <button
              type="button"
              className={styles.typeChoice}
              onClick={() => {
                setOpen(false);
                addColumn(page, table, column.id, 'text');
              }}
            >
              <Icon name="plus" size={18} />
              {t('Insérer une colonne à droite')}
            </button>
            {index > 0 ? (
              <button type="button" className={styles.typeChoice} onClick={() => moveColumn(page, table, column.id, index - 1)}>
                <Icon name="back" size={18} />
                {t('Déplacer à gauche')}
              </button>
            ) : null}
            {index < count - 1 ? (
              <button type="button" className={styles.typeChoice} onClick={() => moveColumn(page, table, column.id, index + 1)}>
                <Icon name="arrowRight" size={18} />
                {t('Déplacer à droite')}
              </button>
            ) : null}
            {count > 1 ? (
              <button
                type="button"
                className={`${styles.typeChoice} ${styles.danger}`}
                onClick={() => {
                  setOpen(false);
                  deleteColumn(page, table, column.id);
                }}
              >
                <Icon name="trash" size={18} />
                {t('Supprimer la colonne')}
              </button>
            ) : null}
          </div>
        </div>
      </Popover>
    </th>
  );
}

/** The last cell of each row: the « + » of the head, a row's ×. */
const END_WIDTH = 36;

/** Marks the sides a sideways-scrolling table hides columns behind, which fade there. */
export function useHiddenSides(wrap: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    const update = (): void => {
      const hidden = node.scrollWidth - node.clientWidth;
      node.toggleAttribute('data-more-left', hidden > 1 && node.scrollLeft > 1);
      node.toggleAttribute('data-more-right', hidden > 1 && node.scrollLeft < hidden - 1);
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    if (node.firstElementChild) observer?.observe(node.firstElementChild);
    return () => {
      node.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [wrap]);
}

function TableBlockComponent({ block }: { block: Block }) {
  const { page, readOnly } = usePageContext();
  const rows = useLibraryStore(s => s.blocksByParent[block.id]) ?? NO_ROWS;
  const columns = block.columns;
  const wrap = useRef<HTMLDivElement>(null);
  useHiddenSides(wrap);
  // Its columns as wide as they were set: wider than the page, the table scrolls sideways.
  const width = columns.reduce((sum, column) => sum + widthOf(column), END_WIDTH);
  return (
    <div ref={wrap} className={styles.tableWrap} contentEditable={false}>
      <table className={styles.table} style={{ width }}>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <ColumnHead key={column.id} page={page} table={block.id} column={column} index={index} count={columns.length} />
            ))}
            <th className={styles.rowEnd}>
              {readOnly ? null : (
                <button type="button" className={styles.addColumn} aria-label={t('Ajouter une colonne')} data-tip={t('Ajouter une colonne')} onClick={() => addColumn(page, block.id)}>
                  <Icon name="plus" size={16} />
                </button>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(id => (
            <Row key={id} page={page} table={block.id} id={id} columns={columns} />
          ))}
        </tbody>
      </table>
      {readOnly ? null : (
        <button type="button" className={styles.addRow} onClick={() => addRow(page, block.id)}>
          <Icon name="plus" size={16} />
          {t('Nouvelle ligne')}
        </button>
      )}
    </div>
  );
}

export const TableBlock = memo(TableBlockComponent);
