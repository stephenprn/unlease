/**
 * Moving in from Google: drop the file Google Contacts exports (vCard or « CSV Google », or the
 * `.vcf` of a Takeout), see what it will do (who is new, who is already here and only gains what
 * they lacked, the labels it makes), import it in one batch; then the photos (a picture in the file
 * kept for its upload, a link fetched by the server). Nothing already here is overwritten, and the
 * same file twice doubles nobody. Reached from Réglages › Données (as on the phone), where the export
 * is too, from the empty list, and by a file dropped anywhere.
 */
import { useEffect, useRef, useState, type DragEvent } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { createId } from '@unlease/core/services/ids';
import { planImport, readContactsFile, type ImportPlan } from '@unlease/contacts/services/importing';

import { takeImportPhotos, type PhotosOutcome } from '../../app/media/photos';
import { applyImport } from '../../app/store/actions';
import { takeImportFile, useContactsUi } from '../../app/store/contactsUi';
import { useContactsStore } from '../../app/store/library';
import { callingRegion } from '../../app/store/prefs';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { Button } from '@shared/ui/components/Button';
import { FormMessage } from '@shared/ui/components/FormMessage';
import { Icon } from '@shared/ui/components/Icon';
import { OutlineEdge, useOutline } from '@shared/ui/components/Outline';
import { Section } from '@shared/ui/features/settings/Section';
import settings from '@shared/ui/features/settings/settings.module.css';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { navigate } from '@shared/ui/router';
import styles from '../contacts.module.css';
import { paths } from '../routes';

const STEPS = [
  tx('Ouvrez contacts.google.com et connectez-vous.'),
  tx('Choisissez « Exporter », puis « vCard » (ou « CSV Google ») et exportez.'),
  tx('Déposez ici le fichier téléchargé (.vcf ou .csv). Celui d’un export Takeout de Google Contacts convient aussi.'),
];

type Step =
  | { readonly kind: 'idle'; readonly error?: string }
  | { readonly kind: 'reading' }
  | { readonly kind: 'ready'; readonly name: string; readonly people: number; readonly plan: ImportPlan }
  | { readonly kind: 'importing'; readonly name: string; readonly people: number; readonly plan: ImportPlan }
  | { readonly kind: 'done'; readonly plan: ImportPlan; readonly photos: PhotosOutcome | null };

/** What a file holds, read and matched against the address book as it is now. */
async function readFile(file: File): Promise<Step> {
  const text = await file.text();
  const imported = readContactsFile(file.name, text);
  if (!imported) return { kind: 'idle', error: tx('Ce fichier n’est ni une vCard (.vcf) ni un CSV de Google Contacts.') };
  if (imported.length === 0) return { kind: 'idle', error: tx('Aucun contact dans ce fichier.') };
  const { contacts, labels } = useContactsStore.getState();
  const plan = planImport(Object.values(contacts), Object.values(labels), imported, { now: Date.now(), newId: () => createId(), region: callingRegion() });
  return { kind: 'ready', name: file.name, people: imported.length, plan };
}

/** Reads the first file, saying so while it does: the plan it makes, or why there is none. */
async function readInto(setStep: (step: Step) => void, files: readonly File[]): Promise<void> {
  const file = files[0];
  if (!file) return;
  setStep({ kind: 'reading' });
  try {
    setStep(await readFile(file));
  } catch {
    setStep({ kind: 'idle', error: tx('Fichier illisible.') });
  }
}

function PlanLine({ icon, text, meta }: { icon: 'personPlus' | 'person' | 'tag' | 'image' | 'check'; text: string; meta?: string }) {
  return (
    <li className={settings.count}>
      <Icon name={icon} size={22} />
      <span className={settings.rowText}>
        <span className="t-body tabular">{text}</span>
        {meta ? <span className="t-meta">{meta}</span> : null}
      </span>
    </li>
  );
}

function Importer() {
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  // A file dropped elsewhere in the app, read once here.
  const dropped = useContactsUi(s => s.importFile);
  useEffect(() => {
    if (!dropped) return;
    const file = takeImportFile();
    if (file) void readInto(setStep, [file]);
  }, [dropped]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const server = useSettingsStore(selectServer);
  const { ref: dropRef, vars: dropVars, d: dropD } = useOutline<HTMLButtonElement>('panel');

  const read = (files: readonly File[]): Promise<void> => readInto(setStep, files);

  const run = async (name: string, people: number, plan: ImportPlan): Promise<void> => {
    setStep({ kind: 'importing', name, people, plan });
    applyImport(plan);
    const photos = plan.photos > 0 ? await takeImportPhotos([...plan.creates, ...plan.updates]) : null;
    setStep({ kind: 'done', plan, photos });
  };

  if (step.kind === 'done') {
    const { plan, photos } = step;
    return (
      <div className={settings.block}>
        <h3 className="t-body-strong">{t('Import terminé')}</h3>
        <ul className={styles.plan}>
          <PlanLine icon="personPlus" text={plural(plan.creates.length, 'contact ajouté', 'contacts ajoutés')} />
          {plan.updates.length > 0 ? <PlanLine icon="person" text={plural(plan.updates.length, 'contact complété', 'contacts complétés')} /> : null}
          {plan.labels.length > 0 ? <PlanLine icon="tag" text={plural(plan.labels.length, 'libellé créé', 'libellés créés')} /> : null}
          {photos ? <PlanLine icon="image" text={plural(photos.taken, 'photo', 'photos')} meta={photos.missed > 0 ? t('{photos} n’ont pas pu être récupérées.', { photos: plural(photos.missed, 'photo') }) : undefined} /> : null}
        </ul>
        <div className={settings.buttons}>
          <Button onClick={() => navigate(paths.contacts)}>{t('Voir les contacts')}</Button>
          <Button kind="text" onClick={() => setStep({ kind: 'idle' })}>
            {t('Importer un autre fichier')}
          </Button>
        </div>
      </div>
    );
  }

  if (step.kind === 'ready' || step.kind === 'importing') {
    const { plan } = step;
    const busy = step.kind === 'importing';
    const nothing = plan.creates.length === 0 && plan.updates.length === 0 && plan.labels.length === 0;
    return (
      <div className={settings.block}>
        <h3 className="t-body-strong">{t('Dans « {file} »', { file: step.name })}</h3>
        <ul className={styles.plan}>
          <PlanLine icon="personPlus" text={plural(plan.creates.length, 'nouveau contact', 'nouveaux contacts')} />
          {plan.updates.length > 0 ? <PlanLine icon="person" text={plural(plan.updates.length, 'contact déjà là, complété', 'contacts déjà là, complétés')} meta={t('Ce qui leur manque est ajouté ; rien de ce qu’ils ont n’est remplacé.')} /> : null}
          {plan.unchanged > 0 ? <PlanLine icon="check" text={plural(plan.unchanged, 'contact déjà à jour', 'contacts déjà à jour')} /> : null}
          {plan.labels.length > 0 ? (
            <PlanLine
              icon="tag"
              text={plural(plan.labels.length, 'libellé à créer', 'libellés à créer')}
              meta={plan.labels
                .map(label => String(label.fields.name))
                .slice(0, 6)
                .join(', ')}
            />
          ) : null}
          {plan.photos > 0 ? <PlanLine icon="image" text={plural(plan.photos, 'photo', 'photos')} meta={server ? undefined : t('Sans serveur, les photos de Google (des liens) ne peuvent pas être récupérées.')} /> : null}
        </ul>
        <div className={settings.buttons}>
          <Button icon="download" busy={busy} disabled={nothing} onClick={() => void run(step.name, step.people, plan)}>
            {t('Importer')}
          </Button>
          <Button kind="text" disabled={busy} onClick={() => setStep({ kind: 'idle' })}>
            {t('Annuler')}
          </Button>
        </div>
      </div>
    );
  }

  const onDrop = (event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    setOver(false);
    void read([...event.dataTransfer.files]);
  };

  return (
    <div className={settings.block}>
      <ol className={settings.steps}>
        {STEPS.map((text, index) => (
          <li key={text} className={settings.step}>
            <span className={settings.stepNumber}>{index + 1}</span>
            <span className="t-body">{t(text)}</span>
          </li>
        ))}
      </ol>
      <button
        ref={dropRef}
        type="button"
        className={settings.drop}
        style={dropVars}
        data-over={over || undefined}
        onClick={() => input.current?.click()}
        onDragOver={event => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        disabled={step.kind === 'reading'}
        aria-busy={step.kind === 'reading' || undefined}
      >
        <Icon name="upload" size={28} />
        <span className="t-body-strong">{step.kind === 'reading' ? t('Lecture du fichier…') : t('Déposez le fichier exporté (.vcf ou .csv)')}</span>
        <span className="t-meta">{t('ou cliquez pour le choisir')}</span>
        <OutlineEdge d={dropD} />
      </button>
      <input
        ref={input}
        type="file"
        accept=".vcf,.vcard,.csv,text/vcard,text/x-vcard,text/csv"
        hidden
        aria-label={t('Fichier de contacts')}
        onChange={event => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          void read(files);
        }}
      />
      {/* A file refused says why under the drop zone, its glyph with it, as a form's own line. */}
      <FormMessage form={{ message: step.kind === 'idle' && step.error ? t(step.error) : null, problems: 0 }} />
      <p className="t-meta">{t('Les contacts gardent leurs numéros, e-mails, adresses, anniversaires, notes, libellés et favoris. Importer le même fichier une seconde fois ne double personne. Rien n’est envoyé ailleurs que sur votre serveur.')}</p>
    </div>
  );
}

export function ImportScreen() {
  return (
    <div className={settings.page}>
      <PageHead title={t('Importer')} />
      <Section title={t('Importer depuis Google Contacts')}>
        <Importer />
      </Section>
    </div>
  );
}
