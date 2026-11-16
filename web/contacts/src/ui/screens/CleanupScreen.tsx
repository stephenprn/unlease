/**
 * « Nettoyer les contacts » (Réglages › Données, as on the phone): its tools in a sheet, each with its
 * glyph and its state in a line (« 12 numéros sans indicatif », or « Rien à corriger »), the
 * duplicates first (their own page). A tool's page says what it does, then lists every change it
 * would make, as the import's preview does: the contact, its value as it is and what it becomes (the
 * part that changes marked), why; ticked when it is safe, unticked when only the person can tell
 * (« Ignorer » sets it aside on this browser), no box where nothing can be done here (« Modifier »
 * opens the contact's form). « Corriger » writes those ticked in one batch, the slip takes it back.
 */
import { Fragment, memo, useMemo, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import {
  asideKey,
  diffParts,
  CLEANUP_TOOL_WORDS,
  CLEANUP_TOOLS,
  CLEANUP_WORDS,
  cleanupDoneLine,
  cleanupStateLine,
  fixWords,
  isFixingTool,
  shownText,
  type CleanupFinding,
  type CleanupTool,
  type FixingTool,
  type Shown,
} from '@unlease/contacts/services/cleanup';
import { contactName } from '@unlease/contacts/services/names';

import { useCleanupCounts, useCleanups, useDuplicates } from '../../app/hooks/useContacts';
import { applyCleanup } from '../../app/store/actions';
import { useContactsStore } from '../../app/store/library';
import { cleanupRegion, setCleanupAside, usePrefsStore } from '../../app/store/prefs';
import { showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { Checkbox } from '@shared/ui/components/Checkbox';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { FormFoot } from '@shared/ui/components/FormFoot';
import { Icon } from '@shared/ui/components/Icon';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { Section } from '@shared/ui/features/settings/Section';
import settings from '@shared/ui/features/settings/settings.module.css';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { Link, navigate } from '@shared/ui/router';
import { useListMotion } from '@shared/ui/useListMotion';
import cleanup from '../cleanup.module.css';
import styles from '../contacts.module.css';
import { Avatar } from '../features/Avatar';
import { CodePicker } from '../features/CodePicker';
import { callingCountry } from '../features/callingCodes';
import { paths } from '../routes';
import { DuplicatesScreen } from './DuplicatesScreen';

/** Where a tool opens: the duplicates' own page, the others' under the place. */
const toolPath = (tool: CleanupTool): string => (tool === 'duplicates' ? paths.duplicates : paths.cleanupTool(tool));

/** The place: every tool, its state in a line. */
export function CleanupScreen() {
  const counts = useCleanupCounts();
  const duplicates = useDuplicates().length;
  const countOf = (tool: CleanupTool): number => (tool === 'duplicates' ? duplicates : counts[tool]);
  // With no country to read national numbers in, the country codes' tool can only ask for one.
  const noCountry = usePrefsStore(prefs => cleanupRegion(prefs) === null);
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      <div>
        <PageHead title={CLEANUP_WORDS.title} />
        <p className={`${styles.count} t-meta`}>{CLEANUP_WORDS.lead}</p>
      </div>
      <Section label={CLEANUP_WORDS.title}>
        {CLEANUP_TOOLS.map(tool => {
          const words = CLEANUP_TOOL_WORDS[tool];
          const count = countOf(tool);
          return (
            <button key={tool} type="button" className={settings.row} onClick={() => navigate(toolPath(tool))}>
              <Icon name={words.glyph} size={24} />
              <span className={settings.rowText}>
                <span className="t-body">{t(words.title)}</span>
                <span className={count > 0 ? `${cleanup.due} t-meta` : 't-meta'}>{tool === 'countryCodes' && noCountry ? CLEANUP_WORDS.regionMissing : cleanupStateLine(tool, count)}</span>
              </span>
              <Icon name="chevronRight" size={20} />
            </button>
          );
        })}
      </Section>
    </div>
  );
}

/** A value as it stands, or a sentence saying what stands there; beside the other value, what changes marked (what goes struck, what comes as a match). */
function Value({ shown, other, side }: { shown: Shown; other: Shown | null; side: 'before' | 'after' }) {
  if (typeof shown !== 'string') return <span className={cleanup.said}>{shownText(shown)}</span>;
  const className = side === 'before' ? cleanup.before : cleanup.after;
  if (typeof other !== 'string') return <span className={className}>{shown}</span>;
  return (
    <span className={className}>
      {diffParts(other, shown).map((part, index) => (
        <Fragment key={index}>{!part.changed ? part.text : side === 'after' ? <mark>{part.text}</mark> : <span className={cleanup.gone}>{part.text}</span>}</Fragment>
      ))}
    </span>
  );
}

const FindingRow = memo(function FindingRow({ finding, ticked, onToggle }: { finding: CleanupFinding; ticked: boolean; onToggle: (key: string) => void }) {
  const contact = useContactsStore(s => s.contacts[finding.contactId]);
  if (!contact) return null;
  const name = contactName(contact);
  const fixable = finding.edit !== null;
  const sameAsName = typeof finding.before === 'string' && finding.before.trim() === name;
  return (
    <li className={cleanup.finding} data-motion={finding.key} data-off={(fixable && !ticked) || undefined}>
      <span className={cleanup.box}>{fixable ? <Checkbox checked={ticked} onToggle={() => onToggle(finding.key)} label={t('Fix {name}', { name })} /> : <Icon name="alert" size={22} />}</span>
      <Avatar contact={contact} size={40} />
      <span className={cleanup.text}>
        <Link to={paths.contact(contact.id)} className={`${cleanup.name} t-body-strong`}>
          {name}
        </Link>
        <span className={`${cleanup.change} t-body`}>
          {/* A name as it is is the row's own name, above: only what it becomes follows. */}
          {sameAsName ? null : <Value shown={finding.before} other={finding.after} side="before" />}
          {finding.after !== null ? (
            <>
              <Icon name="arrowRight" size={18} className={cleanup.arrow} />
              <Value shown={finding.after} other={finding.before} side="after" />
            </>
          ) : null}
        </span>
        {finding.why ? <span className="t-meta">{t(finding.why.key, finding.why.params)}</span> : null}
      </span>
      {/* What only the person can tell is set aside here; what cannot be fixed here opens the contact. */}
      {!fixable ? (
        <Button kind="text" small onClick={() => navigate(paths.edit(contact.id))}>
          {t('Edit')}
        </Button>
      ) : !finding.ticked ? (
        <Button kind="text" small onClick={() => setCleanupAside(asideKey(finding))}>
          {CLEANUP_WORDS.ignore}
        </Button>
      ) : null}
    </li>
  );
});

/** The country national numbers are read in: the « Indicatif par défaut », changed here for this page alone. */
function RegionRow({ region, fallback, onChange }: { region: string | null; fallback: string | null; onChange: (region: string | null) => void }) {
  return (
    <div className={cleanup.region}>
      <span className={cleanup.regionText}>
        <span className="t-meta-strong">{CLEANUP_WORDS.regionLabel}</span>
        <span className="t-meta">{region ? callingCountry(region) : CLEANUP_WORDS.regionNone}</span>
      </span>
      <CodePicker region={region} fallback={fallback} onChange={onChange} label={CLEANUP_WORDS.regionLabel} />
    </div>
  );
}

function ToolPage({ tool }: { tool: FixingTool }) {
  const fallback = usePrefsStore(cleanupRegion);
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const region = picked === undefined ? fallback : picked;
  const findings = useCleanups(tool, region);
  // The person's own ticks over each finding's default.
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const isTicked = (finding: CleanupFinding): boolean => finding.edit !== null && finding.ticked !== flipped.has(finding.key);
  const fixable = useMemo(() => findings.filter(finding => finding.edit !== null), [findings]);
  const chosen = fixable.filter(isTicked);
  const all = chosen.length === fixable.length;
  const list = useRef<HTMLUListElement>(null);
  useListMotion(list, { late: true, scene: region });
  const words = CLEANUP_TOOL_WORDS[tool];

  const toggle = (key: string): void =>
    setFlipped(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const tickAll = (on: boolean): void => setFlipped(new Set(fixable.filter(finding => finding.ticked !== on).map(finding => finding.key)));
  const fix = (): void => {
    const { count, undo } = applyCleanup(tool, region, new Set(chosen.map(finding => finding.key)));
    if (count > 0) showUndo(cleanupDoneLine(tool, count), undo);
    setFlipped(new Set());
  };

  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      <div>
        <PageHead title={t(words.title)} />
        <p className={`${styles.count} t-meta`}>{t(words.lead)}</p>
      </div>
      {tool === 'countryCodes' ? <RegionRow region={region} fallback={fallback} onChange={setPicked} /> : null}
      {findings.length === 0 ? (
        <EmptyState scene="label" title={tool === 'countryCodes' && !region ? CLEANUP_WORDS.regionMissing : CLEANUP_WORDS.allFine} text={tool === 'countryCodes' && !region ? CLEANUP_WORDS.regionNone : t(words.empty)} />
      ) : (
        <>
          {fixable.length > 0 ? (
            <div className={cleanup.bar}>
              <span className="t-meta-strong">{t('{chosen} of {total} selected', { chosen: chosen.length, total: fixable.length })}</span>
              <Button kind="text" small onClick={() => tickAll(!all)}>
                {all ? CLEANUP_WORDS.selectNone : CLEANUP_WORDS.selectAll}
              </Button>
            </div>
          ) : null}
          <OutlinedBox kind="panel" lift="card" className={`${cleanup.panel} paper`}>
            <ul ref={list} className={cleanup.findings}>
              {findings.map(finding => (
                <FindingRow key={finding.key} finding={finding} ticked={isTicked(finding)} onToggle={toggle} />
              ))}
            </ul>
          </OutlinedBox>
          {fixable.length > 0 ? (
            <FormFoot>
              <Button icon="check" disabled={chosen.length === 0} onClick={fix}>
                {fixWords(chosen.length)}
              </Button>
            </FormFoot>
          ) : null}
        </>
      )}
    </div>
  );
}

/** A tool's page (the duplicates' is their own); an address naming no tool shows the place. */
export function CleanupToolScreen({ tool }: { tool: string }) {
  if (tool === 'duplicates') return <DuplicatesScreen />;
  return isFixingTool(tool) ? <ToolPage key={tool} tool={tool} /> : <CleanupScreen />;
}
