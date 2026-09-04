import { createCognitiveContext } from "../cognition/context.js";
import { CognitiveStateMachine } from "../cognition/state-machine.js";
import { executeReasoning } from "../cognition/engine/reasoning.js";

import { BasicReasoningEngine } from "../reasoning/engine/basic-engine.js";
import { BasicPlanningEngine } from "../planning/basic-engine.js";
import { BasicDecisionEngine } from "../decision/engine/basic-engine.js";

import { BasicAuthorizationEngine } from "../../security/authorization/basic-engine.js";
import { BasicActionExecutor } from "../action/basic-executor.js";
import { AuthorizedActionGateway } from "../../security/authorization/gateway.js";

import { BasicObservationEngine } from "../observation/basic-engine.js";
import { BasicEvaluationEngine } from "../evaluation/basic-engine.js";
import { BasicReflectionEngine } from "../reflection/basic-engine.js";

import type { KairosExecution } from "./types.js";
import type { KairosRuntime } from "./interface.js";

export class BasicKairosRuntime implements KairosRuntime {
  async execute(goal: string): Promise<KairosExecution> {
    const createdAt = new Date();

    let context = createCognitiveContext(goal);
    const machine = new CognitiveStateMachine(context.state);

    const reasoningEngine = new BasicReasoningEngine();
    const planningEngine = new BasicPlanningEngine();
    const decisionEngine = new BasicDecisionEngine();

    const authorizationEngine = new BasicAuthorizationEngine();
    const actionExecutor = new BasicActionExecutor();
    const gateway = new AuthorizedActionGateway(
      authorizationEngine,
      actionExecutor,
    );

    const observationEngine = new BasicObservationEngine();
    const evaluationEngine = new BasicEvaluationEngine();
    const reflectionEngine = new BasicReflectionEngine();

    machine.transition("UNDERSTAND");
    context = { ...context, state: "UNDERSTAND" };

    machine.transition("REASON");
    context = { ...context, state: "REASON" };

    const reasoning = await executeReasoning(
      reasoningEngine,
      context,
    );

    machine.transition("PLAN");
    context = { ...context, state: "PLAN" };

    const plan = await planningEngine.plan({
      goal,
      reasoning: reasoning.reasoning,
    });

    machine.transition("DECIDE");
    context = { ...context, state: "DECIDE" };

    const decision = await decisionEngine.decide({
      goal,
      plan,
      authorized: true,
    });

    if (decision.blocked || !decision.selectedOptionId) {
      return {
        id: crypto.randomUUID(),
        goal,
        currentState: "DECIDE",
        cycle: 1,
        reasoning: reasoning.reasoning,
        plan,
        decision,
        completed: false,
        terminationReason: "Decision was blocked.",
        createdAt,
      };
    }

    const selectedStep = plan.steps.find(
      (step) => step.id === decision.selectedOptionId,
    );

    const actionRequest = {
      id: crypto.randomUUID(),
      name: "create-plan",
      description:
        selectedStep?.description ?? "Execute selected plan step.",
      parameters: {
        goal,
        planStepId: decision.selectedOptionId,
      },
      requestedBy: "kairos",
    } as const;

    const authorization = await authorizationEngine.authorize({
      actorId: "kairos",
      action: actionRequest,
    });

    if (!authorization.allowed) {
      return {
        id: crypto.randomUUID(),
        goal,
        currentState: "DECIDE",
        cycle: 1,
        reasoning: reasoning.reasoning,
        plan,
        decision,
        authorization,
        completed: false,
        terminationReason: authorization.reason,
        createdAt,
      };
    }

    machine.transition("ACT");
    context = { ...context, state: "ACT" };

    const action = await gateway.execute(
      "kairos",
      actionRequest,
    );

    machine.transition("OBSERVE");
    context = { ...context, state: "OBSERVE" };

    const observation = await observationEngine.observe({
      actionId: action.actionId,
      actualOutcome: action,
    });

    machine.transition("EVALUATE");
    context = { ...context, state: "EVALUATE" };

    const evaluation = await evaluationEngine.evaluate({
      goal,
      observation,
    });

    machine.transition("REFLECT");
    context = { ...context, state: "REFLECT" };

    const reflection = await reflectionEngine.reflect({
      goal,
      evaluation,
    });

    if (reflection.continueTask) {
      return {
        id: crypto.randomUUID(),
        goal,
        currentState: "REFLECT",
        cycle: 1,
        reasoning: reasoning.reasoning,
        plan,
        decision,
        authorization,
        action,
        observation,
        evaluation,
        reflection,
        completed: false,
        terminationReason: reflection.reason,
        createdAt,
      };
    }

    machine.transition("COMPLETE");

    return {
      id: crypto.randomUUID(),
      goal,
      currentState: "COMPLETE",
      cycle: 1,
      reasoning: reasoning.reasoning,
      plan,
      decision,
      authorization,
      action,
      observation,
      evaluation,
      reflection,
      completed: true,
      terminationReason: "Objective completed.",
      createdAt,
      completedAt: new Date(),
    };
  }
}
