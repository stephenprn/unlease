/** Opening Wallet's forms from anywhere: the editor of a new item, of one that exists. */
import type { ItemKind } from '@unlease/wallet/models/item';

import { getLocation, navigate } from '@shared/ui/router';
import { paths } from '../routes';

/** A new item's form, over the page it is opened from. */
export const openNew = (kind: ItemKind): void => navigate(paths.create(kind), { background: getLocation().path });

export const openEdit = (id: string): void => navigate(paths.edit(id), { background: getLocation().path });
