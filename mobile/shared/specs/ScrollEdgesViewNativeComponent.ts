/**
 * A view around a scroller (`ScrollEdges`, `src/ui/components/ScrollEdges.tsx`): it tells the head
 * standing over its top when content goes under it (`onUnder`), so the head's line comes in, and it
 * fades the ends of a bounded box (a list capped in a card, a strip that scrolls sideways) on an eased
 * curve while content runs on past them. Android's `ScrollEdgesView` draws it.
 */
import { codegenNativeComponent } from 'react-native';
import type { CodegenTypes, HostComponent, ViewProps } from 'react-native';

export type UnderEvent = Readonly<{
  /** Content lies under the scroller's top (scrolled past it), where a head stands. */
  under: boolean;
}>;

export interface NativeProps extends ViewProps {
  /** How long an end's fade is (dp). */
  length?: CodegenTypes.WithDefault<CodegenTypes.Float, 24>;
  /** Its top meets a head: it says when content goes under it (`onUnder`). */
  top?: CodegenTypes.WithDefault<boolean, true>;
  /** How far below the scroller's top that head's line stands (dp): under a band inside it that hides what scrolls beneath it. */
  insetTop?: CodegenTypes.WithDefault<CodegenTypes.Float, 0>;
  /** The scroller it wraps runs sideways. */
  horizontal?: CodegenTypes.WithDefault<boolean, false>;
  /** The start (top, or left) fades while content continues past it. */
  fadeStart?: CodegenTypes.WithDefault<boolean, false>;
  /** The end (bottom, or right) fades while content continues past it. */
  fadeEnd?: CodegenTypes.WithDefault<boolean, false>;
  onUnder?: CodegenTypes.DirectEventHandler<UnderEvent>;
}

export default codegenNativeComponent<NativeProps>('ScrollEdgesView', { excludedPlatforms: ['iOS'] }) as HostComponent<NativeProps>;
