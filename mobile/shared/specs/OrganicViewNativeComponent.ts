/**
 * A view in Carnet's shapes, which a React Native radius (one plain circle per corner) cannot draw:
 * a sheet with the continuous corner, a dot, or the brand's pebble, which gives under the press.
 * Android's `OrganicViewManager` paints it; the app uses it through `Organic`
 * (`src/ui/components/Organic.tsx`).
 */
import { codegenNativeComponent } from 'react-native';
import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';

export interface NativeProps extends ViewProps {
  /** Each corner, top-left first and clockwise: its horizontal radius, then its vertical one (dp, or % of the box when `relative`). */
  radii: ReadonlyArray<CodegenTypes.Float>;
  relative?: CodegenTypes.WithDefault<boolean, false>;
  /** The pebble at rest (`pebbleNumbers` in core): drawn instead of the radii when given. */
  pebble?: ReadonlyArray<CodegenTypes.Float>;
  /** The same pebble given, which it morphs toward while `given` (pressed). */
  pebbleGiven?: ReadonlyArray<CodegenTypes.Float>;
  given?: CodegenTypes.WithDefault<boolean, false>;
}

export default codegenNativeComponent<NativeProps>('OrganicView', { excludedPlatforms: ['iOS'] }) as HostComponent<NativeProps>;
