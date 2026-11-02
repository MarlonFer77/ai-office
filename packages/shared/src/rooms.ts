import type { RoomKind } from './domain.js';

export interface RoomBlueprint {
  kind: RoomKind;
  name: string;
  category: string;
  /** Top-left tile on the isometric grid. */
  gridX: number;
  gridY: number;
  width: number;
  depth: number;
  accent: string;
  floor: string;
  description: string;
}

/**
 * Default office floor plan (tiles). Rooms are laid out on a 24x18 grid with
 * corridors between them; the office engine renders from these coordinates.
 */
export const ROOM_BLUEPRINTS: RoomBlueprint[] = [
  { kind: 'strategy', name: 'Sala de Estratégia', category: 'Planejamento', gridX: 0, gridY: 0, width: 7, depth: 6, accent: '#8b5cf6', floor: '#2a2342', description: 'Planejamento, arquitetura, objetivos e organização de projetos.' },
  { kind: 'research', name: 'Sala de Pesquisa', category: 'Pesquisa', gridX: 8, gridY: 0, width: 7, depth: 6, accent: '#38bdf8', floor: '#1f2a40', description: 'Levantamento de informações e análise de documentos e fontes.' },
  { kind: 'production', name: 'Sala de Produção', category: 'Produção', gridX: 16, gridY: 0, width: 8, depth: 6, accent: '#22d3ee', floor: '#1d2b3a', description: 'Conteúdo técnico, código e demais entregas.' },
  { kind: 'creative', name: 'Sala de Criação', category: 'Criação', gridX: 0, gridY: 7, width: 7, depth: 6, accent: '#f472b6', floor: '#33213a', description: 'Conteúdo criativo, planejamento visual, textos e campanhas.' },
  { kind: 'meeting', name: 'Sala de Reuniões', category: 'Colaboração', gridX: 8, gridY: 7, width: 7, depth: 6, accent: '#a78bfa', floor: '#262342', description: 'Agentes compartilham resultados e consolidam decisões.' },
  { kind: 'review', name: 'Sala de Revisão', category: 'Qualidade', gridX: 16, gridY: 7, width: 8, depth: 6, accent: '#34d399', floor: '#1d3330', description: 'Validação de entregas e identificação de problemas.' },
  { kind: 'director', name: 'Sala do Diretor', category: 'Comando', gridX: 8, gridY: 14, width: 7, depth: 4, accent: '#fbbf24', floor: '#33291d', description: 'Centro de comando: prioridades, aprovações, equipe e desempenho.' },
];

export const roomBlueprint = (kind: RoomKind): RoomBlueprint =>
  ROOM_BLUEPRINTS.find((r) => r.kind === kind)!;
