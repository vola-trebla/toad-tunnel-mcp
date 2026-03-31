export interface TunnelLifecycleOptions {
  /** SSH keepalive interval in ms (default 30s) */
  keepalive_interval_ms: number;
  /** Close tunnel after this many ms of inactivity (default 5min) */
  idle_timeout_ms: number;
  /** Max SSH reconnect attempts on unexpected drop (default 3) */
  max_retries: number;
  /** Base delay for exponential backoff in ms (default 2s) */
  retry_delay_ms: number;
  /** Called when all reconnect retries are exhausted */
  onGiveUp?: (env: string) => void;
}

export const DEFAULT_LIFECYCLE: TunnelLifecycleOptions = {
  keepalive_interval_ms: 30_000,
  idle_timeout_ms: 300_000,
  max_retries: 3,
  retry_delay_ms: 2_000,
};

/**
 * Tracks last-activity time per env and fires onIdle when idle_timeout_ms elapses.
 * Uses setTimeout with remaining-time recalculation for precise idle detection.
 * Decoupled from SSH logic so it can be tested with fake timers.
 */
export class IdleTracker {
  private readonly lastActivity = new Map<string, number>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly idleTimeoutMs: number,
    private readonly onIdle: (env: string) => void,
  ) {}

  start(env: string): void {
    this.touch(env);
    if (this.timers.has(env)) return;
    this._scheduleCheck(env);
  }

  touch(env: string): void {
    this.lastActivity.set(env, Date.now());
  }

  stop(env: string): void {
    const timer = this.timers.get(env);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(env);
    }
    this.lastActivity.delete(env);
  }

  stopAll(): void {
    for (const env of [...this.timers.keys()]) {
      this.stop(env);
    }
  }

  private _scheduleCheck(env: string): void {
    const last = this.lastActivity.get(env) ?? Date.now();
    const remaining = this.idleTimeoutMs - (Date.now() - last);

    const timer = setTimeout(
      () => {
        const elapsed = Date.now() - (this.lastActivity.get(env) ?? 0);
        if (elapsed >= this.idleTimeoutMs) {
          this.stop(env);
          this.onIdle(env);
        } else {
          this._scheduleCheck(env);
        }
      },
      Math.max(remaining, 100),
    );
    timer.unref();

    this.timers.set(env, timer);
  }
}
