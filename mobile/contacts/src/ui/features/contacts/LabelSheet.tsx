/** The labels a contact wears, picked in a sheet as Google's « Gérer les libellés » does; a new one is made from the same sheet, on the rows' columns. */
import React, { useState } from 'react';

import { t } from '@unlease/core/i18n';
import { CONTACT_LIMITS } from '@unlease/contacts/models/contacts';
import { createLabel, labelNameTaken } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';

import { LabelCheck, ListRow, NewItemField, Sheet, SheetScroll } from '@shared/ui/components';

export function LabelSheet({ visible, chosen, onChange, onDismiss }: { visible: boolean; chosen: readonly string[]; onChange: (labelIds: string[]) => void; onDismiss: () => void }) {
  const order = useLibraryStore(s => s.labelOrder);
  const labels = useLibraryStore(s => s.labels);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const toggle = (id: string): void => onChange(chosen.includes(id) ? chosen.filter(other => other !== id) : [...chosen, id]);
  const add = (): void => {
    const clean = name.trim();
    if (!clean) return;
    if (labelNameTaken(clean)) {
      setProblem(t('Ce libellé existe déjà : choisissez un autre nom.'));
      return;
    }
    const id = createLabel(clean);
    setName('');
    onChange([...chosen, id]);
  };
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Libellés')}>
      <SheetScroll keyboardShouldPersistTaps="handled">
        {order.map(id => {
          const label = labels[id];
          if (!label || label.deletedAt !== null) return null;
          const checked = chosen.includes(id);
          return <ListRow key={id} title={label.name} leading={<LabelCheck color={label.color} checked={checked} />} onPress={() => toggle(id)} accessibilityRole="checkbox" accessibilityState={{ checked }} />;
        })}
        <NewItemField
          value={name}
          onChangeText={text => {
            setName(text);
            if (problem) setProblem(null);
          }}
          onSubmit={add}
          placeholder={t('Créer un libellé')}
          accessibilityLabel={t('Nom du nouveau libellé')}
          submitLabel={t('Créer')}
          maxLength={CONTACT_LIMITS.labelName}
          problem={problem}
          keepKeyboard
        />
      </SheetScroll>
    </Sheet>
  );
}
