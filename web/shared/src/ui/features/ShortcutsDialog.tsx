/** The keyboard shortcuts, on "?" (and from the settings): those of the app on screen. */
import { useId } from 'react';

import type { AppId } from '@unlease/core/apps';
import { APP_WORDS } from '@unlease/core/appWords';
import { t, tc, tx } from '@unlease/core/i18n';

import { selectShortcutsOpen, setShortcutsOpen, useUiStore } from '../../app/store/ui';
import { theApp } from '../../modules';
import { DialogFrame } from '../components/Dialog';
import { Layer } from '../components/Layer';
import { modKey } from '../dom';
import board from '../components/keys.module.css';
import styles from './settings/settings.module.css';

/** Stands for ⌘ on a Mac and Ctrl elsewhere, named when shown: every key below takes either. */
const MOD = 'Mod';

type Keys = readonly (readonly [readonly string[], string])[];

/** What an app's own pages take, under its name for the place: only the app on screen lists them. */
const APP_GROUPS: readonly { app: AppId; title: string; keys: Keys }[] = [
  {
    app: 'notes',
    title: tx('Sur une note'),
    keys: [
      [['E'], tx('Archiver')],
      [['#'], tx('Supprimer')],
      [['X'], tx('Sélectionner (sur le tableau)')],
      [[tx('Maj'), tx('clic')], tx('Sélectionner plusieurs notes')],
      [[MOD, tx('Entrée')], tx('Fermer l’éditeur')],
    ],
  },
  {
    app: 'notes',
    title: tx('Dans une liste à cocher'),
    keys: [
      [[tx('Entrée')], tx('Élément suivant')],
      [['Retour'], tx('Sur un élément vide : le supprimer')],
      [['Alt', '↑'], tx('Monter l’élément')],
      [['Alt', '↓'], tx('Descendre l’élément')],
    ],
  },
  {
    app: 'pages',
    title: tx('Dans une page'),
    keys: [
      [[tx('Entrée')], tx('Nouveau paragraphe (Maj+Entrée : nouvelle ligne)')],
      [[MOD, tx('Entrée')], tx('Cocher la tâche, ou sortir du bloc de code')],
      [['/'], tx('Ajouter un bloc')],
      [['@'], tx('Mentionner une page, une note, une collection ou un lien')],
      [[MOD, 'B'], tx('Gras (I : italique, U : souligné, E : code)')],
      [[MOD, tx('Maj'), 'S'], tx('Barré')],
      [[MOD, 'K'], tx('Lien sur les mots sélectionnés')],
      [['Tab'], tx('Imbriquer le bloc (Maj+Tab : le désimbriquer)')],
      [[MOD, tx('Maj'), '↑'], tx('Monter le bloc (↓ : le descendre)')],
      [[MOD, 'D'], tx('Dupliquer le bloc')],
      [[tx('Échap')], tx('Sélectionner le bloc')],
      [[MOD, 'Z'], tx('Annuler (Ctrl+Maj+Z : rétablir)')],
    ],
  },
];

/** The groups of the app on screen, read in the interface's language: the keys that work anywhere in it (the spotlight, its search, its own commands, `AppModule.commands`), then its pages' own. */
function shownGroups(): readonly { title: string; keys: Keys }[] {
  const app = theApp();
  const everywhere: Keys = [
    [[MOD, 'P'], t('Chercher et ouvrir (aussi Ctrl+K)')],
    [['/'], APP_WORDS[app.id].search],
    ...(app.commands ?? []).flatMap(command => (command.key ? [[[command.key.toUpperCase()], t(command.title)] as const] : [])),
    // Carnet files a link pasted on its board.
    ...(app.id === 'notes' ? [[[MOD, 'V'], t('Coller un lien sur le tableau : il est rangé dans la bonne collection')] as const] : []),
    [['?'], t('Afficher cette aide')],
    [[tx('Échap')], t('Fermer, ou annuler la sélection')],
  ];
  const own = APP_GROUPS.filter(group => group.app === app.id).map(group => ({ title: t(group.title), keys: group.keys.map(([keys, what]) => [keys, t(what)] as const) }));
  return [{ title: t('Partout'), keys: everywhere }, ...own];
}

/** A key's name as the keyboard shows it: « Retour » here is Backspace, not "Back"; the spotlight's key is ⌘ on a Mac. */
const keyName = (key: string): string => (key === 'Retour' ? tc('key', 'Retour') : key === MOD ? modKey() : t(key));

export function ShortcutsDialog() {
  const open = useUiStore(selectShortcutsOpen);
  const titleId = useId();
  const close = (): void => setShortcutsOpen(false);
  return (
    <Layer open={open} onDismiss={close} labelledBy={titleId}>
      <DialogFrame title={t('Raccourcis clavier')} titleId={titleId} onClose={close} className={styles.shortcutsDialog}>
        {shownGroups().map(group => (
          <section key={group.title} className={styles.shortcutsGroup}>
            <h3 className="t-section">{group.title}</h3>
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
                  <dd className="t-body">{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </DialogFrame>
    </Layer>
  );
}
