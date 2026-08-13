export interface NotificationRequest {
  correlationId: string;
  channel: string;
  recipientReference: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface NotificationPort {
  send(request: NotificationRequest): Promise<void>;
}
