/**
 * `/capture/note`, `/capture/checklist`, `/capture/link` (the installed app's
 * shortcuts) and `/capture/share?…` (its share target): act once at boot, then
 * replace the address with where the action leads, so Back never repeats it.
 */
import { receiveShare } from '../app/capture';
import { addCheck, createNote } from '../app/store/actions';
import { openCapture, setEditorFocus } from '../app/store/ui';
import { appPath, navigate, parseRoute, paths } from './router';

export function handleCaptureRoute(): void {
  const route = parseRoute(appPath(location.pathname));
  if (route.name !== 'capture') return;
  const params = new URLSearchParams(location.search);
  switch (route.kind) {
    case 'note': {
      const id = createNote({ kind: 'text' });
      setEditorFocus('body');
      navigate(paths.note(id), { replace: true, background: '/' });
      return;
    }
    case 'checklist': {
      const id = createNote({ kind: 'checklist' });
      addCheck(id, '');
      setEditorFocus('check');
      navigate(paths.note(id), { replace: true, background: '/' });
      return;
    }
    case 'link':
      navigate('/', { replace: true });
      openCapture('');
      return;
    case 'share': {
      navigate('/', { replace: true });
      const result = receiveShare({ title: params.get('title') ?? '', text: params.get('text') ?? '', url: params.get('url') ?? '' });
      if (result.kind === 'note') navigate(paths.note(result.id), { background: '/' });
    }
  }
}
