import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentMessageBus } from "../../../src/agents/message-bus.js";
import { ForgeAgent } from "../../../src/agents/engineering/forge-agent.js";
import type { ForgeAgentOptions } from "../../../src/agents/engineering/forge-agent.js";
import { InMemoryMemoryStore } from "../../../src/core/memory/in-memory-store.js";
import { InMemoryExperienceStore } from "../../../src/core/experience/in-memory-experience-store.js";
import { writeFileTool } from "../../../src/core/tools/built-in/write-file.js";
import { runCommandTool } from "../../../src/core/tools/built-in/run-command.js";
import { dataLookupTool } from "../../../src/core/tools/built-in/data-lookup.js";

function makeForge(overrides: Partial<ForgeAgentOptions> = {}): ForgeAgent {
  return new ForgeAgent({
    memoryStore: new InMemoryMemoryStore(),
    session: { maxCycles: 1 },
    ...overrides,
  });
}

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "kairos-forge-"));
  tempDirs.push(dir);
  return dir;
}

describe("ForgeAgent", () => {
  it("has a stable identity describing the FORGE engineering role", () => {
    const forge = makeForge();
    expect(forge.identity.name).toBe("forge");
    expect(forge.identity.metadata.role).toBe("engineering");
    expect(forge.identity.metadata.specialty).toBe("software-engineering");
    expect(Array.isArray(forge.identity.metadata.capabilities)).toBe(true);
    expect(Array.isArray(forge.identity.metadata.constraints)).toBe(true);
    expect(forge.identity.metadata.constraints).toContain("write access gated behind explicit flags");
  });

  it("registers read-only engineering tools by default — no write or execute tools", () => {
    const forge = makeForge();
    const ids = forge.toolRegistry.getAll().map((t) => t.definition.id);

    expect(ids).toContain("kairos.read-file");
    expect(ids).toContain("kairos.list-directory");
    expect(ids).toContain("kairos.search-code");
    expect(ids).toContain("kairos.date-time");

    expect(ids).not.toContain("kairos.write-file");
    expect(ids).not.toContain("kairos.run-command");
  });

  it("gains write-file only when allowWrite is explicitly true", () => {
    const readonlyForge = makeForge();
    expect(
      readonlyForge.toolRegistry.getAll().map((t) => t.definition.id),
    ).not.toContain("kairos.write-file");

    const writeForge = makeForge({ allowWrite: true });
    expect(
      writeForge.toolRegistry.getAll().map((t) => t.definition.id),
    ).toContain("kairos.write-file");
  });

  it("gains run-command only when allowRunCommand is explicitly true", () => {
    const base = makeForge();
    expect(
      base.toolRegistry.getAll().map((t) => t.definition.id),
    ).not.toContain("kairos.run-command");

    const execForge = makeForge({ allowRunCommand: true });
    expect(
      execForge.toolRegistry.getAll().map((t) => t.definition.id),
    ).toContain("kairos.run-command");
  });

  it("blocks write tools at the policy while write access is disabled", async () => {
    const forge = makeForge();
    // Simulate an intruder registration — the policy must still block it.
    forge.toolRegistry.register(writeFileTool);

    const decision = forge.policy.evaluate(forge.identity.id, writeFileTool.definition);
    expect(decision.allowed).toBe(false);

    const output = await forge.toolGateway.execute(forge.identity.id, {
      toolId: "kairos.write-file",
      parameters: { path: join(await tempDir(), "nope.txt"), content: "nope" },
      requestedBy: forge.identity.id,
      requestId: crypto.randomUUID(),
    });
    expect(output.status).toBe("blocked");
  });

  it("writes files through the gateway when write access is enabled", async () => {
    const dir = await tempDir();
    const forge = makeForge({ allowWrite: true });

    const output = await forge.toolGateway.execute(forge.identity.id, {
      toolId: "kairos.write-file",
      parameters: { path: join(dir, "src", "hello.txt"), content: "forged by FORGE" },
      requestedBy: forge.identity.id,
      requestId: crypto.randomUUID(),
    });

    expect(output.status).toBe("success");
    expect(await readFile(join(dir, "src", "hello.txt"), "utf-8")).toBe("forged by FORGE");
  });

  it("executes an allowlisted command when run-command access is enabled", async () => {
    const forge = makeForge({ allowRunCommand: true });

    // "git status" runs against this repository — always allowlisted.
    const output = await forge.toolGateway.execute(forge.identity.id, {
      toolId: "kairos.run-command",
      parameters: { command: "git status" },
      requestedBy: forge.identity.id,
      requestId: crypto.randomUUID(),
    });

    expect(output.status).toBe("success");
  });

  it("still refuses non-allowlisted commands even with run-command access", async () => {
    const forge = makeForge({ allowRunCommand: true });
    const output = await forge.toolGateway.execute(forge.identity.id, {
      toolId: "kairos.run-command",
      parameters: { command: "rm -rf /" },
      requestedBy: forge.identity.id,
      requestId: crypto.randomUUID(),
    });
    expect(output.status).toBe("blocked");
  });

  it("runs an engineering goal and completes cycles", async () => {
    const forge = makeForge();
    const result = await forge.build("Implement a fixture loader for the test suite");
    expect(result.totalCycles).toBeGreaterThan(0);
    expect(result.goal).toBe("Implement a fixture loader for the test suite");
  });

  it("persists engineering notes as scoped semantic memories", async () => {
    const forge = makeForge();
    await forge.rememberImplementation("The fixture loader reads specs from disk", {
      component: "fixture-loader",
    });

    const notes = await forge.implementations("fixture loader");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.content).toContain("fixture loader");
    expect(notes[0]?.metadata.source).toBe("forge");
  });

  it("keeps FORGE memory isolated from other agents sharing the same store", async () => {
    const shared = new InMemoryMemoryStore();
    const forge = makeForge({ memoryStore: shared, agentId: "forge" });
    await forge.rememberImplementation("FORGE private engineering note", { topic: "private" });

    const direct = await shared.retrieve({ query: "private" });
    expect(direct.every((m) => m.content.includes("FORGE"))).toBe(true);
  });

  it("records a build summary as episodic memory and can recall it", async () => {
    const forge = makeForge();
    const result = await forge.build("Refactor the policy checks");
    const summary = await forge.recordBuildSummary(result);

    expect(summary).toContain("engineering session");
    const episodes = await forge.buildHistory();
    expect(episodes.length).toBeGreaterThan(0);
    expect(episodes[0]?.type).toBe("episodic");
  });

  it("records tool calls into experience records tagged with its session", async () => {
    const experienceStore = new InMemoryExperienceStore();
    const forge = makeForge({ experienceStore });

    await forge.toolGateway.execute(forge.identity.id, {
      toolId: "kairos.date-time",
      parameters: {},
      requestedBy: forge.identity.id,
      requestId: crypto.randomUUID(),
    });

    await forge.build("Verify the repository layout");
    const records = await experienceStore.query({ sessionId: forge.identity.id });
    expect(records).toHaveLength(1);
    const toolIds = records[0]?.toolCalls.map((tc) => tc.toolId) ?? [];
    expect(toolIds).toContain("kairos.date-time");
  });

  it("exchanges messages with other agents over a shared bus", () => {
    const bus = new AgentMessageBus();
    const forge = makeForge({ messageBus: bus });

    forge.sendToAgent("atlas", "Build complete: 2 files changed");
    const inbox = bus.drain("atlas");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.content).toContain("2 files changed");
  });

  it("reports collected tool calls", async () => {
    const forge = makeForge();
    await forge.toolGateway.execute(forge.identity.id, {
      toolId: "kairos.date-time",
      parameters: {},
      requestedBy: forge.identity.id,
      requestId: crypto.randomUUID(),
    });
    expect(forge.getToolCalls().map((tc) => tc.toolId)).toContain("kairos.date-time");
  });

  it("rejects write/execute tools via extraTools when write access is disabled", () => {
    // With allowWrite disabled the constructor must reject write tools.
    expect(() => makeForge({ extraTools: [writeFileTool] })).toThrow(/write|execute/i);
  });

  it("accepts safe extra tools", () => {
    const forge = makeForge({ extraTools: [dataLookupTool] });
    expect(
      forge.toolRegistry.getAll().map((t) => t.definition.id),
    ).toContain("kairos.data-lookup");
  });
});
