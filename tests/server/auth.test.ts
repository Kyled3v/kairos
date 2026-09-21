import { describe, expect, it } from "vitest";
import { AuthMiddleware } from "../../src/server/auth.js";

describe("AuthMiddleware", () => {
  it("allows request when no token configured (dev mode)", () => {
    const auth = new AuthMiddleware({ apiToken: "" });
    const result = auth.check("127.0.0.1", undefined);
    expect(result.allowed).toBe(true);
  });

  it("returns 401 when token configured and no Authorization header", () => {
    const auth = new AuthMiddleware({ apiToken: "secret" });
    const result = auth.check("127.0.0.1", undefined);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
  });

  it("returns 401 when wrong token supplied", () => {
    const auth = new AuthMiddleware({ apiToken: "secret" });
    const result = auth.check("127.0.0.1", "Bearer wrongtoken");
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
  });

  it("allows request when correct token supplied", () => {
    const auth = new AuthMiddleware({ apiToken: "secret" });
    const result = auth.check("127.0.0.1", "Bearer secret");
    expect(result.allowed).toBe(true);
  });

  it("returns 429 when rate limit exceeded", () => {
    const auth = new AuthMiddleware({ apiToken: "", rateLimit: { requestsPerMinute: 3 } });
    auth.check("10.0.0.1", undefined);
    auth.check("10.0.0.1", undefined);
    auth.check("10.0.0.1", undefined);
    const result = auth.check("10.0.0.1", undefined);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(429);
  });

  it("rate limit is per IP — different IPs do not share the window", () => {
    const auth = new AuthMiddleware({ apiToken: "", rateLimit: { requestsPerMinute: 2 } });
    auth.check("1.1.1.1", undefined);
    auth.check("1.1.1.1", undefined);
    const blocked = auth.check("1.1.1.1", undefined);
    const allowed = auth.check("2.2.2.2", undefined);
    expect(blocked.status).toBe(429);
    expect(allowed.allowed).toBe(true);
  });

  it("auth check happens before rate limit — wrong token does not consume rate limit slot", () => {
    const auth = new AuthMiddleware({ apiToken: "secret", rateLimit: { requestsPerMinute: 2 } });
    // Three bad-token attempts
    auth.check("3.3.3.3", "Bearer wrong");
    auth.check("3.3.3.3", "Bearer wrong");
    auth.check("3.3.3.3", "Bearer wrong");
    // Correct token should still work (rate window not consumed by auth failures)
    const result = auth.check("3.3.3.3", "Bearer secret");
    expect(result.allowed).toBe(true);
  });

  it("accepts a registered account token when accountTokens is provided", () => {
    const auth = new AuthMiddleware({
      apiToken: "secret",
      accountTokens: { hasToken: (token) => token === "acct-token" },
    });
    expect(auth.check("9.9.9.9", "Bearer acct-token").allowed).toBe(true);
  });

  it("still rejects unknown tokens when accountTokens is provided", () => {
    const auth = new AuthMiddleware({
      apiToken: "secret",
      accountTokens: { hasToken: (token) => token === "acct-token" },
    });
    const result = auth.check("9.9.9.9", "Bearer not-a-known-token");
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
  });

  it("rejects a known account token when no accountTokens resolver is configured", () => {
    const auth = new AuthMiddleware({ apiToken: "secret" });
    const result = auth.check("9.9.9.9", "Bearer acct-token");
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(401);
  });
});
