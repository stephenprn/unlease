/**
 * A new page's templates: while the page holds nothing (`isBlankPage`), quiet choices under its title
 * (« Journal du jour », « Réunion »…), never a step before writing: typing a word makes them go. A
 * choice fills the page in one step of its undo (`fillPage`), written in the device's language, and
 * the caret goes to the title while it has none, else where the template asks to write.
 */
import { useId } from 'react';

import { getLocale, t } from '@unlease/core/i18n';
import { isoDayOf } from '@unlease/core/services/dates';
import { isBlankPage, pageTemplate, TEMPLATE_CHOICES, type PageTemplateKey } from '@unlease/pages/services/templates';

import { useBlocksStore } from '../../../app/store/blocks';
import { fillPage } from '../../../app/store/pages';
import { Icon } from '@shared/ui/components/Icon';
import { flushAll, focusBlock } from './editorStore';
import styles from './pages.module.css';

/** Fills `page` from a template, for today on this device, and puts the caret where it goes. */
export function startFromTemplate(page: string, key: PageTemplateKey, now: number = Date.now()): void {
  flushAll();
  const { caret } = fillPage(page, pageTemplate(key, isoDayOf(now), getLocale()), now);
  focusBlock(caret.block, caret.offset);
}

export function PageTemplates({ page }: { page: string }) {
  const leadId = useId();
  const blank = useBlocksStore(s => isBlankPage(s.blocks, s.blocksByParent, page));
  if (!blank) return null;
  return (
    <div className={styles.templates} role="group" aria-labelledby={leadId}>
      <p id={leadId} className={`${styles.templatesLead} t-meta`}>
        {t('Start from a template')}
      </p>
      <div className={styles.templateRow}>
        {TEMPLATE_CHOICES.map(choice => (
          <button key={choice.key} type="button" className={styles.template} onClick={() => startFromTemplate(page, choice.key)}>
            <Icon name={choice.glyph} size={18} />
            {t(choice.label)}
          </button>
        ))}
      </div>
    </div>
  );
}
