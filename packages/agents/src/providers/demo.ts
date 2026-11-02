import type { AgentRole } from '@ai-office/shared';
import { ProviderError } from '../errors.js';
import type { GenerateRequest, GenerateResult, ModelInfo, ProviderAdapter } from '../types.js';

export const DEMO_MODELS: ModelInfo[] = [
  { id: 'demo-sim-1', displayName: 'Simulador de demonstração' },
];

export interface DemoAdapterOptions {
  /** Delay between streamed chunks (ms). 0 in tests. */
  chunkDelayMs?: number;
  /** Fail deterministically (for tests of retry/error flows). */
  failWith?: ProviderError;
}

/**
 * Deterministic, offline provider. Every output is explicitly labelled as a
 * demonstration; it never pretends to be a real model call.
 */
export class DemoAdapter implements ProviderAdapter {
  readonly id = 'demo' as const;
  readonly demo = true;
  constructor(private readonly opts: DemoAdapterOptions = {}) {}

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (this.opts.failWith) throw this.opts.failWith;
    const last = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const role = detectRole(req.system);

    // Demonstrates the tool pipeline: the decision is simulated but the tool itself really runs.
    let toolNote = '';
    const listTool = req.tools?.find((t) => t.name === 'list_project_artifacts');
    if (listTool && /handoff|entrega recebida/i.test(last)) {
      const callId = `demo-call-${hash(last).toString(16)}`;
      req.onToolEvent?.({ phase: 'started', name: listTool.name, callId, input: {} });
      const result = await listTool.run({});
      req.onToolEvent?.({
        phase: 'completed',
        name: listTool.name,
        callId,
        resultPreview: result.slice(0, 300),
      });
      toolNote = `\n\n> Consultei a biblioteca do projeto (${countLines(result)} artefato(s) disponíveis).`;
    }

    const text = `${composeDemoText(role, last, req.messages.length)}${toolNote}`;
    const chunks = text.match(/\S+\s*/g) ?? [text];
    for (const chunk of chunks) {
      if (req.signal?.aborted) throw new ProviderError('aborted', 'Execução interrompida.', false);
      req.onDelta?.(chunk);
      if (this.opts.chunkDelayMs) await sleep(this.opts.chunkDelayMs, req.signal);
    }
    const inputTokens = Math.ceil(
      (req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0)) / 4,
    );
    return {
      text,
      usage: {
        inputTokens,
        outputTokens: Math.ceil(text.length / 4),
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      stopReason: 'end_turn',
      model: req.model,
      demo: true,
    };
  }

  async listModels() {
    return DEMO_MODELS;
  }

  async verify() {
    return { ok: true as const, models: DEMO_MODELS };
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new ProviderError('aborted', 'Execução interrompida.', false));
      },
      { once: true },
    );
  });
}

function countLines(s: string) {
  return s.split('\n').filter((l) => l.startsWith('- ')).length;
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function detectRole(system: string): AgentRole {
  const m = /\[role:(\w+)\]/.exec(system);
  return (m?.[1] as AgentRole | undefined) ?? 'coordinator';
}

function topicOf(input: string): string {
  const goal = /Objetivo da missão:\s*(.+)/i.exec(input)?.[1] ?? /Tarefa:\s*(.+)/i.exec(input)?.[1];
  const base = (goal ?? input).replace(/\s+/g, ' ').trim();
  return base.length > 140 ? `${base.slice(0, 140)}…` : base || 'o projeto';
}

const DEMO_HEADER =
  '_[DEMONSTRAÇÃO — resposta gerada pelo simulador local, sem chamada a um modelo real]_';

export function composeDemoText(role: AgentRole, input: string, turn: number): string {
  const topic = topicOf(input);
  const isTask = /Tarefa:/i.test(input);
  if (!isTask) {
    return `${DEMO_HEADER}\n\nOlá! Sou o agente de ${ROLE_LABEL[role]} deste escritório (modo demonstração). Recebi sua mensagem sobre "${topic}". Esta é a interação nº ${Math.ceil(turn / 2)} desta sessão — meu histórico é independente dos outros agentes. Para respostas reais, configure um provedor em Configurações e altere o modo do projeto para "real".`;
  }
  const body: Record<AgentRole, string> = {
    strategist: `## Plano estratégico\n\n1. **Posicionamento:** definir proposta de valor clara para "${topic}".\n2. **Público-alvo:** segmentar em early adopters, PMEs e contas estratégicas.\n3. **Marcos:** pré-lançamento (4 semanas), lançamento (semana 5), expansão (semanas 6–12).\n4. **Métricas:** ativação, retenção em 30 dias e CAC por canal.`,
    researcher: `## Relatório de pesquisa\n\n- **Contexto:** levantamento estruturado sobre "${topic}".\n- **Concorrência:** 3 grupos de soluções (planilhas, ERPs, apps especializados).\n- **Dores recorrentes:** conciliação manual, baixa visibilidade de caixa, integrações frágeis.\n- **Oportunidade:** automação com onboarding guiado.\n\n_Fontes: dados ilustrativos de demonstração._`,
    developer: `## Entrega técnica\n\n\`\`\`ts\n// Esboço ilustrativo para: ${topic.replace(/`/g, '')}\nexport function healthCheck() {\n  return { status: 'ok', checkedAt: new Date().toISOString() };\n}\n\`\`\`\n\nPróximos passos: testes automatizados e revisão de segurança.`,
    creative: `## Conceito criativo\n\n**Mote:** "Clareza financeira em minutos."\n\n- Peça hero com painel limpo e tons violeta.\n- Sequência de 3 e-mails de pré-lançamento.\n- Roteiro de vídeo curto (30s) para "${topic}".`,
    reviewer: `## Revisão\n\n✅ Consistência entre estratégia, pesquisa e criação.\n⚠️ Recomenda-se validar números com dados reais.\n✅ Tom de voz adequado.\n\n**Parecer:** aprovado com ressalvas para "${topic}".`,
    coordinator: `## Consolidação\n\nResumo das entregas da equipe sobre "${topic}", pronto para aprovação do diretor.`,
  };
  return `${DEMO_HEADER}\n\n${body[role]}`;
}

export const ROLE_LABEL: Record<AgentRole, string> = {
  strategist: 'Estratégia',
  researcher: 'Pesquisa',
  developer: 'Desenvolvimento',
  creative: 'Criação',
  reviewer: 'Revisão',
  coordinator: 'Coordenação',
};
