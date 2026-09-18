import { describe, expect, it } from "vitest";
import { AgentMessageBus } from "../../../src/agents/message-bus.js";
import { AgentCoordinator } from "../../../src/agents/coordinator.js";
import { AtlasAgent } from "../../../src/agents/executive/atlas-agent.js";
import type { AtlasAgentOptions } from "../../../src/agents/executive/atlas-agent.js";
import { OrionAgent } from "../../../src/agents/research/orion-agent.js";
import { InMemoryMemoryStore } from "../../../src/core/memory/in-memory-store.js";
import { InMemoryExperienceStore } from "../../../src/core/experience/in-memory-experience-store.js";
import { writeFileTool } from "../../../src/core/tools/built-in/write-file.js";
import { runCommandTool } from "../../../src/core/tools/built-in/run-command.js";
import type { DelegatableAgent } from "../../../src/agents/tool-boundary.js";

function makeAtlas(overrides: Partial<AtlasAgentOptions> = {}): AtlasAgent {
  return new AtlasAgent({
    memoryStore: new InMemoryMemoryStore(),
    session: { maxCycles: 1 },
    ...overrides,
  });
}

describe("AtlasAgent", () => {
  it("has a stable identity describing the ATLAS executive role", () => {
    const atlas = makeAtlas();
    expect(atlas.identity.name).toBe("atlas");
    expect(atlas.identity.metadata.role).toBe("executive");
    expect(atlas.identity.metadata.specialty).toBe("coordination-and-delegation");
    expect(Array.isArray(atlas.identity.metadata.capabilities)).toBe(true);
    expect(atlas.identity.metadata.capabilities).toContain("delegation");
  });

  it("delegates research work to an ORION worker via AgentCoordinator", async () => {
    const coordinator = new AgentCoordinator();
    const orion = new OrionAgent({
      agentId: "orion",
      memoryStore: new InMemoryMemoryStore(),
      session: { maxCycles: 1 },
    });
    coordinator.register(orion);

    const atlas = makeAtlas({ coordinator });
    const result = await atlas.delegateTo(orion.identity.id, "Investigate the cognitive loop");

    expect(result.status).toBe("success");
    expect(result.toAgentId).toBe("orion");
    expect(result.fromAgentId).toBe(atlas.identity.id);
    const workerResult = result.result as { totalCycles: number; goal: string };
    expect(workerResult.totalCycles).toBeGreaterThan(0);
    expect(workerResult.goal).toBe("Investigate the cognitive loop");
  });

  it("registers itself and its workers in its coordinator", async () => {
    const atlas = makeAtlas();
    const orion = new OrionAgent({ memoryStore: new InMemoryMemoryStore(), session: { maxCycles: 1 } });
    atlas.addWorker(orion);

    expect(atlas.coordinator.has(atlas.identity.id)).toBe(true);
    expect(atlas.coordinator.has(orion.identity.id)).toBe(true);
    expect(atlas.coordinator.has("ghost")).toBe(false);
  });

  it("returns a failure delegation result for unknown agents", async () => {
    const atlas = makeAtlas();
    const result = await atlas.delegateTo("ghost-agent", "do something");
    expect(result.status).toBe("failure");
    expect(result.error).toContain("not registered");
  });

  it("runs an objective by routing research sub-goals to ORION", async () => {
    const orion = new OrionAgent({
      agentId: "orion",
      memoryStore: new InMemoryMemoryStore(),
      session: { maxCycles: 1 },
    });
    const atlas = makeAtlas();
    atlas.addWorker(orion);

    const outcome = await atlas.orchestrate("Understand the KAIROS memory system", {
      strategy: () => [
        {
          id: "sub-1",
          goal: "Map the memory subsystem",
          workerId: orion.identity.id,
        },
      ],
    });

    expect(outcome.goal).toBe("Understand the KAIROS memory system");
    expect(outcome.delegationResults).toHaveLength(1);
    expect(outcome.delegationResults[0]?.status).toBe("success");
    expect(outcome.synthesis).toContain("1");
  });

  it("reports partial failure when a worker fails and completes with status", async () => {
    const orion = new OrionAgent({
      agentId: "orion",
      memoryStore: new InMemoryMemoryStore(),
      session: { maxCycles: 1 },
    });
    const atlas = makeAtlas();
    atlas.addWorker(orion);

    const outcome = await atlas.orchestrate("Multi-part objective", {
      strategy: () => [
        { id: "s1", goal: "this one works", workerId: orion.identity.id },
        { id: "s2", goal: "this one fails", workerId: "ghost" },
      ],
    });

    const statuses = outcome.delegationResults.map((r) => r.status);
    expect(statuses).toEqual(["success", "failure"]);
    expect(outcome.succeeded).toBe(1);
    expect(outcome.failed).toBe(1);
    expect(outcome.status).toBe("partial");
  });

  it("delegates several workers in sequence", async () => {
    const orionA = new OrionAgent({
      agentId: "orion-a",
      memoryStore: new InMemoryMemoryStore(),
      session: { maxCycles: 1 },
    });
    const orionB = new OrionAgent({
      agentId: "orion-b",
      memoryStore: new InMemoryMemoryStore(),
      session: { maxCycles: 1 },
    });
    const atlas = makeAtlas();
    atlas.addWorker(orionA);
    atlas.addWorker(orionB);

    const outcome = await atlas.orchestrate("Two-part research objective", {
      strategy: () => [
        { id: "s1", goal: "part A", workerId: orionA.identity.id },
        { id: "s2", goal: "part B", workerId: orionB.identity.id },
      ],
    });

    expect(outcome.delegationResults).toHaveLength(2);
    expect(outcome.status).toBe("complete");
    expect(outcome.succeeded).toBe(2);
  });

  it("never registers write or execute tools itself", () => {
    const atlas = makeAtlas();
    const ids = atlas.toolRegistry.getAll().map((t) => t.definition.id);
    expect(ids).not.toContain("kairos.write-file");
    expect(ids).not.toContain("kairos.run-command");
  });

  it("rejects write/execute tools via extras and blocks them at policy", async () => {
    expect(() => makeAtlas({ extraTools: [writeFileTool] })).toThrow(/write|execute/i);
    expect(() => makeAtlas({ extraTools: [runCommandTool] })).toThrow(/write|execute/i);

    const atlas = makeAtlas();
    atlas.toolRegistry.register(runCommandTool);
    const output = await atlas.toolGateway.execute(atlas.identity.id, {
      toolId: "kairos.run-command",
      parameters: { command: "echo hacked" },
      requestedBy: atlas.identity.id,
      requestId: crypto.randomUUID(),
    });
    expect(output.status).toBe("blocked");
  });

  it("records a delegation outcome as episodic memory", async () => {
    const atlas = makeAtlas();
    const result = await atlas.delegateTo("nobody", "goal"); // fails — still audited
    await atlas.recordDelegationOutcome(result);

    const episodes = await atlas.memory.episodic.recall("ATLAS delegation");
    expect(episodes.length).toBeGreaterThan(0);
    expect(episodes[0]?.type).toBe("episodic");
  });

  it("sends directives over the shared message bus", () => {
    const bus = new AgentMessageBus();
    const atlas = makeAtlas({ messageBus: bus });
    atlas.broadcastDirective("orion", "Prioritise security review tasks");

    const inbox = bus.drain("orion");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.from).toBe(atlas.identity.id);
    expect(inbox[0]?.metadata.kind).toBe("directive");
  });

  it("records experience for its own cognitive cycles", async () => {
    const experienceStore = new InMemoryExperienceStore();
    const atlas = makeAtlas({ experienceStore });
    await atlas.run("Review the repository state");

    const records = await experienceStore.query({ sessionId: atlas.identity.id });
    expect(records).toHaveLength(1);
    expect(records[0]?.sessionId).toBe(atlas.identity.id);
  });

  it("keeps ATLAS memories isolated from workers sharing the same store", async () => {
    const shared = new InMemoryMemoryStore();
    const atlas = makeAtlas({ memoryStore: shared });
    const orion = new OrionAgent({ agentId: "orion", memoryStore: shared, session: { maxCycles: 1 } });

    await atlas.rememberObjective("Hold the objective: ship Phase 3");
    await orion.rememberFinding("ORION-only note", {});

    const atlasObjectives = await atlas.objectives("Phase 3");
    expect(atlasObjectives).toHaveLength(1);

    const atlasSeesOrion = await atlas.memory.semantic.recall("ORION-only");
    expect(atlasSeesOrion).toHaveLength(0);
  });

  it("satisfies the DelegatableAgent contract so it can itself be delegated to", async () => {
    const atlas = makeAtlas();
    const asDelegatable: DelegatableAgent = atlas;
    expect(asDelegatable.identity.id).toBe(atlas.identity.id);
    const result = await asDelegatable.run("self goal");
    expect(result.totalCycles).toBeGreaterThan(0);
  });

  describe("smart orchestration (no caller-provided strategy)", () => {
    it("auto-decomposes a multi-part objective across role-matched workers", async () => {
      const { AgentRegistry } = await import("../../../src/agents/identity.js");
      const registry = new AgentRegistry();
      const forgeIdentity = registry.register({
        id: "forge",
        name: "forge",
        metadata: { role: "engineering" },
      });
      const forgeWorker: DelegatableAgent = {
        identity: forgeIdentity,
        run: async () => ({
          goal: "implemented",
          status: "completed",
          terminationReason: "objective-completed",
          totalCycles: 1,
          cycleHistory: [],
          progressHistory: [],
          subGoals: [],
          startedAt: new Date(),
          completedAt: new Date(),
        }),
      };
      const orion = new OrionAgent({
        agentId: "orion",
        memoryStore: new InMemoryMemoryStore(),
        session: { maxCycles: 1 },
      });

      const atlas = makeAtlas();
      atlas.addWorker(orion);
      atlas.addWorker(forgeWorker);

      const outcome = await atlas.orchestrate(
        "Research the bug; then implement the fix",
        { record: false },
      );

      expect(outcome.delegationResults).toHaveLength(2);
      expect(outcome.delegationResults[0]?.toAgentId).toBe("orion");
      expect(outcome.delegationResults[1]?.toAgentId).toBe("forge");
      expect(outcome.status).toBe("complete");
    });

    it("works with no strategy argument at all", async () => {
      const orion = new OrionAgent({
        agentId: "orion",
        memoryStore: new InMemoryMemoryStore(),
        session: { maxCycles: 1 },
      });
      const atlas = makeAtlas();
      atlas.addWorker(orion);

      const outcome = await atlas.orchestrate("Investigate the tool gateway");

      expect(outcome.delegationResults).toHaveLength(1);
      expect(outcome.delegationResults[0]?.toAgentId).toBe("orion");
      expect(outcome.delegationResults[0]?.status).toBe("success");
      expect(outcome.status).toBe("complete");
    });

    it("single mode routes the whole objective to one worker", async () => {
      const orion = new OrionAgent({
        agentId: "orion",
        memoryStore: new InMemoryMemoryStore(),
        session: { maxCycles: 1 },
      });
      const atlas = makeAtlas();
      atlas.addWorker(orion);

      const outcome = await atlas.orchestrate("Research A; then research B; then research C", {
        decomposition: "single",
        record: false,
      });

      expect(outcome.delegationResults).toHaveLength(1);
      expect(outcome.delegationResults[0]?.goal).toContain("Research A");
    });

    it("completes with empty status when no workers are registered", async () => {
      const atlas = makeAtlas();
      const outcome = await atlas.orchestrate("Anything at all");

      expect(outcome.status).toBe("empty");
      expect(outcome.delegationResults).toHaveLength(0);
    });

    it("never routes sub-tasks back to ATLAS itself", async () => {
      const orion = new OrionAgent({
        agentId: "orion",
        memoryStore: new InMemoryMemoryStore(),
        session: { maxCycles: 1 },
      });
      const atlas = makeAtlas();
      atlas.addWorker(orion);

      const outcome = await atlas.orchestrate("Do several things; and more things", { record: false });
      expect(outcome.delegationResults.every((r) => r.toAgentId !== atlas.identity.id)).toBe(true);
    });
  });
});
