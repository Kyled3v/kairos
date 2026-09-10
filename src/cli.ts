#!/usr/bin/env node
/**
 * KAIROS CLI
 *
 * Usage:
 *   npx kairos "your goal here" [options]
 *
 * Options:
 *   --cycles <n>          Max orchestration cycles (default: 10)
 *   --experience <path>   File path for experience store (default: in-memory)
 *   --memory <path>       File path for memory store (default: in-memory)
 *   --decompose           Enable goal decomposition
 *   --provider <id>       Model provider id: "anthropic" (requires --model and --api-key)
 *   --model <id>          Model id (e.g. claude-sonnet-4-6, llama3)
 *   --api-key <key>       API key for the Anthropic provider
 *   --ollama              Use the local Ollama provider (requires --model)
 *   --ollama-url <url>    Ollama base URL (default: http://localhost:11434)
 *   --tools               Enable built-in tools (calculator, date-time, data-lookup,
 *                         mock-file-read, mock-file-write, mock-http) via a real
 *                         ToolGateway wired into the observation stage
 *   --stream              Stream reasoning output to stdout as it is generated
 *   --verbose             Print full result JSON
 */
import { fileURLToPath } from "node:url";
import { createKairos, createKairosMemory, createExperienceStore } from "./factory/index.js";
import { createPipelineDependencies } from "./factory/pipeline-dependencies.js";
import type { PipelineDependencies } from "./core/orchestrator/pipeline.js";
import { ToolRegistry } from "./core/tools/registry.js";
import { ToolPolicy } from "./core/tools/policy.js";
import { ObservedToolGateway } from "./core/tools/observed-gateway.js";
import { ToolCallCollector } from "./core/tools/collector.js";
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

export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg !== undefined && arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args[key] = next;
        i += 2;
      } else {
        args[key] = true;
        i += 1;
      }
    } else {
      if (arg !== undefined) positional.push(arg);
      i += 1;
    }
  }
  if (positional.length > 0 && positional[0] !== undefined) {
    args["goal"] = positional[0];
  }
  return args;
}

interface ToolBundle {
  readonly gateway: ObservedToolGateway;
  readonly collector: ToolCallCollector;
}

function buildToolBundle(): ToolBundle {
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
  // Default policy for the built-in mock tools shipped with KAIROS: public
  // and restricted actors, up to medium risk. Tighten this before wiring
  // in any tool that has real side effects.
  const policy = new ToolPolicy({
    actorPermissions: ["public", "restricted"],
    maxRisk: "medium",
  });
  const collector = new ToolCallCollector();
  const gateway = new ObservedToolGateway(registry, policy, collector);
  return { gateway, collector };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const goal = args["goal"];
  if (typeof goal !== "string" || goal.trim() === "") {
    console.error(
      'Usage: kairos "your goal" [--cycles N] [--experience path] [--decompose] ' +
        "[--provider anthropic --model <id> --api-key <key> | --ollama --model <id>] [--tools] [--verbose]",
    );
    process.exit(1);
  }

  const maxCycles = typeof args["cycles"] === "string" ? parseInt(args["cycles"], 10) : 10;
  const experiencePath = typeof args["experience"] === "string" ? args["experience"] : undefined;
  const memoryPath = typeof args["memory"] === "string" ? args["memory"] : undefined;
  const decompose = args["decompose"] === true;
  const verbose = args["verbose"] === true;
  const useTools = args["tools"] === true;
  const useStream = args["stream"] === true;

  const providerFlag = typeof args["provider"] === "string" ? args["provider"] : undefined;
  const modelFlag = typeof args["model"] === "string" ? args["model"] : undefined;
  const apiKeyFlag = typeof args["api-key"] === "string" ? args["api-key"] : undefined;
  const useOllama = args["ollama"] === true;
  const ollamaUrl = typeof args["ollama-url"] === "string" ? args["ollama-url"] : undefined;

  const toolBundle = useTools ? buildToolBundle() : undefined;

  let dependencies: PipelineDependencies;
  let modelProvider: string | undefined;
  let modelId: string | undefined;

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
      ...(toolBundle !== undefined ? { toolGateway: toolBundle.gateway } : {}),
      ...(useStream ? { streaming: { streaming: true, onDelta: (_stage: string, delta: string) => { process.stdout.write(delta); } } } : {}),
    });
    modelProvider = "ollama";
    modelId = modelFlag;
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
      ...(toolBundle !== undefined ? { toolGateway: toolBundle.gateway } : {}),
      ...(useStream ? { streaming: { streaming: true, onDelta: (_stage: string, delta: string) => { process.stdout.write(delta); } } } : {}),
    });
    modelProvider = "anthropic";
    modelId = modelFlag;
  } else {
    dependencies = createPipelineDependencies({
      mode: "basic",
      ...(toolBundle !== undefined ? { toolGateway: toolBundle.gateway } : {}),
      ...(useStream ? { streaming: { streaming: true, onDelta: (_stage: string, delta: string) => { process.stdout.write(delta); } } } : {}),
    });
  }

  const experienceStore = await createExperienceStore(
    experiencePath !== undefined
      ? { type: "file", filePath: experiencePath }
      : { type: "memory" },
  );

  const memory = await createKairosMemory(
    memoryPath !== undefined
      ? { type: "file", filePath: memoryPath }
      : { type: "memory" },
  );
  void memory; // available for future use

  const orchestrator = createKairos({
    mode: "session",
    dependencies,
    session: {
      maxCycles,
      sessionId: crypto.randomUUID(),
      ...(modelProvider !== undefined ? { modelProvider } : {}),
      ...(modelId !== undefined ? { modelId } : {}),
    },
    experienceStore,
    decompose,
    ...(toolBundle !== undefined ? { toolCallCollector: toolBundle.collector } : {}),
  });

  console.log(`\nKAIROS ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â goal: ${goal}`);
  console.log(
    "Cycles: ${maxCycles} | Decompose: ${decompose} | Tools: ${useTools} | Stream: ${useStream} | " +
      `Provider: ${modelProvider ?? "basic"} | Experience: ${experiencePath ?? "memory"}\n`,
  );

  const result = await orchestrator.run(goal);

  console.log(`Status:     ${result.status}`);
  console.log(`Terminated: ${result.terminationReason}`);
  console.log(`Cycles run: ${result.totalCycles}`);

  if (result.finalEvaluation !== undefined) {
    console.log(`Score:      ${result.finalEvaluation.score.toFixed(3)}`);
    console.log(`Completed:  ${result.finalEvaluation.completed}`);
  }

  if (result.finalReflection !== undefined) {
    console.log(`\nReflection: ${result.finalReflection.summary}`);
  }

  if (verbose) {
    console.log("\n--- Full result ---");
    console.log(JSON.stringify(result, null, 2));
  }

  await (experienceStore as { flush?: () => Promise<void> }).flush?.();
  process.exit(result.status === "completed" ? 0 : 1);
}

const isDirectRun =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error("KAIROS fatal error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
