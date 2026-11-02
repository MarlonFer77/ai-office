import Anthropic from '@anthropic-ai/sdk';
import { errorFromStatus, ProviderError, truncate } from '../errors.js';
import {
  addUsage,
  emptyUsage,
  type GenerateRequest,
  type GenerateResult,
  type ModelInfo,
  type ProviderAdapter,
} from '../types.js';

export interface AnthropicAdapterOptions {
  apiKey: string;
  /** Injected for tests. */
  client?: Anthropic;
  baseURL?: string;
}

/** Adapter for the official Anthropic SDK (Messages API with streaming). */
export class AnthropicAdapter implements ProviderAdapter {
  readonly id = 'anthropic' as const;
  readonly demo = false;
  private readonly client: Anthropic;

  constructor(opts: AnthropicAdapterOptions) {
    this.client =
      opts.client ??
      new Anthropic({
        apiKey: opts.apiKey,
        maxRetries: 1,
        ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
      });
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const messages: Anthropic.MessageParam[] = req.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const tools: Anthropic.Tool[] | undefined = req.tools?.length
      ? req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        }))
      : undefined;
    const maxIterations = req.maxToolIterations ?? 4;
    let usage = emptyUsage();
    let finalText = '';
    let stopReason: string | null;
    let model: string;

    try {
      for (let iteration = 0; ; iteration++) {
        const stream = this.client.messages.stream(
          {
            model: req.model,
            max_tokens: req.maxOutputTokens,
            ...(req.system ? { system: req.system } : {}),
            messages,
            ...(tools ? { tools } : {}),
          },
          { signal: req.signal },
        );
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            req.onDelta?.(event.delta.text);
          }
        }
        const message = await stream.finalMessage();
        model = message.model;
        stopReason = message.stop_reason;
        usage = addUsage(usage, {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        });
        const text = message.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('');
        finalText += text;

        if (message.stop_reason === 'refusal') {
          throw new ProviderError('refusal', 'O modelo recusou a solicitação.', false);
        }
        const toolUses = message.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );
        if (message.stop_reason !== 'tool_use' || toolUses.length === 0 || !req.tools) break;
        if (iteration + 1 >= maxIterations) {
          finalText += '\n\n[Limite de chamadas de ferramenta atingido nesta execução.]';
          break;
        }
        messages.push({ role: 'assistant', content: message.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const use of toolUses) {
          const tool = req.tools.find((t) => t.name === use.name);
          req.onToolEvent?.({ phase: 'started', name: use.name, callId: use.id, input: use.input });
          let content: string;
          let isError = false;
          if (!tool) {
            content = `Ferramenta não autorizada: ${use.name}`;
            isError = true;
          } else {
            try {
              content = await tool.run(use.input);
            } catch (e) {
              content = e instanceof Error ? e.message : 'Erro na ferramenta';
              isError = true;
            }
          }
          req.onToolEvent?.({
            phase: 'completed',
            name: use.name,
            callId: use.id,
            resultPreview: truncate(content, 300),
            isError,
          });
          results.push({ type: 'tool_result', tool_use_id: use.id, content, is_error: isError });
        }
        messages.push({ role: 'user', content: results });
        if (finalText) finalText += '\n\n';
      }
    } catch (err) {
      throw normalizeAnthropicError(err);
    }
    return { text: finalText.trim(), usage, stopReason, model, demo: false };
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const out: ModelInfo[] = [];
      for await (const m of this.client.models.list()) {
        out.push({ id: m.id, displayName: m.display_name });
      }
      return out;
    } catch (err) {
      throw normalizeAnthropicError(err);
    }
  }

  async verify() {
    try {
      const models = await this.listModels();
      return { ok: true as const, models };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Falha desconhecida',
      };
    }
  }
}

export function normalizeAnthropicError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.APIUserAbortError)
    return new ProviderError('aborted', 'Execução interrompida.', false);
  if (err instanceof Anthropic.APIConnectionError)
    return new ProviderError('unavailable', 'Falha de conexão com a Anthropic.', true);
  if (err instanceof Anthropic.APIError) return errorFromStatus(err.status, err.message);
  if (err instanceof Error && err.name === 'AbortError')
    return new ProviderError('aborted', 'Execução interrompida.', false);
  return new ProviderError(
    'unknown',
    err instanceof Error ? err.message : 'Erro desconhecido',
    true,
  );
}
