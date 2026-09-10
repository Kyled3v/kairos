import { describe, expect, it, afterEach } from "vitest";
import { createKairosServer } from "../../src/server/http-server.js";
import { createPipelineDependencies } from "../../src/factory/pipeline-dependencies.js";
import { InMemoryExperienceStore } from "../../src/core/experience/in-memory-experience-store.js";
import { InMemoryMemoryStore } from "../../src/core/memory/in-memory-store.js";
import { KairosMemory } from "../../src/core/memory/kairos-memory.js";
import type { Server } from "node:http";

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

function startServer(port: number): Server {
  const deps = createPipelineDependencies({ mode: "basic" });
  const experienceStore = new InMemoryExperienceStore();
  const memory = new KairosMemory(new InMemoryMemoryStore());
  const s = createKairosServer({ dependencies: deps, experienceStore, memory });
  s.listen(port);
  return s;
}

describe("SSE /stream endpoint", () => {
  it("returns SSE content-type and emits result event", async () => {
    server = startServer(14_300);
    await new Promise<void>((resolve) => server?.once("listening", resolve));

    const res = await fetch("http://localhost:14300/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "Stream test goal", maxCycles: 1 }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await res.text();
    expect(text).toContain("event: start");
    expect(text).toContain("event: result");
    expect(text).toContain("event: done");
  });

  it("returns 400 for missing goal", async () => {
    server = startServer(14_301);
    await new Promise<void>((resolve) => server?.once("listening", resolve));

    const res = await fetch("http://localhost:14301/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});
