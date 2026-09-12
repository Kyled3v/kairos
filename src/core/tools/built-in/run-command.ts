import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolInput, ToolOutput } from "../types.js";

const execAsync = promisify(exec);

// Strict allowlist â€” never permit arbitrary shell execution.
const COMMAND_ALLOWLIST: readonly string[] = [
  "npm test",
  "npm run test",
  "npm run typecheck",
  "npm run build",
  "npm run lint",
  "npx tsc --noEmit",
  "git status",
  "git diff",
  "git log",
  "git branch",
  "git show",
  "git add",
  "git commit",
  "git stash",
  "git checkout",
];

function isAllowlisted(command: string): boolean {
  const trimmed = command.trim();
  return COMMAND_ALLOWLIST.some(
    (prefix) => trimmed === prefix || trimmed.startsWith(`${prefix} `),
  );
}

export const runCommandTool: Tool = {
  definition: {
    id: "kairos.run-command",
    name: "Run Command",
    description:
      "Executes an allowlisted shell command (npm scripts, git inspection). " +
      "Arbitrary shell execution is not permitted.",
    version: "1.0.0",
    capabilities: ["execute-shell"],
    permission: "privileged",
    risk: "high",
    inputSchema: {
      command: { type: "string", description: "The allowlisted command to run." },
      cwd: { type: "string", description: "Optional working directory." },
    },
    outputSchema: {
      stdout: { type: "string", description: "Standard output." },
      stderr: { type: "string", description: "Standard error." },
    },
    enabled: true,
  },

  async execute(input: ToolInput): Promise<ToolOutput> {
    const startedAt = new Date();
    const start = Date.now();
    const command = input.parameters["command"];
    const cwd = input.parameters["cwd"];

    if (typeof command !== "string" || command.trim() === "") {
      return {
        toolId: input.toolId, requestId: input.requestId,
        status: "failure", error: "Parameter 'command' must be a non-empty string.",
        executedAt: startedAt, durationMs: Date.now() - start,
      };
    }

    if (!isAllowlisted(command)) {
      return {
        toolId: input.toolId, requestId: input.requestId,
        status: "blocked",
        error: `Command not in allowlist: '${command}'. Only specific npm and git commands are permitted.`,
        executedAt: startedAt, durationMs: Date.now() - start,
      };
    }

    const execOptions =
      typeof cwd === "string" && cwd.trim() !== ""
        ? { cwd, timeout: 30_000 }
        : { timeout: 30_000 };

    try {
      const { stdout, stderr } = await execAsync(command, execOptions);
      return {
        toolId: input.toolId, requestId: input.requestId,
        status: "success",
        result: { command, stdout: stdout.trim(), stderr: stderr.trim() },
        executedAt: startedAt, durationMs: Date.now() - start,
      };
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string; message?: string };
      return {
        toolId: input.toolId, requestId: input.requestId,
        status: "failure",
        error: e.message ?? String(error),
        result: { command, stdout: (e.stdout ?? "").trim(), stderr: (e.stderr ?? "").trim() },
        executedAt: startedAt, durationMs: Date.now() - start,
      };
    }
  },
};
