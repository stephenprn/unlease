/**
 * A number's calling code in the contact form, before its field: a field-like button showing it
 * (« +33 »), opening the countries' menu (the « Indicatif par défaut » first, the chosen one ticked,
 * a letter typed jumping to its country), or none: the number kept as written.
 */
import { useRef, useState, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';
import { CALLING_CODES } from '@unlease/contacts/services/phones';

import { Icon } from '@shared/ui/components/Icon';
import { Menu, type MenuItem } from '@shared/ui/components/Menu';
import styles from '../contacts.module.css';
import { callingCountries, callingCountry } from './callingCodes';

export function CodePicker({ region, fallback, onChange, label }: { region: string | null; fallback: string | null; onChange: (region: string | null) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const named = region ? callingCountry(region) : t('Aucun indicatif');
  const mark = (on: boolean): ReactNode => (on ? <Icon name="check" size={22} className={styles.kindTick} /> : <span className={styles.kindBlank} />);
  const countries = callingCountries();
  const ordered = [...countries.filter(country => country.value === fallback), ...countries.filter(country => country.value !== fallback)];
  const values: (string | null)[] = [...ordered.map(country => country.value), null];
  const items: MenuItem[] = [
    ...ordered.map((country, index) => ({
      label: country.label,
      icon: 'check' as const,
      mark: mark(region === country.value),
      // The default stands apart at the head.
      separatorBefore: index === 1 && ordered[0]!.value === fallback,
      onSelect: () => onChange(country.value),
    })),
    { label: t('Aucun : le numéro tel qu’il est écrit'), icon: 'check' as const, mark: mark(region === null), separatorBefore: true, onSelect: () => onChange(null) },
  ];
  return (
    <>
      <button ref={anchor} type="button" className={`${styles.kindButton} ${styles.codeButton}`} aria-haspopup="menu" aria-expanded={open} aria-label={`${label} : ${named}`} data-tip={named} onClick={() => setOpen(true)}>
        <span className={`${styles.kindName} tabular`}>{region ? `+${CALLING_CODES[region] ?? ''}` : '—'}</span>
        <Icon name="chevronDown" size={18} />
      </button>
      <Menu open={open} anchor={anchor} align="start" onDismiss={() => setOpen(false)} label={label} items={items} chosen={Math.max(0, values.indexOf(region))} />
    </>
  );
}
