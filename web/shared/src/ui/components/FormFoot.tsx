/**
 * The actions of a form that is its own page (a contact, an event): a foot that sticks to the
 * window's bottom while the form scrolls, on the ground's own paint with a short fade over what runs
 * under it, so « Enregistrer » is always one press away. The form's line (`FormMessage`) sits above
 * the buttons, the primary last. Above the on-screen keyboard too: the page resizes with it
 * (`interactive-widget=resizes-content`).
 */
import type { ReactNode } from 'react';

import styles from './controls.module.css';
import { FormMessage } from './FormMessage';
import type { Form } from './useForm';

export function FormFoot({ form, children, className }: { readonly form?: Pick<Form<string>, 'message' | 'problems'>; readonly children: ReactNode; readonly className?: string }) {
  return (
    <div className={[styles.formFoot, className ?? ''].join(' ')}>
      {form ? <FormMessage form={form} className={styles.formFootMessage} /> : null}
      <div className={styles.formFootActions}>{children}</div>
    </div>
  );
}
