import { describe, expect, it } from "vitest";
import { AgentMessageBus } from "../../../src/agents/message-bus.js";
import { AtlasAgent } from "../../../src/agents/executive/atlas-agent.js";
import { VanguardAgent } from "../../../src/agents/security/vanguard-agent.js";
import type { VanguardAgentOptions } from "../../../src/agents/security/vanguard-agent.js";
import { InMemoryMemoryStore } from "../../../src/core/memory/in-memory-store.js";
import { InMemoryExperienceStore } from "../../../src/core/experience/in-memory-experience-store.js";
import { writeFileTool } from "../../../src/core/tools/built-in/write-file.js";
import { runCommandTool } from "../../../src/core/tools/built-in/run-command.js";
import { readFileTool } from "../../../src/core/tools/built-in/read-file.js";
import { dataLookupTool } from "../../../src/core/tools/built-in/data-lookup.js";
import { ToolPolicy } from "../../../src/core/tools/policy.js";
import type { Tool } from "../../../src/core/tools/types.js";
import type { ToolDefinition } from "../../../src/core/tools/types.js";
import type { ActionRequest } from "../../../src/core/action/types.js";

function makeVanguard(overrides: Partial<VanguardAgentOptions> = {}): VanguardAgent {
  return new VanguardAgent({
    memoryStore: new InMemoryMemoryStore(),
    session: { maxCycles: 1 },
    ...overrides,
  });
}

function toolDef(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    id: "kairos.test-tool",
    name: "Test Tool",
    description: "test",
    version: "1.0.0",
    capabilities: ["read-memory"],
    permission: "public",
    risk: "low",
    inputSchema: {},
    outputSchema: {},
    enabled: true,
    ...overrides,
  };
}

function actionRequest(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    id: crypto.randomUUID(),
    name: "inspect-state",
    description: "test action",
    parameters: {},
    requestedBy: "vanguard-test",
    ...overrides,
  };
}

describe("VanguardAgent", () => {
  it("has a stable identity describing the VANGUARD security role", () => {
    const vanguard = makeVanguard();
    expect(vanguard.identity.name).toBe("vanguard");
    expect(vanguard.identity.metadata.role).toBe("security");
    expect(vanguard.identity.metadata.specialty).toBe("security-and-governance");
    expect(vanguard.identity.metadata.capabilities).toContain("policy-enforcement");
    expect(vanguard.identity.metadata.constraints).toContain("read-only tool access");
  });

  it("registers read-only inspection tools — no write or execute tools", () => {
    const vanguard = makeVanguard();
    const ids = vanguard.toolRegistry.getAll().map((t) => t.definition.id);

    expect(ids).toContain("kairos.date-time");
    expect(ids).toContain("kairos.data-lookup");
    expect(ids).toContain("kairos.read-file");
    expect(ids).toContain("kairos.list-directory");
    expect(ids).toContain("kairos.search-code");

    expect(ids).not.toContain("kairos.write-file");
    expect(ids).not.toContain("kairos.run-command");
  });

  it("rejects write/execute extras and blocks them at policy", async () => {
    expect(() => makeVanguard({ extraTools: [writeFileTool] })).toThrow(/write|execute/i);
    expect(() => makeVanguard({ extraTools: [runCommandTool] })).toThrow(/write|execute/i);

    const vanguard = makeVanguard();
    vanguard.toolRegistry.register(runCommandTool);
    const output = await vanguard.toolGateway.execute(vanguard.identity.id, {
      toolId: "kairos.run-command",
      parameters: { command: "echo hacked" },
      requestedBy: vanguard.identity.id,
      requestId: crypto.randomUUID(),
    });
    expect(output.status).toBe("blocked");
  });

  it("screens tool definitions against policy limits", () => {
    const vanguard = makeVanguard();

    const ok = vanguard.screenTool(readFileTool);
    expect(ok.allowed).toBe(true);

    const tooRisky = vanguard.screenTool(
      toolDef({ id: "kairos.risky", risk: "critical" }),
    );
    expect(tooRisky.allowed).toBe(false);

    const tooPrivileged = vanguard.screenTool(
      toolDef({ id: "kairos.admin", permission: "admin" }),
    );
    expect(tooPrivileged.allowed).toBe(false);
  });

  it("screens actions through its own deny-by-default engine", async () => {
    const vanguard = makeVanguard({ allowedActions: ["deploy-approved"] });

    const allowed = await vanguard.authorizeAction(actionRequest({ name: "deploy-approved" }));
    expect(allowed.allowed).toBe(true);

    const denied = await vanguard.authorizeAction(actionRequest({ name: "delete-everything" }));
    expect(denied.allowed).toBe(false);
  });

  it("records findings and recalls them by query", async () => {
    const vanguard = makeVanguard();
    await vanguard.recordFinding(
      "Privilege escalation attempt: actor tried admin-level tool",
      { severity: "high" },
    );

    const findings = await vanguard.findings("privilege escalation");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.content).toContain("admin-level");
    expect(findings[0]?.metadata.severity).toBe("high");
  });

  it("performs a compliance review across registered tools and policies", async () => {
    const vanguard = makeVanguard();
    const report = await vanguard.complianceReview({
      tools: [readFileTool, dataLookupTool, runCommandTool],
      policies: [
        new ToolPolicy({ actorPermissions: ["public"], maxRisk: "low" }),
      ],
    });

    expect(report.checked).toBe(3);
    // run-command (high risk) violates the low-risk policy.
    expect(report.violations.length).toBeGreaterThanOrEqual(1);
    expect(report.violations.some((v) => v.includes("run-command"))).toBe(true);
    expect(report.generatedAt).toBeInstanceOf(Date);
  });

  it("runs a governance goal through its own cognitive loop", async () => {
    const vanguard = makeVanguard();
    const result = await vanguard.review("Audit the tool registry permissions");
    expect(result.totalCycles).toBeGreaterThan(0);
  });

  it("records experience tagged with its own session id", async () => {
    const experienceStore = new InMemoryExperienceStore();
    const vanguard = makeVanguard({ experienceStore });
    await vanguard.run("Review the delegation policy");

    const records = await experienceStore.query({ sessionId: vanguard.identity.id });
    expect(records).toHaveLength(1);
    expect(records[0]?.sessionId).toBe(vanguard.identity.id);
  });

  it("keeps VANGUARD findings isolated from agents sharing the same store", async () => {
    const shared = new InMemoryMemoryStore();
    const vanguard = makeVanguard({ memoryStore: shared, agentId: "vanguard" });
    const { OrionAgent } = await import("../../../src/agents/research/orion-agent.js");
    const orion = new OrionAgent({
      agentId: "orion",
      memoryStore: shared,
      session: { maxCycles: 1 },
    });

    await vanguard.recordFinding("VANGUARD-only security finding");
    await orion.rememberFinding("ORION-only research finding");

    const own = await vanguard.findings("security finding");
    expect(own).toHaveLength(1);

    const seesOrion = await vanguard.memory.semantic.recall("ORION-only");
    expect(seesOrion).toHaveLength(0);
  });

  it("exchanges messages over a shared bus", () => {
    const bus = new AgentMessageBus();
    const vanguard = makeVanguard({ messageBus: bus });

    vanguard.sendToAgent("atlas", "Policy violation detected");
    const inbox = bus.drain("atlas");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.content).toContain("violation");
  });

  it("is routed security clauses by ATLAS smart strategy", async () => {
    const vanguard = makeVanguard({ agentId: "vanguard" });
    const { OrionAgent } = await import("../../../src/agents/research/orion-agent.js");
    const orion = new OrionAgent({
      agentId: "orion",
      memoryStore: new InMemoryMemoryStore(),
      session: { maxCycles: 1 },
    });

    const atlas = new AtlasAgent({
      memoryStore: new InMemoryMemoryStore(),
      session: { maxCycles: 1 },
    });
    atlas.addWorker(orion);
    atlas.addWorker(vanguard);

    const outcome = await atlas.orchestrate(
      "Research the access model; then audit the permission policies",
      { record: false },
    );

    expect(outcome.delegationResults.length).toBe(2);
    expect(outcome.delegationResults[0]?.toAgentId).toBe("orion");
    expect(outcome.delegationResults[1]?.toAgentId).toBe("vanguard");
  });
});
