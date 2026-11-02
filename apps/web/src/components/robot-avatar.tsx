import { robotPalette, STATUS_COLORS, toCss } from '@ai-office/office-engine';
import type { AgentStatus } from '@ai-office/shared';
import { cn } from '@ai-office/ui';

/** Original robot avatar (SVG), consistent with the canvas renderer palette. */
export function RobotAvatar({
  seed,
  status,
  size = 36,
  className,
}: {
  seed: number;
  status?: AgentStatus;
  size?: number;
  className?: string;
}) {
  const p = robotPalette(seed);
  const ring = status ? toCss(STATUS_COLORS[status]) : 'transparent';
  const visorGlow = status === 'error' ? '#f43f5e' : status === 'running' ? '#a78bfa' : '#7dd3fc';
  return (
    <span
      className={cn('relative inline-grid shrink-0 place-items-center rounded-xl', className)}
      style={{
        width: size,
        height: size,
        boxShadow: status ? `0 0 0 2px ${ring}55` : undefined,
        background: 'linear-gradient(160deg,#221d38,#14111f)',
      }}
    >
      <svg viewBox="0 0 40 40" width={size * 0.82} height={size * 0.82} aria-hidden>
        <line
          x1="20"
          y1="4"
          x2="20"
          y2="9"
          stroke={toCss(p.trim)}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="20" cy="4" r="2.2" fill={toCss(p.trim)} />
        <rect x="8" y="9" width="24" height="18" rx="7" fill={toCss(p.body)} />
        <rect x="11" y="13" width="18" height="9" rx="4.5" fill={toCss(p.visor)} />
        <circle cx="16" cy="17.5" r="1.8" fill={visorGlow} />
        <circle cx="24" cy="17.5" r="1.8" fill={visorGlow} />
        <rect x="12" y="28" width="16" height="9" rx="4" fill={toCss(p.body)} opacity="0.9" />
        <rect x="17" y="30" width="6" height="2" rx="1" fill={toCss(p.trim)} />
      </svg>
      {status && (
        <span
          className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background"
          style={{ background: ring }}
        />
      )}
    </span>
  );
}
