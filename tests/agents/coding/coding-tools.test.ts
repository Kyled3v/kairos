import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readFileTool } from "../../../src/core/tools/built-in/read-file.js";
import { writeFileTool } from "../../../src/core/tools/built-in/write-file.js";
import { listDirectoryTool } from "../../../src/core/tools/built-in/list-directory.js";
import { searchCodeTool } from "../../../src/core/tools/built-in/search-code.js";
import { runCommandTool } from "../../../src/core/tools/built-in/run-command.js";

const req = (toolId: string, parameters: Record<string, unknown> = {}) => ({
  toolId, parameters, requestedBy: "kairos", requestId: crypto.randomUUID(),
});

describe("Coding tools", () => {
  describe("readFileTool", () => {
    it("reads an existing file", async () => {
      const path = join(tmpdir(), `kairos-test-${crypto.randomUUID()}.txt`);
      await writeFile(path, "hello KAIROS");
      try {
        const result = await readFileTool.execute(req("kairos.read-file", { path }));
        expect(result.status).toBe("success");
        expect((result.result as { content: string }).content).toBe("hello KAIROS");
      } finally {
        await rm(path);
      }
    });

    it("returns failure for missing file", async () => {
      const result = await readFileTool.execute(req("kairos.read-file", { path: "/nonexistent/file.txt" }));
      expect(result.status).toBe("failure");
    });
  });

  describe("writeFileTool", () => {
    it("writes a file and creates parent dirs", async () => {
      const dir = join(tmpdir(), `kairos-wr-${crypto.randomUUID()}`);
      const path = join(dir, "sub", "file.txt");
      try {
        const result = await writeFileTool.execute(req("kairos.write-file", { path, content: "written by KAIROS" }));
        expect(result.status).toBe("success");
        expect(existsSync(path)).toBe(true);
      } finally {
        await rm(dir, { recursive: true });
      }
    });
  });

  describe("listDirectoryTool", () => {
    it("lists files in a directory", async () => {
      const dir = join(tmpdir(), `kairos-ls-${crypto.randomUUID()}`);
      await mkdir(dir);
      await writeFile(join(dir, "a.ts"), "");
      await writeFile(join(dir, "b.ts"), "");
      try {
        const result = await listDirectoryTool.execute(req("kairos.list-directory", { path: dir }));
        expect(result.status).toBe("success");
        const entries = (result.result as { entries: Array<{ name: string }> }).entries;
        expect(entries.length).toBe(2);
        expect(entries.map((e) => e.name).sort()).toEqual(["a.ts", "b.ts"]);
      } finally {
        await rm(dir, { recursive: true });
      }
    });
  });

  describe("searchCodeTool", () => {
    it("finds pattern in source files", async () => {
      const dir = join(tmpdir(), `kairos-sr-${crypto.randomUUID()}`);
      await mkdir(dir);
      await writeFile(join(dir, "test.ts"), "export const KAIROS_VERSION = 1;");
      try {
        const result = await searchCodeTool.execute(req("kairos.search-code", { path: dir, pattern: "KAIROS_VERSION" }));
        expect(result.status).toBe("success");
        const r = result.result as { matches: Array<{ text: string }> };
        expect(r.matches.length).toBeGreaterThan(0);
        expect(r.matches[0]?.text).toContain("KAIROS_VERSION");
      } finally {
        await rm(dir, { recursive: true });
      }
    });
  });

  describe("runCommandTool", () => {
    it("blocks non-allowlisted commands", async () => {
      const result = await runCommandTool.execute(req("kairos.run-command", { command: "rm -rf /" }));
      expect(result.status).toBe("blocked");
    });

    it("runs an allowlisted command", async () => {
      const result = await runCommandTool.execute(req("kairos.run-command", {
        command: "git status",
        cwd: process.cwd(),
      }));
      expect(["success", "failure"]).toContain(result.status);
    });
  });
});
