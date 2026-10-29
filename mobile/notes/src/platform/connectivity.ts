/** Android's default network reaching the internet again: a missing module never calls back. */
import NativeConnectivity from '../../specs/NativeConnectivity';

export function onOnline(listener: () => void): () => void {
  if (!NativeConnectivity) return () => {};
  NativeConnectivity.start();
  const subscription = NativeConnectivity.onChange(change => {
    if (change.online) listener();
  });
  return () => subscription.remove();
}
