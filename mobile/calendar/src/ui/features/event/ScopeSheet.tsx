/** Which occurrences a change or a deletion of a repeating event takes: this one, this one and the following, or all (Google's three). */
import React from 'react';

import { localized, t, tx } from '@unlease/core/i18n';
import { EDIT_SCOPES, type EditScope } from '@unlease/calendar/services/editing';

import { ListRow, Sheet } from '@shared/ui/components';

const SCOPE_WORDS: Readonly<Record<EditScope, string>> = localized({
  this: tx('This event'),
  following: tx('This and following events'),
  all: tx('All events'),
});

export function ScopeSheet({ visible, deleting, onDismiss, onScope }: { visible: boolean; deleting: boolean; onDismiss: () => void; onScope: (scope: EditScope) => void }) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={deleting ? t('Delete a repeating event') : t('Edit a repeating event')}>
      {EDIT_SCOPES.map(scope => (
        <ListRow
          key={scope}
          title={SCOPE_WORDS[scope]}
          icon={scope === 'this' ? 'calendar' : scope === 'following' ? 'arrowRight' : 'refresh'}
          danger={deleting}
          onPress={() => {
            onDismiss();
            onScope(scope);
          }}
        />
      ))}
    </Sheet>
  );
}
