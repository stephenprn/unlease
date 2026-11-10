/**
 * `/capture/note`, `/capture/checklist`, `/capture/link` (the installed app's
 * shortcuts) and `/capture/share?…` (its share target): act once at boot, then
 * replace the address with where the action leads, so Back never repeats it.
 * Any page can open these addresses, so what one brings is never saved on
 * arrival: a share's links prefill the capture dialog, its text asks before
 * becoming a note (`readShare`); the shortcuts open an empty note, dropped if
 * left empty, or the dialog.
 */
import { readShare } from '../app/capture';
import { addCheck, createNote } from '../app/store/actions';
import { askSharedNote, openCapture, setEditorFocus } from '../app/store/notesUi';
import { appPath, navigate, parseRoute } from '@shared/ui/router';
import { paths } from './routes';

export function handleCaptureRoute(): void {
  const route = parseRoute(appPath(location.pathname));
  if (route.name !== 'capture') return;
  const params = new URLSearchParams(location.search);
  switch (route.kind) {
    case 'note': {
      const id = createNote({ kind: 'text' });
      setEditorFocus('body');
      navigate(paths.note(id), { replace: true, background: paths.board });
      return;
    }
    case 'checklist': {
      const id = createNote({ kind: 'checklist' });
      addCheck(id, '');
      setEditorFocus('check');
      navigate(paths.note(id), { replace: true, background: paths.board });
      return;
    }
    case 'link':
      navigate(paths.board, { replace: true });
      openCapture('');
      return;
    case 'share': {
      navigate(paths.board, { replace: true });
      const shared = readShare({ title: params.get('title') ?? '', text: params.get('text') ?? '', url: params.get('url') ?? '' });
      if (shared.kind === 'links') openCapture(shared.text, shared.title);
      else if (shared.kind === 'note') askSharedNote({ title: shared.title, body: shared.body });
    }
  }
}
