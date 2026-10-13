/**
 * A small in-memory request limit, for the one endpoint that spends money.
 *
 * The public data API has a limiter backed by a shared store (`rateLimit.ts`),
 * which is off until that store is configured. The AI explainer cannot wait for
 * that: every call costs a model request on someone's key, so it must be
 * limited on a fresh checkout too. This one needs nothing configured.
 *
 * It counts per server process. On a host that runs several instances, a
 * caller can get the limit once per instance, so it bounds abuse rather than
 * metering it exactly. That is the right trade for a guard that must always be
 * on; exact metering is what the shared limiter is for.
 */

export type LocalLimit = { ok: boolean; retryAfterSeconds: number };

type Window = { startedAt: number; count: number };

/** Forget idle keys once the table grows past this, so it cannot grow without bound. */
const MAX_KEYS = 5000;

export function createLocalLimiter(maxRequests: number, windowMs: number) {
  const windows = new Map<string, Window>();

  return function check(key: string, now: number = Date.now()): LocalLimit {
    if (windows.size > MAX_KEYS) {
      for (const [k, w] of windows) if (now - w.startedAt >= windowMs) windows.delete(k);
    }

    const current = windows.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      windows.set(key, { startedAt: now, count: 1 });
      return { ok: true, retryAfterSeconds: 0 };
    }
    if (current.count >= maxRequests) {
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1000)) };
    }
    current.count += 1;
    return { ok: true, retryAfterSeconds: 0 };
  };
}
