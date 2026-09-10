import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { createKairosServer } from "../../src/server/http-server.js";
import { createPipelineDependencies } from "../../src/factory/pipeline-dependencies.js";
import { InMemoryExperienceStore } from "../../src/core/experience/in-memory-experience-store.js";
import { InMemoryMemoryStore } from "../../src/core/memory/in-memory-store.js";
import { KairosMemory } from "../../src/core/memory/kairos-memory.js";

describe("KAIROS HTTP server", () => {
  let server: Server;
  let baseUrl: string;
  let experienceStore: InMemoryExperienceStore;
  let memory: KairosMemory;

  beforeAll(async () => {
    experienceStore = new InMemoryExperienceStore();
    memory = new KairosMemory(new InMemoryMemoryStore());
    server = createKairosServer({
      dependencies: createPipelineDependencies({ mode: "basic" }),
      experienceStore,
      memory,
      defaultMaxCycles: 2,
    });
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

  it("runs a session via POST /run", async () => {
    const res = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "Test the HTTP server", sessionId: "http-test-1" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { goal: string; totalCycles: number };
    expect(body.goal).toBe("Test the HTTP server");
    expect(body.totalCycles).toBeGreaterThan(0);
  });

  it("rejects POST /run with a missing goal", async () => {
    const res = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("rejects POST /run with malformed JSON", async () => {
    const res = await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    expect(res.status).toBe(400);
  });

  it("lists saved experience via GET /experience and filters by sessionId", async () => {
    await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "Second run", sessionId: "http-test-2" }),
    });

    const res = await fetch(`${baseUrl}/experience?sessionId=http-test-2`);
    expect(res.status).toBe(200);
    const records = (await res.json()) as Array<{ sessionId: string }>;
    expect(records).toHaveLength(1);
    expect(records[0]?.sessionId).toBe("http-test-2");
  });

  it("fetches a single experience record by id, and 404s for an unknown id", async () => {
    await fetch(`${baseUrl}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "Fetch by id", sessionId: "http-test-3" }),
    });
    const records = await experienceStore.query({ sessionId: "http-test-3" });
    const id = records[0]?.id;
    expect(id).toBeDefined();

    const found = await fetch(`${baseUrl}/experience/${id}`);
    expect(found.status).toBe(200);

    const missing = await fetch(`${baseUrl}/experience/does-not-exist`);
    expect(missing.status).toBe(404);
  });

  it("returns memory via GET /memory", async () => {
    await memory.working.remember("Server test memory entry");
    const params = new URLSearchParams({ query: "Server test", type: "working" });
    const res = await fetch(`${baseUrl}/memory?${params.toString()}`);
    expect(res.status).toBe(200);
    const results = (await res.json()) as Array<{ content: string }>;
    expect(results.length).toBeGreaterThan(0);
  });

  it("404s on an unknown route", async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
  });
});