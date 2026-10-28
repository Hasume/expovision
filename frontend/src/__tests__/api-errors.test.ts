import { describe, it, expect } from "vitest";
import { normalizeApiErrorMessage } from "@/features/api-errors";

// ---------------------------------------------------------------------------
// 429 / Rate limit
// ---------------------------------------------------------------------------

describe("normalizeApiErrorMessage — 429", () => {
  it("returns a friendly Russian message for 429 without Retry-After", () => {
    const msg = normalizeApiErrorMessage(429, '{"detail":"Too many requests"}', "ru");
    expect(msg).toContain("Слишком много запросов");
    expect(msg).not.toContain("Retry-After");
  });

  it("returns a friendly English message for 429 without Retry-After", () => {
    const msg = normalizeApiErrorMessage(429, '{"detail":"Too many requests"}', "en");
    expect(msg).toContain("Too many requests");
  });

  it("includes retry time in Russian when Retry-After header is present", () => {
    const msg = normalizeApiErrorMessage(429, '{"detail":"Rate limit exceeded. Retry after 30s."}', "ru", "30");
    expect(msg).toContain("Слишком много запросов");
    expect(msg).toContain("30");
    expect(msg).toContain("с.");
  });

  it("includes retry time in English when Retry-After header is present", () => {
    const msg = normalizeApiErrorMessage(429, '{"detail":"Rate limit exceeded."}', "en", "15");
    expect(msg).toContain("Too many requests");
    expect(msg).toContain("15");
    expect(msg).toContain("Retry after");
  });

  it("handles structured JSON 429 body (new backend format)", () => {
    const body = JSON.stringify({
      detail: "Rate limit exceeded. Retry after 45s.",
      retry_after: 45,
      limit: 10,
      window_seconds: 60,
    });
    const msg = normalizeApiErrorMessage(429, body, "ru", "45");
    expect(msg).toContain("Слишком много запросов");
    expect(msg).toContain("45");
  });

  it("does not include retry text when retryAfter is null", () => {
    const msg = normalizeApiErrorMessage(429, '{"detail":"Too many requests"}', "ru", null);
    expect(msg).toBe("Слишком много запросов. Попробуйте чуть позже.");
  });

  it("does not include retry text when retryAfter is undefined", () => {
    const msg = normalizeApiErrorMessage(429, '{"detail":"Too many requests"}', "en");
    expect(msg).toBe("Too many requests. Please try again shortly.");
  });
});

// ---------------------------------------------------------------------------
// Other status codes
// ---------------------------------------------------------------------------

describe("normalizeApiErrorMessage — other statuses", () => {
  it("returns a 404 message", () => {
    const msg = normalizeApiErrorMessage(404, "", "ru");
    expect(msg).toContain("не найден");
  });

  it("returns a 422 message", () => {
    const msg = normalizeApiErrorMessage(422, "", "ru");
    expect(msg).toContain("Проверьте");
  });

  it("returns a 500 message", () => {
    const msg = normalizeApiErrorMessage(500, "", "ru");
    expect(msg).toContain("временно недоступен");
  });

  it("does not expose stack traces in 500 body", () => {
    const msg = normalizeApiErrorMessage(200, "Traceback (most recent call last): some error", "ru");
    expect(msg).toContain("временно недоступен");
    expect(msg).not.toContain("Traceback");
  });

  it("returns invalid credentials message", () => {
    const msg = normalizeApiErrorMessage(401, '{"detail":"Invalid credentials"}', "ru");
    expect(msg).toContain("Неверный email");
  });

  it("parses FastAPI validation errors (422 array detail)", () => {
    const body = JSON.stringify({
      detail: [
        { msg: "field required", loc: ["body", "email"] },
        { msg: "value is not a valid email", loc: ["body", "email"] },
      ],
    });
    const msg = normalizeApiErrorMessage(422, body, "ru");
    // Falls into 422 catch → generic message
    expect(msg).toContain("Проверьте");
  });

  it("returns plain string detail for unknown errors", () => {
    const msg = normalizeApiErrorMessage(400, '{"detail":"Custom business error"}', "ru");
    expect(msg).toBe("Custom business error");
  });
});
