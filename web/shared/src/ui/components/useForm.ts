/**
 * A form's checks, shown when `core/services/formChecks` says (reward early, punish late): the form
 * computes each field's problem every render, as a translated sentence or null, and this hook says it
 * under the field at the right moment, sends the focus to the first one when the form is sent, keeps
 * the save from running twice, and holds what the save itself refused (the server's word on a field,
 * or on the whole form).
 *
 *   const form = useForm({ title: titleProblem(title), url: urlProblem(url) });
 *   <form onSubmit={form.onSubmit(save)} noValidate>
 *     <TextField label={titleLabel} value={title} onChange={setTitle} field={form.field('title')} />
 *     <FormMessage form={form} />
 *     <Button type="submit" busy={form.busy}>{saveLabel}</Button>
 *
 * Hand a binding to a control whole (`field={form.field('title')}`): reading its parts in the
 * screen's own JSX (`ref={binding.register}`, `binding.error`) trips the React Compiler's rule on
 * refs read during render; a control that attaches through its own `useCallback` is fine.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { firstProblem, isBlank, liveAfter } from '@unlease/core/services/formChecks';

/** What a control needs from its form: its problem when shown, and the moments that change it. */
export interface FieldBinding {
  readonly name: string;
  readonly error: string | null;
  /** The element that takes the focus when this field holds the first problem. */
  readonly register: (element: HTMLElement | null) => void;
  /** Its value changed. */
  readonly edited: () => void;
  /** It lost the focus, holding `value`. */
  readonly left: (value: string) => void;
}

/** What a save says: nothing or true when it went through, false when it did not (it said why, `fail`). */
export type SaveOutcome = void | boolean;

export interface Form<K extends string> {
  field(name: K): FieldBinding;
  /** The problem a field shows now (a control that takes `error` rather than `field`). */
  error(name: K): string | null;
  /** Checks every field: with problems, shows them all and focuses the first; else runs `save`, busy meanwhile. Resolves whether it saved. */
  submit(save: () => SaveOutcome | Promise<SaveOutcome>): Promise<boolean>;
  /** `submit` for a `<form>`'s `onSubmit`. */
  onSubmit(save: () => SaveOutcome | Promise<SaveOutcome>): (event: FormEvent) => void;
  /** What the save found wrong: on a field (shown until it is edited, and focused), or on the whole form (`null`). */
  fail(name: K | null, message: string): void;
  /** The save is running. */
  readonly busy: boolean;
  /** The whole form's problem from its save, or how many fields to correct once sent. */
  readonly message: string | null;
  /** How many fields show a problem after a send. */
  readonly problems: number;
  /** Back to a fresh form: nothing live, nothing sent, nothing refused. */
  reset(): void;
}

const reduceMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Takes the focus without the browser's jump, then brings it into view, centred. */
export function focusField(element: HTMLElement): void {
  element.focus({ preventScroll: true });
  element.scrollIntoView?.({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
}

export function useForm<K extends string>(checks: { readonly [F in K]?: string | null }): Form<K> {
  const [live, setLive] = useState<ReadonlySet<string>>(() => new Set());
  const [sent, setSent] = useState(false);
  const [refused, setRefused] = useState<Readonly<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const elements = useRef(new Map<string, HTMLElement>());
  const running = useRef(false);

  const names = Object.keys(checks) as K[];
  const shownOf = (name: string): string | null => refused[name] ?? (live.has(name) ? ((checks as Record<string, string | null | undefined>)[name] ?? null) : null);

  // What each field showed at the last render, and the latest state, for the moments that come between renders.
  const latest = useRef({ checks, live, sent, refused, shown: {} as Record<string, string | null> });
  useLayoutEffect(() => {
    const shown: Record<string, string | null> = {};
    for (const name of Object.keys(checks)) shown[name] = shownOf(name);
    for (const name of Object.keys(refused)) shown[name] = refused[name] ?? null;
    latest.current = { checks, live, sent, refused, shown };
  });

  const setLiveness = useCallback((name: string, on: boolean) => {
    setLive(current => {
      if (current.has(name) === on) return current;
      const next = new Set(current);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });
  }, []);

  const bindings = useRef(new Map<string, FieldBinding>());
  const bind = useCallback(
    (name: string): Omit<FieldBinding, 'error'> => {
      const known = bindings.current.get(name);
      if (known) return known;
      const binding: FieldBinding = {
        name,
        error: null,
        register: element => {
          if (element) elements.current.set(name, element);
          else elements.current.delete(name);
        },
        edited: () => {
          const now = latest.current;
          if (now.refused[name] !== undefined)
            setRefused(current => Object.fromEntries(Object.entries(current).filter(([field]) => field !== name)));
          setLiveness(name, liveAfter('edit', { live: now.live.has(name), showing: !!now.shown[name], empty: false, sent: now.sent }));
        },
        left: value => {
          const now = latest.current;
          setLiveness(name, liveAfter('leave', { live: now.live.has(name), showing: !!now.shown[name], empty: isBlank(value), sent: now.sent }));
        },
      };
      bindings.current.set(name, binding);
      return binding;
    },
    [setLiveness],
  );

  /** The registered fields in the page's order, then the others in the checks' order. */
  const inOrder = (candidates: readonly string[]): string[] => {
    const placed = candidates.filter(name => elements.current.has(name));
    placed.sort((a, b) => (elements.current.get(a)!.compareDocumentPosition(elements.current.get(b)!) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    return [...placed, ...candidates.filter(name => !elements.current.has(name))];
  };

  const focusFirst = (problems: Readonly<Record<string, string | null | undefined>>): void => {
    const first = firstProblem(inOrder(Object.keys(problems)), problems);
    const element = first ? elements.current.get(first) : undefined;
    if (element) focusField(element);
  };

  const submit = async (save: () => SaveOutcome | Promise<SaveOutcome>): Promise<boolean> => {
    if (running.current) return false;
    setSent(true);
    setFormError(null);
    setLive(new Set(names));
    // What the server refused last time is asked again: only the form's own checks hold the save back.
    setRefused({});
    const problems = checks as Record<string, string | null | undefined>;
    if (Object.values(problems).some(Boolean)) {
      focusFirst(problems);
      return false;
    }
    running.current = true;
    setBusy(true);
    try {
      const outcome = await save();
      return outcome !== false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const fail = (name: K | null, message: string): void => {
    if (name === null) {
      setFormError(message);
      return;
    }
    setRefused(current => ({ ...current, [name]: message }));
    const element = elements.current.get(name);
    if (element) focusField(element);
  };

  const reset = (): void => {
    setLive(new Set());
    setSent(false);
    setRefused({});
    setFormError(null);
  };

  const problems = sent ? names.filter(name => !!shownOf(name)).length + Object.keys(refused).filter(name => !names.includes(name as K)).length : 0;

  return {
    field: name => ({ ...bind(name), error: shownOf(name) }),
    error: name => shownOf(name),
    submit,
    onSubmit: save => event => {
      event.preventDefault();
      void submit(save);
    },
    fail,
    busy,
    message: formError,
    problems,
    reset,
  };
}

/** Whether what the form holds differs from what it started from (compared as JSON: plain values only). */
export function useDirty(initial: unknown, current: unknown): boolean {
  const start = useMemo(() => JSON.stringify(initial), [initial]);
  return JSON.stringify(current) !== start;
}
