'use client';
import { useCallback, useRef } from 'react';
import { useTick } from '@pixi/react';
import { type Container, type Graphics, Rectangle, type TextStyleOptions } from 'pixi.js';
import { robotPalette, STATUS_COLORS, type AgentVisual } from '@ai-office/office-engine';
import { shade } from './draw';
import { uiFont } from './font';

const NAME_STYLE: TextStyleOptions = { fontFamily: uiFont(), fontSize: 11, fontWeight: '600', fill: 0xf3f0ff };
const CAPTION_STYLE: TextStyleOptions = { fontFamily: uiFont(), fontSize: 9.5, fill: 0xc4b5fd };
const noop = () => undefined;
const HIT = new Rectangle(-24, -112, 48, 116);

interface RobotProps {
  x: number;
  y: number;
  zIndex: number;
  name: string;
  seed: number;
  visual: AgentVisual;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHover: (v: boolean) => void;
}

/**
 * Robot avatar. Animation intensity is a function of the *real* status:
 * idle = still (only a slow blink), running = typing + activity dots,
 * awaiting approval = bell badge, error = alert badge, paused = dimmed.
 */
export function Robot({ x, y, zIndex, name, seed, visual, selected, hovered, onSelect, onHover }: RobotProps) {
  const pal = robotPalette(seed);
  const bodyRef = useRef<Container>(null);
  const armsRef = useRef<Graphics>(null);
  const dotsRef = useRef<Graphics>(null);
  const ringRef = useRef<Graphics>(null);
  const eyesRef = useRef<Graphics>(null);
  const t = useRef(Math.random() * 10);
  const status = visual.status;
  const running = status === 'running';
  const color = STATUS_COLORS[status];

  useTick(
    useCallback(
      (ticker: { deltaMS: number }) => {
        t.current += ticker.deltaMS / 1000;
        const time = t.current;
        if (armsRef.current) armsRef.current.y = running ? Math.sin(time * 18) * 1.5 : 0;
        if (bodyRef.current) bodyRef.current.y = running ? Math.sin(time * 4) * 0.6 : 0;
        if (dotsRef.current) {
          dotsRef.current.clear();
          if (running) {
            for (let i = 0; i < 3; i++) {
              const a = 0.35 + 0.65 * Math.max(0, Math.sin(time * 6 - i * 0.8));
              dotsRef.current.circle(-7 + i * 7, -124, 2.2).fill({ color: 0xffffff, alpha: a });
            }
          }
        }
        if (ringRef.current) {
          ringRef.current.alpha = running ? 0.55 + Math.sin(time * 3) * 0.25 : selected || hovered ? 0.8 : 0.45;
        }
        if (eyesRef.current) {
          // Slow natural blink, not an activity signal.
          eyesRef.current.scale.y = Math.sin(time * 0.9) > 0.985 ? 0.15 : 1;
        }
      },
      [running, selected, hovered],
    ),
  );

  const visor = status === 'error' ? 0xf43f5e : running ? 0xc4b5fd : status === 'awaiting_approval' ? 0xfbbf24 : 0x7dd3fc;
  const dim = status === 'paused' || status === 'disconnected';

  return (
    <pixiContainer
      x={x}
      y={y}
      zIndex={zIndex}
      eventMode="static"
      cursor="pointer"
      hitArea={HIT}
      alpha={dim ? 0.55 : 1}
      scale={1.18}
      onPointerTap={onSelect}
      onPointerOver={() => onHover(true)}
      onPointerOut={() => onHover(false)}
    >
      {/* floor ring (status color) */}
      <pixiGraphics
        ref={ringRef}
        draw={(g) => {
          g.clear();
          g.ellipse(0, 0, 20, 9).fill({ color: 0x000000, alpha: 0.35 });
          g.ellipse(0, 0, 20, 9).stroke({ width: selected ? 3 : 2, color: selected ? 0xffffff : color, alpha: 1 });
        }}
      />
      <pixiContainer ref={bodyRef}>
        {/* chair back */}
        <pixiGraphics
          draw={(g) => {
            g.clear();
            g.roundRect(-15, -44, 30, 30, 8).fill({ color: 0x2a2440 });
            g.roundRect(-15, -44, 30, 30, 8).stroke({ width: 1, color: 0xffffff, alpha: 0.06 });
          }}
        />
        {/* torso */}
        <pixiGraphics
          draw={(g) => {
            g.clear();
            g.roundRect(-11, -36, 22, 22, 7).fill({ color: pal.body });
            g.roundRect(-11, -36, 22, 6, 3).fill({ color: shade(pal.body, 1.08) });
            g.roundRect(-4, -27, 8, 3, 1.5).fill({ color: pal.trim });
          }}
        />
        {/* arms (typing only when running) */}
        <pixiGraphics
          ref={armsRef}
          draw={(g) => {
            g.clear();
            g.roundRect(-17, -32, 6, 14, 3).fill({ color: shade(pal.body, 0.86) });
            g.roundRect(11, -32, 6, 14, 3).fill({ color: shade(pal.body, 0.86) });
          }}
        />
        {/* head */}
        <pixiGraphics
          draw={(g) => {
            g.clear();
            g.moveTo(0, -62).lineTo(0, -70).stroke({ width: 2, color: pal.trim });
            g.circle(0, -71, 3).fill({ color: running ? 0xffffff : pal.trim });
            if (running) g.circle(0, -71, 7).fill({ color: pal.trim, alpha: 0.3 });
            g.roundRect(-14, -63, 28, 24, 9).fill({ color: pal.body });
            g.roundRect(-14, -63, 28, 7, 4).fill({ color: shade(pal.body, 1.08) });
            g.roundRect(-11, -57, 22, 12, 6).fill({ color: pal.visor });
            g.roundRect(-11, -57, 22, 12, 6).stroke({ width: 1, color: visor, alpha: 0.35 });
          }}
        />
        <pixiGraphics
          ref={eyesRef}
          y={-51}
          draw={(g) => {
            g.clear();
            g.roundRect(-7, -2.5, 4.5, 5, 2).fill({ color: visor });
            g.roundRect(2.5, -2.5, 4.5, 5, 2).fill({ color: visor });
            g.circle(-4.75, 0, 6).fill({ color: visor, alpha: 0.12 });
            g.circle(4.75, 0, 6).fill({ color: visor, alpha: 0.12 });
          }}
        />
      </pixiContainer>

      {/* status badge */}
      <pixiGraphics
        draw={(g) => {
          g.clear();
          const bx = 15, by = -66;
          if (status === 'awaiting_approval') {
            g.circle(bx, by, 8).fill({ color: 0xfbbf24 });
            g.moveTo(bx - 3.5, by + 2.5).lineTo(bx + 3.5, by + 2.5).lineTo(bx + 2.5, by + 0.5).lineTo(bx + 2.5, by - 2).arc(bx, by - 2, 2.5, 0, Math.PI, true).lineTo(bx - 2.5, by + 0.5).closePath().fill({ color: 0x1c1405 });
            g.circle(bx, by + 4, 1.1).fill({ color: 0x1c1405 });
          } else if (status === 'error') {
            g.circle(bx, by, 8).fill({ color: 0xf43f5e });
            g.roundRect(bx - 1.2, by - 4.5, 2.4, 6, 1).fill({ color: 0xffffff });
            g.circle(bx, by + 3.6, 1.3).fill({ color: 0xffffff });
          } else if (status === 'queued') {
            g.circle(bx, by, 8).fill({ color: 0x3b82f6 });
            g.circle(bx, by, 4.5).stroke({ width: 1.4, color: 0xffffff });
            g.moveTo(bx, by).lineTo(bx, by - 3).moveTo(bx, by).lineTo(bx + 2.2, by + 1).stroke({ width: 1.4, color: 0xffffff });
          } else if (status === 'paused') {
            g.circle(bx, by, 8).fill({ color: 0x64748b });
            g.rect(bx - 3, by - 3.5, 2, 7).fill({ color: 0xffffff });
            g.rect(bx + 1, by - 3.5, 2, 7).fill({ color: 0xffffff });
          } else if (running) {
            g.roundRect(-13, -130, 26, 12, 6).fill({ color: 0x7c3aed, alpha: 0.95 });
          }
        }}
      />
      <pixiGraphics ref={dotsRef} draw={noop} />

      {/* name tag */}
      <pixiContainer y={-112}>
        <pixiGraphics
          draw={(g) => {
            g.clear();
            const w = Math.min(130, name.length * 6.4 + 16);
            g.roundRect(-w / 2, 4, w, 17, 8.5).fill({ color: 0x0b0a14, alpha: selected || hovered ? 0.95 : 0.72 });
            g.roundRect(-w / 2, 4, w, 17, 8.5).stroke({ width: 1, color: selected ? 0xffffff : color, alpha: selected ? 0.9 : 0.5 });
          }}
        />
        <pixiText text={name.length > 20 ? `${name.slice(0, 19)}…` : name} anchor={{ x: 0.5, y: 0 }} y={6} style={NAME_STYLE} resolution={2} />
        {visual.caption && (
          <pixiText text={visual.caption} anchor={{ x: 0.5, y: 0 }} y={-12} style={CAPTION_STYLE} resolution={2} />
        )}
      </pixiContainer>
    </pixiContainer>
  );
}
