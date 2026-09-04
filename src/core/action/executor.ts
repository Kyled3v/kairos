import type { ActionRequest, ActionResult } from "./types.js";

export interface ActionExecutor {
  execute(request: ActionRequest): Promise<ActionResult>;
}
