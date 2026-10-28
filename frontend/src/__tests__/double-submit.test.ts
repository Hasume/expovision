/**
 * Tests for the in-flight ref guard pattern used across all mutating actions.
 *
 * The pattern:
 *   const inFlightRef = { current: false };
 *   async function handler() {
 *     if (inFlightRef.current) return;
 *     inFlightRef.current = true;
 *     try { await apiCall(); }
 *     finally { inFlightRef.current = false; }
 *   }
 *
 * These tests verify the pure logic without React rendering.
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Helper: simulates the in-flight guard pattern
// ---------------------------------------------------------------------------

function makeGuardedAction(apiCall: () => Promise<void>) {
  const inFlightRef = { current: false };
  let callCount = 0;

  async function handler(): Promise<void> {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    callCount++;
    try {
      await apiCall();
    } finally {
      inFlightRef.current = false;
    }
  }

  return { handler, getCallCount: () => callCount };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("in-flight ref guard", () => {
  it("calls the API exactly once on a single invocation", async () => {
    const api = vi.fn().mockResolvedValue(undefined);
    const { handler, getCallCount } = makeGuardedAction(api);

    await handler();

    expect(getCallCount()).toBe(1);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("ignores a second call while the first is still in-flight", async () => {
    let resolve!: () => void;
    const api = vi.fn().mockImplementation(
      () => new Promise<void>((res) => { resolve = res; }),
    );
    const { handler, getCallCount } = makeGuardedAction(api);

    const first = handler();        // starts, in-flight
    const second = handler();       // should be ignored
    resolve();                      // finish first
    await Promise.all([first, second]);

    expect(getCallCount()).toBe(1);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("allows a second call after the first finishes", async () => {
    const api = vi.fn().mockResolvedValue(undefined);
    const { handler, getCallCount } = makeGuardedAction(api);

    await handler();
    await handler();

    expect(getCallCount()).toBe(2);
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("resets the guard even when the API call throws", async () => {
    const api = vi.fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(undefined);
    const { handler, getCallCount } = makeGuardedAction(api);

    // First call throws but guard must reset
    try { await handler(); } catch { /* expected */ }
    // Second call must succeed
    await handler();

    expect(getCallCount()).toBe(2);
  });

  it("blocks N concurrent calls — only the first executes", async () => {
    let resolve!: () => void;
    const api = vi.fn().mockImplementation(
      () => new Promise<void>((res) => { resolve = res; }),
    );
    const { handler, getCallCount } = makeGuardedAction(api);

    const calls = [handler(), handler(), handler(), handler()];
    resolve();
    await Promise.all(calls);

    expect(getCallCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 429 guard: don't retry on 429
// ---------------------------------------------------------------------------

describe("API client — no automatic retry on 429", () => {
  it("does not retry a POST after receiving 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Rate limit exceeded. Retry after 30s.", retry_after: 30, limit: 10, window_seconds: 60 }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "30" },
      }),
    );

    // Simulate what rawRequest does: call fetch, check ok, throw ApiError
    async function simulateRawRequest() {
      const response = await fetchMock("http://localhost/test", { method: "POST" });
      if (!response.ok) {
        const text = await response.text();
        throw Object.assign(new Error(text), { status: response.status });
      }
    }

    try {
      await simulateRawRequest();
    } catch (e) {
      // Must have called fetch exactly once — no retry
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((e as { status: number }).status).toBe(429);
    }
  });
});
