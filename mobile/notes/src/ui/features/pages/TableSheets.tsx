/**
 * The sheets a table opens: a cell's, a column's, a row's. A sheet is drawn in place over its host,
 * so a block inside the page cannot hold one: the table asks, and the page screen's one
 * `TableSheetHost` (mounted at its root) shows it over the whole screen.
 */
import React, { useCallback, useRef } from 'react';

import { t } from '@unlease/core/i18n';
import { addRow } from '@app/store/pages';

import { ListRow, Sheet } from '../../components';
import { CellSheet } from './CellSheet';
import { ColumnSheet } from './ColumnSheet';
import { closeTableSheet, deleteRowWithUndo, useTableSheets, type TableSheetRequest } from './TableSheetStore';

function RowSheet({ visible, request, onDismiss }: { visible: boolean; request: Extract<TableSheetRequest, { kind: 'row' }> | null; onDismiss: () => void }) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Ligne')}>
      {request ? (
        <>
          <ListRow
            icon="plus"
            title={t('Insérer une ligne en dessous')}
            onPress={() => {
              onDismiss();
              addRow(request.page, request.table, request.row);
            }}
          />
          <ListRow
            icon="trash"
            title={t('Supprimer la ligne')}
            danger
            onPress={() => {
              onDismiss();
              deleteRowWithUndo(request.page, request.row);
            }}
          />
        </>
      ) : null}
    </Sheet>
  );
}

/** Mount once at the page screen's root: it shows whatever sheet a table asked for. */
export function TableSheetHost(): React.ReactElement {
  const request = useTableSheets(s => s.request);
  // The last request stays drawn while its sheet leaves.
  const last = useRef<TableSheetRequest | null>(request);
  if (request) last.current = request;
  const shown = request ?? last.current;
  const close = useCallback(() => closeTableSheet(), []);
  return (
    <>
      <CellSheet visible={request?.kind === 'cell'} request={shown?.kind === 'cell' ? shown : null} onDismiss={close} />
      <ColumnSheet visible={request?.kind === 'column'} request={shown?.kind === 'column' ? shown : null} onDismiss={close} />
      <RowSheet visible={request?.kind === 'row'} request={shown?.kind === 'row' ? shown : null} onDismiss={close} />
    </>
  );
}
