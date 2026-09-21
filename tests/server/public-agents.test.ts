import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createKairosServer } from "../../src/server/http-server.js";
import { AccountRegistry } from "../../src/accounts/accounts.js";
import { createKairos } from "../../src/factory/index.js";
import { createPipelineDependencies } from "../../src/factory/pipeline-dependencies.js";
import { InMemoryMemoryStore } from "../../src/core/memory/in-memory-store.js";
import { InMemoryExperienceStore } from "../../src/core/experience/in-memory-experience-store.js";

describe("Public agent creation API (Phase 4)", () => {
  let server: Server;
  let baseUrl: string;
  let accounts: AccountRegistry;
  let aliceToken: string;
  let bobToken: string;

  beforeAll(async () => {
    accounts = new AccountRegistry();
    aliceToken = accounts.register({ id: "alice", displayName: "Alice", maxAgents: 2, runsPerMinute: 3 }).token;
    bobToken = accounts.register({ id: "bob", displayName: "Bob" }).token;

    server = createKairosServer({
      dependencies: createPipelineDependencies({ mode: "basic" }),
      experienceStore: new InMemoryExperienceStore(),
      memory: createKairos({ mode: "session", dependencies: createPipelineDependencies({ mode: "basic" }) }) as never,
      accounts,
      defaultMaxCycles: 2,
    }) as Server;
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const authed = (token: string) => ({ authorization: `Bearer ${token}` });

  it("creates a public agent under a valid account token", async () => {
    const res = await fetch(`${baseUrl}/agents`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authed(aliceToken) },
      body: JSON.stringify({ agentId: "alice-helper" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { agentId: string; owner: string };
    expect(body.agentId).toBe("alice-helper");
    expect(body.owner).toBe("alice");
  });

  it("rejects creation without a valid token", async () => {
    const res = await fetch(`${baseUrl}/agents`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer nope" },
      body: JSON.stringify({ agentId: "no-auth" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects invalid agent ids (format) with 400", async () => {
    const res = await fetch(`${baseUrl}/agents`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authed(aliceToken) },
      body: JSON.stringify({ agentId: "BAD ID!" }),
    });
    expect(res.status).toBe(400);
  });

  it("enforces globally unique agent ids with 409", async () => {
    const res = await fetch(`${baseUrl}/agents`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authed(bobToken) },
      body: JSON.stringify({ agentId: "alice-helper" }),
    });
    expect(res.status).toBe(409);
  });

  it("enforces per-account agent limits with 409", async () => {
    // alice already owns alice-helper (limit 2): one more is fine...
    const second = await fetch(`${baseUrl}/agents`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authed(aliceToken) },
      body: JSON.stringify({ agentId: "alice-second" }),
    });
    expect(second.status).toBe(201);

    // ...but a third crosses the limit.
    const third = await fetch(`${baseUrl}/agents`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authed(aliceToken) },
      body: JSON.stringify({ agentId: "alice-third" }),
    });
    expect(third.status).toBe(409);
  });

  it("lists the caller's own agents only", async () => {
    const res = await fetch(`${baseUrl}/agents`, { headers: authed(aliceToken) });
    expect(res.status).toBe(200);
    const body = await res.json() as { accountId: string; agents: { agentId: string }[] };
    expect(body.accountId).toBe("alice");
    expect(body.agents.map((a) => a.agentId).sort()).toEqual(["alice-helper", "alice-second"]);
  });

  it("runs a public agent under the owner's token", async () => {
    const res = await fetch(`${baseUrl}/agents/alice-helper/run`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authed(aliceToken) },
      body: JSON.stringify({ goal: "Say hello" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { goal: string; totalCycles: number };
    expect(body.goal).toBe("Say hello");
    expect(body.totalCycles).toBeGreaterThan(0);
  });

  it("refuses to run another account's agent with 403", async () => {
    const res = await fetch(`${baseUrl}/agents/alice-helper/run`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authed(bobToken) },
      body: JSON.stringify({ goal: "Not mine" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown agent ids", async () => {
    const res = await fetch(`${baseUrl}/agents/ghost/run`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authed(aliceToken) },
      body: JSON.stringify({ goal: "anything" }),
    });
    expect(res.status).toBe(404);
  });

  it("enforces the account run quota with 429", async () => {
    // alice has runsPerMinute=3; the previous successful run used one.
    await fetch(`${baseUrl}/agents/alice-helper/run`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authed(aliceToken) },
      body: JSON.stringify({ goal: "Second run" }),
    });
    await fetch(`${baseUrl}/agents/alice-helper/run`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authed(aliceToken) },
      body: JSON.stringify({ goal: "Third run" }),
    });
    const fourth = await fetch(`${baseUrl}/agents/alice-helper/run`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authed(aliceToken) },
      body: JSON.stringify({ goal: "Fourth run — over quota" }),
    });
    expect(fourth.status).toBe(429);
  });
});
