import type { AgentStatus } from '@ai-office/shared';

export const STATUS_COLORS: Record<AgentStatus, number> = {
  idle: 0x94a3b8,
  queued: 0x60a5fa,
  running: 0x8b5cf6,
  awaiting_approval: 0xfbbf24,
  paused: 0x64748b,
  error: 0xf43f5e,
  disconnected: 0x334155,
};

export const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: 'Ocioso',
  queued: 'Na fila',
  running: 'Executando',
  awaiting_approval: 'Aguardando aprovação',
  paused: 'Pausado',
  error: 'Erro',
  disconnected: 'Desconectado',
};

/** Robot body palettes, chosen deterministically from avatarSeed. */
export const ROBOT_PALETTES = [
  { body: 0xe9e7f5, trim: 0x8b5cf6, visor: 0x1e1b3a },
  { body: 0xdbeafe, trim: 0x3b82f6, visor: 0x0f172a },
  { body: 0xf5e1f0, trim: 0xec4899, visor: 0x2a1030 },
  { body: 0xd9f7ef, trim: 0x10b981, visor: 0x062a22 },
  { body: 0xfdf0d5, trim: 0xf59e0b, visor: 0x2b1d05 },
  { body: 0xe0f2fe, trim: 0x06b6d4, visor: 0x082f49 },
  { body: 0xede9fe, trim: 0xa78bfa, visor: 0x1e1340 },
];
export const robotPalette = (seed: number) => ROBOT_PALETTES[Math.abs(seed) % ROBOT_PALETTES.length]!;

export const hexToNumber = (hex: string) => Number.parseInt(hex.replace('#', ''), 16);
export const toCss = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
