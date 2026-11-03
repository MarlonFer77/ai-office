import OpenAI from 'openai';
import { errorFromStatus, ProviderError, truncate } from '../errors.js';
import {
  addUsage,
  emptyUsage,
  type GenerateRequest,
  type GenerateResult,
  type ModelInfo,
  type ProviderAdapter,
} from '../types.js';

export type OpenAICompatibleId = 'openai' | 'groq' | 'openrouter' | 'ollama';

export interface OpenAIAdapterOptions {
  apiKey: string;
  client?: OpenAI;
  baseURL?: string;
  /** Which provider this instance talks to (default: openai). */
  providerId?: OpenAICompatibleId;
  /** Human label used in error messages. */
  label?: string;
}

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** Server-specific usage block (Groq historically reports usage under `x_groq`). */
interface CompatChunkExtras {
  x_groq?: { usage?: { prompt_tokens?: number; completion_tokens?: number } };
}

/**
 * Adapter for the official OpenAI SDK (Chat Completions with streaming).
 * Also serves OpenAI-compatible servers (Groq, OpenRouter, Ollama) by pointing
 * the same SDK at their base URL, with small compatibility adjustments:
 * - non-OpenAI servers receive the widely supported `max_tokens` parameter;
 * - usage is read from `usage` or Groq's `x_groq.usage`;
 * - if a model rejects tool definitions, the call is retried once without tools.
 */
export class OpenAIAdapter implements ProviderAdapter {
  readonly id: OpenAICompatibleId;
  readonly demo = false;
  private readonly client: OpenAI;
  private readonly label: string;

  constructor(opts: OpenAIAdapterOptions) {
    this.id = opts.providerId ?? 'openai';
    this.label = opts.label ?? 'OpenAI';
    this.client =
      opts.client ??
      new OpenAI({
        apiKey: opts.apiKey,
        // Free tiers rate-limit aggressively; the SDK honours Retry-After.
        maxRetries: this.id === 'openai' ? 1 : 3,
        ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
      });
  }

  private tokenLimit(max: number) {
    return this.id === 'openai' ? { max_completion_tokens: max } : { max_tokens: max };
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const messages: ChatMessage[] = [
      ...(req.system ? [{ role: 'system' as const, content: req.system }] : []),
      ...req.messages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    ];
    let tools: OpenAI.Chat.Completions.ChatCompletionTool[] | undefined = req.tools?.length
      ? req.tools.map((t) => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        }))
      : undefined;
    const maxIterations = req.maxToolIterations ?? 4;
    let usage = emptyUsage();
    let finalText = '';
    let stopReason: string | null = null;
    let model = req.model;

    try {
      for (let iteration = 0; ; iteration++) {
        const create = () =>
          this.client.chat.completions.create(
            {
              model: req.model,
              messages,
              ...this.tokenLimit(req.maxOutputTokens),
              stream: true,
              stream_options: { include_usage: true },
              ...(tools ? { tools } : {}),
            },
            { signal: req.signal },
          );
        let stream: Awaited<ReturnType<typeof create>>;
        try {
          stream = await create();
        } catch (err) {
          // Some open models served by compatible APIs do not support tools.
          if (
            tools &&
            this.id !== 'openai' &&
            err instanceof OpenAI.BadRequestError &&
            /tool/i.test(err.message)
          ) {
            tools = undefined;
            stream = await create();
          } else {
            throw err;
          }
        }
        let text = '';
        const calls = new Map<number, { id: string; name: string; args: string }>();
        for await (const chunk of stream) {
          if (chunk.model) model = chunk.model;
          const groqUsage = (chunk as typeof chunk & CompatChunkExtras).x_groq?.usage;
          if (chunk.usage) {
            usage = addUsage(usage, {
              inputTokens: chunk.usage.prompt_tokens,
              outputTokens: chunk.usage.completion_tokens,
              cacheReadTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
            });
          } else if (groqUsage) {
            usage = addUsage(usage, {
              inputTokens: groqUsage.prompt_tokens ?? 0,
              outputTokens: groqUsage.completion_tokens ?? 0,
            });
          }
          const choice = chunk.choices[0];
          if (!choice) continue;
          if (choice.finish_reason) stopReason = choice.finish_reason;
          const delta = choice.delta;
          if (delta?.content) {
            text += delta.content;
            req.onDelta?.(delta.content);
          }
          for (const tc of delta?.tool_calls ?? []) {
            const cur = calls.get(tc.index) ?? { id: '', name: '', args: '' };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name += tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
            calls.set(tc.index, cur);
          }
        }
        finalText += text;
        if (stopReason !== 'tool_calls' || calls.size === 0 || !req.tools || !tools) break;
        if (iteration + 1 >= maxIterations) {
          finalText += '\n\n[Limite de chamadas de ferramenta atingido nesta execução.]';
          break;
        }
        const toolCalls = [...calls.values()];
        messages.push({
          role: 'assistant',
          content: text || null,
          tool_calls: toolCalls.map((c) => ({
            id: c.id,
            type: 'function' as const,
            function: { name: c.name, arguments: c.args },
          })),
        });
        for (const call of toolCalls) {
          const tool = req.tools.find((t) => t.name === call.name);
          let input: unknown = {};
          let content: string;
          let isError = false;
          try {
            input = call.args ? JSON.parse(call.args) : {};
          } catch {
            isError = true;
          }
          req.onToolEvent?.({ phase: 'started', name: call.name, callId: call.id, input });
          if (isError) {
            content = 'Argumentos inválidos (JSON malformado).';
          } else if (!tool) {
            content = `Ferramenta não autorizada: ${call.name}`;
            isError = true;
          } else {
            try {
              content = await tool.run(input);
            } catch (e) {
              content = e instanceof Error ? e.message : 'Erro na ferramenta';
              isError = true;
            }
          }
          req.onToolEvent?.({
            phase: 'completed',
            name: call.name,
            callId: call.id,
            resultPreview: truncate(content, 300),
            isError,
          });
          messages.push({ role: 'tool', tool_call_id: call.id, content });
        }
        if (finalText) finalText += '\n\n';
      }
    } catch (err) {
      throw normalizeOpenAIError(err, this.label);
    }
    return { text: finalText.trim(), usage, stopReason, model, demo: false };
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const out: ModelInfo[] = [];
      for await (const m of this.client.models.list()) out.push({ id: m.id, displayName: m.id });
      return out.sort((a, b) => a.id.localeCompare(b.id));
    } catch (err) {
      throw normalizeOpenAIError(err, this.label);
    }
  }

  async verify() {
    try {
      return { ok: true as const, models: await this.listModels() };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : 'Falha desconhecida',
      };
    }
  }
}

export function normalizeOpenAIError(err: unknown, label = 'OpenAI'): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof OpenAI.APIUserAbortError)
    return new ProviderError('aborted', 'Execução interrompida.', false);
  if (err instanceof OpenAI.APIConnectionError)
    return new ProviderError('unavailable', `Falha de conexão com ${label}.`, true);
  if (err instanceof OpenAI.APIError)
    return errorFromStatus(err.status, truncate(err.message, 300));
  if (err instanceof Error && err.name === 'AbortError')
    return new ProviderError('aborted', 'Execução interrompida.', false);
  return new ProviderError(
    'unknown',
    err instanceof Error ? err.message : 'Erro desconhecido',
    true,
  );
}
