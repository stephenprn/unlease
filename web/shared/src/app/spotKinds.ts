/** The spotlight's kinds of documents: the app's own (`AppModule.spotKinds`). */
import { theApp, type SpotKind } from '../modules';

export function spotKinds(): readonly SpotKind[] {
  return theApp().spotKinds ?? [];
}

export function kindOf(type: string): SpotKind | undefined {
  return spotKinds().find(each => each.type === type);
}
