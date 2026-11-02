import type { ProviderId } from '@ai-office/shared';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** A tool the orchestrator explicitly authorises for a single run. */
export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema (object) describing the input. */
  inputSchema: Record<string, unknown>;
  run: (input: unknown) => Promise<string>;
}

export interface ToolCallEvent {
  phase: 'started' | 'completed';
  name: string;
  callId: string;
  input?: unknown;
  /** Truncated result preview (completed only). */
  resultPreview?: string;
  isError?: boolean;
}

export interface GenerateRequest {
  model: string;
  system: string;
  messages: ChatTurn[];
  maxOutputTokens: number;
  signal?: AbortSignal;
  tools?: AgentTool[];
  /** Upper bound on tool round-trips inside one run. */
  maxToolIterations?: number;
  onDelta?: (text: string) => void;
  onToolEvent?: (event: ToolCallEvent) => void;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface GenerateResult {
  text: string;
  usage: TokenUsage;
  stopReason: string | null;
  model: string;
  /** True when produced by the simulated demo provider. */
  demo: boolean;
}

export interface ModelInfo {
  id: string;
  displayName: string;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly demo: boolean;
  generate(req: GenerateRequest): Promise<GenerateResult>;
  listModels(): Promise<ModelInfo[]>;
  /** Cheap connectivity/auth check. */
  verify(): Promise<{ ok: true; models: ModelInfo[] } | { ok: false; error: string }>;
}

export const emptyUsage = (): TokenUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

export function addUsage(a: TokenUsage, b: Partial<TokenUsage>): TokenUsage {
  return {
    inputTokens: a.inputTokens + (b.inputTokens ?? 0),
    outputTokens: a.outputTokens + (b.outputTokens ?? 0),
    cacheReadTokens: a.cacheReadTokens + (b.cacheReadTokens ?? 0),
    cacheWriteTokens: a.cacheWriteTokens + (b.cacheWriteTokens ?? 0),
  };
}
