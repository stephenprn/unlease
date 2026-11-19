/**
 * A box whose content is cut at its foot (`CutFade`, `src/ui/components/CutFade.tsx`): a card's text
 * that goes on, a drawing taller than its card. Its last `length` dissolves on the eased curve the
 * scrollers' ends take, so the box says what it holds continues. Android's `CutFadeView` draws it.
 */
import { codegenNativeComponent } from 'react-native';
import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';

export interface NativeProps extends ViewProps {
  /** How long the fade at its foot is (dp); 0 draws it whole. */
  length?: CodegenTypes.WithDefault<CodegenTypes.Float, 24>;
}

export default codegenNativeComponent<NativeProps>('CutFadeView', { excludedPlatforms: ['iOS'] }) as HostComponent<NativeProps>;
