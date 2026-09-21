import { describe, expect, it } from "vitest";
import { AccountRegistry } from "../../src/accounts/accounts.js";

describe("AccountRegistry", () => {
  it("registers accounts with auto-generated tokens and stable ids", () => {
    const registry = new AccountRegistry();
    const account = registry.register({ id: "acct-1", displayName: "Kyle" });

    expect(account.id).toBe("acct-1");
    expect(account.token).toMatch(/^[a-f0-9]{32}$/);
    expect(account.runsPerMinute).toBe(10);
    expect(account.maxAgents).toBe(3);
  });

  it("resolves accounts by bearer token and rejects unknown tokens", () => {
    const registry = new AccountRegistry();
    const account = registry.register({ displayName: "Kyle", token: "secret-token" });

    expect(registry.byToken("secret-token")?.id).toBe(account.id);
    expect(registry.byToken("wrong")).toBeUndefined();
    expect(registry.byToken(undefined)).toBeUndefined();
  });

  it("rejects duplicate ids and colliding tokens", () => {
    const registry = new AccountRegistry();
    registry.register({ id: "acct-1", displayName: "A", token: "tok-1" });

    expect(() => registry.register({ id: "acct-1", displayName: "B" })).toThrow(/already registered/i);
    expect(() => registry.register({ displayName: "C", token: "tok-1" })).toThrow(/collides/i);
  });

  it("enforces the rolling-window run quota", () => {
    const registry = new AccountRegistry();
    const account = registry.register({ displayName: "Quota", runsPerMinute: 3 });

    expect(registry.recordRun(account.id)).toBe(true);
    expect(registry.recordRun(account.id)).toBe(true);
    expect(registry.recordRun(account.id)).toBe(true);
    expect(registry.recordRun(account.id)).toBe(false); // quota hit
    expect(registry.runsInWindow(account.id)).toBe(3);

    // Old timestamps fall out of the window.
    const future = new Date(Date.now() + 61_000);
    expect(registry.recordRun(account.id, future)).toBe(true);
  });

  it("enforces per-account agent creation limits", () => {
    const registry = new AccountRegistry();
    const account = registry.register({ displayName: "Creator", maxAgents: 2 });

    registry.registerAgent(account.id, "agent-a");
    registry.registerAgent(account.id, "agent-b");
    expect(() => registry.registerAgent(account.id, "agent-c")).toThrow(/agent limit/i);
    expect(registry.agentsOwnedBy(account.id)).toEqual(["agent-a", "agent-b"]);
  });

  it("keeps public agent ids globally unique across accounts", () => {
    const registry = new AccountRegistry();
    const a = registry.register({ displayName: "A" });
    const b = registry.register({ displayName: "B" });

    registry.registerAgent(a.id, "shared-name");
    expect(() => registry.registerAgent(b.id, "shared-name")).toThrow(/already taken/i);

    expect(registry.ownerOfAgent("shared-name")?.id).toBe(a.id);
  });

  it("refuses agent registration for unknown accounts and snapshots usage", () => {
    const registry = new AccountRegistry();
    const account = registry.register({ displayName: "Snap" });

    expect(() => registry.registerAgent("ghost", "agent-x")).toThrow(/unknown account/i);

    registry.recordRun(account.id);
    registry.registerAgent(account.id, "agent-x");
    const snap = registry.snapshot(account.id);
    expect(snap?.agentIds).toEqual(["agent-x"]);
    expect(snap?.runTimestamps.length).toBe(1);
  });
});
