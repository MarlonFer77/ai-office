import type { Graphics } from 'pixi.js';
import { rectPolygon, TILE_H, TILE_W, tileToScreen, WALL_H, type Furniture, type RoomLike } from '@ai-office/office-engine';

/** Darkens/lightens a hex color by factor (0..2). */
export function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

const pt = (tx: number, ty: number, z = 0) => {
  const p = tileToScreen(tx, ty);
  return { x: p.x, y: p.y - z };
};

/** Isometric box with three visible faces. */
export function box(g: Graphics, tx: number, ty: number, w: number, d: number, h: number, color: number, opts: { z?: number; alpha?: number; top?: number; stroke?: number } = {}) {
  const z = opts.z ?? 0;
  const a = opts.alpha ?? 1;
  const p00 = pt(tx, ty, z + h), p10 = pt(tx + w, ty, z + h), p11 = pt(tx + w, ty + d, z + h), p01 = pt(tx, ty + d, z + h);
  const b10 = pt(tx + w, ty, z), b11 = pt(tx + w, ty + d, z), b01 = pt(tx, ty + d, z);
  // left-front face (+y)
  g.poly([p01.x, p01.y, p11.x, p11.y, b11.x, b11.y, b01.x, b01.y]).fill({ color: shade(color, 0.72), alpha: a });
  // right-front face (+x)
  g.poly([p10.x, p10.y, p11.x, p11.y, b11.x, b11.y, b10.x, b10.y]).fill({ color: shade(color, 0.55), alpha: a });
  // top
  g.poly([p00.x, p00.y, p10.x, p10.y, p11.x, p11.y, p01.x, p01.y]).fill({ color: opts.top ?? color, alpha: a });
  if (opts.stroke !== undefined) g.poly([p00.x, p00.y, p10.x, p10.y, p11.x, p11.y, p01.x, p01.y]).stroke({ width: 1, color: opts.stroke, alpha: 0.35 * a });
}

/** Floor, back walls (glass upper half), front partitions and decorative wall panel. */
export function drawRoomShell(g: Graphics, room: RoomLike & { theme: { accent: string; floor: string } }, state: { hovered: boolean; selected: boolean }) {
  const accent = Number.parseInt(room.theme.accent.slice(1), 16);
  const floor = Number.parseInt(room.theme.floor.slice(1), 16);
  const { gridX: x, gridY: y, width: w, depth: d } = room;

  // Back walls first (behind floor edge).
  const A = pt(x, y), B = pt(x + w, y), C = pt(x, y + d);
  const wallBase = 0x17142a;
  const solid = WALL_H * 0.42;
  // Right back wall (along x)
  g.poly([A.x, A.y, B.x, B.y, B.x, B.y - solid, A.x, A.y - solid]).fill({ color: shade(wallBase, 1.15) });
  g.poly([A.x, A.y - solid, B.x, B.y - solid, B.x, B.y - WALL_H, A.x, A.y - WALL_H]).fill({ color: accent, alpha: 0.07 });
  // Left back wall (along y)
  g.poly([A.x, A.y, C.x, C.y, C.x, C.y - solid, A.x, A.y - solid]).fill({ color: shade(wallBase, 0.95) });
  g.poly([A.x, A.y - solid, C.x, C.y - solid, C.x, C.y - WALL_H, A.x, A.y - WALL_H]).fill({ color: accent, alpha: 0.05 });
  // Glass mullions
  for (let i = 1; i < w; i += 1.5) {
    const p = pt(x + i, y);
    g.moveTo(p.x, p.y - solid).lineTo(p.x, p.y - WALL_H).stroke({ width: 1, color: accent, alpha: 0.18 });
  }
  for (let i = 1; i < d; i += 1.5) {
    const p = pt(x, y + i);
    g.moveTo(p.x, p.y - solid).lineTo(p.x, p.y - WALL_H).stroke({ width: 1, color: accent, alpha: 0.14 });
  }
  // Wall top rims + skirting light strip
  g.moveTo(C.x, C.y - WALL_H).lineTo(A.x, A.y - WALL_H).lineTo(B.x, B.y - WALL_H).stroke({ width: 2, color: accent, alpha: 0.55 });
  g.moveTo(C.x, C.y - solid).lineTo(A.x, A.y - solid).lineTo(B.x, B.y - solid).stroke({ width: 1, color: 0xffffff, alpha: 0.06 });

  // Decorative wall panel (screen) on the right back wall.
  const s0 = pt(x + w * 0.35, y), s1 = pt(x + w * 0.35 + 1.8, y);
  const top = WALL_H - 8, bottom = solid + 6;
  g.poly([s0.x, s0.y - bottom, s1.x, s1.y - bottom, s1.x, s1.y - top, s0.x, s0.y - top]).fill({ color: 0x0b0a14, alpha: 0.9 }).stroke({ width: 1, color: accent, alpha: 0.5 });
  for (let i = 0; i < 3; i++) {
    const l0 = pt(x + w * 0.35 + 0.25, y), l1 = pt(x + w * 0.35 + 0.25 + 0.4 + i * 0.35, y);
    const yy = bottom + 9 + i * 7;
    g.moveTo(l0.x, l0.y - yy).lineTo(l1.x, l1.y - yy).stroke({ width: 2, color: accent, alpha: 0.55 - i * 0.12 });
  }

  // Floor
  const poly = rectPolygon(x, y, w, d);
  g.poly(poly).fill({ color: floor });
  // Subtle tiles
  for (let i = 1; i < w; i++) {
    const p0 = pt(x + i, y), p1 = pt(x + i, y + d);
    g.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({ width: 1, color: 0xffffff, alpha: 0.035 });
  }
  for (let j = 1; j < d; j++) {
    const p0 = pt(x, y + j), p1 = pt(x + w, y + j);
    g.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({ width: 1, color: 0xffffff, alpha: 0.035 });
  }
  // Rug in the middle
  const rug = rectPolygon(x + w * 0.25, y + d * 0.3, w * 0.5, d * 0.45);
  g.poly(rug).fill({ color: accent, alpha: 0.06 });

  // Selection / hover glow
  const glow = state.selected ? 0.95 : state.hovered ? 0.6 : 0.28;
  g.poly(poly).stroke({ width: state.selected ? 2.5 : 1.5, color: accent, alpha: glow });
  if (state.selected) g.poly(poly).fill({ color: accent, alpha: 0.07 });
}

/** Low glass partitions on the two front edges (drawn after contents). */
export function drawFrontPartitions(g: Graphics, room: RoomLike & { theme: { accent: string } }) {
  const accent = Number.parseInt(room.theme.accent.slice(1), 16);
  const { gridX: x, gridY: y, width: w, depth: d } = room;
  const H = 15;
  const B = pt(x + w, y), D = pt(x + w, y + d), C = pt(x, y + d);
  // Right front (+x edge)
  g.poly([B.x, B.y, D.x, D.y, D.x, D.y - H, B.x, B.y - H]).fill({ color: accent, alpha: 0.08 });
  g.moveTo(B.x, B.y - H).lineTo(D.x, D.y - H).stroke({ width: 1.5, color: accent, alpha: 0.45 });
  // Left front (+y edge) with a door gap
  const gapA = pt(x + w * 0.42, y + d), gapB = pt(x + w * 0.58, y + d);
  g.poly([C.x, C.y, gapA.x, gapA.y, gapA.x, gapA.y - H, C.x, C.y - H]).fill({ color: accent, alpha: 0.08 });
  g.poly([gapB.x, gapB.y, D.x, D.y, D.x, D.y - H, gapB.x, gapB.y - H]).fill({ color: accent, alpha: 0.08 });
  g.moveTo(C.x, C.y - H).lineTo(gapA.x, gapA.y - H).stroke({ width: 1.5, color: accent, alpha: 0.45 });
  g.moveTo(gapB.x, gapB.y - H).lineTo(D.x, D.y - H).stroke({ width: 1.5, color: accent, alpha: 0.45 });
}

/** Desk with chair-side and the back of a monitor whose glow reflects the agent's real state. */
export function drawDesk(g: Graphics, tx: number, ty: number, screen: { color: number; alpha: number }) {
  box(g, tx, ty, 1.4, 0.75, 13, 0x3b3456, { top: 0x524a75, stroke: 0xffffff });
  // monitor (back faces the camera)
  box(g, tx + 0.35, ty + 0.12, 0.75, 0.1, 18, 0x22202e, { z: 13 });
  // screen light spilling upward/backward
  const c = pt(tx + 0.72, ty + 0.1, 13 + 22);
  g.ellipse(c.x, c.y, 22, 9).fill({ color: screen.color, alpha: screen.alpha * 0.35 });
  g.ellipse(c.x, c.y, 11, 5).fill({ color: screen.color, alpha: screen.alpha * 0.5 });
  // keyboard
  box(g, tx + 0.35, ty + 0.45, 0.6, 0.18, 1.5, 0x1d1b28, { z: 13 });
}

export function drawFurniture(g: Graphics, f: Furniture, accent: number, active: boolean) {
  switch (f.kind) {
    case 'plant': {
      box(g, f.tx - 0.2, f.ty - 0.2, 0.4, 0.4, 12, 0xd4cfe6);
      const c = pt(f.tx, f.ty, 22);
      g.circle(c.x, c.y - 4, 10).fill({ color: 0x166534 });
      g.circle(c.x - 7, c.y + 2, 8).fill({ color: 0x15803d });
      g.circle(c.x + 7, c.y + 1, 8).fill({ color: 0x16a34a });
      g.circle(c.x + 1, c.y - 11, 7).fill({ color: 0x22c55e });
      break;
    }
    case 'shelf': {
      box(g, f.tx, f.ty, f.w ?? 0.5, f.d ?? 2, 46, 0x2e2944);
      const colors = [0xf472b6, 0x38bdf8, 0xfbbf24, 0xa78bfa, 0x34d399];
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < 5; i++) {
          const p = pt(f.tx + (f.w ?? 0.5), f.ty + 0.2 + i * ((f.d ?? 2) - 0.4) / 5, 8 + r * 13);
          g.rect(p.x - 2, p.y - 9, 4, 9).fill({ color: colors[(i + r) % colors.length]!, alpha: 0.85 });
        }
      }
      break;
    }
    case 'board': {
      box(g, f.tx, f.ty, f.w ?? 1.5, f.d ?? 0.2, 34, 0xe9e7f5, { z: 8, top: 0xffffff });
      box(g, f.tx + 0.1, f.ty + 0.05, 0.1, 0.1, 8, 0x4b4566);
      box(g, f.tx + (f.w ?? 1.5) - 0.2, f.ty + 0.05, 0.1, 0.1, 8, 0x4b4566);
      const colors = [0xfbbf24, 0xf472b6, 0x38bdf8, 0x34d399];
      for (let i = 0; i < 4; i++) {
        const p = pt(f.tx + 0.25 + i * 0.32, f.ty + (f.d ?? 0.2), 18 + (i % 2) * 10);
        g.rect(p.x - 4, p.y - 6, 8, 7).fill({ color: colors[i]!, alpha: 0.9 });
      }
      break;
    }
    case 'server': {
      box(g, f.tx, f.ty, f.w ?? 0.7, f.d ?? 0.7, 44, 0x1a1828, { stroke: accent });
      for (let i = 0; i < 4; i++) {
        const p = pt(f.tx + 0.15, f.ty + (f.d ?? 0.7), 8 + i * 9);
        // LEDs are only lit when an agent in this room is actually running.
        g.circle(p.x + 4, p.y - 2, 1.6).fill({ color: active ? (i % 2 ? 0x34d399 : accent) : 0x3f3a57 });
        g.rect(p.x + 9, p.y - 3, 10, 2).fill({ color: 0x2c2840 });
      }
      break;
    }
    case 'table': {
      box(g, f.tx, f.ty, f.w ?? 2, f.d ?? 1.5, 12, 0x3d355e, { top: 0x5b5185, stroke: accent });
      const c = pt(f.tx + (f.w ?? 2) / 2, f.ty + (f.d ?? 1.5) / 2, 12);
      g.ellipse(c.x, c.y, 16, 7).fill({ color: accent, alpha: 0.25 });
      break;
    }
    case 'sofa':
      box(g, f.tx, f.ty, f.w ?? 1.8, f.d ?? 0.8, 9, 0x4c1d95);
      box(g, f.tx, f.ty, f.w ?? 1.8, 0.25, 20, 0x5b21b6);
      break;
    case 'bigdesk': {
      box(g, f.tx, f.ty, f.w ?? 2.4, f.d ?? 1, 14, 0x3a2f1d, { top: 0x5c4a2c, stroke: 0xfbbf24 });
      box(g, f.tx + 0.4, f.ty + 0.15, 0.7, 0.08, 18, 0x22202e, { z: 14 });
      box(g, f.tx + 1.3, f.ty + 0.15, 0.7, 0.08, 18, 0x22202e, { z: 14 });
      break;
    }
    case 'lamp': {
      box(g, f.tx - 0.1, f.ty - 0.1, 0.2, 0.2, 40, 0x4b4566);
      const c = pt(f.tx, f.ty, 44);
      g.circle(c.x, c.y, 7).fill({ color: 0xfde68a });
      g.circle(c.x, c.y, 16).fill({ color: 0xfde68a, alpha: 0.12 });
      break;
    }
    case 'cooler':
      box(g, f.tx, f.ty, 0.45, 0.45, 26, 0xe2e8f0);
      box(g, f.tx + 0.05, f.ty + 0.05, 0.35, 0.35, 12, 0x7dd3fc, { z: 26, alpha: 0.8 });
      break;
    case 'screenwall':
      break;
  }
}

/** Corridor floor beneath the whole plan. */
export function drawBaseFloor(g: Graphics, bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
  const pad = 400;
  const poly = rectPolygon(-1, -1, 26, 20);
  g.poly(poly).fill({ color: 0x0f0d1a });
  g.poly(poly).stroke({ width: 1, color: 0x8b5cf6, alpha: 0.12 });
  for (let i = 0; i <= 26; i += 2) {
    const a = tileToScreen(-1 + i, -1), b = tileToScreen(-1 + i, 19);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: 0x8b5cf6, alpha: 0.04 });
  }
  for (let j = 0; j <= 20; j += 2) {
    const a = tileToScreen(-1, -1 + j), b = tileToScreen(25, -1 + j);
    g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1, color: 0x8b5cf6, alpha: 0.04 });
  }
  void bounds;
  void pad;
}

export const TILE = { W: TILE_W, H: TILE_H };
