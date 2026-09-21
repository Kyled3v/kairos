/**
 * KAIROS HTTP server — auth, rate limiting, request ID.
 * Bearer token auth: set KAIROS_API_TOKEN env var. If unset, auth is disabled (dev mode).
 * Rate limiting: in-memory sliding window per IP.
 */

export interface RateLimitOptions {
  readonly requestsPerMinute: number;
}

export interface AuthOptions {
  readonly apiToken?: string;
  readonly rateLimit?: RateLimitOptions;
  /**
   * Account token resolver (Phase 4 public agents). When provided, a
   * bearer token that matches a registered account is accepted in
   * addition to the global apiToken. Route handlers still resolve the
   * account themselves, so unknown resources under a valid account
   * token still fail closed (403/404).
   */
  readonly accountTokens?: { hasToken(token: string): boolean };
}

export interface AuthResult {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly status?: 401 | 429;
}

interface WindowEntry {
  timestamps: number[];
}

export class AuthMiddleware {
  private readonly apiToken: string | undefined;
  private readonly requestsPerMinute: number;
  private readonly accountTokens: { hasToken(token: string): boolean } | undefined;
  private readonly windows = new Map<string, WindowEntry>();

  constructor(options: AuthOptions = {}) {
    this.apiToken = options.apiToken ?? process.env["KAIROS_API_TOKEN"];
    this.requestsPerMinute = options.rateLimit?.requestsPerMinute ?? 60;
    this.accountTokens = options.accountTokens;
  }

  check(ip: string, authHeader: string | undefined): AuthResult {
    // Auth check
    if (this.apiToken !== undefined && this.apiToken.trim() !== "") {
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
      const matchesGlobal = token !== undefined && token === this.apiToken;
      const matchesAccount =
        !matchesGlobal &&
        token !== undefined &&
        this.accountTokens?.hasToken(token) === true;
      if (!matchesGlobal && !matchesAccount) {
        return { allowed: false, reason: "Unauthorized", status: 401 };
      }
    }

    // Rate limit check
    const now = Date.now();
    const windowMs = 60_000;
    const entry = this.windows.get(ip) ?? { timestamps: [] };
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
    if (entry.timestamps.length >= this.requestsPerMinute) {
      this.windows.set(ip, entry);
      return { allowed: false, reason: "Too Many Requests", status: 429 };
    }
    entry.timestamps.push(now);
    this.windows.set(ip, entry);
    return { allowed: true };
  }
}
