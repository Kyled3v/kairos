#!/usr/bin/env node
/**
 * KAIROS HTTP Server
 *
 * Usage:
 *   npx tsx src/server.ts [--port 4000] [--experience path] [--memory path]
 *     [--provider anthropic --model <id> --api-key <key> | --ollama --model <id>]
 *     [--tools] [--accounts]
 *
 * Endpoints:
 *   POST /run              { goal, maxCycles?, decompose?, sessionId? } -> MultiCycleResult
 *   POST /stream           { goal, maxCycles? } -> SSE (start/result/done/error)
 *   POST /agents           { agentId } (account bearer token) -> agent descriptor
 *   GET  /agents           (account bearer token) -> the caller's agents
 *   POST /agents/:id/run   { goal } (owner token) -> MultiCycleResult
 *   GET  /experience        ?outcome=&goalContains=&modelProvider=&sessionId=&since=&limit= -> ExperienceRecord[]
 *   GET  /experience/:id    -> ExperienceRecord | 404
 *   GET  /memory            ?query=&type=&limit= -> Memory[]
 */
import { fileURLToPath } from "node:url";
import { parseArgs } from "./cli.js";
import { createPipelineDependencies } from "./factory/pipeline-dependencies.js";
import { createExperienceStore, createKairosMemory } from "./factory/index.js";
import { createKairosServer } from "./server/http-server.js";
import { ToolRegistry } from "./core/tools/registry.js";
import { ToolPolicy } from "./core/tools/policy.js";
import { ObservedToolGateway } from "./core/tools/observed-gateway.js";
import {
  calculatorTool,
  dateTimeTool,
  dataLookupTool,
  mockFileReadTool,
  mockFileWriteTool,
  mockHttpTool,
} from "./core/tools/built-in/index.js";
import { ModelRouter } from "./intelligence/models/router.js";
import { AnthropicProvider } from "./intelligence/models/providers/anthropic-provider.js";
import { OllamaProvider } from "./intelligence/models/providers/ollama-provider.js";
import type { PipelineDependencies } from "./core/orchestrator/pipeline.js";
import { initTelemetry } from "./telemetry/index.js";
import { AccountRegistry } from "./accounts/accounts.js";

function buildToolGateway(): ObservedToolGateway {
  const registry = new ToolRegistry();
  for (const tool of [
    calculatorTool,
    dateTimeTool,
    dataLookupTool,
    mockFileReadTool,
    mockFileWriteTool,
    mockHttpTool,
  ]) {
    registry.register(tool);
  }
  const policy = new ToolPolicy({
    actorPermissions: ["public", "restricted"],
    maxRisk: "medium",
  });
  return new ObservedToolGateway(registry, policy);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  initTelemetry({ serviceName: "kairos", serviceVersion: "0.1.0" });

  const port = typeof args["port"] === "string" ? parseInt(args["port"], 10) : 4000;
  const experiencePath = typeof args["experience"] === "string" ? args["experience"] : undefined;
  const memoryPath = typeof args["memory"] === "string" ? args["memory"] : undefined;
  const useTools = args["tools"] === true;
  const useAccounts = args["accounts"] === true || process.env["KAIROS_ACCOUNTS"] === "1";

  const providerFlag = typeof args["provider"] === "string" ? args["provider"] : undefined;
  const modelFlag = typeof args["model"] === "string" ? args["model"] : undefined;
  const apiKeyFlag = typeof args["api-key"] === "string" ? args["api-key"] : undefined;
  const useOllama = args["ollama"] === true;
  const ollamaUrl = typeof args["ollama-url"] === "string" ? args["ollama-url"] : undefined;

  const toolGateway = useTools ? buildToolGateway() : undefined;

  let dependencies: PipelineDependencies;

  if (useOllama) {
    if (modelFlag === undefined) {
      console.error("--ollama requires --model <id>");
      process.exit(1);
    }
    const router = new ModelRouter();
    router.register(new OllamaProvider(ollamaUrl !== undefined ? { baseUrl: ollamaUrl } : {}));
    dependencies = createPipelineDependencies({
      mode: "model",
      router,
      providerId: "ollama",
      modelId: modelFlag,
      ...(toolGateway !== undefined ? { toolGateway } : {}),
    });
  } else if (providerFlag !== undefined) {
    if (providerFlag !== "anthropic") {
      console.error(`Unsupported --provider: ${providerFlag}. Supported providers: "anthropic".`);
      process.exit(1);
    }
    if (modelFlag === undefined || apiKeyFlag === undefined) {
      console.error("--provider anthropic requires --model <id> and --api-key <key>");
      process.exit(1);
    }
    const router = new ModelRouter();
    router.register(new AnthropicProvider({ apiKey: apiKeyFlag }));
    dependencies = createPipelineDependencies({
      mode: "model",
      router,
      providerId: "anthropic",
      modelId: modelFlag,
      ...(toolGateway !== undefined ? { toolGateway } : {}),
    });
  } else {
    dependencies = createPipelineDependencies({
      mode: "basic",
      ...(toolGateway !== undefined ? { toolGateway } : {}),
    });
  }

  const experienceStore = await createExperienceStore(
    experiencePath !== undefined ? { type: "file", filePath: experiencePath } : { type: "memory" },
  );

  const memory = await createKairosMemory(
    memoryPath !== undefined ? { type: "file", filePath: memoryPath } : { type: "memory" },
  );

  // Phase 4 accounts: enabled with --accounts or KAIROS_ACCOUNTS=1.
  // Dev accounts are provisioned from KAIROS_DEV_ACCOUNTS (comma-separated
  // display names) so local development can exercise the public-agent
  // endpoints immediately. Tokens are printed once at startup and never
  // persisted to disk by the server itself.
  let accounts: AccountRegistry | undefined;
  if (useAccounts) {
    accounts = new AccountRegistry();
    const devNames = (process.env["KAIROS_DEV_ACCOUNTS"] ?? "Dev")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== "");
    for (const displayName of devNames) {
      const account = accounts.register({ displayName });
      console.log(`Account "${displayName}" (${account.id}) token: ${account.token}`);
    }
  }

  const apiToken = options_apiToken();
  const server = createKairosServer({
    dependencies,
    experienceStore,
    memory,
    ...(accounts !== undefined ? { accounts } : {}),
    ...(apiToken !== undefined ? { apiToken } : {}),
  });

  server.listen(port, () => {
    console.log(`KAIROS HTTP server listening on http://localhost:${port}`);
    if (accounts !== undefined) {
      console.log("Public agent endpoints enabled: POST /agents, GET /agents, POST /agents/:id/run");
    }
  });
}

function options_apiToken(): string | undefined {
  const fromEnv = process.env["KAIROS_API_TOKEN"];
  return typeof fromEnv === "string" && fromEnv.trim() !== "" ? fromEnv : undefined;
}

const isDirectRun =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error("KAIROS server fatal error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
