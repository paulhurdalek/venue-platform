export interface DocumentGenerationRequest {
  correlationId: string;
  templateReference: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface DocumentGenerationPort {
  generate(request: DocumentGenerationRequest): Promise<{ documentReference: string }>;
}
