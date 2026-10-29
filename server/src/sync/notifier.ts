/**
 * Wakes long-polling syncs when anything is stored. In-process only: there is
 * one server.
 */
export class ChangeNotifier {
  private readonly waiters = new Set<() => void>();
  private closed = false;

  notify(): void {
    const waiting = [...this.waiters];
    this.waiters.clear();
    for (const wake of waiting) wake();
  }

  /**
   * Resolves on the next change, after `ms`, on abort, or at shutdown. The
   * waiter is registered synchronously, so a caller that has just read the
   * store cannot miss a change made between its read and this call.
   */
  wait(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise(resolve => {
      if (this.closed || signal?.aborted) {
        resolve();
        return;
      }
      const done = () => {
        clearTimeout(timer);
        this.waiters.delete(done);
        signal?.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.waiters.add(done);
      signal?.addEventListener('abort', done, { once: true });
    });
  }

  /** Releases every waiter and answers future waits at once. */
  close(): void {
    this.closed = true;
    this.notify();
  }

  get waiting(): number {
    return this.waiters.size;
  }
}
