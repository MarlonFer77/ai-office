/** Isometric (2:1 dimetric) projection helpers. */
export const TILE_W = 64;
export const TILE_H = 32;
export const WALL_H = 58;

export interface Point {
  x: number;
  y: number;
}

/** Tile coordinates → screen coordinates (top vertex of the tile). */
export function tileToScreen(tx: number, ty: number): Point {
  return { x: (tx - ty) * (TILE_W / 2), y: (tx + ty) * (TILE_H / 2) };
}

/** Screen → fractional tile coordinates. */
export function screenToTile(sx: number, sy: number): Point {
  return { x: sy / TILE_H + sx / TILE_W, y: sy / TILE_H - sx / TILE_W };
}

/** Depth key for painter's ordering (further back = smaller). */
export const depthOf = (tx: number, ty: number) => tx + ty;

/** Flattened polygon (x0,y0,x1,y1…) of a rectangular tile area. */
export function rectPolygon(gx: number, gy: number, w: number, d: number): number[] {
  const a = tileToScreen(gx, gy);
  const b = tileToScreen(gx + w, gy);
  const c = tileToScreen(gx + w, gy + d);
  const e = tileToScreen(gx, gy + d);
  return [a.x, a.y, b.x, b.y, c.x, c.y, e.x, e.y];
}

export function pointInPolygon(p: Point, poly: number[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i]!,
      yi = poly[i + 1]!,
      xj = poly[j]!,
      yj = poly[j + 1]!;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** World bounds of the whole floor plan in screen space. */
export function worldBounds(
  rooms: { gridX: number; gridY: number; width: number; depth: number }[],
) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const r of rooms) {
    const poly = rectPolygon(r.gridX, r.gridY, r.width, r.depth);
    for (let i = 0; i < poly.length; i += 2) {
      minX = Math.min(minX, poly[i]!);
      maxX = Math.max(maxX, poly[i]!);
      minY = Math.min(minY, poly[i + 1]!);
      maxY = Math.max(maxY, poly[i + 1]!);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
  minY -= WALL_H + 40;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** Camera fit: scale and offset so the world fits the viewport with padding. */
export function fitCamera(
  bounds: ReturnType<typeof worldBounds>,
  viewW: number,
  viewH: number,
  padding = 32,
) {
  const scale = Math.max(
    0.3,
    Math.min(
      1.6,
      Math.min((viewW - padding * 2) / bounds.width, (viewH - padding * 2) / bounds.height),
    ),
  );
  return {
    scale,
    x: viewW / 2 - (bounds.minX + bounds.width / 2) * scale,
    y: viewH / 2 - (bounds.minY + bounds.height / 2) * scale,
  };
}

export function clampZoom(z: number) {
  return Math.max(0.3, Math.min(2.5, z));
}
