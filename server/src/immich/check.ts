/** Tries Immich before the Administration keeps it: its address answers as Immich, and its key opens the albums and the people. */
import type { ImmichConfig } from '../settings/store';
import { refuse, type Refusal } from '../settings/update';
import { ImmichClient, ImmichError, immichProblem } from './client';

export async function checkImmichServer(config: ImmichConfig, fetcher: typeof fetch = fetch): Promise<Refusal | null> {
  try {
    await new ImmichClient(config.url, config.apiKey, fetcher).check();
    return null;
  } catch (error) {
    return refuse(error instanceof ImmichError && error.status !== 0 ? 400 : 502, immichProblem(error));
  }
}
