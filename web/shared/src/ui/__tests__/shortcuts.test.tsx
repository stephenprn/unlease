import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { freshLibrary } from '@test/library';
import { shortcutGroups, shortcutTitles } from '@test/shortcuts';
import { setOnboarded } from '../../app/store/settings';
import { App } from '../App';
import { initHistory } from '../router';

describe('the shortcuts dialog', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
  });

  // The shell names no app's keys: Carnet's come from its module.
  it('shows the shell’s keys, the app’s commands, then the app’s own groups', async () => {
    const user = userEvent.setup();
    history.replaceState(null, '', '/notes');
    initHistory();
    render(<App />);
    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Raccourcis clavier' })).toBeInTheDocument();
    expect(shortcutTitles()).toEqual(['Partout', 'Sur une note', 'Dans une liste à cocher']);
    const everywhere = shortcutGroups().get('Partout')!;
    expect(everywhere[0]).toBe('Ctrl+P Chercher et ouvrir (aussi Ctrl+K)');
    expect(everywhere).toContain('C Nouvelle note');
    // An untitled group of the app's joins « Partout », before the help's own key.
    expect(everywhere.slice(-3)).toEqual(['Ctrl+V Coller un lien sur le tableau : il est rangé dans la bonne collection', '? Afficher cette aide', 'Échap Fermer, ou annuler la sélection']);
    expect(shortcutGroups().get('Sur une note')).toContain('# Supprimer');
    expect(shortcutGroups().get('Dans une liste à cocher')).toContain('Retour Sur un élément vide : le supprimer');
  });
});
