/** The keyboard shortcuts, on "?" (and from the settings): those of the app on screen. */
import { useId } from 'react';

import { APP_WORDS } from '@unlease/core/appWords';
import { t, tx } from '@unlease/core/i18n';

import { selectShortcutsOpen, setShortcutsOpen, useUiStore } from '../../app/store/ui';
import { MOD_KEY, theApp, type ShortcutRow } from '../../modules';
import { DialogFrame } from '../components/Dialog';
import { Layer } from '../components/Layer';
import { modKey } from '../dom';
import board from '../components/keys.module.css';
import styles from './settings/settings.module.css';

/**
 * The groups of the app on screen, read in the interface's language: the keys that work anywhere in
 * it (the spotlight, its search, its commands' keys, `AppModule.commands`, and its untitled rows),
 * then its own groups (`AppModule.shortcuts`: its pages' keys). The shell names no app's keys.
 */
function shownGroups(): readonly { title: string; rows: readonly ShortcutRow[] }[] {
  const app = theApp();
  const groups = app.shortcuts ?? [];
  const read = (rows: readonly ShortcutRow[]): ShortcutRow[] => rows.map(([keys, what]) => [keys, t(what)]);
  const everywhere: ShortcutRow[] = [
    [[MOD_KEY, 'P'], t('Search and open (also Ctrl+K)')],
    [['/'], APP_WORDS[app.id].search],
    ...(app.commands ?? []).flatMap((command): ShortcutRow[] => (command.key ? [[[command.key.toUpperCase()], t(command.title)]] : [])),
    ...read(groups.filter(group => !group.title).flatMap(group => group.rows)),
    [['?'], t('Show this help')],
    [[tx('Esc')], t('Close, or clear the selection')],
  ];
  const own = groups.flatMap(group => (group.title ? [{ title: t(group.title), rows: read(group.rows) }] : []));
  return [{ title: t('Everywhere'), rows: everywhere }, ...own];
}

/** A key's name as the keyboard shows it (« Retour » in French for Backspace); the spotlight's key is ⌘ on a Mac. */
const keyName = (key: string): string => (key === MOD_KEY ? modKey() : t(key));

export function ShortcutsDialog() {
  const open = useUiStore(selectShortcutsOpen);
  const titleId = useId();
  const close = (): void => setShortcutsOpen(false);
  return (
    <Layer open={open} onDismiss={close} labelledBy={titleId}>
      <DialogFrame title={t('Keyboard shortcuts')} titleId={titleId} onClose={close} className={styles.shortcutsDialog}>
        {shownGroups().map(group => (
          <section key={group.title} className={styles.shortcutsGroup}>
            <h3 className="t-section">{group.title}</h3>
            <dl className={styles.shortcuts}>
              {group.rows.map(([keys, what]) => (
                <div key={`${keys.join('+')} ${what}`} style={{ display: 'contents' }}>
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
