'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Application, extend, useApplication } from '@pixi/react';
import { Container, Graphics, Polygon, Text, type FederatedPointerEvent } from 'pixi.js';
import {
  assignSeats,
  clampZoom,
  depthOf,
  fitCamera,
  furnitureForRoom,
  rectPolygon,
  STATUS_COLORS,
  tileToScreen,
  WALL_H,
  worldBounds,
} from '@ai-office/office-engine';
import { useLive } from '@/lib/store';
import type { Agent, Room } from '@/lib/types';
import { drawBaseFloor, drawDesk, drawFrontPartitions, drawFurniture, drawRoomShell } from './draw';
import { EffectsLayer } from './effects';
import { uiFont } from './font';
import { Robot } from './robot';

extend({ Container, Graphics, Text });

export interface CameraControls {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

export interface OfficeCanvasProps {
  rooms: Room[];
  agents: Agent[];
  selectedAgentId: string | null;
  selectedRoomId: string | null;
  onSelectAgent: (id: string) => void;
  onSelectRoom: (id: string) => void;
  controls: MutableRefObject<CameraControls | null>;
}

export default function OfficeCanvas(props: OfficeCanvasProps) {
  const wrap = useRef<HTMLDivElement>(null);
  return (
    <div ref={wrap} className="absolute inset-0 touch-none" aria-hidden="true">
      <Application
        resizeTo={wrap}
        background={0x0a0913}
        antialias
        autoDensity
        resolution={typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio) : 1}
      >
        <Scene {...props} />
      </Application>
    </div>
  );
}

function Scene({
  rooms,
  agents,
  selectedAgentId,
  selectedRoomId,
  onSelectAgent,
  onSelectRoom,
  controls,
}: OfficeCanvasProps) {
  const { app } = useApplication();
  const world = useRef<Container>(null);
  const userMoved = useRef(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(
    null,
  );
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const [hoverRoom, setHoverRoom] = useState<string | null>(null);
  const [hoverAgent, setHoverAgent] = useState<string | null>(null);
  const visuals = useLive((s) => s.scene.agents);

  const bounds = useMemo(() => worldBounds(rooms), [rooms]);
  const seats = useMemo(() => assignSeats(rooms, agents), [rooms, agents]);
  const positions = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const [id, s] of seats) m.set(id, tileToScreen(s.tx, s.ty));
    return m;
  }, [seats]);

  const fit = useCallback(() => {
    const w = world.current;
    if (!w || !app?.renderer) return;
    const cam = fitCamera(bounds, app.screen.width, app.screen.height, 24);
    w.scale.set(cam.scale);
    w.position.set(cam.x, cam.y);
  }, [app, bounds]);

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      const w = world.current;
      if (!w || !app?.renderer) return;
      const px = cx ?? app.screen.width / 2;
      const py = cy ?? app.screen.height / 2;
      const old = w.scale.x;
      const next = clampZoom(old * factor);
      const wx = (px - w.x) / old;
      const wy = (py - w.y) / old;
      w.scale.set(next);
      w.position.set(px - wx * next, py - wy * next);
      userMoved.current = true;
    },
    [app],
  );

  useEffect(() => {
    controls.current = {
      zoomIn: () => zoomAt(1.2),
      zoomOut: () => zoomAt(1 / 1.2),
      fit: () => ((userMoved.current = false), fit()),
    };
  }, [controls, zoomAt, fit]);

  // Initial fit + refit on resize while the user hasn't moved the camera.
  useEffect(() => {
    if (!app?.renderer) return;
    fit();
    const onResize = () => {
      if (!userMoved.current) fit();
    };
    app.renderer.on('resize', onResize);
    return () => {
      app.renderer?.off('resize', onResize);
    };
  }, [app, fit]);

  // Pan (drag), pinch zoom and wheel zoom.
  useEffect(() => {
    if (!app?.renderer) return;
    const stage = app.stage;
    stage.eventMode = 'static';
    stage.hitArea = app.screen;
    const down = (e: FederatedPointerEvent) => {
      pinch.current.set(e.pointerId, { x: e.global.x, y: e.global.y });
      const w = world.current;
      if (w) drag.current = { x: e.global.x, y: e.global.y, ox: w.x, oy: w.y, moved: false };
    };
    const move = (e: FederatedPointerEvent) => {
      const w = world.current;
      if (!w) return;
      if (pinch.current.has(e.pointerId) && pinch.current.size === 2) {
        const pts = [...pinch.current.values()];
        const before = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
        pinch.current.set(e.pointerId, { x: e.global.x, y: e.global.y });
        const after = [...pinch.current.values()];
        const dist = Math.hypot(after[0]!.x - after[1]!.x, after[0]!.y - after[1]!.y);
        if (before > 0)
          zoomAt(dist / before, (after[0]!.x + after[1]!.x) / 2, (after[0]!.y + after[1]!.y) / 2);
        if (drag.current) drag.current.moved = true;
        return;
      }
      const d = drag.current;
      if (!d) return;
      const dx = e.global.x - d.x,
        dy = e.global.y - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      d.moved = true;
      userMoved.current = true;
      w.position.set(d.ox + dx, d.oy + dy);
    };
    const up = (e: FederatedPointerEvent) => {
      pinch.current.delete(e.pointerId);
      setTimeout(() => (drag.current = null), 0);
    };
    stage.on('pointerdown', down);
    stage.on('globalpointermove', move);
    stage.on('pointerup', up);
    stage.on('pointerupoutside', up);
    const canvas = app.canvas as HTMLCanvasElement;
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(Math.exp(-ev.deltaY * 0.0015), ev.clientX - rect.left, ev.clientY - rect.top);
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      stage.off('pointerdown', down);
      stage.off('globalpointermove', move);
      stage.off('pointerup', up);
      stage.off('pointerupoutside', up);
      canvas.removeEventListener('wheel', wheel);
    };
  }, [app, zoomAt]);

  const wasDrag = () => Boolean(drag.current?.moved);
  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => depthOf(a.gridX, a.gridY) - depthOf(b.gridX, b.gridY)),
    [rooms],
  );
  const labelStyle = useMemo(
    () => ({
      fontFamily: uiFont(),
      fontSize: 13,
      fontWeight: '600' as const,
      fill: 0xf3f0ff,
      letterSpacing: 0.2,
    }),
    [],
  );
  const subStyle = useMemo(() => ({ fontFamily: uiFont(), fontSize: 10, fill: 0x9a93b8 }), []);

  return (
    <pixiContainer ref={world} sortableChildren>
      <pixiGraphics zIndex={-10} draw={(g) => (g.clear(), drawBaseFloor(g, bounds))} />
      {sortedRooms.map((room, ri) => {
        const roomAgents = agents.filter((a) => seats.get(a.id)?.roomId === room.id);
        const active = roomAgents.some((a) => (visuals[a.id]?.status ?? a.status) === 'running');
        const accent = Number.parseInt(room.theme.accent.slice(1), 16);
        return (
          <pixiContainer key={room.id} zIndex={ri} sortableChildren>
            <pixiGraphics
              zIndex={-1000}
              eventMode="static"
              cursor="pointer"
              hitArea={new Polygon(rectPolygon(room.gridX, room.gridY, room.width, room.depth))}
              onPointerTap={() => !wasDrag() && onSelectRoom(room.id)}
              onPointerOver={() => setHoverRoom(room.id)}
              onPointerOut={() => setHoverRoom((h) => (h === room.id ? null : h))}
              draw={(g) => {
                g.clear();
                drawRoomShell(g, room, {
                  hovered: hoverRoom === room.id,
                  selected: selectedRoomId === room.id,
                });
              }}
            />
            {furnitureForRoom(room).map((f, i) => (
              <pixiGraphics
                key={`f${i}`}
                zIndex={Math.round(depthOf(f.tx + (f.w ?? 0.4), f.ty + (f.d ?? 0.4)) * 100)}
                draw={(g) => (g.clear(), drawFurniture(g, f, accent, active))}
              />
            ))}
            {roomAgents.map((a) => {
              const seat = seats.get(a.id)!;
              const visual = visuals[a.id] ?? {
                id: a.id,
                status: a.status,
                caption: null,
                lastActivityAt: 0,
                demo: a.provider === 'demo',
              };
              const pos = positions.get(a.id)!;
              const screen =
                visual.status === 'running'
                  ? { color: 0xa78bfa, alpha: 1 }
                  : visual.status === 'error'
                    ? { color: 0xf43f5e, alpha: 0.9 }
                    : visual.status === 'awaiting_approval'
                      ? { color: 0xfbbf24, alpha: 0.8 }
                      : {
                          color: STATUS_COLORS.queued,
                          alpha: visual.status === 'paused' ? 0.1 : 0.35,
                        };
              return [
                room.kind !== 'meeting' && (
                  <pixiGraphics
                    key={`d-${a.id}`}
                    zIndex={Math.round(depthOf(seat.deskTx + 1.4, seat.deskTy + 0.75) * 100)}
                    draw={(g) => (g.clear(), drawDesk(g, seat.deskTx, seat.deskTy, screen))}
                  />
                ),
                <Robot
                  key={`r-${a.id}`}
                  x={pos.x}
                  y={pos.y}
                  zIndex={Math.round(depthOf(seat.tx, seat.ty) * 100)}
                  name={a.name}
                  seed={a.avatarSeed}
                  visual={visual}
                  selected={selectedAgentId === a.id}
                  hovered={hoverAgent === a.id}
                  onSelect={() => !wasDrag() && onSelectAgent(a.id)}
                  onHover={(v) => setHoverAgent((h) => (v ? a.id : h === a.id ? null : h))}
                />,
              ];
            })}
            <pixiGraphics zIndex={99999} draw={(g) => (g.clear(), drawFrontPartitions(g, room))} />
          </pixiContainer>
        );
      })}
      {sortedRooms.map((room) => {
        const roomAgents = agents.filter((a) => seats.get(a.id)?.roomId === room.id);
        const accent = Number.parseInt(room.theme.accent.slice(1), 16);
        // Label sits on top of the left back wall, away from the desks.
        const labelPos = tileToScreen(room.gridX, room.gridY + room.depth * 0.55);
        const busyCount = roomAgents.filter(
          (a) => (visuals[a.id]?.status ?? a.status) === 'running',
        ).length;
        return (
          <pixiContainer
            key={`label-${room.id}`}
            x={labelPos.x}
            y={labelPos.y - WALL_H - 18}
            zIndex={200000 + depthOf(room.gridX, room.gridY)}
            eventMode="static"
            cursor="pointer"
            onPointerTap={() => !wasDrag() && onSelectRoom(room.id)}
          >
            <pixiGraphics
              draw={(g) => {
                g.clear();
                const w = room.name.length * 7.4 + 34;
                g.roundRect(-w / 2, -12, w, 30, 10).fill({ color: 0x0b0a14, alpha: 0.82 });
                g.roundRect(-w / 2, -12, w, 30, 10).stroke({
                  width: 1,
                  color: accent,
                  alpha: selectedRoomId === room.id ? 0.95 : 0.45,
                });
                g.circle(-w / 2 + 11, 3, 3.5).fill({ color: busyCount ? accent : 0x4b4566 });
              }}
            />
            <pixiText
              text={room.name}
              anchor={{ x: 0.5, y: 0 }}
              x={6}
              y={-9}
              style={labelStyle}
              resolution={2}
            />
            <pixiText
              text={`${roomAgents.length} agente(s)${busyCount ? ` · ${busyCount} ativo(s)` : ''}`}
              anchor={{ x: 0.5, y: 0 }}
              x={6}
              y={5}
              style={subStyle}
              resolution={2}
            />
          </pixiContainer>
        );
      })}
      <EffectsLayer positions={positions} />
    </pixiContainer>
  );
}
