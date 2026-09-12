import { describe, expect, it } from "vitest";
import { createKairosServer } from "../../src/server/http-server.js";
import { createPipelineDependencies } from "../../src/factory/pipeline-dependencies.js";
import { InMemoryExperienceStore } from "../../src/core/experience/in-memory-experience-store.js";
import { KairosMemory } from "../../src/core/memory/kairos-memory.js";
import { InMemoryMemoryStore } from "../../src/core/memory/in-memory-store.js";
import type { AddressInfo } from "node:net";

function makeServer() {
  return createKairosServer({
    dependencies: createPipelineDependencies({ mode: "basic" }),
    experienceStore: new InMemoryExperienceStore(),
    memory: new KairosMemory(new InMemoryMemoryStore()),
  });
}

describe("HTTP server — concurrent load", () => {
  it("handles 20 concurrent GET /memory requests without error", async () => {
    const server = makeServer();
    await new Promise<void>((r) => server.listen(0, r));
    const { port } = server.address() as AddressInfo;
    try {
      const requests = Array.from({ length: 20 }, () =>
        fetch("http://localhost:" + port + "/memory")
      );
      const responses = await Promise.all(requests);
      expect(responses.every((r) => r.status === 200)).toBe(true);
    } finally { server.close(); }
  });

  it("handles 10 concurrent POST /run requests without error", async () => {
    const server = makeServer();
    await new Promise<void>((r) => server.listen(0, r));
    const { port } = server.address() as AddressInfo;
    try {
      const requests = Array.from({ length: 10 }, () =>
        fetch("http://localhost:" + port + "/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal: "concurrent test goal", maxCycles: 1 }),
        })
      );
      const responses = await Promise.all(requests);
      expect(responses.every((r) => r.status === 200)).toBe(true);
    } finally { server.close(); }
  });

  it("returns correct JSON Content-Type on all responses", async () => {
    const server = makeServer();
    await new Promise<void>((r) => server.listen(0, r));
    const { port } = server.address() as AddressInfo;
    try {
      const responses = await Promise.all([
        fetch("http://localhost:" + port + "/memory"),
        fetch("http://localhost:" + port + "/experience"),
        fetch("http://localhost:" + port + "/experience/nonexistent"),
      ]);
      for (const r of responses) {
        expect(r.headers.get("content-type")).toContain("application/json");
      }
    } finally { server.close(); }
  });
});
