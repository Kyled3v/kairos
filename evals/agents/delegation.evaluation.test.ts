/**
 * KAIROS Evaluation — Multi-agent delegation flow
 *
 * Constitution section 9: "Claims of improvement must be supported by
 * measurable evaluation." This suite scores the ATLAS → specialist
 * delegation pipeline against explicit, reproducible checks:
 *
 *   E1  Delegation reaches the correct registered worker
 *   E2  Unknown workers fail as results, not exceptions
 *   E3  Executive agents are never routed work by the smart strategy
 *   E4  Worker routing is role-appropriate (research/knowledge/observation)
 *   E5  Model decomposition falls back deterministically without a model
 *   E6  Every delegation is auditable (DelegationResult + episodic record)
 *   E7  Agent memory scopes stay isolated over a shared store
 *   E8  Specialist toolsets stay read-only under their own policies
 *
 * Run with: npm test -- evals/agents
 */
import { describe, expect, it } from "vitest";
import { AgentRegistry } from "../../src/agents/identity.js";
import { AgentCoordinator } from "../../src/agents/coordinator.js";
import { AtlasAgent } from "../../src/agents/executive/atlas-agent.js";
import { OrionAgent } from "../../src/agents/research/orion-agent.js";
import { SageAgent } from "../../src/agents/knowledge/sage-agent.js";
import { PulseAgent } from "../../src/agents/observation/pulse-agent.js";
import { createSmartStrategy } from "../../src/agents/executive/decomposition.js";
import type { DelegatableAgent } from "../../src/agents/tool-boundary.js";
import { InMemoryMemoryStore } from "../../src/core/memory/in-memory-store.js";
import { InMemoryExperienceStore } from "../../src/core/experience/in-memory-experience-store.js";
import { writeFileTool } from "../../src/core/tools/built-in/write-file.js";
import { runCommandTool } from "../../src/core/tools/built-in/run-command.js";
import type { ToolDefinition, ToolRisk } from "../../src/core/tools/types.js";

const ONE_CYCLE = { maxCycles: 1 } as const;

function fakeWorker(id: string, role: string, registry: AgentRegistry): DelegatableAgent {
  const identity = registry.register({ id, name: id, metadata: { role } });
  return {
    identity,
    run: async () => {
      throw new Error("fake worker must not execute");
    },
  };
}

function definitionsOf(agent: { toolRegistry: { getAll(): readonly { definition: ToolDefinition }[] } }): ToolDefinition[] {
  return agent.toolRegistry.getAll().map((t) => t.definition);
}

describe("KAIROS Evaluation — delegation flow (Constitution §9)", () => {
  it("E1: delegation reaches the correct registered worker and returns its result", async () => {
    const orion = new OrionAgent({
      agentId: "orion",
      memoryStore: new InMemoryMemoryStore(),
      session: ONE_CYCLE,
    });
    const atlas = new AtlasAgent({ memoryStore: new InMemoryMemoryStore(), session: ONE_CYCLE });
    atlas.addWorker(orion);

    const result = await atlas.delegateTo("orion", "Probe delegation correctness");
    expect(result.status).toBe("success");
    expect(result.toAgentId).toBe("orion");
    expect(result.fromAgentId).toBe(atlas.identity.id);
    const workerResult = result.result as { goal: string; totalCycles: number };
    expect(workerResult.goal).toBe("Probe delegation correctness");
    expect(workerResult.totalCycles).toBeGreaterThan(0);
  });

  it("E2: unknown workers produce failure results, never exceptions", async () => {
    const atlas = new AtlasAgent({ memoryStore: new InMemoryMemoryStore(), session: ONE_CYCLE });
    const result = await atlas.delegateTo("ghost", "Should fail cleanly");
    expect(result.status).toBe("failure");
    expect(result.error).toContain("not registered");
  });

  it("E3: the smart strategy never routes work to executive agents", () => {
    const registry = new AgentRegistry();
    const atlas = fakeWorker("atlas", "executive", registry);
    const orion = fakeWorker("orion", "research", registry);
    const sage = fakeWorker("sage", "knowledge", registry);
    const pulse = fakeWorker("pulse", "observation", registry);

    const strategy = createSmartStrategy([atlas, orion, sage, pulse]);
    const tasks = strategy("Research it; then document it; then monitor it");

    expect(tasks.length).toBe(3);
    expect(tasks.every((t) => t.workerId !== "atlas")).toBe(true);
  });

  it("E4: worker routing is role-appropriate across the specialist roster", async () => {
    const orion = new OrionAgent({
      agentId: "orion",
      memoryStore: new InMemoryMemoryStore(),
      session: ONE_CYCLE,
    });
    const sage = new SageAgent({
      agentId: "sage",
      memoryStore: new InMemoryMemoryStore(),
      session: ONE_CYCLE,
    });
    const pulse = new PulseAgent({
      agentId: "pulse",
      memoryStore: new InMemoryMemoryStore(),
      session: ONE_CYCLE,
    });
    const atlas = new AtlasAgent({ memoryStore: new InMemoryMemoryStore(), session: ONE_CYCLE });
    atlas.addWorker(orion);
    atlas.addWorker(sage);
    atlas.addWorker(pulse);

    const outcome = await atlas.orchestrate(
      "Research the tool gateway; then document the gateway; then monitor the gateway",
      { record: false },
    );

    expect(outcome.status).toBe("complete");
    expect(outcome.decompositionMode).toBe("smart");
    const routed = outcome.delegationResults.map((r) => [r.toAgentId, r.goal] as const);
    expect(routed[0]?.[0]).toBe("orion");
    expect(routed[1]?.[0]).toBe("sage");
    expect(routed[2]?.[0]).toBe("pulse");
  });

  it("E5: model decomposition mode falls back to smart without a configured model", async () => {
    const orion = new OrionAgent({
      agentId: "orion",
      memoryStore: new InMemoryMemoryStore(),
      session: ONE_CYCLE,
    });
    const atlas = new AtlasAgent({ memoryStore: new InMemoryMemoryStore(), session: ONE_CYCLE });
    atlas.addWorker(orion);

    const outcome = await atlas.orchestrate("Investigate the pipeline", {
      decomposition: "model",
      record: false,
    });
    expect(outcome.decompositionMode).toBe("smart");
    expect(outcome.status).toBe("complete");
  });

  it("E6: every delegation is auditable via DelegationResults and episodic memory", async () => {
    const orion = new OrionAgent({
      agentId: "orion",
      memoryStore: new InMemoryMemoryStore(),
      session: ONE_CYCLE,
    });
    const atlas = new AtlasAgent({ memoryStore: new InMemoryMemoryStore(), session: ONE_CYCLE });
    atlas.addWorker(orion);

    const ok = await atlas.delegateTo("orion", "Auditable success");
    const bad = await atlas.delegateTo("ghost", "Auditable failure");
    await atlas.recordDelegationOutcome(ok);
    await atlas.recordDelegationOutcome(bad);

    // Both outcomes are attributable results.
    expect(ok.status).toBe("success");
    expect(bad.status).toBe("failure");
    expect(ok.taskId).not.toBe(bad.taskId);

    // And both were recorded as ATLAS episodic memory.
    const history = await atlas.delegationHistory();
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.some((m) => m.content.includes("success"))).toBe(true);
    expect(history.some((m) => m.content.includes("failure"))).toBe(true);
  });

  it("E7: specialist memory scopes stay isolated over one shared store", async () => {
    const shared = new InMemoryMemoryStore();
    const orion = new OrionAgent({ agentId: "orion", memoryStore: shared, session: ONE_CYCLE });
    const sage = new SageAgent({ agentId: "sage", memoryStore: shared, session: ONE_CYCLE });
    const pulse = new PulseAgent({ agentId: "pulse", memoryStore: shared, session: ONE_CYCLE });

    await orion.rememberFinding("ORION scoped note", { topic: "iso" });
    await sage.learnFact("SAGE scoped note", { topic: "iso" });
    await pulse.recordObservation("iso", "PULSE scoped note", {});

    expect((await orion.findings("scoped")).every((m) => m.content.includes("ORION"))).toBe(true);
    expect((await sage.recallFacts("scoped")).every((m) => m.content.includes("SAGE"))).toBe(true);
    expect((await pulse.observations("scoped")).every((m) => m.content.includes("PULSE"))).toBe(true);

    // Cross-visibility is zero: each scope sees exactly its own single record.
    expect(await sage.memory.semantic.recall("ORION scoped")).toHaveLength(0);
    expect(await orion.memory.semantic.recall("SAGE scoped")).toHaveLength(0);
    expect(await pulse.memory.episodic.recall("ORION scoped")).toHaveLength(0);
  });

  it("E8: specialist toolsets stay read-only under their own policies", async () => {
    const agents = [
      new OrionAgent({ memoryStore: new InMemoryMemoryStore(), session: ONE_CYCLE }),
      new SageAgent({ memoryStore: new InMemoryMemoryStore(), session: ONE_CYCLE }),
      new PulseAgent({ memoryStore: new InMemoryMemoryStore(), session: ONE_CYCLE }),
      new AtlasAgent({ memoryStore: new InMemoryMemoryStore(), session: ONE_CYCLE }),
    ];

    const forbidden = ["kairos.write-file", "kairos.run-command"];

    for (const agent of agents) {
      const ownDefinitions = definitionsOf(agent);
      const ids = ownDefinitions.map((d) => d.id);
      expect(ids, `${agent.identity.name} must not hold write/execute tools`)
        .not.toContain(forbidden[0]);
      expect(ids, `${agent.identity.name} must not hold write/execute tools`)
        .not.toContain(forbidden[1]);

      // Risk ceiling: the agent's own toolset never exceeds medium risk.
      const RISK_RANK: Record<ToolRisk, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
      for (const def of ownDefinitions) {
        expect(
          RISK_RANK[def.risk],
          `${agent.identity.name} tool ${def.id} exceeds medium risk`,
        ).toBeLessThanOrEqual(2);
      }

      // Even when an intruder registers the tools, policy blocks execution.
      agent.toolRegistry.register(writeFileTool);
      agent.toolRegistry.register(runCommandTool);
      for (const toolId of forbidden) {
        const definition = agent.toolRegistry.getDefinition(toolId);
        if (definition === undefined) throw new Error(`${toolId} was not registered`);
        const decision = agent.policy.evaluate(agent.identity.id, definition);
        expect(decision.allowed, `${agent.identity.name} policy must block ${toolId}`).toBe(false);
      }
    }
  });

  it("E9: orchestration over the full roster completes and records an outcome", async () => {
    const experienceStore = new InMemoryExperienceStore();
    const orion = new OrionAgent({
      agentId: "orion",
      memoryStore: new InMemoryMemoryStore(),
      session: ONE_CYCLE,
    });
    const sage = new SageAgent({
      agentId: "sage",
      memoryStore: new InMemoryMemoryStore(),
      session: ONE_CYCLE,
    });
    const pulse = new PulseAgent({
      agentId: "pulse",
      memoryStore: new InMemoryMemoryStore(),
      session: ONE_CYCLE,
    });
    const atlas = new AtlasAgent({
      memoryStore: new InMemoryMemoryStore(),
      experienceStore,
      session: ONE_CYCLE,
    });
    atlas.addWorker(orion);
    atlas.addWorker(sage);
    atlas.addWorker(pulse);

    const outcome = await atlas.orchestrate(
      "Research the memory stores; then document the findings; then monitor for regressions",
    );

    expect(outcome.status).toBe("complete");
    expect(outcome.succeeded).toBe(3);

    // The outcome itself is in ATLAS's episodic record…
    const episodes = await atlas.delegationHistory();
    expect(episodes.some((m) => m.content.includes("complete"))).toBe(true);

    // …and ATLAS's own cognitive cycles land in the experience store too.
    await atlas.run("Review the objective results");
    const records = await experienceStore.query({ sessionId: atlas.identity.id });
    expect(records.length).toBeGreaterThanOrEqual(1);
  });
});
