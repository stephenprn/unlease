/**
 * Contacts' passing interface state, never persisted: the contacts picked in a list (the selection
 * bar's, Maj+clic picking a run of them), what a new contact's form starts from (a name typed in the
 * spotlight, the label of the list it was made from), and a file dropped anywhere for the import.
 */
import { create } from 'zustand';

export interface ContactsUi {
  readonly selection: ReadonlySet<string>;
  /** What « Créer un contact » fills in first; taken once by the form. */
  readonly seed: { readonly name: string; readonly labelIds: readonly string[] } | null;
  /** The contact picked or unpicked last: Maj+clic picks every one between it and the next. */
  readonly anchor: string | null;
  /** A vCard or a CSV dropped outside the import page, which reads it once there. */
  readonly importFile: File | null;
}

const INITIAL: ContactsUi = { selection: new Set(), seed: null, anchor: null, importFile: null };

export const useContactsUi = create<ContactsUi>(() => INITIAL);

export function toggleSelected(id: string): void {
  useContactsUi.setState(state => {
    const selection = new Set(state.selection);
    if (selection.has(id)) selection.delete(id);
    else selection.add(id);
    return { selection, anchor: id };
  });
}

/** Maj+clic: every contact of `order` from the last one picked to `id` takes the state `id` takes. */
export function pickRange(order: readonly string[], id: string): void {
  const { anchor, selection } = useContactsUi.getState();
  const from = anchor === null ? -1 : order.indexOf(anchor);
  const to = order.indexOf(id);
  if (from < 0 || to < 0) {
    toggleSelected(id);
    return;
  }
  const on = !selection.has(id);
  const next = new Set(selection);
  for (const each of order.slice(Math.min(from, to), Math.max(from, to) + 1)) {
    if (on) next.add(each);
    else next.delete(each);
  }
  useContactsUi.setState({ selection: next, anchor: id });
}

export function selectAll(ids: readonly string[]): void {
  useContactsUi.setState({ selection: new Set(ids) });
}

export function clearSelection(): void {
  if (useContactsUi.getState().selection.size > 0) useContactsUi.setState({ selection: new Set(), anchor: null });
}

export function setImportFile(file: File | null): void {
  useContactsUi.setState({ importFile: file });
}

/** The dropped file, once. */
export function takeImportFile(): File | null {
  const { importFile } = useContactsUi.getState();
  if (importFile) useContactsUi.setState({ importFile: null });
  return importFile;
}

export function seedNewContact(seed: ContactsUi['seed']): void {
  useContactsUi.setState({ seed });
}

/** The seed, once: a later « Créer un contact » starts empty. */
export function takeSeed(): ContactsUi['seed'] {
  const { seed } = useContactsUi.getState();
  if (seed) useContactsUi.setState({ seed: null });
  return seed;
}

/** Test seam. */
export function resetContactsUi(): void {
  useContactsUi.setState(INITIAL, true);
}
