import type { Tool, ToolDefinition, ToolQuery } from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.definition.id)) {
      throw new Error(
        `Tool already registered: ${tool.definition.id}`,
      );
    }
    this.tools.set(tool.definition.id, tool);
  }

  unregister(toolId: string): boolean {
    return this.tools.delete(toolId);
  }

  get(toolId: string): Tool | undefined {
    return this.tools.get(toolId);
  }

  has(toolId: string): boolean {
    return this.tools.has(toolId);
  }

  getDefinition(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId)?.definition;
  }

  query(filter: ToolQuery = {}): readonly Tool[] {
    return [...this.tools.values()].filter((tool) => {
      const def = tool.definition;

      if (filter.enabled !== undefined && def.enabled !== filter.enabled) {
        return false;
      }

      if (
        filter.capability !== undefined &&
        !def.capabilities.includes(filter.capability)
      ) {
        return false;
      }

      if (
        filter.permission !== undefined &&
        def.permission !== filter.permission
      ) {
        return false;
      }

      if (filter.risk !== undefined && def.risk !== filter.risk) {
        return false;
      }

      return true;
    });
  }

  getAll(): readonly Tool[] {
    return [...this.tools.values()];
  }

  getEnabled(): readonly Tool[] {
    return this.query({ enabled: true });
  }
}