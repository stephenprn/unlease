/**
 * A code block: its source typed in a plain field laid over the same text coloured in its language
 * (the field's own letters are transparent, its caret and selection show), so typing is the
 * browser's own and the colours follow. Saved as typed text, like any block's. Its language is
 * picked from the bar on top, where « Copier » copies the code.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { CODE_LANGUAGES, codeLanguage } from '@unlease/notes/services/code';
import { foldText } from '@unlease/core/services/search';
import type { Block } from '@unlease/notes/models/blocks';

import { useLibraryStore } from '../../../app/store/library';
import { insertAfter, saveBlockText, turnInto, updateBlock } from '../../../app/store/pages';
import { showError, showSnack } from '../../../app/store/ui';
import { onBeforePause } from '../../../app/sync/loop';
import { Icon } from '../../components/Icon';
import { Popover } from '../../components/Popover';
import { historyKey, isMod } from './editing';
import { applyPendingFocus, editableOutline, editorRoot, focusBlock, neighbour, registerFlusher, registerFocuser, selectBlocks, type FocusAt } from './editorStore';
import { highlightHtml, useHighlighter } from './highlight';
import { usePageContext } from './PageContext';
import styles from './pages.module.css';

const SAVE_DELAY_MS = 350;
const INDENT = '  ';

function LanguagePicker({ value, disabled, onPick }: { value: string; disabled: boolean; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const button = useRef<HTMLButtonElement>(null);
  const found = useMemo(() => {
    const wanted = foldText(query.trim());
    return CODE_LANGUAGES.filter(language => !wanted || foldText(`${language.name} ${language.key} ${language.aliases.join(' ')}`).includes(wanted));
  }, [query]);
  return (
    <>
      <button ref={button} type="button" className={styles.codeLanguage} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(true)}>
        {codeLanguage(value).name}
        {disabled ? null : <Icon name="chevronDown" size={14} />}
      </button>
      <Popover open={open} anchor={button} onDismiss={() => setOpen(false)} label={t('Langage')} width={240} align="start">
        <div className={styles.languagePanel}>
          <input
            className={styles.pickerField}
            value={query}
            placeholder={t('Chercher un langage')}
            aria-label={t('Chercher un langage')}
            data-autofocus=""
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key !== 'Enter' || !found[0]) return;
              event.preventDefault();
              setOpen(false);
              setQuery('');
              onPick(found[0].key);
            }}
          />
          <div className={styles.languageList} role="listbox" aria-label={t('Langages')}>
            {found.map(language => (
              <button
                key={language.key}
                type="button"
                role="option"
                aria-selected={language.key === value}
                className={styles.languageChoice}
                onClick={() => {
                  setOpen(false);
                  setQuery('');
                  onPick(language.key);
                }}
              >
                {language.name}
                {language.key === value ? <Icon name="check" size={16} /> : null}
              </button>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}

function CodeBlockComponent({ block }: { block: Block }) {
  const { page, readOnly } = usePageContext();
  const field = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const since = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ready = useHighlighter();
  const text = draft ?? block.text;
  const language = block.language || 'plain';
  // Plain until the grammars are here, coloured once they are.
  const html = useMemo(() => highlightHtml(text, ready ? language : 'plain'), [text, language, ready]);

  const flush = useCallback((): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = field.current?.value;
    if (value === undefined || since.current === null) return;
    const from = since.current;
    since.current = null;
    saveBlockText(page, block.id, from, value, { after: { block: block.id, offset: field.current?.selectionEnd ?? 0 } });
    setDraft(null);
  }, [page, block.id]);

  const flushRef = useRef(flush);
  useLayoutEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => onBeforePause(() => flushRef.current()), []);
  // An undo saves what was typed here first, as it does a paragraph's.
  useEffect(() => registerFlusher(() => flushRef.current()), []);
  useEffect(() => () => flushRef.current(), []);

  // The caret comes here like into any block (arrows, a new block, an undo).
  useLayoutEffect(() => {
    const off = registerFocuser(block.id, (at: FocusAt) => {
      const node = field.current;
      if (!node) return;
      node.focus({ preventScroll: true });
      const end = node.value.length;
      const offset = typeof at === 'number' ? Math.min(at, end) : at === 'start' || (typeof at === 'object' && at.edge === 'top') ? 0 : end;
      node.setSelectionRange(offset, offset);
      node.scrollIntoView({ block: 'nearest' });
    });
    applyPendingFocus();
    return off;
  }, [block.id]);

  const edit = (value: string): void => {
    if (since.current === null) since.current = useLibraryStore.getState().blocks[block.id]?.text ?? '';
    setDraft(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
  };

  /** Replaces the selected lines' start: Tab indents them, Maj+Tab takes an indent off. */
  const indent = (node: HTMLTextAreaElement, out: boolean): void => {
    const { value, selectionStart, selectionEnd } = node;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    if (!out && selectionStart === selectionEnd) {
      document.execCommand('insertText', false, INDENT);
      return;
    }
    const lines = value.slice(lineStart, selectionEnd).split('\n');
    const changed = lines.map(line => (out ? line.replace(/^ {1,2}|^\t/, '') : INDENT + line)).join('\n');
    node.setSelectionRange(lineStart, selectionEnd);
    document.execCommand('insertText', false, changed);
    node.setSelectionRange(lineStart, lineStart + changed.length);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    const node = event.currentTarget;
    if (historyKey(event, page)) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      indent(node, event.shiftKey);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      flush();
      selectBlocks([block.id]);
      editorRoot()?.focus({ preventScroll: true });
      return;
    }
    if (isMod(event) && event.key === 'Enter') {
      // Out of the code, on in a new paragraph under it (Enter alone is a new line of code).
      event.preventDefault();
      flush();
      const id = insertAfter(page, block.id, { kind: 'text', text: '' });
      if (id) focusBlock(id, 'start');
      return;
    }
    const atStart = node.selectionStart === 0 && node.selectionEnd === 0;
    const atEnd = node.selectionStart === node.value.length && node.selectionEnd === node.value.length;
    if (event.key === 'Backspace' && atStart) {
      event.preventDefault();
      flush();
      if (node.value === '') {
        turnInto(page, [block.id], 'text');
        focusBlock(block.id, 'start');
      }
      return;
    }
    const firstLine = !node.value.slice(0, node.selectionStart).includes('\n');
    const lastLine = !node.value.slice(node.selectionEnd).includes('\n');
    if ((event.key === 'ArrowUp' && firstLine) || (event.key === 'ArrowLeft' && atStart)) {
      const previous = neighbour(editableOutline(), block.id, -1);
      if (!previous) return;
      event.preventDefault();
      flush();
      focusBlock(previous, 'end');
    } else if ((event.key === 'ArrowDown' && lastLine) || (event.key === 'ArrowRight' && atEnd)) {
      const next = neighbour(editableOutline(), block.id, 1);
      if (!next) return;
      event.preventDefault();
      flush();
      focusBlock(next, 'start');
    }
  };

  return (
    <div className={styles.code} data-outline="frame">
      <div className={styles.codeBar} contentEditable={false}>
        <LanguagePicker value={language} disabled={readOnly} onPick={key => updateBlock(page, block.id, { language: key })} />
        <button
          type="button"
          className={styles.codeCopy}
          onClick={() =>
            void navigator.clipboard?.writeText(text).then(
              () => showSnack(t('Code copié'), undefined, { tone: 'success' }),
              () => showError(t('Impossible de copier le code')),
            )
          }
        >
          <Icon name="copy" size={16} />
          {t('Copier')}
        </button>
      </div>
      <div className={styles.codeArea} data-caret-block={block.id}>
        {/* The coloured copy under the field; a last empty line needs its own room. */}
        <pre className={styles.codeShown} aria-hidden="true">
          <code dangerouslySetInnerHTML={{ __html: `${html}\n` }} />
        </pre>
        <textarea
          ref={field}
          className={styles.codeField}
          value={text}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label={t('Code {language}', { language: codeLanguage(language).name })}
          onChange={event => edit(event.target.value)}
          onBlur={flush}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}

export const CodeBlock = memo(CodeBlockComponent);
