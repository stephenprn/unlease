/**
 * A form's checks, shown when `core/services/formChecks` says (reward early, punish late), as on the
 * web (`web/shared/src/ui/components/useForm.ts`): the form computes each field's problem every render,
 * as a translated sentence or null; this hook says it under the field at the right moment, sends the
 * focus to the first one when the form is sent (Android scrolls the field into view), keeps the save
 * from running twice, and holds what the save itself refused.
 *
 * It also chains the fields: the keyboard's action on a one-line field says « Suivant » and moves on
 * to the next field of `order`, the keyboard staying up; the last says « OK » and closes it (or sends
 * the form, `sendOnDone`, as a one-field sheet does).
 *
 *   const form = useForm({ title: titleProblem(title) }, { order: ['title', 'place', 'notes'] });
 *   <TextField label={titleLabel} value={title} onChangeText={setTitle} field={form.field('title')} />
 *   <Button label={saveLabel} busy={form.busy} onPress={() => form.submit(save)} />
 */
import type React from 'react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, type TextInput } from 'react-native';

import { t } from '@unlease/core/i18n';
import { firstProblem, isBlank, liveAfter } from '@unlease/core/services/formChecks';

type Input = React.ComponentRef<typeof TextInput>;

/** What a field needs from its form: its problem when shown, the moments that change it, and its keyboard's action. */
export interface FieldBinding {
  readonly name: string;
  readonly error: string | null;
  readonly register: (input: Input | null, multiline?: boolean) => void;
  readonly edited: () => void;
  readonly left: (value: string) => void;
  readonly returnKeyType: 'next' | 'done';
  readonly submitBehavior: 'submit' | 'blurAndSubmit';
  readonly onSubmitEditing: () => void;
}

export type SaveOutcome = void | boolean;

export interface FormOptions<K extends string> {
  /** The fields typed in, in the screen's order: the keyboard's action goes down it. Defaults to the checks' order. */
  readonly order?: readonly K[];
  /** The last field's action sends the form (a sheet of one field or two). */
  readonly sendOnDone?: () => SaveOutcome | Promise<SaveOutcome>;
}

export interface Form<K extends string> {
  field(name: K): FieldBinding;
  /** The problem a field shows now (a control that takes `error` rather than `field`). */
  error(name: K): string | null;
  /** Checks every field: with problems, shows them all and focuses the first; else runs `save`, busy meanwhile. Resolves whether it saved. */
  submit(save: () => SaveOutcome | Promise<SaveOutcome>): Promise<boolean>;
  /** What the save found wrong: on a field (shown until it is edited, and focused), or on the whole form (`null`). */
  fail(name: K | null, message: string): void;
  readonly busy: boolean;
  /** The whole form's problem from its save, or how many fields to correct once sent. */
  readonly message: string | null;
  reset(): void;
}

export function useForm<K extends string>(checks: { readonly [F in K]?: string | null }, options: FormOptions<K> = {}): Form<K> {
  const [live, setLive] = useState<ReadonlySet<string>>(() => new Set());
  const [sent, setSent] = useState(false);
  const [refused, setRefused] = useState<Readonly<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputs = useRef(new Map<string, { input: Input; multiline: boolean }>());
  const running = useRef(false);

  const names = Object.keys(checks) as K[];
  const order: readonly string[] = options.order ?? names;
  const shownOf = (name: string): string | null => refused[name] ?? (live.has(name) ? ((checks as Record<string, string | null | undefined>)[name] ?? null) : null);

  const latest = useRef({ live, sent, refused, shown: {} as Record<string, string | null>, order, sendOnDone: options.sendOnDone });
  useLayoutEffect(() => {
    const shown: Record<string, string | null> = {};
    for (const name of [...Object.keys(checks), ...Object.keys(refused)]) shown[name] = shownOf(name);
    latest.current = { live, sent, refused, shown, order, sendOnDone: options.sendOnDone };
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

  const submitRef = useRef<(save: () => SaveOutcome | Promise<SaveOutcome>) => Promise<boolean>>(async () => false);

  const bindings = useRef(new Map<string, Omit<FieldBinding, 'error' | 'returnKeyType' | 'submitBehavior'>>());
  const bind = useCallback(
    (name: string) => {
      const known = bindings.current.get(name);
      if (known) return known;
      const binding = {
        name,
        register: (input: Input | null, multiline = false) => {
          if (input) inputs.current.set(name, { input, multiline });
          else inputs.current.delete(name);
        },
        edited: () => {
          const now = latest.current;
          if (now.refused[name] !== undefined)
            setRefused(current => Object.fromEntries(Object.entries(current).filter(([field]) => field !== name)));
          setLiveness(name, liveAfter('edit', { live: now.live.has(name), showing: !!now.shown[name], empty: false, sent: now.sent }));
        },
        left: (value: string) => {
          const now = latest.current;
          setLiveness(name, liveAfter('leave', { live: now.live.has(name), showing: !!now.shown[name], empty: isBlank(value), sent: now.sent }));
        },
        onSubmitEditing: () => {
          const now = latest.current;
          const at = now.order.indexOf(name);
          const next = now.order.slice(at + 1).find(other => inputs.current.has(other));
          if (at >= 0 && next) inputs.current.get(next)!.input.focus();
          else if (now.sendOnDone) void submitRef.current(now.sendOnDone);
        },
      };
      bindings.current.set(name, binding);
      return binding;
    },
    [setLiveness],
  );

  const focusFirst = (problems: Readonly<Record<string, string | null | undefined>>): void => {
    const all = [...order, ...Object.keys(problems).filter(name => !order.includes(name))];
    const first = firstProblem(all, problems);
    if (first) inputs.current.get(first)?.input.focus();
  };

  const submit = async (save: () => SaveOutcome | Promise<SaveOutcome>): Promise<boolean> => {
    if (running.current) return false;
    setSent(true);
    setFormError(null);
    setLive(new Set(names));
    // What the server refused last time is asked again: only the form's own checks hold the save back.
    setRefused({});
    const problems = checks as Record<string, string | null | undefined>;
    const count = Object.values(problems).filter(Boolean).length;
    if (count > 0) {
      focusFirst(problems);
      AccessibilityInfo.announceForAccessibility(count === 1 ? t('Un champ est à corriger.') : t('{count} champs sont à corriger.', { count }));
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
  useLayoutEffect(() => {
    submitRef.current = submit;
  });

  const fail = (name: K | null, message: string): void => {
    AccessibilityInfo.announceForAccessibility(message);
    if (name === null) {
      setFormError(message);
      return;
    }
    setRefused(current => ({ ...current, [name]: message }));
    inputs.current.get(name)?.input.focus();
  };

  const count = sent ? names.filter(name => !!shownOf(name)).length + Object.keys(refused).filter(name => !names.includes(name as K)).length : 0;
  const message = formError ?? (count === 1 ? t('Un champ est à corriger.') : count > 1 ? t('{count} champs sont à corriger.', { count }) : null);

  return {
    field: name => {
      const at = order.indexOf(name);
      const last = at < 0 || at === order.length - 1;
      return {
        ...bind(name),
        error: shownOf(name),
        returnKeyType: last ? 'done' : 'next',
        // Moving on keeps the keyboard up; the last closes it.
        submitBehavior: last ? 'blurAndSubmit' : 'submit',
      };
    },
    error: name => shownOf(name),
    submit,
    fail,
    busy,
    message,
    reset: () => {
      setLive(new Set());
      setSent(false);
      setRefused({});
      setFormError(null);
    },
  };
}
