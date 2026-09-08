import { readdir, stat, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";

export interface RepositoryFile {
  readonly path: string;
  readonly relativePath: string;
  readonly sizeBytes: number;
  readonly extension: string;
}

export interface RepositoryContext {
  readonly rootPath: string;
  readonly files: readonly RepositoryFile[];
  readonly totalFiles: number;
  readonly languages: readonly string[];
  readonly hasPackageJson: boolean;
  readonly hasTsConfig: boolean;
  readonly hasGit: boolean;
  readonly scannedAt: Date;
}

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rs", ".go", ".java", ".cs", ".cpp", ".c", ".h",
  ".md", ".json", ".yaml", ".yml", ".toml",
]);

const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", ".git", "coverage", ".next",
]);

async function collectFiles(
  dir: string,
  root: string,
  files: RepositoryFile[],
  max: number,
): Promise<void> {
  if (files.length >= max) return;
  let entries: string[];
  try { entries = await readdir(dir); } catch { return; }

  for (const name of entries) {
    if (files.length >= max) break;
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let s: Awaited<ReturnType<typeof stat>>;
    try { s = await stat(full); } catch { continue; }

    if (s.isDirectory()) {
      await collectFiles(full, root, files, max);
    } else if (s.isFile()) {
      const ext = name.includes(".") ? `.${name.split(".").pop() ?? ""}` : "";
      if (CODE_EXTENSIONS.has(ext)) {
        files.push({
          path: full,
          relativePath: relative(root, full),
          sizeBytes: s.size,
          extension: ext,
        });
      }
    }
  }
}

export async function scanRepository(
  rootPath: string,
  maxFiles = 500,
): Promise<RepositoryContext> {
  if (!existsSync(rootPath)) {
    throw new Error(`Repository path not found: ${rootPath}`);
  }

  const files: RepositoryFile[] = [];
  await collectFiles(rootPath, rootPath, files, maxFiles);

  const extCounts = new Map<string, number>();
  for (const f of files) {
    extCounts.set(f.extension, (extCounts.get(f.extension) ?? 0) + 1);
  }

  const languages = [...extCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([ext]) => ext);

  return {
    rootPath,
    files,
    totalFiles: files.length,
    languages,
    hasPackageJson: existsSync(join(rootPath, "package.json")),
    hasTsConfig: existsSync(join(rootPath, "tsconfig.json")),
    hasGit: existsSync(join(rootPath, ".git")),
    scannedAt: new Date(),
  };
}

export async function buildContextSummary(
  ctx: RepositoryContext,
): Promise<string> {
  const lines = [
    `Repository: ${ctx.rootPath}`,
    `Files: ${ctx.totalFiles}`,
    `Languages: ${ctx.languages.slice(0, 5).join(", ")}`,
    `Has package.json: ${ctx.hasPackageJson}`,
    `Has tsconfig.json: ${ctx.hasTsConfig}`,
    `Has git: ${ctx.hasGit}`,
  ];

  if (ctx.hasPackageJson) {
    try {
      const raw = await readFile(join(ctx.rootPath, "package.json"), "utf-8");
      const pkg = JSON.parse(raw) as {
        name?: string;
        version?: string;
        scripts?: Record<string, string>;
      };
      if (pkg.name !== undefined) {
        lines.push(`Package: ${pkg.name}@${pkg.version ?? "?"}`);
      }
      if (pkg.scripts !== undefined) {
        lines.push(`Scripts: ${Object.keys(pkg.scripts).join(", ")}`);
      }
    } catch { /* not critical */ }
  }

  return lines.join("\n");
}