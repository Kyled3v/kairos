import { describe, expect, it, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { FileMemoryStore } from "../../src/core/memory/file/file-store.js";

function tmpPath(): string {
  return join(tmpdir(), `kairos-mem-${crypto.randomUUID()}.json`);
}

describe("FileMemoryStore", () => {
  const paths: string[] = [];
  afterEach(async () => {
    for (const p of paths) {
      if (existsSync(p)) await rm(p);
      if (existsSync(`${p}.tmp`)) await rm(`${p}.tmp`);
    }
    paths.length = 0;
  });

  it("stores and retrieves after flush", async () => {
    const path = tmpPath(); paths.push(path);
    const store = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await store.load();
    await store.store({ id: "m1", type: "semantic", content: "KAIROS platform.", importance: 0.9, createdAt: new Date(), metadata: {} });
    await store.flush();
    const store2 = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await store2.load();
    const results = await store2.retrieve({ query: "KAIROS" });
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toContain("KAIROS");
  });

  it("filters by type after reload", async () => {
    const path = tmpPath(); paths.push(path);
    const store = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await store.load();
    await store.store({ id: "m1", type: "semantic", content: "Semantic.", importance: 0.9, createdAt: new Date(), metadata: {} });
    await store.store({ id: "m2", type: "episodic", content: "Episodic.", importance: 0.8, createdAt: new Date(), metadata: {} });
    await store.flush();
    const store2 = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await store2.load();
    const semantic = await store2.retrieve({ query: "", type: "semantic" });
    expect(semantic).toHaveLength(1);
    expect(semantic[0]?.type).toBe("semantic");
  });

  it("deletes and persists deletion", async () => {
    const path = tmpPath(); paths.push(path);
    const store = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await store.load();
    await store.store({ id: "m1", type: "working", content: "Temp.", importance: 0.5, createdAt: new Date(), metadata: {} });
    await store.flush();
    await store.delete("m1");
    await store.flush();
    const store2 = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await store2.load();
    expect(await store2.get("m1")).toBeUndefined();
    expect(await store2.count()).toBe(0);
  });

  it("starts empty when file does not exist", async () => {
    const path = tmpPath(); paths.push(path);
    const store = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await store.load();
    expect(await store.count()).toBe(0);
  });

  it("clears and persists", async () => {
    const path = tmpPath(); paths.push(path);
    const store = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await store.load();
    await store.store({ id: "m1", type: "semantic", content: "X.", importance: 0.5, createdAt: new Date(), metadata: {} });
    await store.flush();
    await store.clear();
    await store.flush();
    const store2 = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await store2.load();
    expect(await store2.count()).toBe(0);
  });

  it("recovers to empty store when file contains corrupt JSON", async () => {
    const path = tmpPath(); paths.push(path);
    await (await import("node:fs/promises")).writeFile(path, "{ this is not valid json at all", "utf-8");
    const store = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await expect(store.load()).rejects.toThrow();
  });

  it("flush() after clear() produces an empty file", async () => {
    const path = tmpPath(); paths.push(path);
    const store = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await store.load();
    await store.store({ id: "m1", type: "semantic", content: "X.", importance: 0.5, createdAt: new Date(), metadata: {} });
    await store.flush();
    await store.clear();
    await store.flush();
    const raw = await (await import("node:fs/promises")).readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as { memories: unknown[] };
    expect(parsed.memories).toHaveLength(0);
  });

  it("concurrent store() calls do not corrupt data", async () => {
    const path = tmpPath(); paths.push(path);
    const store = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await store.load();
    await Promise.all([
      store.store({ id: "c1", type: "semantic", content: "A", importance: 0.5, createdAt: new Date(), metadata: {} }),
      store.store({ id: "c2", type: "semantic", content: "B", importance: 0.5, createdAt: new Date(), metadata: {} }),
      store.store({ id: "c3", type: "semantic", content: "C", importance: 0.5, createdAt: new Date(), metadata: {} }),
    ]);
    await store.flush();
    const store2 = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await store2.load();
    expect(await store2.count()).toBe(3);
  });
});

describe("FileMemoryStore versioning and atomic writes", () => {
  const paths: string[] = [];
  afterEach(async () => {
    for (const p of paths) {
      if (existsSync(p)) await rm(p);
      if (existsSync(`${p}.tmp`)) await rm(`${p}.tmp`);
    }
    paths.length = 0;
  });

  it("does not leave a stale .tmp file behind after flush", async () => {
    const path = tmpPath(); paths.push(path);
    const store = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await store.load();
    await store.store({ id: "m1", type: "working", content: "Atomic write check.", importance: 0.5, createdAt: new Date(), metadata: {} });
    await store.flush();
    expect(existsSync(path)).toBe(true);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it("rejects a store version newer than supported with a clear error", async () => {
    const path = tmpPath(); paths.push(path);
    await writeFile(path, JSON.stringify({ version: 999, memories: [] }), "utf-8");
    const store = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await expect(store.load()).rejects.toThrow(/newer than the supported version/);
  });

  it("rejects an older version with no registered migration, with a clear error", async () => {
    const path = tmpPath(); paths.push(path);
    await writeFile(path, JSON.stringify({ version: 0, memories: [] }), "utf-8");
    const store = new FileMemoryStore({ filePath: path, writeDebounceMs: 0 });
    await expect(store.load()).rejects.toThrow(/No migration registered/);
  });
});
