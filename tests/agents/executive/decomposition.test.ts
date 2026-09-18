import { describe, expect, it } from "vitest";
import { AgentRegistry } from "../../../src/agents/identity.js";
import {
  splitObjectiveIntoClauses,
  createSmartStrategy,
} from "../../../src/agents/executive/decomposition.js";
import type { DelegatableAgent } from "../../../src/agents/tool-boundary.js";

function fakeWorker(
  id: string,
  metadata: Record<string, unknown>,
  registry: AgentRegistry,
): DelegatableAgent {
  const identity = registry.register({ id, name: id, metadata });
  return {
    identity,
    run: async (goal: string) => {
      throw new Error("not executed in unit tests: " + goal);
    },
  };
}

describe("splitObjectiveIntoClauses", () => {
  it("returns the whole objective as a single clause when there is nothing to split", () => {
    const clauses = splitObjectiveIntoClauses("Investigate the memory subsystem");
    expect(clauses).toEqual(["Investigate the memory subsystem"]);
  });

  it("splits on semicolons", () => {
    const clauses = splitObjectiveIntoClauses("Map the repo; then analyse the tests; write it up");
    expect(clauses).toHaveLength(3);
    expect(clauses[0]).toBe("Map the repo");
    expect(clauses[1]).toBe("analyse the tests");
    expect(clauses[2]).toBe("write it up");
  });

  it("splits on ' then ' and newlines", () => {
    const clauses = splitObjectiveIntoClauses("First research the loop\nthen plan the fix then run tests");
    expect(clauses).toEqual(["First research the loop", "plan the fix", "run tests"]);
  });

  it("splits on numbered items and strips the markers", () => {
    const clauses = splitObjectiveIntoClauses("1. research auth\n2. design the fix\n3) implement it");
    expect(clauses).toEqual(["research auth", "design the fix", "implement it"]);
  });

  it("caps clauses at maxClauses", () => {
    const clauses = splitObjectiveIntoClauses("a; b; c; d; e; f; g", 3);
    expect(clauses).toHaveLength(3);
  });
});

describe("createSmartStrategy", () => {
  it("routes research clauses to research-role workers", () => {
    const registry = new AgentRegistry();
    const orion = fakeWorker("orion", { role: "research" }, registry);
    const nova = fakeWorker("nova", { role: "creation" }, registry);

    const strategy = createSmartStrategy([orion, nova]);
    const tasks = strategy("Investigate the cognitive loop");

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.workerId).toBe("orion");
    expect(tasks[0]?.goal).toBe("Investigate the cognitive loop");
  });

  it("routes implementation clauses to engineering-role workers", () => {
    const registry = new AgentRegistry();
    const orion = fakeWorker("orion", { role: "research" }, registry);
    const forge = fakeWorker("forge", { role: "engineering" }, registry);

    const strategy = createSmartStrategy([orion, forge]);
    const tasks = strategy("Research the bug, then implement the fix");

    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.workerId).toBe("orion");
    expect(tasks[1]?.workerId).toBe("forge");
  });

  it("falls back to rotating across eligible workers when no role matches", () => {
    const registry = new AgentRegistry();
    const orion = fakeWorker("orion", { role: "research" }, registry);
    const nova = fakeWorker("nova", { role: "creation" }, registry);

    const strategy = createSmartStrategy([orion, nova]);
    const tasks = strategy("Do the thing; do it again");

    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.workerId).toBe("orion");
    expect(tasks[1]?.workerId).toBe("nova");
  });

  it("never routes work to executive agents", () => {
    const registry = new AgentRegistry();
    const atlas = fakeWorker("atlas", { role: "executive" }, registry);
    const orion = fakeWorker("orion", { role: "research" }, registry);

    const strategy = createSmartStrategy([atlas, orion]);
    const tasks = strategy("Investigate anything at all");

    expect(tasks.every((t) => t.workerId !== "atlas")).toBe(true);
  });

  it("returns an empty plan when there are no non-executive workers", () => {
    const registry = new AgentRegistry();
    const atlas = fakeWorker("atlas", { role: "executive" }, registry);
    const strategy = createSmartStrategy([atlas]);
    expect(strategy("Any objective")).toEqual([]);
  });

  it("produces deterministic, uniquely-identified sub-tasks", () => {
    const registry = new AgentRegistry();
    const orion = fakeWorker("orion", { role: "research" }, registry);
    const forge = fakeWorker("forge", { role: "engineering" }, registry);

    const strategy = createSmartStrategy([orion, forge]);
    const a = strategy("Research X; then implement Y; then research Z");
    const b = strategy("Research X; then implement Y; then research Z");

    expect(a).toEqual(b);
    expect(new Set(a.map((t) => t.id)).size).toBe(a.length);
  });
});
