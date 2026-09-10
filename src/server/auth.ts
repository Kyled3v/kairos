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
  private readonly windows = new Map<string, WindowEntry>();

  constructor(options: AuthOptions = {}) {
    this.apiToken = options.apiToken ?? process.env["KAIROS_API_TOKEN"];
    this.requestsPerMinute = options.rateLimit?.requestsPerMinute ?? 60;
  }

  check(ip: string, authHeader: string | undefined): AuthResult {
    // Auth check
    if (this.apiToken !== undefined && this.apiToken.trim() !== "") {
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
      if (token === undefined || token !== this.apiToken) {
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
