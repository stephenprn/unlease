/** Opens a page's drawing block on the whole screen (`DrawingScreen`). */
import { navigate } from '../../navigation/navigationRef';

export function openDrawing(target: { readonly kind: 'block'; readonly page: string; readonly block: string }): void {
  navigate('Drawing', { page: target.page, block: target.block });
}
