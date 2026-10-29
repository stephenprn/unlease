/**
 * The analysis queue: in memory, one entry per link id, a few at a time. A
 * link asked for again while it is being read runs once more afterwards (the
 * run itself skips it if it is no longer pending).
 */
import { log } from '../../../log';

export class AnalysisQueue {
  private readonly waiting: string[] = [];
  private readonly queued = new Set<string>();
  private readonly running = new Set<string>();
  private readonly again = new Set<string>();
  private readonly controller = new AbortController();
  private readonly idleWaiters: (() => void)[] = [];
  private stopped = false;

  constructor(
    private readonly run: (id: string, signal: AbortSignal) => Promise<void>,
    private readonly concurrency: number,
  ) {}

  enqueue(ids: Iterable<string>): void {
    if (this.stopped) return;
    for (const id of ids) {
      if (this.running.has(id)) this.again.add(id);
      else if (!this.queued.has(id)) {
        this.queued.add(id);
        this.waiting.push(id);
      }
    }
    this.pump();
  }

  get size(): number {
    return this.waiting.length + this.running.size;
  }

  /** Resolves when nothing is waiting or running. */
  idle(): Promise<void> {
    if (this.size === 0) return Promise.resolve();
    return new Promise(resolve => this.idleWaiters.push(resolve));
  }

  /** Aborts what is running (it stays pending and is read again at the next start) and waits for it to settle. */
  async stop(timeoutMs = 5000): Promise<void> {
    this.stopped = true;
    this.waiting.length = 0;
    this.queued.clear();
    this.controller.abort(new Error('shutting down'));
    if (this.running.size === 0) return;
    await Promise.race([this.idle(), new Promise(resolve => setTimeout(resolve, timeoutMs).unref())]);
  }

  private pump(): void {
    while (!this.stopped && this.running.size < this.concurrency && this.waiting.length > 0) {
      const id = this.waiting.shift()!;
      this.queued.delete(id);
      this.running.add(id);
      void this.run(id, this.controller.signal)
        .catch(error => log.error('analysis run crashed', { id, error }))
        .finally(() => {
          this.running.delete(id);
          if (this.again.delete(id)) this.enqueue([id]);
          this.pump();
          this.settle();
        });
    }
    this.settle();
  }

  private settle(): void {
    if (this.size > 0) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
}
