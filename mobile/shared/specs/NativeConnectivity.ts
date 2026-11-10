/**
 * The device's network, as Android sees it: an event when a usable connection comes (back) or
 * goes, so sync resumes the moment one is there instead of at its next retry.
 */
import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface NetworkChange {
  /** A validated default network (it reaches the internet). */
  online: boolean;
}

export interface Spec extends TurboModule {
  /** Starts listening; calling it again does nothing. */
  start(): void;
  readonly onChange: CodegenTypes.EventEmitter<NetworkChange>;
}

export default TurboModuleRegistry.get<Spec>('Connectivity');
