/**
 * The import's wizard, in the package: each person's fate (new, completed, here already, the same as
 * an earlier one of the file, nothing to know them by, left out), the choices changing the plan, the
 * labels offered, the words of the preview, and the import taken back.
 */
import { setLocale } from '@unlease/core/i18n';
import type { Fields } from '@unlease/core/sync/record';
import { emptyContact, type Contact, type ContactLabel } from '../../models/contacts';
import { defaultLabels, fileLabels, forgetImport, planImport, readImportFile, type ImportedContact, type PersonFate } from '../importing';
import { canLeave, previewCounts, previewEntries, reportLines } from '../importPreview';

const card = (...lines: string[]): string => ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n');

const FILE = [
  card('N:Curie;Marie;;;', 'TEL;TYPE=CELL:06 11 22 33 44', 'TEL;TYPE=WORK:01 44 55 66 77', 'BDAY:1867-11-07', 'CATEGORIES:myContacts,Sciences'),
  card('N:Roux;Julien;;;', 'EMAIL:julien@example.org', 'CATEGORIES:Imported on 3/12/2024,Amis,starred'),
  card('NOTE:Rappeler pour le devis', 'ADR;TYPE=HOME:;;3 rue Haute;Lyon;;69001;France'),
  card('FN:J. Roux', 'TEL:07 00 00 00 01', 'EMAIL:julien@example.org'),
  card('N:Blanc;Marc;;;', 'TEL:06 99 99 99 99'),
].join('\r\n');

const ids = (): (() => string) => {
  let n = 0;
  return () => `id${(n += 1)}`;
};

const marie: Contact = { ...emptyContact('marie', 0), firstName: 'Marie', lastName: 'Curie', phones: [{ id: 'p', number: '+33 6 11 22 33 44', kind: 'mobile', label: '' }] };
const marc: Contact = { ...emptyContact('marc', 0), firstName: 'Marc', lastName: 'Blanc', phones: [{ id: 'p', number: '06 99 99 99 99', kind: 'mobile', label: '' }] };
const science: ContactLabel = { id: 'sci', name: 'sciences', color: 'green', position: 'a0', createdAt: 0, deletedAt: null };

function read(): readonly ImportedContact[] {
  return readImportFile('contacts.vcf', FILE)!.people;
}

describe('the wizard’s plan', () => {
  afterEach(() => setLocale('fr'));

  it('reads every person, those with nothing to know them by too, and says what becomes of each', () => {
    const people = read();
    expect(people).toHaveLength(5);
    const plan = planImport([marie, marc], [science], people, { now: 5, newId: ids(), region: 'FR' });
    expect(plan.people.map(fate => fate.kind)).toEqual(['update', 'new', 'anonymous', 'joined', 'same']);
    const update = plan.people[0] as Extract<PersonFate, { kind: 'update' }>;
    expect(update.gains).toMatchObject({ phones: 1, birthday: true, labels: 1 });
    expect(plan.people[3]).toMatchObject({ kind: 'joined', into: 1, gains: { phones: 1 } });
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]!.fields).toMatchObject({ firstName: 'Julien', favorite: true });
    // The joined card's number goes to Julien.
    expect((plan.creates[0]!.fields.phones as { number: string }[]).map(phone => phone.number)).toEqual(['07 00 00 00 01']);
    expect(plan.updates.map(write => write.id)).toEqual(['marie']);
    expect(plan.updates[0]!.before).toMatchObject({ phones: marie.phones, birthday: null, labelIds: [] });
    expect(plan.unchanged).toBe(1);
  });

  it('leaves people out, turns the completing off, picks the labels, drops the photos and the stars', () => {
    const people = read();
    const labels = fileLabels(people, [science]);
    expect(labels.map(label => [label.name, label.people, label.existing, label.marker])).toEqual([
      ['Sciences', 1, 'sci', false],
      ['Imported on 3/12/2024', 1, null, true],
      ['Amis', 1, null, false],
    ]);
    const chosen = defaultLabels(labels);
    expect([...chosen]).toEqual(['sciences', 'amis']);

    const plain = planImport([marie, marc], [science], people, { now: 5, newId: ids(), labels: chosen });
    expect(plain.labels.map(label => label.fields.name)).toEqual(['Amis']);

    const kept = planImport([marie, marc], [science], people, { now: 5, newId: ids(), complete: false, labels: new Set<string>(), favorites: false });
    expect(kept.updates).toHaveLength(0);
    expect(kept.labels).toHaveLength(0);
    expect(kept.people[0]).toMatchObject({ kind: 'same', id: 'marie', missed: { phones: 1, birthday: true } });
    expect(kept.creates[0]!.fields).toMatchObject({ favorite: false, labelIds: [] });
    // Still one Julien: his second card's number led to him even with nothing written to the address book.
    expect(kept.people[3]).toMatchObject({ kind: 'joined', into: 1 });

    const left = planImport([marie, marc], [science], people, { now: 5, newId: ids(), leave: new Set([1]) });
    // Julien's first card left out: his second one becomes the new contact.
    expect(left.people.map(fate => fate.kind)).toEqual(['update', 'left', 'anonymous', 'new', 'same']);
    expect(left.labels).toHaveLength(0);
  });

  it('words the preview: titles, details, why, and the counts', () => {
    const people = read();
    const plan = planImport([marie, marc], [science], people, { now: 5, newId: ids(), region: 'FR', labels: defaultLabels(fileLabels(people, [science])) });
    const entries = previewEntries(people, plan, { contacts: { marie, marc }, labels: { sci: science } });
    expect(entries.map(entry => [entry.title, entry.fate])).toEqual([
      ['Marie Curie', 'update'],
      ['Julien Roux', 'new'],
      ['Fiche sans nom', 'skip'],
      ['J. Roux', 'skip'],
      ['Marc Blanc', 'same'],
    ]);
    expect(entries[0]!.detail).toBe('06 11 22 33 44 (+1) · 7 novembre 1867');
    expect(entries[0]!.why).toBe('Complète Marie Curie : 1 numéro, son anniversaire, 1 libellé');
    expect(entries[1]!.note).toBe('Favori · Libellés : Amis');
    expect(entries[2]!.detail).toBe('3 rue Haute, 69001 Lyon, France · Rappeler pour le devis');
    expect(entries[2]!.why).toBe('Ni nom, ni numéro, ni e-mail : rien pour le reconnaître');
    expect(entries[3]!.why).toBe('Même personne que Julien Roux, plus haut dans le fichier : y ajoute 1 numéro');
    expect(entries[4]!.why).toBe('Déjà là : Marc Blanc, rien à ajouter');
    expect(plan.people.map(canLeave)).toEqual([true, true, false, false, false]);
    const counts = previewCounts(plan, 'vCard « contacts.vcf »', false).map(line => line.text);
    expect(counts).toEqual(['5 personnes lues', '1 nouveau contact', '1 contact déjà là, complété', '1 contact déjà là, rien à ajouter', '2 personnes laissées de côté', '1 libellé à créer']);
    const report = reportLines(plan, null, false);
    expect(report.imported).toEqual(['1 contact ajouté', '1 contact complété', '1 libellé créé : Amis']);
    expect(report.skipped).toEqual(['1 contact déjà là, rien à ajouter', '1 personne en double dans le fichier, réunie à la première', '1 fiche sans nom, numéro ni e-mail']);
  });
});

describe('forgetImport', () => {
  /** The address book after a plan was written, as a client's store would hold it. */
  function written(contacts: readonly Contact[], plan: ReturnType<typeof planImport>): Record<string, Contact> {
    const out: Record<string, Contact> = Object.fromEntries(contacts.map(contact => [contact.id, contact]));
    for (const write of plan.creates) out[write.id] = { ...emptyContact(write.id, 5), ...(write.fields as Partial<Contact>) };
    for (const write of plan.updates) out[write.id] = { ...out[write.id]!, ...(write.fields as Partial<Contact>) };
    return out;
  }
  const patchOf = (changes: readonly { id: string; patch: Fields }[], id: string): Fields | undefined => changes.find(change => change.id === id)?.patch;

  it('takes back what it made and what it added, where nothing changed since', () => {
    const people = read();
    const plan = planImport([marie, marc], [science], people, { now: 5, newId: ids(), region: 'FR' });
    const after = written([marie, marc], plan);
    // Since the import, Marie's birthday was set again by hand: it stays.
    after.marie = { ...after.marie!, birthday: '1867-11-08' };
    const julien = plan.creates[0]!.id;
    const changes = forgetImport(plan, new Map([['marie', 'photo1']]), { ...after, marie: { ...after.marie, photoId: 'photo1', photoMime: 'image/jpeg' } }, 9);
    expect(patchOf(changes, julien)).toEqual({ deletedAt: 9 });
    const back = patchOf(changes, 'marie')!;
    expect(back.phones).toEqual(marie.phones);
    expect(back.labelIds).toEqual([]);
    expect(back.birthday).toBeUndefined();
    expect(back).toMatchObject({ photoId: null, photoMime: '', photoUploaded: false });
    // The labels it made, gone.
    for (const label of plan.labels) expect(changes).toContainEqual({ type: 'contactLabel', id: label.id, patch: { deletedAt: 9 } });
  });

  it('takes the labels it made off a contact that wore them since', () => {
    const people = read();
    const plan = planImport([marie, marc], [], people, { now: 5, newId: ids(), region: 'FR' });
    const amis = plan.labels.find(label => label.fields.name === 'Amis')!.id;
    const after = written([marie, marc], plan);
    after.marc = { ...after.marc!, labelIds: [amis] };
    const changes = forgetImport(plan, new Map(), after, 9);
    expect(patchOf(changes, 'marc')).toEqual({ labelIds: [] });
  });
});
