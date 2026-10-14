/**
 * Application-level signup rate limiter — SERVER-SIDE ONLY.
 *
 * Provides a persistent, distributed sliding-window rate limit for the
 * public signUpAction endpoint, backed by Upstash Redis.
 *
 * WHY UPSTASH REDIS:
 *   This application runs on Vercel (serverless / edge). In-memory counters
 *   reset when a new Lambda instance is cold-started, making them useless
 *   against distributed abuse.  Upstash Redis is an HTTP-based Redis
 *   compatible service with a generous free tier (10,000 req/day, 256 MB)
 *   that works correctly in serverless environments.
 *
 * REQUIRED ENVIRONMENT VARIABLES (server-side only — never NEXT_PUBLIC_):
 *   UPSTASH_REDIS_REST_URL   — e.g. https://us1-xxx.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN — the REST API token from the Upstash console
 *
 * COST / FREE TIER:
 *   Upstash free tier: 10,000 commands/day, 256 MB storage, no credit card.
 *   At 5 signup attempts per IP per hour, the free tier sustains ~2,000
 *   unique IPs per day before the daily limit is reached.
 *   Production upgrade: pay-as-you-go at $0.20 per 100k commands.
 *   Dashboard: https://console.upstash.com/
 *
 * SETUP STEPS:
 *   1. Create a free account at https://upstash.com/
 *   2. Create a Redis database (region closest to your Vercel deployment).
 *   3. Copy "REST URL" and "REST Token" from the database details page.
 *   4. Add to Vercel: Settings → Environment Variables:
 *        UPSTASH_REDIS_REST_URL=<paste>
 *        UPSTASH_REDIS_REST_TOKEN=<paste>
 *   5. Add the same values to .env.local for local development.
 *      (Local rate limiting will be real but isolated from production.)
 *
 * IP SOURCE:
 *   On Vercel, the platform terminates TLS and injects the real client IP
 *   as the FIRST value in the `x-forwarded-for` header before forwarding
 *   to the Lambda.  We trust only the first value.  We do NOT trust
 *   client-supplied headers such as `x-real-ip` or a client-crafted
 *   `x-forwarded-for` with multiple values — only the platform-injected
 *   first hop is used.
 *
 * FAIL BEHAVIOUR:
 *   If Upstash is unreachable or the environment variables are not set,
 *   checkSignupRateLimit() throws a RateLimitError with isLimiterUnavailable=true.
 *   signUpAction catches this and returns a 503-style error message so that
 *   unlimited unauthenticated signup is never silently permitted.
 *
 * SHARED-IP CONSIDERATION:
 *   The limit of 5 signups/IP/hour is generous for real users (most create
 *   one account ever), but a single school/office NAT could share an IP.
 *   The limit is intentionally set higher than a single-user need while
 *   still being restrictive enough to block bots.  Operators can adjust
 *   SIGNUP_RATE_LIMIT_REQUESTS and SIGNUP_RATE_LIMIT_WINDOW_SECONDS via
 *   environment variables without a code change.
 */

import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

// ── Configuration ────────────────────────────────────────────────────────────

/** Maximum signup attempts per IP in one sliding window. */
const REQUESTS =
  Number(process.env.SIGNUP_RATE_LIMIT_REQUESTS) || 5;

/** Sliding window duration in seconds (default: 1 hour). */
const WINDOW_SECONDS =
  Number(process.env.SIGNUP_RATE_LIMIT_WINDOW_SECONDS) || 3600;

// ── Rate limiter singleton ────────────────────────────────────────────────────

/**
 * Lazily created rate limiter. `undefined` means env vars are missing.
 * We use a function so initialization errors surface at call time, not
 * at module load time (which would break all server-side imports).
 */
function buildLimiter(): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redis = new Redis({ url, token });
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(REQUESTS, `${WINDOW_SECONDS} s`),
    // Prefix avoids key collisions with other rate limiters in the same DB.
    prefix: "rl:signup",
    // Analytics gives per-identifier request counts in the Upstash console.
    analytics: false,
  });
}

let _limiter: Ratelimit | null | undefined = undefined;

function getLimiter(): Ratelimit | null {
  if (_limiter === undefined) {
    _limiter = buildLimiter();
  }
  return _limiter;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Thrown when the rate limit is exceeded or the limiter is unavailable. */
export class RateLimitError extends Error {
  /** true when Upstash is unreachable or misconfigured (fail-closed). */
  readonly isLimiterUnavailable: boolean;

  constructor(message: string, isLimiterUnavailable = false) {
    super(message);
    this.name = "RateLimitError";
    this.isLimiterUnavailable = isLimiterUnavailable;
  }
}

/**
 * Extracts the real client IP from a Next.js request, trusting only
 * the first value of the Vercel-injected `x-forwarded-for` header.
 *
 * Returns "unknown" if no IP can be determined; the rate limiter will
 * still apply using that identifier (fail-closed for anonymous traffic).
 */
export function getClientIp(request: NextRequest): string {
  // Vercel sets x-forwarded-for to "<real-ip>, <proxy1>, ..."
  // The first value is the client IP injected by the platform.
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  return "unknown";
}

/**
 * Checks whether the given IP is within the signup rate limit.
 *
 * @param ip - Client IP (E.g. from getClientIp).
 * @throws {RateLimitError} if rate-limited OR if the limiter is unavailable.
 *
 * The caller must treat both cases as a hard stop for the signup flow.
 * Distinguishing them is only relevant for logging (isLimiterUnavailable).
 */
export async function checkSignupRateLimit(ip: string): Promise<void> {
  const limiter = getLimiter();

  if (!limiter) {
    // Env vars not set — fail closed; do not allow unlimited signups.
    throw new RateLimitError(
      "[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not configured",
      true
    );
  }

  let result: { success: boolean; limit: number; remaining: number; reset: number };
  try {
    result = await limiter.limit(ip);
  } catch (err) {
    // Redis unreachable — fail closed.
    const message =
      err instanceof Error ? err.message : String(err);
    throw new RateLimitError(
      `[rate-limit] Upstash Redis request failed: ${message}`,
      true
    );
  }

  if (!result.success) {
    throw new RateLimitError(
      `[rate-limit] IP rate-limited: remaining=${result.remaining} reset=${result.reset}`,
      false
    );
  }
}
