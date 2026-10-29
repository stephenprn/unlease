/**
 * "Demander à Claude": a question about the link, answered from its page, and from the web when the
 * person ticks it (dearer). The answer can go at the end of the link's own note. Nothing is kept on
 * the server. The phone's `AskSheet`.
 */
import { useId, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { MODULE_NAMES } from '@unlease/notes/models/modules';
import { askSuggestions, moduleCost } from '@unlease/notes/services/modules';
import { ASK_LIMITS, type AskResponse } from '@unlease/notes/sync/ask';

import { addToLinkNote, askAbout } from '../../../app/modules';
import { useLibraryStore } from '../../../app/store/library';
import { selectServerSettings, useServerSettingsStore } from '../../../app/store/serverSettings';
import { showSnack, showWarning } from '../../../app/store/ui';
import { Button } from '../../components/Button';
import { SwitchMark } from '../../components/Checkbox';
import { DialogFrame } from '../../components/Dialog';
import { Layer } from '../../components/Layer';
import { TextField } from '../../components/TextField';
import { formatUsd } from '../../money';
import { ReadingTrack } from './ReadingTrack';
import styles from './links.module.css';

type Phase =
  | { readonly kind: 'form' }
  | { readonly kind: 'asking' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'ready'; readonly question: string; readonly answer: AskResponse };

export function AskDialog({ id, open, onDismiss }: { id: string; open: boolean; onDismiss: () => void }) {
  const titleId = useId();
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <AskBody id={id} titleId={titleId} onDismiss={onDismiss} />
    </Layer>
  );
}

const LIST_LINE = /^[-•]\s+/;

/** A paragraph's lines in runs: lines starting "- " together as one list, the others each a line of text. */
function runsOf(part: string): { readonly list: boolean; readonly lines: string[] }[] {
  const runs: { list: boolean; lines: string[] }[] = [];
  for (const line of part.split('\n')) {
    if (!line.trim()) continue;
    const list = LIST_LINE.test(line);
    const last = runs[runs.length - 1];
    if (last && last.list === list && list) last.lines.push(line.replace(LIST_LINE, ''));
    else runs.push({ list, lines: [list ? line.replace(LIST_LINE, '') : line] });
  }
  return runs;
}

/** An answer as Claude writes it: paragraphs, their lines kept, and lines starting "- " as a list (the phone's). */
function AnswerText({ text }: { text: string }) {
  return (
    <div className={styles.answerText}>
      {text.split(/\n\s*\n/).map((part, index) => (
        <div key={index} className={styles.answerPart}>
          {runsOf(part).map((run, at) =>
            run.list ? (
              <ul key={at} className={styles.answerList}>
                {run.lines.map((line, row) => (
                  <li key={row} className="t-body">
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p key={at} className="t-body">
                {run.lines[0]}
              </p>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

function AskBody({ id, titleId, onDismiss }: { id: string; titleId: string; onDismiss: () => void }) {
  const link = useLibraryStore(s => s.links[id]);
  const model = useServerSettingsStore(selectServerSettings)?.analysis.model ?? 'claude-opus-5-5';
  const [question, setQuestion] = useState('');
  const [web, setWeb] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [controller, setController] = useState<AbortController | null>(null);
  if (!link) return null;
  const asked = question.trim();

  const ask = (): void => {
    if (!asked) return;
    controller?.abort();
    const next = new AbortController();
    setController(next);
    setPhase({ kind: 'asking' });
    askAbout(id, asked, web, next.signal).then(
      answer => {
        if (!next.signal.aborted) setPhase({ kind: 'ready', question: asked, answer });
      },
      (error: unknown) => {
        if (!next.signal.aborted) setPhase({ kind: 'failed', reason: error instanceof Error ? error.message : t('erreur inconnue') });
      },
    );
  };
  const close = (): void => {
    controller?.abort();
    onDismiss();
  };
  const again = (): void => {
    setQuestion('');
    setPhase({ kind: 'form' });
  };

  if (phase.kind === 'form') {
    return (
      <DialogFrame
        title={MODULE_NAMES.ask}
        titleId={titleId}
        onClose={close}
        className={styles.couponsFrame}
        onSubmit={event => {
          event.preventDefault();
          ask();
        }}
        foot={
          <>
            <Button kind="text" onClick={close}>
              {t('Annuler')}
            </Button>
            <Button type="submit" icon="sparkle" disabled={!asked}>
              {t('Demander')}
            </Button>
          </>
        }
      >
        <TextField label={t('Votre question')} value={question} onChange={setQuestion} multiline autoFocus maxLength={ASK_LIMITS.question} placeholder={askSuggestions(link.kind)[0]} />
        <div className={styles.moduleBar} aria-label={t('Questions pour commencer')} role="group">
          {askSuggestions(link.kind).map(suggestion => (
            <Button key={suggestion} kind="text" small onClick={() => setQuestion(suggestion)}>
              {suggestion}
            </Button>
          ))}
        </div>
        <button type="button" role="switch" aria-checked={web} className={styles.choice} onClick={() => setWeb(value => !value)}>
          <span className={`${styles.choiceText} t-body`}>{t('Chercher aussi sur le web')}</span>
          <SwitchMark checked={web} />
        </button>
        <p className="t-meta">{moduleCost('ask', model, formatUsd)}</p>
      </DialogFrame>
    );
  }

  const body =
    phase.kind === 'asking' ? (
      <div className={styles.couponsWaiting} role="status">
        <ReadingTrack width={120} />
        <p className="t-body">{web ? t('Claude lit la page et cherche sur le web…') : t('Claude lit la page…')}</p>
      </div>
    ) : phase.kind === 'failed' ? (
      <p className={`${styles.couponsError} t-body`} role="alert">
        {t('Claude n’a pas pu répondre : {reason}', { reason: t(phase.reason) })}
      </p>
    ) : (
      <>
        <p className="t-meta-strong">{phase.question}</p>
        <AnswerText text={phase.answer.answer} />
        {phase.answer.sources.length > 0 ? (
          <section className={styles.couponTips} aria-labelledby={`${titleId}-sources`}>
            <h3 id={`${titleId}-sources`} className="t-section">
              {t('Sources')}
            </h3>
            <ul>
              {phase.answer.sources.map(source => (
                <li key={source.url} className="t-body">
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </>
    );
  const foot =
    phase.kind === 'asking' ? null : phase.kind === 'failed' ? (
      <>
        <Button kind="text" onClick={again}>
          {t('Autre question')}
        </Button>
        <Button onClick={ask}>{t('Réessayer')}</Button>
      </>
    ) : (
      <>
        <Button kind="text" onClick={again}>
          {t('Autre question')}
        </Button>
        <Button
          kind="tonal"
          icon="note"
          onClick={() => {
            if (!addToLinkNote(id, `${phase.question}\n${phase.answer.answer}`)) {
              showWarning(t('Votre note est trop longue pour y ajouter cette réponse.'));
              return;
            }
            showSnack(t('Ajouté à votre note'), undefined, { tone: 'success' });
            close();
          }}
        >
          {t('Ajouter à votre note')}
        </Button>
      </>
    );

  return (
    <DialogFrame title={MODULE_NAMES.ask} titleId={titleId} onClose={close} foot={foot} className={styles.couponsFrame}>
      {body}
    </DialogFrame>
  );
}
