/**
 * A collection's « Modèle de fiche » (its menu): « Selon le type de lien », then the person's own
 * templates, the one it reads with ticked; a choice is written at once (`setCollectionTemplate`, its
 * slip with « Annuler »). « Nouveau modèle » opens the editor for one this collection takes once
 * saved; « Gérer les modèles » the list. The web's `TemplatePicker`.
 */
import React from 'react';

import { t, tc } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { TEMPLATE_LIMITS } from '@unlease/notes/models/templates';
import { collectionTemplate } from '@unlease/notes/services/templates';
import { setCollectionTemplate } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { ownTemplates } from '@app/templates';
import { showSnack } from '@shared/app/store/uiStore';

import { Icon, Sheet, SheetScroll } from '../../components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { TemplateRow } from './TemplateRow';

export interface TemplatePickerSheetProps {
  readonly lineId: string;
  readonly visible: boolean;
  readonly onDismiss: () => void;
  /** « Nouveau modèle »: the editor, for this collection. */
  readonly onCreate: () => void;
  /** « Gérer les modèles »: the list. */
  readonly onManage: () => void;
}

export function TemplatePickerSheet({ lineId, visible, onDismiss, onCreate, onManage }: TemplatePickerSheetProps) {
  const theme = useTheme();
  const line = useLibraryStore(s => s.notes[lineId]);
  const templates = useLibraryStore(s => s.linkTemplates);
  const own = ownTemplates(templates);
  // A template deleted since reads as none: « Selon le type de lien » is ticked.
  const current = collectionTemplate(templates, line)?.id ?? null;
  const tick = (chosen: boolean) => (chosen ? <Icon name="check" size={22} color={theme.color.focus} /> : undefined);
  const choose = (templateId: string | null): void => {
    onDismiss();
    if (templateId === current) return;
    const undo = setCollectionTemplate(lineId, templateId);
    showSnack(t('Modèle choisi'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  };
  const act = (run: () => void) => () => {
    onDismiss();
    run();
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Modèle de fiche')} tall>
      <SheetScroll>
        <TemplateRow
          icon="link"
          title={t('Selon le type de lien')}
          meta={t('Chaque lien est lu avec le modèle de son type.')}
          trailing={tick(current === null)}
          accessibilityRole="radio"
          accessibilityState={{ checked: current === null }}
          onPress={() => choose(null)}
        />
        {own.map(template => (
          <TemplateRow
            key={template.id}
            icon="rows"
            title={template.name}
            meta={plural(template.fields.length, 'champ')}
            trailing={tick(template.id === current)}
            accessibilityRole="radio"
            accessibilityState={{ checked: template.id === current }}
            onPress={() => choose(template.id)}
          />
        ))}
        {own.length < TEMPLATE_LIMITS.templates ? <TemplateRow icon="plus" title={t('Nouveau modèle')} adds onPress={act(onCreate)} /> : null}
        <TemplateRow icon="settings" title={t('Gérer les modèles')} chevron onPress={act(onManage)} />
      </SheetScroll>
    </Sheet>
  );
}
