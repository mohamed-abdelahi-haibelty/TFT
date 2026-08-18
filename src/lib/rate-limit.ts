type Bucket = { count: number; resetAt: number };

// In-memory, per-lambda-instance only — resets on cold start and isn't
// shared across concurrent instances, so this is a courtesy limit, not the
// production guarantee (task 11: "simple in-memory/Vercel-friendly limiter;
// Cloudflare rule documented"). Production should also add a Cloudflare WAF
// rate-limiting rule on POST /api/orders (cap requests per IP per minute at
// the edge), which holds across instances where this can't.
const buckets = new Map<string, Bucket>();
let callsSinceSweep = 0;

/** Fixed-window limiter: `true` if `key` has not yet hit `limit` requests within the current `windowMs` window. */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();

  // Opportunistic sweep so long-lived warm instances don't accumulate one
  // bucket per distinct IP forever.
  callsSinceSweep += 1;
  if (callsSinceSweep >= 500) {
    callsSinceSweep = 0;
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
}
