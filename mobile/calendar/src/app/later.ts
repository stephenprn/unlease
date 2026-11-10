/** Work started from a tap and not awaited: what it says goes through its own slips, and a failure is not thrown at the press. */
export function later(work: Promise<unknown>): void {
  work.catch(() => undefined);
}
