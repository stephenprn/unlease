/**
 * A view around a vertical scroller whose top edge dissolves on an eased curve while the content runs
 * on past it under something on screen (`ScrollEdges`, `src/ui/components/ScrollEdges.tsx`).
 * Android's `ScrollEdgesView` draws it.
 */
import { codegenNativeComponent } from 'react-native';
import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';

export interface NativeProps extends ViewProps {
  /** How long the top edge's fade is (dp). */
  length?: CodegenTypes.WithDefault<CodegenTypes.Float, 24>;
  top?: CodegenTypes.WithDefault<boolean, true>;
  /** How far below the scroller's top its top edge stands (dp): under a band that hides what scrolls beneath it. */
  insetTop?: CodegenTypes.WithDefault<CodegenTypes.Float, 0>;
}

export default codegenNativeComponent<NativeProps>('ScrollEdgesView', { excludedPlatforms: ['iOS'] }) as HostComponent<NativeProps>;
