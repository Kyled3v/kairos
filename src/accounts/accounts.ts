import type { CreateAgentOptions } from "../agents/identity.js";

export interface Account {
  readonly id: string;
  readonly displayName: string;
  /** Bearer token used to authenticate the account's requests. */
  readonly token: string;
  /** Maximum orchestration runs per rolling window. */
  readonly runsPerMinute: number;
  /** Maximum number of public agents this account may create. */
  readonly maxAgents: number;
  readonly createdAt: Date;
}

export interface AccountRecord {
  readonly account: Account;
  readonly runTimestamps: readonly Date[];
  readonly agentIds: readonly string[];
}

export interface CreateAccountOptions {
  readonly id?: string;
  readonly displayName: string;
  readonly token?: string;
  readonly runsPerMinute?: number;
  readonly maxAgents?: number;
}

/**
 * AccountRegistry — Phase 4 accounts: identity (bearer token), usage
 * quotas (rolling-window run limit) and agent-creation limits per
 * account. Registration, token lookup, quota accounting and public-agent
 * registration all live here so the HTTP layer stays thin.
 */
export class AccountRegistry {
  private readonly accounts = new Map<string, Account>();
  private readonly tokens = new Map<string, string>(); // token -> accountId
  private readonly usage = new Map<string, Date[]>(); // accountId -> run timestamps
  private readonly agentsByAccount = new Map<string, Set<string>>();
  private readonly usedAgentIds = new Set<string>();

  register(options: CreateAccountOptions): Account {
    const id = options.id ?? crypto.randomUUID();
    if (this.accounts.has(id)) {
      throw new Error(`Account already registered: ${id}`);
    }
    const token = options.token ?? crypto.randomUUID().replace(/-/g, "");
    if (this.tokens.has(token)) {
      throw new Error("Account token collides with an existing account.");
    }
    const account: Account = {
      id,
      displayName: options.displayName,
      token,
      runsPerMinute: options.runsPerMinute ?? 10,
      maxAgents: options.maxAgents ?? 3,
      createdAt: new Date(),
    };
    this.accounts.set(id, account);
    this.tokens.set(token, id);
    this.usage.set(id, []);
    this.agentsByAccount.set(id, new Set());
    return account;
  }

  /** Resolves an account by bearer token. Returns undefined when unknown. */
  byToken(token: string | undefined): Account | undefined {
    if (token === undefined || token.trim() === "") return undefined;
    const accountId = this.tokens.get(token);
    return accountId === undefined ? undefined : this.accounts.get(accountId);
  }

  byId(id: string): Account | undefined {
    return this.accounts.get(id);
  }

  list(): readonly Account[] {
    return [...this.accounts.values()];
  }

  /**
   * Records one run for the account against its rolling-window quota.
   * Returns false when the account exceeded runsPerMinute.
   */
  recordRun(accountId: string, now = new Date()): boolean {
    const account = this.accounts.get(accountId);
    if (account === undefined) return false;
    const windowMs = 60_000;
    const timestamps = (this.usage.get(accountId) ?? []).filter(
      (t) => now.getTime() - t.getTime() < windowMs,
    );
    if (timestamps.length >= account.runsPerMinute) {
      this.usage.set(accountId, timestamps);
      return false;
    }
    timestamps.push(now);
    this.usage.set(accountId, timestamps);
    return true;
  }

  /** Runs used by the account in the current rolling window. */
  runsInWindow(accountId: string): number {
    const windowMs = 60_000;
    const now = Date.now();
    return (this.usage.get(accountId) ?? []).filter(
      (t) => now - t.getTime() < windowMs,
    ).length;
  }

  /**
   * Registers a public agent under an account, enforcing the account's
   * maxAgents ceiling and globally unique agent ids.
   */
  registerAgent(accountId: string, agentId: string): void {
    const account = this.accounts.get(accountId);
    if (account === undefined) {
      throw new Error(`Unknown account: ${accountId}`);
    }
    if (this.usedAgentIds.has(agentId)) {
      throw new Error(`Agent id already taken: ${agentId}`);
    }
    const owned = this.agentsByAccount.get(accountId) ?? new Set();
    if (owned.size >= account.maxAgents) {
      throw new Error(
        `Account ${accountId} reached its agent limit (${account.maxAgents}).`,
      );
    }
    owned.add(agentId);
    this.agentsByAccount.set(accountId, owned);
    this.usedAgentIds.add(agentId);
  }

  /** Agent ids owned by the account. */
  agentsOwnedBy(accountId: string): readonly string[] {
    return [...(this.agentsByAccount.get(accountId) ?? [])];
  }

  /** The account that owns a public agent id, if any. */
  ownerOfAgent(agentId: string): Account | undefined {
    for (const [accountId, owned] of this.agentsByAccount) {
      if (owned.has(agentId)) return this.accounts.get(accountId);
    }
    return undefined;
  }

  snapshot(accountId: string): AccountRecord | undefined {
    const account = this.accounts.get(accountId);
    if (account === undefined) return undefined;
    return {
      account,
      runTimestamps: this.usage.get(accountId) ?? [],
      agentIds: this.agentsOwnedBy(accountId),
    };
  }
}
