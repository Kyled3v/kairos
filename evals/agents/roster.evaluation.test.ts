import { describe, expect, it } from "vitest";
import { AtlasAgent } from "../../src/agents/executive/atlas-agent.js";
import { OrionAgent } from "../../src/agents/research/orion-agent.js";
import { SageAgent } from "../../src/agents/knowledge/sage-agent.js";
import { PulseAgent } from "../../src/agents/observation/pulse-agent.js";
import { ForgeAgent } from "../../src/agents/engineering/forge-agent.js";
import { NovaAgent } from "../../src/agents/creation/nova-agent.js";
import { VectorAgent } from "../../src/agents/execution/vector-agent.js";
import { VanguardAgent } from "../../src/agents/security/vanguard-agent.js";
import { InMemoryMemoryStore } from "../../src/core/memory/in-memory-store.js";
import { InMemoryExperienceStore } from "../../src/core/experience/in-memory-experience-store.js";
import { writeFileTool } from "../../src/core/tools/built-in/write-file.js";
import { runCommandTool } from "../../src/core/tools/built-in/run-command.js";

/**
 * Full-roster evaluation suite (Constitution section 9) — the eight named
 * specialist agents scored together.
 *
 * Checks F1–F8:
 *   F1  complete roster registers with ATLAS and lists all identities
 *   F2  role coverage: every specialist role routes to its named agent
 *   F3  executives never receive delegated work
 *   F4  memory isolation: eight agents, one shared store, zero leakage
 *   F5  privilege spectrum: read-only agents reject write/execute extras
 *   F6  privilege spectrum: gated agents (FORGE/VECTOR) default read-only
 *   F7  audit trails: every agent records experience under its own id
 *   F8  full-roster orchestration completes with every worker reachable
 */

const SESSION = { maxCycles: 1 };

interface Roster {
  atlas: AtlasAgent;
  orion: OrionAgent;
  sage: SageAgent;
  pulse: PulseAgent;
  forge: ForgeAgent;
  nova: NovaAgent;
  vector: VectorAgent;
  vanguard: VanguardAgent;
}

function makeRoster(sharedStore: InMemoryMemoryStore): Roster {
  return {
    atlas: new AtlasAgent({ agentId: "atlas", memoryStore: sharedStore, session: SESSION }),
    orion: new OrionAgent({ agentId: "orion", memoryStore: sharedStore, session: SESSION }),
    sage: new SageAgent({ agentId: "sage", memoryStore: sharedStore, session: SESSION }),
    pulse: new PulseAgent({ agentId: "pulse", memoryStore: sharedStore, session: SESSION }),
    forge: new ForgeAgent({ agentId: "forge", memoryStore: sharedStore, session: SESSION }),
    nova: new NovaAgent({ agentId: "nova", memoryStore: sharedStore, session: SESSION }),
    vector: new VectorAgent({ agentId: "vector", memoryStore: sharedStore, session: SESSION }),
    vanguard: new VanguardAgent({ agentId: "vanguard", memoryStore: sharedStore, session: SESSION }),
  };
}

function registerAll(atlas: AtlasAgent, roster: Roster): void {
  atlas.addWorker(roster.orion);
  atlas.addWorker(roster.sage);
  atlas.addWorker(roster.pulse);
  atlas.addWorker(roster.forge);
  atlas.addWorker(roster.nova);
  atlas.addWorker(roster.vector);
  atlas.addWorker(roster.vanguard);
}

describe("full-roster evaluation suite", () => {
  it("F1: the complete roster registers with ATLAS and lists every identity", () => {
    const store = new InMemoryMemoryStore();
    const roster = makeRoster(store);
    registerAll(roster.atlas, roster);

    const ids = roster.atlas.coordinator.listAgentIds();
    for (const expected of ["orion", "sage", "pulse", "forge", "nova", "vector", "vanguard"]) {
      expect(ids).toContain(expected);
    }
    // ATLAS registers itself in its coordinator (as a KairosAgent) but the
    // executive role excludes it from receiving routed work (verified in
    // F3) — it is present as an identity, not as an eligible worker.
  });

  it("F2: every specialist role routes to its named agent", async () => {
    const store = new InMemoryMemoryStore();
    const roster = makeRoster(store);
    registerAll(roster.atlas, roster);

    const objective =
      "Research the system; then implement the fix; then create the brief; " +
      "then organise the archive; then monitor the rollout; " +
      "then audit the policies; then execute the deployment";

    const outcome = await roster.atlas.orchestrate(objective, {
      record: false,
      maxSubTasks: 8, // 7 clauses — default cap is 6
    });
    const routed = outcome.delegationResults.map((r) => r.toAgentId);

    expect(routed[0]).toBe("orion");       // research
    expect(routed[1]).toBe("forge");       // implement
    expect(routed[2]).toBe("nova");        // create
    expect(routed[3]).toBe("sage");        // document
    expect(routed[4]).toBe("pulse");       // monitor
    expect(routed[5]).toBe("vanguard");    // audit
    expect(routed[6]).toBe("vector");      // execute
  });

  it("F3: executives never receive delegated work", async () => {
    const store = new InMemoryMemoryStore();
    const roster = makeRoster(store);
    registerAll(roster.atlas, roster);

    const outcome = await roster.atlas.orchestrate(
      "Coordinate the objective and execute the rollout",
      { record: false },
    );

    const routed = outcome.delegationResults.map((r) => r.toAgentId);
    expect(routed).not.toContain("atlas");
    expect(outcome.status).not.toBe("empty");
  });

  it("F4: memory isolation — eight agents, one shared store, zero leakage", async () => {
    const shared = new InMemoryMemoryStore();
    const roster = makeRoster(shared);

    // Each agent writes a uniquely-tagged semantic memory through its own
    // domain method, exercising different memory-type surfaces.
    await roster.orion.rememberFinding("ORIONTAG private research");
    await roster.sage.learnFact("SAGETAG private fact");
    await roster.forge.rememberImplementation("FORGETAG private note");
    await roster.nova.saveDraft("NOVATAG private draft");
    await roster.vanguard.recordFinding("VANGUARDTAG private finding");

    // PULSE stores observations as episodic memory with the subject
    // embedded in content — query by subject for its view.
    await roster.pulse.recordObservation("PULSETAG-subject", "private observation");

    // Every semantic-memory surface sees exactly its own tag and none of
    // the other agents' tags.
    const semanticTags: Record<string, string> = {
      orion: "ORIONTAG",
      sage: "SAGETAG",
      forge: "FORGETAG",
      nova: "NOVATAG",
      vanguard: "VANGUARDTAG",
    };
    const allTags = [...Object.values(semanticTags), "PULSETAG-subject"];

    for (const [owner, tag] of Object.entries(semanticTags)) {
      const agent = roster[owner as keyof Roster];
      const view = await agent.memory.semantic.recall(tag);
      expect(view.length).toBe(1);
      for (const other of allTags.filter((t) => t !== tag)) {
        const leaked = await agent.memory.semantic.recall(other);
        expect(leaked.length).toBe(0);
      }
    }

    // PULSE observes through episodic memory; it must see its own
    // observation and none of the semantic tags.
    const pulseView = await roster.pulse.observations("PULSETAG-subject");
    expect(pulseView.length).toBe(1);
    const pulseLeak = await roster.pulse.observations("ORIONTAG");
    expect(pulseLeak.length).toBe(0);
  });

  it("F5: read-only agents reject write/execute tools at construction", () => {
    const store = new InMemoryMemoryStore();
    const base = { memoryStore: store, session: SESSION };

    expect(() => new OrionAgent({ ...base, extraTools: [writeFileTool] })).toThrow(/write|execute/i);
    expect(() => new SageAgent({ ...base, extraTools: [runCommandTool] })).toThrow(/write|execute/i);
    expect(() => new PulseAgent({ ...base, extraTools: [writeFileTool] })).toThrow(/write|execute/i);
    expect(() => new NovaAgent({ ...base, extraTools: [runCommandTool] })).toThrow(/write|execute/i);
    expect(() => new VanguardAgent({ ...base, extraTools: [writeFileTool] })).toThrow(/write|execute/i);
  });

  it("F6: gated agents (FORGE, VECTOR) default to read-only toolsets", () => {
    const store = new InMemoryMemoryStore();
    const base = { memoryStore: store, session: SESSION };

    for (const agent of [new ForgeAgent(base), new VectorAgent(base)]) {
      const ids = agent.toolRegistry.getAll().map((t) => t.definition.id);
      expect(ids).not.toContain("kairos.write-file");
      expect(ids).not.toContain("kairos.run-command");
    }
  });

  it("F7: audit trails — every agent records experience under its own id", async () => {
    const experienceStore = new InMemoryExperienceStore();
    const store = new InMemoryMemoryStore();
    const roster = makeRoster(store);
    const withAudit = {
      atlas: new AtlasAgent({ agentId: "atlas", memoryStore: store, experienceStore, session: SESSION }),
      orion: new OrionAgent({ agentId: "orion", memoryStore: store, experienceStore, session: SESSION }),
      sage: new SageAgent({ agentId: "sage", memoryStore: store, experienceStore, session: SESSION }),
      pulse: new PulseAgent({ agentId: "pulse", memoryStore: store, experienceStore, session: SESSION }),
      forge: new ForgeAgent({ agentId: "forge", memoryStore: store, experienceStore, session: SESSION }),
      nova: new NovaAgent({ agentId: "nova", memoryStore: store, experienceStore, session: SESSION }),
      vector: new VectorAgent({ agentId: "vector", memoryStore: store, experienceStore, session: SESSION }),
      vanguard: new VanguardAgent({ agentId: "vanguard", memoryStore: store, experienceStore, session: SESSION }),
    };

    await withAudit.atlas.run("Plan the objective");
    await withAudit.orion.run("Research the objective");
    await withAudit.sage.run("Organise the knowledge");
    await withAudit.pulse.run("Monitor the objective");
    await withAudit.forge.run("Build the objective");
    await withAudit.nova.run("Draft the objective");
    await withAudit.vector.run("Execute the objective");
    await withAudit.vanguard.run("Audit the objective");

    for (const id of ["atlas", "orion", "sage", "pulse", "forge", "nova", "vector", "vanguard"]) {
      const records = await experienceStore.query({ sessionId: id });
      expect(records.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("F8: full-roster orchestration completes with every delegation successful", async () => {
    const store = new InMemoryMemoryStore();
    const roster = makeRoster(store);
    registerAll(roster.atlas, roster);

    const outcome = await roster.atlas.orchestrate(
      "Research the platform; then create the launch brief; then document the results",
      { record: true },
    );

    expect(outcome.status).toBe("complete");
    expect(outcome.decompositionMode).toBe("smart");
    expect(outcome.delegationResults.every((r) => r.status === "success")).toBe(true);
  });
});
