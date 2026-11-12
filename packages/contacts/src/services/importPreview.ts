/**
 * The import's wizard, in words (`core/services/importFlow`, both clients): each person read as the
 * preview lists them (their name, their numbers or their e-mail, what becomes of them and why), the
 * counts above the list, the labels offered in the choices, and the report once written. The plan
 * itself is `importing.ts`'s; this only says it.
 */
import { localized, t, tx } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import type { ImportFate, PreviewEntry } from '@unlease/core/services/importFlow';
import type { GlyphName } from '@unlease/design/glyphs';
import type { Contact, ContactLabel } from '../models/contacts';
import { addressLine } from './addresses';
import { formatBirthday, readBirthday } from './birthdays';
import type { FileLabel, Gains, ImportedContact, ImportFormat, ImportPlan, PersonFate } from './importing';
import { contactName } from './names';

/** What the preview reads the address book through: the contacts a person completes, the labels they wear. */
export interface PreviewLibrary {
  readonly contacts: Readonly<Record<string, Contact>>;
  readonly labels: Readonly<Record<string, ContactLabel>>;
}

/** The words both clients' wizards share. */
export const CONTACTS_IMPORT_WORDS = localized({
  sourceTitle: tx('Depuis Google Contacts'),
  sourceLead: tx('L’export de Google Contacts, en vCard ou en CSV Google, ou le fichier .vcf d’une archive Takeout.'),
  phoneTitle: tx('Depuis ce téléphone'),
  phoneLead: tx('Les contacts enregistrés sur ce téléphone, dont ceux de votre compte Google, avec leurs photos et leurs groupes.'),
  phoneBlocked: tx('L’accès aux contacts du téléphone est refusé : il se donne dans les réglages d’Android.'),
  phoneFailed: tx('Les contacts du téléphone n’ont pas pu être lus.'),
  phoneEmpty: tx('Aucun contact sur ce téléphone.'),
  notContacts: tx('Ce fichier n’est ni une vCard (.vcf) ni un CSV de Google Contacts.'),
  emptyFile: tx('Aucun contact dans ce fichier.'),
  unreadable: tx('Fichier illisible.'),
  kept: tx('Les contacts gardent leurs numéros, e-mails, adresses, anniversaires, notes, libellés et favoris. Importer le même fichier une seconde fois ne double personne.'),
  listLabel: tx('Les personnes du fichier'),
  existingTitle: tx('Contacts déjà là'),
  complete: tx('Compléter les contacts déjà là'),
  labelsTitle: tx('Libellés'),
  labelsLead: tx('Les libellés de Google deviennent ceux d’ici ; un libellé du même nom déjà là les accueille.'),
  photosTitle: tx('Photos'),
  photos: tx('Reprendre les photos'),
  favoritesTitle: tx('Favoris'),
  favorites: tx('Garder les favoris de Google'),
  nothingToChoose: tx('Rien à décider pour ce fichier : les réglages proposés suffisent.'),
  nothingToWrite: tx('Rien à importer avec ces choix : tout est déjà là ou laissé de côté.'),
  writing: tx('Écriture des contacts…'),
  undo: tx('Annuler l’import'),
  undone: tx('Import annulé'),
  undoneLead: tx('Les contacts et les libellés ajoutés sont partis ; ceux déjà là ont retrouvé ce qu’ils avaient.'),
  seeContacts: tx('Voir les contacts'),
});

// ── one person ──────────────────────────────────────────────────────────────

/** A person read, named as the list will name them: their name, else their company, an e-mail, a number. */
export function personTitle(person: ImportedContact): string {
  const name = `${person.firstName.trim()} ${person.lastName.trim()}`.trim();
  if (name) return name;
  if (person.company.trim()) return person.company.trim();
  const email = person.emails.find(entry => entry.value.trim())?.value.trim();
  if (email) return email;
  const phone = person.phones.find(entry => entry.value.trim())?.value.trim();
  return phone ?? t('Fiche sans nom');
}

/** One value, and how many more there are: « 06 12 34 56 78 (+2) ». */
const firstOf = (values: readonly string[]): string | null => {
  const kept = values.map(value => value.trim()).filter(Boolean);
  if (kept.length === 0) return null;
  return kept.length > 1 ? `${kept[0]} (+${kept.length - 1})` : kept[0]!;
};

/** What a person's second line shows: their number, their e-mail, their company, their birthday; for one with no name, what they hold. */
export function personDetail(person: ImportedContact): string {
  const title = personTitle(person);
  const birthday = readBirthday(person.birthday);
  const work = [person.jobTitle.trim(), person.company.trim()].filter(part => part && part !== title).join(', ');
  const parts: (string | null)[] = [firstOf(person.phones.map(entry => entry.value)), firstOf(person.emails.map(entry => entry.value)), work || null, birthday ? formatBirthday(birthday) : null];
  const address = person.addresses[0];
  if (!parts.some(Boolean)) parts.push(address ? addressLine(address) : null, person.note.trim().split('\n')[0]!.slice(0, 80) || null);
  return parts
    .filter((part): part is string => part !== null && part !== title)
    .join(' · ');
}

/** What a person adds, in a few words: « 2 numéros, un e-mail, son anniversaire ». */
export function gainsWords(gains: Gains): string {
  const words: string[] = [];
  if (gains.name) words.push(t('son nom'));
  if (gains.phones > 0) words.push(plural(gains.phones, 'numéro'));
  if (gains.emails > 0) words.push(plural(gains.emails, 'e-mail'));
  if (gains.addresses > 0) words.push(plural(gains.addresses, 'adresse'));
  if (gains.birthday) words.push(t('son anniversaire'));
  if (gains.company) words.push(t('son entreprise'));
  if (gains.jobTitle) words.push(t('sa fonction'));
  if (gains.note) words.push(t('une note'));
  if (gains.labels > 0) words.push(plural(gains.labels, 'libellé'));
  if (gains.favorite) words.push(t('l’étoile des favoris'));
  if (gains.photo) words.push(t('sa photo'));
  return words.join(', ');
}

/** A fate as the shared list shows it. */
function fateOf(fate: PersonFate): ImportFate {
  switch (fate.kind) {
    case 'new':
      return 'new';
    case 'update':
      return 'update';
    case 'same':
      return 'same';
    default:
      return 'skip';
  }
}

const GLYPHS: Readonly<Record<PersonFate['kind'], GlyphName>> = {
  new: 'personPlus',
  update: 'person',
  same: 'check',
  joined: 'people',
  anonymous: 'alert',
  left: 'minus',
};

/** Whether a person can be left out by their box: one coming in, or one left out already (to bring back). */
export function canLeave(fate: PersonFate): boolean {
  return fate.kind === 'new' || fate.kind === 'update' || fate.kind === 'left';
}

/** The names of the labels a new contact wears, those the plan makes included. */
function labelNames(ids: readonly string[], plan: ImportPlan, library: PreviewLibrary): string[] {
  const made = new Map(plan.labels.map(label => [label.id, String(label.fields.name)]));
  return ids.map(id => made.get(id) ?? library.labels[id]?.name).filter((name): name is string => !!name);
}

/** Why a person comes in, or what becomes of them, under their detail. */
function whyOf(fate: PersonFate, imported: readonly ImportedContact[], library: PreviewLibrary): string | undefined {
  const here = (id: string): string => {
    const contact = library.contacts[id];
    return contact ? contactName(contact) : t('Sans nom');
  };
  switch (fate.kind) {
    case 'new':
      return undefined;
    case 'update':
      return t('Complète {name} : {gains}', { name: here(fate.id), gains: gainsWords(fate.gains) });
    case 'same':
      return fate.missed ? t('Déjà là : {name}, laissé tel quel (le fichier ajouterait {gains})', { name: here(fate.id), gains: gainsWords(fate.missed) }) : t('Déjà là : {name}, rien à ajouter', { name: here(fate.id) });
    case 'joined': {
      const name = imported[fate.into] ? personTitle(imported[fate.into]!) : t('Sans nom');
      return gainsWords(fate.gains) ? t('Même personne que {name}, plus haut dans le fichier : y ajoute {gains}', { name, gains: gainsWords(fate.gains) }) : t('Même personne que {name}, plus haut dans le fichier : rien de plus', { name });
    }
    case 'anonymous':
      return t('Ni nom, ni numéro, ni e-mail : rien pour le reconnaître');
    case 'left':
      return t('Décoché : ne sera pas importé');
  }
}

/** Every person read, with what becomes of them: the preview's list (`core/services/importFlow`). */
export function previewEntries(imported: readonly ImportedContact[], plan: ImportPlan, library: PreviewLibrary): PreviewEntry[] {
  const created = new Map(plan.creates.map(write => [write.id, write]));
  return imported.map((person, at) => {
    const fate = plan.people[at] ?? { kind: 'left' };
    let note: string | undefined;
    if (fate.kind === 'new') {
      const write = created.get(fate.id);
      const labels = write ? labelNames((write.fields.labelIds as readonly string[] | undefined) ?? [], plan, library) : [];
      const parts = [write?.fields.favorite === true ? t('Favori') : null, labels.length > 0 ? t('Libellés : {labels}', { labels: labels.join(', ') }) : null, write?.photo ? t('Avec sa photo') : null];
      note = parts.filter((part): part is string => part !== null).join(' · ') || undefined;
    }
    return { key: `person-${at}`, title: personTitle(person), detail: personDetail(person), fate: fateOf(fate), why: whyOf(fate, imported, library), glyph: GLYPHS[fate.kind], ...(note ? { note } : {}) };
  });
}

// ── the counts ──────────────────────────────────────────────────────────────

/** One line of the counts over the list. */
export interface CountWords {
  readonly icon: GlyphName;
  readonly text: string;
  readonly meta?: string | null;
}

/** Where the people came from, said under their count. */
export function sourceWords(source: ImportFormat | 'phone' | 'shared', name: string): string {
  if (source === 'phone') return t('Les contacts de ce téléphone');
  if (source === 'shared') return name ? t('Fiche partagée « {file} »', { file: name }) : t('Une fiche partagée');
  return source === 'vcard' ? t('vCard « {file} »', { file: name }) : t('CSV « {file} »', { file: name });
}

/** How many of each kind are left out, said. */
function leftOutWords(plan: ImportPlan): string | null {
  const count = (kind: PersonFate['kind']): number => plan.people.filter(fate => fate.kind === kind).length;
  const parts = [
    count('anonymous') > 0 ? t('{count} sans nom, numéro ni e-mail', { count: count('anonymous') }) : null,
    count('joined') > 0 ? t('{count} en double dans le fichier', { count: count('joined') }) : null,
    count('left') > 0 ? plural(count('left'), 'décochée', 'décochées') : null,
  ];
  const said = parts.filter((part): part is string => part !== null);
  return said.length > 0 ? said.join(' · ') : null;
}

/** The photos Google gives as links, which only a server can fetch. */
export function linkedPhotos(plan: ImportPlan): number {
  return [...plan.creates, ...plan.updates].filter(write => write.photo?.kind === 'url').length;
}

/** The counts over the preview's list: who is read, new, completed, here already, left out; the labels made; the photos. */
export function previewCounts(plan: ImportPlan, source: string, serverless: boolean): CountWords[] {
  const people = plan.people.length;
  const left = plan.people.filter(fate => fate.kind === 'anonymous' || fate.kind === 'joined' || fate.kind === 'left').length;
  const kept = plan.people.filter(fate => fate.kind === 'same' && fate.missed !== null).length;
  const same = plan.people.filter(fate => fate.kind === 'same' && fate.missed === null).length;
  const lines: CountWords[] = [{ icon: 'people', text: plural(people, 'personne lue', 'personnes lues'), meta: source }];
  lines.push({ icon: 'personPlus', text: plural(plan.creates.length, 'nouveau contact', 'nouveaux contacts') });
  if (plan.updates.length > 0) lines.push({ icon: 'person', text: plural(plan.updates.length, 'contact déjà là, complété', 'contacts déjà là, complétés'), meta: t('Ce qui leur manque est ajouté ; rien de ce qu’ils ont n’est remplacé.') });
  if (kept > 0) lines.push({ icon: 'person', text: plural(kept, 'contact déjà là, laissé tel quel', 'contacts déjà là, laissés tels quels'), meta: t('Le fichier les compléterait : voyez les choix.') });
  if (same > 0) lines.push({ icon: 'check', text: t('{contacts} déjà là, rien à ajouter', { contacts: plural(same, 'contact') }) });
  if (left > 0) lines.push({ icon: 'minus', text: plural(left, 'personne laissée de côté', 'personnes laissées de côté'), meta: leftOutWords(plan) });
  if (plan.labels.length > 0) {
    const names = plan.labels.map(label => String(label.fields.name));
    lines.push({ icon: 'tag', text: plural(plan.labels.length, 'libellé à créer', 'libellés à créer'), meta: names.length > 6 ? `${names.slice(0, 6).join(', ')}…` : names.join(', ') });
  }
  if (plan.photos > 0) lines.push({ icon: 'image', text: plural(plan.photos, 'photo à reprendre', 'photos à reprendre'), meta: serverless && linkedPhotos(plan) > 0 ? photosNeedServer(linkedPhotos(plan)) : null });
  return lines;
}

/** Google's photos are links: without a server, they stay behind. */
export function photosNeedServer(count: number): string {
  return t('{photos} de Google sont des liens : sans serveur relié, elles ne peuvent pas être reprises.', { photos: plural(count, 'photo') });
}

// ── the choices ─────────────────────────────────────────────────────────────

/** A label's line in the choices: how many wear it, and whether it is made or joined. */
export function fileLabelWords(label: FileLabel): string {
  const people = plural(label.people, 'personne');
  if (label.marker) return t('{people} · Google l’ajoute à chaque import de fichier', { people });
  return label.existing ? t('{people} · existe déjà ici', { people }) : t('{people} · nouveau libellé', { people });
}

/** What « Compléter les contacts déjà là » does, on and off, counted. */
export function completeWords(on: boolean, count: number): string {
  if (!on) return t('Ceux déjà là restent tels quels ; seuls les nouveaux contacts sont ajoutés.');
  return count === 1 ? t('Un contact déjà là gagne ce qui lui manque ; rien de ce qu’il a n’est remplacé.') : t('{count} contacts déjà là gagnent ce qui leur manque ; rien de ce qu’ils ont n’est remplacé.', { count });
}

/** What « Reprendre les photos » does, on and off, counted. */
export function photosWords(on: boolean, count: number): string {
  return on ? t('{photos} à reprendre, une fois les contacts écrits.', { photos: plural(count, 'photo') }) : t('Les contacts arrivent sans leur photo.');
}

/** What « Garder les favoris de Google » does, counted. */
export function favoritesWords(on: boolean, count: number): string {
  return on ? t('L’étoile de Google en fait des favoris ici : {people}.', { people: plural(count, 'personne') }) : t('L’étoile de Google est ignorée ; vos favoris restent ceux d’ici.');
}

/** The import's foot button, counted. */
export function importContactsAction(plan: ImportPlan | null): string {
  if (!plan) return t('Importer');
  if (plan.creates.length === 0 && plan.updates.length > 0) return t('Compléter {contacts}', { contacts: plural(plan.updates.length, 'contact') });
  return plan.creates.length > 0 ? t('Importer {contacts}', { contacts: plural(plan.creates.length, 'contact') }) : t('Importer');
}

// ── the report ──────────────────────────────────────────────────────────────

/** What the photos came to: taken, and those that could not be (unreadable, no server for a link). */
export interface PhotosTaken {
  readonly taken: number;
  readonly missed: number;
}

/** The report's lines: what came in, then what was left out and why. */
export function reportLines(plan: ImportPlan, photos: PhotosTaken | null, serverless: boolean): { readonly imported: string[]; readonly skipped: string[] } {
  const imported: string[] = [];
  if (plan.creates.length > 0) imported.push(plural(plan.creates.length, 'contact ajouté', 'contacts ajoutés'));
  if (plan.updates.length > 0) imported.push(plural(plan.updates.length, 'contact complété', 'contacts complétés'));
  if (plan.labels.length > 0) imported.push(t('{labels} : {names}', { labels: plural(plan.labels.length, 'libellé créé', 'libellés créés'), names: plan.labels.map(label => String(label.fields.name)).join(', ') }));
  if (photos && photos.taken > 0) imported.push(plural(photos.taken, 'photo reprise', 'photos reprises'));
  const skipped: string[] = [];
  const count = (kind: PersonFate['kind']): number => plan.people.filter(fate => fate.kind === kind).length;
  const same = plan.people.filter(fate => fate.kind === 'same' && fate.missed === null).length;
  const kept = plan.people.filter(fate => fate.kind === 'same' && fate.missed !== null).length;
  if (same > 0) skipped.push(t('{contacts} déjà là, rien à ajouter', { contacts: plural(same, 'contact') }));
  if (kept > 0) skipped.push(plural(kept, 'contact déjà là, laissé tel quel', 'contacts déjà là, laissés tels quels'));
  if (count('joined') > 0) skipped.push(plural(count('joined'), 'personne en double dans le fichier, réunie à la première', 'personnes en double dans le fichier, réunies à la première'));
  if (count('anonymous') > 0) skipped.push(t('{cards} sans nom, numéro ni e-mail', { cards: plural(count('anonymous'), 'fiche') }));
  if (count('left') > 0) skipped.push(plural(count('left'), 'personne décochée', 'personnes décochées'));
  if (photos && photos.missed > 0) skipped.push(serverless && linkedPhotos(plan) > 0 ? photosNeedServer(photos.missed) : t('{photos} n’ont pas pu être reprises.', { photos: plural(photos.missed, 'photo') }));
  return { imported, skipped };
}

/** The report's title, over its sheets: what the import came to. */
export function doneTitle(plan: ImportPlan): string {
  return plan.creates.length > 0 ? t('Vos contacts sont là') : t('Vos contacts sont à jour');
}

/** The slip once written: what came in, in a line. */
export function importedMessage(plan: ImportPlan): string {
  const parts = [plan.creates.length > 0 ? plural(plan.creates.length, 'contact ajouté', 'contacts ajoutés') : null, plan.updates.length > 0 ? plural(plan.updates.length, 'contact complété', 'contacts complétés') : null];
  const said = parts.filter((part): part is string => part !== null);
  return said.length > 0 ? said.join(' · ') : plural(plan.labels.length, 'libellé créé', 'libellés créés');
}
