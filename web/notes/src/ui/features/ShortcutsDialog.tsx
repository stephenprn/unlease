/** The keyboard shortcuts, on "?" (and from the settings). */
import { useId } from 'react';

import { t, tc, tx } from '@unlease/core/i18n';

import { selectShortcutsOpen, setShortcutsOpen, useUiStore } from '../../app/store/ui';
import { DialogFrame } from '../components/Dialog';
import { Layer } from '../components/Layer';
import { modKey } from '../dom';
import board from './board/board.module.css';
import styles from './settings/settings.module.css';

/** Stands for ⌘ or Ctrl, named when shown. */
const MOD = 'Mod';

const GROUPS: readonly { title: string; keys: readonly (readonly [readonly string[], string])[] }[] = [
  {
    title: tx('Partout'),
    keys: [
      [[MOD, 'P'], tx('Chercher partout : pages, notes, collections et liens (aussi Ctrl+K)')],
      [['/'], tx('Rechercher dans les notes et les pages')],
      [['C'], tx('Nouvelle note')],
      [['L'], tx('Nouvelle liste à cocher')],
      [['D'], tx('Nouveau dessin')],
      [['P'], tx('Nouvelle page')],
      [['K'], tx('Classer un lien')],
      [['V'], tx('Classer le lien copié')],
      [['Ctrl', 'V'], tx('Coller un lien sur le tableau : il est rangé dans la bonne collection')],
      [['?'], tx('Afficher cette aide')],
      [[tx('Échap')], tx('Fermer, ou annuler la sélection')],
    ],
  },
  {
    title: tx('Sur une note'),
    keys: [
      [['E'], tx('Archiver')],
      [['#'], tx('Supprimer')],
      [['X'], tx('Sélectionner (sur le tableau)')],
      [[tx('Maj'), tx('clic')], tx('Sélectionner plusieurs notes')],
      [['Ctrl', tx('Entrée')], tx('Fermer l’éditeur')],
    ],
  },
  {
    title: tx('Dans une liste à cocher'),
    keys: [
      [[tx('Entrée')], tx('Élément suivant')],
      [['Retour'], tx('Sur un élément vide : le supprimer')],
      [['Alt', '↑'], tx('Monter l’élément')],
      [['Alt', '↓'], tx('Descendre l’élément')],
    ],
  },
  {
    title: tx('Dans une page'),
    keys: [
      [[tx('Entrée')], tx('Nouveau paragraphe (Maj+Entrée : nouvelle ligne)')],
      [['Ctrl', tx('Entrée')], tx('Cocher la tâche, ou sortir du bloc de code')],
      [['/'], tx('Ajouter un bloc')],
      [['@'], tx('Mentionner une page, une note, une collection ou un lien')],
      [['Ctrl', 'B'], tx('Gras (I : italique, U : souligné, E : code)')],
      [['Ctrl', tx('Maj'), 'S'], tx('Barré')],
      [['Ctrl', 'K'], tx('Lien sur les mots sélectionnés')],
      [['Tab'], tx('Imbriquer le bloc (Maj+Tab : le désimbriquer)')],
      [['Ctrl', tx('Maj'), '↑'], tx('Monter le bloc (↓ : le descendre)')],
      [['Ctrl', 'D'], tx('Dupliquer le bloc')],
      [[tx('Échap')], tx('Sélectionner le bloc')],
      [['Ctrl', 'Z'], tx('Annuler (Ctrl+Maj+Z : rétablir)')],
    ],
  },
];

/** A key's name as the keyboard shows it: « Retour » here is Backspace, not "Back"; the spotlight's key is ⌘ on a Mac. */
const keyName = (key: string): string => (key === 'Retour' ? tc('key', 'Retour') : key === MOD ? modKey() : t(key));

export function ShortcutsDialog() {
  const open = useUiStore(selectShortcutsOpen);
  const titleId = useId();
  const close = (): void => setShortcutsOpen(false);
  return (
    <Layer open={open} onDismiss={close} labelledBy={titleId}>
      <DialogFrame title={t('Raccourcis clavier')} titleId={titleId} onClose={close} className={styles.shortcutsDialog}>
        {GROUPS.map(group => (
          <section key={group.title} className={styles.shortcutsGroup}>
            <h3 className="t-section">{t(group.title)}</h3>
            <dl className={styles.shortcuts}>
              {group.keys.map(([keys, what]) => (
                <div key={what} style={{ display: 'contents' }}>
                  <dt>
                    {keys.map(key => (
                      <kbd key={key} className={board.kbd}>
                        {keyName(key)}
                      </kbd>
                    ))}
                  </dt>
                  <dd className="t-body">{t(what)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </DialogFrame>
    </Layer>
  );
}
