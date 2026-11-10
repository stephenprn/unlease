/**
 * One choice among a few, each its own row (the suite's radio rows, as the restore's): its name in
 * body, the chosen one washed in matcha with its check. The arrows move the choice and the focus
 * with it; Tab leaves. Never the browser's own radio buttons.
 */
import { Icon } from '@shared/ui/components/Icon';
import { arrowKeys } from '@shared/ui/components/radioKeys';
import settings from '@shared/ui/features/settings/settings.module.css';

export interface ChoiceRow<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint?: string;
}

export function ChoiceRows<T extends string>({ choices, value, onChange, labelledBy, label }: { choices: readonly ChoiceRow<T>[]; value: T; onChange: (value: T) => void; labelledBy?: string; label?: string }) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label} className={settings.choices} onKeyDown={arrowKeys(choices.map(choice => choice.value), value, onChange, choice => choice)}>
      {choices.map(choice => (
        <button
          key={choice.value}
          type="button"
          role="radio"
          data-key={choice.value}
          aria-checked={choice.value === value}
          tabIndex={choice.value === value ? 0 : -1}
          className={settings.choice}
          onClick={() => onChange(choice.value)}
        >
          <span className={settings.choiceMark} aria-hidden="true">
            {choice.value === value ? <Icon name="check" size={20} /> : null}
          </span>
          <span className={settings.rowText}>
            <span className="t-body">{choice.label}</span>
            {choice.hint ? <span className="t-meta">{choice.hint}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}
