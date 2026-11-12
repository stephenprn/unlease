/**
 * The pieces every app's import wizard is built from (`core/services/importFlow`): the frame (the
 * trail, the step's title and lead, its foot), the source's steps and drop zone, the counts, the
 * preview's list (filtered by fate, searched, a page at a time, an item left out by its box), the
 * choices, the progress and the report. Each app's wizard holds its own state and plan and lays
 * these out; the phone's `@shared/ui/features/importing` draws the same.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';
import {
  fateCounts,
  filterPreview,
  IMPORT_FATE_NAMES,
  IMPORT_STEP_NAMES,
  IMPORT_STEPS,
  IMPORT_WORDS,
  importProgress,
  PREVIEW_PAGE,
  previewEmptyWords,
  showMoreWords,
  shownOfWords,
  type ImportFate,
  type ImportStep,
  type PreviewEntry,
} from '@unlease/core/services/importFlow';
import type { GlyphName } from '@unlease/design/glyphs';

import { Button } from '../../components/Button';
import { Checkbox, SwitchMark } from '../../components/Checkbox';
import { EmptyLine } from '../../components/EmptyLine';
import { Icon } from '../../components/Icon';
import { OutlineEdge, OutlinedBox, useOutline } from '../../components/Outline';
import { StepTrail } from '../../components/StepTrail';
import { TextField } from '../../components/TextField';
import settings from '../settings/settings.module.css';
import styles from './importFlow.module.css';

// ── the frame ───────────────────────────────────────────────────────────────

export interface ImportFrameProps {
  readonly step: ImportStep;
  /** In the first run: no trail (the setup's is above), the step named in a line instead. */
  readonly embedded?: boolean;
  readonly title: string;
  readonly lead?: string;
  readonly children: ReactNode;
  /** The way back (text, at the start) and the way on (at the end). */
  readonly back?: ReactNode;
  readonly forward?: ReactNode;
}

/** A step of the wizard: where it stands, what it is, its sheets, its foot. The title takes the focus when the step changes. */
export function ImportFrame({ step, embedded = false, title, lead, children, back, forward }: ImportFrameProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    // The first step opens with the page; after it, the new step's title is where reading goes on.
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView?.({ block: 'nearest' });
  }, [step]);
  const index = IMPORT_STEPS.indexOf(step);
  return (
    <div className={styles.flow}>
      {embedded ? (
        <p className={`${styles.where} t-meta`}>{`${IMPORT_STEP_NAMES[step]} · ${importProgress(step)}`}</p>
      ) : (
        <StepTrail small steps={IMPORT_STEPS.map(id => ({ id, name: IMPORT_STEP_NAMES[id] }))} current={index} label={t('Étapes de l’import')} />
      )}
      <div className={styles.intro}>
        <h2 ref={heading} tabIndex={-1} className="t-title">
          {title}
        </h2>
        {lead ? <p className="t-body">{lead}</p> : null}
      </div>
      {children}
      {back || forward ? (
        <nav className={styles.foot} aria-label={t('Étapes de l’import')}>
          {back}
          {forward ? <span className={styles.footEnd}>{forward}</span> : null}
        </nav>
      ) : null}
    </div>
  );
}

/** A sheet of the wizard, titled or not (the settings' own). */
export function ImportSheet({ title, children, label }: { title?: string; children: ReactNode; label?: string }) {
  const titleId = useId();
  return (
    <section className={settings.section} aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : label}>
      {title ? (
        <h3 id={titleId} className={`${settings.sectionTitle} t-section`}>
          {title}
        </h3>
      ) : null}
      <OutlinedBox kind="panel" lift="card" className={settings.card}>
        {children}
      </OutlinedBox>
    </section>
  );
}

// ── the source ──────────────────────────────────────────────────────────────

/** How to get the file, step by step, each numbered on its small well. */
export function ImportInstructions({ steps }: { steps: readonly string[] }) {
  return (
    <ol className={settings.steps}>
      {steps.map((text, index) => (
        <li key={text} className={settings.step}>
          <span className={settings.stepNumber}>{index + 1}</span>
          <span className="t-body">{text}</span>
        </li>
      ))}
    </ol>
  );
}

export interface ImportDropProps {
  /** « Déposez l’archive Takeout (.zip) ». */
  readonly label: string;
  /** « ou cliquez pour la choisir ». */
  readonly meta: string;
  /** The input's `accept`. */
  readonly accept: string;
  readonly multiple?: boolean;
  /** Reading what was given: the zone says so and takes nothing more. */
  readonly reading?: boolean;
  readonly readingLabel?: string;
  /** The picker's name for screen readers. */
  readonly inputLabel: string;
  readonly onFiles: (files: readonly File[]) => void;
}

/** The dashed zone a file is dropped on or picked from. */
export function ImportDrop({ label, meta, accept, multiple = false, reading = false, readingLabel, inputLabel, onFiles }: ImportDropProps) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { ref, vars, d } = useOutline<HTMLButtonElement>('panel');
  const onDrop = (event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    setOver(false);
    if (!reading) onFiles([...event.dataTransfer.files]);
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={settings.drop}
        style={vars}
        data-over={over || undefined}
        onClick={() => input.current?.click()}
        onDragOver={event => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        disabled={reading}
        aria-busy={reading || undefined}
      >
        <Icon name="upload" size={28} />
        <span className="t-body-strong">{reading ? (readingLabel ?? t('Lecture du fichier…')) : label}</span>
        <span className="t-meta">{meta}</span>
        <OutlineEdge d={d} />
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        aria-label={inputLabel}
        onChange={event => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
    </>
  );
}

// ── counts ──────────────────────────────────────────────────────────────────

export interface CountLine {
  readonly icon: GlyphName;
  readonly text: string;
  readonly meta?: string | null;
}

/** What a file holds, a line each: its glyph, the count, what it means. */
export function ImportCounts({ lines }: { lines: readonly CountLine[] }) {
  return (
    <ul className={settings.counts}>
      {lines.map(line => (
        <li key={line.text} className={settings.count}>
          <Icon name={line.icon} size={22} />
          <span className={settings.rowText}>
            <span className="t-body tabular">{line.text}</span>
            {line.meta ? <span className="t-meta">{line.meta}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── the preview ─────────────────────────────────────────────────────────────

export interface PreviewChoice {
  /** The item comes in (its box ticked). */
  readonly isOn: (entry: PreviewEntry) => boolean;
  readonly toggle: (entry: PreviewEntry) => void;
  /** Whether it can be left out at all (one left out already by its fate cannot be brought in). */
  readonly can?: (entry: PreviewEntry) => boolean;
}

export interface ImportPreviewProps {
  readonly entries: readonly PreviewEntry[];
  /** Each item can be left out by its box. */
  readonly choice?: PreviewChoice;
  /** What an item shows under its words (a Keep list's lines without a link, and their choices). */
  readonly extra?: (entry: PreviewEntry) => ReactNode;
  /** The list's name, read out. */
  readonly label: string;
}

/** Every item with its fate: filtered by fate, searched by its words, a page at a time. */
export function ImportPreview({ entries, choice, extra, label }: ImportPreviewProps) {
  const [fate, setFate] = useState<ImportFate | null>(null);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PREVIEW_PAGE);
  const counts = fateCounts(entries);
  const found = filterPreview(entries, fate, query);
  const visible = found.slice(0, shown);
  const pick = (next: ImportFate | null): void => {
    setFate(next);
    setShown(PREVIEW_PAGE);
  };
  return (
    <ImportSheet label={label}>
      {counts.length > 1 ? (
        <div className={styles.filters} role="radiogroup" aria-label={t('Filtrer l’aperçu')}>
          <FilterChip checked={fate === null} label={IMPORT_WORDS.allFates} count={entries.length} onClick={() => pick(null)} />
          {counts.map(({ fate: each, count }) => (
            <FilterChip key={each} checked={fate === each} label={IMPORT_FATE_NAMES[each]} count={count} onClick={() => pick(each)} />
          ))}
        </div>
      ) : null}
      {entries.length > 8 ? (
        <div className={styles.search}>
          <TextField
            kind="search"
            ariaLabel={IMPORT_WORDS.search}
            placeholder={IMPORT_WORDS.search}
            value={query}
            onChange={value => {
              setQuery(value);
              setShown(PREVIEW_PAGE);
            }}
          />
        </div>
      ) : null}
      {visible.length === 0 ? (
        <div className={settings.block}>
          <EmptyLine size="body" glyph="search" text={previewEmptyWords(query)} replayKey={`${fate ?? ''}${query}`} />
        </div>
      ) : (
        <ul className={styles.list} aria-label={label}>
          {visible.map(entry => (
            <PreviewItem key={entry.key} entry={entry} choice={choice} extra={extra} />
          ))}
        </ul>
      )}
      {found.length > shown ? (
        <div className={styles.more}>
          <span className="t-meta tabular">{shownOfWords(shown, found.length)}</span>
          <Button kind="text" small onClick={() => setShown(count => count + PREVIEW_PAGE)}>
            {showMoreWords(shown, found.length)}
          </Button>
        </div>
      ) : null}
    </ImportSheet>
  );
}

function FilterChip({ checked, label, count, onClick }: { checked: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={checked} className={`${styles.filter} t-label`} onClick={onClick}>
      <span>{label}</span>
      <span className={`${styles.filterCount} tabular`}>{count}</span>
    </button>
  );
}

function PreviewItem({ entry, choice, extra }: { entry: PreviewEntry; choice?: PreviewChoice; extra?: (entry: PreviewEntry) => ReactNode }) {
  const can = choice ? (choice.can?.(entry) ?? true) : false;
  const on = choice ? choice.isOn(entry) : true;
  const more = extra?.(entry);
  return (
    <li className={styles.item} data-off={!on || undefined}>
      {choice && can ? (
        <span className={styles.itemBox}>
          <Checkbox checked={on} onToggle={() => choice.toggle(entry)} label={t('Importer {item}', { item: entry.title })} size={22} />
        </span>
      ) : (
        <Icon name={entry.glyph as GlyphName} size={22} />
      )}
      <span className={styles.itemText}>
        <span className="t-body">{entry.title}</span>
        {entry.detail ? <span className="t-meta">{entry.detail}</span> : null}
        {entry.why ? <span className="t-meta">{entry.why}</span> : null}
        {entry.note ? <span className={`${styles.itemNote} t-meta`}>{entry.note}</span> : null}
        {more ? <span className={styles.itemExtra}>{more}</span> : null}
      </span>
      <span className={`${styles.tag} t-label-small`} data-fate={on ? entry.fate : 'skip'}>
        {on ? IMPORT_FATE_NAMES[entry.fate] : IMPORT_FATE_NAMES.skip}
      </span>
    </li>
  );
}

// ── choices ─────────────────────────────────────────────────────────────────

/** A choice that is on or off: the row is the switch, its words what it does and what it costs. */
export function ChoiceSwitch({ title, meta, checked, onChange, children }: { title: string; meta?: ReactNode; checked: boolean; onChange: (checked: boolean) => void; children?: ReactNode }) {
  return (
    <>
      <button type="button" role="switch" aria-checked={checked} className={settings.row} onClick={() => onChange(!checked)}>
        <span className={settings.rowText}>
          <span className="t-body">{title}</span>
          {meta ? <span className="t-meta">{meta}</span> : null}
        </span>
        <SwitchMark checked={checked} />
      </button>
      {children}
    </>
  );
}

export interface ChoiceOption<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly meta?: string;
}

/** One of a few: a radio row each, the chosen one ticked, under the choice's name. */
export function ChoiceRadios<V extends string>({ title, meta, value, options, onChange }: { title: string; meta?: string; value: V; options: readonly ChoiceOption<V>[]; onChange: (value: V) => void }) {
  const titleId = useId();
  return (
    <div className={settings.block}>
      <div className={settings.rowText}>
        <p id={titleId} className="t-body-strong">
          {title}
        </p>
        {meta ? <p className="t-meta">{meta}</p> : null}
      </div>
      <div role="radiogroup" aria-labelledby={titleId} className={settings.choices}>
        {options.map(option => (
          <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className={settings.choice} onClick={() => onChange(option.value)}>
            <span className={settings.choiceMark} aria-hidden="true">
              {value === option.value ? <Icon name="check" size={20} /> : null}
            </span>
            <span className={settings.rowText}>
              <span className="t-body">{option.label}</span>
              {option.meta ? <span className="t-meta">{option.meta}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── progress and report ─────────────────────────────────────────────────────

/** What is being written, and how far along (null: not counted yet). */
export function ImportProgress({ label, done, total }: { label: string; done?: number; total?: number }) {
  const counted = done !== undefined && total !== undefined && total > 0;
  return (
    <ImportSheet label={label}>
      <div className={styles.progress} role="status" aria-live="polite">
        <span className="t-body tabular">{label}</span>
        <div className={styles.meter} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={counted ? total : undefined} aria-valuenow={counted ? done : undefined}>
          <span className={styles.meterFill} data-unknown={counted ? undefined : true} style={counted ? ({ width: `${Math.round((done / total) * 100)}%` } as CSSProperties) : undefined} />
        </div>
      </div>
    </ImportSheet>
  );
}

/** What came in, then what was left out and why; the app's actions under it. The step's title says it is done (`IMPORT_WORDS.doneTitle`, or the app's own words). */
export function ImportReport({ imported, skipped, children }: { imported: readonly string[]; skipped: readonly string[]; children?: ReactNode }) {
  return (
    <>
      <ImportSheet label={IMPORT_WORDS.doneTitle}>
        <div className={settings.block}>
          {imported.length > 0 ? (
            <ul className={settings.counts}>
              {imported.map(line => (
                <li key={line} className={`${settings.count} t-body`}>
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyLine size="body" text={IMPORT_WORDS.nothingNew} />
          )}
        </div>
      </ImportSheet>
      {skipped.length > 0 ? (
        <ImportSheet title={IMPORT_WORDS.skipped}>
          <ul className={`${settings.counts} ${settings.block}`}>
            {skipped.map(line => (
              <li key={line} className={`${settings.count} t-meta`}>
                {line}
              </li>
            ))}
          </ul>
        </ImportSheet>
      ) : null}
      {children}
    </>
  );
}
