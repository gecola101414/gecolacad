export interface Point {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  type: string;
  start: Point;
  end: Point;
  [key: string]: any;
}

export function getIntersection(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;

  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return null; // parallel

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  const eps = 1e-4;
  if (ua >= -eps && ua <= 1 + eps && ub >= -eps && ub <= 1 + eps) {
    const tClamped = Math.max(0, Math.min(1, ua));
    return {
      x: x1 + tClamped * (x2 - x1),
      y: y1 + tClamped * (y2 - y1)
    };
  }
  return null;
}

export { trimEntities } from './utils/entityUtils';

// Helper to compute distance from point p to segment v-w
function distanceToSegment(p: Point, v: Point, w: Point) {
  const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}
