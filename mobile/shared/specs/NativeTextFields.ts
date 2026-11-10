/**
 * Fields that grow with their words. React Native's Android input brings the caret into view the
 * moment a line is added, a frame before the field is made a line taller: the words jump up a line
 * and back. A field held here keeps its words still until it has grown (`src/platform/textFields.ts`).
 */
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** Holds the input of this view tag (or lets it go: a field at its cap scrolls its words). */
  holdScroll(tag: number, hold: boolean): void;
}

export default TurboModuleRegistry.get<Spec>('TextFields');
