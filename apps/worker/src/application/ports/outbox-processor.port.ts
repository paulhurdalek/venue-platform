export interface OutboxMessage {
  id: string;
  occurredAt: Date;
  type: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface OutboxProcessorPort {
  process(message: OutboxMessage): Promise<void>;
}
