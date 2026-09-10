export interface AgentMessage {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly content: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly sentAt: Date;
}

export interface SendMessageInput {
  readonly from: string;
  readonly to: string;
  readonly content: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Minimal in-memory message-passing primitive for multi-agent
 * coordination: each agent has an inbox; sending appends to the
 * recipient's inbox, draining reads and clears it. This deliberately
 * does not implement any particular coordination protocol (blackboard,
 * contract-net, etc.) — it is the baseline building block those would
 * be built on top of.
 */
export class AgentMessageBus {
  private readonly inboxes = new Map<string, AgentMessage[]>();

  send(input: SendMessageInput): AgentMessage {
    const message: AgentMessage = {
      id: crypto.randomUUID(),
      from: input.from,
      to: input.to,
      content: input.content,
      metadata: input.metadata ?? {},
      sentAt: new Date(),
    };

    const inbox = this.inboxes.get(input.to) ?? [];
    inbox.push(message);
    this.inboxes.set(input.to, inbox);

    return message;
  }

  /** Reads an agent's inbox without clearing it. */
  peek(agentId: string): readonly AgentMessage[] {
    return [...(this.inboxes.get(agentId) ?? [])];
  }

  /** Reads and clears an agent's inbox. */
  drain(agentId: string): readonly AgentMessage[] {
    const messages = this.inboxes.get(agentId) ?? [];
    this.inboxes.set(agentId, []);
    return messages;
  }
}