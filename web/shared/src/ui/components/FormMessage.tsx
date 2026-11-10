/**
 * A form's own line by its actions: what its save refused (« Le serveur ne répond pas »), or, once
 * sent with fields to correct, how many, so a press that saved nothing never goes unexplained. Said
 * politely to screen readers (the first field to correct has the focus already).
 */
import { t } from '@unlease/core/i18n';

import styles from './controls.module.css';
import { Icon } from './Icon';
import type { Form } from './useForm';

export function FormMessage({ form, className }: { readonly form: Pick<Form<string>, 'message' | 'problems'>; readonly className?: string }) {
  const text = form.message ?? (form.problems === 1 ? t('Un champ est à corriger.') : form.problems > 1 ? t('{count} champs sont à corriger.', { count: form.problems }) : null);
  return (
    <p className={[styles.formMessage, 't-meta', className ?? ''].join(' ')} role="status" aria-live="polite">
      {text ? (
        <>
          <Icon name="error" size={16} className={styles.errorGlyph} />
          <span>{text}</span>
        </>
      ) : null}
    </p>
  );
}
