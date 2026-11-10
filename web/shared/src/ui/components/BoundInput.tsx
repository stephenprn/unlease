/**
 * A bare input bound to its form (`useForm`), for the strips that draw their own field (Carnet's
 * « Classer un lien » and a collection's add strip, the apps' new label): the form hears its edits and
 * its leaving, and focuses it on its problem; the problem is said under the strip (`FieldProblem`),
 * its glyph with it.
 */
import { useCallback, type InputHTMLAttributes } from 'react';

import controls from './controls.module.css';
import { Icon } from './Icon';
import type { FieldBinding } from './useForm';

export interface BoundInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  readonly field: FieldBinding;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** The problem's line (`FieldProblem`), for screen readers. */
  readonly problemId: string;
}

export function BoundInput({ field, value, onChange, onBlur, problemId, ...rest }: BoundInputProps) {
  const register = field.register;
  const attach = useCallback((element: HTMLInputElement | null) => register(element), [register]);
  return (
    <input
      ref={attach}
      value={value}
      aria-invalid={field.error ? true : undefined}
      aria-describedby={field.error ? problemId : undefined}
      onChange={event => {
        onChange(event.target.value);
        field.edited();
      }}
      onBlur={event => {
        field.left(value);
        onBlur?.(event);
      }}
      {...rest}
    />
  );
}

/** What the form found wrong with a strip, under it: the `error` glyph and the sentence in danger ink. */
export function FieldProblem({ field, id, className }: { readonly field: FieldBinding; readonly id: string; readonly className?: string }) {
  if (!field.error) return null;
  return (
    <p id={id} className={[controls.error, className ?? '', 't-meta'].join(' ')}>
      <Icon name="error" size={16} className={controls.errorGlyph} />
      <span>{field.error}</span>
    </p>
  );
}
