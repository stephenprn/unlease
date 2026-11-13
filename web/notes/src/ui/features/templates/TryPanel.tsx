/**
 * « Aperçu sur un lien »: the facts as they stand, unsaved, noted by Claude on one link (one of those
 * they are for, or an address pasted), each listed with what Claude put in it (a dash where it found
 * nothing), then how long it took and what it cost. Nothing is written. Without Claude it says so and
 * offers nothing; offline, it waits with the sync's own words.
 */
import { useEffect, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { formatNumber, formatUsd } from '@unlease/core/services/format';
import { extractUrls } from '@unlease/core/services/url';
import type { LinkItem } from '@unlease/notes/models/entities';
import type { TemplateField } from '@unlease/notes/models/templates';
import { linkRowText } from '@unlease/notes/services/linkRow';
import type { TemplateTryResponse } from '@unlease/notes/sync/templateTry';

import { tryFields } from '../../../app/templates';
import { useServerFeature } from '@shared/app/store/serverSettings';
import { selectSyncMessage, selectSyncPhase, useSyncStore } from '@shared/app/store/syncStatus';
import { Button } from '@shared/ui/components/Button';
import { Icon } from '@shared/ui/components/Icon';
import { useOutline } from '@shared/ui/components/Outline';
import { SelectField } from '@shared/ui/components/SelectField';
import { TextField } from '@shared/ui/components/TextField';
import links from '../links/links.module.css';
import styles from './templates.module.css';

/** The picker's choice for an address typed rather than a link. */
const PASTE = 'paste';

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'read'; readonly fields: readonly TemplateField[]; readonly answer: TemplateTryResponse; readonly seconds: number };

export interface TryPanelProps {
  /** The fields as the editor holds them. */
  readonly fields: readonly TemplateField[];
  /** The links offered first: those this template reads, newest first. */
  readonly links: readonly LinkItem[];
}

export function TryPanel({ fields, links }: TryPanelProps) {
  const reading = useServerFeature('claude');
  const phase = useSyncStore(selectSyncPhase);
  const syncMessage = useSyncStore(selectSyncMessage);
  const [choice, setChoice] = useState<string>(() => links[0]?.id ?? PASTE);
  const [typed, setTyped] = useState('');
  const [state, setState] = useState<Phase>({ kind: 'idle' });
  const [problem, setProblem] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  if (!reading) {
    return <p className={`${styles.try} t-meta`}>{t('Claude is not set up: trying is not possible.')}</p>;
  }

  // A link gone meanwhile (deleted, moved out) leaves the address field.
  const link = choice === PASTE ? null : (links.find(each => each.id === choice) ?? null);
  const pasting = link === null;
  const named = fields.filter(field => field.name.trim() !== '');
  const offline = phase === 'offline';
  const busy = state.kind === 'reading';
  const nothing = named.length === 0 || (pasting && typed.trim() === '');

  const run = (): void => {
    if (busy || offline || nothing) return;
    const url = link ? link.url : extractUrls(typed)[0];
    if (!url) {
      setProblem(t('No link here: paste an address, like https://example.org/page.'));
      return;
    }
    setProblem(null);
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    const asked = named.map(field => ({ ...field, name: field.name.trim(), hint: field.hint.trim() }));
    const started = performance.now();
    setState({ kind: 'reading' });
    tryFields(url, asked, next.signal).then(
      answer => {
        if (!next.signal.aborted) setState({ kind: 'read', fields: asked, answer, seconds: (performance.now() - started) / 1000 });
      },
      (error: unknown) => {
        if (!next.signal.aborted) setState({ kind: 'failed', reason: error instanceof Error ? error.message : t('unknown error') });
      },
    );
  };

  const options = [
    ...links.map(each => ({ value: each.id, label: linkRowText(each).title })),
    { value: PASTE, label: t('Paste an address') },
  ];

  return (
    <div className={styles.try}>
      <p className="t-meta">{t('See what Claude would note, without saving anything.')}</p>
      {links.length > 0 ? <SelectField label={t('Link')} value={link ? link.id : PASTE} options={options} icon={link ? 'link' : 'copy'} onChange={setChoice} /> : null}
      {pasting ? (
        <TextField
          label={links.length > 0 ? undefined : t('Address')}
          ariaLabel={t('Address to try')}
          kind="url"
          value={typed}
          placeholder="https://…"
          error={problem}
          onChange={value => {
            setTyped(value);
            setProblem(null);
          }}
          onKeyDown={event => {
            // The editor's own Enter saves the template: here it tries.
            if (event.key === 'Enter') {
              event.preventDefault();
              run();
            }
          }}
        />
      ) : null}
      <div className={styles.tryAction}>
        <Button kind="tonal" icon="sparkle" busy={busy} disabled={!busy && (offline || nothing)} onClick={run}>
          {t('Try')}
        </Button>
        {offline ? <span className={`${styles.tryOffline} t-meta`}>{syncMessage ?? t('Offline')}</span> : null}
      </div>
      {state.kind === 'failed' ? (
        <p className={`${styles.tryProblem} t-meta`} role="alert">
          <Icon name="error" size={16} />
          <span>{state.reason}</span>
        </p>
      ) : null}
      {state.kind === 'read' ? <TryResult fields={state.fields} answer={state.answer} seconds={state.seconds} /> : null}
    </div>
  );
}

/** What Claude read: the page's title, every field with its value (a dash for none), the time and the cost. */
function TryResult({ fields, answer, seconds }: { fields: readonly TemplateField[]; answer: TemplateTryResponse; seconds: number }) {
  // The link page's facts' well, in its own outline.
  const { ref, vars } = useOutline<HTMLDListElement>('panel');
  return (
    <div className={styles.result} role="status">
      {answer.title ? <p className={`${styles.resultTitle} t-body-strong`}>{answer.title}</p> : null}
      <dl ref={ref} className={`${links.factsWell} paper`} style={vars}>
        {fields.map(field => {
          const value = answer.values[field.id];
          return (
            <div key={field.id} className={links.fact}>
              <dt className="t-meta">{field.name}</dt>
              {value ? (
                <dd className="t-body">{value}</dd>
              ) : (
                <dd className={`${styles.none} t-body`} aria-label={t('Nothing found')}>
                  —
                </dd>
              )}
            </div>
          );
        })}
      </dl>
      <p className={`${styles.resultMeta} t-meta`}>{t('Read in {seconds} s · {cost}', { seconds: formatNumber(Math.max(0.1, seconds), 1), cost: formatUsd(answer.costUsd) })}</p>
    </div>
  );
}
