/**
 * Tests for the signup rate limiter (lib/utils/signup-rate-limit.ts).
 *
 * Strategy: mock @upstash/ratelimit and @upstash/redis at the module level
 * so no real Redis connection is needed.  Tests cover:
 *   1. Allowed request (limiter returns success=true)
 *   2. Blocked request (limiter returns success=false) → RateLimitError thrown
 *   3. Limiter unavailable (env vars missing) → RateLimitError with isLimiterUnavailable=true
 *   4. Redis call throws → RateLimitError with isLimiterUnavailable=true (fail-closed)
 *   5. getClientIp extracts the first x-forwarded-for value correctly
 *   6. Structural: server-only import present, no NEXT_PUBLIC_ leak
 *
 * These run without network access.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { NextRequest } from "next/server";

/** Minimal request stub for getClientIp tests (only needs headers.get). */
function makeMinimalRequest(xff: string | null): NextRequest {
  return {
    headers: {
      get(name: string): string | null {
        return name === "x-forwarded-for" ? xff : null;
      },
    },
  } as unknown as NextRequest;
}

// ── Source assertions (no mocking needed) ────────────────────────────────────

describe("signup-rate-limit source structure", () => {
  const src = readFileSync(
    resolve(__dirname, "../lib/utils/signup-rate-limit.ts"),
    "utf8"
  );

  it('imports "server-only"', () => {
    expect(src).toContain('import "server-only"');
  });

  it("does not access NEXT_PUBLIC_ prefixed env vars at runtime (only in comments)", () => {
    // Strip comments from the source, then verify no NEXT_PUBLIC_ access remains.
    // This guards against accidentally reading process.env.NEXT_PUBLIC_... in code.
    const codeOnly = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(codeOnly).not.toMatch(/process\.env\.NEXT_PUBLIC_/);
  });

  it("reads IP from x-forwarded-for (platform-injected header)", () => {
    expect(src).toContain("x-forwarded-for");
  });

  it("uses sliding window rate limiting strategy", () => {
    expect(src).toContain("slidingWindow");
  });

  it("exports RateLimitError with isLimiterUnavailable property", () => {
    expect(src).toContain("isLimiterUnavailable");
  });

  it("uses rl:signup prefix to avoid key collisions", () => {
    expect(src).toContain("rl:signup");
  });
});

// ── getClientIp — unit tests ─────────────────────────────────────────────────

// We can test getClientIp directly without mocking Redis by importing the
// module with env vars set (the limiter is lazy-initialized).

describe("getClientIp", () => {
  beforeEach(() => {
    // Provide dummy env vars so the module initializes without throwing.
    process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetModules();
  });

  it("returns the first IP from x-forwarded-for with single value", async () => {
    const { getClientIp } = await import("@/lib/utils/signup-rate-limit");
    const req = makeMinimalRequest("1.2.3.4");
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("returns the first IP from x-forwarded-for with multiple values", async () => {
    const { getClientIp } = await import("@/lib/utils/signup-rate-limit");
    const req = makeMinimalRequest("1.2.3.4, 10.0.0.1, 192.168.1.1");
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("returns 'unknown' when x-forwarded-for is missing", async () => {
    const { getClientIp } = await import("@/lib/utils/signup-rate-limit");
    const req = makeMinimalRequest(null);
    expect(getClientIp(req)).toBe("unknown");
  });

  it("trims whitespace from the extracted IP", async () => {
    const { getClientIp } = await import("@/lib/utils/signup-rate-limit");
    const req = makeMinimalRequest("  5.6.7.8  , 10.0.0.1");
    expect(getClientIp(req)).toBe("5.6.7.8");
  });
});

// ── checkSignupRateLimit — mocked Redis tests ─────────────────────────────────

describe("checkSignupRateLimit — allowed request", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
    // Mock must be registered before the module is imported.
    vi.doMock("@upstash/redis", () => ({
      Redis: function Redis(this: unknown) { return {}; },
    }));
    vi.doMock("@upstash/ratelimit", () => {
      function Ratelimit(this: unknown) {}
      Ratelimit.slidingWindow = () => ({});
      (Ratelimit.prototype as Record<string, unknown>).limit = async function() {
        return { success: true, limit: 5, remaining: 4, reset: Date.now() + 3600000 };
      };
      return { Ratelimit };
    });
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetModules();
  });

  it("does not throw when the limiter allows the request", async () => {
    const { checkSignupRateLimit } = await import("@/lib/utils/signup-rate-limit");
    await expect(checkSignupRateLimit("1.2.3.4")).resolves.toBeUndefined();
  });
});

describe("checkSignupRateLimit — blocked request", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
    vi.doMock("@upstash/redis", () => ({
      Redis: function Redis(this: unknown) { return {}; },
    }));
    vi.doMock("@upstash/ratelimit", () => {
      function Ratelimit(this: unknown) {}
      Ratelimit.slidingWindow = () => ({});
      (Ratelimit.prototype as Record<string, unknown>).limit = async function() {
        return { success: false, limit: 5, remaining: 0, reset: Date.now() + 3600000 };
      };
      return { Ratelimit };
    });
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetModules();
  });

  it("throws RateLimitError with isLimiterUnavailable=false when rate exceeded", async () => {
    const { checkSignupRateLimit, RateLimitError } = await import("@/lib/utils/signup-rate-limit");
    try {
      await checkSignupRateLimit("1.2.3.4");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as InstanceType<typeof RateLimitError>).isLimiterUnavailable).toBe(false);
    }
  });
});

describe("checkSignupRateLimit — limiter unavailable (no env vars)", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("throws RateLimitError with isLimiterUnavailable=true when env vars missing", async () => {
    const { checkSignupRateLimit, RateLimitError } = await import("@/lib/utils/signup-rate-limit");
    try {
      await checkSignupRateLimit("1.2.3.4");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as InstanceType<typeof RateLimitError>).isLimiterUnavailable).toBe(true);
    }
  });
});

describe("checkSignupRateLimit — Redis call throws (fail-closed)", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
    vi.doMock("@upstash/redis", () => ({
      Redis: function Redis(this: unknown) { return {}; },
    }));
    vi.doMock("@upstash/ratelimit", () => {
      function Ratelimit(this: unknown) {}
      Ratelimit.slidingWindow = () => ({});
      (Ratelimit.prototype as Record<string, unknown>).limit = async function() {
        throw new Error("ECONNREFUSED");
      };
      return { Ratelimit };
    });
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetModules();
  });

  it("throws RateLimitError with isLimiterUnavailable=true when Redis is unreachable", async () => {
    const { checkSignupRateLimit, RateLimitError } = await import("@/lib/utils/signup-rate-limit");
    try {
      await checkSignupRateLimit("1.2.3.4");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as InstanceType<typeof RateLimitError>).isLimiterUnavailable).toBe(true);
    }
  });
});

// ── signUpAction rate-limit integration (structural) ──────────────────────────

describe("signUpAction rate-limit integration (structural)", () => {
  const src = readFileSync(
    resolve(__dirname, "../app/actions/auth.ts"),
    "utf8"
  );

  it("imports checkSignupRateLimit and RateLimitError", () => {
    expect(src).toContain("checkSignupRateLimit");
    expect(src).toContain("RateLimitError");
  });

  it("rate limit check occurs before any Supabase call", () => {
    const start = src.indexOf("export async function signUpAction");
    const end = src.indexOf("export async function signInAction");
    const body = src.slice(start, end);

    const rateLimitPos = body.indexOf("checkSignupRateLimit");
    const adminCallPos = body.indexOf("createAdminClient()");

    expect(rateLimitPos).toBeGreaterThan(-1);
    expect(adminCallPos).toBeGreaterThan(-1);
    expect(rateLimitPos).toBeLessThan(adminCallPos);
  });

  it("limiter unavailable returns a generic 503-style message, not an empty error", () => {
    expect(src).toContain("Service temporarily unavailable. Please try again later.");
  });

  it("rate-exceeded returns the same generic rate-limit message as Supabase GoTrue limits", () => {
    // Both app-level and Supabase-level rate limits produce the same message
    // so the client cannot distinguish them.
    expect(src).toContain("Too many attempts. Please wait a moment and try again.");
  });

  it("rate limit error catch block does not log the IP or user input", () => {
    // Find the catch block lines around the rate limit section.
    const start = src.indexOf("// ── Rate limiting");
    const end = src.indexOf("const rawPhone");
    const rateLimitSection = src.slice(start, end);

    const consoleLines = rateLimitSection
      .split("\n")
      .filter((l) => l.includes("console."));
    for (const line of consoleLines) {
      // Must not log ip, phone, or password variables.
      expect(line).not.toContain("ip}");
      expect(line).not.toContain("rawPhone");
      expect(line).not.toContain("password");
    }
  });
});
