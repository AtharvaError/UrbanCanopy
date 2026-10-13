import { describe, it, expect } from "vitest";
import { createLocalLimiter } from "./localRateLimit";

describe("createLocalLimiter", () => {
  it("lets the allowed number through and refuses the next", () => {
    const check = createLocalLimiter(3, 60_000);
    expect(check("a", 0).ok).toBe(true);
    expect(check("a", 1).ok).toBe(true);
    expect(check("a", 2).ok).toBe(true);
    expect(check("a", 3)).toEqual({ ok: false, retryAfterSeconds: 60 });
  });

  it("says how long is left in the window", () => {
    const check = createLocalLimiter(1, 60_000);
    check("a", 0);
    expect(check("a", 45_000).retryAfterSeconds).toBe(15);
  });

  it("starts a fresh count when the window has passed", () => {
    const check = createLocalLimiter(1, 60_000);
    expect(check("a", 0).ok).toBe(true);
    expect(check("a", 59_999).ok).toBe(false);
    expect(check("a", 60_000).ok).toBe(true);
  });

  it("counts each caller separately", () => {
    const check = createLocalLimiter(1, 60_000);
    expect(check("a", 0).ok).toBe(true);
    expect(check("b", 0).ok).toBe(true);
    expect(check("a", 1).ok).toBe(false);
  });

  it("does not grow without bound under a flood of new callers", () => {
    const check = createLocalLimiter(1, 1000);
    for (let i = 0; i < 6000; i++) check(`caller-${i}`, 0);
    // Past the window, the next call clears everything that has expired.
    expect(check("late", 5000).ok).toBe(true);
    expect(check("caller-1", 5000).ok).toBe(true);
  });
});
