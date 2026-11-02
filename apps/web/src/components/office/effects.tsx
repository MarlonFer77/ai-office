'use client';
import { useCallback, useRef } from 'react';
import { useTick } from '@pixi/react';
import type { Graphics } from 'pixi.js';
import { arcPoint, easeInOut, type SceneState } from '@ai-office/office-engine';
import { useLive } from '@/lib/store';

/**
 * Handoff packets and completion pulses. Driven exclusively by real
 * `handoff.created` / `task.completed` / errors received over SSE.
 */
const noop = () => undefined;

export function EffectsLayer({ positions }: { positions: Map<string, { x: number; y: number }> }) {
  const g = useRef<Graphics>(null);
  const scene = useRef<SceneState>(useLive.getState().scene);
  scene.current = useLive((s) => s.scene);

  useTick(
    useCallback(() => {
      const gr = g.current;
      if (!gr) return;
      gr.clear();
      const now = Date.now();
      for (const h of scene.current.handoffs) {
        const a = positions.get(h.fromAgentId);
        const b = positions.get(h.toAgentId);
        if (!a || !b) continue;
        const raw = Math.min(1, (now - h.startedAt) / h.durationMs);
        const t = easeInOut(raw);
        const from = { x: a.x, y: a.y - 60 };
        const to = { x: b.x, y: b.y - 60 };
        // Trail
        const steps = 24;
        for (let i = 0; i < steps; i++) {
          const p0 = arcPoint(from, to, (i / steps) * t, 110);
          const p1 = arcPoint(from, to, ((i + 1) / steps) * t, 110);
          gr.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({ width: 2.5, color: 0xa78bfa, alpha: 0.12 + 0.5 * (i / steps) * (1 - raw * 0.6) });
        }
        // Dashed full path, faint
        for (let i = 0; i < 30; i += 2) {
          const p0 = arcPoint(from, to, i / 30, 110);
          const p1 = arcPoint(from, to, (i + 1) / 30, 110);
          gr.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({ width: 1, color: 0x8b5cf6, alpha: 0.18 * (1 - raw) });
        }
        const p = arcPoint(from, to, t, 110);
        gr.circle(p.x, p.y, 13).fill({ color: 0x8b5cf6, alpha: 0.18 });
        gr.circle(p.x, p.y, 7).fill({ color: 0xc4b5fd, alpha: 0.6 });
        gr.roundRect(p.x - 5, p.y - 4, 10, 8, 2).fill({ color: 0xffffff });
        gr.moveTo(p.x - 5, p.y - 4).lineTo(p.x, p.y).lineTo(p.x + 5, p.y - 4).stroke({ width: 1, color: 0x7c3aed });
        if (raw > 0.85) gr.circle(to.x, to.y + 50, 22 * (raw - 0.85) * 6).stroke({ width: 2, color: 0xa78bfa, alpha: 1 - raw });
      }
      for (const pulse of scene.current.pulses) {
        const pos = positions.get(pulse.agentId);
        if (!pos) continue;
        const k = Math.min(1, (now - pulse.startedAt) / 1400);
        const color = pulse.kind === 'success' ? 0x34d399 : 0xf43f5e;
        gr.ellipse(pos.x, pos.y, 20 + 30 * k, 9 + 14 * k).stroke({ width: 2.5, color, alpha: 1 - k });
      }
    }, [positions]),
  );
  return <pixiGraphics ref={g} zIndex={100000} draw={noop} />;
}
