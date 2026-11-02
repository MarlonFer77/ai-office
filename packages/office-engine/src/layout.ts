import type { RoomKind } from '@ai-office/shared';

export interface RoomLike {
  id: string;
  kind: RoomKind;
  gridX: number;
  gridY: number;
  width: number;
  depth: number;
}

export interface Seat {
  /** Tile coords of the agent (sitting). */
  tx: number;
  ty: number;
  /** Desk position (in front of agent, toward the back wall). */
  deskTx: number;
  deskTy: number;
}

export type FurnitureKind =
  | 'plant'
  | 'shelf'
  | 'board'
  | 'server'
  | 'table'
  | 'sofa'
  | 'bigdesk'
  | 'screenwall'
  | 'lamp'
  | 'cooler';

export interface Furniture {
  kind: FurnitureKind;
  tx: number;
  ty: number;
  w?: number;
  d?: number;
}

/** Desk seats laid out in rows inside a room, leaving a margin near walls. */
export function seatsForRoom(room: RoomLike, count: number): Seat[] {
  const seats: Seat[] = [];
  if (room.kind === 'meeting') {
    // Around the central table.
    const cx = room.gridX + room.width / 2;
    const cy = room.gridY + room.depth / 2;
    const ring = [
      [-1.6, -0.2],
      [1.6, 0.2],
      [0, -1.5],
      [0, 1.6],
      [-1.6, 1.2],
      [1.6, -1.2],
      [-0.9, -1.6],
      [0.9, 1.7],
    ] as const;
    for (let i = 0; i < count; i++) {
      const [dx, dy] = ring[i % ring.length]!;
      seats.push({ tx: cx + dx, ty: cy + dy, deskTx: cx, deskTy: cy });
    }
    return seats;
  }
  // Agents sit behind their desks, facing the camera (desk is closer to the viewer).
  const cols = Math.max(1, Math.floor((room.width - 1.2) / 2.3));
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const deskTx = room.gridX + 1.0 + col * 2.3;
    const deskTy = room.gridY + 2.1 + row * 2.3;
    seats.push({ tx: deskTx + 0.7, ty: deskTy - 0.45, deskTx, deskTy });
  }
  return seats;
}

/** Static decoration per room kind (purely visual, carries no state). */
export function furnitureForRoom(room: RoomLike): Furniture[] {
  const { gridX: x, gridY: y, width: w, depth: d } = room;
  const corners: Furniture[] = [
    { kind: 'plant', tx: x + w - 0.7, ty: y + 0.5 },
    { kind: 'plant', tx: x + 0.5, ty: y + d - 0.7 },
  ];
  switch (room.kind) {
    case 'strategy':
      return [...corners, { kind: 'board', tx: x + w - 1.2, ty: y + d - 1.4, w: 1.6, d: 0.3 }];
    case 'research':
      return [...corners, { kind: 'shelf', tx: x + w - 1.0, ty: y + 2.2, w: 0.5, d: 2.2 }];
    case 'production':
      return [
        ...corners,
        { kind: 'server', tx: x + w - 1.0, ty: y + d - 2.4, w: 0.7, d: 0.7 },
        { kind: 'server', tx: x + w - 1.0, ty: y + d - 1.5, w: 0.7, d: 0.7 },
      ];
    case 'creative':
      return [
        ...corners,
        { kind: 'board', tx: x + w - 1.3, ty: y + d - 1.3, w: 1.4, d: 0.3 },
        { kind: 'lamp', tx: x + 0.6, ty: y + 0.6 },
      ];
    case 'review':
      return [...corners, { kind: 'shelf', tx: x + w - 1.0, ty: y + 2.0, w: 0.5, d: 1.8 }];
    case 'meeting':
      return [
        { kind: 'plant', tx: x + 0.5, ty: y + 0.5 },
        { kind: 'plant', tx: x + w - 0.7, ty: y + d - 0.7 },
        { kind: 'table', tx: x + w / 2 - 1.1, ty: y + d / 2 - 0.8, w: 2.2, d: 1.8 },
      ];
    case 'director':
      return [
        { kind: 'bigdesk', tx: x + w / 2 - 1.2, ty: y + 1.2, w: 2.4, d: 1.0 },
        { kind: 'sofa', tx: x + 0.8, ty: y + d - 1.3, w: 1.8, d: 0.8 },
        { kind: 'plant', tx: x + w - 0.7, ty: y + 0.5 },
        { kind: 'cooler', tx: x + w - 0.8, ty: y + d - 0.9 },
      ];
  }
}

/** Assigns every agent a seat in its room (agents without room go to the meeting room). */
export function assignSeats<A extends { id: string; roomId: string | null }>(
  rooms: RoomLike[],
  agents: A[],
): Map<string, Seat & { roomId: string }> {
  const out = new Map<string, Seat & { roomId: string }>();
  const fallback = rooms.find((r) => r.kind === 'meeting') ?? rooms[0];
  if (!fallback) return out;
  const byRoom = new Map<string, A[]>();
  for (const a of agents) {
    const rid =
      rooms.some((r) => r.id === a.roomId) &&
      rooms.find((r) => r.id === a.roomId)!.kind !== 'director'
        ? a.roomId!
        : fallback.id;
    byRoom.set(rid, [...(byRoom.get(rid) ?? []), a]);
  }
  for (const [rid, list] of byRoom) {
    const room = rooms.find((r) => r.id === rid)!;
    const seats = seatsForRoom(room, list.length);
    list.forEach((a, i) => out.set(a.id, { ...seats[i]!, roomId: rid }));
  }
  return out;
}
