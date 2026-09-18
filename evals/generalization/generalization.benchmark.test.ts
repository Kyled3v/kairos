import { describe, expect, it } from "vitest";
import { AtlasAgent } from "../../src/agents/executive/atlas-agent.js";
import { OrionAgent } from "../../src/agents/research/orion-agent.js";
import { SageAgent } from "../../src/agents/knowledge/sage-agent.js";
import { PulseAgent } from "../../src/agents/observation/pulse-agent.js";
import { ForgeAgent } from "../../src/agents/engineering/forge-agent.js";
import { NovaAgent } from "../../src/agents/creation/nova-agent.js";
import { VectorAgent } from "../../src/agents/execution/vector-agent.js";
import { VanguardAgent } from "../../src/agents/security/vanguard-agent.js";
import { createSmartStrategy, splitObjectiveIntoClauses } from "../../src/agents/executive/decomposition.js";
import { KnowledgePipeline } from "../../src/core/knowledge/pipeline.js";
import { InMemoryMemoryStore } from "../../src/core/memory/in-memory-store.js";
import type { DelegatableAgent } from "../../src/agents/tool-boundary.js";

/**
 * Generalization benchmark suite (Constitution section 9, Phase 5) —
 * measuring whether the system's behavior holds on inputs it was not
 * specifically built or tuned for.
 *
 * Checks G1–G7:
 *   G1  unseen objectives decompose into sensible role-routed plans
 *   G2  plan stability: paraphrased objectives route to the same workers
 *   G3  composition scaling: adding a specialist changes routing without
 *       breaking existing routes (zero-touch routing generalizes)
 *   G4  cross-domain knowledge transfer: ingested knowledge is retrievable
 *       through paraphrased queries over a shared store
 *   G5  vocabulary independence: routing keys off role metadata, not
 *       agent names — renamed agents keep their routes
 *   G6  monotonic capability: more eligible workers never produce empty
 *       plans for a decomposable objective
 *   G7  out-of-distribution objectives degrade gracefully (empty or
 *       best-effort plans, never exceptions)
 */

const SESSION = { maxCycles: 1 };

function rosterWith(
  ...specialists: readonly DelegatableAgent[]
): { atlas: AtlasAgent } {
  const atlas = new AtlasAgent({ memoryStore: new InMemoryMemoryStore(), session: SESSION });
  for (const specialist of specialists) atlas.addWorker(specialist);
  return { atlas };
}

function makeSpecialists() {
  const base = { memoryStore: new InMemoryMemoryStore(), session: SESSION };
  return {
    orion: new OrionAgent({ ...base, agentId: "orion" }),
    sage: new SageAgent({ ...base, agentId: "sage" }),
    pulse: new PulseAgent({ ...base, agentId: "pulse" }),
    forge: new ForgeAgent({ ...base, agentId: "forge" }),
    nova: new NovaAgent({ ...base, agentId: "nova" }),
    vector: new VectorAgent({ ...base, agentId: "vector" }),
    vanguard: new VanguardAgent({ ...base, agentId: "vanguard" }),
  };
}

function workerIds(strategy: (goal: string) => readonly { workerId: string }[], objective: string): readonly string[] {
  return strategy(objective).map((t) => t.workerId);
}

describe("generalization benchmark suite", () => {
  it("G1: unseen objectives decompose into sensible role-routed plans", () => {
    const s = makeSpecialists();
    const { atlas } = rosterWith(s.orion, s.forge, s.pulse, s.vector);

    // An objective no test author specifically designed routing for.
    // Note: "fix" is an engineering keyword, so the deploy clause avoids
    // it — first-match keyword routing is substring-based and ordered.
    const strategy = createSmartStrategy(atlas.coordinator.listAgents());
    const plan = strategy("Investigate the cache invalidation bug, then patch the eviction policy, then deploy the release to staging");

    expect(plan.length).toBe(3);
    expect(plan[0]?.workerId).toBe("orion");   // investigate → research
    expect(plan[1]?.workerId).toBe("forge");   // patch → engineering
    expect(plan[2]?.workerId).toBe("vector");  // deploy/release → execution
  });

  it("G2: paraphrased objectives route to the same workers", () => {
    const s = makeSpecialists();
    const { atlas } = rosterWith(s.orion, s.forge, s.nova);

    const strategy = createSmartStrategy(atlas.coordinator.listAgents());
    const a = workerIds(strategy, "Research the protocol; then implement the parser; then draft the announcement");
    const b = workerIds(strategy, "Examine the protocol, then develop the parser, then author the announcement");

    expect(a).toEqual(b);
    expect(a).toEqual(["orion", "forge", "nova"]);
  });

  it("G3: adding a specialist refines routing without breaking existing routes", () => {
    const s = makeSpecialists();
    const { atlas } = rosterWith(s.orion, s.nova);

    const before = createSmartStrategy(atlas.coordinator.listAgents())(
      "Research the topic, then create the poster",
    );
    expect(before.map((t) => t.workerId)).toEqual(["orion", "nova"]);

    // Zero-touch routing: registering a security specialist does not
    // change research/creation routes.
    atlas.addWorker(s.vanguard);
    const after = createSmartStrategy(atlas.coordinator.listAgents())(
      "Research the topic, then create the poster",
    );
    expect(after.map((t) => t.workerId)).toEqual(["orion", "nova"]);
  });

  it("G4: cross-domain knowledge transfer over a shared store", async () => {
    const shared = new InMemoryMemoryStore();
    const pipeline = new KnowledgePipeline({ memoryStore: shared, ownerAgentId: "sage" });
    await pipeline.ingest({
      topic: "networking",
      source: "https://docs.example.com/tcp",
      content:
        "TCP provides ordered, reliable delivery between endpoints using " +
        "sequence numbers and acknowledgements for retransmission.",
    });

    const sage = new SageAgent({ agentId: "sage", memoryStore: shared, session: SESSION });
    // Paraphrased, cross-vocabulary query — same underlying knowledge.
    const viaTerm = await sage.recallFacts("acknowledgements");
    const viaConcept = await sage.recallFacts("reliable delivery");
    expect(viaTerm.length).toBe(1);
    expect(viaConcept.length).toBe(1);
  });

  it("G5: routing keys off role metadata, not agent names", () => {
    const base = { memoryStore: new InMemoryMemoryStore(), session: SESSION };
    // A research agent with a completely different registry id.
    const renamed = new OrionAgent({ ...base, agentId: "archivist-unit-7" });
    const { atlas } = rosterWith(renamed);

    const strategy = createSmartStrategy(atlas.coordinator.listAgents());
    const plan = strategy("Investigate the memory leak");
    expect(plan.length).toBe(1);
    expect(plan[0]?.workerId).toBe("archivist-unit-7");
  });

  it("G6: more eligible workers never produce empty plans for decomposable objectives", () => {
    const s = makeSpecialists();
    const objective =
      "Research the options, then build the solution, then monitor the results";

    const { atlas } = rosterWith(s.orion);
    const one = createSmartStrategy(atlas.coordinator.listAgents())(objective);
    expect(one.length).toBeGreaterThan(0);

    atlas.addWorker(s.forge);
    const two = createSmartStrategy(atlas.coordinator.listAgents())(objective);
    expect(two.length).toBeGreaterThan(0);

    atlas.addWorker(s.pulse);
    const three = createSmartStrategy(atlas.coordinator.listAgents())(objective);
    expect(three.length).toBeGreaterThan(0);
    expect(three.length).toBe(3); // all three roles now reachable
  });

  it("G7: out-of-distribution objectives degrade gracefully, never throw", () => {
    const s = makeSpecialists();
    const { atlas } = rosterWith(s.orion, s.forge);
    const strategy = createSmartStrategy(atlas.coordinator.listAgents());

    // Nonsense, adversarial, and empty-ish inputs must not throw.
    expect(() => strategy("Xyzzy plugh zazzy frazzle")).not.toThrow();
    expect(() => strategy("")).not.toThrow();
    expect(() => strategy(";;;")).not.toThrow();

    // Every produced task binds to a real eligible worker.
    for (const input of ["Xyzzy plugh zazzy frazzle", "", ";;;"]) {
      const plan = strategy(input);
      for (const task of plan) {
        expect(atlas.coordinator.has(task.workerId)).toBe(true);
      }
    }

    // Clause splitting also never throws on odd inputs.
    expect(() => splitObjectiveIntoClauses(";;;;")).not.toThrow();
  });
});
