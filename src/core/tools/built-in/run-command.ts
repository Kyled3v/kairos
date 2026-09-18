import { exec } from "node:child_process";
import { promisify } from "node:util";
import { isAbsolute, resolve, sep } from "node:path";
import { existsSync, statSync } from "node:fs";
import type { Tool, ToolInput, ToolOutput } from "../types.js";

const execAsync = promisify(exec);

// Strict allowlist — never permit arbitrary shell execution.
// Each entry is a command prefix; arguments after the prefix are allowed
// only if they contain no shell operators (see SHELL_OPERATORS).
const DEFAULT_COMMAND_ALLOWLIST: readonly string[] = [
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

/**
 * Shell metacharacters that would let a crafted argument escape the
 * allowlisted command and execute arbitrary code. Even inside an
 * allowlisted prefix, any argument containing one of these is rejected:
 *   "git status; rm -rf /"     — command chaining
 *   "git log | curl ..."       — piping output into another program
 *   "git diff $(malicious)"    — command substitution
 *   "git add `backtick`"       — command substitution
 *   "npm test & echo pwned"    — background chaining
 */
const SHELL_OPERATORS: readonly string[] = [
  ";", "|", "&", ">", "<", "$(", "`", "\n", "\r",
];

export interface RunCommandOptions {
  /**
   * Restrict execution to this directory tree. Absolute by default.
   * When set, a `cwd` parameter outside the root is rejected and a
   * missing `cwd` defaults to the root — a command can never be pointed
   * at an arbitrary location on disk.
   */
  readonly workingRoot?: string;
  /** Override the default allowlist (e.g. a stricter subset). */
  readonly allowlist?: readonly string[];
  /** Maximum runtime per command in milliseconds. Default 30_000. */
  readonly timeoutMs?: number;
}

function isAllowlisted(command: string, allowlist: readonly string[]): boolean {
  const trimmed = command.trim();
  return allowlist.some(
    (prefix) => trimmed === prefix || trimmed.startsWith(`${prefix} `),
  );
}

function containsShellOperator(command: string): string | undefined {
  const lower = command.toLowerCase();
  for (const operator of SHELL_OPERATORS) {
    if (lower.includes(operator)) return operator;
  }
  return undefined;
}

/**
 * Resolves the effective cwd and verifies it stays inside the sandbox
 * root. Returns undefined when no root is configured (legacy behavior).
 * Path traversal via `..`, symlinks out of the tree, and absolute paths
 * outside the root are all rejected.
 */
function confineCwd(
  cwd: unknown,
  root: string,
): { ok: true; cwd: string } | { ok: false; reason: string } {
  if (typeof cwd !== "string" || cwd.trim() === "") {
    return { ok: true, cwd: root };
  }

  if (!isAbsolute(cwd)) {
    return { ok: false, reason: "cwd must be an absolute path." };
  }

  const resolved = resolve(cwd);
  const normalizedRoot = resolve(root);
  const rootWithSeparator = normalizedRoot.endsWith(sep)
    ? normalizedRoot
    : normalizedRoot + sep;

  if (resolved !== normalizedRoot && !resolved.startsWith(rootWithSeparator)) {
    return {
      ok: false,
      reason: `cwd '${cwd}' is outside the permitted working root.`,
    };
  }

  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return { ok: false, reason: `cwd '${cwd}' is not an existing directory.` };
  }

  return { ok: true, cwd: resolved };
}

/**
 * Creates the hardened run-command tool. The exported `runCommandTool`
 * uses the default allowlist with no root confinement; agents that want
 * stricter sandboxing construct their own via this factory.
 */
export function createRunCommandTool(options: RunCommandOptions = {}): Tool {
  const allowlist = options.allowlist ?? DEFAULT_COMMAND_ALLOWLIST;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const workingRoot = options.workingRoot;

  return {
    definition: {
      id: "kairos.run-command",
      name: "Run Command",
      description:
        "Executes an allowlisted shell command (npm scripts, git inspection). " +
        "Arbitrary shell execution, shell operators in arguments, and " +
        (workingRoot !== undefined
          ? "working directories outside the configured root are "
          : "unconfined working directories are ") +
        "not permitted.",
      version: "2.0.0",
      capabilities: ["execute-shell"],
      permission: "privileged",
      risk: "high",
      inputSchema: {
        command: { type: "string", description: "The allowlisted command to run." },
        cwd: {
          type: "string",
          description:
            workingRoot !== undefined
              ? `Optional absolute working directory; must be inside ${workingRoot}.`
              : "Optional absolute working directory.",
        },
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

      const blocked = (
        error: string,
      ): ToolOutput => ({
        toolId: input.toolId, requestId: input.requestId,
        status: "blocked",
        error,
        executedAt: startedAt, durationMs: Date.now() - start,
      });

      if (typeof command !== "string" || command.trim() === "") {
        return {
          toolId: input.toolId, requestId: input.requestId,
          status: "failure",
          error: "Parameter 'command' must be a non-empty string.",
          executedAt: startedAt, durationMs: Date.now() - start,
        };
      }

      // Shell-operator rejection runs FIRST so chained/injected commands
      // report their true failure reason even when the full string is not
      // allowlisted.
      const operator = containsShellOperator(command);
      if (operator !== undefined) {
        return blocked(
          `Command rejected: argument contains shell operator '${operator.trim() || operator}'. ` +
            "Shell metacharacters are never permitted in allowlisted commands.",
        );
      }

      if (!isAllowlisted(command, allowlist)) {
        return blocked(
          `Command not in allowlist: '${command}'. Only specific npm and git commands are permitted.`,
        );
      }

      let execCwd: string | undefined;
      if (workingRoot !== undefined) {
        const confinement = confineCwd(cwd, workingRoot);
        if (!confinement.ok) return blocked(confinement.reason);
        execCwd = confinement.cwd;
      } else if (typeof cwd === "string" && cwd.trim() !== "") {
        execCwd = cwd;
      }

      const execOptions = {
        ...(execCwd !== undefined ? { cwd: execCwd } : {}),
        timeout: timeoutMs,
      };

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
}

/**
 * The default run-command tool: default allowlist, shell-operator
 * rejection, 30s timeout, unconfined cwd (legacy behavior for embedders
 * that manage their own confinement). Prefer createRunCommandTool({
 * workingRoot }) inside agents.
 */
export const runCommandTool: Tool = createRunCommandTool();
