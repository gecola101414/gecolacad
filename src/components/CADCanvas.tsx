import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle, useMemo } from 'react';
import { Check, X, Zap, Sparkles, Pen, Sliders, Palette, MousePointer2, RefreshCw, GripHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Entity, Point, Layer, LineEntity, CircleEntity, ArcEntity, RectEntity, InkPoint, Tavola, DimensionEntity, PointEntity, ImageEntity, CameraEntity } from '../types';

const ParallelIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 20L15 4" />
    <path d="M9 20L19 4" />
  </svg>
);

import { TEMPLATES, Template } from '../data/templates';
import { PdfRenderer } from './PdfRenderer';
import { ImageEditorOverlay } from './ImageEditorOverlay';
import { contours } from 'd3-contour';
import { computeCircleTangentTo2Lines } from '../utils/geometry';

const getSquadrettaVertices = (sq: { type: '45' | '3060', pos: Point, rotation: number }) => {
    const pts: Point[] = [];
    if (sq.type === '45') {
        const size = 300; // cm
        pts.push({ x: 0, y: 0 });
        pts.push({ x: size, y: 0 });
        pts.push({ x: 0, y: size });
    } else {
        const h = 400; // cm
        const w = h / Math.sqrt(3); 
        pts.push({ x: 0, y: 0 });
        pts.push({ x: w, y: 0 });
        pts.push({ x: 0, y: h });
    }

    const rad = (sq.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    return pts.map(p => ({
        x: sq.pos.x + (p.x * cos - p.y * sin),
        y: sq.pos.y + (p.x * sin + p.y * cos)
    }));
};


const getEffectiveCADRenderWidth = (lw: number, mode: string | undefined, zoom: number): number => {
    if (mode === 'ink') {
        // Enforce physical minimums so anti-aliasing doesn't turn it gray, while keeping proportional differences
        let physicalPixels = 1.5;
        if (lw <= 0.25) physicalPixels = Math.max(1.5, 1.5 * zoom);
        else if (lw <= 0.5) physicalPixels = Math.max(2.0, 2.5 * zoom);
        else if (lw <= 1.0) physicalPixels = Math.max(3.0, 4.5 * zoom);
        else physicalPixels = Math.max(4.0, 8.5 * zoom);
        return physicalPixels / zoom;
    }
    return Math.max(0.2, lw / zoom);
};

const fastCloneEntity = (ent: Entity): Entity => {
    const cloned = { ...ent } as any;
    if (ent.type === 'line' || ent.type === 'dimension') {
        cloned.start = { x: ent.start.x, y: ent.start.y };
        cloned.end = { x: ent.end.x, y: ent.end.y };
        if ((ent as any).retraceStart && (ent as any).retraceEnd) {
            cloned.retraceStart = { x: (ent as any).retraceStart.x, y: (ent as any).retraceStart.y };
            cloned.retraceEnd = { x: (ent as any).retraceEnd.x, y: (ent as any).retraceEnd.y };
        }
        if ((ent as any).isFreehand && (ent as any).inkPoints) {
            (cloned as any).inkPoints = (ent as any).inkPoints.map((p: any) => ({ ...p }));
        }
    } else if (ent.type === 'circle' || ent.type === 'arc') {
        cloned.center = { x: ent.center.x, y: ent.center.y };
    } else if (ent.type === 'rectangle') {
        cloned.p1 = { x: ent.p1.x, y: ent.p1.y };
        cloned.p2 = { x: ent.p2.x, y: ent.p2.y };
    } else if (ent.type === 'hatch') {
        if ((ent as any).points) {
            cloned.points = (ent as any).points.map((p: Point) => ({ x: p.x, y: p.y }));
        }
    } else if (ent.type === 'point' || ent.type === 'text' || ent.type === 'image') {
        cloned.point = { x: ent.point.x, y: ent.point.y };
    }
    
    // Generic elements
    if ((ent as any).bimPoints) {
        cloned.bimPoints = (ent as any).bimPoints.map((p: Point) => ({ x: p.x, y: p.y }));
    }
    if ((ent as any).points && ent.type !== 'hatch') {
        cloned.points = (ent as any).points.map((p: Point) => ({ x: p.x, y: p.y }));
    }
    if ((ent as any).holes) {
        cloned.holes = (ent as any).holes.map((hole: Point[]) => hole.map((p: Point) => ({ x: p.x, y: p.y })));
    }
    return cloned;
};

export interface CADCanvasAPI {
  getCurrentMousePosition: () => Point;
  rotateMaskAtPoint: (e: React.MouseEvent | React.PointerEvent) => boolean;
  editRaccordo: (
    id1: string,
    id2: string,
    clickPt1: Point,
    clickPt2: Point,
    existingRaccordoId: string,
    config: { type: 'curvo' | 'rettilineo' | 'taglia'; value: number },
    originalLine1: any,
    originalLine2: any
  ) => void;
  autoScanBIM: () => void;
  setBIMDefaults: (
    width: number, 
    height: number | undefined, 
    type: 'door' | 'window' | 'wall', 
    zElevation?: number, 
    windowType?: string, 
    flipLeft?: boolean, 
    flipSide?: boolean, 
    rotation?: number
  ) => void;
  resetView?: () => void;
  zoomFit?: () => void;
}

export type DrawingState = {
  type?: string;
  start: Point;
  current?: Point;
  arcStartPoint?: Point;
  arcDirection?: number;
  snapType?: 'CAD' | 'smart';
  snapSubtype?: string;
  refSegment?: { start: Point; end: Point; length: number };
  refLength?: number;
  refRadius?: number;
  startSnapped?: boolean;
  refPoint?: Point;
  refEntityId?: string;
  constraintAxis?: 'x' | 'y';
  refPoint2?: Point;
  constraintAxis2?: 'x' | 'y';
  hasDoubleSmart?: boolean;
  activeConstraint?: { axis: 'x' | 'y'; value: number };
  wheelLength?: number;
  startWheelLength?: number;
  lockedDir?: Point;
  isVirtual?: boolean;
  freehandPoints?: Point[];
  isFreehand?: boolean;
  isTraditionalSegment?: boolean;
  maxPoint?: Point;
  maxLength?: number;
  retraceMinProj?: number;
};

const normalizeAngle = (a: number) => {
  let deg = a % 360;
  if (deg < 0) deg += 360;
  return deg;
};

const computeRealisticInkPoint = (
  pts: Point[],
  i: number,
  mode: 'pencil' | 'ink',
  zoom: number
): { width: number; alpha: number } => {
  if (pts.length < 2) {
    return { width: 1.0, alpha: mode === 'ink' ? 0.95 : 0.5 };
  }
  const pPrev = i > 0 ? pts[i - 1] : pts[0];
  const pCurr = pts[i];
  const pNext = i < pts.length - 1 ? pts[i + 1] : pts[pts.length - 1];

  // Calculate speed as distance in screen pixels to smooth out jitter
  const d1 = i > 0 ? Math.sqrt(Math.pow(pCurr.x - pPrev.x, 2) + Math.pow(pCurr.y - pPrev.y, 2)) * zoom : 0;
  const d2 = i < pts.length - 1 ? Math.sqrt(Math.pow(pNext.x - pCurr.x, 2) + Math.pow(pNext.y - pCurr.y, 2)) * zoom : 0;
  
  let dist = d1;
  if (i === 0) dist = d2;
  else if (i === pts.length - 1) dist = d1;
  else dist = (d1 + d2) / 2; // local smooth average speed

  let baseAlpha = 1.0;
  let baseWidth = 1.0;

  if (mode === 'ink') {
    // Deterministic organic textures based on index 'i' to prevent flickering on redraws
    const wave1 = Math.sin(i * 1.1);
    const wave2 = Math.cos(i * 2.3);
    const jitter = (wave1 * 0.04) + (wave2 * 0.02); // subtle bleeding/shake

    if (dist < 2.5) {
      // Extremely slow: rich thick black ink flow with slight natural pooling/bleeding (sbavatura)
      baseAlpha = 1.0;
      baseWidth = 1.28 + jitter;
    } else if (dist < 7.0) {
      // Slow-medium normal: nice dense black
      const t = (dist - 2.5) / 4.5;
      baseAlpha = (1.0 * (1 - t)) + (0.92 * t);
      baseWidth = (1.28 * (1 - t)) + (1.06 * t) + (wave1 * 0.03);
    } else if (dist < 18.0) {
      // Fast: slightly thinner but solid and highly intense (fewer empty spots, increased intensity by 50%)
      const t = (dist - 7.0) / 11.0;
      baseAlpha = (0.92 * (1 - t)) + (0.76 * t);
      baseWidth = (1.06 * (1 - t)) + (0.86 * t) + (wave1 * 0.03);
      
      // Sparse scratchy dropout - "qualche residuo non troppi"
      const noise = (Math.sin(i * 1.7) + Math.cos(i * 2.9)) / 2; // -1 to 1
      if (noise > 0.78) { // rare
        baseAlpha = baseAlpha * 0.82; // mild texture drop instead of empty space
        baseWidth = baseWidth * 0.92;
      }
    } else {
      // Very fast: ink is a bit starved but still retains high intensity (50% higher than before)
      const t = Math.min(1.0, (dist - 18.0) / 22.0);
      baseAlpha = (0.76 * (1 - t)) + (0.58 * t);
      baseWidth = (0.86 * (1 - t)) + (0.70 * t);
      
      // Rare scratched trace "giusto per dare il senso della kina reale con qualche sbavatura"
      const noise = (Math.sin(i * 2.5) + Math.cos(i * 3.7)) / 2;
      if (noise > 0.72) {
        baseAlpha = baseAlpha * 0.62; // soft scratching
        baseWidth = baseWidth * 0.82;
      }
    }
  } else {
    // Pencil mode: also has speed sensitivity but softer, lighter feel
    if (dist < 3) {
      baseAlpha = 0.75;
      baseWidth = 1.1;
    } else if (dist < 12) {
      const t = (dist - 3) / 9;
      baseAlpha = (0.75 * (1 - t)) + (0.48 * t);
      baseWidth = (1.1 * (1 - t)) + (0.8 * t);
    } else {
      const t = Math.min(1, (dist - 12) / 20);
      baseAlpha = (0.48 * (1 - t)) + (0.22 * t);
      baseWidth = (0.8 * (1 - t)) + (0.5 * t);
      
      // Soft pencil texture noise
      const noise = Math.sin(i * 1.9) * 0.5 + 0.5;
      if (noise > 0.7) {
        baseAlpha = baseAlpha * 0.6;
      }
    }
  }

  return {
    width: Math.max(0.1, baseWidth),
    alpha: Math.max(0.05, Math.min(1.0, baseAlpha))
  };
};

const projectCADVertex = (entity: any, p: Point, localH: number = 0): Point => {
  const rx = (entity.rotationX || 0) * Math.PI / 180;
  const ry = (entity.rotationY || 0) * Math.PI / 180;
  const rz = (entity.rotationZ || 0) * Math.PI / 180;
  
  if (rx === 0 && ry === 0 && rz === 0) {
    return p;
  }
  
  const pivotIdx = entity.selectedPivotIndex !== undefined ? entity.selectedPivotIndex : 0;
  const pts = entity.points || entity.bimPoints;
  const pCAD = (pts && pts[pivotIdx]) || pts?.[0] || entity.point || entity.start || { x: 0, y: 0 };
  const baseElevation = (entity.bimZPlane || 0) + (entity.bimZElevation || 0);
  
  const dx = (p.x - pCAD.x) / 100;
  const dy = localH / 100;
  const dz = -(p.y - pCAD.y) / 100;
  
  const x1 = dx;
  const y1 = dy * Math.cos(rx) - dz * Math.sin(rx);
  const z1 = dy * Math.sin(rx) + dz * Math.cos(rx);
  
  const x2 = x1 * Math.cos(ry) + z1 * Math.sin(ry);
  const y2 = y1;
  const z2 = -x1 * Math.sin(ry) + z1 * Math.cos(ry);
  
  const x3 = x2 * Math.cos(rz) - y2 * Math.sin(rz);
  const y3 = x2 * Math.sin(rz) + y2 * Math.cos(rz);
  const z3 = z2;
  
  const worldX = (pCAD.x / 100) + x3;
  const worldZ = (-pCAD.y / 100) + z3;
  
  return {
    x: worldX * 100,
    y: -worldZ * 100
  };
};

const getProjectedEntity = (entity: any): any => {
  if (!entity) return entity;
  const rx = (entity.rotationX || 0);
  const rz = (entity.rotationZ || 0);
  const ry = (entity.rotationY || 0);
  
  if (rx === 0 && rz === 0 && ry === 0) {
    return entity;
  }
  
  const cloned = { ...entity };
  if (cloned.point) {
    cloned.point = projectCADVertex(entity, cloned.point, 0);
  }
  if (cloned.start) {
    cloned.start = projectCADVertex(entity, cloned.start, 0);
  }
  if (cloned.end) {
    cloned.end = projectCADVertex(entity, cloned.end, 0);
  }
  if (cloned.p1) {
    cloned.p1 = projectCADVertex(entity, cloned.p1, 0);
  }
  if (cloned.p2) {
    cloned.p2 = projectCADVertex(entity, cloned.p2, 0);
  }
  if (cloned.center) {
    cloned.center = projectCADVertex(entity, cloned.center, 0);
  }
  
  if (cloned.points) {
    cloned.points = cloned.points.map((p: any) => projectCADVertex(entity, p, 0));
  }
  if (cloned.bimPoints) {
    cloned.bimPoints = cloned.bimPoints.map((p: any) => projectCADVertex(entity, p, 0));
  }
  if (cloned.holes) {
    cloned.holes = cloned.holes.map((hole: any[]) => hole.map((p: any) => projectCADVertex(entity, p, 0)));
  }
  
  return cloned;
};

const AREA_TYPE_COLORS: Record<string, string> = {
  'stanza': 'rgba(16, 185, 129, 0.12)',
  'muro': 'rgba(107, 114, 128, 0.2)',
  'tramezzo': 'rgba(156, 163, 175, 0.15)',
  'giardino': 'rgba(34, 197, 94, 0.15)',
  'tetto': 'rgba(239, 68, 68, 0.15)',
  'intonaco': 'rgba(226, 232, 240, 0.6)',
  'rivestimento': 'rgba(148, 163, 184, 0.5)',
  'altro': 'rgba(168, 85, 247, 0.15)'
};

const getAreaColor = (type: string | undefined): string => {
  return AREA_TYPE_COLORS[type || 'stanza'] || AREA_TYPE_COLORS['stanza'];
};

const mirrorPoint = (p: Point, a: Point, b: Point): Point => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return p;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  const hx = a.x + t * dx;
  const hy = a.y + t * dy;
  return {
    x: 2 * hx - p.x,
    y: 2 * hy - p.y
  };
};

const intersectLines = (p1: Point, v1: Point, p2: Point, v2: Point): Point | null => {
  const denom = v1.x * v2.y - v1.y * v2.x;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((p2.x - p1.x) * v2.y - (p2.y - p1.y) * v2.x) / denom;
  return { x: p1.x + t * v1.x, y: p1.y + t * v1.y };
};

const distToSegment = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((p.x - (a.x + t * dx)) ** 2 + (p.y - (a.y + t * dy)) ** 2);
};

const getWallCorners = (l: LineEntity, bimWalls: LineEntity[]): Point[] => {
  const thickness = l.bimWidth || 15;
  const dx = l.end.x - l.start.x;
  const dy = l.end.y - l.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= 0.1) return [l.start, l.end];

  const nx = -dy / len;
  const ny = dx / len;
  const N = { x: nx, y: ny };
  const V = { x: dx / len, y: dy / len };

  let startPlus = { x: l.start.x + nx * thickness / 2, y: l.start.y + ny * thickness / 2 };
  let startMinus = { x: l.start.x - nx * thickness / 2, y: l.start.y - ny * thickness / 2 };
  let endPlus = { x: l.end.x + nx * thickness / 2, y: l.end.y + ny * thickness / 2 };
  let endMinus = { x: l.end.x - nx * thickness / 2, y: l.end.y - ny * thickness / 2 };

  const startConns = bimWalls.filter(e => e.id !== l.id);
  let bestStartConn: LineEntity | null = null;
  let isStartCorner = false;
  let bestStartDist = 15.0;

  for (const other of startConns) {
      const dStart = Math.sqrt((other.start.x - l.start.x) ** 2 + (other.start.y - l.start.y) ** 2);
      const dEnd = Math.sqrt((other.end.x - l.start.x) ** 2 + (other.end.y - l.start.y) ** 2);
      if (dStart < bestStartDist) {
          bestStartConn = other;
          bestStartDist = dStart;
          isStartCorner = true;
      }
      if (dEnd < bestStartDist) {
          bestStartConn = other;
          bestStartDist = dEnd;
          isStartCorner = true;
      }
      const dSeg = distToSegment(l.start, other.start, other.end);
      if (dSeg < bestStartDist) {
          bestStartConn = other;
          bestStartDist = dSeg;
          isStartCorner = false;
      }
  }

  if (bestStartConn) {
      if (isStartCorner) {
          const V1 = { x: -V.x, y: -V.y };
          const N1 = { x: -V1.y, y: V1.x };
          const isOtherStart = Math.sqrt((bestStartConn.start.x - l.start.x) ** 2 + (bestStartConn.start.y - l.start.y) ** 2) < 15.0;
          const oStart = bestStartConn.start;
          const oEnd = bestStartConn.end;
          const oDx = oEnd.x - oStart.x;
          const oDy = oEnd.y - oStart.y;
          const oLen = Math.sqrt(oDx * oDx + oDy * oDy);
          if (oLen > 0.1) {
              const oV = { x: oDx / oLen, y: oDy / oLen };
              const V2 = isOtherStart ? oV : { x: -oV.x, y: -oV.y };
              const N2 = { x: -V2.y, y: V2.x };
              const t2 = bestStartConn.bimWidth || 15;
              const p1_plus = { x: l.start.x + N1.x * thickness / 2, y: l.start.y + N1.y * thickness / 2 };
              const p2_plus = { x: l.start.x + N2.x * t2 / 2, y: l.start.y + N2.y * t2 / 2 };
              const p1_minus = { x: l.start.x - N1.x * thickness / 2, y: l.start.y - N1.y * thickness / 2 };
              const p2_minus = { x: l.start.x - N2.x * t2 / 2, y: l.start.y - N2.y * t2 / 2 };
              const cross = Math.abs(V1.x * V2.y - V1.y * V2.x);
              if (cross > 0.1) {
                  const pt_plus = intersectLines(p1_plus, V1, p2_plus, V2);
                  const pt_minus = intersectLines(p1_minus, V1, p2_minus, V2);
                  if (pt_plus && pt_minus) {
                      startMinus = pt_plus;
                      startPlus = pt_minus;
                  }
              }
          }
      } else {
          const oStart = bestStartConn.start;
          const oEnd = bestStartConn.end;
          const oDx = oEnd.x - oStart.x;
          const oDy = oEnd.y - oStart.y;
          const oLen = Math.sqrt(oDx * oDx + oDy * oDy);
          if (oLen > 0.1) {
              const oV = { x: oDx / oLen, y: oDy / oLen };
              const oN = { x: -oV.y, y: oV.x };
              const t2 = bestStartConn.bimWidth || 15;
              const other_A_point = { x: oStart.x + oN.x * t2 / 2, y: oStart.y + oN.y * t2 / 2 };
              const other_B_point = { x: oStart.x - oN.x * t2 / 2, y: oStart.y - oN.y * t2 / 2 };
              const lp_p = { x: l.start.x + nx * thickness / 2, y: l.start.y + ny * thickness / 2 };
              const lp_m = { x: l.start.x - nx * thickness / 2, y: l.start.y - ny * thickness / 2 };
              const cross = Math.abs(V.x * oV.y - V.y * oV.x);
              if (cross > 0.1) {
                  const ipt_lp_p_A = intersectLines(lp_p, V, other_A_point, oV);
                  const ipt_lp_p_B = intersectLines(lp_p, V, other_B_point, oV);
                  if (ipt_lp_p_A && ipt_lp_p_B) {
                      const d_A = (ipt_lp_p_A.x - lp_p.x) ** 2 + (ipt_lp_p_A.y - lp_p.y) ** 2;
                      const d_B = (ipt_lp_p_B.x - lp_p.x) ** 2 + (ipt_lp_p_B.y - lp_p.y) ** 2;
                      startPlus = d_A < d_B ? ipt_lp_p_A : ipt_lp_p_B;
                  }
                  const ipt_lp_m_A = intersectLines(lp_m, V, other_A_point, oV);
                  const ipt_lp_m_B = intersectLines(lp_m, V, other_B_point, oV);
                  if (ipt_lp_m_A && ipt_lp_m_B) {
                      const d_A = (ipt_lp_m_A.x - lp_m.x) ** 2 + (ipt_lp_m_A.y - lp_m.y) ** 2;
                      const d_B = (ipt_lp_m_B.x - lp_m.x) ** 2 + (ipt_lp_m_B.y - lp_m.y) ** 2;
                      startMinus = d_A < d_B ? ipt_lp_m_A : ipt_lp_m_B;
                  }
              }
          }
      }
  }

  const endConns = bimWalls.filter(e => e.id !== l.id);
  let bestEndConn: LineEntity | null = null;
  let isEndCorner = false;
  let bestEndDist = 15.0;

  for (const other of endConns) {
      const dStart = Math.sqrt((other.start.x - l.end.x) ** 2 + (other.start.y - l.end.y) ** 2);
      const dEnd = Math.sqrt((other.end.x - l.end.x) ** 2 + (other.end.y - l.end.y) ** 2);
      if (dStart < bestEndDist) {
          bestEndConn = other;
          bestEndDist = dStart;
          isEndCorner = true;
      }
      if (dEnd < bestEndDist) {
          bestEndConn = other;
          bestEndDist = dEnd;
          isEndCorner = true;
      }
      const dSeg = distToSegment(l.end, other.start, other.end);
      if (dSeg < bestEndDist) {
          bestEndConn = other;
          bestEndDist = dSeg;
          isEndCorner = false;
      }
  }

  if (bestEndConn) {
      if (isEndCorner) {
          const V1 = V;
          const N1 = N;
          const isOtherStart = Math.sqrt((bestEndConn.start.x - l.end.x) ** 2 + (bestEndConn.start.y - l.end.y) ** 2) < 15.0;
          const oStart = bestEndConn.start;
          const oEnd = bestEndConn.end;
          const oDx = oEnd.x - oStart.x;
          const oDy = oEnd.y - oStart.y;
          const oLen = Math.sqrt(oDx * oDx + oDy * oDy);
          if (oLen > 0.1) {
              const oV = { x: oDx / oLen, y: oDy / oLen };
              const V2 = isOtherStart ? oV : { x: -oV.x, y: -oV.y };
              const N2 = { x: -V2.y, y: V2.x };
              const t2 = bestEndConn.bimWidth || 15;
              const p1_plus = { x: l.end.x + N1.x * thickness / 2, y: l.end.y + N1.y * thickness / 2 };
              const p2_plus = { x: l.end.x + N2.x * t2 / 2, y: l.end.y + N2.y * t2 / 2 };
              const p1_minus = { x: l.end.x - N1.x * thickness / 2, y: l.end.y - N1.y * thickness / 2 };
              const p2_minus = { x: l.end.x - N2.x * t2 / 2, y: l.end.y - N2.y * t2 / 2 };
              const cross = Math.abs(V1.x * V2.y - V1.y * V2.x);
              if (cross > 0.1) {
                  const pt_plus = intersectLines(p1_plus, V1, p2_plus, V2);
                  const pt_minus = intersectLines(p1_minus, V1, p2_minus, V2);
                  if (pt_plus && pt_minus) {
                      endPlus = pt_plus;
                      endMinus = pt_minus;
                  }
              }
          }
      } else {
          const oStart = bestEndConn.start;
          const oEnd = bestEndConn.end;
          const oDx = oEnd.x - oStart.x;
          const oDy = oEnd.y - oStart.y;
          const oLen = Math.sqrt(oDx * oDx + oDy * oDy);
          if (oLen > 0.1) {
              const oV = { x: oDx / oLen, y: oDy / oLen };
              const oN = { x: -oV.y, y: oV.x };
              const t2 = bestEndConn.bimWidth || 15;
              const other_A_point = { x: oStart.x + oN.x * t2 / 2, y: oStart.y + oN.y * t2 / 2 };
              const other_B_point = { x: oStart.x - oN.x * t2 / 2, y: oStart.y - oN.y * t2 / 2 };
              const lp_p = { x: l.end.x + nx * thickness / 2, y: l.end.y + ny * thickness / 2 };
              const lp_m = { x: l.end.x - nx * thickness / 2, y: l.end.y - ny * thickness / 2 };
              const cross = Math.abs(V.x * oV.y - V.y * oV.x);
              if (cross > 0.1) {
                  const ipt_lp_p_A = intersectLines(lp_p, V, other_A_point, oV);
                  const ipt_lp_p_B = intersectLines(lp_p, V, other_B_point, oV);
                  if (ipt_lp_p_A && ipt_lp_p_B) {
                      const d_A = (ipt_lp_p_A.x - lp_p.x) ** 2 + (ipt_lp_p_A.y - lp_p.y) ** 2;
                      const d_B = (ipt_lp_p_B.x - lp_p.x) ** 2 + (ipt_lp_p_B.y - lp_p.y) ** 2;
                      endPlus = d_A < d_B ? ipt_lp_p_A : ipt_lp_p_B;
                  }
                  const ipt_lp_m_A = intersectLines(lp_m, V, other_A_point, oV);
                  const ipt_lp_m_B = intersectLines(lp_m, V, other_B_point, oV);
                  if (ipt_lp_m_A && ipt_lp_m_B) {
                      const d_A = (ipt_lp_m_A.x - lp_m.x) ** 2 + (ipt_lp_m_A.y - lp_m.y) ** 2;
                      const d_B = (ipt_lp_m_B.x - lp_m.x) ** 2 + (ipt_lp_m_B.y - lp_m.y) ** 2;
                      endMinus = d_A < d_B ? ipt_lp_m_A : ipt_lp_m_B;
                  }
              }
          }
      }
  }

  return [startPlus, startMinus, endPlus, endMinus];
};

const mirrorAngle = (angleDeg: number, axisAngleDeg: number): number => {
  let res = 2 * axisAngleDeg - angleDeg;
  res = res % 360;
  if (res < 0) res += 360;
  return res;
};

const mirrorEntity = (entity: Entity, axisPt1: Point, axisPt2: Point): Entity => {
  const common = {
    id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
    layer: entity.layer,
    color: entity.color,
    lineWidth: entity.lineWidth,
    mode: entity.mode,
    dashed: !!entity.dashed,
    groupId: entity.groupId,
  };

  const axisAngleRad = Math.atan2(axisPt2.y - axisPt1.y, axisPt2.x - axisPt1.x);
  const axisAngleDeg = axisAngleRad * 180 / Math.PI;

  if (entity.type === 'line') {
    const newStart = mirrorPoint(entity.start, axisPt1, axisPt2);
    const newEnd = mirrorPoint(entity.end, axisPt1, axisPt2);
    let newInkPoints: any[] | undefined;
    if (entity.inkPoints) {
      newInkPoints = entity.inkPoints.map((p: any) => {
        const mp = mirrorPoint(p, axisPt1, axisPt2);
        if (entity.isFreehand) {
            return { ...p, x: mp.x, y: mp.y };
        } else {
            // For non-freehand ink points, they represent relative offsets (often structural noise)
            // It might just be easier to discard them and let it regenerate or apply mirror
            // Actually, if we mirror the base line, the dx/dy is mirrored, so the nx/ny is mirrored.
            // But let's just mirror the offset points directly as vectors for simplicity
            const dx = axisPt2.x - axisPt1.x;
            const dy = axisPt2.y - axisPt1.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq < 1e-10) return p;
            const t = (p.x * dx + p.y * dy) / lenSq;
            const projX = t * dx;
            const projY = t * dy;
            const mirrorVecX = 2 * projX - p.x;
            const mirrorVecY = 2 * projY - p.y;
            return { ...p, x: mirrorVecX, y: mirrorVecY };
        }
      });
    }
    return {
      ...entity,
      ...common,
      start: newStart,
      end: newEnd,
      inkPoints: newInkPoints,
    } as any;
  } else if (entity.type === 'circle') {
    const newCenter = mirrorPoint(entity.center, axisPt1, axisPt2);
    return {
      ...entity,
      ...common,
      center: newCenter,
    } as any;
  } else if (entity.type === 'arc') {
    const newCenter = mirrorPoint(entity.center, axisPt1, axisPt2);
    const newStartAngle = mirrorAngle(entity.endAngle, axisAngleDeg);
    const newEndAngle = mirrorAngle(entity.startAngle, axisAngleDeg);
    return {
      ...entity,
      ...common,
      center: newCenter,
      startAngle: newStartAngle,
      endAngle: newEndAngle,
    } as any;
  } else if (entity.type === 'rectangle') {
    const newP1 = mirrorPoint(entity.p1, axisPt1, axisPt2);
    const newP2 = mirrorPoint(entity.p2, axisPt1, axisPt2);
    return {
      ...entity,
      ...common,
      p1: { x: Math.min(newP1.x, newP2.x), y: Math.min(newP1.y, newP2.y) },
      p2: { x: Math.max(newP1.x, newP2.x), y: Math.max(newP1.y, newP2.y) },
    } as any;
  } else if (entity.type === 'hatch') {
    const h = entity as any;
    const mirroredPoints = h.points ? h.points.map((p: Point) => mirrorPoint(p, axisPt1, axisPt2)) : [];
    // Calculate the mirrored angle. A naive angle mirror
    const newAngle = -h.angle;
    return {
        ...entity,
        ...common,
        points: mirroredPoints,
        angle: newAngle
    } as any;
  } else if (entity.type === 'point') {
    const newPoint = mirrorPoint(entity.point, axisPt1, axisPt2);
    return {
      ...entity,
      ...common,
      point: newPoint,
    } as any;
  } else if (entity.type === 'text') {
    const newPoint = mirrorPoint(entity.point, axisPt1, axisPt2);
    let newAlign = entity.textAlign;
    if (entity.textAlign === 'left') newAlign = 'right';
    else if (entity.textAlign === 'right') newAlign = 'left';
    return {
      ...entity,
      ...common,
      point: newPoint,
      textAlign: newAlign,
    } as any;
  } else if (entity.type === 'dimension') {
    const newStart = mirrorPoint(entity.start, axisPt1, axisPt2);
    const newEnd = mirrorPoint(entity.end, axisPt1, axisPt2);
    return {
      ...entity,
      ...common,
      start: newStart,
      end: newEnd,
    } as any;
  } else if (entity.type === 'image') {
    const newPoint = mirrorPoint(entity.point, axisPt1, axisPt2);
    return {
      ...entity,
      ...common,
      point: newPoint,
      angle: entity.angle !== undefined ? (180 - entity.angle) % 360 : undefined,
    } as any;
  } else if ((entity as any).type === 'hatch') {
    const h = entity as any;
    const newPoints = h.points ? h.points.map((p: Point) => mirrorPoint(p, axisPt1, axisPt2)) : [];
    return {
      ...(entity as any),
      ...common,
      points: newPoints,
    } as any;
  }

  return { ...(entity as any), id: common.id };
};

const drawTempEntityPreview = (ctx: CanvasRenderingContext2D, entity: Entity) => {
  ctx.beginPath();
  if (entity.type === 'line') {
    if (entity.mode === 'ink' && entity.inkPoints) {
      let lastX = entity.start.x;
      let lastY = entity.start.y;
      for (let i = 0; i < entity.inkPoints.length; i++) {
        const pt = entity.inkPoints[i];
        const px = entity.isFreehand ? pt.x : lastX;
        const py = entity.isFreehand ? pt.y : lastY;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(px, py);
        ctx.stroke();
        lastX = px;
        lastY = py;
      }
    } else {
      ctx.moveTo(entity.start.x, entity.start.y);
      ctx.lineTo(entity.end.x, entity.end.y);
      ctx.stroke();
    }
  } else if (entity.type === 'circle') {
    ctx.arc(entity.center.x, entity.center.y, entity.radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (entity.type === 'arc') {
    ctx.arc(entity.center.x, entity.center.y, entity.radius, entity.startAngle * Math.PI / 180, entity.endAngle * Math.PI / 180);
    ctx.stroke();
  } else if (entity.type === 'rectangle') {
    const width = entity.p2.x - entity.p1.x;
    const height = entity.p2.y - entity.p1.y;
    ctx.rect(entity.p1.x, entity.p1.y, width, height);
    ctx.stroke();
  } else if (entity.type === 'point') {
    ctx.arc(entity.point.x, entity.point.y, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (entity.type === 'text') {
    ctx.save();
    ctx.font = `${entity.fontWeight || 'normal'} ${entity.fontSize}px ${entity.fontFamily || 'sans-serif'}`;
    ctx.textAlign = (entity.textAlign || 'left') as CanvasTextAlign;
    ctx.textBaseline = 'top';
    const lines = entity.text.split('\n');
    lines.forEach((line, idx) => {
      ctx.fillText(line, entity.point.x, entity.point.y);
    });
    ctx.restore();
  } else if (entity.type === 'dimension') {
    ctx.moveTo(entity.start.x, entity.start.y);
    ctx.lineTo(entity.end.x, entity.end.y);
    ctx.stroke();
  } else if (entity.type === 'hatch') {
    const h = entity as any;
    if (h.points && h.points.length > 0) {
      ctx.moveTo(h.points[0].x, h.points[0].y);
      for (let i = 1; i < h.points.length; i++) {
        ctx.lineTo(h.points[i].x, h.points[i].y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  } else if (entity.type === 'image') {
    if (entity.mediaType && entity.mediaType !== 'image') {
      ctx.rect(entity.point.x, entity.point.y, entity.width, entity.height);
      return;
    }
    const imgElement = document.createElement('img');
    imgElement.src = entity.src;
    imgElement.crossOrigin = 'anonymous';
    try {
      ctx.drawImage(imgElement, entity.point.x, entity.point.y, entity.width, entity.height);
    } catch (e) {
      ctx.rect(entity.point.x, entity.point.y, entity.width, entity.height);
      ctx.stroke();
    }
  }
};

const isPointInPolygon = (p: Point, poly: Point[]): boolean => {
  if (!poly || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    
    const intersect = ((yi > p.y) !== (yj > p.y))
        && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const isPointInFullPolygon = (pt: Point, poly: { points: Point[], holes?: Point[][] }): boolean => {
  const insideOuter = isPointInPolygon(pt, poly.points);
  if (!insideOuter) return false;
  if (poly.holes) {
    for (const hole of poly.holes) {
      if (isPointInPolygon(pt, hole)) return false;
    }
  }
  return true;
};

const distanceToSegmentPt = (p: Point, s: Point, e: Point): number => {
  const l2 = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
  if (l2 === 0) return Math.sqrt((p.x - s.x) ** 2 + (p.y - s.y) ** 2);
  let t = ((p.x - s.x) * (e.x - s.x) + (p.y - s.y) * (e.y - s.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((p.x - (s.x + t * (e.x - s.x))) ** 2 + (p.y - (s.y + t * (e.y - s.y))) ** 2);
};

const chainSegmentsToPoints = (segs: { start: Point, end: Point }[]): Point[] => {
  if (segs.length === 0) return [];
  if (segs.length === 1) return [segs[0].start, segs[0].end];
  
  const remaining = [...segs];
  const first = remaining.shift()!;
  const pts: Point[] = [first.start, first.end];
  
  let changed = true;
  while (changed && remaining.length > 0) {
    changed = false;
    const lastPt = pts[pts.length - 1];
    const firstPt = pts[0];
    
    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i];
      const tolerance = 0.05; // 5cm tolerance
      
      // Connect to lastPt
      if (Math.hypot(seg.start.x - lastPt.x, seg.start.y - lastPt.y) < tolerance) {
        pts.push(seg.end);
        remaining.splice(i, 1);
        changed = true;
        break;
      }
      if (Math.hypot(seg.end.x - lastPt.x, seg.end.y - lastPt.y) < tolerance) {
        pts.push(seg.start);
        remaining.splice(i, 1);
        changed = true;
        break;
      }
      // Connect to firstPt
      if (Math.hypot(seg.start.x - firstPt.x, seg.start.y - firstPt.y) < tolerance) {
        pts.unshift(seg.end);
        remaining.splice(i, 1);
        changed = true;
        break;
      }
      if (Math.hypot(seg.end.x - firstPt.x, seg.end.y - firstPt.y) < tolerance) {
        pts.unshift(seg.start);
        remaining.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  
  while (remaining.length > 0) {
    const seg = remaining.shift()!;
    pts.push(seg.start, seg.end);
  }
  
  return pts;
};

const traceContour = (grid: boolean[][], startX: number, startY: number): Point[] => {
  const height = grid.length;
  const width = grid[0].length;
  const contour: Point[] = [];
  
  const dxs = [0, 1, 1, 1, 0, -1, -1, -1];
  const dys = [-1, -1, 0, 1, 1, 1, 0, -1];

  let cx = startX;
  let cy = startY;
  let sDir = 6;

  contour.push({ x: cx, y: cy });

  let loops = 0;
  const maxLoops = 15000;
  let firstMove = true;
  let startX2 = -1, startY2 = -1;

  while (loops < maxLoops) {
    loops++;
    let foundNext = false;
    let nextX = -1, nextY = -1;
    let nextDirIdx = -1;

    for (let i = 0; i < 8; i++) {
      const idx = (sDir + i) % 8;
      const nx = cx + dxs[idx];
      const ny = cy + dys[idx];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (grid[ny][nx]) {
          nextX = nx;
          nextY = ny;
          nextDirIdx = idx;
          foundNext = true;
          break;
        }
      }
    }

    if (!foundNext) {
      break;
    }

    if (cx === startX && cy === startY && !firstMove) {
      break;
    }

    if (firstMove) {
      startX2 = nextX;
      startY2 = nextY;
      firstMove = false;
    } else if (nextX === startX2 && nextY === startY2 && cx === startX) {
      break;
    }

    contour.push({ x: nextX, y: nextY });
    sDir = (nextDirIdx + 5) % 8;
    cx = nextX;
    cy = nextY;
  }

  return contour;
};

const simplifyPolygon = (points: Point[], epsilon: number): Point[] => {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = distanceToSegmentPt(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const results1 = simplifyPolygon(points.slice(0, index + 1), epsilon);
    const results2 = simplifyPolygon(points.slice(index), epsilon);
    return results1.slice(0, results1.length - 1).concat(results2);
  } else {
    return [points[0], points[end]];
  }
};

const getRgbaFromColor = (colorStr: string, alpha: number) => {
  if (!colorStr) return `rgba(99, 102, 241, ${alpha})`;
  const str = colorStr.trim();
  if (str.startsWith('#')) {
    const hex = str.replace('#', '');
    let r = 0, g = 0, b = 0;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    } else {
      return str;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } else if (str.startsWith('rgb')) {
    const match = str.match(/\d+/g);
    if (match && match.length >= 3) {
      const aVal = match.length >= 4 ? parseFloat(match[3]) * alpha : alpha;
      return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${aVal})`;
    }
  }
  return str;
};

const drawHatchPattern = (ctx: CanvasRenderingContext2D, entity: any, zoom: number) => {
    const { pattern, scale, angle, color, points, holes, sfumatura = 0, backgroundColor, isLinear, bimWidth } = entity;
    if (!points || (points.length < 2) || (!isLinear && points.length < 3)) return;

    ctx.save();
    
    // Set clipping path
    ctx.beginPath();
    
    if (isLinear && points.length >= 2) {
      const thickness = bimWidth || 15;
      const sideSign = (entity as any).sideSign || 1;
      const forward: Point[] = [];
      const backward: Point[] = [];
      
      for (let i = 0; i < points.length - 1; i++) {
        const pA = points[i];
        const pB = points[i+1];
        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const L = Math.sqrt(dx*dx + dy*dy) || 1;
        const nx = -dy / L;
        const ny = dx / L;
        const off = (thickness / 2) * sideSign;
        
        if (i === 0) {
          forward.push({ x: pA.x + nx * off, y: pA.y + ny * off });
          backward.push({ x: pA.x - nx * off, y: pA.y - ny * off });
        }
        forward.push({ x: pB.x + nx * off, y: pB.y + ny * off });
        backward.push({ x: pB.x - nx * off, y: pB.y - ny * off });
      }
      
      ctx.moveTo(forward[0].x, forward[0].y);
      for (let i = 1; i < forward.length; i++) ctx.lineTo(forward[i].x, forward[i].y);
      for (let i = backward.length - 1; i >= 0; i--) ctx.lineTo(backward[i].x, backward[i].y);
      ctx.closePath();
    } else {
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
    }
    
    if (holes && holes.length > 0 && !isLinear) {
        holes.forEach((hole: Point[]) => {
            if (hole.length < 3) return;
            ctx.moveTo(hole[0].x, hole[0].y);
            for (let i = 1; i < hole.length; i++) {
                ctx.lineTo(hole[i].x, hole[i].y);
            }
            ctx.closePath();
        });
    }
    
    ctx.clip('evenodd');


    // Draw background color if present (important for BIM areas)
    if (backgroundColor) {
        ctx.fillStyle = backgroundColor;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        if (holes) {
            holes.forEach((hole: Point[]) => {
                ctx.moveTo(hole[0].x, hole[0].y);
                for(let i=1; i<hole.length; i++) ctx.lineTo(hole[i].x, hole[i].y);
                ctx.closePath();
            });
        }
        ctx.fill('evenodd');
    }

    // If solid fill and no background was drawn yet, handle solid pattern
    if (pattern?.toLowerCase() === 'solid') {
        if (!backgroundColor) { // Only if not already filled by background
            if (sfumatura > 0) {
                // Calculate polygon center and bounds
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                for (const p of points) {
                    if (p.x < minX) minX = p.x;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.y > maxY) maxY = p.y;
                }
                const cx = (minX + maxX) / 2;
                const cy = (minY + maxY) / 2;
                const diag = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
                const halfDiag = Math.max(10, diag / 2);

                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, halfDiag);
                const startColor = getRgbaFromColor(color || '#000000', 1.0);
                const endOpacity = Math.max(0, 1 - (sfumatura / 100));
                const endColor = getRgbaFromColor(color || '#000000', endOpacity);
                grad.addColorStop(0, startColor);
                grad.addColorStop(1, endColor);
                ctx.fillStyle = grad;
                ctx.fill('evenodd');
            } else {
                ctx.fillStyle = color || 'rgba(99, 102, 241, 0.45)';
                ctx.fill('evenodd');
            }
        }
        ctx.restore();
        return;
    }

  // Draw optional light background coloring if no specific background color was provided
  if (!backgroundColor) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.015)';
    ctx.fill();
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const diag = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
  const halfDiag = Math.max(50, diag / 2);

  ctx.translate(cx, cy);
  ctx.rotate((angle || 0) * Math.PI / 180);

  ctx.strokeStyle = color || '#3b82f6';
  ctx.lineWidth = Math.max(1.0, 1.5 / zoom);
  ctx.fillStyle = color || '#3b82f6';
  ctx.setLineDash([]);

  const step = Math.max(2, scale || 14);
  const pat = (pattern || 'ansi31').toLowerCase();

  // HEAVY PERFORMANCE FIX: If user is zoomed out and patterns are too tight, 
  // skip pattern rendering to save thousands of lineTo calls.
  if (step * zoom < 1.5) {
      if (pattern?.toLowerCase() !== 'solid') {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
              ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.closePath();
          ctx.fillStyle = color || 'rgba(99, 102, 241, 0.45)';
          ctx.globalAlpha = 0.25;
          ctx.fill();
          ctx.globalAlpha = 1.0;
      }
      ctx.restore();
      return;
  }

  const isInk = entity.mode === 'ink' || entity.mode === 'pencil';
  const originalMoveTo = ctx.moveTo;
  const originalLineTo = ctx.lineTo;
  const originalArc = ctx.arc;
  const originalFillRect = ctx.fillRect;
  const originalEllipse = ctx.ellipse;

  if (isInk) {
    let curX = 0;
    let curY = 0;
    (ctx as any).moveTo = function(x: number, y: number) {
      curX = x;
      curY = y;
      originalMoveTo.call(ctx, x, y);
    };
    (ctx as any).lineTo = function(x: number, y: number) {
      const dx = x - curX;
      const dy = y - curY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0.05) {
        const stepCount = Math.max(2, Math.floor(len / 3));
        const nx = -dy / len;
        const ny = dx / len;
        originalMoveTo.call(ctx, curX, curY);
        for (let i = 1; i <= stepCount; i++) {
          const t = i / stepCount;
          const wave = Math.sin(t * Math.PI * 6 + curX * 0.2) * 0.3 + Math.cos(t * Math.PI * 4 + curY * 0.2) * 0.3;
          const jiggleX = nx * wave * (step * 0.1);
          const jiggleY = ny * wave * (step * 0.1);
          originalLineTo.call(ctx, curX + dx * t + jiggleX, curY + dy * t + jiggleY);
        }
      } else {
        originalLineTo.call(ctx, x, y);
      }
      curX = x;
      curY = y;
    };
    (ctx as any).arc = function(x: number, y: number, r: number, sa: number, ea: number, ccw?: boolean) {
        const wave = Math.sin(x * 0.1) + Math.cos(y * 0.1);
        const jx = wave * (step * 0.05);
        const jy = -wave * (step * 0.05);
        originalArc.call(ctx, x + jx, y + jy, r * (1 + 0.1 * wave), sa, ea, ccw);
    };
    (ctx as any).fillRect = function(x: number, y: number, w: number, h: number) {
        const wave = Math.sin(x * 0.1) + Math.cos(y * 0.1);
        const jx = wave * (step * 0.05);
        const jy = -wave * (step * 0.05);
        originalFillRect.call(ctx, x + jx, y + jy, w * (1 + 0.1 * wave), h * (1 - 0.1 * wave));
    };
    (ctx as any).ellipse = function(x: number, y: number, rx: number, ry: number, rot: number, sa: number, ea: number, ccw?: boolean) {
        const wave = Math.sin(x * 0.1) + Math.cos(y * 0.1);
        const jx = wave * (step * 0.05);
        const jy = -wave * (step * 0.05);
        originalEllipse.call(ctx, x + jx, y + jy, rx * (1 + 0.1 * wave), ry * (1 - 0.1 * wave), rot, sa, ea, ccw);
    };
  }

  try {
    if (pat === 'ansi31') {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      ctx.moveTo(x, -halfDiag);
      ctx.lineTo(x, halfDiag);
    }
    ctx.stroke();
  } else if (pat === 'ansi32') {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      ctx.moveTo(x, -halfDiag);
      ctx.lineTo(x, halfDiag);
      ctx.moveTo(x + step * 0.25, -halfDiag);
      ctx.lineTo(x + step * 0.25, halfDiag);
    }
    ctx.stroke();
  } else if (pat === 'ansi33') {
    ctx.rotate(Math.PI / 4);
    for (let x = -halfDiag, idx = 0; x <= halfDiag; x += step / 2, idx++) {
      ctx.beginPath();
      if (idx % 2 === 0) {
        ctx.setLineDash([]);
      } else {
        ctx.setLineDash([Math.max(1, step * 0.15), Math.max(1, step * 0.15)]);
      }
      ctx.moveTo(x, -halfDiag);
      ctx.lineTo(x, halfDiag);
      ctx.stroke();
    }
  } else if (pat === 'ansi34') {
    ctx.rotate(Math.PI / 4);
    ctx.setLineDash([Math.max(1, step * 0.2), Math.max(1, step * 0.2)]);
    ctx.beginPath();
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      ctx.moveTo(x, -halfDiag);
      ctx.lineTo(x, halfDiag);
    }
    ctx.stroke();
  } else if (pat === 'grid') {
    ctx.beginPath();
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      ctx.moveTo(x, -halfDiag);
      ctx.lineTo(x, halfDiag);
    }
    for (let y = -halfDiag; y <= halfDiag; y += step) {
      ctx.moveTo(-halfDiag, y);
      ctx.lineTo(halfDiag, y);
    }
    ctx.stroke();
  } else if (pat === 'cross') {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      ctx.moveTo(x, -halfDiag);
      ctx.lineTo(x, halfDiag);
    }
    for (let y = -halfDiag; y <= halfDiag; y += step) {
      ctx.moveTo(-halfDiag, y);
      ctx.lineTo(halfDiag, y);
    }
    ctx.stroke();
  } else if (pat === 'dots') {
    const r = Math.max(0.5, step / 14);
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      for (let y = -halfDiag; y <= halfDiag; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pat === 'stripe') {
    ctx.beginPath();
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      ctx.moveTo(x, -halfDiag);
      ctx.lineTo(x, halfDiag);
    }
    ctx.stroke();
  } else if (pat === 'horizontal') {
    ctx.beginPath();
    for (let y = -halfDiag; y <= halfDiag; y += step) {
      ctx.moveTo(-halfDiag, y);
      ctx.lineTo(halfDiag, y);
    }
    ctx.stroke();
  } else if (pat === 'zigzag') {
    ctx.beginPath();
    const wl = step * 0.9;
    for (let y = -halfDiag; y <= halfDiag; y += step) {
      ctx.moveTo(-halfDiag, y);
      let up = true;
      for (let x = -halfDiag; x <= halfDiag; x += wl) {
        ctx.lineTo(x, up ? y + step * 0.25 : y - step * 0.25);
        up = !up;
      }
    }
    ctx.stroke();
  } else if (pat === 'waves') {
    ctx.beginPath();
    const wl = step;
    for (let y = -halfDiag; y <= halfDiag; y += step) {
      ctx.moveTo(-halfDiag, y);
      for (let x = -halfDiag; x <= halfDiag; x += 2) {
        const sineY = y + Math.sin(x / (wl / 4.5)) * (step * 0.2);
        ctx.lineTo(x, sineY);
      }
    }
    ctx.stroke();
  } else if (pat === 'brick') {
    const bHeight = step;
    const bWidth = step * 2.2;
    ctx.beginPath();
    for (let y = -halfDiag; y <= halfDiag; y += bHeight) {
      ctx.moveTo(-halfDiag, y);
      ctx.lineTo(halfDiag, y);
    }
    let rowIndex = 0;
    for (let y = -halfDiag; y <= halfDiag; y += bHeight) {
      const offsetX = (rowIndex % 2 === 0) ? 0 : bWidth / 2;
      for (let x = -halfDiag + offsetX - bWidth; x <= halfDiag + bWidth; x += bWidth) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + bHeight);
      }
      rowIndex++;
    }
    ctx.stroke();
  } else if (pat === 'checker') {
    for (let x = -halfDiag, i = 0; x <= halfDiag; x += step, i++) {
      for (let y = -halfDiag, j = 0; y <= halfDiag; y += step, j++) {
        if ((i + j) % 2 === 0) {
          ctx.fillRect(x, y, step, step);
        }
      }
    }
  } else if (pat === 'triangles') {
    const h = step * Math.sin(Math.PI / 3);
    for (let y = -halfDiag; y <= halfDiag; y += h) {
      for (let x = -halfDiag; x <= halfDiag; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + step / 2, y + h);
        ctx.lineTo(x - step / 2, y + h);
        ctx.closePath();
        ctx.stroke();
      }
    }
  } else if (pat === 'honey' || pat === 'hexagon') {
    const r = step / 1.73;
    const h = r * Math.sin(Math.PI / 3);
    for (let y = -halfDiag - r; y <= halfDiag + r; y += h * 2) {
      let isAlt = false;
      for (let x = -halfDiag - r; x <= halfDiag + r; x += r * 1.5) {
        ctx.beginPath();
        const startOffset = isAlt ? h : 0;
        for (let side = 0; side < 6; side++) {
          const rad = (side * Math.PI) / 3;
          const px = x + r * Math.cos(rad);
          const py = y + startOffset + r * Math.sin(rad);
          if (side === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        isAlt = !isAlt;
      }
    }
  } else if (pat.startsWith('tile_')) {
    // Format: tile_50x40
    const dims = pat.split('_')[1].split('x');
    const tileW = parseInt(dims[0]) || 50;
    const tileH = parseInt(dims[1]) || 40;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = Math.max(0.8, 1.2 / zoom);
    ctx.beginPath();
    for (let x = -halfDiag; x <= halfDiag; x += tileW) {
      ctx.moveTo(x, -halfDiag);
      ctx.lineTo(x, halfDiag);
    }
    for (let y = -halfDiag; y <= halfDiag; y += tileH) {
      ctx.moveTo(-halfDiag, y);
      ctx.lineTo(halfDiag, y);
    }
    ctx.stroke();
  } else if (pat === 'parquet_strip') {
    const stripW = step * 4;
    const stripH = step;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = Math.max(0.6, 0.9 / zoom);
    ctx.beginPath();
    for (let y = -halfDiag; y <= halfDiag; y += stripH) {
      ctx.moveTo(-halfDiag, y);
      ctx.lineTo(halfDiag, y);
      const rowOffset = (Math.floor(y / stripH) % 3) * (stripW / 3);
      for (let x = -halfDiag + rowOffset - stripW; x <= halfDiag; x += stripW) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + stripH);
      }
    }
    ctx.stroke();
  } else if (pat === 'parquet_herringbone') {
    const w = step * 1.5;
    const h = step * 4;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = Math.max(0.7, 1.0 / zoom);
    for (let y = -halfDiag - h; y <= halfDiag + h; y += w * 2) {
      for (let x = -halfDiag - h; x <= halfDiag + h; x += h) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.strokeRect(0, 0, w, h);
        ctx.restore();
        ctx.save();
        ctx.translate(x + h/2, y + w);
        ctx.rotate(-Math.PI / 4);
        ctx.strokeRect(0, 0, w, h);
        ctx.restore();
      }
    }
  } else if (pat === 'brick_stretcher' || pat === 'brick_bond') {
    const bW = step * 2.5;
    const bH = step;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = Math.max(0.8, 1.2 / zoom);
    ctx.beginPath();
    for (let y = -halfDiag; y <= halfDiag; y += bH) {
      ctx.moveTo(-halfDiag, y);
      ctx.lineTo(halfDiag, y);
      const isShifted = (Math.floor(y / bH) % 2 !== 0);
      const offset = isShifted ? bW / 2 : 0;
      for (let x = -halfDiag - bW + offset; x <= halfDiag; x += bW) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + bH);
      }
    }
    ctx.stroke();
  } else if (pat === 'stone_random') {
    for (let i = 0; i < 50; i++) {
       const x = (Math.random() - 0.5) * diag;
       const y = (Math.random() - 0.5) * diag;
       const sides = 5 + Math.floor(Math.random() * 3);
       const r = step * (0.5 + Math.random());
       ctx.beginPath();
       for (let s = 0; s < sides; s++) {
         const a = (s * Math.PI * 2) / sides + Math.random() * 0.5;
         const px = x + r * Math.cos(a);
         const py = y + r * Math.sin(a);
         if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
       }
       ctx.closePath();
       ctx.stroke();
    }
  } else if (pat === 'concrete') {
    for (let i = 0; i < 200; i++) {
      const x = (Math.random() - 0.5) * diag;
      const y = (Math.random() - 0.5) * diag;
      const r = 0.2 + Math.random() * 0.8;
      ctx.beginPath();
      ctx.arc(x, y, r / zoom, 0, Math.PI * 2);
      ctx.fill();
      if (i % 20 === 0) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 5, y + (Math.random() - 0.5) * 5);
        ctx.stroke();
      }
    }
  } else if (pat === 'gravel') {
    for (let i = 0; i < 100; i++) {
      const x = (Math.random() - 0.5) * diag;
      const y = (Math.random() - 0.5) * diag;
      const r = (2 + Math.random() * 3) / zoom;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (pat === 'sand') {
    for (let i = 0; i < 400; i++) {
      const x = (Math.random() - 0.5) * diag;
      const y = (Math.random() - 0.5) * diag;
      ctx.fillRect(x, y, 0.5/zoom, 0.5/zoom);
    }
  } else if (pat === 'insulation') {
    const w = step * 1.5;
    ctx.beginPath();
    for (let y = -halfDiag; y <= halfDiag; y += w) {
       ctx.moveTo(-halfDiag, y);
       for (let x = -halfDiag; x <= halfDiag; x += w) {
          ctx.lineTo(x + w/2, y + w/2);
          ctx.lineTo(x + w, y);
       }
    }
    ctx.stroke();
  } else if (pat === 'wood_veneer') {
    for (let y = -halfDiag; y <= halfDiag; y += step * 0.5) {
      ctx.beginPath();
      ctx.moveTo(-halfDiag, y);
      for (let x = -halfDiag; x <= halfDiag; x += 10) {
        const vy = y + Math.sin(x / 50) * 5 + (Math.random() - 0.5) * 2;
        ctx.lineTo(x, vy);
      }
      ctx.stroke();
    }
  } else if (pat === 'marble') {
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.globalAlpha = 0.3;
      let x = (Math.random() - 0.5) * diag;
      let y = (Math.random() - 0.5) * diag;
      ctx.moveTo(x, y);
      for (let j = 0; j < 20; j++) {
        x += (Math.random() - 0.5) * 30;
        y += (Math.random() - 0.5) * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  } else if (pat === 'metal_deck') {
    const w = step * 2;
    ctx.beginPath();
    for (let x = -halfDiag; x <= halfDiag; x += w) {
      ctx.moveTo(x, -halfDiag);
      ctx.lineTo(x, halfDiag);
      ctx.moveTo(x + w * 0.3, -halfDiag);
      ctx.lineTo(x + w * 0.3, halfDiag);
      ctx.setLineDash([2, 2]);
      ctx.moveTo(x + w * 0.6, -halfDiag);
      ctx.lineTo(x + w * 0.6, halfDiag);
      ctx.setLineDash([]);
    }
    ctx.stroke();
  } else if (pat === 'gravel') {
    const size = step * 0.35;
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      for (let y = -halfDiag; y <= halfDiag; y += step) {
        const rx = x + (Math.sin(x * y) * step * 0.15);
        const ry = y + (Math.cos(x + y) * step * 0.15);
        ctx.beginPath();
        ctx.moveTo(rx - size * 0.5, ry - size * 0.2);
        ctx.lineTo(rx + size * 0.1, ry - size * 0.5);
        ctx.lineTo(rx + size * 0.5, ry + size * 0.1);
        ctx.lineTo(rx - size * 0.1, ry + size * 0.4);
        ctx.closePath();
        ctx.stroke();
      }
    }
  } else if (pat === 'cobble') {
    const r = step * 0.33;
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      for (let y = -halfDiag; y <= halfDiag; y += step) {
        const rx = x + (Math.sin(x * y) * step * 0.12);
        const ry = y + (Math.cos(x + y) * step * 0.12);
        ctx.beginPath();
        ctx.ellipse(rx, ry, r * 1.15, r * 0.75, Math.sin(x * y), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else if (pat === 'plaid') {
    ctx.beginPath();
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      ctx.moveTo(x, -halfDiag); ctx.lineTo(x, halfDiag);
      ctx.moveTo(x + step * 0.2, -halfDiag); ctx.lineTo(x + step * 0.2, halfDiag);
    }
    for (let y = -halfDiag; y <= halfDiag; y += step) {
      ctx.moveTo(-halfDiag, y); ctx.lineTo(halfDiag, y);
      ctx.moveTo(-halfDiag, y + step * 0.2); ctx.lineTo(halfDiag, y + step * 0.2);
    }
    ctx.stroke();
  } else if (pat === 'stars') {
    const r = step * 0.28;
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      for (let y = -halfDiag; y <= halfDiag; y += step) {
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.2, y - r * 0.2);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x + r * 0.2, y + r * 0.2);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r * 0.2, y + r * 0.2);
        ctx.lineTo(x - r, y);
        ctx.lineTo(x - r * 0.2, y - r * 0.2);
        ctx.closePath();
        ctx.stroke();
      }
    }
  } else if (pat === 'basket') {
    const half = step / 2;
    ctx.beginPath();
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      for (let y = -halfDiag; y <= halfDiag; y += step) {
        if (Math.floor(x/step + y/step) % 2 === 0) {
          ctx.moveTo(x, y + half * 0.3); ctx.lineTo(x + step, y + half * 0.3);
          ctx.moveTo(x, y + half * 1.0); ctx.lineTo(x + step, y + half * 1.0);
          ctx.moveTo(x, y + half * 1.7); ctx.lineTo(x + step, y + half * 1.7);
        } else {
          ctx.moveTo(x + half * 0.3, y); ctx.lineTo(x + half * 0.3, y + step);
          ctx.moveTo(x + half * 1.0, y); ctx.lineTo(x + half * 1.0, y + step);
          ctx.moveTo(x + half * 1.7, y); ctx.lineTo(x + half * 1.7, y + step);
        }
      }
    }
    ctx.stroke();
  } else {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    for (let x = -halfDiag; x <= halfDiag; x += step) {
      ctx.moveTo(x, -halfDiag);
      ctx.lineTo(x, halfDiag);
    }
    ctx.stroke();
  }

  } finally {
    if (isInk) {
      (ctx as any).moveTo = originalMoveTo;
      (ctx as any).lineTo = originalLineTo;
      (ctx as any).arc = originalArc;
      (ctx as any).fillRect = originalFillRect;
      (ctx as any).ellipse = originalEllipse;
    }
  }

  ctx.restore();
};

const expandPolygon = (points: Point[], amount: number): Point[] => {
  const N = points.length;
  if (N < 3) return points;

  // 1. Calculate signed area to determine winding order (shoelace formula)
  let signedArea = 0;
  for (let i = 0; i < N; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % N];
    signedArea += (p1.x * p2.y - p2.x * p1.y);
  }
  const isCCW = signedArea > 0;

  const expanded: Point[] = [];

  for (let i = 0; i < N; i++) {
    const P = points[i];
    const Prev = points[(i - 1 + N) % N];
    const Next = points[(i + 1) % N];

    const dx1 = P.x - Prev.x;
    const dy1 = P.y - Prev.y;
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

    const dx2 = Next.x - P.x;
    const dy2 = Next.y - P.y;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    const u1 = len1 > 0 ? { x: dx1 / len1, y: dy1 / len1 } : { x: 0, y: 0 };
    const u2 = len2 > 0 ? { x: dx2 / len2, y: dy2 / len2 } : { x: 0, y: 0 };

    // Outward unit normal for each of the two adjacent segments
    const n1 = isCCW ? { x: u1.y, y: -u1.x } : { x: -u1.y, y: u1.x };
    const n2 = isCCW ? { x: u2.y, y: -u2.x } : { x: -u2.y, y: u2.x };

    // Average normal at vertex (pointing outwards)
    const vnX = n1.x + n2.x;
    const vnY = n1.y + n2.y;
    const lenVN = Math.sqrt(vnX * vnX + vnY * vnY);

    const vn = lenVN > 0.01 ? { x: vnX / lenVN, y: vnY / lenVN } : n1;

    expanded.push({
      x: P.x + vn.x * amount,
      y: P.y + vn.y * amount
    });
  }

  return expanded;
};

const findBoundaryPolygon = (
  clickPoint: Point,
  entities: Entity[],
  view: any,
  widthVal: number,
  heightVal: number,
  screenToCanvas: (x: number, y: number) => Point,
  layers: Layer[]
): { points: Point[], holes?: Point[][]; gapHealed?: boolean; maxGapDetected?: number } | null => {
  const width = Math.round(widthVal);
  const height = Math.round(heightVal);
  // Pre-allocate typed arrays once to prevent micro-allocations in levels and avoid GC freezes
  const totalPixels = width * height;
  const filled = new Uint8Array(totalPixels);
  const queueX = new Int32Array(totalPixels);
  const queueY = new Int32Array(totalPixels);
  const gridValues = new Float32Array(totalPixels);

  // We try multiple stroke thicknesses dynamically.
  // Level 1: 2.0 (standard, very precise)
  // Level 2: 5.0 (welds slight 3-5px gaps)
  // Level 3: 10.0 (welds gaps up to 10px)
  // Level 4: 18.0 (welds gaps up to 18px)
  // Level 5: 32.0 (welds quite large gaps up to 32px of human imperfections)
  const strokeWidthLevels = [2.0, 5.0, 10.0, 18.0, 32.0];

  for (let levelIdx = 0; levelIdx < strokeWidthLevels.length; levelIdx++) {
    const physicalStrokeWidth = strokeWidthLevels[levelIdx];

    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const oCtx = offCanvas.getContext('2d');
    if (!oCtx) continue;

    oCtx.fillStyle = '#ffffff';
    oCtx.fillRect(0, 0, width, height);

    oCtx.save();
    oCtx.translate(view.pan.x, view.pan.y);
    oCtx.scale(view.zoom, view.zoom);

    oCtx.strokeStyle = '#000000';
    // Draw walls/lines using rounded caps so wider strokes of adjacent lines fuse together cleanly, sealing gaps.
    oCtx.lineWidth = physicalStrokeWidth / view.zoom; 
    oCtx.lineJoin = 'round';
    oCtx.lineCap = 'round';

    entities.forEach(ent => {
      const layer = layers.find(l => l.id === ent.layer);
      if (layer && (!layer.visible || layer.frozen)) return;
      if (ent.hideIn2D) return;
      if (
        ent.type === 'dimension' ||
        ent.type === 'text' ||
        ent.type === 'point' ||
        ent.type === 'hatch' ||
        ent.isFilo ||
        ent.layer === 'Fili' ||
        ent.groupId ||
        ent.templateId
      ) {
        return;
      }

      if (ent.isBIM) {
        if (ent.bimType !== 'door' && ent.bimType !== 'window' && ent.bimType !== 'wall') {
          return;
        }
      }

      oCtx.beginPath();
      let didChangeWidth = false;
      if (ent.isBIM && ent.bimType === 'wall') {
        const thickness = (ent as any).bimWidth || 15;
        oCtx.save();
        // Also increase wall thickness on off-screen to bridge door/window gaps
        oCtx.lineWidth = thickness + (physicalStrokeWidth - 2.0) / view.zoom;
        oCtx.lineJoin = 'round';
        oCtx.lineCap = 'round';
        didChangeWidth = true;
      }

      if (ent.type === 'line') {
        if (ent.isFreehand && ent.inkPoints && ent.inkPoints.length > 0) {
          oCtx.moveTo(ent.inkPoints[0].x, ent.inkPoints[0].y);
          for (let i = 1; i < ent.inkPoints.length; i++) {
            oCtx.lineTo(ent.inkPoints[i].x, ent.inkPoints[i].y);
          }
        } else {
          // ALWAYS use theoretical start/end for boundary detection, ignoring irregular ink strokes
          oCtx.moveTo(ent.start.x, ent.start.y);
          oCtx.lineTo(ent.end.x, ent.end.y);
        }
      } else if (ent.type === 'circle') {
        oCtx.arc(ent.center.x, ent.center.y, ent.radius, 0, Math.PI * 2);
      } else if (ent.type === 'arc') {
        oCtx.arc(ent.center.x, ent.center.y, ent.radius, ent.startAngle * Math.PI / 180, ent.endAngle * Math.PI / 180);
      } else if (ent.type === 'rectangle') {
        oCtx.rect(ent.p1.x, ent.p1.y, ent.p2.x - ent.p1.x, ent.p2.y - ent.p1.y);
      }
      oCtx.stroke();
      if (didChangeWidth) {
        oCtx.restore();
      }
    });
    oCtx.restore();

    let startX = Math.round(clickPoint.x);
    let startY = Math.round(clickPoint.y);

    if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
      continue;
    }

    const imgData = oCtx.getImageData(0, 0, width, height);
    const data = imgData.data;

    const isWhite = (x: number, y: number): boolean => {
      const idx = (y * width + x) * 4;
      return data[idx] > 220 && data[idx + 1] > 220 && data[idx + 2] > 220;
    };

    // If the click point was directly drawn over due to line thickening, search spirally for the closest white pixel cavity.
    if (!isWhite(startX, startY)) {
      let foundWhite = false;
      const searchRadius = Math.max(14, Math.ceil(physicalStrokeWidth));
      for (let r = 1; r <= searchRadius && !foundWhite; r++) {
        for (let dx = -r; dx <= r && !foundWhite; dx++) {
          for (let dy = -r; dy <= r && !foundWhite; dy++) {
            if (Math.abs(dx) === r || Math.abs(dy) === r) {
              const nx = startX + dx;
              const ny = startY + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                if (isWhite(nx, ny)) {
                  startX = nx;
                  startY = ny;
                  foundWhite = true;
                }
              }
            }
          }
        }
      }
      if (!foundWhite) {
        continue;
      }
    }

    // Reset filled typed array for this level
    filled.fill(0);

    queueX[0] = startX;
    queueY[0] = startY;
    filled[startY * width + startX] = 1;

    let head = 0;
    let tail = 1;
    let touchesBorder = false;
    const maxPixels = Math.floor(totalPixels * 0.70); // Detect leak earlier

    while (head < tail) {
      const cx = queueX[head];
      const cy = queueY[head];
      head++;

      if (tail > maxPixels) {
        touchesBorder = true;
        break;
      }

      if (cx === 0 || cx === width - 1 || cy === 0 || cy === height - 1) {
        touchesBorder = true;
      }

      // Check 4 neighbors
      // Right
      if (cx + 1 < width) {
        const idx = cy * width + (cx + 1);
        if (!filled[idx] && isWhite(cx + 1, cy)) {
          filled[idx] = 1;
          queueX[tail] = cx + 1;
          queueY[tail] = cy;
          tail++;
        }
      }
      // Left
      if (cx - 1 >= 0) {
        const idx = cy * width + (cx - 1);
        if (!filled[idx] && isWhite(cx - 1, cy)) {
          filled[idx] = 1;
          queueX[tail] = cx - 1;
          queueY[tail] = cy;
          tail++;
        }
      }
      // Down
      if (cy + 1 < height) {
        const idx = (cy + 1) * width + cx;
        if (!filled[idx] && isWhite(cx, cy + 1)) {
          filled[idx] = 1;
          queueX[tail] = cx;
          queueY[tail] = cy + 1;
          tail++;
        }
      }
      // Up
      if (cy - 1 >= 0) {
        const idx = (cy - 1) * width + cx;
        if (!filled[idx] && isWhite(cx, cy - 1)) {
          filled[idx] = 1;
          queueX[tail] = cx;
          queueY[tail] = cy - 1;
          tail++;
        }
      }
    }

    // If the flood-fill filled more than 50% of the screen or touched a border heavily, it leaked! Discard this level.
    if (touchesBorder && tail > (totalPixels * 0.50)) {
      continue;
    }

    // Found a valid closed cavity! Use d3-contour to find the multi-boundary of this filled region
    for (let i = 0; i < totalPixels; i++) {
      gridValues[i] = filled[i];
    }

    const contourGen = contours().size([width, height]).thresholds([0.5]);
    const results = contourGen(gridValues);
    if (!results || results.length === 0) continue;

    const multiPoly = results[0];
    if (!multiPoly || !multiPoly.coordinates || multiPoly.coordinates.length === 0) continue;

    let bestPoints: Point[] = [];
    let bestHoles: Point[][] = [];

    // Find the polygon that contains our click point
    const virtualClickPt = { x: startX, y: startY };
    for (const polygon of multiPoly.coordinates) {
      const outerRing = polygon[0].map((p: any) => ({ x: p[0], y: p[1] }));
      if (isPointInPolygon(virtualClickPt, outerRing)) {
        bestPoints = outerRing;
        bestHoles = polygon.slice(1).map((ring: any) => ring.map((p: any) => ({ x: p[0], y: p[1] })));
        break;
      }
    }

    // Fallback if click-point check had slight pixel-in-polygon precision errors
    if (bestPoints.length < 3 && multiPoly.coordinates.length > 0) {
      const firstPoly = multiPoly.coordinates[0];
      if (firstPoly && firstPoly[0] && firstPoly[0].length >= 3) {
        bestPoints = firstPoly[0].map((p: any) => ({ x: p[0], y: p[1] }));
        bestHoles = firstPoly.slice(1).map((ring: any) => ring.map((p: any) => ({ x: p[0], y: p[1] })));
      }
    }

    if (bestPoints.length < 3) continue;

    const processLoop = (loop: Point[]) => {
      const downsampled: Point[] = [];
      const step = Math.max(1, Math.floor(loop.length / 1000));
      for (let i = 0; i < loop.length; i += step) downsampled.push(loop[i]);
      if (downsampled.length > 0) downsampled.push(downsampled[0]);

      const simplified = simplifyPolygon(downsampled, 0.5);
      if (simplified.length > 1) {
        const p1 = simplified[0], pE = simplified[simplified.length - 1];
        if (Math.sqrt((p1.x - pE.x)**2 + (p1.y - pE.y)**2) < 1e-3) simplified.pop();
      }
      
      // Expand back outward by half the physical stroke thickness to offset the shrinkage/inner-boundary
      // shift caused by line thickening.
      const expansionFactor = Math.max(1.0, physicalStrokeWidth / 2.0);
      const expanded = expandPolygon(simplified, expansionFactor);
      const canvasPts = expanded.map(pt => screenToCanvas(pt.x, pt.y));
      const snapped = snapPolygonToGeometry(canvasPts, entities, layers);
      return cleanSnappedPolygon(snapped);
    };

    return {
      points: processLoop(bestPoints),
      holes: bestHoles.length > 0 ? bestHoles.map(processLoop).filter(h => h.length >= 3) : undefined,
      gapHealed: physicalStrokeWidth > 2.0,
      maxGapDetected: physicalStrokeWidth
    };
  }

  return null;
}

function getClosestPointOnPolyline(p: Point, polyline: Point[]): { point: Point; dist: number } {
  let closestPt = polyline[0];
  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const s = polyline[i];
    const e = polyline[i+1];
    const l2 = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
    if (l2 > 0) {
      let t = ((p.x - s.x) * (e.x - s.x) + (p.y - s.y) * (e.y - s.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      const proj = {
        x: s.x + t * (e.x - s.x),
        y: s.y + t * (e.y - s.y)
      };
      const dist = Math.sqrt((p.x - proj.x) ** 2 + (p.y - proj.y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closestPt = proj;
      }
    } else {
      const dist = Math.sqrt((p.x - s.x) ** 2 + (p.y - s.y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closestPt = s;
      }
    }
  }
  return { point: closestPt, dist: minDist };
}

function snapPolygonToGeometry(polyPoints: Point[], entities: Entity[], layers: Layer[]): Point[] {
  if (polyPoints.length < 3) return polyPoints;

  const landmarks: Point[] = [];
  
  // Exclude BIM elements, hatches, texts, and dimensions since they are not physical wall lines
  const physicalEntities = entities.filter(ent => {
    if (ent.type === 'hatch' || ent.type === 'text' || ent.type === 'dimension') return false;
    if (ent.isBIM && ent.bimType !== 'wall' && ent.bimType !== 'window' && ent.bimType !== 'door') return false;
    const layer = layers.find(l => l.id === ent.layer);
    return !(layer && (!layer.visible || layer.frozen));
  });

  physicalEntities.forEach(ent => {
    if (ent.type === 'line') {
      landmarks.push(ent.start);
      landmarks.push(ent.end);
      landmarks.push({ x: (ent.start.x + ent.end.x) / 2, y: (ent.start.y + ent.end.y) / 2 });
    } else if (ent.type === 'rectangle') {
      const p1 = ent.p1;
      const p2 = ent.p2;
      landmarks.push({ x: p1.x, y: p1.y });
      landmarks.push({ x: p2.x, y: p1.y });
      landmarks.push({ x: p2.x, y: p2.y });
      landmarks.push({ x: p1.x, y: p2.y });
    } else if (ent.type === 'circle') {
      landmarks.push(ent.center);
    } else if (ent.type === 'arc') {
      landmarks.push(ent.center);
      const startRad = (ent.startAngle || 0) * Math.PI / 180;
      const endRad = (ent.endAngle || 0) * Math.PI / 180;
      landmarks.push({
        x: ent.center.x + ent.radius * Math.cos(startRad),
        y: ent.center.y + ent.radius * Math.sin(startRad)
      });
      landmarks.push({
        x: ent.center.x + ent.radius * Math.cos(endRad),
        y: ent.center.y + ent.radius * Math.sin(endRad)
      });
    }
  });

  // Calculate intersections of visible architectural wall lines to snap exactly to corners
  for (let i = 0; i < physicalEntities.length; i++) {
    for (let j = i + 1; j < physicalEntities.length; j++) {
      const ent1 = physicalEntities[i];
      const ent2 = physicalEntities[j];
      if (ent1.type === 'line' && ent2.type === 'line') {
        const sect = getIntersection(ent1.start, ent1.end, ent2.start, ent2.end);
        if (sect) {
          landmarks.push(sect);
        }
      }
    }
  }

  // Deduplicate landmarks
  const uniqueLandmarks: Point[] = [];
  const seenLandmarks = new Set<string>();
  landmarks.forEach(p => {
    const key = `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    if (!seenLandmarks.has(key)) {
      seenLandmarks.add(key);
      uniqueLandmarks.push(p);
    }
  });

  // Snapping tolerance (e.g., 35 cm in real units / centimeters)
  const snapTolerance = 35;

  return polyPoints.map(p => {
    let closestPt = p;
    let minDist = Infinity;

    for (const lm of uniqueLandmarks) {
      const dist = Math.sqrt((p.x - lm.x) ** 2 + (p.y - lm.y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closestPt = lm;
      }
    }

    if (minDist <= snapTolerance) {
      return { x: closestPt.x, y: closestPt.y };
    }

    // Fallback: project onto nearest line segment to align with wall surfaces
    let closestProjPt = p;
    let minProjDist = Infinity;
    let closestIsFreehand = false;

    physicalEntities.forEach(ent => {
      if (ent.type === 'line') {
        if (ent.inkPoints && ent.inkPoints.length > 0) {
          // Hand-drawn curvy freehand lines
          const res = getClosestPointOnPolyline(p, ent.inkPoints);
          if (res.dist < minProjDist) {
            minProjDist = res.dist;
            closestProjPt = res.point;
            closestIsFreehand = true;
          }
        } else {
          // Standard straight lines
          const s = ent.start;
          const e = ent.end;
          const l2 = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
          if (l2 > 0) {
            let t = ((p.x - s.x) * (e.x - s.x) + (p.y - s.y) * (e.y - s.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            const proj = {
              x: s.x + t * (e.x - s.x),
              y: s.y + t * (e.y - s.y)
            };
            const dist = Math.sqrt((p.x - proj.x) ** 2 + (p.y - proj.y) ** 2);
            if (dist < minProjDist) {
              minProjDist = dist;
              closestProjPt = proj;
              closestIsFreehand = false;
            }
          }
        }
      }
    });

    // If the boundary vertex is close to a hand-drawn curve, snap to it with high precision
    // and bypass grid-rounding to keep the curve perfectly smooth and aligned!
    if (closestIsFreehand && minProjDist <= 80) {
      return closestProjPt;
    }

    if (minProjDist <= snapTolerance) {
      return { x: closestProjPt.x, y: closestProjPt.y };
    }

    // Default to nearest 5cm if completely floating to keep clean integer dimensions!
    return {
      x: Math.round(p.x / 5) * 5,
      y: Math.round(p.y / 5) * 5
    };
  });
}

function cleanSnappedPolygon(points: Point[]): Point[] {
  const cleaned: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (cleaned.length === 0) {
      cleaned.push(p);
    } else {
      const prev = cleaned[cleaned.length - 1];
      const dist = Math.sqrt((p.x - prev.x) ** 2 + (p.y - prev.y) ** 2);
      if (dist > 0.05) {
        cleaned.push(p);
      }
    }
  }
  if (cleaned.length > 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    const dist = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2);
    if (dist < 0.05) {
      cleaned.pop();
    }
  }
  return cleaned;
}

function getIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
    const denom = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
    if (Math.abs(denom) < 1e-10) return null; // Parallel

    const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denom;
    const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return {
            x: a.x + t * (b.x - a.x),
            y: a.y + t * (b.y - a.y)
        };
    }
    return null;
}

const isAngleInArc = (angle: number, startAngle: number, endAngle: number, tolerance: number = 0.05) => {
  const normAngle = normalizeAngle(angle);
  const normStart = normalizeAngle(startAngle);
  const normEnd = normalizeAngle(endAngle);
  
  let span = normEnd - normStart;
  if (span < 0) span += 360;
  
  let dist = normAngle - normStart;
  if (dist < 0) dist += 360;
  
  return dist <= span + tolerance || dist >= 360 - tolerance;
};

const getClockwiseDistance = (angle: number, start: number) => {
  let d = angle - start;
  while (d < 0) d += 360;
  while (d >= 360) d -= 360;
  return d;
};

const splitLineSegmentWithCircle = (
    start: Point,
    end: Point,
    center: Point,
    radius: number
): { outside: { start: Point, end: Point }[], inside: { start: Point, end: Point }[] } => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const a = dx * dx + dy * dy;
    
    if (a < 1e-6) {
        const dist = Math.sqrt((start.x - center.x) ** 2 + (start.y - center.y) ** 2);
        if (dist <= radius) {
            return { outside: [], inside: [{ start, end }] };
        } else {
            return { outside: [{ start, end }], inside: [] };
        }
    }
    
    const vx = start.x - center.x;
    const vy = start.y - center.y;
    const b = 2 * (vx * dx + vy * dy);
    const c = vx * vx + vy * vy - radius * radius;
    
    const discriminant = b * b - 4 * a * c;
    
    if (discriminant < 0) {
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const dist = Math.sqrt((midX - center.x) ** 2 + (midY - center.y) ** 2);
        if (dist <= radius) {
            return { outside: [], inside: [{ start, end }] };
        } else {
            return { outside: [{ start, end }], inside: [] };
        }
    }
    
    const sqrtD = Math.sqrt(discriminant);
    let t1 = (-b - sqrtD) / (2 * a);
    let t2 = (-b + sqrtD) / (2 * a);
    if (t1 > t2) {
        const temp = t1;
        t1 = t2;
        t2 = temp;
    }
    
    const t_in_start = Math.max(0, Math.min(1, t1));
    const t_in_end = Math.max(0, Math.min(1, t2));
    
    const outside: { start: Point, end: Point }[] = [];
    const inside: { start: Point, end: Point }[] = [];
    
    const epsilon = 1e-4;
    
    if (t_in_start < t_in_end - epsilon) {
        const p_in_start = { x: start.x + t_in_start * dx, y: start.y + t_in_start * dy };
        const p_in_end = { x: start.x + t_in_end * dx, y: start.y + t_in_end * dy };
        inside.push({ start: p_in_start, end: p_in_end });
        
        if (t_in_start > epsilon) {
            outside.push({ start, end: p_in_start });
        }
        if (t_in_end < 1 - epsilon) {
            outside.push({ start: p_in_end, end });
        }
    } else {
        outside.push({ start, end });
    }
    
    return { outside, inside };
};

const getArcSubsegmentsInsideAndOutsideEraser = (
  center: Point,
  radiusC: number,
  startAngle: number,
  endAngle: number,
  isCircle: boolean,
  eraserCenter: Point,
  eraserRadius: number
): {
  outside: { startAngle: number; endAngle: number }[];
  inside: { startAngle: number; endAngle: number }[];
} | null => {
  const d = Math.sqrt((center.x - eraserCenter.x) ** 2 + (center.y - eraserCenter.y) ** 2);
  
  if (d > radiusC + eraserRadius) {
      return null;
  }
  if (d + radiusC <= eraserRadius) {
      return { outside: [], inside: [{ startAngle, endAngle }] };
  }
  if (d + eraserRadius <= radiusC) {
      return null;
  }
  
  const x = (radiusC * radiusC - eraserRadius * eraserRadius + d * d) / (2 * d);
  if (Math.abs(x) >= radiusC) {
      return null;
  }
  
  const alpha = Math.atan2(eraserCenter.y - center.y, eraserCenter.x - center.x);
  const beta = Math.acos(x / radiusC);
  
  const I1 = normalizeAngle((alpha - beta) * 180 / Math.PI);
  const I2 = normalizeAngle((alpha + beta) * 180 / Math.PI);
  
  const A = normalizeAngle(startAngle);
  const B = normalizeAngle(endAngle);
  const L = isCircle ? 360 : getClockwiseDistance(B, A);
  
  const t1 = getClockwiseDistance(I1, A);
  const t2 = getClockwiseDistance(I2, A);
  
  const splits = [0, L];
  const epsilon = 0.05;
  
  if (t1 > epsilon && t1 < L - epsilon) {
      splits.push(t1);
  }
  if (t2 > epsilon && t2 < L - epsilon) {
      splits.push(t2);
  }
  
  splits.sort((a, b) => a - b);
  
  const keptIntervals: { start: number; end: number }[] = [];
  const insideIntervals: { start: number; end: number }[] = [];
  
  for (let i = 0; i < splits.length - 1; i++) {
      const s = splits[i];
      const e = splits[i + 1];
      if (e - s < epsilon) continue;
      
      const mid = (s + e) / 2;
      const angleMid = normalizeAngle(A + mid);
      
      if (!isAngleInArc(angleMid, I1, I2)) {
          keptIntervals.push({ start: s, end: e });
      } else {
          insideIntervals.push({ start: s, end: e });
      }
  }
  
  const mapIntervals = (intervals: { start: number; end: number }[]) => {
      if (intervals.length === 0) return [];
      
      if (isCircle && intervals.length > 1) {
          const first = intervals[0];
          const last = intervals[intervals.length - 1];
          if (Math.abs(first.start - 0) < epsilon && Math.abs(last.end - 360) < epsilon) {
              const merged = { start: last.start, end: first.end + 360 };
              const middle = intervals.slice(1, intervals.length - 1);
              const finalInts = [...middle, merged];
              return finalInts.map(interval => ({
                  startAngle: normalizeAngle(A + interval.start),
                  endAngle: normalizeAngle(A + interval.end)
              }));
          }
      }
      
      return intervals.map(interval => ({
          startAngle: normalizeAngle(A + interval.start),
          endAngle: normalizeAngle(A + interval.end)
      }));
  };
  
  return {
      outside: mapIntervals(keptIntervals),
      inside: mapIntervals(insideIntervals)
  };
};

export const getPaperSizeMm = (format: string): { w: number; h: number } => {
  switch (format.toUpperCase()) {
    case 'A4': return { w: 297, h: 210 };
    case 'A3': return { w: 420, h: 297 };
    case 'A2': return { w: 594, h: 420 };
    case 'A1': return { w: 841, h: 594 };
    case 'A0': return { w: 1189, h: 841 };
    default: return { w: 297, h: 210 };
  }
};

export const getTavolaDimensions = (tavola: { format: string; scale: number; unit: string }) => {
  const paper = getPaperSizeMm(tavola.format || 'A4');
  let factor = 1000;
  if (tavola.unit === 'cm') factor = 10;
  if (tavola.unit === 'mm') factor = 1;
  const scale = tavola.scale || 100;
  const w = paper.w * (scale / factor);
  const h = paper.h * (scale / factor);
  return { w, h };
};

export const getBIMSymbolEntities = (type: string, scale: number = 1): { type: 'line' | 'circle' | 'arc' | 'text'; start?: Point; end?: Point; center?: Point; radius?: number; startAngle?: number; endAngle?: number; text?: string; color?: string }[] => {
  const scaled = (val: number) => val * scale;
  const scaledPoint = (p?: Point) => p ? { x: scaled(p.x), y: scaled(p.y) } : undefined;

  const getBaseEntities = (): { type: 'line' | 'circle' | 'arc' | 'text'; start?: Point; end?: Point; center?: Point; radius?: number; startAngle?: number; endAngle?: number; text?: string; color?: string }[] => {
    switch (type) {
    case 'punto_luce': // X inside a circle
      return [
        { type: 'circle', center: { x: 0, y: 0 }, radius: 10 },
        { type: 'line', start: { x: -7.07, y: -7.07 }, end: { x: 7.07, y: 7.07 } },
        { type: 'line', start: { x: -7.07, y: 7.07 }, end: { x: 7.07, y: -7.07 } }
      ];
    case 'presa_standard': // semi circle with line
      return [
        { type: 'arc', center: { x: 0, y: 0 }, radius: 10, startAngle: 180, endAngle: 360 },
        { type: 'line', start: { x: -10, y: 0 }, end: { x: 10, y: 0 } },
        { type: 'line', start: { x: 0, y: 0 }, end: { x: 0, y: 10 } }
      ];
    case 'presa_schuko': // semi circle with line and double small lines
      return [
        { type: 'arc', center: { x: 0, y: 0 }, radius: 10, startAngle: 180, endAngle: 360 },
        { type: 'line', start: { x: -10, y: 0 }, end: { x: 10, y: 0 } },
        { type: 'line', start: { x: 0, y: 0 }, end: { x: 0, y: 10 } },
        { type: 'line', start: { x: -4, y: 0 }, end: { x: -4, y: -10 } },
        { type: 'line', start: { x: 4, y: 0 }, end: { x: 4, y: -10 } }
      ];
    case 'presa_tv': // Square with TV
      return [
        { type: 'line', start: { x: -10, y: -10 }, end: { x: 10, y: -10 } },
        { type: 'line', start: { x: 10, y: -10 }, end: { x: 10, y: 10 } },
        { type: 'line', start: { x: 10, y: 10 }, end: { x: -10, y: 10 } },
        { type: 'line', start: { x: -10, y: 10 }, end: { x: -10, y: -10 } },
        { type: 'text', text: 'TV', center: { x: 0, y: -2 } }
      ];
    case 'presa_dati': // Square with LAN
      return [
        { type: 'line', start: { x: -10, y: -10 }, end: { x: 10, y: -10 } },
        { type: 'line', start: { x: 10, y: -10 }, end: { x: 10, y: 10 } },
        { type: 'line', start: { x: 10, y: 10 }, end: { x: -10, y: 10 } },
        { type: 'line', start: { x: -10, y: 10 }, end: { x: -10, y: -10 } },
        { type: 'text', text: 'LAN', center: { x: 0, y: -2 } }
      ];
    case 'interruttore': // circle with one 45 deg line
      return [
        { type: 'circle', center: { x: 0, y: 0 }, radius: 4 },
        { type: 'line', start: { x: 2.83, y: -2.83 }, end: { x: 12, y: -12 } }
      ];
    case 'interruttore_bipolare': // circle with 45 line and 2 ticks
      return [
        { type: 'circle', center: { x: 0, y: 0 }, radius: 4 },
        { type: 'line', start: { x: 2.83, y: -2.83 }, end: { x: 12, y: -12 } },
        { type: 'line', start: { x: 6, y: -10 }, end: { x: 10, y: -6 } },
        { type: 'line', start: { x: 8, y: -12 }, end: { x: 12, y: -8 } }
      ];
    case 'deviatore': // circle with two 45 deg lines
      return [
        { type: 'circle', center: { x: 0, y: 0 }, radius: 4 },
        { type: 'line', start: { x: 2.83, y: -2.83 }, end: { x: 12, y: -12 } },
        { type: 'line', start: { x: -2.83, y: 2.83 }, end: { x: -12, y: 12 } }
      ];
    case 'invertitore': // circle with four 45 deg lines
      return [
        { type: 'circle', center: { x: 0, y: 0 }, radius: 4 },
        { type: 'line', start: { x: 2.83, y: -2.83 }, end: { x: 12, y: -12 } },
        { type: 'line', start: { x: -2.83, y: -2.83 }, end: { x: -12, y: -12 } },
        { type: 'line', start: { x: 2.83, y: 2.83 }, end: { x: 12, y: 12 } },
        { type: 'line', start: { x: -2.83, y: 2.83 }, end: { x: -12, y: 12 } }
      ];
    case 'pulsante': // double concentric circle
      return [
        { type: 'circle', center: { x: 0, y: 0 }, radius: 5 },
        { type: 'circle', center: { x: 0, y: 0 }, radius: 2 }
      ];
    case 'pulsante_tirante': // button with pull cord
      return [
        { type: 'circle', center: { x: 0, y: 0 }, radius: 5 },
        { type: 'circle', center: { x: 0, y: 0 }, radius: 2 },
        { type: 'line', start: { x: 0, y: 5 }, end: { x: 0, y: 16 } }
      ];
    case 'quadro': // square with cross inside
      return [
        { type: 'line', start: { x: -12, y: -16 }, end: { x: 12, y: -16 } },
        { type: 'line', start: { x: 12, y: -16 }, end: { x: 12, y: 16 } },
        { type: 'line', start: { x: 12, y: 16 }, end: { x: -12, y: 16 } },
        { type: 'line', start: { x: -12, y: 16 }, end: { x: -12, y: -16 } },
        { type: 'line', start: { x: -12, y: -16 }, end: { x: 12, y: 16 } },
        { type: 'line', start: { x: -12, y: 16 }, end: { x: 12, y: -16 } }
      ];
    case 'scatola_derivazione': // empty rect
      return [
        { type: 'line', start: { x: -16, y: -10 }, end: { x: 16, y: -10 } },
        { type: 'line', start: { x: 16, y: -10 }, end: { x: 16, y: 10 } },
        { type: 'line', start: { x: 16, y: 10 }, end: { x: -16, y: 10 } },
        { type: 'line', start: { x: -16, y: 10 }, end: { x: -16, y: -10 } }
      ];
    case 'suoneria': // mushroom bell
      return [
        { type: 'arc', center: { x: 0, y: 0 }, radius: 8, startAngle: 180, endAngle: 360 },
        { type: 'line', start: { x: -8, y: 0 }, end: { x: 8, y: 0 } },
        { type: 'line', start: { x: 0, y: -8 }, end: { x: 0, y: -14 } }
      ];
    case 'ronzatore': // inverted half circle
      return [
        { type: 'arc', center: { x: 0, y: 0 }, radius: 8, startAngle: 0, endAngle: 180 },
        { type: 'line', start: { x: -8, y: 0 }, end: { x: 8, y: 0 } },
        { type: 'line', start: { x: 0, y: 0 }, end: { x: 0, y: -6 } }
      ];
    case 'termostato': // circle with T
      return [
        { type: 'circle', center: { x: 0, y: 0 }, radius: 10 },
        { type: 'text', text: 'T', center: { x: 0, y: -2 } }
      ];
    case 'faretto': // circle crossed
      return [
        { type: 'circle', center: { x: 0, y: 0 }, radius: 8 },
        { type: 'line', start: { x: -8, y: -8 }, end: { x: 8, y: 8 } },
        { type: 'line', start: { x: -8, y: 8 }, end: { x: 8, y: -8 } }
      ];
    case 'lampada_emergenza': // rect with E
      return [
        { type: 'line', start: { x: -12, y: -8 }, end: { x: 12, y: -8 } },
        { type: 'line', start: { x: 12, y: -8 }, end: { x: 12, y: 8 } },
        { type: 'line', start: { x: 12, y: 8 }, end: { x: -12, y: 8 } },
        { type: 'line', start: { x: -12, y: 8 }, end: { x: -12, y: -8 } },
        { type: 'text', text: 'E', center: { x: 0, y: -2 } }
      ];
    case 'applique': // circle with line
      return [
        { type: 'circle', center: { x: 0, y: 0 }, radius: 8 },
        { type: 'line', start: { x: -10, y: 0 }, end: { x: -8, y: 0 } }
      ];
    case 'citofono': // Square with C
      return [
        { type: 'line', start: { x: -10, y: -10 }, end: { x: 10, y: -10 } },
        { type: 'line', start: { x: 10, y: -10 }, end: { x: 10, y: 10 } },
        { type: 'line', start: { x: 10, y: 10 }, end: { x: -10, y: 10 } },
        { type: 'line', start: { x: -10, y: 10 }, end: { x: -10, y: -10 } },
        { type: 'text', text: 'C', center: { x: 0, y: -2 } }
      ];
    case 'videocitofono': // Square with V
      return [
        { type: 'line', start: { x: -10, y: -10 }, end: { x: 10, y: -10 } },
        { type: 'line', start: { x: 10, y: -10 }, end: { x: 10, y: 10 } },
        { type: 'line', start: { x: 10, y: 10 }, end: { x: -10, y: 10 } },
        { type: 'line', start: { x: -10, y: 10 }, end: { x: -10, y: -10 } },
        { type: 'text', text: 'V', center: { x: 0, y: -2 } }
      ];
    case 'carico_af':
      return [
        { type: 'circle', center: { x: 0, y: 0 }, radius: 8 },
        { type: 'text', text: 'AF', center: { x: 12, y: 3 } }
      ];
    case 'carico_ac':
      return [
        { type: 'circle', center: { x: 0, y: 0 }, radius: 8 },
        { type: 'text', text: 'AC', center: { x: 12, y: 3 } }
      ];
    case 'scarico_idr':
      return [
        { type: 'circle', center: { x: 0, y: 0 }, radius: 10 },
        { type: 'line', start: { x: -10, y: 10 }, end: { x: 10, y: -10 } },
        { type: 'text', text: 'S', center: { x: 13, y: 3 } }
      ];
    case 'caldaia':
      return [
        { type: 'line', start: { x: -12, y: -18 }, end: { x: 12, y: -18 } },
        { type: 'line', start: { x: 12, y: -18 }, end: { x: 12, y: 18 } },
        { type: 'line', start: { x: 12, y: 18 }, end: { x: -12, y: 18 } },
        { type: 'line', start: { x: -12, y: 18 }, end: { x: -12, y: -18 } },
        { type: 'text', text: 'CALDAIA', center: { x: 0, y: 4 } }
      ];
    case 'collettore':
      return [
        { type: 'line', start: { x: -20, y: -6 }, end: { x: 20, y: -6 } },
        { type: 'line', start: { x: 20, y: -6 }, end: { x: 20, y: 6 } },
        { type: 'line', start: { x: 20, y: 6 }, end: { x: -20, y: 6 } },
        { type: 'line', start: { x: -20, y: 6 }, end: { x: -20, y: -6 } },
        { type: 'line', start: { x: -10, y: -6 }, end: { x: -10, y: 6 } },
        { type: 'line', start: { x: 0, y: -6 }, end: { x: 0, y: 6 } },
        { type: 'line', start: { x: 10, y: -6 }, end: { x: 10, y: 6 } }
      ];
      default:
        return [];
    }
  };

  return getBaseEntities().map(te => ({
    ...te,
    radius: te.radius !== undefined ? scaled(te.radius) : undefined,
    start: scaledPoint(te.start),
    end: scaledPoint(te.end),
    center: scaledPoint(te.center),
  }));
};

function getLinePerpendicularDistance(p: Point, root: LineEntity): number {
    const rx = root.end.x - root.start.x;
    const ry = root.end.y - root.start.y;
    const len = Math.hypot(rx, ry);
    if (len === 0) return 0;
    return Math.abs((p.x - root.start.x) * ry - (p.y - root.start.y) * rx) / len;
}

function getRootLine(line: LineEntity, entities: Entity[]): LineEntity {
    let current = line;
    const visited = new Set<string>();
    while (current.parentLineId) {
        if (visited.has(current.parentLineId)) break;
        visited.add(current.parentLineId);
        const parent = entities.find(e => e.id === current.parentLineId) as LineEntity | undefined;
        if (!parent || parent.type !== 'line') break;
        current = parent;
    }
    return current;
}

function autoCornerParallel(newParallel: LineEntity, existingEntities: Entity[]): Entity[] {
    if (!newParallel.parentLineId) return [...existingEntities, newParallel];

    // L1 is the immediate parent of our new parallel
    const L1 = existingEntities.find(e => e.id === newParallel.parentLineId) as LineEntity | undefined;
    if (!L1 || L1.type !== 'line') return [...existingEntities, newParallel];

    const R1 = getRootLine(L1, existingEntities);
    const vertexTol = 15.0; // Distance tolerance to detect shared vertex of parents
    
    // We will collect endpoint updates for our new parallel (P1)
    let p1Start = { ...newParallel.start };
    let p1End = { ...newParallel.end };

    // We can have multiple peers that get updated
    const peerUpdates: Record<string, { start?: Point; end?: Point }> = {};

    for (const ent of existingEntities) {
        if (ent.type !== 'line') continue;
        const P2 = ent as LineEntity;

        if (P2.id === newParallel.id) continue;
        if (P2.id === L1.id) continue;

        // Figli cannot link with raw parents/unrelated fathers:
        // P2 must be an offspring parallel line (must have parentLineId)
        if (!P2.parentLineId) continue;

        const L2_parent = existingEntities.find(e => e.id === P2.parentLineId) as LineEntity | undefined;
        if (!L2_parent || L2_parent.type !== 'line') continue;

        const R2 = getRootLine(L2_parent, existingEntities);
        if (R2.id === R1.id) continue; // Same family tree, don't intersect them

        // Geometrical checks of physical connection between the root parent lines R1 and R2:
        const d_ss = Math.hypot(R1.start.x - R2.start.x, R1.start.y - R2.start.y);
        const d_se = Math.hypot(R1.start.x - R2.end.x,   R1.start.y - R2.end.y);
        const d_es = Math.hypot(R1.end.x   - R2.start.x, R1.end.y   - R2.start.y);
        const d_ee = Math.hypot(R1.end.x   - R2.end.x,   R1.end.y   - R2.end.y);

        let sharedVertex: Point | null = null;
        let isR1Start = false;
        let isR2Start = false;

        if (d_ss < vertexTol) {
            sharedVertex = R1.start;
            isR1Start = true;
            isR2Start = true;
        } else if (d_se < vertexTol) {
            sharedVertex = R1.start;
            isR1Start = true;
            isR2Start = false;
        } else if (d_es < vertexTol) {
            sharedVertex = R1.end;
            isR1Start = false;
            isR2Start = true;
        } else if (d_ee < vertexTol) {
            sharedVertex = R1.end;
            isR1Start = false;
            isR2Start = false;
        }

        if (sharedVertex) {
            // Check angle filter to avoid almost parallel parent lines
            const lenR1 = Math.hypot(R1.end.x - R1.start.x, R1.end.y - R1.start.y);
            const lenR2 = Math.hypot(R2.end.x - R2.start.x, R2.end.y - R2.start.y);
            if (lenR1 > 0 && lenR2 > 0) {
                const dot = (R1.end.x - R1.start.x) * (R2.end.x - R2.start.x) + (R1.end.y - R1.start.y) * (R2.end.y - R2.start.y);
                const cosTheta = Math.abs(dot) / (lenR1 * lenR2);
                if (cosTheta > 0.99) {
                    continue; // Skip almost parallel parents
                }
            }

            // Let's compute the signed offsets of the children relative to their parents
            const dx1 = R1.end.x - R1.start.x;
            const dy1 = R1.end.y - R1.start.y;
            const normLength1 = Math.hypot(dx1, dy1);
            let offset1Signed = 0;
            if (normLength1 > 0) {
                const nx1 = -dy1 / normLength1;
                const ny1 = dx1 / normLength1;
                offset1Signed = (newParallel.start.x - R1.start.x) * nx1 + (newParallel.start.y - R1.start.y) * ny1;
            }

            const dx2 = R2.end.x - R2.start.x;
            const dy2 = R2.end.y - R2.start.y;
            const normLength2 = Math.hypot(dx2, dy2);
            let offset2Signed = 0;
            if (normLength2 > 0) {
                const nx2 = -dy2 / normLength2;
                const ny2 = dx2 / normLength2;
                offset2Signed = (P2.start.x - R2.start.x) * nx2 + (P2.start.y - R2.start.y) * ny2;
            }

            // Check "sesso" (same physical side of offset relative to original parent orientations)
            let isSameSide = false;
            if (isR1Start === isR2Start) {
                isSameSide = (offset1Signed * offset2Signed < -1e-3);
            } else {
                isSameSide = (offset1Signed * offset2Signed > 1e-3);
            }

            if (!isSameSide) continue; // Skip if they are offset on opposite sides ("different sex/side")

            const absOffset1 = Math.abs(offset1Signed);
            const absOffset2 = Math.abs(offset2Signed);
            const diff = Math.abs(absOffset1 - absOffset2);
            const maxAllowedDiff = Math.max(10.0, 0.2 * absOffset1);

            if (diff < maxAllowedDiff) {
                // Compute infinite line intersection between the two parallel line vectors
                const v1 = { x: p1End.x - p1Start.x, y: p1End.y - p1Start.y };
                const v2 = { x: P2.end.x - P2.start.x, y: P2.end.y - P2.start.y };
                const intersect = intersectLines(p1Start, v1, P2.start, v2);
                if (intersect) {
                    // Update P1 endpoint closer to the shared vertex
                    const distToStart1 = Math.hypot(p1Start.x - sharedVertex.x, p1Start.y - sharedVertex.y);
                    const distToEnd1 = Math.hypot(p1End.x - sharedVertex.x, p1End.y - sharedVertex.y);
                    if (distToStart1 < distToEnd1) {
                        p1Start = { ...intersect };
                    } else {
                        p1End = { ...intersect };
                    }

                    // Update P2 endpoint closer to the shared vertex
                    const distToStart2 = Math.hypot(P2.start.x - sharedVertex.x, P2.start.y - sharedVertex.y);
                    const distToEnd2 = Math.hypot(P2.end.x - sharedVertex.x, P2.end.y - sharedVertex.y);
                    
                    if (!peerUpdates[P2.id]) {
                        peerUpdates[P2.id] = {};
                    }
                    if (distToStart2 < distToEnd2) {
                        peerUpdates[P2.id].start = { ...intersect };
                    } else {
                        peerUpdates[P2.id].end = { ...intersect };
                    }
                }
            }
        }
    }

    const modifiedNewParallel: LineEntity = {
        ...newParallel,
        start: p1Start,
        end: p1End
    };

    // Return the updated entities array with peer lines modified or untouched
    return existingEntities.map(e => {
        const update = peerUpdates[e.id];
        if (update && e.type === 'line') {
            const peer = e as LineEntity;
            return {
                ...peer,
                start: update.start || peer.start,
                end: update.end || peer.end
            };
        }
        return e;
    }).concat(modifiedNewParallel);
}

const mapStyleStringToNum = (styleStr?: string): number => {
    if (styleStr === 'aligned') return 2;
    if (styleStr === 'horizontal') return 3;
    if (styleStr === 'vertical') return 4;
    if (styleStr === 'auto-ortho') return 5;
    return 1; // linear / default
};

const getDimensionLinePoints = (ent: { start: Point; end: Point; style?: number; offset: number }): { p1: Point; p2: Point; styleToUse: number } => {
    const origDx = ent.end.x - ent.start.x;
    const origDy = ent.end.y - ent.start.y;
    
    let styleToUse = ent.style || 1;
    if (styleToUse === 1 || styleToUse === 5) {
        styleToUse = Math.abs(origDx) > Math.abs(origDy) ? 3 : 4;
    }
    
    let dx = origDx;
    let dy = origDy;
    let L = Math.sqrt(dx * dx + dy * dy);
    if (L <= 0.001) L = 0.001;
    let nx = -dy / L;
    let ny = dx / L;

    let p1 = { ...ent.start };
    let p2 = { ...ent.end };
    
    if (styleToUse === 3) {
        p1 = { x: ent.start.x, y: ent.start.y + ent.offset };
        p2 = { x: ent.end.x, y: ent.start.y + ent.offset };
    } else if (styleToUse === 4) {
        p1 = { x: ent.start.x + ent.offset, y: ent.start.y };
        p2 = { x: ent.start.x + ent.offset, y: ent.end.y };
    } else {
        p1 = { x: ent.start.x + nx * ent.offset, y: ent.start.y + ny * ent.offset };
        p2 = { x: ent.end.x + nx * ent.offset, y: ent.end.y + ny * ent.offset };
    }
    return { p1, p2, styleToUse };
};

interface CADCanvasProps {
  entities: Entity[];
  activeTool: string;
  setActiveTool?: (tool: string) => void;
  setEntities: React.Dispatch<React.SetStateAction<Entity[]>>;
  setEntitiesSilent?: React.Dispatch<React.SetStateAction<Entity[]>>;
  liveMirrorAxis?: { start: Point; end: Point } | null;
  onUpdateLiveMirrorAxis?: (axis: { start: Point; end: Point } | null) => void;
  onCommitHistory?: (entities: Entity[]) => void;
  onSelect: (id: string | null, entity?: Entity, clickPoint?: Point) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  activeLayerId: string;
  layers: Layer[];
  defaultLineStyle: { color: string, lineWidth: number, dashed: boolean, mode: 'ink' | 'pencil' | 'CAD', lineType?: 'continuous' | 'dashed' | 'dotted' | 'dashdot' | 'dashdash' };
  setDefaultLineStyle: React.Dispatch<React.SetStateAction<{ color: string, lineWidth: number, dashed: boolean, mode: 'ink' | 'pencil' | 'CAD', lineType?: 'continuous' | 'dashed' | 'dotted' | 'dashdot' | 'dashdash' }>>;
  defaultFiloColor?: string;
  eraserRadius: number;
  setEraserRadius: React.Dispatch<React.SetStateAction<number>>;
  eraserType?: 'miracolo' | 'pencil' | 'all' | 'lametta';
  setEraserType?: React.Dispatch<React.SetStateAction<'miracolo' | 'pencil' | 'all' | 'lametta'>>;
  eraserIntensity?: number;
  setEraserIntensity?: React.Dispatch<React.SetStateAction<number>>;
  onMouseMovePosition?: (pos: Point) => void;
  rulerStyle?: 'tecnigrafo' | 'crosshair';
  orthoMode?: boolean;
  snapEnabled?: boolean;
  setOrthoMode?: (val: boolean) => void;
  isContinuousMode?: boolean;
  cancelTrigger?: number;
  parallelTrigger?: number;
  isOffsetAidActive?: boolean;
  tavole?: Tavola[];
  onUpdateTavole?: (tavole: Tavola[]) => void;
  onDoubleClickTavola?: (id: string) => void;
  selectedTemplateId?: string | null;
  selectedEntityId?: string | null;
  onLastParameterChange?: (param: { type: 'radius' | 'length' | 'thickness' | 'offset'; value: number; isLocked?: boolean; isAutoFromDrawing?: boolean }) => void;
  lastInsertedParameter?: { type: 'radius' | 'length' | 'thickness' | 'offset'; value: number; isLocked?: boolean; userSetAt?: number } | null;
  selectedBIMSymbolType?: string | null;
  setSelectedBIMSymbolType?: (val: string | null) => void;
  bimSymbolScale?: number;
  defaultTextStyle?: { fontFamily: string, fontSize: number, fontWeight: string, textAlign: 'left' | 'center' | 'right' | 'justify' };
  setDefaultTextStyle?: React.Dispatch<React.SetStateAction<{ fontFamily: string; fontSize: number; fontWeight: string; textAlign: "left" | "center" | "right" | "justify" }>>;
  raccordoConfig?: { type: 'curvo' | 'rettilineo' | 'taglia'; value: number };
  dimensionScale?: number;
  dimensionDecimals?: number;
  dimensionMode?: 'two-points' | 'chain';
  dimensionStyle?: 'linear' | 'aligned' | 'horizontal' | 'vertical' | 'auto-ortho';
  selectionMode?: 'manual' | 'object';
  onEditRaccordo?: (raccordoEntity: Entity) => void;
  onOpenPenneSidebar?: () => void;
  onDoubleClickDimension?: (entity: DimensionEntity) => void;
  onDoubleClickBIMElement?: (entity: Entity) => void;
  onActionStart?: () => void;
  defaultHatchStyle?: {
    pattern: string;
    scale: number;
    angle: number;
    color: string;
  };
  onAreaDetected?: (result: { points: Point[], holes?: Point[][], isLinear?: boolean, isJollyActive?: boolean }) => void;
  onSelectionComplete?: (ids: string[], point: Point) => void;
  initialSelectedIds?: string[];
  selectedEntityIds?: string[];
  highlightedPoints?: Point[] | { points: Point[], holes?: Point[][] } | null;
  bimWallHeight?: number;
  bimDoorHeight?: number;
  bimWindowHeight?: number;
  bimWallThickness?: number;
  bimWallType?: string;
  rotationEntityId?: string | null;
  onSelectForRotation?: (id: string | null) => void;
  bimWallRenderMode?: 'solid' | 'transparent';
  selectedLine?: LineEntity | null;
  selectedLineClickPoint?: Point | null;
  referenceLine?: LineEntity | null;
  sketchParams?: any[];
  highlightedSketchId?: string | null;
  showFloatingManual?: boolean;
  isLavagna?: boolean;
}

const mergeLineSegments = (currentEntities: Entity[], newLine: LineEntity): Entity[] => {
    const tolerance = 2.0; // Generous connection tolerance so extended collinear lines always become a single segment
    let entitiesToKeep = [...currentEntities];

    // 1. Line overlay / replacement ("china sulla matita"): ONLY if newLine has a different mode (e.g. China over Matita) and overlaps interior, trim/split underlying line.
    // If same mode, Step 2 will unify them into one single line!
    const v1 = { x: newLine.end.x - newLine.start.x, y: newLine.end.y - newLine.start.y };
    const len1 = Math.hypot(v1.x, v1.y);
    if (len1 > 0.01) {
        const ux = v1.x / len1;
        const uy = v1.y / len1;
        const t_new_start = 0;
        const t_new_end = len1;

        const nextEntities: Entity[] = [];
        for (let i = 0; i < entitiesToKeep.length; i++) {
            const ent = entitiesToKeep[i];
            if (ent.type === 'line' && !ent.isBIM && !(ent as any).isFilo && ent.mode !== newLine.mode) {
                const line = ent as LineEntity;
                const v2 = { x: line.end.x - line.start.x, y: line.end.y - line.start.y };
                const len2 = Math.hypot(v2.x, v2.y);
                if (len2 > 0.01) {
                    const cross = v1.x * v2.y - v1.y * v2.x;
                    const sin_theta = Math.abs(cross / (len1 * len2));
                    if (sin_theta < 0.12) {
                        const dx = line.start.x - newLine.start.x;
                        const dy = line.start.y - newLine.start.y;
                        const distToLine = Math.abs(v1.y * dx - v1.x * dy) / len1;
                        if (distToLine < tolerance) {
                            const t_l1 = (line.start.x - newLine.start.x) * ux + (line.start.y - newLine.start.y) * uy;
                            const t_l2 = (line.end.x - newLine.start.x) * ux + (line.end.y - newLine.start.y) * uy;
                            const a_l = Math.min(t_l1, t_l2);
                            const b_l = Math.max(t_l1, t_l2);
                            const pt_l_start = t_l1 < t_l2 ? line.start : line.end;
                            const pt_l_end = t_l1 < t_l2 ? line.end : line.start;

                            const overlapStart = Math.max(a_l, t_new_start);
                            const overlapEnd = Math.min(b_l, t_new_end);

                            if (overlapEnd - overlapStart > tolerance + 0.1) {
                                // Substantial interior overlap ("china sulla matita") - trim/split underlying line
                                if (overlapStart - a_l > tolerance) {
                                    nextEntities.push({
                                        ...line,
                                        id: Date.now().toString() + '_l',
                                        start: pt_l_start,
                                        end: { x: newLine.start.x + ux * overlapStart, y: newLine.start.y + uy * overlapStart }
                                    });
                                }
                                if (b_l - overlapEnd > tolerance) {
                                    nextEntities.push({
                                        ...line,
                                        id: Date.now().toString() + '_r',
                                        start: { x: newLine.start.x + ux * overlapEnd, y: newLine.start.y + uy * overlapEnd },
                                        end: pt_l_end
                                    });
                                }
                                continue; // Skip original line (overridden by newLine)
                            }
                        }
                    }
                }
            }
            nextEntities.push(ent);
        }
        entitiesToKeep = nextEntities;
    }

    let merged = { ...newLine };
    let mergedAny = true;

    while (mergedAny) {
        mergedAny = false;
        for (let i = 0; i < entitiesToKeep.length; i++) {
            const ent = entitiesToKeep[i];
            if (ent.type === 'line' && ent.layer === merged.layer && !ent.isBIM && !(ent as any).isFilo) {
                const line = ent as LineEntity;

                // Check collinearity using direction vectors for ALL line types (CAD, China, Matita)
                const v1 = { x: merged.end.x - merged.start.x, y: merged.end.y - merged.start.y };
                const v2 = { x: line.end.x - line.start.x, y: line.end.y - line.start.y };
                const len1 = Math.hypot(v1.x, v1.y);
                const len2 = Math.hypot(v2.x, v2.y);
                
                if (len1 > 0 && len2 > 0) {
                    const cross = v1.x * v2.y - v1.y * v2.x;
                    const sin_theta = Math.abs(cross / (len1 * len2));
                    
                    // Collinear if sin_theta < 0.12 (approx 7 degrees) - never merge at 90 degrees or other angles!
                    if (sin_theta < 0.12) {
                        // Check perpendicular distance between the two collinear lines
                        const dx = line.start.x - merged.start.x;
                        const dy = line.start.y - merged.start.y;
                        const distToLine = Math.abs(v1.y * dx - v1.x * dy) / len1;

                        if (distToLine < tolerance) {
                            // Project endpoints onto the merged direction vector to check overlap/closeness
                            const ux = v1.x / len1;
                            const uy = v1.y / len1;

                            const t_m1 = 0; // merged.start projected
                            const t_m2 = len1; // merged.end projected
                            
                            const t_l1 = (line.start.x - merged.start.x) * ux + (line.start.y - merged.start.y) * uy;
                            const t_l2 = (line.end.x - merged.start.x) * ux + (line.end.y - merged.start.y) * uy;

                            const a1 = Math.min(t_m1, t_m2);
                            const b1 = Math.max(t_m1, t_m2);
                            const a2 = Math.min(t_l1, t_l2);
                            const b2 = Math.max(t_l1, t_l2);

                            // Check overlap/closeness in 1D intervals: ALWAYS merge collinear touching/overlapping lines into a single unified segment!
                            if (Math.max(a1, a2) <= Math.min(b1, b2) + tolerance) {
                                // Detect if the new stroke actually overlaps the existing segment (2nd pass / ricalco!)
                                const overlapStartProj = Math.max(a1, a2);
                                const overlapEndProj = Math.min(b1, b2);
                                const overlapLen = overlapEndProj - overlapStartProj;
                                const overlapThreshold = Math.max(0.4, Math.min(len1, len2) * 0.12);

                                // Use the longer segment's axis as the master axis so the unified line stays straight and crisp
                                const refOrigin = len2 >= len1 ? line.start : merged.start;
                                const refUx = len2 >= len1 ? (v2.x / len2) : ux;
                                const refUy = len2 >= len1 ? (v2.y / len2) : uy;

                                // Collect any existing retraced intervals + new overlap interval if this is a second pass over the line
                                const retracePts: Point[] = [];
                                if ((line as any).retraceStart && (line as any).retraceEnd) {
                                    retracePts.push((line as any).retraceStart, (line as any).retraceEnd);
                                }
                                if ((merged as any).retraceStart && (merged as any).retraceEnd) {
                                    retracePts.push((merged as any).retraceStart, (merged as any).retraceEnd);
                                }
                                if (overlapLen > overlapThreshold && (merged.mode === 'ink' || merged.mode === 'pencil' || line.mode === 'ink' || line.mode === 'pencil')) {
                                    retracePts.push(
                                        { x: merged.start.x + ux * overlapStartProj, y: merged.start.y + uy * overlapStartProj },
                                        { x: merged.start.x + ux * overlapEndProj, y: merged.start.y + uy * overlapEndProj }
                                    );
                                }

                                const pts = [merged.start, merged.end, line.start, line.end];
                                let minProj = Infinity;
                                let maxProj = -Infinity;
                                for (const p of pts) {
                                    const pr = (p.x - refOrigin.x) * refUx + (p.y - refOrigin.y) * refUy;
                                    if (pr < minProj) minProj = pr;
                                    if (pr > maxProj) maxProj = pr;
                                }

                                merged.start = {
                                    x: refOrigin.x + refUx * minProj,
                                    y: refOrigin.y + refUy * minProj
                                };
                                merged.end = {
                                    x: refOrigin.x + refUx * maxProj,
                                    y: refOrigin.y + refUy * maxProj
                                };

                                if (retracePts.length >= 2) {
                                    let minRetrace = Infinity;
                                    let maxRetrace = -Infinity;
                                    for (const rp of retracePts) {
                                        const rpr = (rp.x - refOrigin.x) * refUx + (rp.y - refOrigin.y) * refUy;
                                        if (rpr < minRetrace) minRetrace = rpr;
                                        if (rpr > maxRetrace) maxRetrace = rpr;
                                    }
                                    minRetrace = Math.max(minProj, minRetrace);
                                    maxRetrace = Math.min(maxProj, maxRetrace);
                                    if (maxRetrace - minRetrace > 0.2) {
                                        (merged as any).retraceStart = {
                                            x: refOrigin.x + refUx * minRetrace,
                                            y: refOrigin.y + refUy * minRetrace
                                        };
                                        (merged as any).retraceEnd = {
                                            x: refOrigin.x + refUx * maxRetrace,
                                            y: refOrigin.y + refUy * maxRetrace
                                        };
                                    }
                                }

                                // Preserve existing line ID if extending an existing segment
                                merged.id = line.id;
                                if (merged.inkPoints || line.inkPoints) {
                                    const ptsMerged = merged.inkPoints || [{ x: merged.start.x, y: merged.start.y, width: 1, alpha: 1 }, { x: merged.end.x, y: merged.end.y, width: 1, alpha: 1 }];
                                    const ptsLine = line.inkPoints || [{ x: line.start.x, y: line.start.y, width: 1, alpha: 1 }, { x: line.end.x, y: line.end.y, width: 1, alpha: 1 }];
                                    merged.inkPoints = [...ptsLine, ...ptsMerged];
                                }
                                entitiesToKeep.splice(i, 1);
                                mergedAny = true;
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    return [...entitiesToKeep, merged];
};

export const CADCanvas = React.forwardRef<CADCanvasAPI, CADCanvasProps>(({ entities, activeTool, setActiveTool, setEntities: originalSetEntities, setEntitiesSilent, liveMirrorAxis, onUpdateLiveMirrorAxis, onCommitHistory, onSelect, onContextMenu, activeLayerId, layers, defaultLineStyle, setDefaultLineStyle, defaultFiloColor = '#ff5500', defaultHatchStyle, defaultTextStyle = { fontFamily: 'sans-serif', fontSize: 14, fontWeight: 'normal', textAlign: 'left' }, setDefaultTextStyle, eraserRadius, setEraserRadius, eraserType = 'pencil', setEraserType, eraserIntensity = 55, setEraserIntensity, onMouseMovePosition, rulerStyle = 'tecnigrafo', orthoMode = false, snapEnabled = true, setOrthoMode, isContinuousMode = false, cancelTrigger = 0, parallelTrigger = 0, isOffsetAidActive = false, tavole, onUpdateTavole, onDoubleClickTavola, selectedTemplateId, selectedEntityId, selectedBIMSymbolType, setSelectedBIMSymbolType, bimSymbolScale = 1, raccordoConfig, dimensionScale = 1, dimensionDecimals = 2, dimensionMode = 'two-points', dimensionStyle = 'linear', selectionMode = 'manual', onEditRaccordo, onOpenPenneSidebar, onDoubleClickDimension, onDoubleClickBIMElement, onActionStart, onAreaDetected, onSelectionComplete, initialSelectedIds, selectedEntityIds = [], highlightedPoints, rotationEntityId, onSelectForRotation, bimWallHeight = 270, bimDoorHeight = 210, bimWindowHeight = 140, bimWallThickness = 15, bimWallType = 'Forati (Laterizio)', bimWallRenderMode = 'solid', sketchParams = [], highlightedSketchId = null, selectedLine = null, selectedLineClickPoint = null, referenceLine = null, showFloatingManual = false, isLavagna = false, lastInsertedParameter = null, onLastParameterChange }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const entitiesRef = useRef(entities);
  const lastSegmentRef = useRef<{ start: Point; end: Point; length: number; id?: string } | null>(null);
  const virtualCursorOffsetRef = useRef<Point | null>(null);
  const isProgrammaticAlignRef = useRef(false);

  const lastUserSetAtRef = useRef<number>(0);
  const [hasUsedInputSnap, setHasUsedInputSnap] = useState<boolean>(false);

  useEffect(() => {
    const userSetAt = (lastInsertedParameter as any)?.userSetAt || 0;
    if (userSetAt && userSetAt !== lastUserSetAtRef.current) {
      lastUserSetAtRef.current = userSetAt;
      setHasUsedInputSnap(false);
    }
  }, [(lastInsertedParameter as any)?.userSetAt, lastInsertedParameter?.value, lastInsertedParameter?.type]);

  useEffect(() => {
    entitiesRef.current = entities;
  }, [entities]);

  useEffect(() => {
    if (isProgrammaticAlignRef.current) {
      isProgrammaticAlignRef.current = false;
      return;
    }
    virtualCursorOffsetRef.current = null;
  }, [activeTool]);

  const [liveMirrorState, setLiveMirrorState] = useState<'axis_start' | 'axis_end'>('axis_start');
  const [liveMirrorAxisPt1, setLiveMirrorAxisPt1] = useState<Point | null>(null);

  const saveAxisToLocalStorage = (axis: { start: Point; end: Point }) => {
      try {
          const saved = localStorage.getItem('gecola_live_mirror_axes');
          const list: { start: Point; end: Point }[] = saved ? JSON.parse(saved) : [];
          const exists = list.some(a => 
              Math.hypot(a.start.x - axis.start.x, a.start.y - axis.start.y) < 5 &&
              Math.hypot(a.end.x - axis.end.x, a.end.y - axis.end.y) < 5
          );
          if (!exists) {
              const updated = [axis, ...list].slice(0, 10);
              localStorage.setItem('gecola_live_mirror_axes', JSON.stringify(updated));
          }
      } catch {}
  };

  const applyLiveMirror = (prev: Entity[], next: Entity[]): Entity[] => {
      if (!liveMirrorAxis) return next;

      const currentAxisId = `${liveMirrorAxis.start.x.toFixed(2)},${liveMirrorAxis.start.y.toFixed(2)}-${liveMirrorAxis.end.x.toFixed(2)},${liveMirrorAxis.end.y.toFixed(2)}`;
      const prevIds = new Set(prev.map(e => e.id));

      const taggedNext = next.map(e => {
          if (!(e as any).isSimmetryAxis && !(e as any).isLiveMirrorCopy) {
              if (!prevIds.has(e.id)) {
                  return {
                      ...e,
                      liveMirrorAxisId: currentAxisId
                  };
              }
          }
          return e;
      });

      const sourceEntitiesInNext = taggedNext.filter(e => 
          !(e as any).isSimmetryAxis && 
          !(e as any).isLiveMirrorCopy &&
          (e as any).liveMirrorAxisId === currentAxisId
      );

      const otherEntities = taggedNext.filter(e => 
          (e as any).isSimmetryAxis || 
          (e as any).isLiveMirrorCopy ||
          (e as any).liveMirrorAxisId !== currentAxisId
      );

      const existingMirrors = otherEntities.filter(e => 
          (e as any).isLiveMirrorCopy && 
          (e as any).liveMirrorAxisId === currentAxisId
      );

      const mirrorMap = new Map<string, Entity>();
      existingMirrors.forEach(m => {
          const srcId = (m as any).liveMirrorSourceId;
          if (srcId) mirrorMap.set(srcId, m);
      });

      const updatedMirrors: Entity[] = [];
      for (const src of sourceEntitiesInNext) {
          const existingMirror = mirrorMap.get(src.id);
          const mirrored = mirrorEntity(src, liveMirrorAxis.start, liveMirrorAxis.end);
          if (existingMirror) {
              updatedMirrors.push({
                  ...mirrored,
                  id: existingMirror.id,
                  layer: src.layer,
                  color: src.color,
                  lineWidth: src.lineWidth,
                  dashed: src.dashed,
                  groupId: src.groupId,
                  isLiveMirrorCopy: true,
                  liveMirrorSourceId: src.id,
                  liveMirrorAxisId: currentAxisId
              } as any);
          } else {
              (mirrored as any).isLiveMirrorCopy = true;
              (mirrored as any).liveMirrorSourceId = src.id;
              (mirrored as any).liveMirrorAxisId = currentAxisId;
              updatedMirrors.push(mirrored);
          }
      }

      const filteredOtherEntities = otherEntities.filter(e => 
          !((e as any).isLiveMirrorCopy && (e as any).liveMirrorAxisId === currentAxisId)
      );

      return [...sourceEntitiesInNext, ...filteredOtherEntities, ...updatedMirrors];
  };

  const setEntities: React.Dispatch<React.SetStateAction<Entity[]>> = (updater) => {
      originalSetEntities(prev => {
          const next = typeof updater === 'function' ? (updater as Function)(prev) : updater;
          return applyLiveMirror(prev, next);
      });
  };

  const shiftEntityByDelta = (ent: Entity, deltaX: number, deltaY: number): Entity => {
    let updated = { ...ent };
    
    if (ent.type === 'line') {
        updated = { 
            ...updated, 
            start: { x: ent.start.x + deltaX, y: ent.start.y + deltaY }, 
            end: { x: ent.end.x + deltaX, y: ent.end.y + deltaY } 
        } as any;
        if ((ent as any).retraceStart && (ent as any).retraceEnd) {
            (updated as any).retraceStart = { x: (ent as any).retraceStart.x + deltaX, y: (ent as any).retraceStart.y + deltaY };
            (updated as any).retraceEnd = { x: (ent as any).retraceEnd.x + deltaX, y: (ent as any).retraceEnd.y + deltaY };
        }
        if (ent.isFreehand && ent.inkPoints) {
            (updated as any).inkPoints = ent.inkPoints.map(p => ({ ...p, x: p.x + deltaX, y: p.y + deltaY }));
        }
    } else if (ent.type === 'circle') {
        updated = { ...updated, center: { x: ent.center.x + deltaX, y: ent.center.y + deltaY } } as any;
    } else if (ent.type === 'rectangle') {
        updated = { ...updated, p1: { x: ent.p1.x + deltaX, y: ent.p1.y + deltaY }, p2: { x: ent.p2.x + deltaX, y: ent.p2.y + deltaY } } as any;
    } else if (ent.type === 'hatch') {
        const h = ent as any;
        updated = { ...updated, points: h.points ? h.points.map((p: Point) => ({ x: p.x + deltaX, y: p.y + deltaY })) : [] } as any;
    } else if (ent.type === 'point' || ent.type === 'text' || ent.type === 'image') {
        updated = { ...updated, point: { x: ent.point.x + deltaX, y: ent.point.y + deltaY } } as any;
    } else if (ent.type === 'arc') {
        updated = { ...updated, center: { x: ent.center.x + deltaX, y: ent.center.y + deltaY } } as any;
    } else if (ent.type === 'dimension') {
        updated = { 
            ...updated, 
            start: { x: ent.start.x + deltaX, y: ent.start.y + deltaY }, 
            end: { x: ent.end.x + deltaX, y: ent.end.y + deltaY } 
        } as any;
    }

    // Generic check for points, bimPoints and holes
    if ((ent as any).bimPoints) {
        (updated as any).bimPoints = (ent as any).bimPoints.map((p: Point) => ({ x: p.x + deltaX, y: p.y + deltaY }));
    }
    if ((ent as any).points && (ent as any).type !== 'hatch') {
        (updated as any).points = (ent as any).points.map((p: Point) => ({ x: p.x + deltaX, y: p.y + deltaY }));
    }
    if ((ent as any).holes) {
        (updated as any).holes = (ent as any).holes.map((hole: Point[]) => hole.map((p: Point) => ({ x: p.x + deltaX, y: p.y + deltaY })));
    }

    return updated;
  };

  const findConnectedDimensions = (startDimId: string, allEntities: Entity[]): Set<string> => {
    const connected = new Set<string>([startDimId]);
    const dims = allEntities.filter(e => e.type === 'dimension') as DimensionEntity[];
    let added = true;
    while (added) {
        added = false;
        for (const d of dims) {
            if (connected.has(d.id)) continue;
            for (const otherId of connected) {
                const other = dims.find(ox => ox.id === otherId);
                if (!other) continue;
                const ptCheck = (p1: Point, p2: Point) => {
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    return (dx * dx + dy * dy) < 4.0; // distance tolerance
                };
                if (
                    ptCheck(d.start, other.start) ||
                    ptCheck(d.start, other.end) ||
                    ptCheck(d.end, other.start) ||
                    ptCheck(d.end, other.end)
                ) {
                    connected.add(d.id);
                    added = true;
                }
            }
        }
    }
    return connected;
  };

  const [view, setView] = useState({ zoom: 0.15, pan: { x: window.innerWidth > 0 ? (window.innerWidth / 2) - 150 : 250, y: window.innerHeight > 0 ? (window.innerHeight / 2) - 220 : 80 } });
  const [isZoomToggleEnabled, setIsZoomToggleEnabled] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [isMagicZoomActive, setIsMagicZoomActive] = useState(false);

  const effectiveMagicZoom = isMagicZoomActive || isZoomToggleEnabled;

  useEffect(() => {
    const getFriendlyKeyName = (key: string): string => {
      if (key === ' ') return 'BARRA SPAZIATRICE';
      if (key === 'Shift') return 'MAIUSC (SHIFT)';
      if (key === 'Control') return 'CTRL';
      if (key === 'Alt') return 'ALT';
      if (key === 'CapsLock') return 'BLOC MAIUSC (CAPS)';
      if (key === 'NumLock') return 'BLOC NUM';
      if (key === 'ScrollLock') return 'BLOC SCORR';
      return key.toUpperCase();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || (document.activeElement as any)?.isContentEditable) {
        return;
      }
      // Evitiamo tasti di navigazione/sistema o cancellazione
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Backspace', 'Escape', 'Enter', 'Tab'].includes(e.key)) {
        return;
      }
      setIsMagicZoomActive(true);
      setActiveKey(getFriendlyKeyName(e.key));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      setIsMagicZoomActive(false);
      setActiveKey(null);
    };

    const handleBlur = () => {
      setIsMagicZoomActive(false);
      setActiveKey(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);
  const [dragTavolaId, setDragTavolaId] = useState<string | null>(null);
  const [hoverTavolaEdge, setHoverTavolaEdge] = useState(false);
  const dragTavolaIdRef = useRef<string | null>(null);
  useEffect(() => { dragTavolaIdRef.current = dragTavolaId; }, [dragTavolaId]);

  const [hoveredTavolaPart, setHoveredTavolaPart] = useState<{ id: string; part: 'cartiglio' | 'badge' } | null>(null);
  const [manualRoomPoints, setManualRoomPoints] = useState<Point[]>([]);
  const [manualSideSign, setManualSideSign] = useState<number>(1);
  const [hoveredBIMSegments, setHoveredBIMSegments] = useState<{ start: Point, end: Point, entity: Entity, distance: number }[]>([]);

  const getHoveredTavolaPart = (rawPoint: Point): { id: string; part: 'cartiglio' | 'badge' } | null => {
    if (!tavole) return null;
    for (const tav of tavole) {
      if (!tav.visible) continue;
      const { w, h } = getTavolaDimensions(tav);

      // Cartiglio check
      let mFactor = 5;
      let scaleFactor = 1000;
      if (tav.unit === 'cm') scaleFactor = 10;
      if (tav.unit === 'mm') scaleFactor = 1;
      const marginOffset = mFactor * (tav.scale / scaleFactor);

      const cartiglioW = 120 * (tav.scale / scaleFactor);
      const cartiglioH = 40 * (tav.scale / scaleFactor);
      const cartX = tav.position.x + w - marginOffset - cartiglioW;
      const cartY = tav.position.y + h - marginOffset - cartiglioH;

      if (rawPoint.x >= cartX && rawPoint.x <= cartX + cartiglioW &&
          rawPoint.y >= cartY && rawPoint.y <= cartY + cartiglioH) {
        return { id: tav.id, part: 'cartiglio' };
      }

      // Badge check
      const badgeH = 18 / view.zoom;
      const badgeW = 120 / view.zoom;
      if (rawPoint.x >= tav.position.x && rawPoint.x <= tav.position.x + badgeW &&
          rawPoint.y >= tav.position.y - badgeH && rawPoint.y <= tav.position.y) {
        return { id: tav.id, part: 'badge' };
      }
    }
    return null;
  };

  useEffect(() => {
    if (activeTool !== 'BIM_DisegnaStanza' && activeTool !== 'BIM_DisegnaLineare' && activeTool !== 'BIM_TracciaSegmento') {
      if (manualRoomPoints.length > 0) {
        setManualRoomPoints([]);
      }
    }
  }, [activeTool]);

  const [helpPanelOffset, setHelpPanelOffset] = useState<{x: number, y: number} | null>(null);
  const helpDragRef = useRef<{startX: number, startY: number, initialOffset: {x: number, y: number}}>({startX: 0, startY: 0, initialOffset: {x: 0, y: 0}});
  const [isHelpDragging, setIsHelpDragging] = useState(false);

  const onHelpPointerDown = (e: React.PointerEvent) => {
      setIsHelpDragging(true);
      helpDragRef.current.startX = e.clientX;
      helpDragRef.current.startY = e.clientY;
      helpDragRef.current.initialOffset = helpPanelOffset || {x: 0, y: 0};
      e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHelpPointerMove = (e: React.PointerEvent) => {
      if (isHelpDragging) {
          const dx = e.clientX - helpDragRef.current.startX;
          const dy = e.clientY - helpDragRef.current.startY;
          setHelpPanelOffset({
              x: helpDragRef.current.initialOffset.x + dx,
              y: helpDragRef.current.initialOffset.y + dy
          });
      }
  };

  const onHelpPointerUp = (e: React.PointerEvent) => {
      setIsHelpDragging(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const [isMovingTecnigrafo, setIsMovingTecnigrafo] = useState(false);
  const [hoverMoveTecnigrafo, setHoverMoveTecnigrafo] = useState(false);
  const movingTecnigrafoStartRef = useRef<{ mouse: Point, origin: Point } | null>(null);

  const [copySourceEntityIds, setCopySourceEntityIds] = useState<string[]>([]);
  const [clonedEntityIds, setClonedEntityIds] = useState<Set<string>>(new Set());
  const [selectedRaccordoLineIds, setSelectedRaccordoLineIds] = useState<string[]>([]);
  const [selectedRaccordoClickPoints, setSelectedRaccordoClickPoints] = useState<Point[]>([]);

  useEffect(() => {
    if (activeTool === 'Copy') {
        setCopySourceEntityIds([]);
        setCopyPhase('idle');
        setStatusMessage("Seleziona gli oggetti da copiare, poi premi il tasto destro del mouse per confermare.");
    } else if (activeTool === 'Move') {
        setMoveSourceEntityIds([]);
        setMovePhase('idle');
        setStatusMessage("Seleziona gli oggetti da spostare, poi premi il tasto destro del mouse o Invio per confermare.");
    } else if (activeTool === 'Allunga') {
        setStatusMessage("Allunga: Clicca su un segmento vicino all'estremo da allungare. Proseguirà fino ad incontrare un altro oggetto.");
    } else {
        setCopyPhase('idle');
        setCopyBasePoint(null);
        setMovePhase('idle');
        setStatusMessage(null);
        if (clonedEntityIds.size > 0) {
            setEntities(prev => prev.filter(ent => !clonedEntityIds.has(ent.id)));
            setClonedEntityIds(new Set());
        }
    }
    setMoveBasePoint(null);
  }, [activeTool]);

  useEffect(() => {
    if (initialSelectedIds && initialSelectedIds.length > 0) {
      if (activeTool === 'Move' || activeTool === 'Copy' || activeTool === 'Cancella' || activeTool === 'Join' || activeTool === 'Specchio') {
          setDragEntityIds(initialSelectedIds);
          dragEntityIdsRef.current = initialSelectedIds;
          if (activeTool === 'Copy') {
              setCopySourceEntityIds(initialSelectedIds);
          }
          if (activeTool === 'Move') {
              setMoveSourceEntityIds(initialSelectedIds);
          }
          if (activeTool === 'Specchio') {
              setSpecchioSelectedIds(initialSelectedIds);
          }
      }
    }
  }, [initialSelectedIds, activeTool]);

  useEffect(() => {
    if (selectedEntityIds.length > 0) {
      const interval = setInterval(() => {
        renderRef.current?.();
      }, 30);
      return () => clearInterval(interval);
    }
  }, [selectedEntityIds]);

  useEffect(() => {
    if (activeTool !== 'Raccordo') {
      setSelectedRaccordoLineIds([]);
      setSelectedRaccordoClickPoints([]);
    }
    if (activeTool !== 'Specchio') {
      setSpecchioState('axis_start');
      setSpecchioAxisPt1(null);
      setSpecchioFinalAxis(null);
      setSpecchioHoverAxisLine(null);
      setSpecchioSelectedIds([]);
      setSpecchioMode('copy');
      setShowSpecchioDialog(false);
    }
    if (activeTool !== 'Allunga') {
      setAllungaHover(null);
    }
  }, [activeTool]);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastClickTimeRef = useRef<number>(0);
  const lastClickPosRef = useRef<{ x: number, y: number } | null>(null);
  const isHoldFiredRef = useRef<boolean>(false);
  const skipToolResetRef = useRef<boolean>(false);
  const isStickyCopyRef = useRef<boolean>(false);
  const dragHasMovedRef = useRef<boolean>(false);
  const lastDragMousePosRef = useRef<{ clientX: number; clientY: number; shiftKey: boolean; buttons: number } | null>(null);
  const dragFrameRequestedRef = useRef<boolean>(false);
  const [drawing, setDrawing] = useState<DrawingState | null>(null);
  const drawingRef = useRef<DrawingState | null>(null);
  useEffect(() => {
      drawingRef.current = drawing;
  }, [drawing]);
  const drawingProgressRef = useRef(1);
  useEffect(() => {
      if (drawing) {
          drawingProgressRef.current = 0;
          const start = performance.now();
          let frame: number;
          const animate = (time: number) => {
              const elapsed = time - start;
              const p = Math.min(elapsed / 300, 1);
              drawingProgressRef.current = p;
              renderRef.current?.();
              if (p < 1) frame = requestAnimationFrame(animate);
          };
          frame = requestAnimationFrame(animate);
          return () => cancelAnimationFrame(frame);
      } else {
        drawingProgressRef.current = 1;
        renderRef.current?.();
      }
  }, [drawing]);
  const [selectedParallelLine, setSelectedParallelLine] = useState<Entity | null>(null);
  const [highlightedTrimLine, setHighlightedTrimLine] = useState<Entity | null>(null);
  const [trimMode, setTrimMode] = useState<'normal' | 'smart'>('normal');
  const [highlightedTrimSegment, setHighlightedTrimSegment] = useState<{ type: 'line' | 'arc'; start?: Point; end?: Point; center?: Point; radius?: number; startAngle?: number; endAngle?: number } | null>(null);
  const [allungaHover, setAllungaHover] = useState<{ lineId: string; endExtending: 'start' | 'end'; originalPt: Point; targetPt: Point; pivotPt?: Point } | null>(null);
  const [hoverSnap, setHoverSnap] = useState<{
    point: Point;
    snapped: boolean;
    type: 'CAD' | 'smart';
    subtype?: string;
    refPoint?: Point;
    refEntityId?: string;
    refSegment?: { start: Point; end: Point; length: number };
    refLength?: number;
    constraintAxis?: 'x' | 'y';
    refPoint2?: Point;
    constraintAxis2?: 'x' | 'y';
    hasDoubleSmart?: boolean;
  } | null>(null);
  const [dragEntityId, setDragEntityId] = useState<string | null>(null);
  const dragEntityIdRef = useRef<string | null>(null);
  useEffect(() => { dragEntityIdRef.current = dragEntityId; }, [dragEntityId]);
  const [dragEntityIds, setDragEntityIds] = useState<string[]>([]);
  const dragEntityIdsRef = useRef<string[]>([]);
  useEffect(() => { dragEntityIdsRef.current = dragEntityIds; }, [dragEntityIds]);
  const [lockedFocalPoint, setLockedFocalPoint] = useState<Point | null>(null);
  const [tecnigrafoLock, setTecnigrafoLock] = useState<'x' | 'y' | null>(null);
  const [tecnigrafoOrigin, setTecnigrafoOrigin] = useState<Point | null>(null);
  const [activeMoveSnapPoint, setActiveMoveSnapPoint] = useState<Point | null>(null);
  const [selectionWindow, setSelectionWindow] = useState<{ start: Point; current: Point } | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({x: 0, y: 0});
  const [showSquadrette, setShowSquadrette] = useState(false);
  const [squadrette, setSquadrette] = useState<{
    id: string;
    type: '45' | '3060';
    pos: Point;
    rotation: number;
  }[]>([]);
  const [dragSquadrettaId, setDragSquadrettaId] = useState<string | null>(null);
  const [dragSquadrettaOffset, setDragSquadrettaOffset] = useState<Point>({ x: 0, y: 0 });
  const [lastSquadrettaInteractionAt, setLastSquadrettaInteractionAt] = useState(0);
  const [quickEditReferenceId, setQuickEditReferenceId] = useState<string | null>(null);

  const [eraserPos, setEraserPos] = useState({x: 0, y: 0});
  const [parallelDistance, setParallelDistance] = useState<number>(() => {
    try {
        const saved = localStorage.getItem('lastParallelDistance');
        return saved ? parseFloat(saved) : 10;
    } catch(e) {
        return 10;
    }
  });
  const [parallelInputString, setParallelInputString] = useState<string>(() => {
    try {
        const saved = localStorage.getItem('lastParallelDistance');
        return saved ? saved : '10';
    } catch(e) {
        return '10';
    }
  });
  const [parallelDistanceHistory, setParallelDistanceHistory] = useState<number[]>(() => {
      try {
          const saved = localStorage.getItem('lastParallelDistance');
          return saved ? [parseFloat(saved)] : [10];
      } catch(e) {
          return [10];
      }
  });

  const [isParallelBarHidden, setIsParallelBarHidden] = useState(false);

  useEffect(() => {
      if (activeTool === 'Parallel') {
          setSelectedParallelLine(null);
          setParallelMouse(null);
          setIsParallelBarHidden(false);
      }
  }, [activeTool]);

  const commitParallel = (explicitDist?: number) => {
      if (!selectedParallelLine) return;
      const line = selectedParallelLine as LineEntity;
      const p1 = line.start;
      const p2 = line.end;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const L = Math.sqrt(dx * dx + dy * dy);
      if (L <= 0) return;

      const nx = -dy / L;
      const ny = dx / L;

      let commitDistance = explicitDist;
      if (commitDistance === undefined || isNaN(commitDistance) || commitDistance <= 0) {
          const parsedInput = parseFloat(parallelInputString);
          if (!isNaN(parsedInput) && parsedInput > 0) {
              commitDistance = parsedInput;
          } else if (parallelDistance > 0) {
              commitDistance = parallelDistance;
          } else {
              commitDistance = 10;
          }
      }

      const curSign = parallelSign;
      const offset = curSign * commitDistance;

      const newLineId = Date.now().toString();
      const newLine: LineEntity = {
          id: newLineId,
          type: 'line',
          start: { x: p1.x + nx * offset, y: p1.y + ny * offset },
          end: { x: p2.x + nx * offset, y: p2.y + ny * offset },
          color: line.color,
          lineWidth: line.lineWidth,
          dashed: line.dashed,
          mode: line.mode,
          layer: line.layer,
          parentLineId: line.id
      };

      setEntities(prev => {
          return autoCornerParallel(newLine, prev);
      });

      try {
          localStorage.setItem('lastParallelDistance', commitDistance.toString());
      } catch(e) {}

      setParallelDistance(commitDistance);
      setParallelInputString(commitDistance.toString());
      setParallelDistanceHistory(hist => {
          const newHist = Array.from(new Set([commitDistance, ...hist]));
          return newHist.slice(0, 6);
      });
      setIsParallelWheelActive(true);
      lastParallelCommitTimeRef.current = Date.now();

      // Make the newly created parallel line the seed segment for subsequent clicks (multiple parallels)
      setSelectedParallelLine(newLine);
      setParallelMouse(actualMousePosRef.current);
      fnStepValueRef.current = commitDistance;
      setIsParallelBarHidden(true);
      lastParallelOffsetInfoRef.current = {
          distance: commitDistance,
          lineId: newLineId,
          refLineId: line.id,
          nx,
          ny,
          dirSign: curSign,
          timestamp: Date.now()
      };
      justOffsetLineIdRef.current = newLineId;
  };
  const [parallelMouse, setParallelMouse] = useState<Point | null>(null);
  const [isParallelWheelActive, setIsParallelWheelActive] = useState(false);
  useEffect(() => {
    if (cancelTrigger > 0) {
      setDrawing(null);
    }
  }, [cancelTrigger]);

  useEffect(() => {
    if (isContinuousMode && parallelDistance > 0 && activeTool === 'Parallel') {
      setIsParallelWheelActive(true);
      if (!fnAnchorCanvasPosRef.current) {
        fnAnchorCanvasPosRef.current = actualMousePosRef.current;
        fnStepValueRef.current = parallelDistance;
      }
    }
  }, [isContinuousMode, activeTool, parallelDistance]);

  // Parallel input is triggered by typing on the keyboard instead of opening automatically

  const [isJollyActive, setIsJollyActive] = useState(false);
  const isJollyActiveRef = useRef(false);
  useEffect(() => {
    isJollyActiveRef.current = isJollyActive;
  }, [isJollyActive]);
  const [isMagicCopyActive, setIsMagicCopyActive] = useState(false);
  const isMagicCopyActiveRef = useRef(false);
  const [circleTangentLine1, setCircleTangentLine1] = useState<LineEntity | null>(null);
  const [circleTangentClickPt1, setCircleTangentClickPt1] = useState<Point | null>(null);

  useEffect(() => {
    if (activeTool !== 'Circle') {
      setCircleTangentLine1(null);
      setCircleTangentClickPt1(null);
    }
  }, [activeTool]);

  useEffect(() => {
    if (cancelTrigger > 0) {
      setDrawing(null);
      setCircleTangentLine1(null);
      setCircleTangentClickPt1(null);
    }
  }, [cancelTrigger]);

  const isSKeyPressedRef = useRef(false);
  const [parallelSign, setParallelSign] = useState<number>(1);
  const [specchioState, setSpecchioState] = useState<'axis_start' | 'axis_end' | 'objects' | 'dialog'>('axis_start');
  const [specchioAxisPt1, setSpecchioAxisPt1] = useState<Point | null>(null);
  const [specchioFinalAxis, setSpecchioFinalAxis] = useState<{start: Point, end: Point, isExisting: boolean, entityId?: string} | null>(null);
  const [specchioHoverAxisLine, setSpecchioHoverAxisLine] = useState<Entity | null>(null);
  const [specchioSelectedIds, setSpecchioSelectedIds] = useState<string[]>([]);
  const [specchioMode, setSpecchioMode] = useState<'copy' | 'move'>('copy');
  const [showSpecchioDialog, setShowSpecchioDialog] = useState(false);
  const lastControlledPointRef = useRef<Point>({ x: 0, y: 0 });
  const actualMousePosRef = useRef<Point>({ x: 0, y: 0 });
  const mouseScreenPosRef = useRef<Point>({ x: 0, y: 0 });
  const [isLocked, setIsLocked] = useState(false);
  const [positioningDimId, setPositioningDimId] = useState<string | null>(null);
  const [hoveredDimensionEntityId, setHoveredDimensionEntityId] = useState<string | null>(null);
  const [positioningGroupId, setPositioningGroupId] = useState<string | null>(null);
  const [positioningGroupStartPos, setPositioningGroupStartPos] = useState<Point | null>(null);
  const [positioningEntityId, setPositioningEntityId] = useState<string | null>(null);
  const [positioningEntityStartPos, setPositioningEntityStartPos] = useState<Point | null>(null);

  const [lastWallThickness, setLastWallThickness] = useState(() => parseFloat(localStorage.getItem('lastWallThickness') || '15'));
  const [lastWallRenderMode, setLastWallRenderMode] = useState(() => (localStorage.getItem('bimWallRenderMode') as 'solid' | 'transparent') || 'solid');
  useEffect(() => {
    if (bimWallRenderMode) {
      setLastWallRenderMode(bimWallRenderMode);
    }
  }, [bimWallRenderMode]);
  const [lastDoorWidth, setLastDoorWidth] = useState(() => parseFloat(localStorage.getItem('lastDoorWidth') || '80'));
  const [lastDoorHeight, setLastDoorHeight] = useState(() => parseFloat(localStorage.getItem('lastDoorHeight') || '210'));
  const [lastWindowWidth, setLastWindowWidth] = useState(() => parseFloat(localStorage.getItem('lastWindowWidth') || '120'));
  const [lastWindowHeight, setLastWindowHeight] = useState(() => parseFloat(localStorage.getItem('lastWindowHeight') || '140'));
  const [lastWindowZElevation, setLastWindowZElevation] = useState(() => parseFloat(localStorage.getItem('lastWindowZElevation') || '100'));
  const [lastWindowType, setLastWindowType] = useState(() => localStorage.getItem('lastWindowType') || 'singola');
  const [lastWindowFlip, setLastWindowFlip] = useState(() => localStorage.getItem('lastWindowFlip') === 'true');

  const [quickEditEntityId, setQuickEditEntityId] = useState<string | null>(null);
  const [quickEditValue, setQuickEditValue] = useState<string>('');
  const [quickEditOffset, setQuickEditOffset] = useState<string>('0');
  const [quickEditPos, setQuickEditPos] = useState<Point | null>(null);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [hoveredLineIdPending, setHoveredLineIdPending] = useState<string | null>(null);
  const [hoveredCircleId, setHoveredCircleId] = useState<string | null>(null);




  const handleQuickEditCommit = (newValueStr: string, newOffsetStr: string, commitHistory = true) => {
      if (!quickEditEntityId) return;
      const val = parseFloat(newValueStr.replace(',', '.'));
      const offsetVal = parseFloat(newOffsetStr.replace(',', '.'));
      if (isNaN(val) || val <= 0) {
          setQuickEditEntityId(null);
          return;
      }

      let updatedLineRef: LineEntity | null = null;

      setEntities(prev => {
          onCommitHistory?.(prev);
          return prev.map(ent => {
              if (ent.id !== quickEditEntityId) return ent;
              if (ent.type === 'line') {
                  const line = ent as LineEntity;
                  const dx = line.end.x - line.start.x;
                  const dy = line.end.y - line.start.y;
                  const currentL = Math.sqrt(dx * dx + dy * dy);
                  if (currentL === 0) return ent;
                  const nx = dx / currentL;
                  const ny = dy / currentL;

                  const perpX = -dy / currentL;
                  const perpY = dx / currentL;

                  let newStart = { ...line.start };
                  let newEnd = {
                      x: line.start.x + nx * val,
                      y: line.start.y + ny * val
                  };

                  if (!isNaN(offsetVal)) {
                      if (quickEditReferenceId) {
                          const refEnt = prev.find(e => e.id === quickEditReferenceId);
                          if (refEnt && refEnt.type === 'line') {
                              const refLine = refEnt as LineEntity;
                              // Calculate current offset vector from reference
                              const refDx = refLine.end.x - refLine.start.x;
                              const refDy = refLine.end.y - refLine.start.y;
                              const refL = Math.hypot(refDx, refDy);
                              if (refL > 0) {
                                  const rnx = -refDy / refL;
                                  const rny = refDx / refL;
                                  const curOff = (newStart.x - refLine.start.x) * rnx + (newStart.y - refLine.start.y) * rny;
                                  const sign = curOff >= 0 ? 1 : -1;
                                  const moveDist = (offsetVal * sign) - curOff;
                                  
                                  newStart.x += rnx * moveDist;
                                  newStart.y += rny * moveDist;
                                  newEnd.x += rnx * moveDist;
                                  newEnd.y += rny * moveDist;
                              }
                          }
                      } else if (offsetVal !== 0) {
                          newStart.x += perpX * offsetVal;
                          newStart.y += perpY * offsetVal;
                          newEnd.x += perpX * offsetVal;
                          newEnd.y += perpY * offsetVal;
                      }
                  }

                  let updatedInkPoints = line.inkPoints;
                  if (line.inkPoints && currentL > 0) {
                      const scale = val / currentL;
                      updatedInkPoints = line.inkPoints.map(pt => ({
                          ...pt,
                          x: newStart.x + (pt.x - line.start.x) * scale,
                          y: newStart.y + (pt.y - line.start.y) * scale
                      }));
                  }
                  const updatedLine = {
                      ...line,
                      start: newStart,
                      end: newEnd,
                      inkPoints: updatedInkPoints
                  };
                  updatedLineRef = updatedLine;
                  return updatedLine;
              } else if (ent.type === 'circle') {
                  return {
                      ...ent,
                      radius: val
                  };
              } else if (ent.type === 'rectangle') {
                  const rect = ent as any;
                  const w = val;
                  const h = rect.p2.y - rect.p1.y;
                  return {
                      ...rect,
                      p2: {
                          x: rect.p1.x + w,
                          y: rect.p1.y + h
                      }
                  };
              }
              return ent;
          });
      });
      setQuickEditEntityId(null);
      setQuickEditValue('');
      setQuickEditOffset('0');
      if (updatedLineRef) {
          alignCursorToLineEndpointInternal(updatedLineRef);
      }
  };

  interface TextDialogState {
    id?: string;
    point: Point;
    text: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    textAlign: 'left' | 'center' | 'right' | 'justify';
    color: string;
  }
  const [textDialog, setTextDialog] = useState<TextDialogState | null>(null);
  const lastMouseRef = useRef<Point>({ x: 0, y: 0 });
  const isZoomModeRef = useRef(false);
  const zoomFocusRef = useRef<Point | null>(null);
  const isDraggingZoomRef = useRef(false);
  const isDraggingPanRef = useRef(false);
  const lastScreenMouseRef = useRef<Point>({ x: 0, y: 0 });
  const previousMouseRef = useRef<Point>({ x: 0, y: 0 });
  const lastEraserExecutionTime = useRef(0);
  const lastParallelCommitTimeRef = useRef(0);
  const lastEraseTimeByEntityId = useRef<Record<string, number>>({});
  const lastEraseTimeByPoint = useRef<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const lastCircleRadiusRef = useRef<number | null>((() => {
    try {
      const saved = localStorage.getItem('lastCircleRadius');
      return saved ? parseFloat(saved) : null;
    } catch (e) {
      return null;
    }
  })());
  const fnStepValueRef = useRef<number>(0);
  const fnAnchorCanvasPosRef = useRef<Point | null>(null);
  const freehandOrthoAnchorRef = useRef<Point | null>(null);
  const dragStartPosRef = useRef<Point | null>(null);
  const previousToolBeforeShortcutRef = useRef<string | null>(null);
  const [copyPhase, setCopyPhase] = useState<'idle' | 'selectBasePoint' | 'selectDestinationPoint'>('idle');
  const [copyBasePoint, setCopyBasePoint] = useState<Point | null>(null);
  const [movePhase, setMovePhase] = useState<'idle' | 'selectBasePoint' | 'selectDestinationPoint'>('idle');
  const [moveSourceEntityIds, setMoveSourceEntityIds] = useState<string[]>([]);
  const [moveBasePoint, setMoveBasePoint] = useState<Point | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [tooltipMousePos, setTooltipMousePos] = useState<{ x: number, y: number } | null>(null);
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
  const [hoveredEntityIdPending, setHoveredEntityIdPending] = useState<string | null>(null);
  const [circleRadiusInputString, setCircleRadiusInputString] = useState<string>('');
  const circleRadiusInputStringRef = useRef(circleRadiusInputString);
  useEffect(() => {
    circleRadiusInputStringRef.current = circleRadiusInputString;
  }, [circleRadiusInputString]);

  // Active parallel pair detected in render loop for direct keyboard numeric distance override
  const activeParallelPairRef = useRef<{
    lineId: string;
    refLineId: string;
    nx: number;
    ny: number;
    signedDist: number;
    currentDist: number;
  } | null>(null);

  // Memorizza l'ultimo offset impostato per creare automaticamente il riferimento per gli offset successivi uguali
  // (Attivo SOLO se l'utente ha cliccato sul pulsante Offset)
  const isOffsetAidActiveRef = useRef<boolean>(isOffsetAidActive);
  const lastParallelOffsetInfoRef = useRef<{
    distance: number;
    lineId: string;
    refLineId: string;
    nx: number;
    ny: number;
    dirSign: number;
    timestamp: number;
  } | null>(null);
  const justOffsetLineIdRef = useRef<string | null>(null);
  const parallelOverrideLockedLineRef = useRef<{
    lineId: string;
    mousePosAtLock: Point;
    timestamp: number;
  } | null>(null);

  useEffect(() => {
    isOffsetAidActiveRef.current = isOffsetAidActive;
    if (!isOffsetAidActive) {
      parallelOverrideLockedLineRef.current = null;
    }
    renderRef.current?.();
  }, [isOffsetAidActive]);

  const isMoveCopyOrOffsetAidActive = (): boolean => {
    return (
      isOffsetAidActiveRef.current ||
      activeToolRef.current === 'Parallel' ||
      activeToolRef.current === 'Move' ||
      activeToolRef.current === 'Copy' ||
      isJollyActiveRef.current ||
      isMagicCopyActiveRef.current
    );
  };

  const getEffectiveLastParallelOffset = (ents?: Entity[]): number => {
    if (!isMoveCopyOrOffsetAidActive()) {
      return 0;
    }
    if (lastParallelOffsetInfoRef.current && lastParallelOffsetInfoRef.current.distance > 0.05) {
      return lastParallelOffsetInfoRef.current.distance;
    }
    const list = ents || entitiesRef.current;
    if (list && list.length >= 2) {
      const lines = list.filter(e => e.type === 'line' && !(e as any).isSimmetryAxis && !(e as any).hideIn2D) as LineEntity[];
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 8); i--) {
        const l1 = lines[i];
        const dx1 = l1.end.x - l1.start.x;
        const dy1 = l1.end.y - l1.start.y;
        const len1 = Math.hypot(dx1, dy1);
        if (len1 < 0.5) continue;
        const tx1 = dx1 / len1;
        const ty1 = dy1 / len1;
        const nx1 = -ty1;
        const ny1 = tx1;

        let bestD = Infinity;
        let bestRef: LineEntity | null = null;
        let bestSign = 1;
        for (let j = i - 1; j >= 0; j--) {
          const l2 = lines[j];
          const dx2 = l2.end.x - l2.start.x;
          const dy2 = l2.end.y - l2.start.y;
          const len2 = Math.hypot(dx2, dy2);
          if (len2 < 0.5) continue;
          const tx2 = dx2 / len2;
          const ty2 = dy2 / len2;
          if (Math.abs(tx1 * tx2 + ty1 * ty2) > 0.995) {
            const pS = (l2.start.x - l1.start.x) * tx1 + (l2.start.y - l1.start.y) * ty1;
            const pE = (l2.end.x - l1.start.x) * tx1 + (l2.end.y - l1.start.y) * ty1;
            const minP = Math.min(pS, pE);
            const maxP = Math.max(pS, pE);
            if (Math.min(len1, maxP) - Math.max(0, minP) > -50) {
              const sD = (l1.start.x - l2.start.x) * nx1 + (l1.start.y - l2.start.y) * ny1;
              const d = Math.abs(sD);
              if (d > 0.2 && d < 600 && d < bestD) {
                bestD = d;
                bestRef = l2;
                bestSign = sD >= 0 ? 1 : -1;
              }
            }
          }
        }
        if (bestRef && bestD < 600) {
          lastParallelOffsetInfoRef.current = {
            distance: bestD,
            lineId: l1.id,
            refLineId: bestRef.id,
            nx: nx1,
            ny: ny1,
            dirSign: bestSign,
            timestamp: Date.now()
          };
          return bestD;
        }
      }
    }
    try {
      const saved = localStorage.getItem('lastParallelDistance');
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed > 0.05) {
          return parsed;
        }
      }
    } catch (e) {}
    return 0;
  };

  const recordParallelOffsetFromNewLine = (newLine: LineEntity, ents: Entity[]) => {
    if (!isMoveCopyOrOffsetAidActive()) return;
    const dx = newLine.end.x - newLine.start.x;
    const dy = newLine.end.y - newLine.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    const tx = dx / len;
    const ty = dy / len;
    const nx = -ty;
    const ny = tx;

    let minD = Infinity;
    let bestRef: LineEntity | null = null;
    let bestSign = 1;
    for (const other of ents) {
      if (other.id !== newLine.id && other.type === 'line' && !(other as any).isSimmetryAxis && !(other as any).hideIn2D) {
        const oLine = other as LineEntity;
        const odx = oLine.end.x - oLine.start.x;
        const ody = oLine.end.y - oLine.start.y;
        const oLen = Math.hypot(odx, ody);
        if (oLen < 0.5) continue;
        const otx = odx / oLen;
        const oty = ody / oLen;
        if (Math.abs(tx * otx + ty * oty) > 0.995) {
          const pS = (oLine.start.x - newLine.start.x) * tx + (oLine.start.y - newLine.start.y) * ty;
          const pE = (oLine.end.x - newLine.start.x) * tx + (oLine.end.y - newLine.start.y) * ty;
          const minP = Math.min(pS, pE);
          const maxP = Math.max(pS, pE);
          if (Math.min(len, maxP) - Math.max(0, minP) > -60) {
            const sD = (newLine.start.x - oLine.start.x) * nx + (newLine.start.y - oLine.start.y) * ny;
            const d = Math.abs(sD);
            if (d > 0.2 && d < 600 && d < minD) {
              minD = d;
              bestRef = oLine;
              bestSign = sD >= 0 ? 1 : -1;
            }
          }
        }
      }
    }
    if (bestRef && minD < 600) {
      lastParallelOffsetInfoRef.current = {
        distance: minD,
        lineId: newLine.id,
        refLineId: bestRef.id,
        nx,
        ny,
        dirSign: bestSign,
        timestamp: Date.now()
      };
      justOffsetLineIdRef.current = newLine.id;
    }
  };

  const [liveNumericOverride, setLiveNumericOverride] = useState<{
    kind: 'parallel_dist' | 'drawing_line' | 'line_length';
    text: string;
    lineId?: string;
    refLineId?: string;
    nx?: number;
    ny?: number;
    dirFromRefToLine?: number;
    timestamp: number;
  } | null>(null);
  const liveNumericOverrideRef = useRef(liveNumericOverride);
  useEffect(() => {
    liveNumericOverrideRef.current = liveNumericOverride;
  }, [liveNumericOverride]);

  useEffect(() => {
    if (hoveredLineIdPending && activeTool !== 'Trim') {
        setHoveredLineId(hoveredLineIdPending);
        setHoveredEntityId(hoveredEntityIdPending);
    } else if (!hoveredLineIdPending) {
        setHoveredLineId(null);
        setHoveredEntityId(null);
    }
  }, [hoveredLineIdPending, hoveredEntityIdPending, activeTool]);

  const activeToolRef = useRef(activeTool);
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  const activeLayerIdRef = useRef(activeLayerId);
  useEffect(() => {
    activeLayerIdRef.current = activeLayerId;
  }, [activeLayerId]);

  const defaultLineStyleRef = useRef(defaultLineStyle);
  useEffect(() => {
    defaultLineStyleRef.current = defaultLineStyle;
  }, [defaultLineStyle]);

  useEffect(() => {
    if (!drawing) {
        setCircleRadiusInputString('');
        if (liveNumericOverrideRef.current?.kind === 'drawing_line') {
            setLiveNumericOverride(null);
        }
    }
  }, [drawing]);

  useEffect(() => {
    if (!drawing?.wheelLength && !isParallelWheelActive) {
        fnAnchorCanvasPosRef.current = null;
        fnStepValueRef.current = 0;
    }
  }, [drawing?.wheelLength, isParallelWheelActive]);

  const isPrecisionActive = (drawing && drawing.wheelLength !== undefined) || 
                            (activeTool === 'Parallel' && selectedParallelLine && isParallelWheelActive);

  const resolveGroups = (ids: string[], currentEntities: Entity[]): string[] => {
    const groupIds = new Set<string>();
    
    let includesTempSelection = false;
    if (selectedEntityIds.length > 0) {
        for (const id of ids) {
            if (selectedEntityIds.includes(id)) {
                includesTempSelection = true;
                break;
            }
        }
    }

    currentEntities.forEach(ent => {
        if (ids.includes(ent.id) && ent.groupId) {
            groupIds.add(ent.groupId);
        }
    });
    
    if (groupIds.size === 0 && !includesTempSelection) return ids;
    
    const allIds = new Set(ids);
    if (includesTempSelection) {
        selectedEntityIds.forEach(id => allIds.add(id));
    }
    currentEntities.forEach(ent => {
        if (ent.groupId && groupIds.has(ent.groupId)) {
            allIds.add(ent.id);
        }
    });
    return Array.from(allIds);
  };

  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const isShiftPressedRef = useRef(false);
  const isWheelDecimalRef = useRef(false);
  const lastCapsLockStateRef = useRef<boolean | null>(null);
  const isPanningRef = useRef(false);
  const [isZoomActive, setIsZoomActive] = useState(false);
  useEffect(() => {
    const isBlocFnEvent = (e: KeyboardEvent) => {
      const k = (e.key || '').toLowerCase();
      return (
        e.key === 'Shift' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight' ||
        e.key === 'CapsLock' ||
        e.code === 'CapsLock' ||
        e.keyCode === 20 ||
        (e as any).which === 20 ||
        e.key === 'Fn' ||
        e.code === 'Fn' ||
        e.key === 'FnLock' ||
        e.code === 'FnLock' ||
        e.key === 'ShiftLock' ||
        k === 'f'
      );
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (isBlocFnEvent(e)) {
        setIsShiftPressed(false);
        isShiftPressedRef.current = false;
      }
    };

    const handleArrowsLine = (e: KeyboardEvent) => {
      if ((activeTool !== 'Line' && (activeTool as string) !== 'Filo')) return;
      
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!keys.includes(e.key)) return;

      e.preventDefault();
      
      // Get current snap point as start if not already drawing
      let currentStart = drawing?.start;
      if (!currentStart) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const rawMouse = screenToCanvas(mouseScreenPosRef.current.x - rect.left, mouseScreenPosRef.current.y - rect.top);
        const snapped = getSnappedPoint(rawMouse, entities, activeTool as any, null);
        currentStart = snapped.point;
      }

      let lockedDir = { x: 0, y: 0 };
      if (e.key === 'ArrowRight') lockedDir = { x: 1, y: 0 };
      if (e.key === 'ArrowLeft') lockedDir = { x: -1, y: 0 };
      if (e.key === 'ArrowDown') lockedDir = { x: 0, y: 1 };
      if (e.key === 'ArrowUp') lockedDir = { x: 0, y: -1 };

      setDrawing({
        start: currentStart,
        current: currentStart,
        lockedDir: lockedDir,
        isVirtual: true
      });
      
      const screenPos = canvasToScreen(currentStart.x, currentStart.y);

    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Intercept keyboard input while drawing a circle for real-time radius typing & backspace correction
      if (activeToolRef.current === 'Circle' && drawingRef.current) {
        const key = e.key;

        // Digits, decimal point, comma
        if ((key >= '0' && key <= '9') || key === '.' || key === ',') {
          e.preventDefault();
          const char = key === ',' ? '.' : key;
          const currentStr = circleRadiusInputStringRef.current;
          if (char === '.' && currentStr.includes('.')) return;
          const newStr = currentStr + (key === ',' ? ',' : char);
          setCircleRadiusInputString(newStr);
          circleRadiusInputStringRef.current = newStr;
          const num = parseFloat(newStr.replace(',', '.'));
          if (!isNaN(num) && num > 0) {
            setDrawing(d => d ? { ...d, current: { x: d.start.x + num, y: d.start.y } } : null);
          }
          renderRef.current?.();
          return;
        }

        // Backspace / Delete allows live correction of the typed radius value
        if (key === 'Backspace' || key === 'Delete') {
          e.preventDefault();
          const currentStr = circleRadiusInputStringRef.current;
          if (currentStr.length > 0) {
            const newStr = currentStr.slice(0, -1);
            setCircleRadiusInputString(newStr);
            circleRadiusInputStringRef.current = newStr;
            const num = parseFloat(newStr.replace(',', '.'));
            if (!isNaN(num) && num > 0) {
              setDrawing(d => d ? { ...d, current: { x: d.start.x + num, y: d.start.y } } : null);
            } else {
              setDrawing(d => d ? { ...d, current: lastMouseRef.current } : null);
            }
            renderRef.current?.();
          }
          return;
        }

        // Enter confirms the circle with typed or current radius
        if (key === 'Enter') {
          e.preventDefault();
          const d = drawingRef.current;
          if (d) {
            let radius = Math.hypot(d.current.x - d.start.x, d.current.y - d.start.y);
            if (circleRadiusInputStringRef.current) {
              const parsed = parseFloat(circleRadiusInputStringRef.current.replace(',', '.'));
              if (!isNaN(parsed) && parsed > 0) {
                radius = parsed;
              }
            }
            if (radius > 0.001) {
              const newEntity: CircleEntity = {
                id: Date.now().toString(),
                type: 'circle',
                color: defaultLineStyleRef.current?.color || '#000000',
                lineWidth: defaultLineStyleRef.current?.lineWidth || 1,
                dashed: defaultLineStyleRef.current?.dashed || false,
                mode: defaultLineStyleRef.current?.mode || 'pencil',
                center: d.start,
                radius: radius,
                layer: activeLayerIdRef.current || '0'
              };
              lastCircleRadiusRef.current = radius;
              try { localStorage.setItem('lastCircleRadius', radius.toString()); } catch(err){}
              setEntities(prev => {
                onCommitHistory?.(prev);
                return [...prev, newEntity];
              });
              setDrawing(null);
              setCircleRadiusInputString('');
              circleRadiusInputStringRef.current = '';
              renderRef.current?.();
            }
          }
          return;
        }

        // Escape clears typed radius string or cancels circle creation
        if (key === 'Escape') {
          e.preventDefault();
          if (circleRadiusInputStringRef.current) {
            setCircleRadiusInputString('');
            circleRadiusInputStringRef.current = '';
            setDrawing(d => d ? { ...d, current: lastMouseRef.current } : null);
          } else {
            setDrawing(null);
          }
          renderRef.current?.();
          return;
        }
      }

      handleArrowsLine(e);
      if (isBlocFnEvent(e)) {
        setIsShiftPressed(true);
        isShiftPressedRef.current = true;
      }
    };
    const handleBlur = () => {
      setIsShiftPressed(false);
      isShiftPressedRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp, { passive: true });
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
     if (skipToolResetRef.current) {
         skipToolResetRef.current = false;
         return;
     }
     setDrawing(null);
     setSelectedParallelLine(null);
     setHighlightedTrimLine(null);
     setHighlightedTrimSegment(null);
     setDragEntityId(null);
     if (activeTool !== 'Move') {
         setDragEntityIds([]);
     }
     setSelectionWindow(null);
     setPositioningDimId(null);
     setParallelMouse(null);
     setActiveMoveSnapPoint(null);
     setCopySourceEntityIds([]);
     setClonedEntityIds(new Set());
  }, [activeTool]);

  const getEntitiesInWindow = (start: Point, current: Point, entities: Entity[]): string[] => {
    const minX = Math.min(start.x, current.x);
    const maxX = Math.max(start.x, current.x);
    const minY = Math.min(start.y, current.y);
    const maxY = Math.max(start.y, current.y);

    const isCrossing = current.x < start.x;

    const isPointInside = (p: Point) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
    
    const lineIntersectsRect = (p1: Point, p2: Point) => {
        // Liang-Barsky or just check if either endpoint is inside OR if line segments intersect any side
        if (isPointInside(p1) || isPointInside(p2)) return true;
        
        // Simple bounding box overlap check for crossing
        const lMinX = Math.min(p1.x, p2.x);
        const lMaxX = Math.max(p1.x, p2.x);
        const lMinY = Math.min(p1.y, p2.y);
        const lMaxY = Math.max(p1.y, p2.y);
        
        return !(lMaxX < minX || lMinX > maxX || lMaxY < minY || lMinY > maxY);
    };

    return entities.filter(ent => {
        const layer = layers.find(l => l.id === ent.layer);
        if (layer && (!layer.visible || layer.frozen)) return false;
        
        if (isCrossing) {
            // Crossing selection (Right to Left): select if any part is inside/touches
            if (ent.type === 'line' || ent.type === 'dimension') return lineIntersectsRect(ent.start, ent.end);
            if (ent.type === 'circle' || ent.type === 'arc') {
                const closestX = Math.max(minX, Math.min(ent.center.x, maxX));
                const closestY = Math.max(minY, Math.min(ent.center.y, maxY));
                const distSq = (ent.center.x - closestX) ** 2 + (ent.center.y - closestY) ** 2;
                return distSq <= ent.radius ** 2;
            }
            if (ent.type === 'rectangle') {
                const rMinX = Math.min(ent.p1.x, ent.p2.x);
                const rMaxX = Math.max(ent.p1.x, ent.p2.x);
                const rMinY = Math.min(ent.p1.y, ent.p2.y);
                const rMaxY = Math.max(ent.p1.y, ent.p2.y);
                return !(rMaxX < minX || rMinX > maxX || rMaxY < minY || rMinY > maxY);
            }
            if (ent.type === 'point') return isPointInside(ent.point);
            if (ent.type === 'text' || ent.type === 'image') return isPointInside(ent.point);
            if (ent.type === 'hatch') {
                const h = ent as any;
                if (!h.points || h.points.length === 0) return false;
                // Crossing: true if any point is inside the rect, or if the rect intersects boundary, but let's approximate with any point inside
                return h.points.some((p: Point) => isPointInside(p));
            }
            return false;
        } else {
            // Window selection (Left to Right): select only if fully inside
            if (ent.type === 'line' || ent.type === 'dimension') return isPointInside(ent.start) && isPointInside(ent.end);
            if (ent.type === 'circle' || ent.type === 'arc') {
                return ent.center.x - ent.radius >= minX && ent.center.x + ent.radius <= maxX &&
                       ent.center.y - ent.radius >= minY && ent.center.y + ent.radius <= maxY;
            }
            if (ent.type === 'rectangle') return isPointInside(ent.p1) && isPointInside(ent.p2);
            if (ent.type === 'point') return isPointInside(ent.point);
            if (ent.type === 'text' || ent.type === 'image') return isPointInside(ent.point);
            if (ent.type === 'hatch') {
                const h = ent as any;
                if (!h.points || h.points.length === 0) return false;
                return h.points.every((p: Point) => isPointInside(p));
            }
            return false;
        }
    }).map(e => e.id);
  };

  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(prev => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useImperativeHandle(ref, () => ({
    alignCursorToLineEndpoint: (updatedLine: LineEntity) => {
      alignCursorToLineEndpointInternal(updatedLine);
    },
    getCurrentMousePosition: () => lastMouseRef.current,
    rotateMaskAtPoint: (e: React.MouseEvent | React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return false;
      const rect = canvas.getBoundingClientRect();
      const rawPoint = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
      const found = getEntityAtPoint(rawPoint);
      if (found && found.groupId) {
        const direction = e.altKey ? -1 : 1;
        rotateGroup(found.groupId, 90 * direction);
        return true;
      }
      return false;
    },
    editRaccordo: (
      id1: string,
      id2: string,
      clickPt1: Point,
      clickPt2: Point,
      existingRaccordoId: string,
      config: { type: 'curvo' | 'rettilineo' | 'taglia'; value: number },
      originalLine1: any,
      originalLine2: any
    ) => {
      applyRaccordo(id1, id2, clickPt1, clickPt2, existingRaccordoId, config, { originalLine1, originalLine2 });
    },
    setBIMDefaults: (
      width: number, 
      height: number | undefined, 
      type: 'door' | 'window' | 'wall', 
      zElevation?: number, 
      windowType?: string, 
      flipLeft?: boolean, 
      flipSide?: boolean, 
      rotation?: number
    ) => {
      if (type === 'door') {
        setLastDoorWidth(width);
        if (height !== undefined) {
          setLastDoorHeight(height);
          localStorage.setItem('lastDoorHeight', height.toString());
        }
        localStorage.setItem('lastDoorWidth', width.toString());
      } else if (type === 'window') {
        setLastWindowWidth(width);
        if (height !== undefined) {
          setLastWindowHeight(height);
          localStorage.setItem('lastWindowHeight', height.toString());
        }
        if (zElevation !== undefined) {
          setLastWindowZElevation(zElevation);
          localStorage.setItem('lastWindowZElevation', zElevation.toString());
        }
        if (windowType) {
          setLastWindowType(windowType);
          localStorage.setItem('lastWindowType', windowType);
        }
        if (flipLeft !== undefined) {
          setLastWindowFlip(flipLeft); // Compatibility with existing field
          localStorage.setItem('lastWindowFlip', flipLeft.toString());
        }
        if (flipSide !== undefined) {
          localStorage.setItem('lastWindowFlipSide', flipSide.toString());
        }
        if (rotation !== undefined) {
          localStorage.setItem('lastWindowRotation', rotation.toString());
        }
        localStorage.setItem('lastWindowWidth', width.toString());
      } else if (type === 'wall') {
        setLastWallThickness(width);
        localStorage.setItem('lastWallThickness', width.toString());
      }
    },
    autoScanBIM: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const width = canvas.width;
      const height = canvas.height;

      // --- 1. AUTOMATIC ROOM DETECTION ---
      // We sample a 40x40 grid of points across the canvas.
      const gridCols = 40;
      const gridRows = 40;
      const stepX = Math.max(8, Math.round(width / gridCols));
      const stepY = Math.max(8, Math.round(height / gridRows));

      const detectedPolygons: { points: Point[], holes?: Point[][] }[] = [];

      // Helpers for centroid and area
      const getCentroid = (pts: Point[]): Point => {
        let cx = 0, cy = 0;
        pts.forEach(p => { cx += p.x; cy += p.y; });
        return { x: cx / pts.length, y: cy / pts.length };
      };

      const getArea = (pts: Point[]): number => {
        let area = 0;
        const len = pts.length;
        for (let i = 0; i < len; i++) {
          const p1 = pts[i];
          const p2 = pts[(i + 1) % len];
          area += p1.x * p2.y - p2.x * p1.y;
        }
        return Math.abs(area) / 2;
      };

      const getFullArea = (poly: { points: Point[], holes?: Point[][] }): number => {
        let totalArea = getArea(poly.points);
        if (poly.holes) {
          poly.holes.forEach(hole => {
            totalArea -= getArea(hole);
          });
        }
        return Math.max(0, totalArea);
      };

      // Loop through our screen search grid
      for (let c = 1; c < gridCols; c++) {
        for (let r = 1; r < gridRows; r++) {
          const x = c * stepX;
          const y = r * stepY;
          const screenPt = { x, y };

    const poly = findBoundaryPolygon(screenPt, entities, view, width, height, screenToCanvas, layers);
    if (poly && poly.points.length > 2) {
        const centroid = getCentroid(poly.points);
        const area = getFullArea(poly);
        const areaMq = area / 10000;

        if (areaMq < 1.0 || areaMq > 150) continue;

        let isDuplicate = false;
        for (const existing of detectedPolygons) {
            const exCentroid = getCentroid(existing.points);
            const dist = Math.sqrt((centroid.x - exCentroid.x)**2 + (centroid.y - exCentroid.y)**2);
            const exArea = getFullArea(existing);
            const areaDiff = Math.abs(area - exArea) / exArea;

            if (dist < 15 || (dist < 35 && areaDiff < 0.12)) {
                isDuplicate = true;
                break;
            }
        }

        if (!isDuplicate) {
            detectedPolygons.push(poly);
        }
    }
        }
      }

      // Group placed template entities to locate furniture inside each room partition
      const groupEntitiesMap = new Map<string, Entity[]>();
      entities.forEach(ent => {
        if (ent.groupId) {
          if (!groupEntitiesMap.has(ent.groupId)) {
            groupEntitiesMap.set(ent.groupId, []);
          }
          groupEntitiesMap.get(ent.groupId)!.push(ent);
        }
      });

      const groupCentroids: { groupId: string; templateId: string; center: Point }[] = [];
      groupEntitiesMap.forEach((gEnts, gId) => {
        let templateId = "";
        for (const ent of gEnts) {
          if (ent.templateId) {
            templateId = ent.templateId;
            break;
          }
        }

        // Estimate a centroid for this placed block/furniture group
        let sumX = 0, sumY = 0, count = 0;
        gEnts.forEach(ent => {
          if (ent.type === 'line') {
            sumX += ent.start.x + ent.end.x;
            sumY += ent.start.y + ent.end.y;
            count += 2;
          } else if (ent.type === 'circle' || ent.type === 'arc') {
            sumX += ent.center.x;
            sumY += ent.center.y;
            count += 1;
          } else if (ent.type === 'rectangle') {
            sumX += ent.p1.x + ent.p2.x;
            sumY += ent.p1.y + ent.p2.y;
            count += 2;
          }
        });

        if (count > 0 && templateId) {
          groupCentroids.push({
            groupId: gId,
            templateId,
            center: { x: sumX / count, y: sumY / count }
          });
        }
      });

      // Prepare new room entities
      const newRoomEntities: Entity[] = [];
      let cntCamera = 1;
      let cntBagno = 1;
      let cntCucina = 1;
      let cntSoggiorno = 1;
      let cntStudio = 1;
      let cntDisimpegno = 1;

      detectedPolygons.forEach((poly) => {
        const areaMq = getFullArea(poly) / 10000;
        
        // Count templates located inside this boundary
        const furnitureInside = groupCentroids.filter(gc => isPointInFullPolygon(gc.center, poly));

        // Skip tiny "fictional" spaces (like window recesses, framing artifacts, door swings)
        // that do not contain any physical furniture or fixtures
        if (areaMq < 3.0 && furnitureInside.length === 0) {
          return;
        }

        // Also check bounding box of the polygon to reject long, narrow sills/recesses
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        poly.points.forEach(pt => {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        });
        const widthCm = maxX - minX;
        const heightCm = maxY - minY;
        const minDimension = Math.min(widthCm, heightCm);
        if (minDimension < 75 && furnitureInside.length === 0) {
          return; // Skip window sills/recesses or corridor slivers with zero furniture
        }

        let doubleBedCount = 0;
        let singleBedCount = 0;
        let toiletCount = 0;
        let bidetCount = 0;
        let showerBathCount = 0;
        let lavaboCount = 0;
        let deskCount = 0;
        let tableCount = 0;
        let sofaCount = 0;
        let cooktopCount = 0;
        let sinkCount = 0;

        furnitureInside.forEach(gc => {
          const tid = gc.templateId;
          if (tid === 'bed_double_hq') {
            doubleBedCount++;
          } else if (tid === 'bed_single_hq') {
            singleBedCount++;
          } else if (tid === 'wc_hq') {
            toiletCount++;
          } else if (tid === 'bidet_hq') {
            bidetCount++;
          } else if (tid === 'vasca_hq' || tid === 'doccia_hq') {
            showerBathCount++;
          } else if (tid === 'lavabo_hq') {
            lavaboCount++;
          } else if (tid === 'scrivania_hq') {
            deskCount++;
          } else if (tid === 'tavolo_4_hq' || tid === 'tavolo_tondo_4_hq' || tid === 'tavolo_6_hq' || tid === 'tavolo_8_hq') {
            tableCount++;
          } else if (tid === 'divano_2_hq' || tid === 'divano_3_hq' || tid === 'divano_ang_hq' || tid === 'poltrona_hq') {
            sofaCount++;
          } else if (tid === 'piano_cottura_hq') {
            cooktopCount++;
          } else if (tid === 'lavello_cucina_hq') {
            sinkCount++;
          }
        });

        let label = "Locale";

        const hasKitchen = cooktopCount > 0 || sinkCount > 0;
        const hasLivingOrDining = sofaCount > 0 || tableCount > 0;
        const hasBathroomFixtures = toiletCount > 0 || bidetCount > 0 || showerBathCount > 0 || (lavaboCount > 0 && furnitureInside.length <= 3);

        // 1. BAGNO detection (toilet, bidet, shower, or bath)
        if (hasBathroomFixtures) {
          label = `Bagno ${cntBagno++}`;
        }
        // 2. CUCINA SOGGIORNO / CORNER KITCHEN (stove/hob AND sofa/table)
        else if (hasKitchen && hasLivingOrDining) {
          label = `Cucina Soggiorno ${cntCucina++}`;
        }
        // 3. CUCINA (cooking space only)
        else if (hasKitchen) {
          label = `Cucina ${cntCucina++}`;
        }
        // 4. CAMERA DA LETTO classification based on quantity and types of beds
        else if (doubleBedCount > 0 || singleBedCount > 0) {
          if (doubleBedCount > 0 && singleBedCount > 0) {
            label = `Camera Matrimoniale con lettino ${cntCamera++}`;
          } else if (doubleBedCount > 0) {
            label = `Camera Matrimoniale ${cntCamera++}`;
          } else if (singleBedCount === 1) {
            label = `Camera Singola ${cntCamera++}`;
          } else if (singleBedCount >= 2) {
            label = `Camera Doppia ${cntCamera++}`;
          } else {
            label = `Camera Letto ${cntCamera++}`;
          }
        }
        // 5. SOGGIORNO / SALONE (sofas, large tables)
        else if (hasLivingOrDining) {
          if (sofaCount > 0 && tableCount > 0) {
            label = `Salone Soggiorno ${cntSoggiorno++}`;
          } else if (sofaCount > 0) {
            label = `Soggiorno ${cntSoggiorno++}`;
          } else {
            label = `Soggiorno / Pranzo ${cntSoggiorno++}`;
          }
        }
        // 6. STUDIO (desk setups)
        else if (deskCount > 0) {
          label = `Studio ${cntStudio++}`;
        }
        // 7. AREA-BASED FALLBACK (if no furniture is matched)
        else {
          if (areaMq >= 1.0 && areaMq < 5.0) {
            label = `Disimpegno / Ripostiglio ${cntDisimpegno++}`;
          } else if (areaMq >= 5.0 && areaMq < 9.0) {
            label = `Corridoio ${cntDisimpegno++}`;
          } else if (areaMq >= 9.0 && areaMq < 13.0) {
            label = `Cucina ${cntCucina++}`;
          } else if (areaMq >= 13.0 && areaMq < 18.0) {
            label = `Camera Letto ${cntCamera++}`;
          } else if (areaMq >= 18.0) {
            label = `Soggiorno ${cntSoggiorno++}`;
          } else {
            label = `Studio ${cntStudio++}`;
          }
        }

        const id = "bim-room-" + Math.random().toString(36).substring(2, 11);
        const newRoom: Entity = {
          id,
          type: 'hatch',
          isBIM: true,
          bimType: 'room',
          bimName: label,
          bimHeight: 2.70,
          color: 'rgba(52, 211, 153, 0.15)',
          points: poly.points,
          holes: poly.holes,
          pattern: 'SOLID',
          scale: 1,
          angle: 0,
          lineWidth: 1,
          mode: 'pencil',
          layer: activeLayerId
        } as any;

        newRoomEntities.push(newRoom);
      });

      // Merge and update entities
      setEntities(prev => {
        // Clear only auto-generated rooms, leaving original user-added BIM doors, windows, and custom BIM elements
        const filtered = prev.filter(e => !(e.isBIM && e.bimType === 'room'));
        const next = [...filtered, ...newRoomEntities];
        onCommitHistory?.(next);
        return next;
      });
    },
    resetView: () => {
      setView({
        zoom: 0.15,
        pan: {
          x: window.innerWidth > 0 ? (window.innerWidth / 2) - 150 : 250,
          y: window.innerHeight > 0 ? (window.innerHeight / 2) - 220 : 80
        }
      });
    },
    zoomFit: () => {
      const allEnts = entitiesRef.current || [];
      if (allEnts.length === 0) {
        setView({
          zoom: 0.15,
          pan: {
            x: window.innerWidth > 0 ? (window.innerWidth / 2) - 150 : 250,
            y: window.innerHeight > 0 ? (window.innerHeight / 2) - 220 : 80
          }
        });
        return;
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      allEnts.forEach(ent => {
        if (ent.type === 'line' || ent.type === 'dimension') {
          minX = Math.min(minX, ent.start.x, ent.end.x);
          maxX = Math.max(maxX, ent.start.x, ent.end.x);
          minY = Math.min(minY, ent.start.y, ent.end.y);
          maxY = Math.max(maxY, ent.start.y, ent.end.y);
        } else if (ent.type === 'circle' || ent.type === 'arc') {
          minX = Math.min(minX, ent.center.x - ent.radius);
          maxX = Math.max(maxX, ent.center.x + ent.radius);
          minY = Math.min(minY, ent.center.y - ent.radius);
          maxY = Math.max(maxY, ent.center.y + ent.radius);
        } else if (ent.type === 'rectangle') {
          minX = Math.min(minX, ent.p1.x, ent.p2.x);
          maxX = Math.max(maxX, ent.p1.x, ent.p2.x);
          minY = Math.min(minY, ent.p1.y, ent.p2.y);
          maxY = Math.max(maxY, ent.p1.y, ent.p2.y);
        } else if ((ent as any).points) {
          (ent as any).points.forEach((p: Point) => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
          });
        }
      });
      if (!isFinite(minX)) return;
      const w = Math.max(40, maxX - minX);
      const h = Math.max(40, maxY - minY);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const canvasW = canvasRef.current?.width || window.innerWidth || 800;
      const canvasH = canvasRef.current?.height || window.innerHeight || 600;
      const newZoom = Math.min(1.5, Math.max(0.02, Math.min((canvasW * 0.75) / w, (canvasH * 0.75) / h)));
      setView({
        zoom: newZoom,
        pan: {
          x: canvasW / 2 - cx * newZoom,
          y: canvasH / 2 - cy * newZoom
        }
      });
    }
  }));

  const rotateGroup = (groupId: string, angleDegrees: number) => {
    const groupEntities = entities.filter(ent => ent.groupId === groupId);
    if (groupEntities.length === 0) return;

    // Calculate center of group (average of all key points)
    let sumX = 0, sumY = 0, count = 0;
    groupEntities.forEach(ent => {
        const pts = getEntityKeyPoints(ent);
        pts.forEach(p => {
            sumX += p.x;
            sumY += p.y;
            count++;
        });
    });
    if (count === 0) return;
    const center = { x: sumX / count, y: sumY / count };

    const rad = angleDegrees * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const rotatePoint = (p: Point): Point => ({
      x: center.x + (p.x - center.x) * cos - (p.y - center.y) * sin,
      y: center.y + (p.x - center.x) * sin + (p.y - center.y) * cos
    });

    const updater = (prev: Entity[]) => prev.map(ent => {
      if (ent.groupId === groupId) {
        if (ent.type === 'line' || ent.type === 'dimension') {
          return { ...ent, start: rotatePoint(ent.start), end: rotatePoint(ent.end) };
        } else if (ent.type === 'circle' || ent.type === 'arc') {
          const newCenter = rotatePoint(ent.center);
          if (ent.type === 'arc') {
            return { 
                ...ent, 
                center: newCenter, 
                startAngle: normalizeAngle(ent.startAngle + angleDegrees), 
                endAngle: normalizeAngle(ent.endAngle + angleDegrees) 
            };
          }
          return { ...ent, center: newCenter };
        } else if (ent.type === 'rectangle') {
          return { ...ent, p1: rotatePoint(ent.p1), p2: rotatePoint(ent.p2) };
        } else if (ent.type === 'point') {
          return { ...ent, point: rotatePoint(ent.point) };
        }
      }
      return ent;
    });

    setEntities(updater);
    onCommitHistory?.(updater(entities));
  };

  const [flashIds, setFlashIds] = useState<string[]>([]);
  const [bimFlashIds, setBimFlashIds] = useState<string[]>([]);
  const [flashIntensity, setFlashIntensity] = useState(0);
  const [pulsingEntityId, setPulsingEntityId] = useState<string | null>(null);
  const [pulseIntensity, setPulseIntensity] = useState(0);

  useEffect(() => {
    if (pulsingEntityId) {
      const start = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - start;
        // Pulse every 1.5 seconds (sine wave 0.3 to 1.0 range for visibility)
        const intensity = 0.3 + 0.7 * ((Math.sin(elapsed * 0.006) + 1) / 2);
        setPulseIntensity(intensity);
        renderRef.current?.();
      }, 30);
      return () => clearInterval(interval);
    } else {
      setPulseIntensity(0);
    }
  }, [pulsingEntityId]);

  const screenToCanvas = (x: number, y: number): Point => {
    return {
      x: (x - view.pan.x) / view.zoom,
      y: (y - view.pan.y) / view.zoom
    };
  };

  const getEffectiveOrtho = (e?: any, isToolMatching: boolean = true): boolean => {
    if (!isToolMatching) return false;
    let isShiftOrFn = isShiftPressedRef.current;
    if (e) {
      const native = e.nativeEvent || e;
      if (native.shiftKey) isShiftOrFn = true;
      if (native.key === 'Fn' || native.code === 'Fn') isShiftOrFn = true;
    }
    return orthoMode || isShiftOrFn;
  };

  const getDampenedCoordinate = (actualRawPoint: Point, e?: React.PointerEvent | React.MouseEvent | MouseEvent | KeyboardEvent): Point => {
    let basePoint = { ...actualRawPoint };
    if (virtualCursorOffsetRef.current) {
      basePoint.x += virtualCursorOffsetRef.current.x;
      basePoint.y += virtualCursorOffsetRef.current.y;
    }
    actualMousePosRef.current = basePoint;
    
    // Rallentiamo il movimento solo se il tasto "S" è premuto
    if (isSKeyPressedRef.current) {
      // Precision movement: only move a small fraction of the way to the real mouse
      const last = lastControlledPointRef.current || basePoint;
      const dampedFactor = 0.03; // Molto più lento per massima precisione
      const dampenedPoint = {
        x: last.x + (basePoint.x - last.x) * dampedFactor,
        y: last.y + (basePoint.y - last.y) * dampedFactor
      };
      lastControlledPointRef.current = dampenedPoint;
      return dampenedPoint;
    }
    
    lastControlledPointRef.current = basePoint;
    return basePoint;
  };

  const canvasToScreen = (x: number, y: number): Point => {
    return {
      x: x * view.zoom + view.pan.x,
      y: y * view.zoom + view.pan.y
    };
  };

  const isPointInViewport = (pt: Point, marginPx: number = 50): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const screenX = pt.x * view.zoom + view.pan.x;
    const screenY = pt.y * view.zoom + view.pan.y;
    return (
      screenX >= -marginPx &&
      screenX <= canvas.width + marginPx &&
      screenY >= -marginPx &&
      screenY <= canvas.height + marginPx
    );
  };

  // Manual input bubble will stay open until committed or closed by user.

  const isSnapActive = (): boolean => {
    return snapEnabled || isShiftPressedRef.current || isContinuousMode;
  };

  const getSnapPoints = (point: Point, entities: Entity[], activeTool: string, drawing: {start: Point, current?: Point} | null): {point: Point, type: 'CAD' | 'smart', subtype?: string, refPoint?: Point, refEntityId?: string, constraintAxis?: 'x' | 'y'}[] => {
    if (!isSnapActive() || activeTool === 'Gomma') {
        return [];
    }
    const isShift = isShiftPressedRef.current;
    const isBlocFnEssentialOnly = !snapEnabled || isShift;
    const snaps: {point: Point, type: 'CAD' | 'smart', subtype?: string, refPoint?: Point, refEntityId?: string, constraintAxis?: 'x' | 'y'}[] = [];
    
    if (!isBlocFnEssentialOnly && drawing && lastInsertedParameter && lastInsertedParameter.value > 0 && !hasUsedInputSnap) {
        const valueInCm = lastInsertedParameter.value;
        const distSq = (point.x - drawing.start.x)**2 + (point.y - drawing.start.y)**2;
        
        if (lastInsertedParameter.isLocked || Math.abs(Math.sqrt(distSq) - valueInCm) < (120 / view.zoom)) {
            const angle = Math.atan2(point.y - drawing.start.y, point.x - drawing.start.x);
            snaps.push({
                point: {
                    x: drawing.start.x + Math.cos(angle) * valueInCm,
                    y: drawing.start.y + Math.sin(angle) * valueInCm
                },
                type: 'smart',
                subtype: 'input',
                refLength: valueInCm
            } as any);
        }
    }
    
    const keyPoints: Point[] = [];
    
    // Spatial Culling Optimization: if entities dataset is large, pre-filter entities near the cursor to make snap queries instantly fast O(1)
    let inputEntities = entities;
    if (entities.length > 50) {
        const cullingRadius = 500 / view.zoom;
        inputEntities = entities.filter(ent => {
            if (ent.type === 'line' || ent.type === 'dimension') {
                const minX = Math.min(ent.start.x, ent.end.x);
                const maxX = Math.max(ent.start.x, ent.end.x);
                const minY = Math.min(ent.start.y, ent.end.y);
                const maxY = Math.max(ent.start.y, ent.end.y);
                return !(maxX < point.x - cullingRadius || minX > point.x + cullingRadius ||
                         maxY < point.y - cullingRadius || minY > point.y + cullingRadius);
            }
            if (ent.type === 'circle' || ent.type === 'arc') {
                const distSq = (ent.center.x - point.x) ** 2 + (ent.center.y - point.y) ** 2;
                const radius = ent.radius || 0;
                return distSq <= (cullingRadius + radius) ** 2;
            }
            if (ent.type === 'rectangle') {
                const minX = Math.min(ent.p1.x, ent.p2.x);
                const maxX = Math.max(ent.p1.x, ent.p2.x);
                const minY = Math.min(ent.p1.y, ent.p2.y);
                const maxY = Math.max(ent.p1.y, ent.p2.y);
                return !(maxX < point.x - cullingRadius || minX > point.x + cullingRadius ||
                         maxY < point.y - cullingRadius || minY > point.y + cullingRadius);
            }
            return true;
        });
    }

    // Project input entities so snap coordinates precisely match actual 2D projected/slanted geometry
    const projectedEntities = inputEntities.map(getProjectedEntity);

    // Only snap to visible and non-frozen layers
    const layerMapForVisible = new Map<string, Layer>(layers.map(l => [l.id, l]));
    const visibleEntities = projectedEntities.filter(ent => {
        const layer = layerMapForVisible.get(ent.layer);
        // Exclude BIM doors (but keep windows so we can snap to their axes)
        const isBIMDoorWindow = ent.isBIM && ent.bimType === 'door';
        return !(layer && (!layer.visible || layer.frozen)) && !isBIMDoorWindow && !ent.hideIn2D;
    });

    // Trace and unconditionally add all vertices of the connected structure if drawing
    // This allows for "distant" snapping and tracking from anything physically connected to the start point
    // EXCLUDE distant structure tracking if Shift is held (keep only local snaps)
    if (drawing && !isBlocFnEssentialOnly) {
        const connectedVertices: Point[] = [];
        const visitedIds = new Set<string>();
        const visitedPoints = new Set<string>();
        const ptKey = (p: Point) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
        
        const queue: Point[] = [drawing.start];
        visitedPoints.add(ptKey(drawing.start));
        
        // Filter by layer visibility but IGNORE spatial culling for connectivity
        const layerMap = new Map<string, Layer>(layers.map(l => [l.id, l]));
        const connectableEntities = projectedEntities.filter(ent => {
            const layer = layerMap.get(ent.layer);
            return !(layer && (!layer.visible || layer.frozen));
        });

        while (queue.length > 0) {
            const curr = queue.shift()!;
            connectedVertices.push(curr);
            const currKey = ptKey(curr);
            
            for (const ent of connectableEntities) {
                if (visitedIds.has(ent.id)) continue;
                
                if (ent.type === 'line') {
                    const sk = ptKey(ent.start);
                    const ek = ptKey(ent.end);
                    if (sk === currKey) {
                        visitedIds.add(ent.id);
                        if (!visitedPoints.has(ek)) {
                            visitedPoints.add(ek);
                            queue.push(ent.end);
                        }
                    } else if (ek === currKey) {
                        visitedIds.add(ent.id);
                        if (!visitedPoints.has(sk)) {
                            visitedPoints.add(sk);
                            queue.push(ent.start);
                        }
                    }
                } else if (ent.type === 'arc') {
                    const arc = ent as ArcEntity;
                    const startRad = (arc.startAngle || 0) * Math.PI / 180;
                    const endRad = (arc.endAngle || 0) * Math.PI / 180;
                    const pStart = {
                        x: arc.center.x + arc.radius * Math.cos(startRad),
                        y: arc.center.y + arc.radius * Math.sin(startRad)
                    };
                    const pEnd = {
                        x: arc.center.x + arc.radius * Math.cos(endRad),
                        y: arc.center.y + arc.radius * Math.sin(endRad)
                    };
                    const sk = ptKey(pStart);
                    const ek = ptKey(pEnd);
                    if (sk === currKey) {
                        visitedIds.add(ent.id);
                        if (!visitedPoints.has(ek)) {
                            visitedPoints.add(ek);
                            queue.push(pEnd);
                        }
                    } else if (ek === currKey) {
                        visitedIds.add(ent.id);
                        if (!visitedPoints.has(sk)) {
                            visitedPoints.add(sk);
                            queue.push(pStart);
                        }
                    }
                }
            }
        }
        
        connectedVertices.forEach(vp => {
            // Add as CAD snap for direct contact and keyPoint for smart alignment
            snaps.push({ point: vp, type: 'CAD', refPoint: vp, subtype: 'endpoint' });
            keyPoints.push(vp);
        });

        // Add midpoints and virtual intersections of connected lines
        const connectedLines = Array.from(visitedIds).map(id => connectableEntities.find(e => e.id === id)).filter(e => e && e.type === 'line') as LineEntity[];
        connectedLines.forEach(line => {
            const mid = { x: (line.start.x + line.end.x) / 2, y: (line.start.y + line.end.y) / 2 };
            keyPoints.push(mid);
        });

        if (connectedLines.length > 1 && connectedLines.length < 60) {
            for (let i = 0; i < connectedLines.length; i++) {
                for (let j = i + 1; j < connectedLines.length; j++) {
                    const l1 = connectedLines[i];
                    const l2 = connectedLines[j];
                    const x1 = l1.start.x, y1 = l1.start.y, x2 = l1.end.x, y2 = l1.end.y;
                    const x3 = l2.start.x, y3 = l2.start.y, x4 = l2.end.x, y4 = l2.end.y;
                    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
                    if (Math.abs(denom) > 1e-10) {
                        const t = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
                        const vPt = { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
                        // Only add if it's reasonably close to the drawing area or mouse
                        // But since it's a keyPoint for tracking, we can be generous
                        keyPoints.push(vPt);
                    }
                }
            }
        }
    }

    // Pre-calculate wall connections for snapping
    const allWallsFull = projectedEntities.filter(e => e.type === 'line' && e.isBIM && e.bimType === 'wall') as LineEntity[];    const snapSearchRadius = 150 / view.zoom;
    const nearEntities = visibleEntities.filter(ent => {
        if (ent.type === 'line' || ent.type === 'dimension') {
            const minX = Math.min(ent.start.x, ent.end.x) - snapSearchRadius;
            const maxX = Math.max(ent.start.x, ent.end.x) + snapSearchRadius;
            const minY = Math.min(ent.start.y, ent.end.y) - snapSearchRadius;
            const maxY = Math.max(ent.start.y, ent.end.y) + snapSearchRadius;
            return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
        }
        if (ent.type === 'circle' || ent.type === 'arc') {
            const d = Math.sqrt((ent.center.x - point.x) ** 2 + (ent.center.y - point.y) ** 2);
            return d <= ent.radius + snapSearchRadius;
        }
        if (ent.type === 'rectangle') {
            const minX = Math.min(ent.p1.x, ent.p2.x) - snapSearchRadius;
            const maxX = Math.max(ent.p1.x, ent.p2.x) + snapSearchRadius;
            const minY = Math.min(ent.p1.y, ent.p2.y) - snapSearchRadius;
            const maxY = Math.max(ent.p1.y, ent.p2.y) + snapSearchRadius;
            return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
        }
        if (ent.type === 'point' || ent.type === 'text') {
            const p = ent.type === 'point' ? (ent.point || (ent as any).position) : ent.point;
            if (!p) return false;
            return Math.abs(p.x - point.x) <= snapSearchRadius && Math.abs(p.y - point.y) <= snapSearchRadius;
        }
        return false;
    });

    nearEntities.forEach(entity => {
      if (entity.type === 'line') {
        const line = entity as LineEntity;
        if (line.isBIM && line.bimType === 'wall') {
            const corners = getWallCorners(line, allWallsFull);
            corners.forEach(cp => {
                snaps.push({ point: cp, type: 'CAD', refPoint: cp, refEntityId: line.id, subtype: 'endpoint' });
                keyPoints.push(cp);
            });
        }
        if (line.isBIM && line.bimType === 'window') {
            const wWidth = line.bimWidth || 120;
            const axisLen = wWidth + 120;
            const cx = (line.start.x + line.end.x) / 2;
            const cy = (line.start.y + line.end.y) / 2;
            const dx = line.end.x - line.start.x;
            const dy = line.end.y - line.start.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = len > 0 ? -dy / len : 0;
            const ny = len > 0 ? dx / len : 0;
            
            const ax1 = { x: cx - nx * axisLen/2, y: cy - ny * axisLen/2 };
            const ax2 = { x: cx + nx * axisLen/2, y: cy + ny * axisLen/2 };
            snaps.push({ point: ax1, type: 'CAD', refPoint: ax1, refEntityId: line.id, subtype: 'endpoint' });
            snaps.push({ point: ax2, type: 'CAD', refPoint: ax2, refEntityId: line.id, subtype: 'endpoint' });
            keyPoints.push(ax1);
            keyPoints.push(ax2);
        }
        snaps.push({point: entity.start, type: 'CAD', refPoint: entity.start, subtype: 'endpoint'});
        snaps.push({point: entity.end, type: 'CAD', refPoint: entity.end, subtype: 'endpoint'});
        const midPoint = {x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2};
        snaps.push({point: midPoint, type: 'CAD', refPoint: midPoint, subtype: 'midpoint'});
        keyPoints.push(entity.start);
        keyPoints.push(entity.end);
        keyPoints.push(midPoint);

        // --- DYNAMIC SUB-SEGMENT MIDPOINTS (INTERSECTION AWARE - ALWAYS ACTIVE INCLUDING WITH BLOC FN) ---
        if (entity.type === 'line') {
            const intersections: Point[] = [];
            projectedEntities.forEach(other => {
                if (other.id === entity.id) return;
                const ptsFound = getIntersections(entity, other);
                ptsFound.forEach(p => {
                    const dStart = Math.hypot(p.x - entity.start.x, p.y - entity.start.y);
                    const dEnd = Math.hypot(p.x - entity.end.x, p.y - entity.end.y);
                    if (dStart > 0.5 && dEnd > 0.5) {
                        intersections.push(p);
                    }
                });
            });

            if (intersections.length > 0) {
                const line = entity as LineEntity;
                const dx = line.end.x - line.start.x;
                const dy = line.end.y - line.start.y;
                const L2 = dx * dx + dy * dy;
                
                if (L2 > 0.0001) {
                    const pointsWithT = [
                        { t: 0, p: line.start },
                        ...intersections.map(p => ({
                            t: ((p.x - line.start.x) * dx + (p.y - line.start.y) * dy) / L2,
                            p
                        })),
                        { t: 1, p: line.end }
                    ].sort((a, b) => a.t - b.t);

                    // Dedup by T
                    const deduped: { t: number, p: Point }[] = [];
                    for (let i = 0; i < pointsWithT.length; i++) {
                        if (i === 0 || pointsWithT[i].t - deduped[deduped.length - 1].t > 0.001) {
                            deduped.push(pointsWithT[i]);
                        }
                    }

                    for (let j = 0; j < deduped.length - 1; j++) {
                        const p1 = deduped[j].p;
                        const p2 = deduped[j+1].p;
                        const vMid = { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 };
                        snaps.push({ point: vMid, type: 'CAD', refPoint: vMid, refEntityId: entity.id, subtype: 'midpoint' });
                        keyPoints.push(vMid);
                    }
                }
            }
        }

        // Perpendicular snap if drawing (only when full Snap is active)
        if (drawing && !isBlocFnEssentialOnly) {
            const pStart = drawing.start;
            const dx = line.end.x - line.start.x;
            const dy = line.end.y - line.start.y;
            const L2 = dx * dx + dy * dy;
            if (L2 > 0.001) {
                const apx = pStart.x - line.start.x;
                const apy = pStart.y - line.start.y;
                const t = (apx * dx + apy * dy) / L2;
                if (t >= -0.2 && t <= 1.2) {
                    const perpPt = { x: line.start.x + t * dx, y: line.start.y + t * dy };
                    snaps.push({ point: perpPt, type: 'CAD', refPoint: perpPt, refEntityId: line.id, subtype: 'perpendicular' });
                    keyPoints.push(perpPt);
                }
            }
        }
      } else if (entity.type === 'circle') {
        snaps.push({point: entity.center, type: 'CAD', refPoint: entity.center, subtype: 'center'});
        keyPoints.push(entity.center);

        const r = entity.radius || 0;
        const qTop = { x: entity.center.x, y: entity.center.y - r };
        const qBottom = { x: entity.center.x, y: entity.center.y + r };
        const qLeft = { x: entity.center.x - r, y: entity.center.y };
        const qRight = { x: entity.center.x + r, y: entity.center.y };

        snaps.push({point: qTop, type: 'CAD', refPoint: qTop, subtype: 'quadrant'});
        snaps.push({point: qBottom, type: 'CAD', refPoint: qBottom, subtype: 'quadrant'});
        snaps.push({point: qLeft, type: 'CAD', refPoint: qLeft, subtype: 'quadrant'});
        snaps.push({point: qRight, type: 'CAD', refPoint: qRight, subtype: 'quadrant'});

        keyPoints.push(qTop);
        keyPoints.push(qBottom);
        keyPoints.push(qLeft);
        keyPoints.push(qRight);

        // Tangent snap:
        // 1) When drawing from an external point to this circle: exact geometric tangent points t1, t2
        // 2) When drawing from a point ON this circle: tangent line projection
        // 3) When hovering circle circumference before starting a line: circumference tangent contact point
        if (drawing && drawing.start) {
            const pSrc = drawing.start;
            const dcx = pSrc.x - entity.center.x;
            const dcy = pSrc.y - entity.center.y;
            const distC = Math.sqrt(dcx * dcx + dcy * dcy);
            if (distC > r + 0.5) {
                const theta = Math.atan2(dcy, dcx);
                const ratio = r / distC;
                if (ratio >= -1 && ratio <= 1) {
                    const ac = Math.acos(ratio);
                    const t1 = { x: entity.center.x + r * Math.cos(theta + ac), y: entity.center.y + r * Math.sin(theta + ac) };
                    const t2 = { x: entity.center.x + r * Math.cos(theta - ac), y: entity.center.y + r * Math.sin(theta - ac) };
                    snaps.push({ point: t1, type: 'CAD', refPoint: t1, refEntityId: entity.id, subtype: 'tangent' });
                    snaps.push({ point: t2, type: 'CAD', refPoint: t2, refEntityId: entity.id, subtype: 'tangent' });
                    keyPoints.push(t1);
                    keyPoints.push(t2);
                }
            } else if (r > 0.1 && Math.abs(distC - r) <= 1.5) {
                // Starting point is on the circle circumference -> project cursor onto tangent direction at pSrc
                const tx = -dcy / distC;
                const ty = dcx / distC;
                const projLen = (point.x - pSrc.x) * tx + (point.y - pSrc.y) * ty;
                if (Math.abs(projLen) > 1.0) {
                    const tanPt = { x: pSrc.x + tx * projLen, y: pSrc.y + ty * projLen };
                    snaps.push({ point: tanPt, type: 'CAD', refPoint: pSrc, refEntityId: entity.id, subtype: 'tangent' });
                }
            }
        } else if (r > 0.1) {
            // Hovering near circle circumference (away from quadrants) to start a tangent line
            const dcx = point.x - entity.center.x;
            const dcy = point.y - entity.center.y;
            const distToCenter = Math.hypot(dcx, dcy);
            if (Math.abs(distToCenter - r) < 18 / view.zoom && distToCenter > 0.001) {
                const onCirc = {
                    x: entity.center.x + (dcx / distToCenter) * r,
                    y: entity.center.y + (dcy / distToCenter) * r
                };
                const minQuadDist = Math.min(
                    Math.hypot(onCirc.x - qTop.x, onCirc.y - qTop.y),
                    Math.hypot(onCirc.x - qBottom.x, onCirc.y - qBottom.y),
                    Math.hypot(onCirc.x - qLeft.x, onCirc.y - qLeft.y),
                    Math.hypot(onCirc.x - qRight.x, onCirc.y - qRight.y)
                );
                if (minQuadDist > 10 / view.zoom) {
                    snaps.push({ point: onCirc, type: 'CAD', refPoint: onCirc, refEntityId: entity.id, subtype: 'tangent' });
                }
            }
        }
      } else if (entity.type === 'rectangle') {
        const p1 = entity.p1;
        const p2 = entity.p2;
        const p3 = { x: p1.x, y: p2.y };
        const p4 = { x: p2.x, y: p1.y };
        snaps.push({point: p1, type: 'CAD', refPoint: p1, subtype: 'endpoint'});
        snaps.push({point: p2, type: 'CAD', refPoint: p2, subtype: 'endpoint'});
        snaps.push({point: p3, type: 'CAD', refPoint: p3, subtype: 'endpoint'});
        snaps.push({point: p4, type: 'CAD', refPoint: p4, subtype: 'endpoint'});
        keyPoints.push(p1);
        keyPoints.push(p2);
        keyPoints.push(p3);
        keyPoints.push(p4);

        // Rectangle midpoints
        const m1 = { x: (p1.x + p2.x) / 2, y: p1.y };
        const m2 = { x: (p1.x + p2.x) / 2, y: p2.y };
        const m3 = { x: p1.x, y: (p1.y + p2.y) / 2 };
        const m4 = { x: p2.x, y: (p1.y + p2.y) / 2 };
        snaps.push({point: m1, type: 'CAD', refPoint: m1, subtype: 'midpoint'});
        snaps.push({point: m2, type: 'CAD', refPoint: m2, subtype: 'midpoint'});
        snaps.push({point: m3, type: 'CAD', refPoint: m3, subtype: 'midpoint'});
        snaps.push({point: m4, type: 'CAD', refPoint: m4, subtype: 'midpoint'});
        keyPoints.push(m1);
        keyPoints.push(m2);
        keyPoints.push(m3);
        keyPoints.push(m4);
      } else if (entity.type === 'arc') {
        // Center snap for arcs (including trimmed circles/residues)
        snaps.push({point: entity.center, type: 'CAD', refPoint: entity.center, subtype: 'center'});
        keyPoints.push(entity.center);

        const startRad = entity.startAngle * Math.PI / 180;
        const endRad = entity.endAngle * Math.PI / 180;
        const pStart = {
          x: entity.center.x + entity.radius * Math.cos(startRad),
          y: entity.center.y + entity.radius * Math.sin(startRad)
        };
        const pEnd = {
          x: entity.center.x + entity.radius * Math.cos(endRad),
          y: entity.center.y + entity.radius * Math.sin(endRad)
        };
        snaps.push({point: pStart, type: 'CAD', refPoint: pStart, subtype: 'endpoint'});
        snaps.push({point: pEnd, type: 'CAD', refPoint: pEnd, subtype: 'endpoint'});
        keyPoints.push(pStart);
        keyPoints.push(pEnd);

        // Arc midpoint
        let normStart = normalizeAngle(entity.startAngle);
        let normEnd = normalizeAngle(entity.endAngle);
        if (normEnd < normStart) normEnd += 360;
        const avgAngleRad = ((normStart + normEnd) / 2) * Math.PI / 180;
        const pMid = {
          x: entity.center.x + entity.radius * Math.cos(avgAngleRad),
          y: entity.center.y + entity.radius * Math.sin(avgAngleRad)
        };
        snaps.push({point: pMid, type: 'CAD', refPoint: pMid, subtype: 'midpoint'});
        keyPoints.push(pMid);
      } else if (entity.type === 'point') {
        const p = entity.point || (entity as any).position;
        if (p) {
          snaps.push({point: p, type: 'CAD', refPoint: p, subtype: 'endpoint'});
          keyPoints.push(p);
        }
      } else if (entity.type === 'text') {
        snaps.push({point: entity.point, type: 'CAD', refPoint: entity.point, subtype: 'text'});
        keyPoints.push(entity.point);
      }
    });

    // 5. Add intersection points for lines, circles, and arcs (including when Bloc Fn is pressed!)
    {
        const intersectionThreshold = 150 / view.zoom;
        const nearEntitiesForIntersections = visibleEntities.filter(ent => {
          if (ent.type !== 'line' && ent.type !== 'circle' && ent.type !== 'arc') return false;
          let minX = 0, maxX = 0, minY = 0, maxY = 0;
          if (ent.type === 'line') {
              minX = Math.min(ent.start.x, ent.end.x);
              maxX = Math.max(ent.start.x, ent.end.x);
              minY = Math.min(ent.start.y, ent.end.y);
              maxY = Math.max(ent.start.y, ent.end.y);
          } else {
              const c = ent as (CircleEntity | ArcEntity);
              minX = c.center.x - c.radius;
              maxX = c.center.x + c.radius;
              minY = c.center.y - c.radius;
              maxY = c.center.y + c.radius;
          }
          return !(maxX < point.x - intersectionThreshold || minX > point.x + intersectionThreshold || 
                   maxY < point.y - intersectionThreshold || minY > point.y + intersectionThreshold);
        });

        for (let i = 0; i < nearEntitiesForIntersections.length; i++) {
            for (let j = i + 1; j < nearEntitiesForIntersections.length; j++) {
                const ent1 = nearEntitiesForIntersections[i];
                const ent2 = nearEntitiesForIntersections[j];
                const inters = getIntersections(ent1, ent2);
                inters.forEach(p => {
                    const distToPoint = Math.hypot(p.x - point.x, p.y - point.y);
                    if (distToPoint < intersectionThreshold) {
                        snaps.push({ point: p, type: 'CAD', refPoint: p, subtype: 'intersection' });
                    }
                });
            }
        }
    }

    const isDrawingTool = ['Line', 'Circle', 'Arc', 'Rectangle', 'Hatch', 'Dimension', 'Muro', 'BIM_Muro', 'BIM_Porta', 'BIM_Finestra', 'BIM_Symbol', 'BIM_DisegnaStanza', 'BIM_DisegnaLineare', 'BIM_TracciaSegmento', 'Copy', 'Move'].includes(activeTool);
    // EXCLUDE orthogonal smart alignments if Senza Snap + Bloc Fn is active (only local CAD points)
    if (isDrawingTool && !isBlocFnEssentialOnly) {
        const threshold = 12 / view.zoom;
        const uniqueKeyPoints: Point[] = [];
        const seen = new Set<string>();
        keyPoints.forEach(kp => {
            if (!isPointInViewport(kp, 50)) return;
            const key = `${Math.round(kp.x * 100)},${Math.round(kp.y * 100)}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueKeyPoints.push(kp);
            }
        });

        // 1. Orthogonal Smart alignments (0 and 90 degrees)
        const angles = [0, 90];
        uniqueKeyPoints.forEach(kp => {
            if (drawing && Math.abs(kp.x - drawing.start.x) < 0.1 && Math.abs(kp.y - drawing.start.y) < 0.1) {
                return;
            }

            for (const angle of angles) {
                const rad = angle * Math.PI / 180;
                const nx = -Math.sin(rad);
                const ny = Math.cos(rad);
                const dist = (point.x - kp.x) * nx + (point.y - kp.y) * ny;
                if (Math.abs(dist) < threshold) {
                    snaps.push({
                        point: { x: point.x - nx * dist, y: point.y - ny * dist },
                        type: 'smart',
                        refPoint: kp,
                        constraintAxis: angle === 0 ? 'y' : 'x'
                    });
                }
            }
        });
    }
    
    // 6. Suggerimento e aggancio magnetico alla distanza dell'offset precedente durante il tracciamento di una linea parallela
    // (Attivo SOLO se l'utente ha cliccato sul pulsante Offset)
    const isLineTracingTool = ['Line', 'Filo', 'Muro', 'BIM_Muro'].includes(activeTool);
    if (isLineTracingTool && isOffsetAidActiveRef.current) {
        const refD = getEffectiveLastParallelOffset(visibleEntities);
        if (refD > 0.05) {
            const offsetSnapTol = 18 / view.zoom;
            const endSnapTol = 22 / view.zoom;
            const spanMargin = Math.max(80, 120 / view.zoom);

            for (const ent of visibleEntities) {
                if (ent.type !== 'line' || (ent as any).isSimmetryAxis) continue;
                const oLine = ent as LineEntity;
                const odx = oLine.end.x - oLine.start.x;
                const ody = oLine.end.y - oLine.start.y;
                const oLen = Math.hypot(odx, ody);
                if (oLen < 0.5) continue;

                const tx = odx / oLen;
                const ty = ody / oLen;
                const nx = -ty;
                const ny = tx;

                const signedD = (point.x - oLine.start.x) * nx + (point.y - oLine.start.y) * ny;
                const perpD = Math.abs(signedD);
                if (Math.abs(perpD - refD) > offsetSnapTol) continue;

                const proj = (point.x - oLine.start.x) * tx + (point.y - oLine.start.y) * ty;
                if (proj < -spanMargin || proj > oLen + spanMargin) continue;

                // Se stiamo già tracciando un segmento, verifica che il punto iniziale sia compatibile (a distanza ~refD da oLine oppure su oLine)
                if (drawing && drawing.start) {
                    const startSignedD = (drawing.start.x - oLine.start.x) * nx + (drawing.start.y - oLine.start.y) * ny;
                    const startPerpD = Math.abs(startSignedD);
                    const isStartAtOffset = Math.abs(startPerpD - refD) < offsetSnapTol && (startSignedD * signedD >= 0);
                    const isStartOnLine = startPerpD < 2.0;
                    if (!isStartAtOffset && !isStartOnLine) continue;
                }

                const sideSign = signedD >= 0 ? 1 : -1;
                const shiftX = nx * sideSign * refD;
                const shiftY = ny * sideSign * refD;
                const gStart = { x: oLine.start.x + shiftX, y: oLine.start.y + shiftY };
                const gEnd = { x: oLine.end.x + shiftX, y: oLine.end.y + shiftY };

                // A. Estremi allineati alla linea di riferimento ad offset refD
                if (Math.hypot(point.x - gStart.x, point.y - gStart.y) < endSnapTol) {
                    snaps.push({
                        point: gStart,
                        type: 'CAD',
                        subtype: 'parallel_offset_end',
                        refPoint: oLine.start,
                        refEntityId: oLine.id,
                        refLength: refD
                    } as any);
                }
                if (Math.hypot(point.x - gEnd.x, point.y - gEnd.y) < endSnapTol) {
                    snaps.push({
                        point: gEnd,
                        type: 'CAD',
                        subtype: 'parallel_offset_end',
                        refPoint: oLine.end,
                        refEntityId: oLine.id,
                        refLength: refD
                    } as any);
                }

                // B. Intersezioni della guida di offset con altri segmenti esistenti (es. muro perpendicolare su cui partire o arrivare)
                const virtualOffsetLine: LineEntity = {
                    id: 'virtual_offset_guide',
                    type: 'line',
                    start: { x: gStart.x - tx * spanMargin, y: gStart.y - ty * spanMargin },
                    end: { x: gEnd.x + tx * spanMargin, y: gEnd.y + ty * spanMargin },
                    color: '#10b981',
                    lineWidth: 1,
                    layer: oLine.layer,
                    mode: 'CAD'
                };
                for (const other of nearEntities) {
                    if (other.id === oLine.id || other.type !== 'line') continue;
                    const interPts = getIntersections(virtualOffsetLine, other);
                    for (const ip of interPts) {
                        if (Math.hypot(point.x - ip.x, point.y - ip.y) < endSnapTol) {
                            snaps.push({
                                point: ip,
                                type: 'CAD',
                                subtype: 'parallel_offset_end',
                                refPoint: ip,
                                refEntityId: oLine.id,
                                refLength: refD
                            } as any);
                        }
                    }
                }

                // C. Proiezione continua lungo la linea di offset precedente
                const projOnG = {
                    x: oLine.start.x + tx * proj + shiftX,
                    y: oLine.start.y + ty * proj + shiftY
                };
                snaps.push({
                    point: projOnG,
                    type: 'CAD',
                    subtype: 'parallel_offset',
                    refPoint: { x: oLine.start.x + tx * proj, y: oLine.start.y + ty * proj },
                    refEntityId: oLine.id,
                    refLength: refD
                } as any);
            }
        }
    }

    if (isBlocFnEssentialOnly) {
        // SENZA SNAP + BLOC FN: attiva estremi, medio, centro, tangente, i 4 punti del cerchio (quadrant), incroci (intersection) E suggerimento offset precedente
        return snaps.filter(s => s.type === 'CAD' && ['endpoint', 'midpoint', 'center', 'tangent', 'quadrant', 'intersection', 'parallel_offset', 'parallel_offset_end'].includes(s.subtype || ''));
    }

    if (activeTool === 'Copy' || activeTool === 'Move') {
        return snaps.filter(s => s.type === 'smart' || (s.type === 'CAD' && (s.subtype === 'endpoint' || s.subtype === 'midpoint' || s.subtype === 'intersection' || s.subtype === 'center' || s.subtype === 'quadrant' || s.subtype === 'tangent')));
    }
    
    return snaps;
  };

  const getSnappedPoint = (point: Point, entities: Entity[], activeTool: string, drawing: {start: Point, current?: Point, isFreehand?: boolean} | null): {
    point: Point;
    snapped: boolean;
    type: 'CAD' | 'smart';
    subtype?: string;
    refPoint?: Point;
    refEntityId?: string;
    refSegment?: { start: Point; end: Point; length: number };
    refLength?: number;
    refRadius?: number;
    constraintAxis?: 'x' | 'y';
    refPoint2?: Point;
    constraintAxis2?: 'x' | 'y';
    hasDoubleSmart?: boolean;
  } => {
    const isShiftHeld = isShiftPressedRef.current;
    if ((!isSnapActive() || activeTool === 'Gomma') && !isShiftHeld) {
        return { point, snapped: false, type: 'CAD' };
    }

    const snaps = getSnapPoints(point, entities, activeTool, drawing as any);
    const isFreehand = drawing?.isFreehand;
    const threshold = isFreehand ? (8 / view.zoom) : (25 / view.zoom);


    const getSubtypePriority = (subtype?: string): number => {
      switch (subtype) {
        case 'input': return 1000;
        case 'center': return 100;
        case 'intersection': return 95;
        case 'parallel_offset_end': return 94;
        case 'endpoint': return 92;
        case 'midpoint': return 90;
        case 'parallel_offset': return 82;
        case 'equal_length': return 75;
        case 'quadrant': return 60;
        case 'perpendicular': return 50;
        case 'tangent': return 40;
        default: return 10;
      }
    };

    const candidateSnaps: { snap: any; dist: number }[] = [];

    // 1. Gather all valid snaps from snaps array (CAD and smart like input)
    for (const snap of snaps) {
      if (isPointInViewport(snap.point, 50)) {
        const dist = Math.sqrt((point.x - snap.point.x) ** 2 + (point.y - snap.point.y) ** 2);
        
        // PROXIMITY SNAP FILTER FOR SENZA SNAP + BLOC FN
        if (!snapEnabled || isShiftHeld) {
            // Only notable points: endpoint (estremi), midpoint (medio), center (centro), tangent (tangente), quadrant (4 punti del cerchio), intersection (incroci di segmenti), parallel_offset
            if (!['endpoint', 'midpoint', 'center', 'tangent', 'quadrant', 'intersection', 'parallel_offset', 'parallel_offset_end'].includes(snap.subtype)) continue;
            const proximityThreshold = 25 / view.zoom;
            if (dist > proximityThreshold) continue;
        }

        const maxDist = snap.type === 'smart' ? (snap.subtype === 'input' ? (45 / view.zoom) : (60 / view.zoom)) : threshold;
        if (dist < maxDist) {
          candidateSnaps.push({ snap, dist });
        }
      }
    }

    // 2. Add Equal Length smart snap ONLY when full Snap is active (not in Senza Snap + Bloc Fn mode)
    const refSeg = (() => {
      if (lastSegmentRef.current && lastSegmentRef.current.length > 0.01) {
        return lastSegmentRef.current;
      }
      for (let i = entities.length - 1; i >= 0; i--) {
        const ent = entities[i];
        if (ent.type === 'line') {
          const l = ent as LineEntity;
          const len = Math.hypot(l.end.x - l.start.x, l.end.y - l.start.y);
          if (len > 0.01) {
            return { start: l.start, end: l.end, length: len, id: l.id };
          }
        }
      }
      return null;
    })();

    if (snapEnabled && !isShiftHeld && drawing && drawing.start) {
      const lengthsToTest: { refLen: number; refSeg?: any }[] = [];
      if (refSeg && refSeg.length > 0.01) {
        lengthsToTest.push({ refLen: refSeg.length, refSeg });
      }
      if (lastInsertedParameter && lastInsertedParameter.value > 0) {
        if (!lengthsToTest.some(l => Math.abs(l.refLen - lastInsertedParameter.value) < 0.001)) {
          lengthsToTest.push({ refLen: lastInsertedParameter.value });
        }
      }

      const isLineLikeTool = ['Line', 'Filo', 'Muro', 'BIM_Muro', 'BIM_DisegnaLineare', 'BIM_TracciaSegmento'].includes(activeTool);
      const effectiveOrthoMode = getEffectiveOrtho(undefined, isLineLikeTool);
      let dirPt = point;
      if (effectiveOrthoMode) {
        const isHoriz = Math.abs(point.x - drawing.start.x) >= Math.abs(point.y - drawing.start.y);
        dirPt = isHoriz ? { x: point.x, y: drawing.start.y } : { x: drawing.start.x, y: point.y };
      } else if (isLineLikeTool) {
        dirPt = applyAngleSnapping(drawing.start, point);
      }
      const dx = dirPt.x - drawing.start.x;
      const dy = dirPt.y - drawing.start.y;
      const currentDist = Math.hypot(dx, dy);
      const lenTolerance = 55 / view.zoom;

      for (const item of lengthsToTest) {
        const refLen = item.refLen;
        if (Math.abs(currentDist - refLen) < lenTolerance && currentDist > 0.01) {
          const angle = Math.atan2(dy, dx);
          const snappedPt = {
            x: drawing.start.x + Math.cos(angle) * refLen,
            y: drawing.start.y + Math.sin(angle) * refLen
          };
          const dist = Math.hypot(point.x - snappedPt.x, point.y - snappedPt.y);
          candidateSnaps.push({
            snap: {
              point: snappedPt,
              type: 'smart',
              subtype: 'equal_length',
              refSegment: item.refSeg || { start: drawing.start, end: snappedPt, length: refLen, id: 'input_param' },
              refLength: refLen
            },
            dist
          });
        }
      }
    }

    if (candidateSnaps.length > 0) {
      candidateSnaps.sort((a, b) => {
        const pA = getSubtypePriority(a.snap.subtype);
        const pB = getSubtypePriority(b.snap.subtype);
        
        if (a.snap.subtype === 'input' && b.snap.subtype !== 'input') return -1;
        if (b.snap.subtype === 'input' && a.snap.subtype !== 'input') return 1;
        if (a.snap.subtype === 'center' && b.snap.subtype !== 'center') return -1;
        if (b.snap.subtype === 'center' && a.snap.subtype !== 'center') return 1;
        
        const distBetweenSnaps = Math.sqrt((a.snap.point.x - b.snap.point.x) ** 2 + (a.snap.point.y - b.snap.point.y) ** 2);
        const distOnScreen = distBetweenSnaps * view.zoom;
        
        if (distOnScreen < 15) {
          return pB - pA;
        }
        
        const weightedDistA = a.dist - (pA * 0.05);
        const weightedDistB = b.dist - (pB * 0.05);
        return weightedDistA - weightedDistB;
      });

      const best = candidateSnaps[0].snap;
      return {
        point: best.point,
        snapped: true,
        type: best.type || 'CAD',
        subtype: best.subtype,
        refPoint: best.refPoint,
        refEntityId: best.refEntityId,
        refSegment: best.refSegment,
        refLength: best.refLength,
        constraintAxis: best.constraintAxis
      };
    }

    // Check for Equal Radius Smart Snap suggestion ONLY when full Snap is active
    if (snapEnabled && !isShiftHeld && drawing && drawing.start && (activeTool === 'Circle' || (activeTool === 'Arc' && !(drawing as any).arcStartPoint))) {
      const refCircleInfo = (() => {
        if (lastCircleRadiusRef.current && lastCircleRadiusRef.current > 0.01) {
          const matchingEnt = entities.slice().reverse().find(e => (e.type === 'circle' || e.type === 'arc') && Math.abs((e as any).radius - lastCircleRadiusRef.current!) < 0.001);
          return { radius: lastCircleRadiusRef.current, entity: matchingEnt };
        }
        for (let i = entities.length - 1; i >= 0; i--) {
          const ent = entities[i];
          if (ent.type === 'circle' || ent.type === 'arc') {
            const r = (ent as any).radius;
            if (r && r > 0.01) {
              return { radius: r, entity: ent };
            }
          }
        }
        return null;
      })();

      if (refCircleInfo && refCircleInfo.radius > 0.01) {
        const refRad = refCircleInfo.radius;
        const dx = point.x - drawing.start.x;
        const dy = point.y - drawing.start.y;
        const currentDist = Math.hypot(dx, dy);

        // Generous 35 screen pixels threshold in world units
        const radTolerance = 35 / view.zoom;
        if (Math.abs(currentDist - refRad) < radTolerance && currentDist > 0.01) {
          const ux = currentDist > 0 ? dx / currentDist : 1;
          const uy = currentDist > 0 ? dy / currentDist : 0;
          const snappedPt = {
            x: drawing.start.x + ux * refRad,
            y: drawing.start.y + uy * refRad
          };
          return {
            point: snappedPt,
            snapped: true,
            type: 'smart',
            subtype: 'equal_radius',
            refRadius: refRad,
            refLength: refRad,
            refEntityId: refCircleInfo.entity?.id
          };
        }
      }
    }

    // Check for smart snaps ONLY when full Snap is active
    const isSmartAllowed = snapEnabled && !isShiftHeld && activeTool !== 'Circle' && (drawing !== null || ['Move', 'Copy', 'Specchio'].includes(activeTool));

    const candidateSmartSnaps = isSmartAllowed
      ? snaps.filter(s => s.type === 'smart').map(s => {
          const dist = Math.sqrt((point.x - s.point.x) ** 2 + (point.y - s.point.y) ** 2);
          return { snap: s, dist };
        }).filter(item => item.dist < threshold)
      : [];

    if (candidateSmartSnaps.length > 0) {
      const xConstraints = candidateSmartSnaps.filter(c => c.snap.constraintAxis === 'x');
      const yConstraints = candidateSmartSnaps.filter(c => c.snap.constraintAxis === 'y');
      
      if (xConstraints.length > 0 && yConstraints.length > 0) {
        xConstraints.sort((a, b) => a.dist - b.dist);
        yConstraints.sort((a, b) => a.dist - b.dist);
        
        const bestX = xConstraints[0].snap;
        const bestY = yConstraints[0].snap;
        
        if (bestX.refPoint && bestY.refPoint) {
          return {
            point: { x: bestX.refPoint.x, y: bestY.refPoint.y },
            snapped: true,
            type: 'smart',
            refPoint: bestX.refPoint,
            constraintAxis: 'x',
            refPoint2: bestY.refPoint,
            constraintAxis2: 'y',
            hasDoubleSmart: true
          };
        }
      }
      
      candidateSmartSnaps.sort((a, b) => a.dist - b.dist);
      const bestSmart = candidateSmartSnaps[0].snap;
      return {
        point: bestSmart.point,
        snapped: true,
        type: 'smart',
        refPoint: bestSmart.refPoint,
        refEntityId: bestSmart.refEntityId,
        constraintAxis: bestSmart.constraintAxis
      };
    }
    
    // Default case: no snaps found
    return { point: point, snapped: false, type: 'CAD' };
  };

  const distanceToSegment = (p: Point, s: Point, e: Point) => {
    const l2 = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
    if (l2 === 0) return Math.sqrt((p.x - s.x) ** 2 + (p.y - s.y) ** 2);
    let t = ((p.x - s.x) * (e.x - s.x) + (p.y - s.y) * (e.y - s.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt((p.x - (s.x + t * (e.x - s.x))) ** 2 + (p.y - (s.y + t * (e.y - s.y))) ** 2);
  };

  const getEntityAtPoint = (point: Point, customThreshold?: number): Entity | undefined => {
    let bestEntity: Entity | undefined;
    let minDistance = Infinity;
    const clickThreshold = customThreshold !== undefined ? (customThreshold / view.zoom) : (10 / view.zoom);
    const layerMapForSelection = new Map<string, Layer>(layers.map(l => [l.id, l]));

    // Project entities on-the-fly for correct hit selection of 3D-rotated entities
    const projected = entitiesRef.current.map(getProjectedEntity);

    for (const ent of projected) {
      if ((ent as any).isVisible === false) continue;
      if ((ent as any).isFrozen === true) continue;
      const layer = layerMapForSelection.get(ent.layer);
      if (layer && (!layer.visible || layer.frozen)) continue;

      // Cheap bounding box culling
      if (ent.type === 'line') {
          let minX, maxX, minY, maxY;
          const lineEnt = ent as LineEntity;
          if (lineEnt.isFreehand && lineEnt.inkPoints && lineEnt.inkPoints.length > 0) {
              minX = Math.min(...lineEnt.inkPoints.map(p => p.x)) - clickThreshold;
              maxX = Math.max(...lineEnt.inkPoints.map(p => p.x)) + clickThreshold;
              minY = Math.min(...lineEnt.inkPoints.map(p => p.y)) - clickThreshold;
              maxY = Math.max(...lineEnt.inkPoints.map(p => p.y)) + clickThreshold;
          } else {
              minX = Math.min(ent.start.x, ent.end.x) - clickThreshold;
              maxX = Math.max(ent.start.x, ent.end.x) + clickThreshold;
              minY = Math.min(ent.start.y, ent.end.y) - clickThreshold;
              maxY = Math.max(ent.start.y, ent.end.y) + clickThreshold;
          }
          if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) {
              // Special case for BIM doors/windows which might have extra geometry outside the main line
              if (!ent.isBIM || ent.bimType === 'wall' || (ent.bimType && ent.bimType.includes('symbol')) || !ent.bimType) continue;
          }
      }

      let hit = false;
      let dist = Infinity;

      if (ent.type === 'line') {
        const lineEnt = ent as LineEntity;
        if (lineEnt.isFreehand && lineEnt.inkPoints && lineEnt.inkPoints.length > 1) {
            const res = getClosestPointOnPolyline(point, lineEnt.inkPoints);
            dist = res.dist;
        } else {
            dist = distanceToSegment(point, ent.start, ent.end);
        }
        if (dist < clickThreshold) hit = true;
        
        // Enhance selection for BIM doors by checking hit on the leaf line too
        if (!hit && (ent as any).bimType === 'door') {
            const dx = ent.end.x - ent.start.x;
            const dy = ent.end.y - ent.start.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0.01) {
                const flipMult = (ent as any).bimFlip ? -1 : 1;
                const px = (-dy / len) * flipMult;
                const py = (dx / len) * flipMult;
                const leafEnd = { x: ent.start.x + px * len, y: ent.start.y + py * len };
                const leafDist = distanceToSegment(point, ent.start, leafEnd);
                if (leafDist < clickThreshold) {
                    hit = true;
                    dist = leafDist;
                }
                
                // Optional: check arc hit
                if (!hit) {
                    const distToCenter = Math.sqrt((point.x - ent.start.x) ** 2 + (point.y - ent.start.y) ** 2);
                    const arcDist = Math.abs(distToCenter - len);
                    if (arcDist < clickThreshold) {
                        const baseAngle = Math.atan2(ent.end.y - ent.start.y, ent.end.x - ent.start.x) * 180 / Math.PI;
                        const leafAngle = Math.atan2(leafEnd.y - ent.start.y, leafEnd.x - ent.start.x) * 180 / Math.PI;
                        const clickAngle = Math.atan2(point.y - ent.start.y, point.x - ent.start.x) * 180 / Math.PI;
                        
                        // We check if angle is between baseAngle and leafAngle
                        if (isAngleInArc(clickAngle, (ent as any).bimFlip ? leafAngle : baseAngle, (ent as any).bimFlip ? baseAngle : leafAngle)) {
                            hit = true;
                            dist = arcDist;
                        }
                    }
                }
            }
        }
      } else if (ent.type === 'circle') {
        const dCenter = Math.sqrt((point.x - ent.center.x) ** 2 + (point.y - ent.center.y) ** 2);
        dist = Math.abs(dCenter - ent.radius);
        if (dist < clickThreshold) hit = true;
      } else if (ent.type === 'rectangle') {
        const minX = Math.min(ent.p1.x, ent.p2.x);
        const maxX = Math.max(ent.p1.x, ent.p2.x);
        const minY = Math.min(ent.p1.y, ent.p2.y);
        const maxY = Math.max(ent.p1.y, ent.p2.y);
        
        const d1 = distanceToSegment(point, {x: minX, y: minY}, {x: maxX, y: minY});
        const d2 = distanceToSegment(point, {x: maxX, y: minY}, {x: maxX, y: maxY});
        const d3 = distanceToSegment(point, {x: maxX, y: maxY}, {x: minX, y: maxY});
        const d4 = distanceToSegment(point, {x: minX, y: maxY}, {x: minX, y: minY});
        dist = Math.min(d1, d2, d3, d4);
        if (point.x >= minX - clickThreshold/2 && point.x <= maxX + clickThreshold/2 && point.y >= minY - clickThreshold/2 && point.y <= maxY + clickThreshold/2) {
          hit = true;
        }
      } else if (ent.type === 'point') {
        const p = ent.point || (ent as any).position;
        if (p) {
            dist = Math.sqrt((point.x - p.x) ** 2 + (point.y - p.y) ** 2);
            if (dist < clickThreshold) hit = true;
        }
      } else if (ent.type === 'arc') {
         const dCenter = Math.sqrt((point.x - ent.center.x) ** 2 + (point.y - ent.center.y) ** 2);
         dist = Math.abs(dCenter - ent.radius);
         if (dist < clickThreshold) {
             const angle = Math.atan2(point.y - ent.center.y, point.x - ent.center.x) * 180 / Math.PI;
             if (isAngleInArc(angle, ent.startAngle, ent.endAngle)) {
                 hit = true;
             } else {
                 const startRad = ent.startAngle * Math.PI / 180;
                 const endRad = ent.endAngle * Math.PI / 180;
                 const pStart = { x: ent.center.x + ent.radius * Math.cos(startRad), y: ent.center.y + ent.radius * Math.sin(startRad) };
                 const pEnd = { x: ent.center.x + ent.radius * Math.cos(endRad), y: ent.center.y + ent.radius * Math.sin(endRad) };
                 const dStart = Math.sqrt((point.x - pStart.x)**2 + (point.y - pStart.y)**2);
                 const dEnd = Math.sqrt((point.x - pEnd.x)**2 + (point.y - pEnd.y)**2);
                 dist = Math.min(dStart, dEnd);
                 if (dist < clickThreshold) hit = true;
             }
         }
      } else if (ent.type === 'hatch') {
         const h = ent as any;
         if (h.points && isPointInPolygon(point, h.points)) {
             hit = true;
             dist = 0;
         }
      } else if (ent.type === 'dimension') {
        const { p1, p2 } = getDimensionLinePoints(ent);
        dist = distanceToSegment(point, p1, p2);
        if (dist < clickThreshold) hit = true;
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        if (Math.hypot(point.x - cx, point.y - cy) < 20 / view.zoom) { hit = true; dist = 0; }
      } else if (ent.type === 'text') {
        const lines = ent.text.split('\n');
        const fontSize = ent.fontSize || 14;
        const maxLen = Math.max(...lines.map(l => l.length), 1);
        const w = maxLen * fontSize * 0.55;
        const h = lines.length * fontSize * 1.25;
        
        let offsetX = 0;
        if (ent.textAlign === 'center') offsetX = -w / 2;
        else if (ent.textAlign === 'right') offsetX = -w;
        
        const tx = ent.point.x + offsetX;
        const ty = ent.point.y;
        
        const pad = 6 / view.zoom;
        if (point.x >= tx - pad && point.x <= tx + w + pad &&
            point.y >= ty - pad && point.y <= ty + h + pad) {
            hit = true;
            dist = 0;
        }
      } else if (ent.type === 'image') {
        const minX = ent.point.x;
        const maxX = ent.point.x + ent.width;
        const minY = ent.point.y;
        const maxY = ent.point.y + ent.height;
        if (point.x >= minX - 5/view.zoom && point.x <= maxX + 5/view.zoom && point.y >= minY - 5/view.zoom && point.y <= maxY + 5/view.zoom) {
          hit = true;
          dist = 0;
        }
      }
      
      if (hit) {
          if (!bestEntity) {
              bestEntity = ent;
              minDistance = dist;
          } else {
              // Priority 1: China (kina) vs Pencil (matita)
              // Any mode that is NOT 'pencil' is counted as China/Kina (e.g. 'ink', 'CAD', or undefined)
              const isKinaA = ent.mode !== 'pencil';
              const isKinaB = bestEntity.mode !== 'pencil';
              
              let isBetter = false;
              if (isKinaA && !isKinaB) {
                  isBetter = true;
              } else if (!isKinaA && isKinaB) {
                  isBetter = false;
              } else {
                  // Same category (both Kina or both Matita), prioritize thickness
                  const getEntityThickness = (e: Entity): number => {
                      if (e.isBIM && e.bimWidth) return e.bimWidth;
                      if (e.lineWidth) return e.lineWidth;
                      return 1;
                  };
                  const thickA = getEntityThickness(ent);
                  const thickB = getEntityThickness(bestEntity);
                  
                  if (Math.abs(thickA - thickB) > 0.01) {
                      isBetter = thickA > thickB;
                  } else {
                      // Same thickness, choose the closer one
                      isBetter = dist <= minDistance;
                  }
              }
              
              if (isBetter) {
                  bestEntity = ent;
                  minDistance = dist;
              }
          }
      }
    }
    return bestEntity;
  };
  
  const getEntityKeyPoints = (entity: Entity): Point[] => {
    const points: Point[] = [];
    if (entity.type === 'line') {
      points.push(entity.start);
      points.push(entity.end);
      points.push({x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2});
    } else if (entity.type === 'circle') {
      points.push(entity.center);
      points.push({x: entity.center.x + entity.radius, y: entity.center.y});
      points.push({x: entity.center.x - entity.radius, y: entity.center.y});
      points.push({x: entity.center.x, y: entity.center.y + entity.radius});
      points.push({x: entity.center.x, y: entity.center.y - entity.radius});
    } else if (entity.type === 'rectangle') {
      points.push(entity.p1);
      points.push(entity.p2);
      // Rect points
      const minX = Math.min(entity.p1.x, entity.p2.x);
      const maxX = Math.max(entity.p1.x, entity.p2.x);
      const minY = Math.min(entity.p1.y, entity.p2.y);
      const maxY = Math.max(entity.p1.y, entity.p2.y);
      points.push({x: minX, y: minY});
      points.push({x: maxX, y: minY});
      points.push({x: minX, y: maxY});
      points.push({x: maxX, y: maxY});
      points.push({x: (minX + maxX) / 2, y: (minY + maxY) / 2});
    } else if (entity.type === 'arc') {
      points.push(entity.center);
      const startRad = entity.startAngle * Math.PI / 180;
      const endRad = entity.endAngle * Math.PI / 180;
      points.push({
        x: entity.center.x + entity.radius * Math.cos(startRad),
        y: entity.center.y + entity.radius * Math.sin(startRad)
      });
      points.push({
        x: entity.center.x + entity.radius * Math.cos(endRad),
        y: entity.center.y + entity.radius * Math.sin(endRad)
      });
    } else if (entity.type === 'point') {
      const p = entity.point || (entity as any).position;
      if (p) points.push(p);
    } else if (entity.type === 'text') {
      points.push(entity.point);
    } else if (entity.type === 'image') {
      points.push(entity.point);
      points.push({ x: entity.point.x + entity.width, y: entity.point.y });
      points.push({ x: entity.point.x, y: entity.point.y + entity.height });
      points.push({ x: entity.point.x + entity.width, y: entity.point.y + entity.height });
      points.push({ x: entity.point.x + entity.width / 2, y: entity.point.y + entity.height / 2 });
    }
    return points;
  };

  const getLineAtPoint = (point: Point): Entity | undefined => {
      const ent = getEntityAtPoint(point);
      return ent && ent.type === 'line' ? ent : undefined;
  };

  const applyRaccordo = (
    id1: string,
    id2: string,
    clickPt1: Point,
    clickPt2: Point,
    existingRaccordoId?: string,
    overrideConfig?: { type: 'curvo' | 'rettilineo' | 'taglia'; value: number },
    forceOriginalLines?: { originalLine1: LineEntity; originalLine2: LineEntity }
  ) => {
    const line1 = (entities.find(e => e.id === id1) || (forceOriginalLines ? forceOriginalLines.originalLine1 : undefined)) as LineEntity | undefined;
    const line2 = (entities.find(e => e.id === id2) || (forceOriginalLines ? forceOriginalLines.originalLine2 : undefined)) as LineEntity | undefined;
    if (!line1 || !line2 || line1.type !== 'line' || line2.type !== 'line') return;

    // 1. Find line-line intersection of the infinite lines
    const x1 = line1.start.x, y1 = line1.start.y;
    const x2 = line1.end.x, y2 = line1.end.y;
    const x3 = line2.start.x, y3 = line2.start.y;
    const x4 = line2.end.x, y4 = line2.end.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) {
      if (!existingRaccordoId) {
        alert("I segmenti sono paralleli o coincidenti, impossibile raccordare.");
      }
      return;
    }

    const intersectX = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom;
    const intersectY = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom;
    const I = { x: intersectX, y: intersectY };

    // 2. Determine projectively correct rays V1 and V2 pointing from I towards the active/clicked portion of each line
    const dx1 = line1.end.x - line1.start.x;
    const dy1 = line1.end.y - line1.start.y;
    const lineLen1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    if (lineLen1 < 1e-3) {
      if (!existingRaccordoId) alert("Geometria di uno dei segmenti non valida.");
      return;
    }
    const U1 = { x: dx1 / lineLen1, y: dy1 / lineLen1 };

    let V1: Point;
    let Far1: Point;
    let maxLen1: number;
    let isStartFar1: boolean;

    if (existingRaccordoId) {
      // Robust Editing: Reconstruct original segment state directly using relative distances
      // to avoid using stale clickPt coordinates after moving/modifying lines
      const dStart = Math.sqrt((line1.start.x - I.x) ** 2 + (line1.start.y - I.y) ** 2);
      const dEnd = Math.sqrt((line1.end.x - I.x) ** 2 + (line1.end.y - I.y) ** 2);
      isStartFar1 = dStart > dEnd;
      Far1 = isStartFar1 ? line1.start : line1.end;
      maxLen1 = Math.max(dStart, dEnd);
      V1 = {
        x: (Far1.x - I.x) / (maxLen1 || 1),
        y: (Far1.y - I.y) / (maxLen1 || 1)
      };
    } else {
      // New raccordo creation based on clickPt coordinate branch selection
      const dotClick1 = (clickPt1.x - I.x) * U1.x + (clickPt1.y - I.y) * U1.y;
      V1 = {
        x: dotClick1 >= 0 ? U1.x : -U1.x,
        y: dotClick1 >= 0 ? U1.y : -U1.y
      };
      const projStart1 = (line1.start.x - I.x) * V1.x + (line1.start.y - I.y) * V1.y;
      const projEnd1 = (line1.end.x - I.x) * V1.x + (line1.end.y - I.y) * V1.y;
      isStartFar1 = projStart1 > projEnd1;
      Far1 = isStartFar1 ? line1.start : line1.end;
      maxLen1 = Math.max(projStart1, projEnd1);
    }

    const dx2 = line2.end.x - line2.start.x;
    const dy2 = line2.end.y - line2.start.y;
    const lineLen2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    if (lineLen2 < 1e-3) {
      if (!existingRaccordoId) alert("Geometria di uno dei segmenti non valida.");
      return;
    }
    const U2 = { x: dx2 / lineLen2, y: dy2 / lineLen2 };

    let V2: Point;
    let Far2: Point;
    let maxLen2: number;
    let isStartFar2: boolean;

    if (existingRaccordoId) {
      const dStart = Math.sqrt((line2.start.x - I.x) ** 2 + (line2.start.y - I.y) ** 2);
      const dEnd = Math.sqrt((line2.end.x - I.x) ** 2 + (line2.end.y - I.y) ** 2);
      isStartFar2 = dStart > dEnd;
      Far2 = isStartFar2 ? line2.start : line2.end;
      maxLen2 = Math.max(dStart, dEnd);
      V2 = {
        x: (Far2.x - I.x) / (maxLen2 || 1),
        y: (Far2.y - I.y) / (maxLen2 || 1)
      };
    } else {
      const dotClick2 = (clickPt2.x - I.x) * U2.x + (clickPt2.y - I.y) * U2.y;
      V2 = {
        x: dotClick2 >= 0 ? U2.x : -U2.x,
        y: dotClick2 >= 0 ? U2.y : -U2.y
      };
      const projStart2 = (line2.start.x - I.x) * V2.x + (line2.start.y - I.y) * V2.y;
      const projEnd2 = (line2.end.x - I.x) * V2.x + (line2.end.y - I.y) * V2.y;
      isStartFar2 = projStart2 > projEnd2;
      Far2 = isStartFar2 ? line2.start : line2.end;
      maxLen2 = Math.max(projStart2, projEnd2);
    }

    // 3. Compute angle theta between V1 and V2
    const cosTheta = Math.max(-1, Math.min(1, V1.x * V2.x + V1.y * V2.y));
    const theta = Math.acos(cosTheta);
    if (Math.abs(Math.sin(theta)) < 1e-3) {
      if (!existingRaccordoId) {
        alert("L'angolo tra i segmenti è piatto o troppo acuto, impossibile raccordare.");
      }
      return;
    }

    const isBothWalls = line1.isBIM && line1.bimType === 'wall' && line2.isBIM && line2.bimType === 'wall';
    const config = isBothWalls
      ? { type: 'rettilineo' as const, value: 0 }
      : (overrideConfig || raccordoConfig || { type: 'curvo', value: 10 });
    const pVal = config.value;

    let T = 0; // tangent distance from I

    if (config.type === 'curvo') {
      const alpha = theta / 2;
      T = pVal / Math.tan(alpha);
    } else {
      T = pVal;
    }

    // 4. Soft clamp T dynamically to prevent reversing or crashing, leaving at least 0.5cm of segments
    const maxAllowedT = Math.max(0.1, Math.min(maxLen1, maxLen2) - 0.5);
    if (T > maxAllowedT) {
      if (!existingRaccordoId) {
        alert(`Il parametro inserito (${pVal} cm - offset ${T.toFixed(1)} cm) è troppo grande rispetto alla lunghezza di una delle due linee. Sarà applicato il valore massimo di ${(maxAllowedT * (config.type === 'curvo' ? Math.tan(theta/2) : 1)).toFixed(1)} cm.`);
      }
      T = maxAllowedT;
    }

    // 5. New clipped endpoints on both segments
    const C1 = { x: I.x + T * V1.x, y: I.y + T * V1.y };
    const C2 = { x: I.x + T * V2.x, y: I.y + T * V2.y };

    // Commit history
    onCommitHistory?.(entities);

    // Prepare modified lines preserving original start/end directions to avoid flipping line orientations
    const updatedLine1: LineEntity = {
      ...line1,
      start: isStartFar1 ? Far1 : C1,
      end: isStartFar1 ? C1 : Far1
    };

    const updatedLine2: LineEntity = {
      ...line2,
      start: isStartFar2 ? Far2 : C2,
      end: isStartFar2 ? C2 : Far2
    };

    const defaultOriginalLine1 = forceOriginalLines ? forceOriginalLines.originalLine1 : JSON.parse(JSON.stringify(line1));
    const defaultOriginalLine2 = forceOriginalLines ? forceOriginalLines.originalLine2 : JSON.parse(JSON.stringify(line2));
    
    const raccordoMetadata = {
      id1: line1.id,
      id2: line2.id,
      originalLine1: defaultOriginalLine1,
      originalLine2: defaultOriginalLine2,
      clickPt1,
      clickPt2,
      config: { type: config.type, value: config.type === 'curvo' && T === maxAllowedT ? T * Math.tan(theta/2) : config.value }
    };

    let newConnector: Entity;

    if (config.type === 'curvo') {
      // 6a. Arc-fillet construction
      const alpha = theta / 2;
      // V_bisect points towards the corner I. To move O away from I, we follow this bisector.
      const V_bisect = { x: V1.x + V2.x, y: V1.y + V2.y };
      const lenBisect = Math.sqrt(V_bisect.x * V_bisect.x + V_bisect.y * V_bisect.y);
      if (lenBisect < 1e-6) return;
      V_bisect.x /= lenBisect;
      V_bisect.y /= lenBisect;

      const dist_bisect = pVal / Math.sin(alpha);
      const O = { x: I.x + dist_bisect * V_bisect.x, y: I.y + dist_bisect * V_bisect.y };

      const U1 = { x: C1.x - O.x, y: C1.y - O.y };
      const U2 = { x: C2.x - O.x, y: C2.y - O.y };

      const a1 = Math.atan2(U1.y, U1.x) * 180 / Math.PI;
      const a2 = Math.atan2(U2.y, U2.x) * 180 / Math.PI;

      // The arc midpoint facing corner I is in the direction of -V_bisect relative to Center O
      const aMid = Math.atan2(-V_bisect.y, -V_bisect.x) * 180 / Math.PI;

      let startAngle = a1;
      let endAngle = a2;
      if (!isAngleInArc(aMid, a1, a2)) {
        startAngle = a2;
        endAngle = a1;
      }

      newConnector = {
        id: existingRaccordoId || ("raccordo-arc-" + Date.now().toString()),
        type: 'arc',
        center: O,
        radius: pVal,
        startAngle: startAngle,
        endAngle: endAngle,
        color: line1.color || defaultLineStyle.color,
        lineWidth: line1.lineWidth || defaultLineStyle.lineWidth,
        layer: activeLayerId,
        mode: line1.mode || defaultLineStyle.mode,
        raccordoMetadata
      } as ArcEntity;
    } else {
      // 6b. Chamfer-line construction
      newConnector = {
        id: existingRaccordoId || ("raccordo-line-" + Date.now().toString()),
        type: 'line',
        start: C1,
        end: C2,
        color: line1.color || defaultLineStyle.color,
        lineWidth: line1.lineWidth || defaultLineStyle.lineWidth,
        layer: activeLayerId,
        mode: line1.mode || defaultLineStyle.mode,
        raccordoMetadata
      } as LineEntity;
    }

    const shouldAddConnector = !isBothWalls && T > 0.001;

    setEntities(prev => {
      // 1. Remove existing raccordo for this pair OR the specific existingRaccordoId being edited
      const filtered = prev.filter(ent => {
          if (existingRaccordoId && ent.id === existingRaccordoId) return false;
          if (ent.raccordoMetadata) {
              const m = ent.raccordoMetadata;
              const isSamePair = (m.id1 === id1 && m.id2 === id2) || (m.id1 === id2 && m.id2 === id1);
              if (isSamePair) return false;
          }
          
          // Improved Precise Trimming: Identify and remove overlapping residues or collinear tails with a robust 1.5cm tolerance
          if (ent.type === 'line' && ent.id !== id1 && ent.id !== id2 && (!ent.isBIM || ent.bimType !== 'wall')) {
             const l = ent as LineEntity;
             const tolerance = 1.5; // robust tolerance in cm
             
             // Check Line 1 collinearity with robust distance check (projection along V1 relative to I)
             const distStart1 = Math.abs((l.start.x - I.x) * V1.y - (l.start.y - I.y) * V1.x);
             const distEnd1 = Math.abs((l.end.x - I.x) * V1.y - (l.end.y - I.y) * V1.x);
             if (distStart1 < tolerance && distEnd1 < tolerance) {
                 const projS = (l.start.x - I.x) * V1.x + (l.start.y - I.y) * V1.y;
                 const projE = (l.end.x - I.x) * V1.x + (l.end.y - I.y) * V1.y;
                 // If both endpoints are completely on the discard side of C1, delete the line
                 if (projS < T - 0.1 && projE < T - 0.1) {
                     // Only delete if it belongs to the corner (at least one endpoint has projection > -100cm from intersection I)
                     if (projS > -100.0 || projE > -100.0) return false;
                 }
             }

             // Check Line 2 collinearity
             const distStart2 = Math.abs((l.start.x - I.x) * V2.y - (l.start.y - I.y) * V2.x);
             const distEnd2 = Math.abs((l.end.x - I.x) * V2.y - (l.end.y - I.y) * V2.x);
             if (distStart2 < tolerance && distEnd2 < tolerance) {
                 const projS = (l.start.x - I.x) * V2.x + (l.start.y - I.y) * V2.y;
                 const projE = (l.end.x - I.x) * V2.x + (l.end.y - I.y) * V2.y;
                 // If both endpoints are completely on the discard side of C2, delete the line
                 if (projS < T - 0.1 && projE < T - 0.1) {
                     // Only delete if it belongs to the corner (at least one endpoint has projection > -100cm from intersection I)
                     if (projS > -100.0 || projE > -100.0) return false;
                 }
             }
          }
          return true;
      });

      // 2. Identify the lines to update and trim any crossed collinear segments at C1 and C2
      const updated = filtered.map(ent => {
        if (ent.id === id1) return updatedLine1;
        if (ent.id === id2) return updatedLine2;
        
        // Also trim overlapping collinear lines
        if (ent.type === 'line' && (!ent.isBIM || ent.bimType !== 'wall')) {
           const l = ent as LineEntity;
           const tolerance = 1.5;
           
           // Check Line 1 collinearity
           const distStart1 = Math.abs((l.start.x - I.x) * V1.y - (l.start.y - I.y) * V1.x);
           const distEnd1 = Math.abs((l.end.x - I.x) * V1.y - (l.end.y - I.y) * V1.x);
           if (distStart1 < tolerance && distEnd1 < tolerance) {
               const projS = (l.start.x - I.x) * V1.x + (l.start.y - I.y) * V1.y;
               const projE = (l.end.x - I.x) * V1.x + (l.end.y - I.y) * V1.y;
               
               if (projS >= T - 0.1 && projE < T - 0.1) {
                   return { ...l, end: C1 };
               }
               if (projE >= T - 0.1 && projS < T - 0.1) {
                   return { ...l, start: C1 };
               }
           }
           
           // Check Line 2 collinearity
           const distStart2 = Math.abs((l.start.x - I.x) * V2.y - (l.start.y - I.y) * V2.x);
           const distEnd2 = Math.abs((l.end.x - I.x) * V2.y - (l.end.y - I.y) * V2.x);
           if (distStart2 < tolerance && distEnd2 < tolerance) {
               const projS = (l.start.x - I.x) * V2.x + (l.start.y - I.y) * V2.y;
               const projE = (l.end.x - I.x) * V2.x + (l.end.y - I.y) * V2.y;
               
               if (projS >= T - 0.1 && projE < T - 0.1) {
                   return { ...l, end: C2 };
               }
               if (projE >= T - 0.1 && projS < T - 0.1) {
                   return { ...l, start: C2 };
               }
           }
        }
        
        return ent;
      });
      
      return (shouldAddConnector ? updated.concat(newConnector) : updated) as Entity[];
    });



    // Automatically trigger edit if it's a new raccordo or has onEditRaccordo
    if (onEditRaccordo && shouldAddConnector) {
        onEditRaccordo(newConnector);
    }
  };
  const renderRef = useRef<(() => void) | null>(null);

  const alignCursorToLineEndpointInternal = (updatedLine: LineEntity) => {
      const p1 = updatedLine.start;
      const p2 = updatedLine.end;
      
      let targetEndpoint = p2;
      if (selectedLineClickPoint) {
          const d1 = Math.hypot(p1.x - selectedLineClickPoint.x, p1.y - selectedLineClickPoint.y);
          const d2 = Math.hypot(p2.x - selectedLineClickPoint.x, p2.y - selectedLineClickPoint.y);
          targetEndpoint = d1 < d2 ? p1 : p2;
      } else {
          // Fallback to connections-based terminal check
          const pointsEqual = (pt1: Point, pt2: Point) => Math.hypot(pt1.x - pt2.x, pt1.y - pt2.y) < 0.2;
          let p1Connections = 0;
          let p2Connections = 0;
          const currentEntities = entitiesRef.current || entities;
          currentEntities.forEach(ent => {
              if (ent.type === 'line' && ent.id !== updatedLine.id) {
                  const l = ent as LineEntity;
                  if (pointsEqual(l.start, p1) || pointsEqual(l.end, p1)) {
                      p1Connections++;
                  }
                  if (pointsEqual(l.start, p2) || pointsEqual(l.end, p2)) {
                      p2Connections++;
                  }
              }
          });
          targetEndpoint = p1Connections < p2Connections ? p1 : p2;
      }

      // Automatically switch to the Line tool so the user is immediately ready to draw the next segment
      isProgrammaticAlignRef.current = true;
      setActiveTool?.('Line');

      // Update drawing state so continuous segment tranches start from here
      setDrawing({
          start: targetEndpoint,
          current: targetEndpoint,
          snapType: 'CAD',
          startSnapped: true,
          isVirtual: false,
          isFreehand: true
      });

      // Calculate and save the virtual offset between the physical mouse position and the new target endpoint
      const physicalMouse = selectedLineClickPoint || lastMouseRef.current || targetEndpoint;
      virtualCursorOffsetRef.current = {
          x: targetEndpoint.x - physicalMouse.x,
          y: targetEndpoint.y - physicalMouse.y
      };

      // Update actual mouse coordinates and tracking so snap/guides render seamlessly at the new endpoint
      actualMousePosRef.current = targetEndpoint;
      lastMouseRef.current = targetEndpoint;
      lastControlledPointRef.current = targetEndpoint;

      // Update tecnigrafo origin if it is active
      if (tecnigrafoOrigin) {
          setTecnigrafoOrigin(targetEndpoint);
      }

      // Force an immediate frame repaint so the cursor position updates instantly on the screen
      renderRef.current?.();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resizeObserver = new ResizeObserver(entries => {
      window.requestAnimationFrame(() => {
        for (let entry of entries) {
          if (canvas.width !== entry.contentRect.width || canvas.height !== entry.contentRect.height) {
            canvas.width = entry.contentRect.width;
            canvas.height = entry.contentRect.height;
            renderRef.current?.();
          }
        }
      });
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx || !canvas.width || !canvas.height) return;
      ctx.imageSmoothingEnabled = false;

      // Map entities to their projected counterparts for precise 2D drawing of 3D rotations
      const projectedEntities = entities.map(getProjectedEntity);

      // Always reset global state to prevent carry-over from previous frame
      ctx.globalAlpha = 1.0;
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // Clear and draw based on view state
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = isLavagna ? '#121513' : '#EFECE5'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.save();
      ctx.translate(view.pan.x, view.pan.y);
      ctx.scale(view.zoom, view.zoom);
      
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const getAlphaColor = (colorStr: string | undefined, alpha: number, defaultRGB = "85, 85, 85") => {
        if (!colorStr || !colorStr.startsWith('#')) return `rgba(${defaultRGB}, ${alpha})`;
        const hex = colorStr.replace('#', '');
        if (hex.length === 3) {
          const r = parseInt(hex[0] + hex[0], 16);
          const g = parseInt(hex[1] + hex[1], 16);
          const b = parseInt(hex[2] + hex[2], 16);
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        } else if (hex.length === 6) {
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return `rgba(${defaultRGB}, ${alpha})`;
      };

      // Reset active parallel pair at the start of each frame
      activeParallelPairRef.current = null;

      const applyCustomLineDash = (lineType?: string, dashed?: boolean) => {
        if (lineType) {
          if (lineType === 'dashed') ctx.setLineDash([8 / view.zoom, 4 / view.zoom]);
          else if (lineType === 'dotted') ctx.setLineDash([2 / view.zoom, 3 / view.zoom]);
          else if (lineType === 'dashdot') ctx.setLineDash([12 / view.zoom, 4 / view.zoom, 2 / view.zoom, 4 / view.zoom]);
          else if (lineType === 'dashdash') ctx.setLineDash([15 / view.zoom, 4 / view.zoom, 4 / view.zoom, 4 / view.zoom]);
          else ctx.setLineDash([]);
        } else if (dashed) {
          ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
        } else {
          ctx.setLineDash([]);
        }
      };

      // Deterministic coordinate hash in [0, 1) so paper-fiber grain, sbavature, and nib footprints never flicker
      const hashPaper2D = (x: number, y: number, salt: number): number => {
        const s = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
        return s - Math.floor(s);
      };

      // --- HIGH-CRAFT TRADITIONAL & CAD STROKE ENGINE (MATITA / CHINA / CAD) ---
      const drawTraditionalOrCADLine = (
        p1: Point,
        p2: Point,
        mode: 'pencil' | 'ink' | 'CAD' | undefined,
        rawColor: string | undefined,
        lineWidthVal: number,
        lineType?: string,
        dashed?: boolean,
        isHighlighted?: boolean,
        highlightColor?: string | CanvasGradient | CanvasPattern,
        highlightWidth?: number,
        isSecondPass?: boolean
      ) => {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.0001) return;

        ctx.save();
        const effectiveMode = mode || 'CAD';
        const isCustomDash = (lineType && lineType !== 'continuous') || dashed;
        const ux = dx / len;
        const uy = dy / len;
        const nx = -uy;
        const ny = ux;

        if (isHighlighted && highlightColor) {
          applyCustomLineDash(lineType, dashed);
          ctx.strokeStyle = highlightColor;
          ctx.lineWidth = highlightWidth || (getEffectiveCADRenderWidth(lineWidthVal, effectiveMode, view.zoom) + 2 / view.zoom);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.restore();
          return;
        }

        if (effectiveMode === 'ink') {
          // CHINA (Rapidograph / Rotring Technical India Ink on Cotton Drafting Paper):
          const w = getEffectiveCADRenderWidth(lineWidthVal, 'ink', view.zoom);
          const inkHex = isLavagna
            ? '#FAF9F6'
            : (!rawColor || rawColor === '#000000' || rawColor === '#000' || rawColor === '#444444' || rawColor === '#bbbbbb'
                ? (isSecondPass ? '#010203' : '#0b0e14')
                : rawColor);
          const fallbackRgb = isLavagna ? '250, 249, 246' : (isSecondPass ? '1, 2, 3' : '11, 14, 20');
          const paperSkipHex = isLavagna ? '#1e293b' : '#f4f1ea';
          const paperSkipRgb = isLavagna ? '30, 41, 59' : '244, 241, 234';

          applyCustomLineDash(lineType, dashed);

          if (isSecondPass) {
            // --- 2° PASSO (RICALCO CHINA): Corregge le sbavature e le fibre secche, diventando TUTTA SCURA, piena e profonda ---
            // 1. Deep saturated capillary consolidation halo that absorbs first-pass irregularities
            ctx.strokeStyle = getAlphaColor(inkHex, 0.34, fallbackRgb);
            ctx.lineWidth = w * 1.42;
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // 2. Full-bodied, pitch-black saturated India ink core (chiude ogni micro-vuoto della carta)
            ctx.strokeStyle = getAlphaColor(inkHex, 1.0, fallbackRgb);
            ctx.lineWidth = w * 1.18;
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // 3. Crisp wet-ink sheen along the borders
            if (!isCustomDash) {
              const borderOff = w * 0.26;
              ctx.strokeStyle = getAlphaColor(inkHex, 0.92, fallbackRgb);
              ctx.lineWidth = w * 0.65;
              ctx.beginPath();
              ctx.moveTo(p1.x + nx * borderOff, p1.y + ny * borderOff);
              ctx.lineTo(p2.x + nx * borderOff, p2.y + ny * borderOff);
              ctx.moveTo(p1.x - nx * borderOff, p1.y - ny * borderOff);
              ctx.lineTo(p2.x - nx * borderOff, p2.y - ny * borderOff);
              ctx.stroke();
            }
          } else {
            // --- 1° PASSO (PRIMA STESURA CHINA): Viva, con micro-sbavature capillari e leggere resistenze della carta ---
            // 1. Subtle outer capillary paper-fiber bleed
            ctx.strokeStyle = getAlphaColor(inkHex, 0.14, fallbackRgb);
            ctx.lineWidth = w * 1.32;
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // 2. First-pass ink core (leggermente meno saturo del 2° passo, così il ricalco scurisce davvero)
            ctx.strokeStyle = getAlphaColor(inkHex, 0.82, fallbackRgb);
            ctx.lineWidth = w * 0.95;
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            if (!isCustomDash) {
              // 3. Irregular edge modulation along paper fibers
              const edgeOff = w * 0.24;
              ctx.setLineDash([7.0 / view.zoom, 2.2 / view.zoom, 11.5 / view.zoom, 1.8 / view.zoom]);
              ctx.strokeStyle = getAlphaColor(inkHex, 0.48, fallbackRgb);
              ctx.lineWidth = w * 0.52;
              ctx.beginPath();
              ctx.moveTo(p1.x + nx * edgeOff, p1.y + ny * edgeOff);
              ctx.lineTo(p2.x + nx * edgeOff, p2.y + ny * edgeOff);
              ctx.stroke();

              ctx.setLineDash([9.5 / view.zoom, 2.5 / view.zoom, 5.0 / view.zoom, 2.1 / view.zoom]);
              ctx.beginPath();
              ctx.moveTo(p1.x - nx * edgeOff * 0.9, p1.y - ny * edgeOff * 0.9);
              ctx.lineTo(p2.x - nx * edgeOff * 0.9, p2.y - ny * edgeOff * 0.9);
              ctx.stroke();
              ctx.setLineDash([]);

              // 4. Lungo il percorso: sbavature capillari asimmetriche e micro-graffi di fibra secca (che spariscono col 2° passo!)
              const worldStep = 8.5; // deterministic spacing in world units
              const numSamples = Math.min(55, Math.max(2, Math.floor(len / worldStep)));
              const actualStep = len / numSamples;

              for (let i = 1; i < numSamples; i++) {
                const distAlong = i * actualStep;
                const sx = p1.x + ux * distAlong;
                const sy = p1.y + uy * distAlong;
                // Quantize world position for deterministic seed
                const qx = Math.round(sx * 2) * 0.5;
                const qy = Math.round(sy * 2) * 0.5;
                const hType = hashPaper2D(qx, qy, 11);
                const hSide = hashPaper2D(qx, qy, 23);
                const hShape = hashPaper2D(qx, qy, 37);

                if (hType > 0.60) {
                  // SBAVATURA CAPILLARE (micro-bavetta obliqua d'inchiostro nelle fibre della carta)
                  const side = hSide > 0.5 ? 1 : -1;
                  const smearLen = w * (1.1 + hShape * 1.6);
                  const smearOut = w * (0.42 + hSide * 0.52) * side;
                  const skew = (hShape - 0.35) * smearLen * 0.85;

                  ctx.fillStyle = getAlphaColor(inkHex, 0.52 + hShape * 0.26, fallbackRgb);
                  ctx.beginPath();
                  ctx.moveTo(sx - ux * smearLen * 0.55, sy - uy * smearLen * 0.55);
                  ctx.lineTo(sx + ux * skew + nx * smearOut, sy + uy * skew + ny * smearOut);
                  ctx.lineTo(sx + ux * (skew + w * 0.38) + nx * (smearOut * 0.55), sy + uy * (skew + w * 0.38) + ny * (smearOut * 0.55));
                  ctx.lineTo(sx + ux * smearLen * 0.55, sy + uy * smearLen * 0.55);
                  ctx.closePath();
                  ctx.fill();
                } else if (hType < 0.30) {
                  // MICRO- MANCANZA / FIBRA RUVIDA DELLA CARTA (dove la china al 1° passo resta leggermente scarica)
                  const skipLen = Math.min(actualStep * 0.45, w * (1.6 + hShape * 2.1));
                  const skipOff = (hSide - 0.5) * w * 0.42;
                  ctx.strokeStyle = getAlphaColor(paperSkipHex, 0.44, paperSkipRgb);
                  ctx.lineWidth = w * (0.30 + hShape * 0.16);
                  ctx.lineCap = 'butt';
                  ctx.beginPath();
                  ctx.moveTo(sx - ux * skipLen * 0.5 + nx * skipOff, sy - uy * skipLen * 0.5 + ny * skipOff);
                  ctx.lineTo(sx + ux * skipLen * 0.5 - nx * skipOff * 0.6, sy + uy * skipLen * 0.5 - ny * skipOff * 0.6);
                  ctx.stroke();
                }
              }

              // 5. Attacco (p1) e Stacco (p2) del pennino a China: NON rotondi, sottili, asimmetrici e mai uguali!
              const hStart1 = hashPaper2D(p1.x, p1.y, 101);
              const hStart2 = hashPaper2D(p1.x, p1.y, 107);
              const hEnd1 = hashPaper2D(p2.x, p2.y, 211);
              const hEnd2 = hashPaper2D(p2.x, p2.y, 223);

              // Attacco (p1): micro-impronta obliqua a cuneo / baffo capillare (mai una pallina tonda!)
              const sSide = hStart1 > 0.5 ? 1 : -1;
              const sBack = w * (0.35 + hStart2 * 0.45);
              const sFwd = w * (0.65 + hStart1 * 0.55);
              const sLat = w * (0.46 + hStart2 * 0.18) * sSide;
              ctx.fillStyle = getAlphaColor(inkHex, 0.90, fallbackRgb);
              ctx.beginPath();
              ctx.moveTo(p1.x - ux * sBack + nx * (sLat * 0.65), p1.y - uy * sBack + ny * (sLat * 0.65));
              ctx.lineTo(p1.x + ux * (sFwd * 0.35) + nx * sLat, p1.y + uy * (sFwd * 0.35) + ny * sLat);
              ctx.lineTo(p1.x + ux * sFwd, p1.y + uy * sFwd);
              ctx.lineTo(p1.x - ux * (sBack * 0.45) - nx * (sLat * 0.48), p1.y - uy * (sBack * 0.45) - ny * (sLat * 0.48));
              ctx.closePath();
              ctx.fill();

              // Stacco (p2): micro-codina asimmetrica di rilascio del pennino (sfilacciatura obliqua)
              const eSide = hEnd1 > 0.5 ? 1 : -1;
              const eTail = w * (0.45 + hEnd2 * 0.55);
              const eBack = w * (0.60 + hEnd1 * 0.45);
              const eLat = w * (0.42 + hEnd1 * 0.16) * eSide;
              ctx.beginPath();
              ctx.moveTo(p2.x - ux * eBack + nx * (eLat * 0.5), p2.y - uy * eBack + ny * (eLat * 0.5));
              ctx.lineTo(p2.x + ux * eTail + nx * (eLat * 0.85), p2.y + uy * eTail + ny * (eLat * 0.85));
              ctx.lineTo(p2.x + ux * (eTail * 0.35) - nx * (eLat * 0.4), p2.y + uy * (eTail * 0.35) - ny * (eLat * 0.4));
              ctx.lineTo(p2.x - ux * (eBack * 0.7) - nx * (eLat * 0.55), p2.y - uy * (eBack * 0.7) - ny * (eLat * 0.55));
              ctx.closePath();
              ctx.fill();
            }
          }
        } else if (effectiveMode === 'pencil') {
          // MATITA (Authentic Graphite Lead 2H / HB / 2B on Textured Cotton Drafting Paper):
          const w = Math.max(0.95 / view.zoom, (lineWidthVal * 1.18) / view.zoom);
          const isSoftLead = lineWidthVal >= 2.2; // 2B
          const isHardLead = lineWidthVal <= 1.2; // 2H
          const defaultGraphite = isLavagna
            ? '#e2e8f0'
            : (isSecondPass
                ? (isSoftLead ? '#0f1217' : (isHardLead ? '#2d333b' : '#181c22'))
                : (isSoftLead ? '#252a32' : (isHardLead ? '#646f7d' : '#404852')));
          const graphiteHex = (!rawColor || rawColor === '#000000' || rawColor === '#444444' || rawColor === '#bbbbbb' || rawColor === '#111111')
            ? defaultGraphite
            : rawColor;
          const fallbackRgb = isSecondPass ? '24, 28, 34' : '64, 72, 82';
          const baseAlpha = isSecondPass
            ? (isSoftLead ? 0.97 : (isHardLead ? 0.86 : 0.93))
            : (isSoftLead ? 0.76 : (isHardLead ? 0.50 : 0.64));

          if (isCustomDash) {
            applyCustomLineDash(lineType, dashed);
            ctx.strokeStyle = getAlphaColor(graphiteHex, baseAlpha, fallbackRgb);
            ctx.lineWidth = isSecondPass ? w * 1.15 : w;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          } else if (isSecondPass) {
            // --- 2° PASSO MATITA (RICALCO GRAFITE): La mina riempie i pori della carta e diventa scura, satura e profonda ---
            ctx.setLineDash([]);
            // 1. Warm burnished graphite halo
            ctx.strokeStyle = getAlphaColor(graphiteHex, baseAlpha * 0.32, fallbackRgb);
            ctx.lineWidth = w * 1.65;
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // 2. Dense, continuous dark graphite core (chiude la grana bianca del primo passaggio)
            ctx.setLineDash([7.5 / view.zoom, 0.25 / view.zoom, 9.2 / view.zoom, 0.2 / view.zoom]);
            ctx.strokeStyle = getAlphaColor(graphiteHex, baseAlpha, fallbackRgb);
            ctx.lineWidth = w * 1.14;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // 3. Burnished crystalline graphite ridge
            const ridgeOff = w * 0.18;
            ctx.setLineDash([]);
            ctx.strokeStyle = getAlphaColor(graphiteHex, baseAlpha * 0.88, fallbackRgb);
            ctx.lineWidth = w * 0.82;
            ctx.beginPath();
            ctx.moveTo(p1.x + nx * ridgeOff, p1.y + ny * ridgeOff);
            ctx.lineTo(p2.x - nx * ridgeOff * 0.5, p2.y - ny * ridgeOff * 0.5);
            ctx.stroke();
          } else {
            // --- 1° PASSO MATITA: Grana porosa della carta ruvida + micro-sbavature polverose di grafite ---
            // 1. Soft graphite powder smudge halo on paper fibers
            ctx.setLineDash([]);
            ctx.strokeStyle = getAlphaColor(graphiteHex, baseAlpha * 0.20, fallbackRgb);
            ctx.lineWidth = w * 1.68;
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // 2. Primary graphite core with visible cotton-paper tooth micro-grain
            ctx.setLineDash([2.4 / view.zoom, 0.85 / view.zoom, 3.6 / view.zoom, 0.75 / view.zoom, 1.8 / view.zoom, 0.9 / view.zoom]);
            ctx.strokeStyle = getAlphaColor(graphiteHex, baseAlpha * 0.92, fallbackRgb);
            ctx.lineWidth = w * 0.94;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // 3. Secondary offset paper-weave grain pass inside core
            const weaveOff = w * 0.18;
            ctx.setLineDash([3.1 / view.zoom, 1.05 / view.zoom, 1.9 / view.zoom, 0.95 / view.zoom]);
            ctx.strokeStyle = getAlphaColor(graphiteHex, baseAlpha * 0.68, fallbackRgb);
            ctx.lineWidth = w * 0.68;
            ctx.beginPath();
            ctx.moveTo(p1.x + nx * weaveOff, p1.y + ny * weaveOff);
            ctx.lineTo(p2.x - nx * weaveOff * 0.5, p2.y - ny * weaveOff * 0.5);
            ctx.stroke();

            // 4. Upper & lower crystalline graphite micro-strands (sharpened conical lead facets)
            const strandOff = w * 0.36;
            ctx.setLineDash([3.5 / view.zoom, 1.45 / view.zoom, 2.2 / view.zoom, 1.25 / view.zoom]);
            ctx.strokeStyle = getAlphaColor(graphiteHex, baseAlpha * 0.54, fallbackRgb);
            ctx.lineWidth = w * 0.42;
            ctx.beginPath();
            ctx.moveTo(p1.x + nx * strandOff, p1.y + ny * strandOff);
            ctx.lineTo(p2.x + nx * strandOff, p2.y + ny * strandOff);
            ctx.stroke();

            ctx.setLineDash([2.3 / view.zoom, 1.55 / view.zoom, 3.9 / view.zoom, 1.15 / view.zoom]);
            ctx.strokeStyle = getAlphaColor(graphiteHex, baseAlpha * 0.48, fallbackRgb);
            ctx.beginPath();
            ctx.moveTo(p1.x - nx * strandOff * 0.9, p1.y - ny * strandOff * 0.9);
            ctx.lineTo(p2.x - nx * strandOff * 0.9, p2.y - ny * strandOff * 0.9);
            ctx.stroke();
            ctx.setLineDash([]);

            // 5. Micro-sbavature polverose di mina lungo il percorso (che al 2° passo vengono assorbite nel tratto scuro)
            const worldStep = 9.0;
            const numSamples = Math.min(50, Math.max(2, Math.floor(len / worldStep)));
            const actualStep = len / numSamples;
            for (let i = 1; i < numSamples; i++) {
              const distAlong = i * actualStep;
              const sx = p1.x + ux * distAlong;
              const sy = p1.y + uy * distAlong;
              const qx = Math.round(sx * 2) * 0.5;
              const qy = Math.round(sy * 2) * 0.5;
              const h1 = hashPaper2D(qx, qy, 53);
              const h2 = hashPaper2D(qx, qy, 67);
              if (h1 > 0.62) {
                const side = h2 > 0.5 ? 1 : -1;
                const dustLen = w * (1.2 + h1 * 1.5);
                const dustOut = w * (0.45 + h2 * 0.55) * side;
                ctx.strokeStyle = getAlphaColor(graphiteHex, baseAlpha * 0.42, fallbackRgb);
                ctx.lineWidth = w * 0.36;
                ctx.beginPath();
                ctx.moveTo(sx - ux * dustLen * 0.4, sy - uy * dustLen * 0.4);
                ctx.lineTo(sx + ux * dustLen * 0.6 + nx * dustOut, sy + uy * dustLen * 0.6 + ny * dustOut);
                ctx.stroke();
              }
            }
          }
        } else {
          // CAD: Clean, razor-sharp geometric vector stroke
          const w = getEffectiveCADRenderWidth(lineWidthVal, 'CAD', view.zoom);
          const cadColor = isLavagna
            ? (!rawColor || rawColor === '#000000' || rawColor === '#444444' || rawColor === '#bbbbbb' ? '#FAF9F6' : rawColor)
            : (rawColor || '#000000');
          applyCustomLineDash(lineType, dashed);
          ctx.strokeStyle = cadColor;
          ctx.lineWidth = w;
          ctx.lineCap = 'butt';
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
        ctx.restore();
      };

      const drawTraditionalOrCADCircleOrArc = (
        center: Point,
        radius: number,
        startAngleRad: number,
        endAngleRad: number,
        mode: 'pencil' | 'ink' | 'CAD' | undefined,
        rawColor: string | undefined,
        lineWidthVal: number,
        lineType?: string,
        dashed?: boolean,
        isHighlighted?: boolean,
        highlightColor?: string | CanvasGradient | CanvasPattern,
        highlightWidth?: number
      ) => {
        if (radius <= 0.0001) return;
        ctx.save();
        const effectiveMode = mode || 'CAD';
        const isCustomDash = (lineType && lineType !== 'continuous') || dashed;

        if (isHighlighted && highlightColor) {
          applyCustomLineDash(lineType, dashed);
          ctx.strokeStyle = highlightColor;
          ctx.lineWidth = highlightWidth || (getEffectiveCADRenderWidth(lineWidthVal, effectiveMode, view.zoom) + 2 / view.zoom);
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius, startAngleRad, endAngleRad);
          ctx.stroke();
          ctx.restore();
          return;
        }

        if (effectiveMode === 'ink') {
          const w = getEffectiveCADRenderWidth(lineWidthVal, 'ink', view.zoom);
          const inkHex = isLavagna
            ? '#FAF9F6'
            : (!rawColor || rawColor === '#000000' || rawColor === '#000' || rawColor === '#444444' || rawColor === '#bbbbbb'
                ? '#030508'
                : rawColor);
          const fallbackRgb = isLavagna ? '250, 249, 246' : '3, 5, 8';
          applyCustomLineDash(lineType, dashed);

          ctx.strokeStyle = getAlphaColor(inkHex, 0.19, fallbackRgb);
          ctx.lineWidth = w * 1.56;
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius, startAngleRad, endAngleRad);
          ctx.stroke();

          ctx.strokeStyle = getAlphaColor(inkHex, 1.0, fallbackRgb);
          ctx.lineWidth = w * 1.04;
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius, startAngleRad, endAngleRad);
          ctx.stroke();
        } else if (effectiveMode === 'pencil') {
          const w = Math.max(0.95 / view.zoom, (lineWidthVal * 1.18) / view.zoom);
          const isSoftLead = lineWidthVal >= 2.2;
          const isHardLead = lineWidthVal <= 1.2;
          const defaultGraphite = isLavagna
            ? '#e2e8f0'
            : (isSoftLead ? '#1e2229' : (isHardLead ? '#5c6672' : '#383f47'));
          const graphiteHex = (!rawColor || rawColor === '#000000' || rawColor === '#444444' || rawColor === '#bbbbbb' || rawColor === '#111111')
            ? defaultGraphite
            : rawColor;
          const baseAlpha = isSoftLead ? 0.90 : (isHardLead ? 0.62 : 0.78);

          if (isCustomDash) {
            applyCustomLineDash(lineType, dashed);
            ctx.strokeStyle = getAlphaColor(graphiteHex, baseAlpha, '56, 63, 71');
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, startAngleRad, endAngleRad);
            ctx.stroke();
          } else {
            ctx.setLineDash([]);
            ctx.strokeStyle = getAlphaColor(graphiteHex, baseAlpha * 0.24, '56, 63, 71');
            ctx.lineWidth = w * 1.75;
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, startAngleRad, endAngleRad);
            ctx.stroke();

            ctx.setLineDash([2.9 / view.zoom, 0.55 / view.zoom, 4.4 / view.zoom, 0.5 / view.zoom]);
            ctx.strokeStyle = getAlphaColor(graphiteHex, baseAlpha * 0.94, '56, 63, 71');
            ctx.lineWidth = w * 0.96;
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, startAngleRad, endAngleRad);
            ctx.stroke();

            const rOff = w * 0.30;
            ctx.setLineDash([4.1 / view.zoom, 1.15 / view.zoom, 2.6 / view.zoom, 0.95 / view.zoom]);
            ctx.strokeStyle = getAlphaColor(graphiteHex, baseAlpha * 0.55, '56, 63, 71');
            ctx.lineWidth = w * 0.44;
            ctx.beginPath();
            ctx.arc(center.x, center.y, Math.max(0.01, radius + rOff), startAngleRad, endAngleRad);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } else {
          const w = getEffectiveCADRenderWidth(lineWidthVal, 'CAD', view.zoom);
          const cadColor = isLavagna
            ? (!rawColor || rawColor === '#000000' || rawColor === '#444444' || rawColor === '#bbbbbb' ? '#FAF9F6' : rawColor)
            : (rawColor || '#000000');
          applyCustomLineDash(lineType, dashed);
          ctx.strokeStyle = cadColor;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius, startAngleRad, endAngleRad);
          ctx.stroke();
        }
        ctx.restore();
      };

      // --- LIVE GRAPHICAL NIB / DRAFTING INSTRUMENT RENDERED AT DRAWING TIP (3 TIPOLOGIE: CAD, CHINA, MATITA) ---
      const drawActiveInstrumentNib = (tip: Point) => {
        if (isPanningRef.current || isJollyActive || isMagicCopyActive) return;
        const isDrawingTool =
          activeTool === 'Line' ||
          activeTool === 'Circle' ||
          activeTool === 'Arc' ||
          activeTool === 'Rectangle' ||
          activeTool === 'Parallel';
        if (!isDrawingTool) return;

        const mode = defaultLineStyle.mode || 'CAD';
        const s = 1.15 / view.zoom; // Constant screen-space scale so the pen/pencil is always crisp at any zoom

        ctx.save();
        ctx.translate(view.pan.x, view.pan.y);
        ctx.scale(view.zoom, view.zoom);
        ctx.translate(tip.x, tip.y);
        ctx.setLineDash([]);

        if (mode === 'ink') {
          // PENNINO A CHINA (Simbolo Rapidograph / Rotring Tecnico ad Alta Precisione che scrive sulla punta)
          ctx.rotate(-38 * Math.PI / 180);

          // Soft paper drop shadow
          ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
          ctx.beginPath();
          ctx.moveTo(2.4 * s, 2.4 * s);
          ctx.lineTo(7 * s, -42 * s);
          ctx.lineTo(-1 * s, -42 * s);
          ctx.closePath();
          ctx.fill();

          // 1. Glistening wet India ink droplet right at contact point (0,0)
          ctx.fillStyle = '#030508';
          ctx.beginPath();
          ctx.arc(0, 0, 2.2 * s, 0, Math.PI * 2);
          ctx.fill();

          // 2. Ultra-fine stainless steel capillary needle (0 -> -8.5)
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.2 * s;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -8.5 * s);
          ctx.stroke();

          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.3 * s;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -8.5 * s);
          ctx.stroke();

          // 3. Stepped chrome capillary guide tube (-8.5 -> -15.5)
          ctx.fillStyle = '#f1f5f9';
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 1.0 * s;
          ctx.beginPath();
          ctx.rect(-2.2 * s, -15.5 * s, 4.4 * s, 7.0 * s);
          ctx.fill();
          ctx.stroke();

          // 4. Conical chrome nib holder (-15.5 -> -23.5)
          ctx.fillStyle = '#94a3b8';
          ctx.beginPath();
          ctx.moveTo(-2.2 * s, -15.5 * s);
          ctx.lineTo(2.2 * s, -15.5 * s);
          ctx.lineTo(5.0 * s, -23.5 * s);
          ctx.lineTo(-5.0 * s, -23.5 * s);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // 5. Classic Rotring ruby-red calibration ring (-23.5 -> -28.5)
          ctx.fillStyle = '#dc2626';
          ctx.beginPath();
          ctx.rect(-5.2 * s, -28.5 * s, 10.4 * s, 5.0 * s);
          ctx.fill();
          ctx.stroke();

          // 6. Matte-black technical barrel (-28.5 -> -50)
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(-5.2 * s, -50 * s, 10.4 * s, 21.5 * s, [2.5 * s, 2.5 * s, 0, 0]);
          ctx.fill();
          ctx.stroke();

          // Knurled grip ridges
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 0.85 * s;
          [-31.5, -34.5, -37.5].forEach(yOff => {
            ctx.beginPath();
            ctx.moveTo(-4.8 * s, yOff * s);
            ctx.lineTo(4.8 * s, yOff * s);
            ctx.stroke();
          });
        } else if (mode === 'pencil') {
          // MATITA TECNICA (Simbolo Matita Esagonale in Grafite 2H / HB / 2B che scrive sulla punta)
          ctx.rotate(-38 * Math.PI / 180);

          // Soft paper drop shadow
          ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
          ctx.beginPath();
          ctx.moveTo(2.2 * s, 2.2 * s);
          ctx.lineTo(7 * s, -42 * s);
          ctx.lineTo(-1 * s, -42 * s);
          ctx.closePath();
          ctx.fill();

          // Exposed conical graphite lead tip (0 -> -8.5)
          const gradeLabel = defaultLineStyle.lineWidth <= 1.2 ? '2H' : defaultLineStyle.lineWidth >= 2.2 ? '2B' : 'HB';
          ctx.fillStyle = gradeLabel === '2B' ? '#1e2229' : gradeLabel === '2H' ? '#64748b' : '#334155';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 0.7 * s;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(2.2 * s, -8.5 * s);
          ctx.lineTo(-2.2 * s, -8.5 * s);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Shaved cedar wood collar (-8.5 -> -19.5)
          ctx.fillStyle = '#fde68a';
          ctx.strokeStyle = '#92400e';
          ctx.lineWidth = 0.95 * s;
          ctx.beginPath();
          ctx.moveTo(-2.2 * s, -8.5 * s);
          ctx.lineTo(2.2 * s, -8.5 * s);
          ctx.lineTo(5.2 * s, -19.5 * s);
          ctx.lineTo(-5.2 * s, -19.5 * s);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Hexagonal drafting pencil barrel (-19.5 -> -48)
          ctx.fillStyle = '#1d4ed8'; // Staedtler Mars Lumograph classic drafting blue
          ctx.strokeStyle = '#1e3a8a';
          ctx.beginPath();
          ctx.roundRect(-5.2 * s, -48 * s, 10.4 * s, 28.5 * s, [2.5 * s, 2.5 * s, 0, 0]);
          ctx.fill();
          ctx.stroke();

          // Center hexagonal facet highlight
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(-2.0 * s, -46 * s, 4.0 * s, 26.5 * s);

          // White & black end crown ring
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(-5.2 * s, -43 * s, 10.4 * s, 3.0 * s);
        } else {
          // CAD: Precision Vernier Vector Reticle
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 1.4 * s;
          const r = 6.2 * s;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.moveTo(-11.5 * s, 0);
          ctx.lineTo(-2.5 * s, 0);
          ctx.moveTo(2.5 * s, 0);
          ctx.lineTo(11.5 * s, 0);
          ctx.moveTo(0, -11.5 * s);
          ctx.lineTo(0, -2.5 * s);
          ctx.moveTo(0, 2.5 * s);
          ctx.lineTo(0, 11.5 * s);
          ctx.stroke();
        }

        ctx.restore();
      };

      // --- Performance Optimization: Pre-calculate Data for the loop ---
      const layerMap = new Map<string, Layer>(layers.map(l => [l.id, l]));
      const bimWalls = projectedEntities.filter(e => e.type === 'line' && e.isBIM && e.bimType === 'wall') as LineEntity[];
      
      // Viewport bounds in canvas space
      const vOffsetX = 50 / view.zoom; // padding
      const vOffsetY = 50 / view.zoom;
      const viewMinX = -view.pan.x / view.zoom - vOffsetX;
      const viewMinY = -view.pan.y / view.zoom - vOffsetY;
      const viewMaxX = (canvas.width - view.pan.x) / view.zoom + vOffsetX;
      const viewMaxY = (canvas.height - view.pan.y) / view.zoom + vOffsetY;

      // Sort into hatches and others (hatches drawn first)
      const hatches: Entity[] = [];
      const others: Entity[] = [];
      
      for (const entity of projectedEntities) {
        if (entity.hideIn2D) continue;
        if ((entity as any).isVisible === false) continue;
        const layer = layerMap.get(entity.layer);
        if (layer && !layer.visible) continue;

        // Viewport Culling
        let inView = true;
        if (entity.type === 'line' || entity.type === 'dimension') {
          const minX = Math.min(entity.start.x, entity.end.x);
          const maxX = Math.max(entity.start.x, entity.end.x);
          const minY = Math.min(entity.start.y, entity.end.y);
          const maxY = Math.max(entity.start.y, entity.end.y);
          if (maxX < viewMinX || minX > viewMaxX || maxY < viewMinY || minY > viewMaxY) inView = false;
        } else if (entity.type === 'circle' || entity.type === 'arc') {
          if (entity.center.x + entity.radius < viewMinX || entity.center.x - entity.radius > viewMaxX || 
              entity.center.y + entity.radius < viewMinY || entity.center.y - entity.radius > viewMaxY) inView = false;
        } else if (entity.type === 'rectangle') {
          const minX = Math.min(entity.p1.x, entity.p2.x);
          const maxX = Math.max(entity.p1.x, entity.p2.x);
          const minY = Math.min(entity.p1.y, entity.p2.y);
          const maxY = Math.max(entity.p1.y, entity.p2.y);
          if (maxX < viewMinX || minX > viewMaxX || maxY < viewMinY || minY > viewMaxY) inView = false;
        } else if (entity.type === 'hatch' && entity.points) {
           // Basic bounding box check for hatch
           let hMinX = Infinity, hMaxX = -Infinity, hMinY = Infinity, hMaxY = -Infinity;
           for (const p of entity.points) {
               if (p.x < hMinX) hMinX = p.x; if (p.x > hMaxX) hMaxX = p.x;
               if (p.y < hMinY) hMinY = p.y; if (p.y > hMaxY) hMaxY = p.y;
           }
           if (hMaxX < viewMinX || hMinX > viewMaxX || hMaxY < viewMinY || hMinY > viewMaxY) inView = false;
        }

        if (!inView) continue;

        if (entity.type === 'hatch') hatches.push(entity);
        else others.push(entity);
      }

      [...hatches, ...others].forEach(entity => {
        const layer = layerMap.get(entity.layer);
        
        const isFlashing = flashIds.includes(entity.id);

        const isBIMSymbolEnt = entity.isBIM && (entity.bimType === 'electrical_symbol' || entity.bimType === 'hydraulic_symbol');
        const baseWidth = isBIMSymbolEnt ? (0.65 / view.zoom) : getEffectiveCADRenderWidth(entity.lineWidth, entity.mode, view.zoom);

        let finalColor = entity.color;
        
        // Apply renderingStyle color override
        const renderingStyle = (entity as any).renderingStyle;
        if (renderingStyle === 'calcestruzzo') finalColor = '#888888';
        else if (renderingStyle === 'mattone_portante') finalColor = '#A52A2A';
        else if (renderingStyle === 'tramezzo') finalColor = '#D3D3D3';
        else if (renderingStyle === 'solaio_pignatte') finalColor = '#556B2F';
        else if (renderingStyle === 'ponteggio') finalColor = '#ea580c';
        else if (renderingStyle === 'mantovana') finalColor = '#64748b';

        if (isLavagna) {
          if (!finalColor || finalColor === '#000000' || finalColor === '#000' || finalColor === '#111111' || finalColor === '#111' || finalColor === '#444444' || finalColor === '#444' || finalColor === '#bbbbbb') {
            finalColor = '#FAF9F6';
          }
        }
        ctx.strokeStyle = finalColor || ((entity.mode === 'pencil') ? (isLavagna ? '#FAF9F6' : '#bbbbbb') : (isLavagna ? '#FAF9F6' : '#000000'));
        ctx.lineWidth = baseWidth;
        ctx.globalAlpha = entity.opacity !== undefined ? entity.opacity : 1.0;
        if (layer && layer.frozen) {
            ctx.globalAlpha *= 0.4;
        }
        if (activeTool === 'Specchio' && specchioMode === 'move' && specchioSelectedIds.includes(entity.id)) {
            ctx.globalAlpha *= 0.2;
        }
        ctx.shadowBlur = 0; // Remove blur for sharp lines

        if (isFlashing) {
            // Pulse between black and soft green
            const r = Math.round(0 + (34 - 0) * flashIntensity);
            const g = Math.round(0 + (197 - 0) * flashIntensity);
            const b = Math.round(0 + (94 - 0) * flashIntensity);
            ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
            // Use fine spessore minimo of 1px for green blinking
            ctx.lineWidth = (1 / view.zoom) + (2 + 3 * flashIntensity) / view.zoom;
            ctx.shadowColor = `rgba(34, 197, 94, ${0.6 * flashIntensity})`;
            ctx.shadowBlur = 10 * flashIntensity;
        }

        const isBimFlashing = bimFlashIds.includes(entity.id);
        if (isBimFlashing) {
            const p = (Math.sin(Date.now() / 150) + 1) / 2;
            ctx.shadowColor = isLavagna ? 'rgba(103, 232, 249, 0.9)' : 'rgba(79, 70, 229, 0.9)';
            ctx.shadowBlur = (10 + 15 * p) / view.zoom;
            ctx.lineWidth += (2 + 4 * p) / view.zoom;
        }

        const isCurrentlyDragged = dragEntityIds.includes(entity.id);
        const isPropSelected = (selectedEntityIds as string[]).includes(entity.id);
        const isReallySelected = isPropSelected || isCurrentlyDragged ||
            (activeTool === 'Move' && moveSourceEntityIds.includes(entity.id)) ||
            (activeTool === 'Copy' && copySourceEntityIds.includes(entity.id));
        const pulse = isReallySelected ? (Math.sin(Date.now() / 150) + 1) / 2 : 0;

        if ((entity.id === selectedParallelLine?.id && blink) || (selectedEntityId === entity.id) || isReallySelected || (positioningGroupId && entity.groupId === positioningGroupId) || (positioningEntityId && entity.id === positioningEntityId) || selectedRaccordoLineIds.includes(entity.id)) {
          if (isFlashing) {
            // Let the flashing styles take precedence for initial attention blink
          } else if (entity.type === 'hatch') {
            ctx.strokeStyle = '#22c55e'; // Green highlight for selected hatch
            ctx.lineWidth = 1.5 / view.zoom; // Spessore minimo
          } else {
            // Se fa parte della selezione multipla (prop) o trascinamento, usa il Verde pulsante come richiesto
            ctx.strokeStyle = isReallySelected ? `rgba(34, 197, 94, ${0.8 + 0.2 * pulse})` : '#3b82f6'; // Pulsing Green if captured, Blue if single select
            
            // For pulsing/highlight green selection, use spessore minimo of 1.2px instead of object's actual wide stroke width
            const hBaseWidth = isReallySelected ? (1.2 / view.zoom) : baseWidth;
            ctx.lineWidth = hBaseWidth + (isReallySelected ? (3 + 1.5 * pulse) : 2) / view.zoom;
            if (isReallySelected) {
              ctx.shadowColor = 'rgba(34, 197, 94, 0.6)';
              ctx.shadowBlur = 10 * pulse;
            }
          }
        } else if (activeTool === 'Dimension' && selectionMode === 'object' && entity.id === hoveredDimensionEntityId) {
            ctx.strokeStyle = '#22c55e'; // Green highlight for hovered entity in dimension object selection mode
            ctx.lineWidth = (1.2 / view.zoom) + 2 / view.zoom;
        } else if ((dragEntityIds.includes(entity.id) || entity.id === dragEntityId || entity.id === highlightedTrimLine?.id) && (activeTool === 'Move' || activeTool === 'Cancella' || activeTool === 'Join' || activeTool === 'Copy' || isJollyActive || isMagicCopyActive)) {
            ctx.strokeStyle = activeTool === 'Cancella' ? '#ef4444' : activeTool === 'Join' ? '#22c55e' : '#3b82f6';
            const isGreenHighlight = activeTool === 'Join';
            const hBaseWidth = isGreenHighlight ? (1.2 / view.zoom) : baseWidth;
            ctx.lineWidth = hBaseWidth + 3 / view.zoom;
        } else if (copySourceEntityIds.includes(entity.id) && activeTool === 'Copy') {
            ctx.strokeStyle = '#22c55e'; // Green highlight for original mother object(s)
            ctx.lineWidth = (1.2 / view.zoom) + 3 / view.zoom; // thin normal
        } else if (moveSourceEntityIds.includes(entity.id) && activeTool === 'Move') {
            ctx.strokeStyle = '#22c55e'; // Green highlight for original object(s) to move
            ctx.lineWidth = (1.2 / view.zoom) + 3 / view.zoom; // thin normal
        }

        // --- 1. SPOSTA TUTTO / COPIA E SPOSTA (Z) / MOVE / COPY: MOSTRA SOLO LA DISTANZA PARALLELA ---
        // --- 2. CLICK SUL SEGMENTO (selectedEntityId): MOSTRA SOLO LA LUNGHEZZA DEL SEGMENTO ---
        // --- 3. SEMPLICE PASSAGGIO DEL MOUSE (hover): NESSUNA FINESTRA APERTA, DISEGNO LIBERO ---
        const isSpostaTuttoActive =
            isJollyActive ||
            isMagicCopyActive ||
            activeTool === 'Move' ||
            activeTool === 'Copy' ||
            !!dragEntityId ||
            dragEntityIds.length > 0 ||
            !!positioningEntityId;

        const shouldShowParallelDistance =
            entity.type === 'line' &&
            isSpostaTuttoActive &&
            (entity.id === dragEntityId ||
             dragEntityIds.includes(entity.id) ||
             entity.id === positioningEntityId ||
             entity.id === hoveredLineId ||
             entity.id === selectedEntityId);

        const shouldShowSegmentLength =
            entity.type === 'line' &&
            !isSpostaTuttoActive &&
            entity.id === selectedEntityId;

        if (shouldShowParallelDistance || shouldShowSegmentLength) {
            const line = entity as LineEntity;
            const dx = line.end.x - line.start.x;
            const dy = line.end.y - line.start.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0.1) {
                const tx = dx / len;
                const ty = dy / len;
                const nx = -dy / len;
                const ny = dx / len;

                if (shouldShowParallelDistance) {
                    let minParallelDist = Infinity;
                    let bestSignedDist = 0;
                    let nearestLine: LineEntity | null = null;

                    entities.forEach(other => {
                        if (other.id !== line.id && !dragEntityIds.includes(other.id) && other.type === 'line') {
                            const oLine = other as LineEntity;
                            const odx = oLine.end.x - oLine.start.x;
                            const ody = oLine.end.y - oLine.start.y;
                            const olen = Math.sqrt(odx * odx + ody * ody);
                            if (olen > 0.1) {
                                const onx = -ody / olen;
                                const ony = odx / olen;
                                const dot = Math.abs(nx * onx + ny * ony);
                                if (dot > 0.992) { // Parallel segments
                                    const signedD = (oLine.start.x - line.start.x) * nx + (oLine.start.y - line.start.y) * ny;
                                    const dist = Math.abs(signedD);
                                    if (dist > 0.05 && dist < minParallelDist) {
                                        minParallelDist = dist;
                                        bestSignedDist = signedD;
                                        nearestLine = oLine;
                                    }
                                }
                            }
                        }
                    });

                    if (nearestLine && minParallelDist < Infinity) {
                        const oLine = nearestLine as LineEntity;
                        activeParallelPairRef.current = {
                            lineId: line.id,
                            refLineId: oLine.id,
                            nx,
                            ny,
                            signedDist: bestSignedDist,
                            currentDist: minParallelDist
                        };

                        const tO1 = (oLine.start.x - line.start.x) * tx + (oLine.start.y - line.start.y) * ty;
                        const tO2 = (oLine.end.x - line.start.x) * tx + (oLine.end.y - line.start.y) * ty;
                        const oMin = Math.min(tO1, tO2);
                        const oMax = Math.max(tO1, tO2);
                        const overlapStart = Math.max(0, oMin);
                        const overlapEnd = Math.min(len, oMax);
                        const anchorT = overlapEnd >= overlapStart ? (overlapStart + overlapEnd) / 2 : len / 2;

                        const midX = line.start.x + tx * anchorT;
                        const midY = line.start.y + ty * anchorT;
                        const targetX = midX + nx * bestSignedDist;
                        const targetY = midY + ny * bestSignedDist;

                        ctx.save();
                        if (anchorT < oMin || anchorT > oMax) {
                            const nearEnd = Math.hypot(targetX - oLine.start.x, targetY - oLine.start.y) < Math.hypot(targetX - oLine.end.x, targetY - oLine.end.y)
                                ? oLine.start
                                : oLine.end;
                            ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
                            ctx.lineWidth = 1 / view.zoom;
                            ctx.setLineDash([3 / view.zoom, 3 / view.zoom]);
                            ctx.beginPath();
                            ctx.moveTo(nearEnd.x, nearEnd.y);
                            ctx.lineTo(targetX, targetY);
                            ctx.stroke();
                        }

                        const isTypingParallelOverride =
                            liveNumericOverride?.kind === 'parallel_dist' &&
                            liveNumericOverride.lineId === line.id &&
                            (Date.now() - liveNumericOverride.timestamp < 5000);

                        ctx.strokeStyle = isTypingParallelOverride ? '#10b981' : '#f59e0b';
                        ctx.lineWidth = (isTypingParallelOverride ? 2.4 : 2) / view.zoom;
                        ctx.setLineDash([5 / view.zoom, 4 / view.zoom]);
                        ctx.beginPath();
                        ctx.moveTo(midX, midY);
                        ctx.lineTo(targetX, targetY);
                        ctx.stroke();

                        ctx.setLineDash([]);
                        ctx.fillStyle = isTypingParallelOverride ? '#10b981' : '#f59e0b';
                        ctx.beginPath();
                        ctx.arc(midX, midY, 3.5 / view.zoom, 0, Math.PI * 2);
                        ctx.arc(targetX, targetY, 3.5 / view.zoom, 0, Math.PI * 2);
                        ctx.fill();

                        const tickSize = 6 / view.zoom;
                        ctx.strokeStyle = isTypingParallelOverride ? '#059669' : '#d97706';
                        ctx.lineWidth = 1.5 / view.zoom;
                        ctx.beginPath();
                        ctx.moveTo(midX - tx * tickSize, midY - ty * tickSize);
                        ctx.lineTo(midX + tx * tickSize, midY + ty * tickSize);
                        ctx.moveTo(targetX - tx * tickSize, targetY - ty * tickSize);
                        ctx.lineTo(targetX + tx * tickSize, targetY + ty * tickSize);
                        ctx.stroke();

                        const zoomDecimals = view.zoom >= 1.2 ? 3 : (view.zoom >= 0.45 ? 2 : (view.zoom >= 0.20 ? 1 : 0));
                        const formattedDist = zoomDecimals === 0
                            ? `${Math.round(minParallelDist)}`
                            : minParallelDist.toFixed(zoomDecimals).replace('.', ',');
                        const badgeLabel = isTypingParallelOverride
                            ? `${liveNumericOverride.text.replace('.', ',')}▌ cm`
                            : `${formattedDist} cm`;

                        const labelX = (midX + targetX) / 2;
                        const labelY = (midY + targetY) / 2;

                        ctx.font = `bold ${16.5 / view.zoom}px monospace`;
                        const textW = ctx.measureText(badgeLabel).width;
                        const padX = 11 / view.zoom;
                        const boxW = textW + padX * 2;
                        const boxH = 29 / view.zoom;

                        ctx.fillStyle = isTypingParallelOverride ? 'rgba(6, 78, 59, 0.96)' : 'rgba(15, 23, 42, 0.95)';
                        ctx.strokeStyle = isTypingParallelOverride ? '#34d399' : '#f59e0b';
                        ctx.lineWidth = (isTypingParallelOverride ? 2.5 : 2.2) / view.zoom;
                        ctx.beginPath();
                        ctx.roundRect(labelX - boxW / 2, labelY - boxH / 2, boxW, boxH, 7 / view.zoom);
                        ctx.fill();
                        ctx.stroke();

                        ctx.fillStyle = isTypingParallelOverride ? '#a7f3d0' : '#fde047';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(badgeLabel, labelX, labelY);

                        // --- LINEA DI RIFERIMENTO AUTOMATICA UGUALE ALL'ULTIMO OFFSET PER FACILITARE OFFSET SUCCESSIVI ---
                        // (Compare se attivo Offset oppure se si usa Sposta o Copia)
                        const refD = isMoveCopyOrOffsetAidActive() ? getEffectiveLastParallelOffset(entities) : 0;
                        if (refD > 0.05) {
                            // Il lato su cui si trova la linea trascinata rispetto a oLine:
                            // bestSignedDist = (oLine - line) · n, quindi da oLine verso line il segno lungo n è -Math.sign(bestSignedDist)
                            const sideFromRef = bestSignedDist >= 0 ? -1 : 1;
                            const guideShiftX = nx * sideFromRef * refD;
                            const guideShiftY = ny * sideFromRef * refD;

                            // Costruiamo la linea di riferimento uguale all'ultima linea di riferimento (oLine) traslata di refD
                            const gStart = { x: oLine.start.x + guideShiftX, y: oLine.start.y + guideShiftY };
                            const gEnd = { x: oLine.end.x + guideShiftX, y: oLine.end.y + guideShiftY };
                            const isSnappedToEqualOffset = Math.abs(minParallelDist - refD) < 0.05;

                            ctx.save();
                            ctx.strokeStyle = isSnappedToEqualOffset ? '#10b981' : 'rgba(16, 185, 129, 0.85)';
                            ctx.lineWidth = (isSnappedToEqualOffset ? 2.6 : 1.8) / view.zoom;
                            ctx.setLineDash([8 / view.zoom, 5 / view.zoom]);
                            ctx.beginPath();
                            ctx.moveTo(gStart.x, gStart.y);
                            ctx.lineTo(gEnd.x, gEnd.y);
                            ctx.stroke();

                            // Estremi della linea di riferimento
                            ctx.setLineDash([]);
                            ctx.fillStyle = '#10b981';
                            ctx.beginPath();
                            ctx.arc(gStart.x, gStart.y, 3.2 / view.zoom, 0, Math.PI * 2);
                            ctx.arc(gEnd.x, gEnd.y, 3.2 / view.zoom, 0, Math.PI * 2);
                            ctx.fill();

                            // Etichetta sulla linea di riferimento dell'offset precedente
                            const gMidX = (gStart.x + gEnd.x) / 2;
                            const gMidY = (gStart.y + gEnd.y) / 2;
                            const refFormatted = zoomDecimals === 0
                                ? `${Math.round(refD)}`
                                : refD.toFixed(zoomDecimals).replace('.', ',');
                            const refTag = isSnappedToEqualOffset
                                ? `= ${refFormatted} cm (Offset uguale)`
                                : `Rif. ${refFormatted} cm`;
                            ctx.font = `bold ${12.5 / view.zoom}px monospace`;
                            const rW = ctx.measureText(refTag).width + 14 / view.zoom;
                            const rH = 21 / view.zoom;
                            const tagOffsetX = tx * (len * 0.22);
                            const tagOffsetY = ty * (len * 0.22);
                            const tagX = gMidX + tagOffsetX;
                            const tagY = gMidY + tagOffsetY;

                            ctx.fillStyle = isSnappedToEqualOffset ? 'rgba(6, 78, 59, 0.96)' : 'rgba(15, 23, 42, 0.90)';
                            ctx.strokeStyle = '#10b981';
                            ctx.lineWidth = 1.6 / view.zoom;
                            ctx.beginPath();
                            ctx.roundRect(tagX - rW / 2, tagY - rH / 2, rW, rH, 5 / view.zoom);
                            ctx.fill();
                            ctx.stroke();

                            ctx.fillStyle = '#6ee7b7';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(refTag, tagX, tagY);
                            ctx.restore();
                        }

                        ctx.restore();
                    }
                } else if (shouldShowSegmentLength) {
                    const isTypingLineLengthOverride =
                        liveNumericOverride?.kind === 'line_length' &&
                        liveNumericOverride.lineId === line.id &&
                        (Date.now() - liveNumericOverride.timestamp < 6000);

                    const segDecimals = view.zoom >= 1.2 ? 3 : (view.zoom >= 0.45 ? 2 : (view.zoom >= 0.20 ? 1 : 0));
                    const formattedSegLen = segDecimals === 0
                        ? `${Math.round(len)}`
                        : len.toFixed(segDecimals).replace('.', ',');
                    const segLabel = isTypingLineLengthOverride
                        ? `L = ${liveNumericOverride.text.replace('.', ',')}▌ cm`
                        : `L = ${formattedSegLen} cm`;

                    const segMidX = (line.start.x + line.end.x) / 2;
                    const segMidY = (line.start.y + line.end.y) / 2;
                    const segBadgeX = segMidX + nx * (22 / view.zoom);
                    const segBadgeY = segMidY + ny * (22 / view.zoom);

                    ctx.save();
                    ctx.font = `bold ${16.5 / view.zoom}px monospace`;
                    const sTextW = ctx.measureText(segLabel).width;
                    const sPadX = 11 / view.zoom;
                    const sBoxW = sTextW + sPadX * 2;
                    const sBoxH = 29 / view.zoom;

                    ctx.fillStyle = isTypingLineLengthOverride ? 'rgba(6, 78, 59, 0.96)' : 'rgba(15, 23, 42, 0.94)';
                    ctx.strokeStyle = isTypingLineLengthOverride ? '#34d399' : '#38bdf8';
                    ctx.lineWidth = (isTypingLineLengthOverride ? 2.5 : 2.0) / view.zoom;
                    ctx.beginPath();
                    ctx.roundRect(segBadgeX - sBoxW / 2, segBadgeY - sBoxH / 2, sBoxW, sBoxH, 7 / view.zoom);
                    ctx.fill();
                    ctx.stroke();

                    ctx.fillStyle = isTypingLineLengthOverride ? '#a7f3d0' : '#f8fafc';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(segLabel, segBadgeX, segBadgeY);
                    ctx.restore();
                }
            }
        }
        
        let isHighlighted = false;
        let highlightColor = ctx.strokeStyle;
        if (isFlashing) {
             isHighlighted = true;
        } else if ((entity.id === selectedParallelLine?.id && blink) || (selectedEntityId === entity.id) || isReallySelected || (positioningGroupId && entity.groupId === positioningGroupId) || (positioningEntityId && entity.id === positioningEntityId) || selectedRaccordoLineIds.includes(entity.id)) {
             isHighlighted = true;
        } else if (activeTool === 'Dimension' && selectionMode === 'object' && entity.id === hoveredDimensionEntityId) {
             isHighlighted = true;
             highlightColor = '#22c55e';
        } else if ((dragEntityIds.includes(entity.id) || entity.id === highlightedTrimLine?.id) && (activeTool === 'Move' || activeTool === 'Cancella' || activeTool === 'Join' || activeTool === 'Copy')) {
             isHighlighted = true;
        } else if (copySourceEntityIds.includes(entity.id) && activeTool === 'Copy') {
             isHighlighted = true;
        } else if (moveSourceEntityIds.includes(entity.id) && activeTool === 'Move') {
             isHighlighted = true;
        }

        const lineType = (entity as any).lineType;
        if (lineType) {
          if (lineType === 'dashed') {
            ctx.setLineDash([8 / view.zoom, 4 / view.zoom]);
          } else if (lineType === 'dotted') {
            ctx.setLineDash([2 / view.zoom, 3 / view.zoom]);
          } else if (lineType === 'dashdot') {
            ctx.setLineDash([12 / view.zoom, 4 / view.zoom, 2 / view.zoom, 4 / view.zoom]);
          } else if (lineType === 'dashdash') {
            ctx.setLineDash([15 / view.zoom, 4 / view.zoom, 4 / view.zoom, 4 / view.zoom]);
          } else {
            ctx.setLineDash([]);
          }
        } else if (entity.dashed) {
          ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        if (entity.type === 'line') {
          const l = entity as LineEntity;
          if (l.isBIM && l.bimType === 'wall') {
              const thickness = l.bimWidth || 15;
              const dx = l.end.x - l.start.x;
              const dy = l.end.y - l.start.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              if (len > 0.1) {
                  const nx = -dy / len;
                  const ny = dx / len;
                  const N = { x: nx, y: ny };
                  const V = { x: dx / len, y: dy / len };

                  let hasStartConn = false;
                  let startPlus = { x: l.start.x + nx * thickness / 2, y: l.start.y + ny * thickness / 2 };
                  let startMinus = { x: l.start.x - nx * thickness / 2, y: l.start.y - ny * thickness / 2 };
                  const startConns = bimWalls.filter(e => {
                      if (e.id === l.id) return false;
                      // Proximity check: other wall must be near l.start
                      const minXO = Math.min(e.start.x, e.end.x) - 15;
                      const maxXO = Math.max(e.start.x, e.end.x) + 15;
                      const minYO = Math.min(e.start.y, e.end.y) - 15;
                      const maxYO = Math.max(e.start.y, e.end.y) + 15;
                      return l.start.x >= minXO && l.start.x <= maxXO && l.start.y >= minYO && l.start.y <= maxYO;
                  });
                  let bestStartConn: LineEntity | null = null;
                  let isStartCorner = false;
                  let bestStartDist = 15.0; // wider tolerance for snaps (15 cm)

                  for (const other of startConns) {
                      const dStart = Math.sqrt((other.start.x - l.start.x) ** 2 + (other.start.y - l.start.y) ** 2);
                      const dEnd = Math.sqrt((other.end.x - l.start.x) ** 2 + (other.end.y - l.start.y) ** 2);
                      
                      // Check corner connection
                      if (dStart < bestStartDist) {
                          bestStartConn = other;
                          bestStartDist = dStart;
                          isStartCorner = true;
                      }
                      if (dEnd < bestStartDist) {
                          bestStartConn = other;
                          bestStartDist = dEnd;
                          isStartCorner = true;
                      }
                      
                      // Check T-junction connection (distance to centerline segment)
                      const dSeg = distToSegment(l.start, other.start, other.end);
                      if (dSeg < bestStartDist) {
                          bestStartConn = other;
                          bestStartDist = dSeg;
                          isStartCorner = false;
                      }
                  }

                  if (bestStartConn) {
                      if (isStartCorner) {
                          const V1 = { x: -V.x, y: -V.y };
                          const N1 = { x: -V1.y, y: V1.x }; // -N
                          
                          const isOtherStart = Math.sqrt((bestStartConn.start.x - l.start.x) ** 2 + (bestStartConn.start.y - l.start.y) ** 2) < 15.0;
                          const oStart = bestStartConn.start;
                          const oEnd = bestStartConn.end;
                          const oDx = oEnd.x - oStart.x;
                          const oDy = oEnd.y - oStart.y;
                          const oLen = Math.sqrt(oDx * oDx + oDy * oDy);
                          
                          if (oLen > 0.1) {
                              const oV = { x: oDx / oLen, y: oDy / oLen };
                              const V2 = isOtherStart ? oV : { x: -oV.x, y: -oV.y };
                              const N2 = { x: -V2.y, y: V2.x };
                              
                              const t2 = bestStartConn.bimWidth || 15;
                              
                              const p1_plus = { x: l.start.x + N1.x * thickness / 2, y: l.start.y + N1.y * thickness / 2 };
                              const p2_plus = { x: l.start.x + N2.x * t2 / 2, y: l.start.y + N2.y * t2 / 2 };
                              
                              const p1_minus = { x: l.start.x - N1.x * thickness / 2, y: l.start.y - N1.y * thickness / 2 };
                              const p2_minus = { x: l.start.x - N2.x * t2 / 2, y: l.start.y - N2.y * t2 / 2 };
                              
                              const cross = Math.abs(V1.x * V2.y - V1.y * V2.x);
                              if (cross > 0.1) {
                                  const pt_plus = intersectLines(p1_plus, V1, p2_plus, V2);
                                  const pt_minus = intersectLines(p1_minus, V1, p2_minus, V2);
                                  
                                  if (pt_plus && pt_minus) {
                                      startMinus = pt_plus;
                                      startPlus = pt_minus;
                                      hasStartConn = true;
                                  }
                              }
                          }
                      } else {
                          // T-junction at l.start
                          const oStart = bestStartConn.start;
                          const oEnd = bestStartConn.end;
                          const oDx = oEnd.x - oStart.x;
                          const oDy = oEnd.y - oStart.y;
                          const oLen = Math.sqrt(oDx * oDx + oDy * oDy);
                          if (oLen > 0.1) {
                              const oV = { x: oDx / oLen, y: oDy / oLen };
                              const oN = { x: -oV.y, y: oV.x };
                              const t2 = bestStartConn.bimWidth || 15;

                              const other_A_point = { x: oStart.x + oN.x * t2 / 2, y: oStart.y + oN.y * t2 / 2 };
                              const other_B_point = { x: oStart.x - oN.x * t2 / 2, y: oStart.y - oN.y * t2 / 2 };

                              const lp_p = { x: l.start.x + nx * thickness / 2, y: l.start.y + ny * thickness / 2 };
                              const lp_m = { x: l.start.x - nx * thickness / 2, y: l.start.y - ny * thickness / 2 };

                              const cross = Math.abs(V.x * oV.y - V.y * oV.x);
                              if (cross > 0.1) {
                                  const ipt_lp_p_A = intersectLines(lp_p, V, other_A_point, oV);
                                  const ipt_lp_p_B = intersectLines(lp_p, V, other_B_point, oV);
                                  if (ipt_lp_p_A && ipt_lp_p_B) {
                                      const d_A = (ipt_lp_p_A.x - lp_p.x) ** 2 + (ipt_lp_p_A.y - lp_p.y) ** 2;
                                      const d_B = (ipt_lp_p_B.x - lp_p.x) ** 2 + (ipt_lp_p_B.y - lp_p.y) ** 2;
                                      startPlus = d_A < d_B ? ipt_lp_p_A : ipt_lp_p_B;
                                  }

                                  const ipt_lp_m_A = intersectLines(lp_m, V, other_A_point, oV);
                                  const ipt_lp_m_B = intersectLines(lp_m, V, other_B_point, oV);
                                  if (ipt_lp_m_A && ipt_lp_m_B) {
                                      const d_A = (ipt_lp_m_A.x - lp_m.x) ** 2 + (ipt_lp_m_A.y - lp_m.y) ** 2;
                                      const d_B = (ipt_lp_m_B.x - lp_m.x) ** 2 + (ipt_lp_m_B.y - lp_m.y) ** 2;
                                      startMinus = d_A < d_B ? ipt_lp_m_A : ipt_lp_m_B;
                                  }
                                  hasStartConn = true;
                              }
                          }
                      }
                  }

                  let hasEndConn = false;
                  let endPlus = { x: l.end.x + nx * thickness / 2, y: l.end.y + ny * thickness / 2 };
                  let endMinus = { x: l.end.x - nx * thickness / 2, y: l.end.y - ny * thickness / 2 };

                  const endConns = bimWalls.filter(e => {
                      if (e.id === l.id) return false;
                      // Proximity check: other wall must be near l.end
                      const minXO = Math.min(e.start.x, e.end.x) - 15;
                      const maxXO = Math.max(e.start.x, e.end.x) + 15;
                      const minYO = Math.min(e.start.y, e.end.y) - 15;
                      const maxYO = Math.max(e.start.y, e.end.y) + 15;
                      return l.end.x >= minXO && l.end.x <= maxXO && l.end.y >= minYO && l.end.y <= maxYO;
                  });
                  let bestEndConn: LineEntity | null = null;
                  let isEndCorner = false;
                  let bestEndDist = 15.0; // wider tolerance for snaps (15 cm)

                  for (const other of endConns) {
                      const dStart = Math.sqrt((other.start.x - l.end.x) ** 2 + (other.start.y - l.end.y) ** 2);
                      const dEnd = Math.sqrt((other.end.x - l.end.x) ** 2 + (other.end.y - l.end.y) ** 2);
                      
                      if (dStart < bestEndDist) {
                          bestEndConn = other;
                          bestEndDist = dStart;
                          isEndCorner = true;
                      }
                      if (dEnd < bestEndDist) {
                          bestEndConn = other;
                          bestEndDist = dEnd;
                          isEndCorner = true;
                      }
                      
                      const dSeg = distToSegment(l.end, other.start, other.end);
                      if (dSeg < bestEndDist) {
                          bestEndConn = other;
                          bestEndDist = dSeg;
                          isEndCorner = false;
                      }
                  }

                  if (bestEndConn) {
                      if (isEndCorner) {
                          const V1 = V;
                          const N1 = N;
                          
                          const isOtherStart = Math.sqrt((bestEndConn.start.x - l.end.x) ** 2 + (bestEndConn.start.y - l.end.y) ** 2) < 15.0;
                          const oStart = bestEndConn.start;
                          const oEnd = bestEndConn.end;
                          const oDx = oEnd.x - oStart.x;
                          const oDy = oEnd.y - oStart.y;
                          const oLen = Math.sqrt(oDx * oDx + oDy * oDy);
                          
                          if (oLen > 0.1) {
                              const oV = { x: oDx / oLen, y: oDy / oLen };
                              const V2 = isOtherStart ? oV : { x: -oV.x, y: -oV.y };
                              const N2 = { x: -V2.y, y: V2.x };
                              
                              const t2 = bestEndConn.bimWidth || 15;
                              
                              const p1_plus = { x: l.end.x + N1.x * thickness / 2, y: l.end.y + N1.y * thickness / 2 };
                              const p2_plus = { x: l.end.x + N2.x * t2 / 2, y: l.end.y + N2.y * t2 / 2 };
                              
                              const p1_minus = { x: l.end.x - N1.x * thickness / 2, y: l.end.y - N1.y * thickness / 2 };
                              const p2_minus = { x: l.end.x - N2.x * t2 / 2, y: l.end.y - N2.y * t2 / 2 };
                              
                              const cross = Math.abs(V1.x * V2.y - V1.y * V2.x);
                              if (cross > 0.1) {
                                  const pt_plus = intersectLines(p1_plus, V1, p2_plus, V2);
                                  const pt_minus = intersectLines(p1_minus, V1, p2_minus, V2);
                                  
                                  if (pt_plus && pt_minus) {
                                      endPlus = pt_plus;
                                      endMinus = pt_minus;
                                      hasEndConn = true;
                                  }
                              }
                          }
                      } else {
                          // T-junction at l.end
                          const oStart = bestEndConn.start;
                          const oEnd = bestEndConn.end;
                          const oDx = oEnd.x - oStart.x;
                          const oDy = oEnd.y - oStart.y;
                          const oLen = Math.sqrt(oDx * oDx + oDy * oDy);
                          if (oLen > 0.1) {
                              const oV = { x: oDx / oLen, y: oDy / oLen };
                              const oN = { x: -oV.y, y: oV.x };
                              const t2 = bestEndConn.bimWidth || 15;

                              const other_A_point = { x: oStart.x + oN.x * t2 / 2, y: oStart.y + oN.y * t2 / 2 };
                              const other_B_point = { x: oStart.x - oN.x * t2 / 2, y: oStart.y - oN.y * t2 / 2 };

                              const lp_p = { x: l.end.x + nx * thickness / 2, y: l.end.y + ny * thickness / 2 };
                              const lp_m = { x: l.end.x - nx * thickness / 2, y: l.end.y - ny * thickness / 2 };

                              const cross = Math.abs(V.x * oV.y - V.y * oV.x);
                              if (cross > 0.1) {
                                  const ipt_lp_p_A = intersectLines(lp_p, V, other_A_point, oV);
                                  const ipt_lp_p_B = intersectLines(lp_p, V, other_B_point, oV);
                                  if (ipt_lp_p_A && ipt_lp_p_B) {
                                      const d_A = (ipt_lp_p_A.x - lp_p.x) ** 2 + (ipt_lp_p_A.y - lp_p.y) ** 2;
                                      const d_B = (ipt_lp_p_B.x - lp_p.x) ** 2 + (ipt_lp_p_B.y - lp_p.y) ** 2;
                                      endPlus = d_A < d_B ? ipt_lp_p_A : ipt_lp_p_B;
                                  }

                                  const ipt_lp_m_A = intersectLines(lp_m, V, other_A_point, oV);
                                  const ipt_lp_m_B = intersectLines(lp_m, V, other_B_point, oV);
                                  if (ipt_lp_m_A && ipt_lp_m_B) {
                                      const d_A = (ipt_lp_m_A.x - lp_m.x) ** 2 + (ipt_lp_m_A.y - lp_m.y) ** 2;
                                      const d_B = (ipt_lp_m_B.x - lp_m.x) ** 2 + (ipt_lp_m_B.y - lp_m.y) ** 2;
                                      endMinus = d_A < d_B ? ipt_lp_m_A : ipt_lp_m_B;
                                  }
                                  hasEndConn = true;
                              }
                          }
                      }
                  }
                  
                  // 1. Solid fill for wall 2D thickness
                  ctx.fillStyle = 'rgba(75, 85, 99, 0.12)';
                  ctx.beginPath();
                  ctx.moveTo(startPlus.x, startPlus.y);
                  ctx.lineTo(endPlus.x, endPlus.y);
                  ctx.lineTo(endMinus.x, endMinus.y);
                  ctx.lineTo(startMinus.x, startMinus.y);
                  ctx.closePath();
                  ctx.fill();

                  // 2. Wall border lines
                  ctx.strokeStyle = isHighlighted ? highlightColor : '#374151';
                  ctx.lineWidth = isHighlighted ? (3.0 / view.zoom) : (1.5 / view.zoom);
                  ctx.beginPath();
                  // Side 1
                  ctx.moveTo(startPlus.x, startPlus.y);
                  ctx.lineTo(endPlus.x, endPlus.y);
                  // Side 2
                  ctx.moveTo(startMinus.x, startMinus.y);
                  ctx.lineTo(endMinus.x, endMinus.y);
                  
                  // End caps - only draw if not connected!
                  if (!hasStartConn) {
                      ctx.moveTo(startPlus.x, startPlus.y);
                      ctx.lineTo(startMinus.x, startMinus.y);
                  }
                  if (!hasEndConn) {
                      ctx.moveTo(endPlus.x, endPlus.y);
                      ctx.lineTo(endMinus.x, endMinus.y);
                  }
                  ctx.stroke();

                  // 3. Center line
                  ctx.strokeStyle = isHighlighted ? highlightColor : 'rgba(75, 85, 99, 0.4)';
                  ctx.lineWidth = 1.0 / view.zoom;
                  ctx.setLineDash([4 / view.zoom, 4 / view.zoom]);
                  ctx.beginPath();
                  ctx.moveTo(l.start.x, l.start.y);
                  ctx.lineTo(l.end.x, l.end.y);
                  ctx.stroke();
                  ctx.setLineDash([]);
              } else {
                  ctx.moveTo(l.start.x, l.start.y);
                  ctx.lineTo(l.end.x, l.end.y);
                  ctx.stroke();
              }
          } else if ((l.mode === 'ink' || l.mode === 'pencil') && l.isFreehand && l.inkPoints && l.inkPoints.length > 2) {
              // Genuine freehand curves with multiple captured points
              const entityLineType = (l as any).lineType;
              const isStyled = entityLineType && entityLineType !== 'continuous';
              if (isStyled) {
                  ctx.save();
                  applyCustomLineDash(entityLineType, l.dashed);
                  ctx.lineWidth = l.mode === 'ink'
                      ? getEffectiveCADRenderWidth(l.lineWidth, l.mode, view.zoom)
                      : Math.max(0.1, l.lineWidth / view.zoom);
                  ctx.strokeStyle = isHighlighted ? highlightColor : l.color || '#000000';
                  ctx.beginPath();
                  ctx.moveTo(l.start.x, l.start.y);
                  for (let i = 0; i < l.inkPoints.length; i++) {
                      ctx.lineTo(l.inkPoints[i].x, l.inkPoints[i].y);
                  }
                  ctx.stroke();
                  ctx.restore();
              } else {
                  let lastX = l.start.x;
                  let lastY = l.start.y;
                  for (let i = 0; i < l.inkPoints.length; i++) {
                      const pt = l.inkPoints[i];
                      drawTraditionalOrCADLine(
                        { x: lastX, y: lastY },
                        { x: pt.x, y: pt.y },
                        l.mode,
                        l.color,
                        l.lineWidth,
                        undefined,
                        false,
                        isHighlighted,
                        highlightColor,
                        ctx.lineWidth
                      );
                      lastX = pt.x;
                      lastY = pt.y;
                  }
              }
          } else {
              const isFiloEntity = (l as any).isFilo || l.layer === 'Fili';
              drawTraditionalOrCADLine(
                l.start,
                l.end,
                isFiloEntity ? 'CAD' : l.mode,
                finalColor || l.color,
                l.lineWidth,
                lineType,
                l.dashed,
                isHighlighted,
                highlightColor,
                ctx.lineWidth,
                false
              );
              // Render permanent ricalco (second pass of ink or graphite when the user backtracked or passed twice over the segment)
              if (!isFiloEntity && (l.mode === 'ink' || l.mode === 'pencil') && (l as any).retraceStart && (l as any).retraceEnd) {
                drawTraditionalOrCADLine(
                  (l as any).retraceStart,
                  (l as any).retraceEnd,
                  l.mode,
                  finalColor || l.color,
                  l.lineWidth || 0.25,
                  lineType,
                  l.dashed,
                  false,
                  highlightColor,
                  ctx.lineWidth,
                  true
                );
              }
              if (isFiloEntity) {
                  ctx.save();
                  // Let's compute direction and perpendicular vectors
                  const dx = l.end.x - l.start.x;
                  const dy = l.end.y - l.start.y;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  if (len > 0.5) {
                      const vx = dx / len;
                      const vy = dy / len;
                      const px = -vy;
                      const py = vx;

                      // Draw at start point
                      // 1. Wood Batter Board (traversa) - perpendicular to line
                      ctx.strokeStyle = '#854d0e'; // Dark wood brown
                      ctx.lineWidth = 3 / view.zoom;
                      ctx.beginPath();
                      ctx.moveTo(l.start.x - px * 12 / view.zoom, l.start.y - py * 12 / view.zoom);
                      ctx.lineTo(l.start.x + px * 12 / view.zoom, l.start.y + py * 12 / view.zoom);
                      ctx.stroke();

                      // 2. Vertical stakes supporting the batter board, going backward
                      ctx.strokeStyle = '#a16207'; // lighter brown
                      ctx.lineWidth = 2.5 / view.zoom;
                      ctx.beginPath();
                      // Left stake
                      const stake1X = l.start.x - px * 8 / view.zoom;
                      const stake1Y = l.start.y - py * 8 / view.zoom;
                      ctx.moveTo(stake1X, stake1Y);
                      ctx.lineTo(stake1X - vx * 12 / view.zoom, stake1Y - vy * 12 / view.zoom);
                      // Right stake
                      const stake2X = l.start.x + px * 8 / view.zoom;
                      const stake2Y = l.start.y + py * 8 / view.zoom;
                      ctx.moveTo(stake2X, stake2Y);
                      ctx.lineTo(stake2X - vx * 12 / view.zoom, stake2Y - vy * 12 / view.zoom);
                      ctx.stroke();

                      // 3. Central iron tie-nail with high-vis orange/red paint
                      ctx.fillStyle = l.color || '#ff5500';
                      ctx.beginPath();
                      ctx.arc(l.start.x, l.start.y, 3 / view.zoom, 0, Math.PI * 2);
                      ctx.fill();
                      ctx.fillStyle = '#ffffff';
                      ctx.beginPath();
                      ctx.arc(l.start.x, l.start.y, 1 / view.zoom, 0, Math.PI * 2);
                      ctx.fill();

                      // Draw at end point
                      // 1. Wood Batter Board (traversa)
                      ctx.strokeStyle = '#854d0e';
                      ctx.lineWidth = 3 / view.zoom;
                      ctx.beginPath();
                      ctx.moveTo(l.end.x - px * 12 / view.zoom, l.end.y - py * 12 / view.zoom);
                      ctx.lineTo(l.end.x + px * 12 / view.zoom, l.end.y + py * 12 / view.zoom);
                      ctx.stroke();

                      // 2. Vertical stakes going forward (away from the line)
                      ctx.strokeStyle = '#a16207';
                      ctx.lineWidth = 2.5 / view.zoom;
                      ctx.beginPath();
                      // Left stake
                      const estake1X = l.end.x - px * 8 / view.zoom;
                      const estake1Y = l.end.y - py * 8 / view.zoom;
                      ctx.moveTo(estake1X, estake1Y);
                      ctx.lineTo(estake1X + vx * 12 / view.zoom, estake1Y + vy * 12 / view.zoom);
                      // Right stake
                      const estake2X = l.end.x + px * 8 / view.zoom;
                      const estake2Y = l.end.y + py * 8 / view.zoom;
                      ctx.moveTo(estake2X, estake2Y);
                      ctx.lineTo(estake2X + vx * 12 / view.zoom, estake2Y + vy * 12 / view.zoom);
                      ctx.stroke();

                      // 3. Central iron tie-nail
                      ctx.fillStyle = l.color || '#ff5500';
                      ctx.beginPath();
                      ctx.arc(l.end.x, l.end.y, 3 / view.zoom, 0, Math.PI * 2);
                      ctx.fill();
                      ctx.fillStyle = '#ffffff';
                      ctx.beginPath();
                      ctx.arc(l.end.x, l.end.y, 1 / view.zoom, 0, Math.PI * 2);
                      ctx.fill();
                  } else {
                      // Fallback high-vis pins if very short
                      ctx.fillStyle = l.color || '#ff5500';
                      ctx.beginPath();
                      ctx.arc(l.start.x, l.start.y, 4 / view.zoom, 0, Math.PI * 2);
                      ctx.arc(l.end.x, l.end.y, 4 / view.zoom, 0, Math.PI * 2);
                      ctx.fill();
                  }

                  // Progressive numbering bubble/dot in screen-space for pixel-perfect clarity at any zoom level
                  const allFili = entities.filter(ent => ent.type === 'line' && ((ent as any).isFilo || ent.layer === 'Fili'));
                  const filoIndex = allFili.findIndex(ent => ent.id === l.id);
                  const filoNum = filoIndex !== -1 ? filoIndex + 1 : 1;
                  const labelText = `F${filoNum}`;

                  // Temporarily switch to screen space coordinates for text and bubbles to bypass browser font sizing limitations
                  ctx.save();
                  ctx.setTransform(1, 0, 0, 1, 0, 0);

                  const startScreenX = l.start.x * view.zoom + view.pan.x;
                  const startScreenY = l.start.y * view.zoom + view.pan.y;
                  const endScreenX = l.end.x * view.zoom + view.pan.x;
                  const endScreenY = l.end.y * view.zoom + view.pan.y;

                  const radius = 10; // crisp 10px radius on screen

                  // Enable subtle elegant drop shadow for the bubble to float above grid/lines
                  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                  ctx.shadowBlur = 4;
                  ctx.shadowOffsetX = 0;
                  ctx.shadowOffsetY = 1.5;

                  // Draw start bubble
                  ctx.beginPath();
                  ctx.arc(startScreenX, startScreenY, radius, 0, Math.PI * 2);
                  ctx.fillStyle = l.color || '#ff5500';
                  ctx.fill();
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = 1.5;
                  ctx.stroke();

                  // Draw end bubble
                  ctx.beginPath();
                  ctx.arc(endScreenX, endScreenY, radius, 0, Math.PI * 2);
                  ctx.fillStyle = l.color || '#ff5500';
                  ctx.fill();
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = 1.5;
                  ctx.stroke();

                  // Reset shadows for text rendering
                  ctx.shadowColor = 'transparent';
                  ctx.shadowBlur = 0;
                  ctx.shadowOffsetX = 0;
                  ctx.shadowOffsetY = 0;

                  // Set up typography
                  ctx.fillStyle = '#ffffff';
                  ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';

                  // Start text
                  ctx.fillText(labelText, startScreenX, startScreenY);

                  // End text
                  ctx.fillText(labelText, endScreenX, endScreenY);

                  ctx.restore(); // restores the identity transform to continue in scaled world space
                  ctx.restore(); // restores the main render transform save
              }
          }
        } else if (entity.type === 'dimension') {
            const { p1, p2, styleToUse } = getDimensionLinePoints(entity);
            const origDx = entity.end.x - entity.start.x;
            const origDy = entity.end.y - entity.start.y;
            
            let dx = origDx;
            let dy = origDy;
            let L = Math.sqrt(dx * dx + dy * dy);
            let nx = -dy / L;
            let ny = dx / L;

            if (styleToUse === 3) {
                dx = origDx;
                dy = 0;
                L = Math.abs(dx);
                nx = 0;
                ny = entity.offset >= 0 ? 1 : -1;
            } else if (styleToUse === 4) {
                dx = 0;
                dy = origDy;
                L = Math.abs(dy);
                nx = entity.offset >= 0 ? 1 : -1;
                ny = 0;
            }
            if (L <= 0.001) L = 0.001;
                  // Define a uniform scale factor independent of length
            const scaleFactor = entity.scale || dimensionScale || 1.0;

            // Thinner line for dimensions
            const dimLineWidth = (0.25 / view.zoom) * (Math.max(1, scaleFactor * 0.5));
            const extLineWidth = (0.125 / view.zoom) * (Math.max(1, scaleFactor * 0.5));
            
            // Dimension line
            ctx.lineWidth = dimLineWidth;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // Extension lines (reference lines) from the dimension line (with a small overshoot of legAhead)
            // going down to a constant gap from the original points.
            const legAhead = 4 * scaleFactor;
            const gap = 12 * scaleFactor;
            const absOffset = Math.abs(entity.offset);
            const offsetSign = entity.offset >= 0 ? 1 : -1;
            
            ctx.lineWidth = extLineWidth;
            ctx.beginPath();
            if (absOffset > gap) {
                const maxExtLength = 15 * scaleFactor;
                const extLength = Math.min(absOffset - gap, maxExtLength);

                if (styleToUse === 3) {
                    // Vertical constraint
                    // Cap the extension line to a maximum short length from the dimension line back towards the point
                    ctx.moveTo(p1.x, p1.y + legAhead * offsetSign);
                    ctx.lineTo(p1.x, p1.y - offsetSign * extLength);
                    ctx.moveTo(p2.x, p2.y + legAhead * offsetSign);
                    ctx.lineTo(p2.x, p2.y - offsetSign * extLength);
                } else if (styleToUse === 4) {
                    // Horizontal constraint
                    // Cap the extension line to a maximum short length from the dimension line back towards the point
                    ctx.moveTo(p1.x + legAhead * offsetSign, p1.y);
                    ctx.lineTo(p1.x - offsetSign * extLength, p1.y);
                    ctx.moveTo(p2.x + legAhead * offsetSign, p2.y);
                    ctx.lineTo(p2.x - offsetSign * extLength, p2.y);
                } else {
                    // Aligned/Linear/Auto-Ortho
                    // Cap the extension line to a maximum short length from the dimension line back towards the point
                    ctx.moveTo(p1.x + nx * legAhead * offsetSign, p1.y + ny * legAhead * offsetSign);
                    ctx.lineTo(p1.x - nx * extLength * offsetSign, p1.y - ny * extLength * offsetSign);
                    ctx.moveTo(p2.x + nx * legAhead * offsetSign, p2.y + ny * legAhead * offsetSign);
                    ctx.lineTo(p2.x - nx * extLength * offsetSign, p2.y - ny * extLength * offsetSign);
                }
            } else {
                // If offset is smaller than gap, just draw standard short ticks
                if (styleToUse === 3) {
                    ctx.moveTo(p1.x, p1.y + legAhead * offsetSign);
                    ctx.lineTo(p1.x, p1.y - legAhead * 2 * offsetSign);
                    ctx.moveTo(p2.x, p2.y + legAhead * offsetSign);
                    ctx.lineTo(p2.x, p2.y - legAhead * 2 * offsetSign);
                } else if (styleToUse === 4) {
                    ctx.moveTo(p1.x + legAhead * offsetSign, p1.y);
                    ctx.lineTo(p1.x - legAhead * 2 * offsetSign, p1.y);
                    ctx.moveTo(p2.x + legAhead * offsetSign, p2.y);
                    ctx.lineTo(p2.x - legAhead * 2 * offsetSign, p2.y);
                } else {
                    ctx.moveTo(p1.x + nx * legAhead * offsetSign, p1.y + ny * legAhead * offsetSign);
                    ctx.lineTo(p1.x - nx * legAhead * 2 * offsetSign, p1.y - ny * legAhead * 2 * offsetSign);
                    ctx.moveTo(p2.x + nx * legAhead * offsetSign, p2.y + ny * legAhead * offsetSign);
                    ctx.lineTo(p2.x - nx * legAhead * 2 * offsetSign, p2.y - ny * legAhead * 2 * offsetSign);
                }
            }
            ctx.stroke();

            // Inclined intersection slashes proportional to length
            const slashSize = 5 * scaleFactor;
            const snx = styleToUse === 3 ? 0 : (styleToUse === 4 ? 1 : nx);
            const sny = styleToUse === 3 ? 1 : (styleToUse === 4 ? 0 : ny);
            
            ctx.beginPath();
            // Slash at p1
            ctx.moveTo(p1.x - snx * slashSize - sny * slashSize, p1.y - sny * slashSize + snx * slashSize);
            ctx.lineTo(p1.x + snx * slashSize + sny * slashSize, p1.y + sny * slashSize - snx * slashSize);
            // Slash at p2
            ctx.moveTo(p2.x - snx * slashSize - sny * slashSize, p2.y - sny * slashSize + snx * slashSize);
            ctx.lineTo(p2.x + snx * slashSize + sny * slashSize, p2.y + sny * slashSize - snx * slashSize);
            ctx.stroke();

            // Text
            ctx.save();
            ctx.fillStyle = 'black'; // Text should be black too
            const fontSize = Math.max(2, 12 * scaleFactor);
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            
            ctx.translate(midX, midY);
            
            let angle = Math.atan2(dy, dx);
            // Flip text to keep it upright (Standard CAD: readable from bottom or right)
            if (angle >= Math.PI / 2 - 0.01) {
                angle -= Math.PI;
            } else if (angle < -Math.PI / 2 - 0.01) {
                angle += Math.PI;
            }
            ctx.rotate(angle);
            ctx.translate(0, -3 * scaleFactor); // Offset slightly above the dimension line proportional to length
            
            const decimalsToUse = entity.decimals !== undefined ? entity.decimals : dimensionDecimals;
            const factor = Math.pow(10, decimalsToUse);
            const numValue = Math.round(L * factor) / factor;
            const valueStr = numValue.toFixed(decimalsToUse).replace('.', ',');
            ctx.fillText(entity.customText || valueStr, 0, 0);
            ctx.restore();
        } else if (entity.type === 'circle') {
          drawTraditionalOrCADCircleOrArc(
            entity.center,
            entity.radius,
            0,
            Math.PI * 2,
            entity.mode,
            finalColor || entity.color,
            entity.lineWidth,
            lineType,
            entity.dashed,
            isHighlighted,
            highlightColor,
            ctx.lineWidth
          );
        } else if (entity.type === 'arc') {
          drawTraditionalOrCADCircleOrArc(
            entity.center,
            entity.radius,
            entity.startAngle * Math.PI / 180,
            entity.endAngle * Math.PI / 180,
            entity.mode,
            finalColor || entity.color,
            entity.lineWidth,
            lineType,
            entity.dashed,
            isHighlighted,
            highlightColor,
            ctx.lineWidth
          );
        } else if (entity.type === 'point') {
          ctx.beginPath();
          ctx.arc(entity.point.x, entity.point.y, 2 / view.zoom, 0, Math.PI * 2);
          ctx.fillStyle = isLavagna ? '#FAF9F6' : '#000000'; // Force white points on blackboard, black otherwise
          ctx.fill();
        } else if (entity.type === 'rectangle') {
          const pA = { x: entity.p1.x, y: entity.p1.y };
          const pB = { x: entity.p2.x, y: entity.p1.y };
          const pC = { x: entity.p2.x, y: entity.p2.y };
          const pD = { x: entity.p1.x, y: entity.p2.y };
          drawTraditionalOrCADLine(pA, pB, entity.mode, finalColor || entity.color, entity.lineWidth, lineType, entity.dashed, isHighlighted, highlightColor, ctx.lineWidth);
          drawTraditionalOrCADLine(pB, pC, entity.mode, finalColor || entity.color, entity.lineWidth, lineType, entity.dashed, isHighlighted, highlightColor, ctx.lineWidth);
          drawTraditionalOrCADLine(pC, pD, entity.mode, finalColor || entity.color, entity.lineWidth, lineType, entity.dashed, isHighlighted, highlightColor, ctx.lineWidth);
          drawTraditionalOrCADLine(pD, pA, entity.mode, finalColor || entity.color, entity.lineWidth, lineType, entity.dashed, isHighlighted, highlightColor, ctx.lineWidth);
        } else if (entity.type === 'camera') {
          // Draw Camera Icon
          ctx.save();
          ctx.translate(entity.point.x, entity.point.y);
          ctx.rotate(entity.angle * Math.PI / 180);
          
          ctx.beginPath();
          // Camera body
          ctx.rect(-10 / view.zoom, -8 / view.zoom, 20 / view.zoom, 16 / view.zoom);
          // Camera lens
          ctx.moveTo(10 / view.zoom, -4 / view.zoom);
          ctx.lineTo(18 / view.zoom, -8 / view.zoom);
          ctx.lineTo(18 / view.zoom, 8 / view.zoom);
          ctx.lineTo(10 / view.zoom, 4 / view.zoom);
          
          ctx.strokeStyle = '#4f46e5'; // Indigo color
          ctx.lineWidth = 2 / view.zoom;
          ctx.stroke();
          
          ctx.fillStyle = 'rgba(79, 70, 229, 0.2)';
          ctx.fill();
          
          ctx.restore();
        } else if (entity.type === 'text') {
          const fontSize = entity.fontSize || 14;
          ctx.font = `${entity.fontWeight || 'normal'} ${fontSize}px ${entity.fontFamily || 'sans-serif'}`;
          let textColor = entity.color || '#000000';
          if (isLavagna) {
            textColor = '#FAF9F6';
          }
          ctx.fillStyle = textColor;
          ctx.textAlign = (entity.textAlign as CanvasTextAlign) || 'left';
          ctx.textBaseline = 'top';

          const lines = entity.text.split('\n');
          const lineHeight = fontSize * 1.25;
          lines.forEach((line, idx) => {
            ctx.fillText(line, entity.point.x, entity.point.y + idx * lineHeight);
          });

          if (isHighlighted) {
            ctx.strokeStyle = highlightColor;
            ctx.lineWidth = 1 / view.zoom;
            // Draw a precise box around all lines of text
            const maxW = Math.max(...lines.map(line => ctx.measureText(line).width));
            const maxW_world = maxW / view.zoom;
            const h_world = lines.length * lineHeight;
            let offsetX = 0;
            if (ctx.textAlign === 'center') offsetX = -maxW_world / 2;
            else if (ctx.textAlign === 'right') offsetX = -maxW_world;
            ctx.strokeRect(entity.point.x + offsetX - 4/view.zoom, entity.point.y - 4/view.zoom, maxW_world + 8/view.zoom, h_world + 8/view.zoom);
          }
        } else if (entity.type === 'hatch' || entity.isBIM) {
          const ent = entity as any;
          const style = ent.renderingStyle || ent.bimData?.renderingStyle;
          
          // BIM elements like walls or rooms should be able to show hatch patterns
          const pat = ent.pattern || ent.bimHatchPattern;
          const hasHatch = pat && pat !== 'NONE' && pat !== 'SOLID';
          const isBimMode = ent.bimRenderMode === 'parete_verticale' || ent.bimRenderMode === 'parete_orizzontale' || ent.isLinear;

          if (hasHatch) {
            drawHatchPattern(ctx, entity, view.zoom);
          }
          
          if (ent.points && ent.points.length >= 2) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(ent.points[0].x, ent.points[0].y);
            for (let i = 1; i < ent.points.length; i++) {
              ctx.lineTo(ent.points[i].x, ent.points[i].y);
            }
            if (ent.points.length > 2 && !ent.isLinear && ent.bimRenderMode !== 'parete_verticale' && ent.bimRenderMode !== 'parete_orizzontale') {
               ctx.closePath();
            }
            
            const isDefaultColor = !ent.color || ent.color === '#000000' || ent.color === 'rgba(0,0,0,0.5)' || ent.color === 'rgba(0, 0, 0, 0.5)';
            
            if (ent.bimRenderMode === 'parete_verticale') {
              ctx.strokeStyle = selectedEntityId === entity.id || isFlashing ? '#06b6d4' : (isDefaultColor ? '#059669' : ent.color);
              ctx.lineWidth = (selectedEntityId === entity.id || isFlashing ? 5.0 : 4.0) / view.zoom;
              ctx.setLineDash([8 / view.zoom, 4 / view.zoom]);
            } else if (ent.bimRenderMode === 'parete_orizzontale') {
              ctx.strokeStyle = selectedEntityId === entity.id || isFlashing ? '#06b6d4' : (isDefaultColor ? '#0284c7' : ent.color);
              ctx.lineWidth = (selectedEntityId === entity.id || isFlashing ? 5.0 : 4.0) / view.zoom;
              ctx.setLineDash([4 / view.zoom, 4 / view.zoom]);
            } else if (ent.isLinear) {
              const thickness = ent.bimWidth || 15;
              const sideSign = ent.sideSign || 1;
              const isFaceAligned = ent.isFaceAligned;
              
              if (isFaceAligned && ent.points && ent.points.length >= 2) {
                // Redraw path with offset so one face is on the base line
                ctx.beginPath();
                for (let i = 0; i < ent.points.length - 1; i++) {
                   const pA = ent.points[i];
                   const pB = ent.points[i+1];
                   const dx = pB.x - pA.x;
                   const dy = pB.y - pA.y;
                   const L = Math.sqrt(dx*dx + dy*dy) || 1;
                   const nx = -dy / L;
                   const ny = dx / L;
                   const offset = (thickness / 2) * sideSign;
                   
                   if (i === 0) ctx.moveTo(pA.x + nx * offset, pA.y + ny * offset);
                   ctx.lineTo(pB.x + nx * offset, pB.y + ny * offset);
                }
              }

              const isPlaster = (entity.bimName || '').toLowerCase().includes('intonac') || 
                                (entity.bimFamily || '').toLowerCase().includes('intonac') ||
                                (entity.bimAreaType || '').toLowerCase().includes('intonac');
              const isRustic = (entity.bimName || '').toLowerCase().includes('rustic') || 
                               (entity.bimFamily || '').toLowerCase().includes('rustic') ||
                               (entity.bimAreaType || '').toLowerCase().includes('rustic');
              const isCoating = (entity.bimName || '').toLowerCase().includes('rivest') || 
                                (entity.bimFamily || '').toLowerCase().includes('rivest');
              
              if (isPlaster || isCoating) {
                // Plaster/Coating specific trace in plan
                ctx.strokeStyle = selectedEntityId === entity.id || isFlashing ? '#06b6d4' : (entity.color || '#f3f4f6');
                
                if (isRustic) {
                   ctx.lineWidth = Math.max(thickness * 1.5, 4.0 / view.zoom); // Make it slightly thicker for dots
                   ctx.lineCap = 'round'; // Use round dots
                   ctx.setLineDash([0, Math.max(thickness * 1.5, 6 / view.zoom)]); // Dots spaced out
                } else {
                   ctx.lineWidth = Math.max(thickness, 2.0 / view.zoom);
                   ctx.lineCap = 'butt';
                   ctx.setLineDash([]);
                }
              } else {
                ctx.strokeStyle = selectedEntityId === entity.id || isFlashing ? '#06b6d4' : (isDefaultColor ? '#059669' : entity.color);
                ctx.lineWidth = Math.max(thickness, 3.0 / view.zoom);
                ctx.setLineDash([]);
                ctx.lineCap = 'butt';
              }
            } else {
              ctx.strokeStyle = selectedEntityId === entity.id || isFlashing ? '#06b6d4' : (isDefaultColor ? '#475569' : entity.color);
              ctx.lineWidth = (selectedEntityId === entity.id || isFlashing ? 3.0 : 2.0) / view.zoom;
            }
            ctx.stroke();
            
            // Revert changes to prevent affecting other shapes
            ctx.lineCap = 'butt';
            ctx.setLineDash([]);
            
            ctx.restore();
          }
        } else if (entity.type === 'image') {
          const img = entity as any;
          if (img.mediaType && img.mediaType !== 'image') {
              // It is handled by the multimedia HTML overlay
              return;
          }
          const imgElement = document.createElement('img');
          imgElement.src = img.src;
          imgElement.crossOrigin = 'anonymous';

          ctx.save();
          // Apply opacity if set, default to 1
          ctx.globalAlpha = img.opacity ?? 1;

          if (img.blendMode === 'multiply') {
            ctx.globalCompositeOperation = 'multiply';
          }

          let filters = [];
          if (img.brightness !== undefined) filters.push(`brightness(${img.brightness}%)`);
          if (img.contrast !== undefined) filters.push(`contrast(${img.contrast}%)`);
          if (filters.length > 0) {
            ctx.filter = filters.join(' ');
          }

          // Compute rotate center
          const cx = img.point.x + img.width / 2;
          const cy = img.point.y + img.height / 2;
          
          ctx.translate(cx, cy);
          if (img.angle) {
            ctx.rotate((img.angle * Math.PI) / 180);
          }
          
          try {
            // Apply cropping if present (values are percentages 0-100)
            const topCrop = (img.crop?.top || 0) / 100;
            const rightCrop = (img.crop?.right || 0) / 100;
            const bottomCrop = (img.crop?.bottom || 0) / 100;
            const leftCrop = (img.crop?.left || 0) / 100;

            const nw = imgElement.naturalWidth || 1;
            const nh = imgElement.naturalHeight || 1;

            const sx = nw * leftCrop;
            const sy = nh * topCrop;
            const sw = nw * (1 - leftCrop - rightCrop);
            const sh = nh * (1 - topCrop - bottomCrop);

            const dx = -img.width / 2 + img.width * leftCrop;
            const dy = -img.height / 2 + img.height * topCrop;
            const dw = img.width * (1 - leftCrop - rightCrop);
            const dh = img.height * (1 - topCrop - bottomCrop);

            if (sw > 0 && sh > 0) {
              ctx.drawImage(imgElement, sx, sy, sw, sh, dx, dy, dw, dh);
            }
          } catch (e) {
            // Draw placeholder box if loading
            ctx.strokeStyle = '#8c8c8c';
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(-img.width / 2, -img.height / 2, img.width, img.height);
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(-img.width / 2, -img.height / 2, img.width, img.height);
            ctx.fillStyle = '#666666';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(img.name || "Immagine", 0, 0);
          }

          // Draw selection outline if highlighted
          if (isHighlighted) {
            ctx.strokeStyle = highlightColor;
            ctx.lineWidth = 2 / view.zoom;
            ctx.setLineDash([]);
            ctx.strokeRect(-img.width / 2 - 2/view.zoom, -img.height / 2 - 2/view.zoom, img.width + 4/view.zoom, img.height + 4/view.zoom);
          }
          
          ctx.restore();
        } else if (entity.type === 'bim-csg') {
          const positions = (entity as any).geometryData?.positions;
          const indices = (entity as any).geometryData?.indices;
          if (positions && indices && indices.length > 0) {
            ctx.beginPath();
            for (let idx = 0; idx < indices.length; idx += 3) {
              const i1 = indices[idx] * 3;
              const i2 = indices[idx+1] * 3;
              const i3 = indices[idx+2] * 3;
              
              ctx.moveTo(positions[i1] * 100, -positions[i1+2] * 100);
              ctx.lineTo(positions[i2] * 100, -positions[i2+2] * 100);
              ctx.lineTo(positions[i3] * 100, -positions[i3+2] * 100);
              ctx.lineTo(positions[i1] * 100, -positions[i1+2] * 100);
            }
            if (isHighlighted) {
              ctx.strokeStyle = highlightColor;
              ctx.lineWidth = 2 / view.zoom;
            } else {
              ctx.strokeStyle = (entity as any).color || '#3b82f6';
              ctx.lineWidth = 1 / view.zoom;
            }
            ctx.stroke();
          }
        }
        ctx.stroke();

        if ((activeTool === 'Trim' || activeTool === 'Allunga') && highlightedTrimSegment && entity.id === highlightedTrimLine?.id) {
             // Draw red highlight for Trim (Green if smart), Blue for Allunga
             ctx.strokeStyle = activeTool === 'Allunga' ? 'rgba(59, 130, 246, 0.8)' : (trimMode === 'smart' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(255,50,50,0.8)');
             ctx.lineWidth = (entity.lineWidth + 4) / view.zoom;
             ctx.beginPath();
             if (highlightedTrimSegment.type === 'line' && highlightedTrimSegment.start && highlightedTrimSegment.end) {
                 ctx.moveTo(highlightedTrimSegment.start.x, highlightedTrimSegment.start.y);
                 ctx.lineTo(highlightedTrimSegment.end.x, highlightedTrimSegment.end.y);
             } else if (highlightedTrimSegment.type === 'arc' && highlightedTrimSegment.center && highlightedTrimSegment.radius !== undefined && highlightedTrimSegment.startAngle !== undefined && highlightedTrimSegment.endAngle !== undefined) {
                 ctx.arc(
                     highlightedTrimSegment.center.x,
                     highlightedTrimSegment.center.y,
                     highlightedTrimSegment.radius,
                     highlightedTrimSegment.startAngle * Math.PI / 180,
                     highlightedTrimSegment.endAngle * Math.PI / 180
                 );
             }
             ctx.stroke();
        }
        if (activeTool === 'Cancella' && entity.id === highlightedTrimLine?.id) {
             ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
             ctx.lineWidth = (entity.lineWidth + 4) / view.zoom;
             ctx.beginPath();
             if (entity.type === 'line' || entity.type === 'dimension') {
                 ctx.moveTo(entity.start.x, entity.start.y);
                 ctx.lineTo(entity.end.x, entity.end.y);
             } else if (entity.type === 'circle') {
                 ctx.arc(entity.center.x, entity.center.y, entity.radius, 0, Math.PI * 2);
             } else if (entity.type === 'arc') {
                 ctx.arc(entity.center.x, entity.center.y, entity.radius, entity.startAngle * Math.PI / 180, entity.endAngle * Math.PI / 180);
             } else if (entity.type === 'rectangle') {
                 const width = entity.p2.x - entity.p1.x;
                 const height = entity.p2.y - entity.p1.y;
                 ctx.rect(entity.p1.x, entity.p1.y, width, height);
             } else if (entity.type === 'text') {
                 const lines = entity.text.split('\n');
                 const lineHeight = entity.fontSize * 1.25;
                 const maxLen = Math.max(...lines.map(l => l.length), 1);
                 const maxW_world = maxLen * entity.fontSize * 0.55;
                 const h_world = lines.length * lineHeight;
                 let offsetX = 0;
                 if (entity.textAlign === 'center') offsetX = -maxW_world / 2;
                 else if (entity.textAlign === 'right') offsetX = -maxW_world;
                 ctx.rect(entity.point.x + offsetX - 4/view.zoom, entity.point.y - 4/view.zoom, maxW_world + 8/view.zoom, h_world + 8/view.zoom);
             }
             ctx.stroke();
        }



        ctx.setLineDash([]);
      });

      ctx.globalAlpha = 1.0;

      // Eraser or Trim Smart cursor
      if (activeTool === 'Gomma' || (activeTool === 'Trim' && trimMode === 'smart')) {
          ctx.save();
          
          const cursorPoint = activeTool === 'Gomma' ? eraserPos : actualMousePosRef.current;
          ctx.translate(cursorPoint.x, cursorPoint.y);
          ctx.rotate(-Math.PI / 8); 

          const r = (eraserRadius * 3.5) / view.zoom; 

          if (activeTool === 'Trim' && trimMode === 'smart') {
              ctx.shadowBlur = 25 / view.zoom;
              ctx.shadowColor = 'rgba(16, 185, 129, 0.9)';

              // Main body: very transparent green
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
              ctx.fill();

              // Extremely evident green border with shadow
              ctx.strokeStyle = '#10b981';
              ctx.lineWidth = 5 / view.zoom;
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              ctx.stroke();
              
              ctx.shadowBlur = 0;
          }
          
          if (activeTool === 'Gomma' && eraserType === 'miracolo') {
              // Miracle Eraser logic: draws a sparkly or glowing circle
              ctx.shadowBlur = 15 / view.zoom;
              ctx.shadowColor = '#8b5cf6'; // Violet glow
              ctx.fillStyle = 'rgba(139, 92, 246, 0.2)';
              ctx.strokeStyle = '#a78bfa';
              ctx.lineWidth = 2 / view.zoom;
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.shadowBlur = 0;
          } else if (activeTool === 'Gomma' && eraserType === 'pencil') {
              const ew = 42 / view.zoom; 
              const eh = 24 / view.zoom;
              ctx.shadowBlur = 5 / view.zoom;
              ctx.shadowColor = 'rgba(0,0,0,0.2)';
              ctx.fillStyle = '#d4d4d8';
              ctx.strokeStyle = '#a1a1aa';
              ctx.lineWidth = 1 / view.zoom;
              ctx.beginPath();
              if (ctx.roundRect) ctx.roundRect(0, -eh, ew, eh, 3 / view.zoom); else ctx.rect(0, -eh, ew, eh);
              ctx.fill();
              ctx.stroke();
              const split = ew * 0.4;
              ctx.fillStyle = '#f472b6'; ctx.beginPath(); ctx.rect(0, -eh, split, eh); ctx.fill();
              ctx.fillStyle = '#60a5fa'; ctx.beginPath(); ctx.rect(split, -eh, ew - split, eh); ctx.fill();
              ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.moveTo(split, -eh); ctx.lineTo(split, 0); ctx.stroke();
              ctx.fillStyle = '#ffffff'; ctx.font = `bold ${Math.max(5, 6 / view.zoom)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText("GECOLA", ew * 0.7, -eh / 2 + 2/view.zoom);
          } else if (activeTool === 'Gomma' && eraserType === 'lametta') {
              const rw = 20 / view.zoom; const rh = 40 / view.zoom;
              ctx.fillStyle = '#cbd5e1'; ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 0.5 / view.zoom; ctx.beginPath();
              ctx.moveTo(0,0); ctx.lineTo(rw,0); ctx.lineTo(rw,-rh); ctx.lineTo(0,-rh); ctx.closePath(); ctx.fill(); ctx.stroke();
              ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2 / view.zoom; ctx.beginPath(); ctx.moveTo(rw * 0.05, 0); ctx.lineTo(rw * 0.95, 0); ctx.stroke();
          } else if (activeTool === 'Gomma' && eraserType === 'all') {
              ctx.strokeStyle = '#f87171'; ctx.setLineDash([5 / view.zoom, 5 / view.zoom]); ctx.lineWidth = 2 / view.zoom;
              ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
          }
          ctx.restore();
      }

      // Draw all intersections as small red crosses when Trim is active
      if (activeTool === 'Trim') {
          ctx.save();
          ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5 / view.zoom;
          const crossSize = 4 / view.zoom;
          entities.forEach((ent, i) => {
              if (ent.type !== 'line' && ent.type !== 'circle' && ent.type !== 'arc') return;
              for (let j = i + 1; j < entities.length; j++) {
                  const other = entities[j];
                  if (other.type !== 'line' && other.type !== 'circle' && other.type !== 'arc') continue;
                  const inters = getIntersections(ent, other);
                  inters.forEach(p => {
                      ctx.beginPath(); ctx.moveTo(p.x - crossSize, p.y - crossSize); ctx.lineTo(p.x + crossSize, p.y + crossSize);
                      ctx.moveTo(p.x + crossSize, p.y - crossSize); ctx.lineTo(p.x - crossSize, p.y + crossSize); ctx.stroke();
                  });
              }
          });
          ctx.restore();
      }

      // Draw Tecnigrafo "Squadretta" (Drafting Machine Effect)
      // We draw this before the drawing preview so the "pen" appears to write on top of it.
      if (tecnigrafoOrigin && !showSquadrette) {
        ctx.save();
        
        const isX = tecnigrafoLock === 'x' || !tecnigrafoLock;
        const isY = tecnigrafoLock === 'y' || !tecnigrafoLock;

        // Visual constants (in model space)
        const rulerLength = 5000 / view.zoom; 
        const bodyWidth = 32 / view.zoom; 
        const edgeWidth = 6 / view.zoom;

        // 1. HORIZONTAL RULER (Drafting edge at Origin Y, extends to the right)
        if (isX) {
            ctx.save();
            ctx.shadowBlur = 8 / view.zoom;
            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            
            // Brown Body (below the drawing edge)
            ctx.fillStyle = '#78350f'; 
            ctx.globalAlpha = 0.8;
            ctx.fillRect(tecnigrafoOrigin.x - 10/view.zoom, tecnigrafoOrigin.y + edgeWidth, rulerLength, bodyWidth - edgeWidth);
            
            // White Drafting Edge (top edge of the ruler)
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 1.0;
            ctx.fillRect(tecnigrafoOrigin.x - 10/view.zoom, tecnigrafoOrigin.y, rulerLength, edgeWidth);
            
            // Thin black line for the sharp edge
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 0.5 / view.zoom;
            ctx.beginPath();
            ctx.moveTo(tecnigrafoOrigin.x - 10/view.zoom, tecnigrafoOrigin.y);
            ctx.lineTo(tecnigrafoOrigin.x + rulerLength, tecnigrafoOrigin.y);
            ctx.stroke();

            // Millimeter markings
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            const step = 10 / view.zoom; // Assume 10 units = 1cm for visual effect
            for (let d = 0; d < rulerLength; d += step) {
                const x = tecnigrafoOrigin.x + d;
                const h = (d % (step * 10) === 0) ? edgeWidth : (d % (step * 5) === 0 ? edgeWidth * 0.7 : edgeWidth * 0.4);
                ctx.fillRect(x, tecnigrafoOrigin.y, 1 / view.zoom, h);
            }
            ctx.restore();
        }

        // 2. VERTICAL RULER (Drafting edge at Origin X, brown left, white right)
        if (isY) {
            ctx.save();
            ctx.shadowBlur = 8 / view.zoom;
            ctx.shadowColor = 'rgba(0,0,0,0.3)';

            // Brown Body (to the left of the drawing edge)
            ctx.fillStyle = '#78350f';
            ctx.globalAlpha = 0.8;
            ctx.fillRect(tecnigrafoOrigin.x - bodyWidth, tecnigrafoOrigin.y - 10/view.zoom, bodyWidth - edgeWidth, rulerLength);

            // White Drafting Edge (right side of the ruler)
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 1.0;
            ctx.fillRect(tecnigrafoOrigin.x - edgeWidth, tecnigrafoOrigin.y - 10/view.zoom, edgeWidth, rulerLength);

            // Thin black line
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 0.5 / view.zoom;
            ctx.beginPath();
            ctx.moveTo(tecnigrafoOrigin.x, tecnigrafoOrigin.y - 10/view.zoom);
            ctx.lineTo(tecnigrafoOrigin.x, tecnigrafoOrigin.y + rulerLength);
            ctx.stroke();

            // Millimeter markings
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            const step = 10 / view.zoom;
            for (let d = 0; d < rulerLength; d += step) {
                const y = tecnigrafoOrigin.y + d;
                const w = (d % (step * 10) === 0) ? edgeWidth : (d % (step * 5) === 0 ? edgeWidth * 0.7 : edgeWidth * 0.4);
                ctx.fillRect(tecnigrafoOrigin.x - w, y, w, 1 / view.zoom);
            }
            ctx.restore();
        }

        // Pivot point indicator
        ctx.beginPath();
        ctx.arc(tecnigrafoOrigin.x, tecnigrafoOrigin.y, 10 / view.zoom, 0, Math.PI * 2);
        ctx.fillStyle = '#64748b';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / view.zoom;
        ctx.stroke();
        
        ctx.restore();
      } else if (tecnigrafoOrigin && showSquadrette) {
          // If squadrette are shown, just draw the pivot head
          ctx.save();
          ctx.beginPath();
          ctx.arc(tecnigrafoOrigin.x, tecnigrafoOrigin.y, 10 / view.zoom, 0, Math.PI * 2);
          ctx.fillStyle = '#64748b';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2 / view.zoom;
          ctx.stroke();
          ctx.restore();
      }

      if (showSquadrette) {
          squadrette.forEach(sq => {
              const verts = getSquadrettaVertices(sq);
              ctx.save();
              ctx.fillStyle = 'rgba(255, 230, 100, 0.35)'; // Classic yellow transparent plastic
              ctx.strokeStyle = 'rgba(120, 80, 0, 0.6)';
              ctx.lineWidth = 1.5 / view.zoom;
              ctx.beginPath();
              ctx.moveTo(verts[0].x, verts[0].y);
              ctx.lineTo(verts[1].x, verts[1].y);
              ctx.lineTo(verts[2].x, verts[2].y);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();

              // Measurement markings
              ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
              ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
              const miniMarkStep = 1; // 1 cm markings
              
              const drawMarks = (pA: Point, pB: Point) => {
                  const dx = pB.x - pA.x;
                  const dy = pB.y - pA.y;
                  const L = Math.hypot(dx, dy);
                  const ux = dx / L;
                  const uy = dy / L;
                  const nx = -uy;
                  const ny = ux;
                  
                  // Smallest marking is 0.1cm (1mm)
                  const step = 0.1;
                  for (let d = 0; d <= L; d += step) {
                      const p = { x: pA.x + ux * d, y: pA.y + uy * d };
                      const isCm = Math.abs(d % 1) < 0.001;
                      const isHalfCm = Math.abs(d % 0.5) < 0.001;
                      
                      let h = 3 / view.zoom;
                      if (isCm) h = (Math.abs(d % 5) < 0.001) ? (Math.abs(d % 10) < 0.001 ? 15 / view.zoom : 10 / view.zoom) : 7 / view.zoom;
                      else if (isHalfCm) h = 5 / view.zoom;
                      
                      // Only draw sub-millimeter if zoom is high enough to see them
                      if (!isCm && !isHalfCm && view.zoom < 1.5) continue;

                      ctx.beginPath();
                      ctx.moveTo(p.x, p.y);
                      ctx.lineTo(p.x + nx * h, p.y + ny * h);
                      ctx.stroke();
                      
                      if (isCm && d > 0 && Math.abs(d % 5) < 0.001) {
                          ctx.save();
                          ctx.translate(p.x + nx * (h + 6/view.zoom), p.y + ny * (h + 6/view.zoom));
                          ctx.font = `bold ${11 / view.zoom}px sans-serif`;
                          ctx.textAlign = 'center';
                          ctx.textBaseline = 'middle';
                          ctx.fillText((d).toString(), 0, 0);
                          ctx.restore();
                      }
                  }
              };
              drawMarks(verts[0], verts[1]);
              drawMarks(verts[0], verts[2]);
              ctx.restore();
          });
      }


      // Removed Redundant Tecnigrafo measurement label block here

      // --- BIM LIVE PREVIEWS (STARTS) ---
      if ((activeTool === 'BIM_DisegnaLineare' || activeTool === 'BIM_TracciaSegmento') && hoveredBIMSegments.length > 0) {
        ctx.save();
        
        // For BIM_TracciaSegmento, only show the best (first) segment
        const segmentsToHighlight = activeTool === 'BIM_TracciaSegmento' 
            ? [hoveredBIMSegments[0]] 
            : hoveredBIMSegments;

        // Compute total length
        let totalLength = 0;
        segmentsToHighlight.forEach(seg => {
            const dx = seg.end.x - seg.start.x;
            const dy = seg.end.y - seg.start.y;
            totalLength += Math.sqrt(dx * dx + dy * dy);
        });

        // 1. Highlight all segments
        segmentsToHighlight.forEach(seg => {
            const { start, end } = seg;
            ctx.strokeStyle = activeTool === 'BIM_TracciaSegmento' ? '#10b981' : '#10b981'; 
            ctx.lineWidth = 5.0 / view.zoom;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();

            ctx.strokeStyle = activeTool === 'BIM_TracciaSegmento' ? '#34d399' : '#34d399';
            ctx.lineWidth = 2.0 / view.zoom;
            ctx.setLineDash([4 / view.zoom, 4 / view.zoom]);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            ctx.setLineDash([]);
        });

        // 2. Draw nice circles at vertices
        ctx.fillStyle = activeTool === 'BIM_TracciaSegmento' ? '#059669' : '#059669';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5 / view.zoom;
        const drawnPoints = new Set<string>();
        segmentsToHighlight.forEach(seg => {
            [seg.start, seg.end].forEach(p => {
                const key = `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
                if (!drawnPoints.has(key)) {
                    drawnPoints.add(key);
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 6 / view.zoom, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }
            });
        });

        // 3. Draw individual length labels for each segment if there are multiple
        if (hoveredBIMSegments.length > 1) {
            ctx.font = `${10 / view.zoom}px sans-serif`;
            ctx.fillStyle = '#0891b2';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            hoveredBIMSegments.forEach(seg => {
                const midX = (seg.start.x + seg.end.x) / 2;
                const midY = (seg.start.y + seg.end.y) / 2;
                const dx = seg.end.x - seg.start.x;
                const dy = seg.end.y - seg.start.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                ctx.fillText(`${len.toFixed(2)} m`, midX, midY - 4 / view.zoom);
            });
        }

        // 4. Draw unified badge near mouse pos or centroid
        const firstSeg = hoveredBIMSegments[0];
        const midX = (firstSeg.start.x + firstSeg.end.x) / 2;
        const midY = (firstSeg.start.y + firstSeg.end.y) / 2;
        
        const isMulti = hoveredBIMSegments.length > 1;
        const label = isMulti 
            ? `Rilievo Multiplo: ${totalLength.toFixed(2)} m (${hoveredBIMSegments.length} tratti)`
            : `Rilievo Auto: ${totalLength.toFixed(2)} m (${firstSeg.entity.bimName || 'Muro'})`;

        ctx.font = `bold ${11 / view.zoom}px sans-serif`;
        const textMetrics = ctx.measureText(label);
        const paddingX = 8 / view.zoom;
        const paddingY = 4 / view.zoom;
        const boxW = textMetrics.width + paddingX * 2;
        const boxH = 20 / view.zoom;

        const mouseX = actualMousePosRef.current.x;
        const mouseY = actualMousePosRef.current.y;
        const perpX = mouseX - midX;
        const perpY = mouseY - midY;
        const perpLen = Math.hypot(perpX, perpY);
        let badgeX = midX;
        let badgeY = midY;
        
        if (perpLen > 0.001) {
            const offsetAmt = Math.min(25 / view.zoom, perpLen * 0.5);
            badgeX += (perpX / perpLen) * offsetAmt;
            badgeY += (perpY / perpLen) * offsetAmt;
        } else {
            badgeY -= 15 / view.zoom;
        }

        ctx.fillStyle = '#06b6d4'; // Cyan badge
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1 / view.zoom;
        ctx.beginPath();
        ctx.roundRect(badgeX - boxW / 2, badgeY - boxH / 2, boxW, boxH, 4 / view.zoom);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff'; // White text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, badgeX, badgeY);

        // 5. Draw projection dashed line to the nearest segment
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
        ctx.lineWidth = 1 / view.zoom;
        ctx.setLineDash([2 / view.zoom, 2 / view.zoom]);
        ctx.beginPath();
        ctx.moveTo(mouseX, mouseY);
        
        let nearestProj: Point = { x: midX, y: midY };
        let minProjDist = Infinity;
        hoveredBIMSegments.forEach(seg => {
            const l2 = (seg.end.x - seg.start.x) ** 2 + (seg.end.y - seg.start.y) ** 2;
            let t = 0;
            if (l2 > 0) {
                t = ((mouseX - seg.start.x) * (seg.end.x - seg.start.x) + (mouseY - seg.start.y) * (seg.end.y - seg.start.y)) / l2;
                t = Math.max(0, Math.min(1, t));
            }
            const projX = seg.start.x + t * (seg.end.x - seg.start.x);
            const projY = seg.start.y + t * (seg.end.y - seg.start.y);
            const d = Math.hypot(mouseX - projX, mouseY - projY);
            if (d < minProjDist) {
                minProjDist = d;
                nearestProj = { x: projX, y: projY };
            }
        });
        
        ctx.lineTo(nearestProj.x, nearestProj.y);
        ctx.stroke();

        ctx.restore();
      }

      if ((activeTool === 'BIM_DisegnaStanza' || activeTool === 'BIM_DisegnaLineare' || activeTool === 'BIM_TracciaSegmento') && manualRoomPoints.length > 0) {
        ctx.save();
        ctx.strokeStyle = (activeTool === 'BIM_DisegnaLineare' || activeTool === 'BIM_TracciaSegmento') ? '#10b981' : '#10b981';
        ctx.lineWidth = (activeTool === 'BIM_DisegnaLineare' || activeTool === 'BIM_TracciaSegmento') ? 4.0 / view.zoom : 1.5 / view.zoom;
        ctx.fillStyle = (activeTool === 'BIM_DisegnaLineare' || activeTool === 'BIM_TracciaSegmento') ? 'rgba(16, 185, 129, 0.04)' : 'rgba(16, 185, 129, 0.08)';
        ctx.beginPath();
        ctx.moveTo(manualRoomPoints[0].x, manualRoomPoints[0].y);
        for (let i = 1; i < manualRoomPoints.length; i++) {
          ctx.lineTo(manualRoomPoints[i].x, manualRoomPoints[i].y);
        }
        // Draw to current mouse pos
        ctx.lineTo(actualMousePosRef.current.x, actualMousePosRef.current.y);
        ctx.stroke();
        if (activeTool === 'BIM_DisegnaStanza') {
            ctx.fill();
        }

        // Draw circles at corners
        manualRoomPoints.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4 / view.zoom, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();
        });
        ctx.restore();
      }

      if (drawing && ((activeTool as string) === 'BIM_Porta' || (activeTool as string) === 'BIM_Finestra' || (activeTool as string) === 'BIM_Muro' || (activeTool as string) === 'Muro')) {
        ctx.save();
        const start = drawing.start;
        const end = drawing.current || actualMousePosRef.current;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        if ((activeTool === 'BIM_Muro' || activeTool === 'Muro') && len > 0.1) {
          const thickness = lastWallThickness || 15;
          const nx = -dy / len;
          const ny = dx / len;
          
          ctx.strokeStyle = '#4b5563';
          ctx.lineWidth = 1 / view.zoom;
          
          ctx.beginPath();
          ctx.moveTo(start.x + nx * thickness / 2, start.y + ny * thickness / 2);
          ctx.lineTo(end.x + nx * thickness / 2, end.y + ny * thickness / 2);
          
          ctx.moveTo(start.x - nx * thickness / 2, start.y - ny * thickness / 2);
          ctx.lineTo(end.x - nx * thickness / 2, end.y - ny * thickness / 2);
          
          ctx.moveTo(start.x + nx * thickness / 2, start.y + ny * thickness / 2);
          ctx.lineTo(start.x - nx * thickness / 2, start.y - ny * thickness / 2);
          
          ctx.moveTo(end.x + nx * thickness / 2, end.y + ny * thickness / 2);
          ctx.lineTo(end.x - nx * thickness / 2, end.y - ny * thickness / 2);
          
          ctx.stroke();

          ctx.fillStyle = 'rgba(75, 85, 99, 0.12)';
          ctx.beginPath();
          ctx.moveTo(start.x + nx * thickness / 2, start.y + ny * thickness / 2);
          ctx.lineTo(end.x + nx * thickness / 2, end.y + ny * thickness / 2);
          ctx.lineTo(end.x - nx * thickness / 2, end.y - ny * thickness / 2);
          ctx.lineTo(start.x - nx * thickness / 2, start.y - ny * thickness / 2);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = 'rgba(75, 85, 99, 0.4)';
          ctx.lineWidth = 1 / view.zoom;
          ctx.setLineDash([4/view.zoom, 4/view.zoom]);
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();

          // Render floating measurement tooltip for wall length in real time
          ctx.save();
          const labelX = end.x + 15 / view.zoom;
          const labelY = end.y - 15 / view.zoom;
          const text = len.toFixed(1);
          ctx.font = `${12 / view.zoom}px Inter, sans-serif`;
          const metrics = ctx.measureText(text);
          const padding = 4 / view.zoom;
          
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.beginPath();
          if (ctx.roundRect) {
              ctx.roundRect(labelX - padding, labelY - 12/view.zoom - padding, metrics.width + padding*2, 14/view.zoom + padding*2, 4/view.zoom);
          } else {
              ctx.rect(labelX - padding, labelY - 12/view.zoom - padding, metrics.width + padding*2, 14/view.zoom + padding*2);
          }
          ctx.fill();
          
          ctx.fillStyle = '#ffffff';
          ctx.fillText(text + " cm", labelX, labelY);
          ctx.restore();
        }

        if ((activeTool as string) === 'BIM_Porta' && len > 0.1) {
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 2 / view.zoom;
          
          const px = -dy / len;
          const py = dx / len;
          const leafEnd = { x: start.x + px * len, y: start.y + py * len };
          
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(leafEnd.x, leafEnd.y);
          ctx.stroke();
          
          ctx.strokeStyle = 'rgba(220, 38, 38, 0.4)';
          ctx.lineWidth = 1 / view.zoom;
          ctx.beginPath();
          const baseAngle = Math.atan2(end.y - start.y, end.x - start.x);
          const leafAngle = Math.atan2(leafEnd.y - start.y, leafEnd.x - start.x);
          ctx.arc(start.x, start.y, len, baseAngle, leafAngle, false);
          ctx.stroke();
          
          ctx.strokeStyle = '#9ca3af';
          ctx.setLineDash([4/view.zoom, 4/view.zoom]);
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        }

        if (activeTool === 'BIM_Finestra' && len > 0.1) {
          const nx = -dy / len;
          const ny = dx / len;
          const wWidth = 10;
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 1.5 / view.zoom;
          
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.moveTo(start.x + nx * wWidth / 2, start.y + ny * wWidth / 2);
          ctx.lineTo(end.x + nx * wWidth / 2, end.y + ny * wWidth / 2);
          ctx.moveTo(start.x - nx * wWidth / 2, start.y - ny * wWidth / 2);
          ctx.lineTo(end.x - nx * wWidth / 2, end.y - ny * wWidth / 2);
          ctx.moveTo(start.x - nx * wWidth / 2, start.y - ny * wWidth / 2);
          ctx.lineTo(start.x + nx * wWidth / 2, start.y + ny * wWidth / 2);
          ctx.moveTo(end.x - nx * wWidth / 2, end.y - ny * wWidth / 2);
          ctx.lineTo(end.x + nx * wWidth / 2, end.y + ny * wWidth / 2);
          ctx.stroke();
        }
        ctx.restore();
      }
      // --- BIM LIVE PREVIEWS (ENDS) ---

      // Draw current drawing preview
      if (drawing && (activeTool === 'Line' || (activeTool as string) === 'Filo' || activeTool === 'Circle' || activeTool === 'Rectangle' || activeTool === 'Arc' || activeTool === 'Dimension' || activeTool === 'Camera')) {
        let isKnownAngle = false;
        let matchedAngle = 0;
        if (activeTool === 'Line' || (activeTool as string) === 'Filo') {
            const dx = drawing.current.x - drawing.start.x;
            const dy = drawing.current.y - drawing.start.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 3) {
                let angle = Math.atan2(dy, dx) * 180 / Math.PI;
                angle = (angle + 360) % 360;
                const snapAngles = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
                const tolerance = 0.5;
                for (const snapAngle of snapAngles) {
                    if (Math.abs(angle - snapAngle) < tolerance || Math.abs(angle - (snapAngle - 360)) < tolerance) {
                        isKnownAngle = true;
                        matchedAngle = snapAngle;
                        break;
                    }
                }
            }
        }

        if (drawing.isFreehand && drawing.freehandPoints && drawing.freehandPoints.length > 1) {
            ctx.save();
            const previewLineType = defaultLineStyle.lineType;
            const isPreviewStyled = (previewLineType && previewLineType !== 'continuous') || defaultLineStyle.mode === 'CAD';
            if (isPreviewStyled) {
                if (previewLineType === 'dashed') {
                    ctx.setLineDash([8 / view.zoom, 4 / view.zoom]);
                } else if (previewLineType === 'dotted') {
                    ctx.setLineDash([2 / view.zoom, 3 / view.zoom]);
                } else if (previewLineType === 'dashdot') {
                    ctx.setLineDash([12 / view.zoom, 4 / view.zoom, 2 / view.zoom, 4 / view.zoom]);
                } else if (previewLineType === 'dashdash') {
                    ctx.setLineDash([15 / view.zoom, 4 / view.zoom, 4 / view.zoom, 4 / view.zoom]);
                } else {
                    ctx.setLineDash([]);
                }
                ctx.lineWidth = defaultLineStyle.mode === 'ink'
                    ? getEffectiveCADRenderWidth(defaultLineStyle.lineWidth, defaultLineStyle.mode, view.zoom)
                    : Math.max(0.1, defaultLineStyle.lineWidth / view.zoom);
                ctx.strokeStyle = isLavagna ? '#FAF9F6' : (defaultLineStyle.color || '#000000');
                ctx.beginPath();
                ctx.moveTo(drawing.freehandPoints[0].x, drawing.freehandPoints[0].y);
                for (let i = 1; i < drawing.freehandPoints.length; i++) {
                    ctx.lineTo(drawing.freehandPoints[i].x, drawing.freehandPoints[i].y);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            } else {
                ctx.setLineDash([]);
                let lastX = drawing.freehandPoints[0].x;
                let lastY = drawing.freehandPoints[0].y;
                for (let i = 1; i < drawing.freehandPoints.length; i++) {
                    const pt = drawing.freehandPoints[i];
                    const px = pt.x;
                    const py = pt.y;
                    
                    const style = computeRealisticInkPoint(drawing.freehandPoints, i, defaultLineStyle.mode === 'ink' ? 'ink' : 'pencil', view.zoom);
                    
                    ctx.beginPath();
                    ctx.lineWidth = defaultLineStyle.mode === 'ink'
                        ? (getEffectiveCADRenderWidth(defaultLineStyle.lineWidth, defaultLineStyle.mode, view.zoom) * (0.8 + style.width * 0.4))
                        : Math.max(0.1, style.width * (defaultLineStyle.lineWidth / view.zoom));
                    
                    ctx.strokeStyle = isLavagna 
                        ? getAlphaColor('#FAF9F6', style.alpha) 
                        : (defaultLineStyle.mode === 'ink' 
                            ? getAlphaColor('#000000', style.alpha) 
                            : getAlphaColor(defaultLineStyle.color, style.alpha));
                    
                    ctx.moveTo(lastX, lastY);
                    ctx.lineTo(px, py);
                    ctx.stroke();
                    
                    lastX = px;
                    lastY = py;
                }
            }
            ctx.restore();
        } else {
            // Live Drawing Preview using the EXACT selected pen style (China, Matita, or CAD) — NO green dashed line!
            const previewMode = (activeTool as string) === 'Filo' ? 'CAD' : defaultLineStyle.mode;
            const previewColor = drawing.isVirtual
                ? '#9ca3af'
                : ((activeTool as string) === 'Filo'
                    ? (defaultFiloColor || '#ff5500')
                    : defaultLineStyle.color);
            const previewWidth = (activeTool as string) === 'Filo' ? 1.5 : defaultLineStyle.lineWidth;
            const previewLineType = (activeTool as string) === 'Filo' ? 'continuous' : defaultLineStyle.lineType;
            const previewDashed = (activeTool as string) === 'Filo' ? false : (drawing.isVirtual ? true : defaultLineStyle.dashed);

            if (activeTool === 'Line' || (activeTool as string) === 'Filo' || activeTool === 'Dimension') {
                const isTraditionalSeg = activeTool === 'Line' && (previewMode === 'ink' || previewMode === 'pencil') && drawing.isTraditionalSegment;
                const effectiveEnd = isTraditionalSeg ? (drawing.maxPoint || drawing.current) : drawing.current;
                drawTraditionalOrCADLine(
                    drawing.start,
                    effectiveEnd,
                    previewMode,
                    previewColor,
                    previewWidth,
                    previewLineType,
                    previewDashed,
                    false,
                    undefined,
                    undefined,
                    false
                );
                // 1) If user moved backwards along the drawn segment with China or Matita, render the live Ricalco (second pass: tutta scura e senza sbavature)
                if (
                    isTraditionalSeg &&
                    drawing.retraceMinProj !== undefined &&
                    drawing.lockedDir &&
                    (drawing.maxLength || 0) - drawing.retraceMinProj > 0.05
                ) {
                    const retraceStartPt = {
                        x: drawing.start.x + drawing.lockedDir.x * drawing.retraceMinProj,
                        y: drawing.start.y + drawing.lockedDir.y * drawing.retraceMinProj
                    };
                    drawTraditionalOrCADLine(
                        retraceStartPt,
                        effectiveEnd,
                        previewMode,
                        previewColor,
                        previewWidth,
                        previewLineType,
                        previewDashed,
                        false,
                        undefined,
                        undefined,
                        true
                    );
                }
                // 2) If user is drawing a new China/Matita stroke directly on top of an existing collinear line, preview the 2nd-pass dark saturation live!
                if (isTraditionalSeg) {
                    const pdx = effectiveEnd.x - drawing.start.x;
                    const pdy = effectiveEnd.y - drawing.start.y;
                    const plen = Math.hypot(pdx, pdy);
                    if (plen > 0.5) {
                        const pux = pdx / plen;
                        const puy = pdy / plen;
                        for (const ent of entities) {
                            if (ent.type === 'line' && ent.layer === activeLayerId && (ent.mode === 'ink' || ent.mode === 'pencil')) {
                                const ldx = ent.end.x - ent.start.x;
                                const ldy = ent.end.y - ent.start.y;
                                const llen = Math.hypot(ldx, ldy);
                                if (llen > 0.5) {
                                    const sinT = Math.abs(pdx * ldy - pdy * ldx) / (plen * llen);
                                    const perpD = Math.abs(pdy * (ent.start.x - drawing.start.x) - pdx * (ent.start.y - drawing.start.y)) / plen;
                                    if (sinT < 0.12 && perpD < 2.0) {
                                        const t1 = (ent.start.x - drawing.start.x) * pux + (ent.start.y - drawing.start.y) * puy;
                                        const t2 = (ent.end.x - drawing.start.x) * pux + (ent.end.y - drawing.start.y) * puy;
                                        const ovS = Math.max(0, Math.min(t1, t2));
                                        const ovE = Math.min(plen, Math.max(t1, t2));
                                        if (ovE - ovS > 0.4) {
                                            drawTraditionalOrCADLine(
                                                { x: drawing.start.x + pux * ovS, y: drawing.start.y + puy * ovS },
                                                { x: drawing.start.x + pux * ovE, y: drawing.start.y + puy * ovE },
                                                previewMode,
                                                previewColor,
                                                previewWidth,
                                                previewLineType,
                                                previewDashed,
                                                false,
                                                undefined,
                                                undefined,
                                                true
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else if (activeTool === 'Circle') {
                const radius = Math.sqrt(Math.pow(drawing.current.x - drawing.start.x, 2) + Math.pow(drawing.current.y - drawing.start.y, 2));
                drawTraditionalOrCADCircleOrArc(
                    drawing.start,
                    radius,
                    0,
                    Math.PI * 2,
                    previewMode,
                    previewColor,
                    previewWidth,
                    previewLineType,
                    previewDashed
                );
                // Subtle radius helper thread
                ctx.save();
                ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
                ctx.lineWidth = 1 / view.zoom;
                ctx.setLineDash([4 / view.zoom, 4 / view.zoom]);
                ctx.beginPath();
                ctx.moveTo(drawing.start.x, drawing.start.y);
                ctx.lineTo(drawing.current.x, drawing.current.y);
                ctx.stroke();
                ctx.restore();
            } else if (activeTool === 'Rectangle') {
                const pA = { x: drawing.start.x, y: drawing.start.y };
                const pB = { x: drawing.current.x, y: drawing.start.y };
                const pC = { x: drawing.current.x, y: drawing.current.y };
                const pD = { x: drawing.start.x, y: drawing.current.y };
                drawTraditionalOrCADLine(pA, pB, previewMode, previewColor, previewWidth, previewLineType, previewDashed);
                drawTraditionalOrCADLine(pB, pC, previewMode, previewColor, previewWidth, previewLineType, previewDashed);
                drawTraditionalOrCADLine(pC, pD, previewMode, previewColor, previewWidth, previewLineType, previewDashed);
                drawTraditionalOrCADLine(pD, pA, previewMode, previewColor, previewWidth, previewLineType, previewDashed);
            } else if (activeTool === 'Camera') {
                const dx = drawing.current.x - drawing.start.x;
                const dy = drawing.current.y - drawing.start.y;
                let angle = Math.atan2(dy, dx);
                if (dx === 0 && dy === 0) angle = 0;
                
                ctx.save();
                ctx.translate(drawing.start.x, drawing.start.y);
                ctx.rotate(angle);
                ctx.strokeStyle = previewColor || '#000000';
                ctx.lineWidth = 1.5 / view.zoom;
                ctx.beginPath();
                // Camera body
                ctx.rect(-10 / view.zoom, -8 / view.zoom, 20 / view.zoom, 16 / view.zoom);
                // Camera lens
                ctx.moveTo(10 / view.zoom, -4 / view.zoom);
                ctx.lineTo(18 / view.zoom, -8 / view.zoom);
                ctx.lineTo(18 / view.zoom, 8 / view.zoom);
                ctx.lineTo(10 / view.zoom, 4 / view.zoom);
                ctx.stroke();
                ctx.restore();
            } else if (activeTool === 'Arc') {
                if (!drawing.arcStartPoint) {
                    const radius = Math.sqrt(Math.pow(drawing.current.x - drawing.start.x, 2) + Math.pow(drawing.current.y - drawing.start.y, 2));
                    drawTraditionalOrCADCircleOrArc(
                        drawing.start,
                        radius,
                        0,
                        Math.PI * 2,
                        previewMode,
                        previewColor,
                        previewWidth,
                        previewLineType,
                        true
                    );
                    ctx.save();
                    ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
                    ctx.lineWidth = 1 / view.zoom;
                    ctx.setLineDash([4 / view.zoom, 4 / view.zoom]);
                    ctx.beginPath();
                    ctx.moveTo(drawing.start.x, drawing.start.y);
                    ctx.lineTo(drawing.current.x, drawing.current.y);
                    ctx.stroke();
                    ctx.restore();
                } else {
                    const radius = Math.sqrt(Math.pow(drawing.arcStartPoint.x - drawing.start.x, 2) + Math.pow(drawing.arcStartPoint.y - drawing.start.y, 2));
                    let startAngle = Math.atan2(drawing.arcStartPoint.y - drawing.start.y, drawing.arcStartPoint.x - drawing.start.x) * 180 / Math.PI;
                    let endAngle = Math.atan2(drawing.current.y - drawing.start.y, drawing.current.x - drawing.start.x) * 180 / Math.PI;
                    
                    startAngle = (startAngle + 360) % 360;
                    endAngle = (endAngle + 360) % 360;

                    if (isShiftPressedRef.current) {
                        const temp = startAngle;
                        startAngle = endAngle;
                        endAngle = temp;
                    }

                    drawTraditionalOrCADCircleOrArc(
                        drawing.start,
                        radius,
                        startAngle * Math.PI / 180,
                        endAngle * Math.PI / 180,
                        previewMode,
                        previewColor,
                        previewWidth,
                        previewLineType,
                        previewDashed
                    );
                    ctx.save();
                    ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
                    ctx.lineWidth = 1 / view.zoom;
                    ctx.setLineDash([4 / view.zoom, 4 / view.zoom]);
                    ctx.beginPath();
                    ctx.moveTo(drawing.start.x, drawing.start.y);
                    ctx.lineTo(drawing.current.x, drawing.current.y);
                    ctx.stroke();
                    ctx.restore();
                }
            }

            if ((activeTool as string) === 'Filo') {
                ctx.save();
                const dx = drawing.current.x - drawing.start.x;
                const dy = drawing.current.y - drawing.start.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0.5) {
                    const vx = dx / len;
                    const vy = dy / len;
                    const px = -vy;
                    const py = vx;

                    // Draw start board
                    ctx.strokeStyle = '#854d0e';
                    ctx.lineWidth = 3 / view.zoom;
                    ctx.beginPath();
                    ctx.moveTo(drawing.start.x - px * 12 / view.zoom, drawing.start.y - py * 12 / view.zoom);
                    ctx.lineTo(drawing.start.x + px * 12 / view.zoom, drawing.start.y + py * 12 / view.zoom);
                    ctx.stroke();

                    ctx.strokeStyle = '#a16207';
                    ctx.lineWidth = 2.5 / view.zoom;
                    ctx.beginPath();
                    const stake1X = drawing.start.x - px * 8 / view.zoom;
                    const stake1Y = drawing.start.y - py * 8 / view.zoom;
                    ctx.moveTo(stake1X, stake1Y);
                    ctx.lineTo(stake1X - vx * 12 / view.zoom, stake1Y - vy * 12 / view.zoom);
                    const stake2X = drawing.start.x + px * 8 / view.zoom;
                    const stake2Y = drawing.start.y + py * 8 / view.zoom;
                    ctx.moveTo(stake2X, stake2Y);
                    ctx.lineTo(stake2X - vx * 12 / view.zoom, stake2Y - vy * 12 / view.zoom);
                    ctx.stroke();

                    ctx.fillStyle = defaultFiloColor || '#ff5500';
                    ctx.beginPath();
                    ctx.arc(drawing.start.x, drawing.start.y, 3 / view.zoom, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(drawing.start.x, drawing.start.y, 1 / view.zoom, 0, Math.PI * 2);
                    ctx.fill();

                    // Draw end board
                    ctx.strokeStyle = '#854d0e';
                    ctx.lineWidth = 3 / view.zoom;
                    ctx.beginPath();
                    ctx.moveTo(drawing.current.x - px * 12 / view.zoom, drawing.current.y - py * 12 / view.zoom);
                    ctx.lineTo(drawing.current.x + px * 12 / view.zoom, drawing.current.y + py * 12 / view.zoom);
                    ctx.stroke();

                    ctx.strokeStyle = '#a16207';
                    ctx.lineWidth = 2.5 / view.zoom;
                    ctx.beginPath();
                    const estake1X = drawing.current.x - px * 8 / view.zoom;
                    const estake1Y = drawing.current.y - py * 8 / view.zoom;
                    ctx.moveTo(estake1X, estake1Y);
                    ctx.lineTo(estake1X + vx * 12 / view.zoom, estake1Y + vy * 12 / view.zoom);
                    const estake2X = drawing.current.x + px * 8 / view.zoom;
                    const estake2Y = drawing.current.y + py * 8 / view.zoom;
                    ctx.moveTo(estake2X, estake2Y);
                    ctx.lineTo(estake2X + vx * 12 / view.zoom, estake2Y + vy * 12 / view.zoom);
                    ctx.stroke();

                    ctx.fillStyle = defaultFiloColor || '#ff5500';
                    ctx.beginPath();
                    ctx.arc(drawing.current.x, drawing.current.y, 3 / view.zoom, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(drawing.current.x, drawing.current.y, 1 / view.zoom, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }
        
        // Draw Pen indicator if wheel is active
        if (drawing.wheelLength !== undefined) {
             ctx.save();
             ctx.fillStyle = '#10b981';
             ctx.beginPath();
             ctx.arc(drawing.current.x, drawing.current.y, 6/view.zoom, 0, Math.PI*2);
             ctx.fill();
             ctx.restore();
        }
        ctx.setLineDash([]);

        if (true) { // Measurement tooltip runs for all
            // Real-time measurement tooltip with emerald color indicator when wheel is tuning
            const effectiveTooltipEnd = (activeTool === 'Line' && drawing.isTraditionalSegment && drawing.maxPoint)
                ? drawing.maxPoint
                : drawing.current;
            const tooltipDx = effectiveTooltipEnd.x - drawing.start.x;
            const tooltipDy = effectiveTooltipEnd.y - drawing.start.y;
            const tooltipLength = Math.sqrt(tooltipDx * tooltipDx + tooltipDy * tooltipDy);
            
            ctx.save();
            ctx.font = `bold ${17.5 / view.zoom}px monospace`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
        
        const formatPrecision = (val: number) => {
            const decimals = view.zoom >= 1.2 ? 3 : (view.zoom >= 0.45 ? 2 : (view.zoom >= 0.20 ? 1 : 0));
            return decimals === 0 ? `${Math.round(val)}` : val.toFixed(decimals).replace('.', ',');
        };

        let label = '';
        const isTypingDrawingLineOverride =
            liveNumericOverride?.kind === 'drawing_line' &&
            (Date.now() - liveNumericOverride.timestamp < 8000);
        if (activeTool === 'Line' || (activeTool as string) === 'Filo' || activeTool === 'Dimension') {
            label = isTypingDrawingLineOverride
                ? `L = ${liveNumericOverride.text.replace('.', ',')}▌ cm`
                : `L = ${formatPrecision(tooltipLength)} cm`;
        } else if (activeTool === 'Circle') {
            let currentR = tooltipLength;
            if (circleRadiusInputString) {
                const parsed = parseFloat(circleRadiusInputString.replace(',', '.'));
                if (!isNaN(parsed) && parsed > 0) {
                    currentR = parsed;
                }
            }
            const area = Math.PI * currentR * currentR;
            const formatArea = (a: number) => {
                if (a >= 10000) {
                    const m2 = (a / 10000).toFixed(2).replace('.', ',');
                    return `${m2} m²`;
                }
                const cm2 = (Math.round(a * 100) / 100).toString().replace('.', ',');
                return `${cm2} cm²`;
            };
            const rLabel = circleRadiusInputString ? `R = ${circleRadiusInputString}▌ cm` : `R = ${formatPrecision(tooltipLength)} cm`;
            label = `${rLabel}  |  Area = ${formatArea(area)}`;
        } else if (activeTool === 'Arc') {
            if (!drawing.arcStartPoint) {
                label = `R = ${formatPrecision(tooltipLength)} cm`;
            } else {
                let currentAngle = Math.atan2(drawing.current.y - drawing.start.y, drawing.current.x - drawing.start.x) * 180 / Math.PI;
                currentAngle = (currentAngle + 360) % 360;
                label = `A = ${formatPrecision(currentAngle)}°`;
            }
        } else if (activeTool === 'Rectangle') {
            const w = Math.abs(tooltipDx);
            const h = Math.abs(tooltipDy);
            label = `W: ${formatPrecision(w)} cm  H: ${formatPrecision(h)} cm`;
        }

        if (label) {
            let offsetX = 24;
            let offsetY = -38;

            const tooltipX = drawing.current.x + offsetX / view.zoom;
            const tooltipY = drawing.current.y + offsetY / view.zoom;
            
            const metrics = ctx.measureText(label);
            const padW = 12 / view.zoom;
            const bgW = metrics.width + padW * 2;
            const bgH = 31 / view.zoom;
            
            const isManualInputActive = Boolean(isTypingDrawingLineOverride || circleRadiusInputString || drawing.wheelLength !== undefined);
            ctx.fillStyle = isManualInputActive ? 'rgba(6, 78, 59, 0.96)' : 'rgba(15, 23, 42, 0.94)';
            ctx.beginPath();
            ctx.roundRect(tooltipX, tooltipY - bgH / 2, bgW, bgH, 7 / view.zoom);
            ctx.fill();
            
            ctx.strokeStyle = isManualInputActive ? '#34d399' : '#f59e0b';
            ctx.lineWidth = (isManualInputActive ? 2.4 : 2.0) / view.zoom;
            ctx.stroke();
            
            ctx.fillStyle = isManualInputActive ? '#a7f3d0' : '#fef08a';
            ctx.fillText(label, tooltipX + padW, tooltipY);
        }
        ctx.restore();
        
        if (!drawing.isFreehand) {
            
            if (activeTool === 'Line' && isKnownAngle) {
                ctx.save();
                ctx.fillStyle = '#15803d'; // Green text confirmation
                ctx.font = `bold ${12 / view.zoom}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                const midX = (drawing.start.x + drawing.current.x) / 2;
                const midY = (drawing.start.y + drawing.current.y) / 2;
                ctx.fillText(`${matchedAngle}°`, midX, midY - 6 / view.zoom);
                ctx.restore();
            }

            // --- TEMPLATE PREVIEW ---
        if ((activeTool as string) === 'Template' && selectedTemplateId && hoverSnap) {
            const template = TEMPLATES.find(t => t.id === selectedTemplateId);
            if (template) {
                ctx.save();
                const optLayerName = template.category === 'Arredi' ? 'BIM_Arredi' : (template.category === 'Bagno' ? 'BIM_Sanitari' : '0');
                const targetColor = optLayerName === 'BIM_Arredi' ? '#818cf8' : (optLayerName === 'BIM_Sanitari' ? '#10b981' : '#bbbbbb');
                ctx.strokeStyle = targetColor;
                ctx.lineWidth = defaultLineStyle.lineWidth / view.zoom;
                ctx.globalAlpha = 0.55;
                
                const basePos = hoverSnap.point;
                
                template.entities.forEach(te => {
                    ctx.beginPath();
                    if (te.type === 'line') {
                        ctx.moveTo(basePos.x + te.start.x, basePos.y + te.start.y);
                        ctx.lineTo(basePos.x + te.end.x, basePos.y + te.end.y);
                    } else if (te.type === 'circle') {
                        ctx.arc(basePos.x + te.center.x, basePos.y + te.center.y, te.radius, 0, Math.PI * 2);
                    } else if (te.type === 'arc') {
                        ctx.arc(basePos.x + te.center.x, basePos.y + te.center.y, te.radius, te.startAngle * Math.PI / 180, te.endAngle * Math.PI / 180);
                    }
                    ctx.stroke();
                });
                ctx.restore();
            }
        }

        // --- BIM SYMBOL PREVIEW ---
        if ((activeTool as string) === 'BIM_Symbol' && selectedBIMSymbolType) {
            const isElectrical = ['punto_luce', 'presa_standard', 'presa_schuko', 'presa_tv', 'presa_dati', 'interruttore', 'interruttore_bipolare', 'deviatore', 'invertitore', 'pulsante', 'pulsante_tirante', 'quadro', 'scatola_derivazione', 'suoneria', 'ronzatore', 'termostato', 'faretto', 'lampada_emergenza', 'applique', 'citofono', 'videocitofono'].includes(selectedBIMSymbolType);
            const targetColor = '#334155'; // Using Slate 700 for a clean, consistent UI tone for all symbols
            
            ctx.save();
            ctx.strokeStyle = targetColor;
            ctx.lineWidth = 0.8 / view.zoom; // Thin, solid line
            ctx.globalAlpha = 0.85;
            
            const basePos = hoverSnap ? hoverSnap.point : actualMousePosRef.current;
            const geomList = getBIMSymbolEntities(selectedBIMSymbolType, bimSymbolScale || 1);
            
            geomList.forEach(te => {
                ctx.beginPath();
                if (te.type === 'line' && te.start && te.end) {
                    ctx.moveTo(basePos.x + te.start.x, basePos.y + te.start.y);
                    ctx.lineTo(basePos.x + te.end.x, basePos.y + te.end.y);
                    ctx.stroke();
                } else if (te.type === 'circle' && te.center && te.radius) {
                    ctx.arc(basePos.x + te.center.x, basePos.y + te.center.y, te.radius, 0, Math.PI * 2);
                    ctx.stroke();
                } else if (te.type === 'arc' && te.center && te.radius) {
                    ctx.arc(basePos.x + te.center.x, basePos.y + te.center.y, te.radius, (te.startAngle || 0) * Math.PI / 180, (te.endAngle || 0) * Math.PI / 180);
                    ctx.stroke();
                } else if (te.type === 'text' && te.center && te.text) {
                    ctx.font = `bold ${8 / view.zoom}px Courier New`;
                    ctx.fillStyle = targetColor;
                    ctx.textAlign = 'center';
                    ctx.fillText(te.text, basePos.x + te.center.x, basePos.y + te.center.y);
                }
            });
            ctx.restore();
        }
        } // closes if (!drawing.isFreehand)

        // Render snap indicator
        if (drawing.snapType === 'smart') {
            const currentSnaps = getSnapPoints(drawing.current!, entities, activeTool, drawing as any);
            const activeSnap = currentSnaps.find(s => 
                Math.abs(s.point.x - drawing.current.x) < 0.01 && Math.abs(s.point.y - drawing.current.y) < 0.01
            );
            if (activeSnap?.refEntityId) {
                const refEnt = entities.find(e => e.id === activeSnap.refEntityId);
                if (refEnt && refEnt.type === 'line') {
                    const l = refEnt as LineEntity;
                    ctx.save();
                    ctx.strokeStyle = '#22c55e';
                    ctx.lineWidth = 4 / view.zoom;
                    ctx.beginPath();
                    ctx.moveTo(l.start.x, l.start.y);
                    ctx.lineTo(l.end.x, l.end.y);
                    ctx.stroke();

                    // Trajectory guide
                    ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
                    ctx.lineWidth = 1 / view.zoom;
                    ctx.beginPath();
                    ctx.moveTo(activeSnap.refPoint!.x, activeSnap.refPoint!.y);
                    ctx.lineTo(drawing.current.x, drawing.current.y);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }

        if (drawing.snapType !== undefined) {
            ctx.strokeStyle = drawing.snapType === 'smart' ? '#22c55e' : '#3b82f6';
            ctx.lineWidth = 2 / view.zoom;
            ctx.beginPath();
            ctx.rect(drawing.current.x - 5/view.zoom, drawing.current.y - 5/view.zoom, 10/view.zoom, 10/view.zoom);
            ctx.stroke();
        }
        
        if (drawing.snapType === 'smart') {
            const anchorPointsToDraw: { ref: Point, constraint?: 'x' | 'y' }[] = [];
            if (drawing.refPoint) {
              anchorPointsToDraw.push({ ref: drawing.refPoint, constraint: drawing.constraintAxis });
            }
            if (drawing.hasDoubleSmart && drawing.refPoint2) {
              anchorPointsToDraw.push({ ref: drawing.refPoint2, constraint: drawing.constraintAxis2 });
            }

            anchorPointsToDraw.forEach(anchor => {
                const refPt = anchor.ref;
                if (!isPointInViewport(refPt, 50)) return;
                ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
                ctx.strokeStyle = '#22c55e'; // Emerald green dashed tracking/extension lines
                ctx.lineWidth = 1.2 / view.zoom;
                ctx.beginPath();
                ctx.moveTo(drawing.current.x, drawing.current.y);
                ctx.lineTo(refPt.x, refPt.y);
                ctx.stroke();
                ctx.setLineDash([]);

                // Calculate direction angle of tracking line
                const dx = drawing.current.x - refPt.x;
                const dy = drawing.current.y - refPt.y;
                let ang = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
                ang = (ang + 360) % 180; // Keep it in 0-180 range

                // Display alignment angle text badge
                ctx.save();
                ctx.fillStyle = '#15803d';
                ctx.font = `bold ${10 / view.zoom}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                // Position near the offset of tracking line
                const midX = (drawing.current.x + refPt.x) / 2;
                const midY = (drawing.current.y + refPt.y) / 2;
                
                // Draw a subtle background for text readability
                const txt = `${ang}°`;
                const metrics = ctx.measureText(txt);
                const bgW = metrics.width + 8 / view.zoom;
                const bgH = 14 / view.zoom;
                ctx.fillStyle = 'rgba(240, 253, 244, 0.95)'; // emerald-50 with high opacity for readability
                ctx.strokeStyle = '#bbf7d0'; // emerald-200
                ctx.lineWidth = 1 / view.zoom;
                ctx.beginPath();
                ctx.roundRect(midX - bgW / 2, midY - bgH / 2, bgW, bgH, 3 / view.zoom);
                ctx.fill();
                ctx.stroke();
                
                ctx.fillStyle = '#15803d'; // emerald-700
                ctx.fillText(txt, midX, midY + 0.5 / view.zoom);
                ctx.restore();

                // Highlight the distant point (the anchor point we are aligned with) while drawing
                ctx.fillStyle = '#22c55e';
                ctx.strokeStyle = '#15803d';
                ctx.lineWidth = 1.5 / view.zoom;
                
                // Draw filled inner circle
                ctx.beginPath();
                ctx.arc(refPt.x, refPt.y, 4 / view.zoom, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Draw outer target ring indicator
                ctx.beginPath();
                ctx.arc(refPt.x, refPt.y, 8 / view.zoom, 0, Math.PI * 2);
                ctx.stroke();
            });
        }
        } // closes if (true)
        
        // Draw snap indicator for freehand drawing
        if (drawing.isFreehand && drawing.snapType !== undefined) {
            ctx.strokeStyle = drawing.snapType === 'smart' ? '#22c55e' : '#3b82f6';
            ctx.lineWidth = 2 / view.zoom;
            ctx.beginPath();
            ctx.rect(drawing.current.x - 5/view.zoom, drawing.current.y - 5/view.zoom, 10/view.zoom, 10/view.zoom);
            ctx.stroke();
        }
        // Render Equal Length Smart Snap visual indicator & badge
        if (isSnapActive()) {
          const activeEqualSnap = (drawing && drawing.snapSubtype === 'equal_length') ? drawing : (hoverSnap && hoverSnap.subtype === 'equal_length' ? hoverSnap : null);
          if (activeEqualSnap) {
            const refSeg = (activeEqualSnap as any).refSegment || lastSegmentRef.current;
            const snapPt = (activeEqualSnap as any).current || (activeEqualSnap as any).point;
            if (refSeg && refSeg.start && refSeg.end) {
              ctx.save();
              // 1. Highlight reference segment in emerald green
              ctx.strokeStyle = '#10b981';
              ctx.lineWidth = 3.5 / view.zoom;
              ctx.beginPath();
              ctx.moveTo(refSeg.start.x, refSeg.start.y);
              ctx.lineTo(refSeg.end.x, refSeg.end.y);
              ctx.stroke();

              // Hash marks on reference segment
              const midRef = { x: (refSeg.start.x + refSeg.end.x) / 2, y: (refSeg.start.y + refSeg.end.y) / 2 };
              const dxR = refSeg.end.x - refSeg.start.x;
              const dyR = refSeg.end.y - refSeg.start.y;
              const lenR = Math.hypot(dxR, dyR);
              if (lenR > 0.001) {
                const nxR = -dyR / lenR;
                const nyR = dxR / lenR;
                const tickH = 6 / view.zoom;
                const tickOff = 3 / view.zoom;
                ctx.strokeStyle = '#059669';
                ctx.lineWidth = 2.2 / view.zoom;
                ctx.beginPath();
                ctx.moveTo(midRef.x - tickOff * (dxR / lenR) + nxR * tickH, midRef.y - tickOff * (dyR / lenR) + nyR * tickH);
                ctx.lineTo(midRef.x - tickOff * (dxR / lenR) - nxR * tickH, midRef.y - tickOff * (dyR / lenR) - nyR * tickH);
                ctx.moveTo(midRef.x + tickOff * (dxR / lenR) + nxR * tickH, midRef.y + tickOff * (dyR / lenR) + nyR * tickH);
                ctx.lineTo(midRef.x + tickOff * (dxR / lenR) - nxR * tickH, midRef.y + tickOff * (dyR / lenR) - nyR * tickH);
                ctx.stroke();
              }

              // Hash marks on current active drawing segment
              if (drawing && drawing.start) {
                const midCur = { x: (drawing.start.x + snapPt.x) / 2, y: (drawing.start.y + snapPt.y) / 2 };
                const dxC = snapPt.x - drawing.start.x;
                const dyC = snapPt.y - drawing.start.y;
                const lenC = Math.hypot(dxC, dyC);
                if (lenC > 0.001) {
                  const nxC = -dyC / lenC;
                  const nyC = dxC / lenC;
                  const tickH = 6 / view.zoom;
                  const tickOff = 3 / view.zoom;
                  ctx.strokeStyle = '#059669';
                  ctx.lineWidth = 2.2 / view.zoom;
                  ctx.beginPath();
                  ctx.moveTo(midCur.x - tickOff * (dxC / lenC) + nxC * tickH, midCur.y - tickOff * (dyC / lenC) + nyC * tickH);
                  ctx.lineTo(midCur.x - tickOff * (dxC / lenC) - nxC * tickH, midCur.y - tickOff * (dyC / lenC) - nyC * tickH);
                  ctx.moveTo(midCur.x + tickOff * (dxC / lenC) + nxC * tickH, midCur.y + tickOff * (dyC / lenC) + nyC * tickH);
                  ctx.lineTo(midCur.x + tickOff * (dxC / lenC) - nxC * tickH, midCur.y + tickOff * (dyC / lenC) - nyC * tickH);
                  ctx.stroke();
                }
              }

              // Clean transparent text placed right at the center of the highlighted reference segment
              const displayLen = (activeEqualSnap as any).refLength || refSeg.length;
              const valTxt = `= ${displayLen.toFixed(1)} cm`;
              ctx.font = `bold ${Math.max(10, 11 / view.zoom)}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
              ctx.shadowBlur = 4 / view.zoom;
              ctx.fillStyle = '#ecfdf5';
              ctx.fillText(valTxt, midRef.x, midRef.y);
              ctx.shadowBlur = 0;

              ctx.restore();
            }
          }
        }

        // Render Equal Radius Smart Snap visual indicator & badge
        const activeEqualRadiusSnap = (drawing && drawing.snapSubtype === 'equal_radius') ? drawing : (hoverSnap && hoverSnap.subtype === 'equal_radius' ? hoverSnap : null);
        if (activeEqualRadiusSnap && drawing && drawing.start) {
          const snapPt = (activeEqualRadiusSnap as any).current || (activeEqualRadiusSnap as any).point;
          const refRad = (activeEqualRadiusSnap as any).refRadius || (activeEqualRadiusSnap as any).refLength || lastCircleRadiusRef.current;
          if (refRad && refRad > 0.01) {
            ctx.save();
            const centerPt = drawing.start;
            
            // 1. Highlight reference circle in entities if present
            const refEntId = (activeEqualRadiusSnap as any).refEntityId;
            if (refEntId) {
              const refEnt = entities.find(e => e.id === refEntId);
              if (refEnt && (refEnt.type === 'circle' || refEnt.type === 'arc')) {
                const c = (refEnt as any).center;
                const r = (refEnt as any).radius;
                ctx.strokeStyle = '#10b981';
                ctx.lineWidth = 3.5 / view.zoom;
                ctx.beginPath();
                ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
                ctx.stroke();
              }
            }

            // 2. Dashed guide circle showing the snapped radius equal to previous circle
            ctx.setLineDash([6 / view.zoom, 4 / view.zoom]);
            ctx.strokeStyle = '#10b981'; // emerald green
            ctx.lineWidth = 2 / view.zoom;
            ctx.beginPath();
            ctx.arc(centerPt.x, centerPt.y, refRad, 0, Math.PI * 2);
            ctx.stroke();

            // 3. Radius ray from center to snap point
            ctx.setLineDash([4 / view.zoom, 3 / view.zoom]);
            ctx.strokeStyle = '#059669';
            ctx.lineWidth = 1.5 / view.zoom;
            ctx.beginPath();
            ctx.moveTo(centerPt.x, centerPt.y);
            ctx.lineTo(snapPt.x, snapPt.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // 4. Equal Radius snap badge box at snap point
            const boxSz = 9 / view.zoom;
            ctx.fillStyle = '#10b981';
            ctx.strokeStyle = '#047857';
            ctx.lineWidth = 1.8 / view.zoom;
            ctx.beginPath();
            ctx.roundRect(snapPt.x - boxSz, snapPt.y - boxSz, boxSz * 2, boxSz * 2, 3 / view.zoom);
            ctx.fill();
            ctx.stroke();

            // '=' symbol inside box
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.max(10, 11 / view.zoom)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('=', snapPt.x, snapPt.y);

            // Value badge label (e.g. "= R 50.0 cm")
            const valTxt = `= R ${refRad.toFixed(1)} cm`;
            ctx.font = `bold ${Math.max(9, 10 / view.zoom)}px sans-serif`;
            const metrics = ctx.measureText(valTxt);
            const bgW = metrics.width + 10 / view.zoom;
            const bgH = 16 / view.zoom;
            const badgeX = snapPt.x + 16 / view.zoom;
            const badgeY = snapPt.y - 12 / view.zoom;

            ctx.fillStyle = '#064e3b';
            ctx.strokeStyle = '#34d399';
            ctx.lineWidth = 1 / view.zoom;
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY - bgH / 2, bgW, bgH, 4 / view.zoom);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ecfdf5';
            ctx.textAlign = 'left';
            ctx.fillText(valTxt, badgeX + 5 / view.zoom, badgeY + 0.5 / view.zoom);

            ctx.restore();
          }
        }
      } // closes if (drawing)

      // Suggerimento visivo della linea parallela ad offset precedente durante il puntamento o il tracciamento (Line / Filo / Muro)
      // (Compare SOLO se l'utente ha cliccato sul pulsante Offset)
      if (isOffsetAidActiveRef.current && ['Line', 'Filo', 'Muro', 'BIM_Muro'].includes(activeTool)) {
          const refD = getEffectiveLastParallelOffset(projectedEntities);
          if (refD > 0.05) {
              const probePt = (drawing && drawing.current)
                  ? ((activeTool === 'Line' && drawing.isTraditionalSegment && drawing.maxPoint) ? drawing.maxPoint : drawing.current)
                  : (hoverSnap && hoverSnap.snapped ? hoverSnap.point : actualMousePosRef.current);
              const suggestTol = 38 / view.zoom;
              const spanMargin = Math.max(80, 120 / view.zoom);

              let bestRefLine: LineEntity | null = null;
              let bestDiff = Infinity;
              let bestSignedD = 0;
              let bestProj = 0;
              let bestOLen = 0;

              for (const ent of projectedEntities) {
                  if (ent.type !== 'line' || (ent as any).isSimmetryAxis || (ent as any).hideIn2D) continue;
                  const oLine = ent as LineEntity;
                  const odx = oLine.end.x - oLine.start.x;
                  const ody = oLine.end.y - oLine.start.y;
                  const oLen = Math.hypot(odx, ody);
                  if (oLen < 0.5) continue;
                  const tx = odx / oLen;
                  const ty = ody / oLen;
                  const nx = -ty;
                  const ny = tx;

                  const sD = (probePt.x - oLine.start.x) * nx + (probePt.y - oLine.start.y) * ny;
                  const pD = Math.abs(sD);
                  const diff = Math.abs(pD - refD);
                  if (diff > suggestTol) continue;

                  const proj = (probePt.x - oLine.start.x) * tx + (probePt.y - oLine.start.y) * ty;
                  if (proj < -spanMargin || proj > oLen + spanMargin) continue;

                  if (drawing && drawing.start) {
                      const startSD = (drawing.start.x - oLine.start.x) * nx + (drawing.start.y - oLine.start.y) * ny;
                      const startPD = Math.abs(startSD);
                      const isStartNearOffset = Math.abs(startPD - refD) < suggestTol && (startSD * sD >= 0);
                      const isStartOnLine = startPD < 2.0;
                      if (!isStartNearOffset && !isStartOnLine) continue;
                  }

                  if (diff < bestDiff) {
                      bestDiff = diff;
                      bestRefLine = oLine;
                      bestSignedD = sD;
                      bestProj = proj;
                      bestOLen = oLen;
                  }
              }

              if (bestRefLine) {
                  const odx = bestRefLine.end.x - bestRefLine.start.x;
                  const ody = bestRefLine.end.y - bestRefLine.start.y;
                  const tx = odx / bestOLen;
                  const ty = ody / bestOLen;
                  const nx = -ty;
                  const ny = tx;
                  const sideSign = bestSignedD >= 0 ? 1 : -1;
                  const currentPerpD = Math.abs(bestSignedD);
                  const isSnappedToEqualOffset = Math.abs(currentPerpD - refD) < 0.08;

                  const shiftX = nx * sideSign * refD;
                  const shiftY = ny * sideSign * refD;
                  const gStart = { x: bestRefLine.start.x + shiftX, y: bestRefLine.start.y + shiftY };
                  const gEnd = { x: bestRefLine.end.x + shiftX, y: bestRefLine.end.y + shiftY };

                  ctx.save();
                  // 1. Linee tratteggiate di allineamento degli estremi tra la linea madre e la guida di offset
                  ctx.strokeStyle = 'rgba(16, 185, 129, 0.38)';
                  ctx.lineWidth = 1.1 / view.zoom;
                  ctx.setLineDash([3 / view.zoom, 3 / view.zoom]);
                  ctx.beginPath();
                  ctx.moveTo(bestRefLine.start.x, bestRefLine.start.y);
                  ctx.lineTo(gStart.x, gStart.y);
                  ctx.moveTo(bestRefLine.end.x, bestRefLine.end.y);
                  ctx.lineTo(gEnd.x, gEnd.y);
                  ctx.stroke();

                  // 2. Linea guida parallela all'offset precedente
                  ctx.strokeStyle = isSnappedToEqualOffset ? '#10b981' : 'rgba(16, 185, 129, 0.85)';
                  ctx.lineWidth = (isSnappedToEqualOffset ? 2.6 : 1.8) / view.zoom;
                  ctx.setLineDash([8 / view.zoom, 5 / view.zoom]);
                  ctx.beginPath();
                  ctx.moveTo(gStart.x, gStart.y);
                  ctx.lineTo(gEnd.x, gEnd.y);
                  ctx.stroke();

                  // Estremi della guida parallela
                  ctx.setLineDash([]);
                  ctx.fillStyle = '#10b981';
                  ctx.beginPath();
                  ctx.arc(gStart.x, gStart.y, 3.5 / view.zoom, 0, Math.PI * 2);
                  ctx.arc(gEnd.x, gEnd.y, 3.5 / view.zoom, 0, Math.PI * 2);
                  ctx.fill();

                  // 3. Connettore di quota perpendicolare tra la linea madre e il puntatore / segmento tracciato
                  const clampedProj = Math.max(0, Math.min(bestOLen, bestProj));
                  const pOnRef = {
                      x: bestRefLine.start.x + tx * clampedProj,
                      y: bestRefLine.start.y + ty * clampedProj
                  };
                  const pOnTarget = {
                      x: pOnRef.x + nx * sideSign * currentPerpD,
                      y: pOnRef.y + ny * sideSign * currentPerpD
                  };
                  ctx.strokeStyle = isSnappedToEqualOffset ? '#10b981' : '#f59e0b';
                  ctx.lineWidth = 1.6 / view.zoom;
                  ctx.setLineDash([4 / view.zoom, 3 / view.zoom]);
                  ctx.beginPath();
                  ctx.moveTo(pOnRef.x, pOnRef.y);
                  ctx.lineTo(pOnTarget.x, pOnTarget.y);
                  ctx.stroke();
                  ctx.setLineDash([]);

                  // 4. Etichetta del suggerimento di offset precedente
                  const zoomDecimals = view.zoom >= 1.2 ? 2 : (view.zoom >= 0.35 ? 1 : 0);
                  const refFormatted = zoomDecimals === 0
                      ? `${Math.round(refD)}`
                      : refD.toFixed(zoomDecimals).replace('.', ',');
                  const curFormatted = zoomDecimals === 0
                      ? `${Math.round(currentPerpD)}`
                      : currentPerpD.toFixed(zoomDecimals).replace('.', ',');
                  const refTag = isSnappedToEqualOffset
                      ? `= ${refFormatted} cm (Offset uguale)`
                      : `Rif. ${refFormatted} cm (d = ${curFormatted} cm)`;

                  const midConnX = (pOnRef.x + pOnTarget.x) / 2;
                  const midConnY = (pOnRef.y + pOnTarget.y) / 2;
                  ctx.font = `bold ${13 / view.zoom}px monospace`;
                  const rW = ctx.measureText(refTag).width + 16 / view.zoom;
                  const rH = 22 / view.zoom;

                  ctx.fillStyle = isSnappedToEqualOffset ? 'rgba(6, 78, 59, 0.96)' : 'rgba(15, 23, 42, 0.92)';
                  ctx.strokeStyle = isSnappedToEqualOffset ? '#10b981' : '#f59e0b';
                  ctx.lineWidth = 1.8 / view.zoom;
                  ctx.beginPath();
                  ctx.roundRect(midConnX - rW / 2, midConnY - rH / 2, rW, rH, 5 / view.zoom);
                  ctx.fill();
                  ctx.stroke();

                  ctx.fillStyle = isSnappedToEqualOffset ? '#6ee7b7' : '#fef08a';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(refTag, midConnX, midConnY);
                  ctx.restore();
              }
          }
      }

      const isFreehandMode = activeTool === 'Line' && (defaultLineStyle.mode === 'pencil' || defaultLineStyle.mode === 'ink');

      // Render hover snap indicator
      if (hoverSnap && hoverSnap.snapped && isPointInViewport(hoverSnap.point, 50)) {
        if (hoverSnap.type === 'smart' && hoverSnap.refEntityId) {
            const refEnt = entities.find(e => e.id === hoverSnap.refEntityId);
            if (refEnt && refEnt.type === 'line') {
                const l = refEnt as LineEntity;
                ctx.save();
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 4 / view.zoom;
                ctx.beginPath();
                ctx.moveTo(l.start.x, l.start.y);
                ctx.lineTo(l.end.x, l.end.y);
                ctx.stroke();
                ctx.restore();
            }
        }

        if (hoverSnap.type === 'smart') {
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2.1 / view.zoom;
            ctx.beginPath();
            ctx.rect(hoverSnap.point.x - 5.25/view.zoom, hoverSnap.point.y - 5.25/view.zoom, 10.5/view.zoom, 10.5/view.zoom);
            ctx.stroke();
        } else if (hoverSnap.subtype === 'endpoint') {
            ctx.save();
            ctx.strokeStyle = '#16a34a'; // Emerald green
            ctx.lineWidth = 3 / view.zoom;
            const sz = 6.3 / view.zoom;
            ctx.beginPath();
            ctx.rect(hoverSnap.point.x - sz, hoverSnap.point.y - sz, sz * 2, sz * 2);
            ctx.stroke();
            ctx.restore();
        } else if (hoverSnap.subtype === 'midpoint') {
            ctx.save();
            ctx.strokeStyle = '#16a34a'; // Emerald green
            ctx.lineWidth = 3 / view.zoom;
            const sz = 6.3 / view.zoom;
            ctx.beginPath();
            ctx.moveTo(hoverSnap.point.x, hoverSnap.point.y - sz * 1.15);
            ctx.lineTo(hoverSnap.point.x - sz * 1.15, hoverSnap.point.y + sz * 0.85);
            ctx.lineTo(hoverSnap.point.x + sz * 1.15, hoverSnap.point.y + sz * 0.85);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
        } else if (hoverSnap.subtype === 'intersection') {
            ctx.save();
            ctx.strokeStyle = '#16a34a'; // Emerald green
            ctx.lineWidth = 3 / view.zoom;
            const sz = 6.3 / view.zoom;
            
            // Draw a green square
            ctx.beginPath();
            ctx.rect(hoverSnap.point.x - sz, hoverSnap.point.y - sz, sz * 2, sz * 2);
            ctx.stroke();
            
            // Draw green X inside
            ctx.beginPath();
            ctx.moveTo(hoverSnap.point.x - sz, hoverSnap.point.y - sz);
            ctx.lineTo(hoverSnap.point.x + sz, hoverSnap.point.y + sz);
            ctx.moveTo(hoverSnap.point.x - sz, hoverSnap.point.y + sz);
            ctx.lineTo(hoverSnap.point.x + sz, hoverSnap.point.y - sz);
            ctx.stroke();
            ctx.restore();
        } else if (hoverSnap.subtype === 'center') {
            ctx.save();
            ctx.strokeStyle = '#16a34a'; // Emerald green
            ctx.lineWidth = 3 / view.zoom;
            const sz = 5.8 / view.zoom;
            ctx.beginPath();
            ctx.arc(hoverSnap.point.x, hoverSnap.point.y, sz, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(hoverSnap.point.x - 2.1/view.zoom, hoverSnap.point.y);
            ctx.lineTo(hoverSnap.point.x + 2.1/view.zoom, hoverSnap.point.y);
            ctx.moveTo(hoverSnap.point.x, hoverSnap.point.y - 2.1/view.zoom);
            ctx.lineTo(hoverSnap.point.x, hoverSnap.point.y - 2.1/view.zoom);
            ctx.stroke();
            ctx.restore();
        } else if (hoverSnap.subtype === 'quadrant') {
            ctx.save();
            ctx.strokeStyle = '#16a34a'; // Emerald green
            ctx.lineWidth = 3 / view.zoom;
            const sz = 6.8 / view.zoom;
            ctx.beginPath();
            ctx.moveTo(hoverSnap.point.x, hoverSnap.point.y - sz);
            ctx.lineTo(hoverSnap.point.x + sz, hoverSnap.point.y);
            ctx.lineTo(hoverSnap.point.x, hoverSnap.point.y + sz);
            ctx.lineTo(hoverSnap.point.x - sz, hoverSnap.point.y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
        } else if (hoverSnap.subtype === 'tangent') {
            ctx.save();
            ctx.strokeStyle = '#16a34a';
            ctx.lineWidth = 3 / view.zoom;
            const sz = 6.3 / view.zoom;
            ctx.beginPath();
            ctx.arc(hoverSnap.point.x, hoverSnap.point.y, sz, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(hoverSnap.point.x - sz * 1.5, hoverSnap.point.y - sz);
            ctx.lineTo(hoverSnap.point.x + sz * 1.5, hoverSnap.point.y - sz);
            ctx.stroke();
            ctx.restore();
        } else if (hoverSnap.subtype === 'parallel_offset' || hoverSnap.subtype === 'parallel_offset_end') {
            ctx.save();
            ctx.strokeStyle = '#10b981';
            ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
            ctx.lineWidth = 2.8 / view.zoom;
            const sz = 6.5 / view.zoom;
            ctx.beginPath();
            ctx.arc(hoverSnap.point.x, hoverSnap.point.y, sz, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        } else if (isSnapActive() && (hoverSnap?.subtype === 'input' || drawing?.snapSubtype === 'input') && drawing && drawing.start) {
            ctx.save();
            const activeStart = drawing.start;
            const activeEnd = (drawing && drawing.snapSubtype === 'input') ? (drawing.current || drawing.start) : (hoverSnap?.point || drawing.start);
            const rawVal = lastInsertedParameter ? lastInsertedParameter.value : 1;
            const refLen = (drawing && drawing.snapSubtype === 'input') ? (drawing.refLength || (rawVal < 50 ? rawVal * 100 : rawVal)) : (hoverSnap?.refLength || (rawVal < 50 ? rawVal * 100 : rawVal));
            ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
            ctx.strokeStyle = 'rgba(139, 92, 246, 0.8)';
            ctx.lineWidth = 1.2 / view.zoom;
            ctx.beginPath();
            ctx.arc(activeStart.x, activeStart.y, refLen, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        } else if (isSnapActive() && hoverSnap.subtype === 'equal_length' && hoverSnap.refSegment && drawing && drawing.start) {
            ctx.save();
            const goldColor = '#f59e0b';
            const goldLight = '#fbbf24';

            const activeStart = drawing.start;
            const activeEnd = hoverSnap.point;
            const refSeg = hoverSnap.refSegment;
            const refLen = hoverSnap.refLength || Math.hypot(activeEnd.x - activeStart.x, activeEnd.y - activeStart.y);

            // 1. Draw dashed golden radius constraint circle/arc centered at drawing.start
            ctx.save();
            ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
            ctx.lineWidth = 1.2 / view.zoom;
            ctx.beginPath();
            ctx.arc(activeStart.x, activeStart.y, refLen, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // Helper to draw double congruence hash tick marks (⫽ ⫽)
            const drawDoubleHashTicks = (p1: Point, p2: Point) => {
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.hypot(dx, dy);
                if (len < 0.001) return;

                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                const ux = dx / len;
                const uy = dy / len;
                const nx = -uy;
                const ny = ux;

                const tickH = 7.5 / view.zoom;
                const tickGap = 2.5 / view.zoom;

                const h1X = midX - ux * tickGap;
                const h1Y = midY - uy * tickGap;
                const h2X = midX + ux * tickGap;
                const h2Y = midY + uy * tickGap;

                // Dark outline for contrast
                ctx.strokeStyle = '#451a03';
                ctx.lineWidth = 3.6 / view.zoom;
                ctx.beginPath();
                ctx.moveTo(h1X - nx * tickH, h1Y - ny * tickH);
                ctx.lineTo(h1X + nx * tickH, h1Y + ny * tickH);
                ctx.moveTo(h2X - nx * tickH, h2Y - ny * tickH);
                ctx.lineTo(h2X + nx * tickH, h2Y + ny * tickH);
                ctx.stroke();

                // Inner bright gold hashes
                ctx.strokeStyle = goldLight;
                ctx.lineWidth = 2.0 / view.zoom;
                ctx.beginPath();
                ctx.moveTo(h1X - nx * tickH, h1Y - ny * tickH);
                ctx.lineTo(h1X + nx * tickH, h1Y + ny * tickH);
                ctx.moveTo(h2X - nx * tickH, h2Y - ny * tickH);
                ctx.lineTo(h2X + nx * tickH, h2Y + ny * tickH);
                ctx.stroke();
            };

            // 2. Draw double hash tick marks on active segment & reference segment
            drawDoubleHashTicks(activeStart, activeEnd);
            drawDoubleHashTicks(refSeg.start, refSeg.end);

            // 3. Highlight reference segment with a golden glow
            ctx.save();
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
            ctx.lineWidth = 4 / view.zoom;
            ctx.beginPath();
            ctx.moveTo(refSeg.start.x, refSeg.start.y);
            ctx.lineTo(refSeg.end.x, refSeg.end.y);
            ctx.stroke();
            ctx.restore();

            // 4. Clean transparent text placed right at the center of the highlighted reference segment (midRef)
            const midRef = { x: (refSeg.start.x + refSeg.end.x) / 2, y: (refSeg.start.y + refSeg.end.y) / 2 };
            const valTxt = `= ${refLen.toFixed(1)} cm`;
            ctx.font = `bold ${Math.max(10, 11 / view.zoom)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 4 / view.zoom;
            ctx.fillStyle = '#fef3c7';
            ctx.fillText(valTxt, midRef.x, midRef.y);
            ctx.shadowBlur = 0;

            ctx.restore();
        } else if (hoverSnap.subtype === 'perpendicular') {
            ctx.save();
            ctx.strokeStyle = '#16a34a';
            ctx.lineWidth = 3 / view.zoom;
            const sz = 6.3 / view.zoom;
            ctx.beginPath();
            ctx.moveTo(hoverSnap.point.x - sz, hoverSnap.point.y + sz);
            ctx.lineTo(hoverSnap.point.x + sz, hoverSnap.point.y + sz);
            ctx.lineTo(hoverSnap.point.x + sz, hoverSnap.point.y - sz);
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.save();
            ctx.strokeStyle = '#2563eb'; // Pure blue for snap
            ctx.lineWidth = 3 / view.zoom;
            const sz = 6.3 / view.zoom;
            
            // Draw square
            ctx.beginPath();
            ctx.rect(hoverSnap.point.x - sz, hoverSnap.point.y - sz, sz * 2, sz * 2);
            ctx.stroke();
 
            // Draw a dot in the middle
            ctx.fillStyle = '#2563eb';
            ctx.beginPath();
            ctx.arc(hoverSnap.point.x, hoverSnap.point.y, 1.9 / view.zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Render tooltip dialog bubble ("finestra di dialogo")
        ctx.save();
        const labelMap: Record<string, string> = {
            endpoint: 'Fine',
            midpoint: 'Mezzeria',
            center: 'Centro',
            quadrant: 'Quadrante',
            intersection: 'Intersezione',
            tangent: 'Tangente',
            perpendicular: 'Perpendicolare',
            smart: 'Allineamento',
            equal_length: '⚡ Lunghezza Uguale',
            input: 'Snap input'
        };
        const label = labelMap[hoverSnap.subtype || ''] || hoverSnap.subtype || 'Snap';
        ctx.font = `${14 / view.zoom}px sans-serif`;
        const textMetrics = ctx.measureText(label);
        const paddingX = 9 / view.zoom;
        const boxWidth = textMetrics.width + paddingX * 2;
        const boxHeight = 22 / view.zoom;
        const boxX = hoverSnap.point.x - boxWidth / 2;
        const boxY = hoverSnap.point.y - 27 / view.zoom - boxHeight;

        ctx.fillStyle = hoverSnap.subtype === 'equal_length' ? 'rgba(30, 27, 75, 0.95)' : hoverSnap.subtype === 'input' ? 'rgba(76, 29, 149, 0.95)' : 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = hoverSnap.subtype === 'equal_length' ? '#f59e0b' : hoverSnap.subtype === 'input' ? '#8b5cf6' : '#10b981';
        ctx.lineWidth = 1 / view.zoom;
        ctx.beginPath();
        const r = 3 / view.zoom;
        if (ctx.roundRect) {
            ctx.roundRect(boxX, boxY, boxWidth, boxHeight, r);
        } else {
            ctx.rect(boxX, boxY, boxWidth, boxHeight);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, hoverSnap.point.x, boxY + boxHeight / 2);
        ctx.restore();

        if (hoverSnap.type === 'smart') {
            const hoverAnchorsToDraw: { ref: Point, constraint?: 'x' | 'y' }[] = [];
            if (hoverSnap.refPoint) {
              hoverAnchorsToDraw.push({ ref: hoverSnap.refPoint, constraint: hoverSnap.constraintAxis });
            }
            if (hoverSnap.hasDoubleSmart && hoverSnap.refPoint2) {
              hoverAnchorsToDraw.push({ ref: hoverSnap.refPoint2, constraint: hoverSnap.constraintAxis2 });
            }

            hoverAnchorsToDraw.forEach(anchor => {
                const refPt = anchor.ref;
                if (!isPointInViewport(refPt, 50)) return;
                ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 1.2 / view.zoom;
                ctx.beginPath();
                ctx.moveTo(hoverSnap.point.x, hoverSnap.point.y);
                ctx.lineTo(refPt.x, refPt.y);
                ctx.stroke();
                ctx.setLineDash([]);

                // Calculate hover snap angle
                const hdx = hoverSnap.point.x - refPt.x;
                const hdy = hoverSnap.point.y - refPt.y;
                let hang = Math.round(Math.atan2(hdy, hdx) * 180 / Math.PI);
                hang = (hang + 360) % 180;

                ctx.save();
                ctx.font = `bold ${10 / view.zoom}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const hMidX = (hoverSnap.point.x + refPt.x) / 2;
                const hMidY = (hoverSnap.point.y + refPt.y) / 2;
                const hTxt = `${hang}°`;
                const hMetrics = ctx.measureText(hTxt);
                const hBgW = hMetrics.width + 8 / view.zoom;
                const hBgH = 14 / view.zoom;
                ctx.fillStyle = 'rgba(240, 253, 244, 0.95)';
                ctx.strokeStyle = '#bbf7d0';
                ctx.lineWidth = 1 / view.zoom;
                ctx.beginPath();
                ctx.roundRect(hMidX - hBgW / 2, hMidY - hBgH / 2, hBgW, hBgH, 3 / view.zoom);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#15803d';
                ctx.fillText(hTxt, hMidX, hMidY + 0.5 / view.zoom);
                ctx.restore();

                // Highlight the distant point (the anchor point we are aligned with)
                ctx.fillStyle = '#22c55e';
                ctx.strokeStyle = '#15803d';
                ctx.lineWidth = 1.5 / view.zoom;
                
                // Draw filled inner circle
                ctx.beginPath();
                ctx.arc(refPt.x, refPt.y, 4 / view.zoom, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Draw outer target ring indicator
                ctx.beginPath();
                ctx.arc(refPt.x, refPt.y, 8 / view.zoom, 0, Math.PI * 2);
                ctx.stroke();
            });
        }
      }

      // Draw Allunga (Extend) hover preview
      if (allungaHover) {
          const line = entities.find(e => e.id === allungaHover.lineId);
          if (line && line.type === 'line') {
              const l = line as LineEntity;
              ctx.save();
              ctx.strokeStyle = '#10b981'; // Beautiful emerald
              ctx.lineWidth = 3.5 / view.zoom;
              ctx.beginPath();
              
              // Use highlightedTrimSegment if available for sub-segment highlighting
              if (highlightedTrimSegment && highlightedTrimSegment.type === 'line' && highlightedTrimSegment.start && highlightedTrimSegment.end) {
                  ctx.moveTo(highlightedTrimSegment.start.x, highlightedTrimSegment.start.y);
                  ctx.lineTo(highlightedTrimSegment.end.x, highlightedTrimSegment.end.y);
              } else {
                  ctx.moveTo(l.start.x, l.start.y);
                  ctx.lineTo(l.end.x, l.end.y);
              }
              ctx.stroke();
              ctx.restore();
          }
          
          ctx.save();
          ctx.strokeStyle = '#10b981'; // Emerald color
          ctx.lineWidth = 2 / view.zoom;
          ctx.setLineDash([6 / view.zoom, 4 / view.zoom]);
          ctx.beginPath();
          ctx.moveTo(allungaHover.originalPt.x, allungaHover.originalPt.y);
          ctx.lineTo(allungaHover.targetPt.x, allungaHover.targetPt.y);
          ctx.stroke();
          ctx.setLineDash([]);
          
          const sz = 7 / view.zoom;
          ctx.lineWidth = 2 / view.zoom;
          ctx.strokeStyle = '#059669'; // Darker emerald
          
          ctx.beginPath();
          ctx.rect(allungaHover.targetPt.x - sz, allungaHover.targetPt.y - sz, sz * 2, sz * 2);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.moveTo(allungaHover.targetPt.x - sz * 1.5, allungaHover.targetPt.y);
          ctx.lineTo(allungaHover.targetPt.x + sz * 1.5, allungaHover.targetPt.y);
          ctx.moveTo(allungaHover.targetPt.x, allungaHover.targetPt.y - sz * 1.5);
          ctx.lineTo(allungaHover.targetPt.x, allungaHover.targetPt.y + sz * 1.5);
          ctx.stroke();
          
          const extLen = Math.hypot(allungaHover.targetPt.x - allungaHover.originalPt.x, allungaHover.targetPt.y - allungaHover.originalPt.y);
          
          // Calculate total sub-segment length if pivot is available
          let totalLenLabel = "";
          if (allungaHover.pivotPt) {
              const totalLen = Math.hypot(allungaHover.targetPt.x - allungaHover.pivotPt.x, allungaHover.targetPt.y - allungaHover.pivotPt.y);
              const totalDecimals = view.zoom >= 1.5 ? 2 : (view.zoom >= 0.35 ? 1 : 0);
              totalLenLabel = ` [L: ${totalLen.toFixed(totalDecimals)}]`;
          }

          const extDecimals = view.zoom >= 1.5 ? 2 : (view.zoom >= 0.35 ? 1 : 0);
          const label = `+${extLen.toFixed(extDecimals)}${totalLenLabel} mm`;
          ctx.font = `bold ${11 / view.zoom}px sans-serif`;
          const metrics = ctx.measureText(label);
          const padX = 6 / view.zoom;
          const padY = 3 / view.zoom;
          const bW = metrics.width + padX * 2;
          const bH = 16 / view.zoom;
          const mX = (allungaHover.originalPt.x + allungaHover.targetPt.x) / 2;
          const mY = (allungaHover.originalPt.y + allungaHover.targetPt.y) / 2;
          
          ctx.fillStyle = 'rgba(209, 250, 229, 0.9)'; // Light emerald green background
          ctx.strokeStyle = '#6ee7b7';
          ctx.lineWidth = 1 / view.zoom;
          ctx.beginPath();
          ctx.roundRect(mX - bW / 2, mY - bH / 2, bW, bH, 3 / view.zoom);
          ctx.fill();
          ctx.stroke();
          
          ctx.fillStyle = '#047857'; // Dark emerald green text
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, mX, mY + 0.5 / view.zoom);
          
          ctx.restore();
      }

      // Draw visible Tavole (Sheet templates) in CAD model units
      if (tavole) {
        tavole.forEach(tav => {
          if (!tav.visible) return;
          
          ctx.save();
          
          const { w, h } = getTavolaDimensions(tav);
          
          // Draw thin dashed sheet outline
          ctx.strokeStyle = isLavagna ? 'rgba(250, 249, 246, 0.4)' : '#2563eb';
          ctx.lineWidth = 1.5 / view.zoom;
          ctx.setLineDash([5 / view.zoom, 4 / view.zoom]);
          ctx.strokeRect(tav.position.x, tav.position.y, w, h);

          // Support overlay grid (retino in sovraimpressione) inside the sheet boundaries
          if (tav.gridType && tav.gridType !== 'none') {
            let spacingVal = 10;
            if (tav.gridType === '1cm') {
              if (tav.unit === 'm') spacingVal = 0.01;
              else if (tav.unit === 'cm') spacingVal = 1;
              else if (tav.unit === 'mm') spacingVal = 10;
            } else if (tav.gridType === '10cm') {
              if (tav.unit === 'm') spacingVal = 0.1;
              else if (tav.unit === 'cm') spacingVal = 10;
              else if (tav.unit === 'mm') spacingVal = 100;
            } else if (tav.gridType === '100cm') {
              if (tav.unit === 'm') spacingVal = 1.0;
              else if (tav.unit === 'cm') spacingVal = 100;
              else if (tav.unit === 'mm') spacingVal = 1000;
            }

            ctx.save();
            ctx.beginPath();
            ctx.rect(tav.position.x, tav.position.y, w, h);
            ctx.clip();

            ctx.strokeStyle = isLavagna ? 'rgba(250, 249, 246, 0.1)' : (tav.gridColor || 'rgba(99, 102, 241, 0.15)');
            ctx.lineWidth = 0.5 / view.zoom;
            ctx.setLineDash([]); // Draw subtle solid lines

            const startX = Math.floor(tav.position.x / spacingVal) * spacingVal;
            const endX = Math.ceil((tav.position.x + w) / spacingVal) * spacingVal;
            const startY = Math.floor(tav.position.y / spacingVal) * spacingVal;
            const endY = Math.ceil((tav.position.y + h) / spacingVal) * spacingVal;

            ctx.beginPath();
            // Vertical lines
            for (let x = startX; x <= endX; x += spacingVal) {
              if (x >= tav.position.x && x <= tav.position.x + w) {
                ctx.moveTo(x, tav.position.y);
                ctx.lineTo(x, tav.position.y + h);
              }
            }
            // Horizontal lines
            for (let y = startY; y <= endY; y += spacingVal) {
              if (y >= tav.position.y && y <= tav.position.y + h) {
                ctx.moveTo(tav.position.x, y);
                ctx.lineTo(tav.position.x + w, y);
              }
            }
            ctx.stroke();
            ctx.restore();
          }
          
          // Draw printable margin (5mm offset standard frame border)
          let mFactor = 5;
          let scaleFactor = 1000;
          if (tav.unit === 'cm') scaleFactor = 10;
          if (tav.unit === 'mm') scaleFactor = 1;
          const marginOffset = mFactor * (tav.scale / scaleFactor);
          
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 0.8 / view.zoom;
          ctx.setLineDash([]);
          ctx.strokeRect(
            tav.position.x + marginOffset, 
            tav.position.y + marginOffset, 
            w - 2 * marginOffset, 
            h - 2 * marginOffset
          );
          
          // Draw a beautiful CAD Title Block (cartiglio) in the bottom-right corner
          const cartiglioW = 120 * (tav.scale / scaleFactor);
          const cartiglioH = 40 * (tav.scale / scaleFactor);
          const cartX = tav.position.x + w - marginOffset - cartiglioW;
          const cartY = tav.position.y + h - marginOffset - cartiglioH;
          
          const isCartiglioHovered = hoveredTavolaPart?.id === tav.id && hoveredTavolaPart?.part === 'cartiglio';
          ctx.fillStyle = isCartiglioHovered ? 'rgba(37, 99, 235, 0.08)' : 'rgba(255, 255, 255, 0.9)';
          ctx.fillRect(cartX, cartY, cartiglioW, cartiglioH);
          ctx.strokeStyle = isCartiglioHovered ? '#1d4ed8' : '#2563eb';
          ctx.lineWidth = (isCartiglioHovered ? 2.0 : 1.2) / view.zoom;
          ctx.strokeRect(cartX, cartY, cartiglioW, cartiglioH);
          
          // Partition lines of Title Block
          ctx.beginPath();
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 0.7 / view.zoom;
          // Horizontal lines
          ctx.moveTo(cartX, cartY + cartiglioH * 0.4);
          ctx.lineTo(cartX + cartiglioW, cartY + cartiglioH * 0.4);
          ctx.moveTo(cartX, cartY + cartiglioH * 0.7);
          ctx.lineTo(cartX + cartiglioW, cartY + cartiglioH * 0.7);
          // Vertical partition
          ctx.moveTo(cartX + cartiglioW * 0.5, cartY + cartiglioH * 0.4);
          ctx.lineTo(cartX + cartiglioW * 0.5, cartY + cartiglioH);
          ctx.stroke();
          
          // Fill Titles metadata
          ctx.fillStyle = '#1e3a8a';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          
          // Choose standard readable fonts inside box
          const textScale = tav.scale / scaleFactor;
          const headingSz = Math.max(3.5, 2.8 * textScale);
          const valueSz = Math.max(5, 4.2 * textScale);
          
          ctx.font = `bold ${headingSz}px sans-serif`;
          ctx.fillText(`PROGETTO:`, cartX + 2 * textScale, cartY + 2 * textScale);
          ctx.font = `bold ${Math.max(6, 6 * textScale)}px sans-serif`;
          const MAX_PROGETTO_LEN = 35;
          let pString = tav.datiCartiglio?.progetto || "GECOLA BIM";
          if(pString.length > MAX_PROGETTO_LEN) pString = pString.substring(0, MAX_PROGETTO_LEN) + "...";
          ctx.fillText(pString, cartX + 2 * textScale, cartY + 6.5 * textScale);
          
          ctx.font = `bold ${headingSz}px sans-serif`;
          ctx.fillText(`TAVOLA:`, cartX + 2 * textScale, cartY + cartiglioH * 0.42);
          ctx.font = `bold ${valueSz}px sans-serif`;
          const MAX_TITOLO_LEN = 20;
          let tString = tav.datiCartiglio?.titolo || tav.name;
          if(tString.length > MAX_TITOLO_LEN) tString = tString.substring(0, MAX_TITOLO_LEN) + "...";
          ctx.fillText(tString, cartX + 2 * textScale, cartY + cartiglioH * 0.5);
          
          ctx.font = `bold ${headingSz}px sans-serif`;
          ctx.fillText(`SCALA:`, cartX + cartiglioW * 0.53, cartY + cartiglioH * 0.42);
          ctx.font = `bold ${valueSz}px sans-serif`;
          ctx.fillText(`1:${tav.scale}`, cartX + cartiglioW * 0.53, cartY + cartiglioH * 0.5);
          
          ctx.font = `bold ${headingSz}px sans-serif`;
          ctx.fillText(`AUTORE:`, cartX + 2 * textScale, cartY + cartiglioH * 0.72);
          ctx.font = `bold ${valueSz}px sans-serif`;
          const MAX_AUTORE_LEN = 20;
          let aString = tav.datiCartiglio?.autore || "Domenico Gimondo";
          if(aString.length > MAX_AUTORE_LEN) aString = aString.substring(0, MAX_AUTORE_LEN) + "...";
          ctx.fillText(aString, cartX + 2 * textScale, cartY + cartiglioH * 0.81);
          
          ctx.font = `bold ${headingSz}px sans-serif`;
          ctx.fillText(`DATA:`, cartX + cartiglioW * 0.53, cartY + cartiglioH * 0.72);
          ctx.font = `bold ${valueSz}px sans-serif`;
          const MAX_DATA_LEN = 15;
          let dString = tav.datiCartiglio?.data || "";
          if(dString.length > MAX_DATA_LEN) dString = dString.substring(0, MAX_DATA_LEN) + "...";
          ctx.fillText(dString, cartX + cartiglioW * 0.53, cartY + cartiglioH * 0.81);
          
          // Top-left tab label
          const isBadgeHovered = hoveredTavolaPart?.id === tav.id && hoveredTavolaPart?.part === 'badge';
          ctx.fillStyle = isBadgeHovered ? 'rgba(29, 78, 216, 1)' : 'rgba(37, 99, 235, 0.9)';
          const badgeH = 18 / view.zoom;
          const badgeW = 120 / view.zoom;
          ctx.fillRect(tav.position.x, tav.position.y - badgeH, badgeW, badgeH);
          
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${10 / view.zoom}px sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            ` ${tav.name} (${tav.format} - 1:${tav.scale})`, 
            tav.position.x + 4 / view.zoom, 
            tav.position.y - badgeH / 2
          );
          
          if (dragTavolaIdRef.current === tav.id) {
            ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
            ctx.fillRect(tav.position.x, tav.position.y, w, h);
          }
          
          ctx.restore();
        });
      }

      // --- BIM OVERLAY RENDERING PASS (STARTS) ---
      entities.forEach(entity => {
        if (!entity.isBIM) return;
        if ((entity as any).isVisible === false) return;

        // Draw Room
        if (entity.bimType === 'room') {
          const roomPoints = (entity as any).bimPoints || (entity as any).points;
          const roomHoles = (entity as any).holes;
          if (roomPoints && roomPoints.length > 2) {
            ctx.save();
            ctx.fillStyle = getAreaColor((entity as any).bimAreaType) || 'rgba(16, 185, 129, 0.12)';
            ctx.beginPath();
            ctx.moveTo(roomPoints[0].x, roomPoints[0].y);
            for (let i = 1; i < roomPoints.length; i++) {
              ctx.lineTo(roomPoints[i].x, roomPoints[i].y);
            }
            ctx.closePath();
            
            if (roomHoles) {
                roomHoles.forEach((hole: Point[]) => {
                    ctx.moveTo(hole[0].x, hole[0].y);
                    for(let i=1; i<hole.length; i++) ctx.lineTo(hole[i].x, hole[i].y);
                    ctx.closePath();
                });
            }
            
            ctx.fill('evenodd');

            // Outline
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
            ctx.lineWidth = 1.5 / view.zoom;
            ctx.stroke();

            ctx.restore();
          }
        }

        // Draw Door
        if (entity.bimType === 'door') {
          const start = (entity as any).start;
          const end = (entity as any).end;
          if (start && end) {
            ctx.save();
            ctx.strokeStyle = '#9ca3af';
            ctx.lineWidth = 1 / view.zoom;
            ctx.setLineDash([4 / view.zoom, 4 / view.zoom]);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();

            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            
            // Handle flipping of the door swing
            const flipMult = (entity as any).bimFlip ? -1 : 1;
            const px = (-dy / len) * flipMult;
            const py = (dx / len) * flipMult;

            const doorWidth = len;
            const leafEnd = {
              x: start.x + px * doorWidth,
              y: start.y + py * doorWidth
            };

            ctx.setLineDash([]);
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 2 / view.zoom;
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(leafEnd.x, leafEnd.y);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(220, 38, 38, 0.4)';
            ctx.lineWidth = 1 / view.zoom;
            ctx.beginPath();
            const baseAngle = Math.atan2(end.y - start.y, end.x - start.x);
            const leafAngle = Math.atan2(leafEnd.y - start.y, leafEnd.x - start.x);
            
            // Draw arc in correct direction based on flip
            ctx.arc(start.x, start.y, doorWidth, baseAngle, leafAngle, (entity as any).bimFlip || false);
            ctx.stroke();

            ctx.restore();
          }
        }

        // Draw Window
        if (entity.bimType === 'window') {
          const entAsAny = (entity as any);
          const start = entAsAny.start || entAsAny.p1;
          const end = entAsAny.end || entAsAny.p2;
          if (start && end) {
            ctx.save();
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = len > 0 ? -dy / len : 0;
            const ny = len > 0 ? dx / len : 0;
            const ux = len > 0 ? dx / len : 0;
            const uy = len > 0 ? dy / len : 0;
            
            const wThickness = 12; // Standard frame thickness in 2D

            // 1. MAIN OUTER FRAME (Telaio Fisso)
            ctx.strokeStyle = '#2563eb';
            ctx.fillStyle = 'rgba(37, 99, 235, 0.05)';
            ctx.lineWidth = 2 / view.zoom;
            ctx.beginPath();
            ctx.moveTo(start.x + nx * wThickness/2, start.y + ny * wThickness/2);
            ctx.lineTo(end.x + nx * wThickness/2, end.y + ny * wThickness/2);
            ctx.lineTo(end.x - nx * wThickness/2, end.y - ny * wThickness/2);
            ctx.lineTo(start.x - nx * wThickness/2, start.y - ny * wThickness/2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            const windowType = entAsAny.bimWindowType || 'singola';
            const isFlipLeft = !!entAsAny.bimFlipLeft; 
            const isFlipSide = !!entAsAny.bimFlipSide; 
            const cx = (start.x + end.x) / 2;
            const cy = (start.y + end.y) / 2;
            const sThickness = wThickness * 0.7; // Sash thickness

            // 2. SASHES (Ante) & GLASS
            const sashCount = (windowType === 'doppia') ? 2 : 1;
            for (let i = 0; i < sashCount; i++) {
                const sStart = (sashCount === 2 && i === 1) ? { x: cx, y: cy } : start;
                const sEnd = (sashCount === 2 && i === 0) ? { x: cx, y: cy } : end;
                
                // Sash box
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 1 / view.zoom;
                ctx.beginPath();
                ctx.moveTo(sStart.x + nx * sThickness/2, sStart.y + ny * sThickness/2);
                ctx.lineTo(sEnd.x + nx * sThickness/2, sEnd.y + ny * sThickness/2);
                ctx.lineTo(sEnd.x - nx * sThickness/2, sEnd.y - ny * sThickness/2);
                ctx.lineTo(sStart.x - nx * sThickness/2, sStart.y - ny * sThickness/2);
                ctx.closePath();
                ctx.stroke();

                // Glass (Fill)
                ctx.fillStyle = 'rgba(147, 197, 253, 0.2)';
                ctx.fill();
                
                // Glass detail lines
                ctx.strokeStyle = '#93c5fd';
                ctx.lineWidth = 0.5 / view.zoom;
                ctx.beginPath();
                ctx.moveTo(sStart.x + nx * 1.5, sStart.y + ny * 1.5);
                ctx.lineTo(sEnd.x + nx * 1.5, sEnd.y + ny * 1.5);
                ctx.moveTo(sStart.x - nx * 1.5, sStart.y - ny * 1.5);
                ctx.lineTo(sEnd.x - nx * 1.5, sEnd.y - ny * 1.5);
                ctx.stroke();

                // 3. HINGES (Cerniere) where opening is
                // We determine hinge position based on flip
                ctx.fillStyle = '#64748b';
                const showHinges = windowType !== 'vetrata';
                if (showHinges) {
                    const hSide = (sashCount === 2) 
                        ? (i === 0 ? 'left' : 'right') // Left sash hinges at start, Right sash hinges at end
                        : (isFlipLeft ? 'left' : 'right');
                    
                    const hBase = (hSide === 'left') ? sStart : sEnd;
                    const hDir = (hSide === 'left') ? 1 : -1;
                    
                    // Simple hinge dots
                    for (let j = 0; j < 2; j++) {
                        const hOff = (j === 0 ? 5 : -5);
                        ctx.beginPath();
                        ctx.arc(hBase.x + ux * hOff * hDir, hBase.y + uy * hOff * hDir, 1.2 / view.zoom, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }

            // 4. HANDLE (Maniglia)
            if (windowType !== 'vetrata' && windowType !== 'vasistas') {
                const hPosX = cx; 
                const hPosY = cy;
                
                // For single windows, handle is on the opposite side of hinges
                let finalHPos = { x: cx, y: cy };
                if (windowType === 'singola') {
                    if (isFlipLeft) {
                        finalHPos = { x: end.x - ux * 8, y: end.y - uy * 8 };
                    } else {
                        finalHPos = { x: start.x + ux * 8, y: start.y + uy * 8 };
                    }
                }

                const sideDir = isFlipSide ? 1 : -1;
                const hBaseRadius = 3.5 / view.zoom;
                const hBaseCenter = {
                    x: finalHPos.x + nx * (wThickness/2 + 1) * sideDir,
                    y: finalHPos.y + ny * (wThickness/2 + 1) * sideDir
                };

                // Supporto circolare
                ctx.fillStyle = '#cbd5e1';
                ctx.beginPath();
                ctx.arc(hBaseCenter.x, hBaseCenter.y, hBaseRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#475569';
                ctx.lineWidth = 0.5 / view.zoom;
                ctx.stroke();

                // Handle Lever
                const leverLen = 10 / view.zoom;
                const leverDir = (windowType === 'doppia' || !isFlipLeft) ? 1 : -1;
                ctx.beginPath();
                ctx.lineWidth = 2 / view.zoom;
                ctx.strokeStyle = '#334155';
                ctx.lineCap = 'round';
                ctx.moveTo(hBaseCenter.x, hBaseCenter.y);
                ctx.lineTo(hBaseCenter.x + ux * leverLen * leverDir, hBaseCenter.y + uy * leverLen * leverDir);
                ctx.stroke();

                // Opening Direction Lines
                ctx.save();
                ctx.setLineDash([4 / view.zoom, 3 / view.zoom]);
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
                ctx.lineWidth = 0.8 / view.zoom;
                
                const apexOff = 18;
                const apex = {
                    x: finalHPos.x + nx * (wThickness/2 + apexOff) * sideDir,
                    y: finalHPos.y + ny * (wThickness/2 + apexOff) * sideDir
                };

                if (windowType === 'doppia') {
                    // Two opening triangles meeting at center
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y); ctx.lineTo(apex.x, apex.y); ctx.lineTo(cx, cy);
                    ctx.moveTo(end.x, end.y); ctx.lineTo(apex.x, apex.y); ctx.lineTo(cx, cy);
                    ctx.stroke();
                } else {
                    const hHinge = isFlipLeft ? start : end;
                    const hOpen = isFlipLeft ? end : start;
                    ctx.beginPath();
                    ctx.moveTo(hHinge.x, hHinge.y); ctx.lineTo(apex.x, apex.y); ctx.lineTo(hOpen.x, hOpen.y);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // BIM Annotations
            const w = entAsAny.bimWidth || Math.round(len);
            const h = entAsAny.bimWindowHeight || 140;

            const axisLen = wThickness + 120;
            ctx.beginPath();
            ctx.setLineDash([8 / view.zoom, 4 / view.zoom, 2 / view.zoom, 4 / view.zoom]);
            ctx.moveTo(cx - nx * axisLen/2, cy - ny * axisLen/2);
            ctx.lineTo(cx + nx * axisLen/2, cy + ny * axisLen/2);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1 / view.zoom;
            ctx.stroke();
            ctx.setLineDash([]);

            // Dimensions Text
            ctx.font = `bold ${12 / view.zoom}px monospace`;
            ctx.fillStyle = '#ef4444';
            ctx.save();
            ctx.translate(cx + nx * (axisLen/2 + 5), cy + ny * (axisLen/2 + 5));
            let angle = Math.atan2(dy, dx);
            if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
            ctx.rotate(angle);
            ctx.textAlign = "center";
            ctx.fillText(`${w} x ${h}`, 0, 0);
            ctx.restore();

            ctx.restore();
          }
        }
      });
      // --- BIM OVERLAY RENDERING PASS (ENDS) ---

      // --- PULSING HIGHLIGHT PASS (Double-click effect) ---
      if (pulsingEntityId) {
        const entity = projectedEntities.find(e => e.id === pulsingEntityId);
        if (entity && entity.isBIM) {
          const pulseColor = `rgba(34, 197, 94, ${0.45 * pulseIntensity})`; 
          const glowColor = `rgba(34, 197, 94, ${0.25 * pulseIntensity})`;
          const extraWidth = (8 + 10 * pulseIntensity) / view.zoom;

          const drawGenericPulse = (pts: Point[]) => {
              if (pts.length < 2) return;
              ctx.save();
              ctx.beginPath();
              ctx.moveTo(pts[0].x, pts[0].y);
              for(let i=1; i<pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
              ctx.closePath();
              
              // External Glow
              ctx.strokeStyle = glowColor;
              ctx.lineWidth = extraWidth * 1.8;
              ctx.stroke();
              
              // Pulse line
              ctx.strokeStyle = pulseColor;
              ctx.lineWidth = extraWidth;
              ctx.stroke();
              ctx.restore();
          };

          if (entity.bimType === 'room') {
             const roomPoints = (entity as any).bimPoints || (entity as any).points;
             if (roomPoints) drawGenericPulse(roomPoints);
          } else if (entity.bimType === 'door' || entity.bimType === 'window' || entity.bimType === 'wall') {
             const entAny = entity as any;
             const start = entAny.start || entAny.p1;
             const end = entAny.end || entAny.p2;
             if (start && end) {
                ctx.save();
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                
                ctx.strokeStyle = glowColor;
                ctx.lineWidth = extraWidth * 2.2;
                ctx.stroke();
                
                ctx.strokeStyle = pulseColor;
                ctx.lineWidth = extraWidth;
                ctx.stroke();
                ctx.restore();
             }
          } else if (entity.bimType === 'electrical_symbol' || entity.bimType === 'hydraulic_symbol') {
             const entAny = entity as any;
             const pt = entAny.point || entAny.center || entAny.start;
             if (pt) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, (12 + 10 * pulseIntensity) / view.zoom, 0, Math.PI * 2);
                ctx.strokeStyle = glowColor;
                ctx.lineWidth = (4 * pulseIntensity) / view.zoom;
                ctx.stroke();
                
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, (10 + 6 * pulseIntensity) / view.zoom, 0, Math.PI * 2);
                ctx.strokeStyle = pulseColor;
                ctx.lineWidth = (2 / view.zoom);
                ctx.stroke();
                ctx.restore();
             }
          }
        }
      }

      ctx.restore();
      
      // Render selection window
      if (selectionWindow) {
          ctx.save();
          ctx.translate(view.pan.x, view.pan.y);
          ctx.scale(view.zoom, view.zoom);

          const rectX = Math.min(selectionWindow.start.x, selectionWindow.current.x);
          const rectY = Math.min(selectionWindow.start.y, selectionWindow.current.y);
          const rectW = Math.abs(selectionWindow.current.x - selectionWindow.start.x);
          const rectH = Math.abs(selectionWindow.current.y - selectionWindow.start.y);

          // Standard selection colors (blue for window, green for crossing, or custom orange-red for Trim)
          const isCrossing = selectionWindow.current.x < selectionWindow.start.x;
          
          if (activeTool === 'Trim') {
              if (trimMode === 'smart') {
                  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
                  ctx.strokeStyle = '#10b981';
              } else {
                  ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
                  ctx.strokeStyle = '#3b82f6';
              }
          } else if (activeTool === 'CopiaVideo') {
              ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
              ctx.strokeStyle = '#eab308';
          } else if (isCrossing) {
               ctx.fillStyle = 'rgba(187, 247, 187, 0.2)';
               ctx.strokeStyle = '#22c55e';
          } else {
               ctx.fillStyle = 'rgba(191, 219, 254, 0.2)';
               ctx.strokeStyle = '#3b82f6';
          }

          ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
          ctx.lineWidth = 1 / view.zoom;
          ctx.beginPath();
          ctx.rect(rectX, rectY, rectW, rectH);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
      }

      if (activeMoveSnapPoint) {
        ctx.save();
        ctx.translate(view.pan.x, view.pan.y);
        ctx.scale(view.zoom, view.zoom);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(activeMoveSnapPoint.x, activeMoveSnapPoint.y, 6 / view.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const hasBasePointDragging = (activeTool === 'Copy' && copyPhase === 'selectDestinationPoint' && copyBasePoint !== null) ||
                                   (activeTool === 'Move' && moveBasePoint !== null);
      if (hasBasePointDragging) {
        const basePt = activeTool === 'Copy' ? copyBasePoint! : moveBasePoint!;
        ctx.save();
        ctx.translate(view.pan.x, view.pan.y);
        ctx.scale(view.zoom, view.zoom);

        const targetIds = dragEntityIds.length > 0 ? [...dragEntityIds] : (dragEntityId ? [dragEntityId] : []);
        const staticEntities = entities.filter(e => !targetIds.includes(e.id));
        const snapRes = getSnappedPoint(actualMousePosRef.current, staticEntities, activeTool, null);
        let snapPoint = snapRes.snapped ? snapRes.point : actualMousePosRef.current;

        const effectiveOrthoMode = getEffectiveOrtho(undefined, true);
        if (effectiveOrthoMode && !snapRes.snapped) {
          const dx = snapPoint.x - basePt.x;
          const dy = snapPoint.y - basePt.y;
          if (Math.abs(dx) > Math.abs(dy)) {
            snapPoint.y = basePt.y;
          } else {
            snapPoint.x = basePt.x;
          }
        }

        // 1. Draw rubber-band thread from original base point to snapPoint
        ctx.beginPath();
        ctx.setLineDash([4 / view.zoom, 4 / view.zoom]);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
        ctx.lineWidth = 1 / view.zoom;
        ctx.moveTo(basePt.x, basePt.y);
        ctx.lineTo(snapPoint.x, snapPoint.y);
        ctx.stroke();

        // 2. Draw original base point marker (hollow circle + cross lines)
        ctx.setLineDash([]);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.2 / view.zoom;
        ctx.beginPath();
        ctx.arc(basePt.x, basePt.y, 6 / view.zoom, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(basePt.x - 8 / view.zoom, basePt.y);
        ctx.lineTo(basePt.x + 8 / view.zoom, basePt.y);
        ctx.moveTo(basePt.x, basePt.y - 8 / view.zoom);
        ctx.lineTo(basePt.x, basePt.y + 8 / view.zoom);
        ctx.stroke();

        // 3. Draw a distinctive solid red dot with white stroke representing the moving/placement base point anchor
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5 / view.zoom;
        ctx.beginPath();
        ctx.arc(snapPoint.x, snapPoint.y, 6 / view.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }

      // Draw current drawing preview

      // Draw Parallel distance history
      // Draw Parallel preview
      // Draw Parallel preview with Tecnigrafo Perpendicular Ruler
      if (activeTool === 'Parallel' && selectedParallelLine) {
          ctx.save();
          ctx.translate(view.pan.x, view.pan.y);
          ctx.scale(view.zoom, view.zoom);
          
          const line = selectedParallelLine as LineEntity;
          const dxLine = line.end.x - line.start.x;
          const dyLine = line.end.y - line.start.y;
          const L = Math.sqrt(dxLine * dxLine + dyLine * dyLine);
          
          if (L > 0) {
              const tangX = dxLine / L;
              const tangY = dyLine / L;
              const normX = -tangY;
              const normY = tangX;
              
              // Anchor point P0 on the selected segment (centers along the line)
              let t = 0.5;
              if (parallelMouse) {
                  const pMouseProj = (parallelMouse.x - line.start.x) * tangX + (parallelMouse.y - line.start.y) * tangY;
                  t = Math.max(0.12, Math.min(0.88, pMouseProj / L));
              }
              const p0 = {
                  x: line.start.x + tangX * (t * L),
                  y: line.start.y + tangY * (t * L)
              };

              const offsetVal = parallelDistance * parallelSign;

              // 1. Highlight the seed base line with amber glow
              ctx.save();
              ctx.strokeStyle = '#f59e0b'; // Amber-500
              ctx.lineWidth = 3 / view.zoom;
              ctx.setLineDash([]);
              ctx.beginPath();
              ctx.moveTo(line.start.x, line.start.y);
              ctx.lineTo(line.end.x, line.end.y);
              ctx.stroke();

              // Endpoints of base line
              ctx.fillStyle = '#f59e0b';
              ctx.beginPath();
              ctx.arc(line.start.x, line.start.y, 3.5 / view.zoom, 0, Math.PI * 2);
              ctx.arc(line.end.x, line.end.y, 3.5 / view.zoom, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();

              // 2. RIGHELLO PERPENDICOLARE DEL TECNIGRAFO
              // Perpendicular axis extending both directions with Zero at segment and positive graduations on both sides
              const rulerSpan = Math.max(350, Math.min(1200, 650 / view.zoom));
              const rulerHalfWidth = 15 / view.zoom;
              const normAngle = Math.atan2(normY, normX);

              ctx.save();
              ctx.translate(p0.x, p0.y);
              ctx.rotate(normAngle);

              // Acrylic smoked ruler body
              ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
              ctx.beginPath();
              ctx.roundRect(-rulerSpan, -rulerHalfWidth, rulerSpan * 2, rulerHalfWidth * 2, 4 / view.zoom);
              ctx.fill();

              // Amber edge borders
              ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
              ctx.lineWidth = 1 / view.zoom;
              ctx.stroke();

              // Central dashed spine
              ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
              ctx.setLineDash([3 / view.zoom, 3 / view.zoom]);
              ctx.beginPath();
              ctx.moveTo(-rulerSpan, 0);
              ctx.lineTo(rulerSpan, 0);
              ctx.stroke();
              ctx.setLineDash([]);

              // ZERO MARKER on the segment (x = 0)
              ctx.strokeStyle = '#f59e0b';
              ctx.lineWidth = 2.5 / view.zoom;
              ctx.beginPath();
              ctx.moveTo(0, -rulerHalfWidth - 3 / view.zoom);
              ctx.lineTo(0, rulerHalfWidth + 3 / view.zoom);
              ctx.stroke();

              // Brass Pivot Rivet at (0, 0)
              ctx.fillStyle = '#fbbf24';
              ctx.beginPath();
              ctx.arc(0, 0, 3.5 / view.zoom, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = '#78350f';
              ctx.lineWidth = 1 / view.zoom;
              ctx.stroke();

              // "0.00" label right on the origin
              ctx.font = `bold ${8.5 / view.zoom}px monospace`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillStyle = '#fbbf24';
              ctx.fillText('0.00', 0, -rulerHalfWidth - 4 / view.zoom);

              // GRADUATIONS ON BOTH SIDES: POSITIVE NUMBERS ON BOTH SIDES (+ and -)
              const majorTicks = [10, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 180, 200, 250, 300, 350, 400, 500];

              [-1, 1].forEach(side => {
                  for (let cm = 5; cm <= rulerSpan; cm += 5) {
                      const xPos = cm * side;
                      const isMajor = majorTicks.includes(cm);
                      const isTens = (cm % 10 === 0);
                      
                      let tickLen = 3.5 / view.zoom;
                      if (isMajor) tickLen = 8 / view.zoom;
                      else if (isTens) tickLen = 5.5 / view.zoom;

                      ctx.strokeStyle = isMajor ? 'rgba(251, 191, 36, 0.75)' : 'rgba(203, 213, 225, 0.35)';
                      ctx.lineWidth = (isMajor ? 1.2 : 0.8) / view.zoom;

                      // Top tick
                      ctx.beginPath();
                      ctx.moveTo(xPos, -rulerHalfWidth);
                      ctx.lineTo(xPos, -rulerHalfWidth + tickLen);
                      ctx.stroke();

                      // Bottom tick
                      ctx.beginPath();
                      ctx.moveTo(xPos, rulerHalfWidth);
                      ctx.lineTo(xPos, rulerHalfWidth - (tickLen * 0.6));
                      ctx.stroke();

                      // Major numeric label (positive on both sides!)
                      if (isMajor && (cm <= 50 || cm % 20 === 0 || cm === 25 || cm % 50 === 0)) {
                          const pxDist = cm * view.zoom;
                          if (pxDist > 15 || cm % 50 === 0 || cm <= 30) {
                              ctx.save();
                              ctx.translate(xPos, rulerHalfWidth + 3.5 / view.zoom);
                              ctx.font = `bold ${8 / view.zoom}px sans-serif`;
                              ctx.textAlign = 'center';
                              ctx.textBaseline = 'top';
                              ctx.fillStyle = isTens ? '#fde68a' : '#cbd5e1';
                              const labelText = cm >= 100 && cm % 100 === 0 ? `${cm / 100}m` : `${cm}`;
                              ctx.fillText(labelText, 0, 0);
                              ctx.restore();
                          }
                      }
                  }
              });

              // 3. CURSORE A SLITTA / DYNAMIC RUNNER INDEX
              const runnerX = offsetVal;
              // Runner line
              ctx.strokeStyle = '#06b6d4'; // Cyan-500
              ctx.lineWidth = 2.5 / view.zoom;
              ctx.beginPath();
              ctx.moveTo(runnerX, -rulerHalfWidth - 4 / view.zoom);
              ctx.lineTo(runnerX, rulerHalfWidth + 4 / view.zoom);
              ctx.stroke();

              // Top and bottom pointer chevrons
              ctx.fillStyle = '#06b6d4';
              ctx.beginPath();
              ctx.moveTo(runnerX, -rulerHalfWidth);
              ctx.lineTo(runnerX - 3.5 / view.zoom, -rulerHalfWidth - 6 / view.zoom);
              ctx.lineTo(runnerX + 3.5 / view.zoom, -rulerHalfWidth - 6 / view.zoom);
              ctx.closePath();
              ctx.fill();

              // Dynamic vernier sliding badge
              const badgeDecimals = view.zoom >= 1.2 ? 3 : (view.zoom >= 0.45 ? 2 : (view.zoom >= 0.20 ? 1 : 0));
              const badgeText = `${parallelDistance.toFixed(badgeDecimals).replace('.', ',')} cm`;
              ctx.font = `bold ${9.5 / view.zoom}px sans-serif`;
              const badgeWidth = ctx.measureText(badgeText).width + (10 / view.zoom);
              const badgeHeight = 15 / view.zoom;
              const badgeY = -rulerHalfWidth - 7 / view.zoom - badgeHeight;

              ctx.fillStyle = 'rgba(8, 51, 68, 0.95)';
              ctx.beginPath();
              ctx.roundRect(runnerX - badgeWidth / 2, badgeY, badgeWidth, badgeHeight, 3 / view.zoom);
              ctx.fill();
              ctx.strokeStyle = '#22d3ee';
              ctx.lineWidth = 1 / view.zoom;
              ctx.stroke();

              ctx.fillStyle = '#a5f3fc';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(badgeText, runnerX, badgeY + badgeHeight / 2);

              ctx.restore(); // end ruler transform

              // 4. GHOST PARALLEL LINE AT CURRENT OFFSET
              const p1Offset = {
                  x: line.start.x + normX * offsetVal,
                  y: line.start.y + normY * offsetVal
              };
              const p2Offset = {
                  x: line.end.x + normX * offsetVal,
                  y: line.end.y + normY * offsetVal
              };

              ctx.save();
              ctx.strokeStyle = '#06b6d4';
              ctx.lineWidth = 2 / view.zoom;
              ctx.setLineDash([6 / view.zoom, 4 / view.zoom]);
              ctx.beginPath();
              ctx.moveTo(p1Offset.x, p1Offset.y);
              ctx.lineTo(p2Offset.x, p2Offset.y);
              ctx.stroke();

              // Endpoints of parallel line
              ctx.fillStyle = '#22d3ee';
              ctx.beginPath();
              ctx.arc(p1Offset.x, p1Offset.y, 3.5 / view.zoom, 0, Math.PI * 2);
              ctx.arc(p2Offset.x, p2Offset.y, 3.5 / view.zoom, 0, Math.PI * 2);
              ctx.fill();

              // Connectors from base line to parallel line
              ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
              ctx.lineWidth = 1 / view.zoom;
              ctx.setLineDash([2 / view.zoom, 3 / view.zoom]);

              ctx.beginPath();
              ctx.moveTo(line.start.x, line.start.y);
              ctx.lineTo(p1Offset.x, p1Offset.y);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(line.end.x, line.end.y);
              ctx.lineTo(p2Offset.x, p2Offset.y);
              ctx.stroke();

              // Perpendicular 90-degree square at P0
              const sqSize = 6 / view.zoom;
              const signU = parallelSign >= 0 ? 1 : -1;
              ctx.beginPath();
              ctx.moveTo(p0.x + tangX * sqSize, p0.y + tangY * sqSize);
              ctx.lineTo(p0.x + tangX * sqSize + normX * sqSize * signU, p0.y + tangY * sqSize + normY * sqSize * signU);
              ctx.lineTo(p0.x + normX * sqSize * signU, p0.y + normY * sqSize * signU);
              ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
              ctx.lineWidth = 1 / view.zoom;
              ctx.setLineDash([]);
              ctx.stroke();

              // 5. RIFERIMENTO OFFSET PRECEDENTE NELLO STRUMENTO PARALLELA
              const refPrevD = getEffectiveLastParallelOffset(projectedEntities);
              if (refPrevD > 0.05) {
                  const signRef = parallelSign >= 0 ? 1 : -1;
                  const g1 = {
                      x: line.start.x + normX * signRef * refPrevD,
                      y: line.start.y + normY * signRef * refPrevD
                  };
                  const g2 = {
                      x: line.end.x + normX * signRef * refPrevD,
                      y: line.end.y + normY * signRef * refPrevD
                  };
                  const isAtPrevOffset = Math.abs(parallelDistance - refPrevD) < 0.05;
                  ctx.strokeStyle = isAtPrevOffset ? '#10b981' : 'rgba(16, 185, 129, 0.78)';
                  ctx.lineWidth = (isAtPrevOffset ? 2.6 : 1.7) / view.zoom;
                  ctx.setLineDash([8 / view.zoom, 5 / view.zoom]);
                  ctx.beginPath();
                  ctx.moveTo(g1.x, g1.y);
                  ctx.lineTo(g2.x, g2.y);
                  ctx.stroke();
                  ctx.setLineDash([]);

                  const gMidX = (g1.x + g2.x) / 2;
                  const gMidY = (g1.y + g2.y) / 2;
                  const refTxt = isAtPrevOffset
                      ? `= ${refPrevD.toFixed(badgeDecimals).replace('.', ',')} cm (Offset uguale)`
                      : `Rif. ${refPrevD.toFixed(badgeDecimals).replace('.', ',')} cm`;
                  ctx.font = `bold ${11.5 / view.zoom}px monospace`;
                  const rW = ctx.measureText(refTxt).width + 14 / view.zoom;
                  const rH = 19 / view.zoom;
                  ctx.fillStyle = isAtPrevOffset ? 'rgba(6, 78, 59, 0.96)' : 'rgba(15, 23, 42, 0.90)';
                  ctx.strokeStyle = '#10b981';
                  ctx.lineWidth = 1.5 / view.zoom;
                  ctx.beginPath();
                  ctx.roundRect(gMidX - rW / 2, gMidY - rH / 2, rW, rH, 4 / view.zoom);
                  ctx.fill();
                  ctx.stroke();
                  ctx.fillStyle = '#6ee7b7';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(refTxt, gMidX, gMidY);
              }

              ctx.restore();
          }
          ctx.restore();
      }

      // Draw locked focal point indicator
      if (lockedFocalPoint) {
        const screenPos = canvasToScreen(lockedFocalPoint.x, lockedFocalPoint.y);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Absolute screen pixels
        ctx.strokeStyle = '#f87171'; // Red-400
        ctx.lineWidth = 1.5;
        
        const size = 12;
        ctx.beginPath();
        // Crosshair
        ctx.moveTo(screenPos.x - size, screenPos.y);
        ctx.lineTo(screenPos.x + size, screenPos.y);
        ctx.moveTo(screenPos.x, screenPos.y - size);
        ctx.lineTo(screenPos.x, screenPos.y + size);
        ctx.stroke();

        // Circle
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, 6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }

      // Draw Live Mirror Axis & Preview
      if (liveMirrorAxis) {
          ctx.save();
          ctx.translate(view.pan.x, view.pan.y);
          ctx.scale(view.zoom, view.zoom);
          ctx.setLineDash([8 / view.zoom, 6 / view.zoom]);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2 / view.zoom;
          ctx.beginPath();
          ctx.moveTo(liveMirrorAxis.start.x, liveMirrorAxis.start.y);
          ctx.lineTo(liveMirrorAxis.end.x, liveMirrorAxis.end.y);
          ctx.stroke();
          ctx.setLineDash([]);
          
          [liveMirrorAxis.start, liveMirrorAxis.end].forEach(pt => {
              ctx.fillStyle = '#10b981';
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 4 / view.zoom, 0, Math.PI * 2);
              ctx.fill();
          });
          ctx.restore();
      }

      if (activeTool === 'LiveMirror' && liveMirrorState === 'axis_end' && liveMirrorAxisPt1) {
          ctx.save();
          ctx.translate(view.pan.x, view.pan.y);
          ctx.scale(view.zoom, view.zoom);
          const rawPoint = actualMousePosRef.current;
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.5 / view.zoom;
          ctx.setLineDash([6 / view.zoom, 6 / view.zoom]);
          ctx.beginPath();
          ctx.moveTo(liveMirrorAxisPt1.x, liveMirrorAxisPt1.y);
          ctx.lineTo(rawPoint.x, rawPoint.y);
          ctx.stroke();
          ctx.restore();
      }

      // Draw Specchio preview in real-time
      if (activeTool === 'Specchio') {
          ctx.save();
          ctx.translate(view.pan.x, view.pan.y);
          ctx.scale(view.zoom, view.zoom);

          const rawPoint = actualMousePosRef.current;

          // Draw the hovering axis if not yet set
          if (specchioState === 'axis_start' && specchioHoverAxisLine && specchioHoverAxisLine.type === 'line') {
              const line = specchioHoverAxisLine as LineEntity;
              ctx.save();
              ctx.strokeStyle = '#10b981'; // Green hover
              ctx.lineWidth = 2 / view.zoom;
              ctx.setLineDash([6 / view.zoom, 6 / view.zoom]);
              ctx.beginPath();
              ctx.moveTo(line.start.x, line.start.y);
              ctx.lineTo(line.end.x, line.end.y);
              ctx.stroke();
              ctx.restore();
          } else if (specchioState === 'axis_end' && specchioAxisPt1) {
              const snapRes = getSnappedPoint(rawPoint, entities, activeTool, { type: 'line', start: specchioAxisPt1, current: rawPoint } as any);
              const isWhitelistedSnap = snapRes.snapped && (
                  snapRes.subtype === 'endpoint' || 
                  snapRes.subtype === 'midpoint' || 
                  snapRes.subtype === 'perpendicular' || 
                  snapRes.subtype === 'quadrant' || 
                  snapRes.subtype === 'center' ||
                  snapRes.subtype === 'intersection'
              );
              
              let finalPt2 = snapRes.snapped ? snapRes.point : rawPoint;
              const effectiveOrthoMode = getEffectiveOrtho(undefined, true);
              if (effectiveOrthoMode && !isWhitelistedSnap) {
                  const dx = Math.abs(finalPt2.x - specchioAxisPt1.x);
                  const dy = Math.abs(finalPt2.y - specchioAxisPt1.y);
                  if (dx > dy) finalPt2.y = specchioAxisPt1.y;
                  else finalPt2.x = specchioAxisPt1.x;
              }
              ctx.save();
              ctx.setLineDash([10 / view.zoom, 10 / view.zoom]);
              ctx.strokeStyle = '#10b981'; 
              ctx.lineWidth = 1.5 / view.zoom;
              ctx.beginPath();
              ctx.moveTo(specchioAxisPt1.x, specchioAxisPt1.y);
              ctx.lineTo(finalPt2.x, finalPt2.y);
              ctx.stroke();
              ctx.restore();
          }

          // If axis is finalized, highlight it with the extensions
          if (specchioFinalAxis) {
              ctx.save();
              ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
              ctx.strokeStyle = '#10b981'; 
              ctx.lineWidth = 1.5 / view.zoom;

              if (specchioFinalAxis.isExisting) {
                  // Draw small extensions for existing lines
                  const p1 = specchioFinalAxis.start;
                  const p2 = specchioFinalAxis.end;
                  const dx = p2.x - p1.x;
                  const dy = p2.y - p1.y;
                  const len = Math.hypot(dx, dy);
                  if (len > 0) {
                      const ux = dx / len;
                      const uy = dy / len;
                      const extLen = 20 / view.zoom;
                      ctx.beginPath();
                      ctx.moveTo(p1.x, p1.y);
                      ctx.lineTo(p1.x - ux * extLen, p1.y - uy * extLen);
                      ctx.moveTo(p2.x, p2.y);
                      ctx.lineTo(p2.x + ux * extLen, p2.y + uy * extLen);
                      ctx.stroke();
                  }
              }
              ctx.restore();

              // Highlight selected objects and draw preview
              if (specchioSelectedIds.length > 0) {
                  specchioSelectedIds.forEach(id => {
                      const ent = entities.find(e => e.id === id);
                      if (ent) {
                          // highlight source
                          ctx.save();
                          if (specchioMode === 'move') {
                              ctx.globalAlpha = 0.2;
                          }
                          ctx.setLineDash([4 / view.zoom, 4 / view.zoom]);
                          ctx.strokeStyle = '#3b82f6';
                          ctx.lineWidth = 1.5 / view.zoom;
                          drawTempEntityPreview(ctx, ent);
                          ctx.restore();

                          // draw mirror preview
                          const previewEnt = mirrorEntity(ent, specchioFinalAxis.start, specchioFinalAxis.end);
                          ctx.save();
                          ctx.setLineDash([2 / view.zoom, 2 / view.zoom]);
                          ctx.strokeStyle = '#8b5cf6cc';
                          ctx.lineWidth = 1.2 / view.zoom;
                          drawTempEntityPreview(ctx, previewEnt);
                          ctx.restore();
                      }
                  });
              }
          }

          ctx.restore();
      }

      // Draw Circle Tangent preview in real-time
      if (activeTool === 'Circle') {
          ctx.save();
          ctx.translate(view.pan.x, view.pan.y);
          ctx.scale(view.zoom, view.zoom);

          const rawPoint = actualMousePosRef.current;

          if (circleTangentLine1) {
              ctx.save();
              ctx.strokeStyle = '#10b981'; 
              ctx.lineWidth = 3 / view.zoom;
              ctx.beginPath();
              ctx.moveTo(circleTangentLine1.start.x, circleTangentLine1.start.y);
              ctx.lineTo(circleTangentLine1.end.x, circleTangentLine1.end.y);
              ctx.stroke();
              ctx.restore();

              const hoverLine2 = getLineAtPoint(rawPoint);
              if (hoverLine2 && hoverLine2.id !== circleTangentLine1.id && hoverLine2.type === 'line') {
                  ctx.save();
                  ctx.strokeStyle = '#06b6d4'; 
                  ctx.lineWidth = 2.5 / view.zoom;
                  ctx.setLineDash([4 / view.zoom, 4 / view.zoom]);
                  ctx.beginPath();
                  ctx.moveTo((hoverLine2 as LineEntity).start.x, (hoverLine2 as LineEntity).start.y);
                  ctx.lineTo((hoverLine2 as LineEntity).end.x, (hoverLine2 as LineEntity).end.y);
                  ctx.stroke();
                  ctx.restore();

                  const tangentPreview = computeCircleTangentTo2Lines(
                      circleTangentLine1,
                      hoverLine2 as LineEntity,
                      circleTangentClickPt1 || rawPoint,
                      rawPoint
                  );

                  if (tangentPreview && tangentPreview.radius > 0.01) {
                      ctx.save();
                      ctx.strokeStyle = '#10b981';
                      ctx.lineWidth = 2 / view.zoom;
                      ctx.setLineDash([6 / view.zoom, 4 / view.zoom]);
                      ctx.beginPath();
                      ctx.arc(tangentPreview.center.x, tangentPreview.center.y, tangentPreview.radius, 0, Math.PI * 2);
                      ctx.stroke();

                      ctx.fillStyle = '#10b981';
                      ctx.beginPath();
                      ctx.arc(tangentPreview.center.x, tangentPreview.center.y, 3 / view.zoom, 0, Math.PI * 2);
                      ctx.fill();

                      ctx.restore();
                  }
              }
          } else if (!drawing) {
              const hoverLine1 = getLineAtPoint(rawPoint);
              if (hoverLine1 && hoverLine1.type === 'line') {
                  ctx.save();
                  ctx.strokeStyle = '#10b98188';
                  ctx.lineWidth = 2.5 / view.zoom;
                  ctx.setLineDash([4 / view.zoom, 4 / view.zoom]);
                  ctx.beginPath();
                  ctx.moveTo((hoverLine1 as LineEntity).start.x, (hoverLine1 as LineEntity).start.y);
                  ctx.lineTo((hoverLine1 as LineEntity).end.x, (hoverLine1 as LineEntity).end.y);
                  ctx.stroke();
                  ctx.restore();
              }
          }

          ctx.restore();
      }

      // Removed LENTE INGRANDIMENTO HUD FOR PRECISION MODE as per instructions
      
      // Precision Crosshair Rendering (Solo con tasto S attivo)
      if (isSKeyPressedRef.current) {
          const screenPos = canvasToScreen(lastControlledPointRef.current.x, lastControlledPointRef.current.y);
          const actualPos = canvasToScreen(actualMousePosRef.current.x, actualMousePosRef.current.y);
          
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0); // Absolute screen pixels
          
          // Draw trail to actual mouse position
          ctx.beginPath();
          ctx.setLineDash([2, 4]);
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
          ctx.lineWidth = 1;
          ctx.moveTo(screenPos.x, screenPos.y);
          ctx.lineTo(actualPos.x, actualPos.y);
          ctx.stroke();
          
          // Draw dampened crosshair (Emerald precision cursor)
          ctx.setLineDash([]);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          const size = 18;
          ctx.beginPath();
          ctx.moveTo(screenPos.x - size, screenPos.y);
          ctx.lineTo(screenPos.x + size, screenPos.y);
          ctx.moveTo(screenPos.x, screenPos.y - size);
          ctx.lineTo(screenPos.x, screenPos.y + size);
          ctx.stroke();
          
          // Circle focus indicator
          ctx.beginPath();
          ctx.arc(screenPos.x, screenPos.y, 7, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.restore();
      }
      // Highlight Area Funzionale being classified (Pulsing Green Border)
      if (highlightedPoints) {
          let polysToDraw = [];
          if (Array.isArray(highlightedPoints)) {
              if (highlightedPoints.length > 0 && !('points' in highlightedPoints[0])) {
                  polysToDraw = [{ points: highlightedPoints, holes: undefined, isLinear: false }];
              } else {
                  polysToDraw = highlightedPoints;
              }
          } else {
              polysToDraw = [highlightedPoints];
          }

          ctx.save();
          ctx.translate(view.pan.x, view.pan.y);
          ctx.scale(view.zoom, view.zoom);
          
          const opacity = 0.3 + 0.7 * Math.abs(Math.sin(Date.now() / 250));
          
          for (const poly of polysToDraw) {
              const hPoints = poly.points;
              const hHoles = poly.holes;
              const isLinearH = !!poly.isLinear;

              if (hPoints && hPoints.length > 2) {
                  ctx.beginPath();
                  ctx.moveTo(hPoints[0].x, hPoints[0].y);
                  for (let i = 1; i < hPoints.length; i++) {
                      ctx.lineTo(hPoints[i].x, hPoints[i].y);
                  }
                  if (!isLinearH) ctx.closePath();
                  
                  if (hHoles) {
                      hHoles.forEach((hole: Point[]) => {
                          if (hole.length < 3) return;
                          ctx.moveTo(hole[0].x, hole[0].y);
                          for (let i = 1; i < hole.length; i++) ctx.lineTo(hole[i].x, hole[i].y);
                          ctx.closePath();
                      });
                  }

                  // Outer Glow / Flash
                  ctx.strokeStyle = `rgba(16, 185, 129, ${opacity})`;
                  ctx.lineWidth = 4 / view.zoom;
                  ctx.stroke();

                  // Inner sharp border
                  ctx.strokeStyle = '#34d399';
                  ctx.lineWidth = 1.5 / view.zoom;
                  ctx.setLineDash([5 / view.zoom, 3 / view.zoom]);
                  ctx.stroke();

                  // Subtle fill
                  if (!isLinearH) {
                      ctx.fillStyle = `rgba(52, 211, 153, 0.1)`;
                      ctx.fill('evenodd');
                  }
              }
          }
          ctx.restore();
      }

      // Draw yellow reference distance indicator on physical drawing space
      if (selectedLine && referenceLine) {
          ctx.save();
          ctx.translate(view.pan.x, view.pan.y);
          ctx.scale(view.zoom, view.zoom);

          const liveSelectedLine = (entities.find(e => e.id === selectedLine.id) as LineEntity) || selectedLine;

          const cx = selectedLineClickPoint ? selectedLineClickPoint.x : (liveSelectedLine.start.x + liveSelectedLine.end.x) / 2;
          const cy = selectedLineClickPoint ? selectedLineClickPoint.y : (liveSelectedLine.start.y + liveSelectedLine.end.y) / 2;

          const A = referenceLine.start;
          const B = referenceLine.end;
          const dx = B.x - A.x;
          const dy = B.y - A.y;
          const lenSq = dx * dx + dy * dy;
          
          let projX = cx;
          let projY = cy;
          if (lenSq > 0) {
              const t = ((cx - A.x) * dx + (cy - A.y) * dy) / lenSq;
              projX = A.x + t * dx;
              projY = A.y + t * dy;
          }

          const connX = projX - cx;
          const connY = projY - cy;
          const connLen = Math.hypot(connX, connY);

          // Draw a faint infinite line to show the reference plane if needed
          ctx.strokeStyle = '#ca8a04'; 
          ctx.lineWidth = 1 / view.zoom;
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.moveTo(A.x - dx * 1000, A.y - dy * 1000);
          ctx.lineTo(A.x + dx * 1000, A.y + dy * 1000);
          ctx.stroke();
          ctx.globalAlpha = 1.0;

          // Draw the yellow line connecting the two parallels
          ctx.strokeStyle = '#ca8a04'; // Muted dark yellow/amber for strong contrast on off-white
          ctx.lineWidth = 2 / view.zoom;
          ctx.setLineDash([5 / view.zoom, 3 / view.zoom]);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(projX, projY);
          ctx.stroke();

          // Connectors with solid yellow dots
          ctx.setLineDash([]);
          ctx.fillStyle = '#f59e0b'; // Amber-500
          ctx.strokeStyle = '#78350f'; // Dark brown-amber border
          ctx.lineWidth = 1 / view.zoom;
          
          ctx.beginPath();
          ctx.arc(cx, cy, 5 / view.zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(projX, projY, 5 / view.zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Draw small perpendicular tick bars at ends
          if (connLen > 0.1) {
              const nx = -connY / connLen;
              const ny = connX / connLen;
              const tickH = 8 / view.zoom;
              ctx.strokeStyle = '#78350f';
              ctx.lineWidth = 1.5 / view.zoom;
              ctx.beginPath();
              
              ctx.moveTo(cx - nx * tickH, cy - ny * tickH);
              ctx.lineTo(cx + nx * tickH, cy + ny * tickH);
              
              ctx.moveTo(projX - nx * tickH, projY - ny * tickH);
              ctx.lineTo(projX + nx * tickH, projY + ny * tickH);
              
              ctx.stroke();
          }

          // Draw clean rounded textbox with background
          const refDecimals = view.zoom >= 1.2 ? 3 : (view.zoom >= 0.45 ? 2 : (view.zoom >= 0.20 ? 1 : 0));
          const distanceVal = connLen.toFixed(refDecimals).replace('.', ',');
          const label = `${distanceVal} cm`;
          ctx.font = `bold ${12 / view.zoom}px sans-serif`;
          const textMetrics = ctx.measureText(label);
          const paddingX = 6 / view.zoom;
          const paddingY = 4 / view.zoom;
          const boxW = textMetrics.width + paddingX * 2;
          const boxH = 18 / view.zoom;
          const textMidX = (cx + projX) / 2;
          const textMidY = (cy + projY) / 2;

          ctx.fillStyle = '#fef08a'; // Bright yellow bg
          ctx.strokeStyle = '#a16207'; // Yellow-700 border
          ctx.lineWidth = 1 / view.zoom;
          ctx.beginPath();
          ctx.roundRect(textMidX - boxW / 2, textMidY - boxH / 2, boxW, boxH, 4 / view.zoom);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#713f12'; // Dark brown text for maximum contrast
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, textMidX, textMidY);

          ctx.restore();
      }

      // Draw the active drafting instrument nib (CAD reticle, China Rapidograph, or Matita Grafite) at the exact drawing point
      const activeInstrumentTip = drawing ? drawing.current : (hoverSnap ? hoverSnap.point : (actualMousePosRef.current || lastMouseRef.current));
      if (activeInstrumentTip) {
        drawActiveInstrumentNib(activeInstrumentTip);
      }
    };

    renderRef.current = render;
    render(); // Initial render for this effect run
  }, [entities, layers, view, flashIds, flashIntensity, selectedParallelLine, blink, selectedEntityId, 
      positioningGroupId, positioningEntityId, selectedRaccordoLineIds, dragEntityIds, highlightedTrimLine, 
      highlightedTrimSegment, allungaHover, activeTool, specchioMode, specchioSelectedIds, copySourceEntityIds, eraserPos, 
      tecnigrafoOrigin, tecnigrafoLock, manualRoomPoints, drawing, highlightedPoints, selectedLine, referenceLine, hoveredBIMSegments, hoveredLineId, showSquadrette, squadrette,
      defaultLineStyle, hoverSnap, snapEnabled, isShiftPressed, isContinuousMode]);


  // BASIC PAN/ZOOM HANDLING
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (isPanningRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Calculate the ideal center based on existing entities (using projection for rotated objects)
    const getIdealCenter = () => {
        const projected = entities.map(getProjectedEntity);
        if (projected.length === 0) return { x: 0, y: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        projected.forEach(ent => {
             if (ent.type === 'line') {
                 minX = Math.min(minX, ent.start.x, ent.end.x);
                 maxX = Math.max(maxX, ent.start.x, ent.end.x);
                 minY = Math.min(minY, ent.start.y, ent.end.y);
                 maxY = Math.max(maxY, ent.start.y, ent.end.y);
             } else if (ent.type === 'circle' && (ent as CircleEntity).radius) {
                 const radius = (ent as CircleEntity).radius || 0;
                 minX = Math.min(minX, ent.center.x - radius);
                 maxX = Math.max(maxX, ent.center.x + radius);
                 minY = Math.min(minY, ent.center.y - radius);
                 maxY = Math.max(maxY, ent.center.y + radius);
             } else if (ent.type === 'rectangle') {
                 const r = ent as RectEntity;
                 minX = Math.min(minX, r.p1.x, r.p2.x);
                 maxX = Math.max(maxX, r.p1.x, r.p2.x);
                 minY = Math.min(minY, r.p1.y, r.p2.y);
                 maxY = Math.max(maxY, r.p1.y, r.p2.y);
             }
        });

        if (minX === Infinity) return { x: 0, y: 0 };
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    };

    const rect = canvas.getBoundingClientRect();
    // Normalization for cross-browser wheel delta
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 40; // Lines
    else if (e.deltaMode === 2) delta *= 800; // Pages

    // User requested "at least double" speed. Base was 0.0015. 
    // We increase base to 0.003. 
    // The "too rapid" issue was caused by a 10x jump in isContinuousMode.
    // We reduce that jump to 2.5x to keep it fast but controllable.
    const baseSensitivity = isContinuousMode ? 0.003 * 2.5 : 0.003;
    const zoomSensitivity = effectiveMagicZoom ? baseSensitivity * 5.0 : baseSensitivity;
    const zoomFactor = Math.pow(0.95, delta * zoomSensitivity);

    const focus = screenToCanvas(rect.width / 2, rect.height / 2);

    setView(prev => {
        const newZoom = Math.max(0.01, prev.zoom * zoomFactor);
        const newPan = {
            x: prev.pan.x + (focus.x * (prev.zoom - newZoom)),
            y: prev.pan.y + (focus.y * (prev.zoom - newZoom))
        };
        return { zoom: newZoom, pan: newPan };
    });
  };

  const handlePrecisionAdjust = (dir: -1 | 1) => {
    const isShift = isShiftPressedRef.current;
    const step = isShift ? 0.1 : 1.0;
    
    if (activeTool === 'Parallel' && selectedParallelLine && !isContinuousMode) {

        if (!isParallelWheelActive) {
            setIsParallelWheelActive(true);
            const line = selectedParallelLine as LineEntity;
            const dxLine = line.end.x - line.start.x;
            const dyLine = line.end.y - line.start.y;
            const L = Math.sqrt(dxLine * dxLine + dyLine * dyLine);
            if (L > 0 && parallelMouse) {
                const normX = -dyLine / L;
                const normY = dxLine / L;
                const vecMouse = { x: parallelMouse.x - line.start.x, y: parallelMouse.y - line.start.y };
                const curSign = (vecMouse.x * normX + vecMouse.y * normY) >= 0 ? 1 : -1;
                setParallelSign(curSign);
            } else {
                setParallelSign(1);
            }
        }
        setParallelDistance(prev => {
            let baseVal = prev;
            if (isShift) {
                baseVal = Math.round(prev * 10) / 10;
            } else {
                baseVal = Math.round(prev);
            }
            let newVal = baseVal + dir * step;
            if (newVal < 0) newVal = 0;
            const res = Math.round(newVal * 100) / 100;
            setParallelInputString(res.toString());
            return res;
        });
        return;
    }

    if (drawing) {
        const dx = drawing.current.x - drawing.start.x;
        const dy = drawing.current.y - drawing.start.y;
        const currentLength = Math.sqrt(dx * dx + dy * dy);

        let baseLength = currentLength;
        if (isShift) {
            baseLength = Math.round(currentLength * 10) / 10;
        } else {
            baseLength = Math.round(currentLength);
        }

        let newLength = baseLength + dir * step;
        if (newLength < 0.1) newLength = 0.1;
        newLength = Math.round(newLength * 100) / 100;

        let ux = 1;
        let uy = 0;
        
        if (drawing.lockedDir) {
            ux = drawing.lockedDir.x;
            uy = drawing.lockedDir.y;
        } else {
            const isExtensionSnap = drawing.snapType === 'smart' && drawing.refEntityId;
            let foundRefAngle = false;
            
            if (isExtensionSnap) {
                const refEnt = entities.find(e => e.id === drawing.refEntityId);
                if (refEnt && refEnt.type === 'line') {
                    const l = refEnt as LineEntity;
                    const dxL = l.end.x - l.start.x;
                    const dyL = l.end.y - l.start.y;
                    const L_ref = Math.sqrt(dxL*dxL + dyL*dyL);
                    if (L_ref > 0.001) {
                        ux = dxL / L_ref;
                        uy = dyL / L_ref;
                        const dot = dx * ux + dy * uy;
                        if (dot < 0) { ux = -ux; uy = -uy; }
                        foundRefAngle = true;
                    }
                }
            }
            
            if (!foundRefAngle && currentLength > 0.01) {
                ux = dx / currentLength;
                uy = dy / currentLength;
            }
        }

        const newCurrentPoint = {
            x: drawing.start.x + ux * newLength,
            y: drawing.start.y + uy * newLength
        };

        setDrawing(prev => {
            if (!prev) return null;
            const preserveSnap = prev.snapType === 'smart';
            return {
                ...prev,
                wheelLength: newLength,
                lockedDir: prev.lockedDir || { x: ux, y: uy },
                current: newCurrentPoint,
                snapType: preserveSnap ? prev.snapType : undefined,
                refPoint: preserveSnap ? prev.refPoint : undefined,
                refEntityId: preserveSnap ? prev.refEntityId : undefined,
                constraintAxis: preserveSnap ? prev.constraintAxis : undefined,
                refPoint2: preserveSnap ? prev.refPoint2 : undefined,
                constraintAxis2: preserveSnap ? prev.constraintAxis2 : undefined,
                hasDoubleSmart: preserveSnap ? prev.hasDoubleSmart : false
            };
        });
    }
  };

  const executeEraser = (rawPoint: Point, force: boolean = false) => {
        if (!force) {
            const throttleTime = 10;
            if (Date.now() - lastEraserExecutionTime.current < throttleTime) return;
        }
        lastEraserExecutionTime.current = Date.now();
        const isLametta = eraserType === 'lametta';
        
        // Match the radius to the visual size
        const radius = isLametta ? (1.6 / view.zoom) : (eraserRadius / view.zoom);
        const now = Date.now();
        
        const getBaseEntityId = (id: string): string => {
            const markers = ['_out_', '_in_', '_rect_', '_arc_', '_fsplit_'];
            let currentId = id;
            for (const marker of markers) {
                const idx = currentId.indexOf(marker);
                if (idx !== -1) {
                    currentId = currentId.substring(0, idx);
                }
            }
            return currentId;
        };

        let changed = false;
        
        const pointsToErase = [rawPoint];
        if (liveMirrorAxis) {
            pointsToErase.push(mirrorPoint(rawPoint, liveMirrorAxis.start, liveMirrorAxis.end));
        }

        let currentEntities = [...entitiesRef.current];

        for (const pt of pointsToErase) {
            const newEntities: Entity[] = [];
            let pointChanged = false;

            for (const ent of currentEntities) {
                if ((ent as any).isLiveMirrorCopy) {
                    newEntities.push(ent);
                    continue;
                }

                const isPencilEntity = (ent as any).mode === 'pencil';
                const isInkEntity = (ent as any).mode === 'ink';
                
                // 1. Gray pencil eraser only cancels pencil lines
                if (eraserType === 'pencil') {
                    if (!isPencilEntity) {
                        newEntities.push(ent);
                        continue;
                    }
                }
                
                // 2. Yellow eraser only cancels ink/china lines
                if (eraserType === 'all') {
                    if (!isInkEntity) {
                        newEntities.push(ent);
                        continue;
                    }
                }
                
                // 3. Gillette blade (lametta) cancels everything at its sharp pinpoint corner, so no skip.

                const baseId = getBaseEntityId(ent.id);

                if (ent.type === 'line') {
                    if (ent.inkPoints) {
                        // Freehand lines (pencil or ink)
                        let pointHit = false;
                        const updatedPoints = ent.inkPoints.map((inkPt, i) => {
                            const dist = Math.sqrt((pt.x - inkPt.x)**2 + (pt.y - inkPt.y)**2);
                            if (dist <= radius) {
                                const pointKey = `${ent.id}_${i}`;
                                const lastErase = lastEraseTimeByPoint.current[pointKey] || 0;
                                const cooldown = isLametta ? 120 : 350; // faster, responsive for lametta
                                if (now - lastErase > cooldown) {
                                    lastEraseTimeByPoint.current[pointKey] = now;
                                    pointHit = true;
                                    let nextAlpha = inkPt.alpha;
                                    if (eraserType === 'pencil') {
                                        if (inkPt.alpha > 0.6) {
                                            nextAlpha = 0.5; // First pass leaves a gray residue
                                        } else {
                                            nextAlpha = 0; // Second pass removes completely
                                        }
                                    } else if (eraserType === 'all') {
                                        if (inkPt.alpha > 0.75) {
                                            nextAlpha = 0.66; // First pass residue
                                        } else if (inkPt.alpha > 0.4) {
                                            nextAlpha = 0.33; // Second pass residue
                                        } else {
                                            nextAlpha = 0; // Third pass removes completely
                                        }
                                    } else if (eraserType === 'lametta') {
                                        // Lametta leaves a very faint scratched trace, consumed paper effect!
                                        nextAlpha = 0.15; 
                                    }
                                    return { ...inkPt, alpha: nextAlpha };
                                }
                            }
                            return inkPt;
                        });
                        
                        if (pointHit) {
                            pointChanged = true;
                            changed = true;
                            
                            // Physically split the freehand line into separate entities at any erased points (alpha <= 0.05)
                            const subArrays: typeof ent.inkPoints[] = [];
                            let currentSub: typeof ent.inkPoints = [];
                            
                            for (const inkPt of updatedPoints) {
                                if (inkPt.alpha > 0.05) {
                                    currentSub.push(inkPt);
                                } else {
                                    if (currentSub.length > 0) {
                                        subArrays.push(currentSub);
                                        currentSub = [];
                                    }
                                }
                            }
                            if (currentSub.length > 0) {
                                subArrays.push(currentSub);
                            }
                            
                            subArrays.forEach((sub, idx) => {
                                if (sub.length > 0) {
                                    newEntities.push({
                                        ...ent,
                                        id: ent.id + `_fsplit_${idx}_` + Math.random(),
                                        start: { x: sub[0].x, y: sub[0].y },
                                        end: { x: sub[sub.length - 1].x, y: sub[sub.length - 1].y },
                                        inkPoints: sub
                                    });
                                }
                            });
                        } else {
                            newEntities.push(ent);
                        }
                    } else {
                        // Standard CAD line segment
                        const splitResult = splitLineSegmentWithCircle(ent.start, ent.end, pt, radius);
                        if (splitResult.inside.length > 0) {
                            pointChanged = true;
                            changed = true;
                            // Keep outside segments completely untouched
                            splitResult.outside.forEach((seg, i) => {
                                newEntities.push({
                                    ...ent,
                                    id: ent.id + `_out_${i}_` + Math.random(),
                                    start: seg.start,
                                    end: seg.end
                                });
                            });
                            // Fade inside segments
                            splitResult.inside.forEach((seg, i) => {
                                const lastErase = lastEraseTimeByEntityId.current[baseId] || 0;
                                const currentOpacity = ent.opacity !== undefined ? ent.opacity : 1.0;
                                let nextOpacity = currentOpacity;
                                
                                const cooldown = isLametta ? 120 : 350;
                                if (now - lastErase > cooldown) {
                                    if (eraserType === 'pencil') {
                                        if (currentOpacity > 0.6) {
                                            nextOpacity = 0.5; // First pass residue
                                        } else {
                                            nextOpacity = 0; // Second pass removes completely
                                        }
                                    } else if (eraserType === 'all') {
                                        if (currentOpacity > 0.75) {
                                            nextOpacity = 0.66; // First pass residue
                                        } else if (currentOpacity > 0.4) {
                                            nextOpacity = 0.33; // Second pass residue
                                        } else {
                                            nextOpacity = 0; // Third pass removes completely
                                        }
                                    } else if (eraserType === 'lametta') {
                                        nextOpacity = 0.15; // Lametta leaves faint scratched trace
                                    }
                                    lastEraseTimeByEntityId.current[baseId] = now;
                                }
                                
                                if (nextOpacity > 0.05) {
                                    newEntities.push({
                                        ...ent,
                                        id: ent.id + `_in_${i}_` + Math.random(),
                                        start: seg.start,
                                        end: seg.end,
                                        opacity: nextOpacity
                                    });
                                }
                            });
                        } else {
                            newEntities.push(ent);
                        }
                    }
                } else if (ent.type === 'circle' || ent.type === 'arc') {
                    const isCircle = ent.type === 'circle';
                    const startAngle = ent.type === 'arc' ? ent.startAngle : 0;
                    const endAngle = ent.type === 'arc' ? ent.endAngle : 360;
                    const splitRes = getArcSubsegmentsInsideAndOutsideEraser(ent.center, ent.radius, startAngle, endAngle, isCircle, pt, radius);
                    
                    if (splitRes) {
                        pointChanged = true;
                        changed = true;
                        // Outside parts are kept regular
                        splitRes.outside.forEach((interval, i) => {
                            newEntities.push({
                                ...ent,
                                id: ent.id + `_arc_out_${i}_` + Math.random(),
                                type: 'arc',
                                startAngle: interval.startAngle,
                                endAngle: interval.endAngle
                            } as ArcEntity);
                        });
                        // Inside parts are kept and faded
                        splitRes.inside.forEach((interval, i) => {
                            const lastErase = lastEraseTimeByEntityId.current[baseId] || 0;
                            const currentOpacity = ent.opacity !== undefined ? ent.opacity : 1.0;
                            let nextOpacity = currentOpacity;
                            
                            const cooldown = isLametta ? 120 : 350;
                            if (now - lastErase > cooldown) {
                                if (eraserType === 'pencil') {
                                    if (currentOpacity > 0.6) {
                                        nextOpacity = 0.5;
                                    } else {
                                        nextOpacity = 0;
                                    }
                                } else if (eraserType === 'all') {
                                    if (currentOpacity > 0.75) {
                                        nextOpacity = 0.66;
                                    } else if (currentOpacity > 0.4) {
                                        nextOpacity = 0.33;
                                    } else {
                                        nextOpacity = 0;
                                    }
                                } else if (eraserType === 'lametta') {
                                    nextOpacity = 0.15;
                                }
                                lastEraseTimeByEntityId.current[baseId] = now;
                            }

                            if (nextOpacity > 0.05) {
                                newEntities.push({
                                    ...ent,
                                    id: ent.id + `_arc_in_${i}_` + Math.random(),
                                    type: 'arc',
                                    startAngle: interval.startAngle,
                                    endAngle: interval.endAngle,
                                    opacity: nextOpacity
                                } as ArcEntity);
                            }
                        });
                    } else {
                        newEntities.push(ent);
                    }
                } else if (ent.type === 'rectangle') {
                    // To erase a rectangle partially, explode it to 4 lines and split lines!
                    const w = ent.p2.x - ent.p1.x;
                    const h = ent.p2.y - ent.p1.y;
                    const edges = [
                        { start: ent.p1, end: { x: ent.p1.x + w, y: ent.p1.y } },
                        { start: { x: ent.p1.x + w, y: ent.p1.y }, end: ent.p2 },
                        { start: ent.p2, end: { x: ent.p1.x, y: ent.p1.y + h } },
                        { start: { x: ent.p1.x, y: ent.p1.y + h }, end: ent.p1 }
                    ];
                    
                    let rectHit = false;
                    const hitLinesResult: Entity[] = [];
                    
                    edges.forEach((edge, idx) => {
                        const splitResult = splitLineSegmentWithCircle(edge.start, edge.end, pt, radius);
                        if (splitResult.inside.length > 0) {
                            rectHit = true;
                            splitResult.outside.forEach((seg, i) => {
                                hitLinesResult.push({
                                    id: ent.id + `_rect_edge_${idx}_out_${i}_` + Math.random(),
                                    type: 'line',
                                    color: ent.color,
                                    lineWidth: ent.lineWidth,
                                    dashed: ent.dashed,
                                    mode: ent.mode,
                                    start: seg.start,
                                    end: seg.end,
                                    opacity: ent.opacity,
                                    layer: ent.layer
                                } as LineEntity);
                            });
                            splitResult.inside.forEach((seg, i) => {
                                const lastErase = lastEraseTimeByEntityId.current[baseId] || 0;
                                const currentOpacity = ent.opacity !== undefined ? ent.opacity : 1.0;
                                let nextOpacity = currentOpacity;
                                
                                const cooldown = isLametta ? 120 : 350;
                                if (now - lastErase > cooldown) {
                                    if (eraserType === 'pencil') {
                                        if (currentOpacity > 0.6) {
                                            nextOpacity = 0.5;
                                        } else {
                                            nextOpacity = 0;
                                        }
                                    } else if (eraserType === 'all') {
                                        if (currentOpacity > 0.75) {
                                            nextOpacity = 0.66;
                                        } else if (currentOpacity > 0.4) {
                                            nextOpacity = 0.33;
                                        } else {
                                            nextOpacity = 0;
                                        }
                                    } else if (eraserType === 'lametta') {
                                        nextOpacity = 0.15;
                                    }
                                    lastEraseTimeByEntityId.current[baseId] = now;
                                }

                                if (nextOpacity > 0.05) {
                                    hitLinesResult.push({
                                        id: ent.id + `_rect_edge_${idx}_in_${i}_` + Math.random(),
                                        type: 'line',
                                        color: ent.color,
                                        lineWidth: ent.lineWidth,
                                        dashed: ent.dashed,
                                        mode: ent.mode,
                                        start: seg.start,
                                        end: seg.end,
                                        opacity: nextOpacity,
                                        layer: ent.layer
                                    } as LineEntity);
                                }
                            });
                        } else {
                            hitLinesResult.push({
                                id: ent.id + `_rect_edge_${idx}_` + Math.random(),
                                type: 'line',
                                color: ent.color,
                                lineWidth: ent.lineWidth,
                                dashed: ent.dashed,
                                mode: ent.mode,
                                start: edge.start,
                                end: edge.end,
                                opacity: ent.opacity,
                                layer: ent.layer
                            } as LineEntity);
                        }
                    });
                    
                    if (rectHit) {
                        pointChanged = true;
                        changed = true;
                        newEntities.push(...hitLinesResult);
                    } else {
                        newEntities.push(ent);
                    }
                } else if (ent.type === 'dimension') {
                    const { p1, p2 } = getDimensionLinePoints(ent);
                    const hitDimension = distanceToSegment(pt, p1, p2) < radius;
                    
                    if (hitDimension) {
                        const lastErase = lastEraseTimeByEntityId.current[ent.id] || 0;
                        const cooldown = isLametta ? 120 : 450;
                        if (now - lastErase > cooldown) {
                            lastEraseTimeByEntityId.current[ent.id] = now;
                            pointChanged = true;
                            changed = true;
                            const currentOpacity = ent.opacity !== undefined ? ent.opacity : 1.0;
                            let nextOpacity = currentOpacity;
                            if (eraserType === 'pencil') {
                                if (currentOpacity > 0.6) nextOpacity = 0.5;
                                else nextOpacity = 0;
                            } else if (eraserType === 'all') {
                                if (currentOpacity > 0.75) nextOpacity = 0.66;
                                else if (currentOpacity > 0.4) nextOpacity = 0.33;
                                else nextOpacity = 0;
                            } else if (eraserType === 'lametta') {
                                nextOpacity = 0.15;
                            }
                            if (nextOpacity > 0.05) {
                                newEntities.push({
                                    ...ent,
                                    opacity: nextOpacity
                                });
                            }
                        } else {
                            newEntities.push(ent);
                        }
                    } else {
                        newEntities.push(ent);
                    }
                } else if (ent.type === 'hatch') {
                    const h = ent as any;
                    let hitHatch = false;
                    if (h.points) {
                        hitHatch = h.points.some((hp: Point) => Math.sqrt((pt.x - hp.x)**2 + (pt.y - hp.y)**2) <= radius) || isPointInPolygon(pt, h.points);
                    }
                    if (hitHatch) {
                        const lastErase = lastEraseTimeByEntityId.current[ent.id] || 0;
                        const cooldown = isLametta ? 120 : 450;
                        if (now - lastErase > cooldown) {
                            lastEraseTimeByEntityId.current[ent.id] = now;
                            pointChanged = true;
                            changed = true;
                            const currentOpacity = ent.opacity !== undefined ? ent.opacity : 1.0;
                            let nextOpacity = currentOpacity;
                            if (eraserType === 'pencil') {
                                if (currentOpacity > 0.6) nextOpacity = 0.5;
                                else nextOpacity = 0;
                            } else if (eraserType === 'all') {
                                if (currentOpacity > 0.75) nextOpacity = 0.66;
                                else if (currentOpacity > 0.4) nextOpacity = 0.33;
                                else nextOpacity = 0;
                            } else if (eraserType === 'lametta') {
                                nextOpacity = 0.15;
                            }
                            if (nextOpacity > 0.05) {
                                newEntities.push({
                                    ...ent,
                                    opacity: nextOpacity
                                });
                            }
                        } else {
                            newEntities.push(ent);
                        }
                    } else {
                        newEntities.push(ent);
                    }
                } else {
                    let hitPoint = false;
                    if (ent.type === 'point') {
                        const p = ent.point;
                        const dist = Math.sqrt((pt.x - p.x)**2 + (pt.y - p.y)**2);
                        hitPoint = dist <= radius;
                    }
                    if (hitPoint) {
                        const lastErase = lastEraseTimeByEntityId.current[ent.id] || 0;
                        const cooldown = isLametta ? 120 : 450;
                        if (now - lastErase > cooldown) {
                            lastEraseTimeByEntityId.current[ent.id] = now;
                            pointChanged = true;
                            changed = true;
                            const currentOpacity = ent.opacity !== undefined ? ent.opacity : 1.0;
                            let nextOpacity = currentOpacity;
                            if (eraserType === 'pencil') {
                                if (currentOpacity > 0.6) nextOpacity = 0.5;
                                else nextOpacity = 0;
                            } else if (eraserType === 'all') {
                                if (currentOpacity > 0.75) nextOpacity = 0.66;
                                else if (currentOpacity > 0.4) nextOpacity = 0.33;
                                else nextOpacity = 0;
                            } else if (eraserType === 'lametta') {
                                nextOpacity = 0.15;
                            }
                            if (nextOpacity > 0.05) {
                                newEntities.push({
                                    ...ent,
                                    opacity: nextOpacity
                                });
                            }
                        } else {
                            newEntities.push(ent);
                        }
                    } else {
                        newEntities.push(ent);
                    }
                }
            }
            if (pointChanged) {
                currentEntities = newEntities;
            }
        }

        if (changed) {
            if (setEntitiesSilent) setEntitiesSilent(currentEntities);
            else setEntities(currentEntities);
        }
  };

  const getIntersections = (entA: Entity, entB: Entity): Point[] => {
    const pts: Point[] = [];
    if (entA.id === entB.id) return pts;

    const getPolylineSegmentsIntersections = (lineStart: Point, lineEnd: Point, poly: Point[]): Point[] => {
        const intersections: Point[] = [];
        for (let i = 0; i < poly.length - 1; i++) {
            const p3 = poly[i];
            const p4 = poly[i+1];
            const x1 = lineStart.x, y1 = lineStart.y, x2 = lineEnd.x, y2 = lineEnd.y;
            const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
            const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
            if (denom !== 0) {
                const t = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
                const u = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
                const eps = 1e-4;
                if (t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps) {
                    const tClamped = Math.max(0, Math.min(1, t));
                    intersections.push({ x: x1 + tClamped * (x2 - x1), y: y1 + tClamped * (y2 - y1) });
                }
            }
        }
        return intersections;
    };

    // Both are lines
    if (entA.type === 'line' && entB.type === 'line') {
        const polyA = (entA as LineEntity).inkPoints;
        const polyB = (entB as LineEntity).inkPoints;
        if (polyA && polyA.length > 1 && polyB && polyB.length > 1) {
            polyA.forEach((_, i) => {
                if (i === polyA.length - 1) return;
                const ptsSub = getPolylineSegmentsIntersections(polyA[i], polyA[i+1], polyB);
                pts.push(...ptsSub);
            });
            return pts;
        } else if (polyA && polyA.length > 1) {
            return getPolylineSegmentsIntersections((entB as LineEntity).start, (entB as LineEntity).end, polyA);
        } else if (polyB && polyB.length > 1) {
            return getPolylineSegmentsIntersections((entA as LineEntity).start, (entA as LineEntity).end, polyB);
        } else {
            const x1 = entA.start.x, y1 = entA.start.y, x2 = entA.end.x, y2 = entA.end.y;
            const x3 = entB.start.x, y3 = entB.start.y, x4 = entB.end.x, y4 = entB.end.y;
            const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
            
            const eps = 0.8; // Tolerance for "no contact" situations
            
            if (Math.abs(denom) > 1e-10) {
                const t = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
                const u = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
                
                const overlapEps = 0.05; 
                if (t >= -overlapEps && t <= 1 + overlapEps && u >= -overlapEps && u <= 1 + overlapEps) {
                    const tClamped = Math.max(0, Math.min(1, t));
                    pts.push({ x: x1 + tClamped * (x2 - x1), y: y1 + tClamped * (y2 - y1) });
                }
            }
            
            // Proximity checks: if an endpoint is very close to the other segment
            const dBStart = distToSegment({x: x3, y: y3}, entA.start, entA.end);
            if (dBStart < eps) pts.push({x: x3, y: y3});
            
            const dBEnd = distToSegment({x: x4, y: y4}, entA.start, entA.end);
            if (dBEnd < eps) pts.push({x: x4, y: y4});
            
            const dAStart = distToSegment({x: x1, y: y1}, entB.start, entB.end);
            if (dAStart < eps) pts.push({x: x1, y: y1});
            
            const dAEnd = distToSegment({x: x2, y: y2}, entB.start, entB.end);
            if (dAEnd < eps) pts.push({x: x2, y: y2});
        }
    }
    // line and circle / arc
    else if ((entA.type === 'line' && (entB.type === 'circle' || entB.type === 'arc')) ||
             ((entA.type === 'circle' || entA.type === 'arc') && entB.type === 'line')) {
        const line = entA.type === 'line' ? entA as LineEntity : entB as LineEntity;
        const circle = entA.type === 'line' ? entB as (CircleEntity | ArcEntity) : entA as (CircleEntity | ArcEntity);
        
        const getCircleSegmentIntersections = (s: Point, e: Point): Point[] => {
            const subPts: Point[] = [];
            const d = { x: e.x - s.x, y: e.y - s.y };
            const v = { x: s.x - circle.center.x, y: s.y - circle.center.y };
            const a = d.x * d.x + d.y * d.y;
            const b = 2 * (v.x * d.x + v.y * d.y);
            const c = (v.x * v.x + v.y * v.y) - circle.radius * circle.radius;
            if (a !== 0) {
                let discriminant = b * b - 4 * a * c;
                if (discriminant < 0 && discriminant >= -1e-3) {
                    discriminant = 0;
                }
                if (discriminant >= 0) {
                    const sqrtD = Math.sqrt(discriminant);
                    const t1 = (-b - sqrtD) / (2 * a);
                    const t2 = (-b + sqrtD) / (2 * a);
                    const epsLineCircle = 0.08; 
                    [t1, t2].forEach(t => {
                        if (t >= -epsLineCircle && t <= 1 + epsLineCircle) {
                            const tClamped = Math.max(0, Math.min(1, t));
                            const p = { x: s.x + tClamped * d.x, y: s.y + tClamped * d.y };
                            if (circle.type === 'arc') {
                                const angle = Math.atan2(p.y - circle.center.y, p.x - circle.center.x) * 180 / Math.PI;
                                if (isAngleInArc(angle, circle.startAngle, circle.endAngle)) {
                                    subPts.push(p);
                                }
                            } else {
                                subPts.push(p);
                            }
                        }
                    });
                }
            }

            // Proximity & Quadrant checks for snapping (midpoints, endpoints, quadrant contact points)
            const epsProximity = 0.8;
            const checkAndPushPoint = (pt: Point) => {
                const distToC = Math.hypot(pt.x - circle.center.x, pt.y - circle.center.y);
                if (Math.abs(distToC - circle.radius) < epsProximity) {
                    const angle = Math.atan2(pt.y - circle.center.y, pt.x - circle.center.x);
                    const projP = {
                        x: circle.center.x + circle.radius * Math.cos(angle),
                        y: circle.center.y + circle.radius * Math.sin(angle)
                    };
                    if (circle.type === 'arc') {
                        const angleDeg = angle * 180 / Math.PI;
                        if (!isAngleInArc(angleDeg, circle.startAngle, circle.endAngle)) return;
                    }
                    if (!subPts.some(existing => Math.hypot(existing.x - projP.x, existing.y - projP.y) < 0.1)) {
                        subPts.push(projP);
                    }
                }
            };

            checkAndPushPoint(s);
            checkAndPushPoint(e);
            checkAndPushPoint({ x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 });

            const quads: Point[] = [
                { x: circle.center.x + circle.radius, y: circle.center.y },
                { x: circle.center.x, y: circle.center.y + circle.radius },
                { x: circle.center.x - circle.radius, y: circle.center.y },
                { x: circle.center.x, y: circle.center.y - circle.radius }
            ];
            quads.forEach(q => {
                if (distToSegment(q, s, e) < epsProximity) {
                    checkAndPushPoint(q);
                }
            });

            return subPts;
        };

        if (line.inkPoints && line.inkPoints.length > 1) {
            line.inkPoints.forEach((_, i) => {
                if (i === line.inkPoints.length - 1) return;
                pts.push(...getCircleSegmentIntersections(line.inkPoints[i], line.inkPoints[i+1]));
            });
        } else {
            pts.push(...getCircleSegmentIntersections(line.start, line.end));
        }
    }
    // two circles / arcs
    else if ((entA.type === 'circle' || entA.type === 'arc') && (entB.type === 'circle' || entB.type === 'arc')) {
        const c1 = entA as (CircleEntity | ArcEntity);
        const c2 = entB as (CircleEntity | ArcEntity);
        const dx = c2.center.x - c1.center.x;
        const dy = c2.center.y - c1.center.y;
        const dSum = Math.sqrt(dx * dx + dy * dy);
        if (dSum > 0.001) {
            const eps = 0.05; // 0.05 cm threshold to adjust for near-touches
            let r1 = c1.radius;
            let r2 = c2.radius;
            
            // If they are slightly separated but within eps, adjust radii so they touch
            if (dSum > r1 + r2 && dSum <= r1 + r2 + eps) {
                const diff = (dSum - (r1 + r2)) / 2;
                r1 += diff;
                r2 += diff;
            }
            // If one is slightly inside the other but within eps, adjust radii so they touch
            if (dSum < Math.abs(r1 - r2) && dSum >= Math.abs(r1 - r2) - eps) {
                const diff = (Math.abs(r1 - r2) - dSum) / 2;
                if (r1 > r2) {
                    r1 -= diff;
                    r2 += diff;
                } else {
                    r1 += diff;
                    r2 -= diff;
                }
            }
            
            if (dSum <= r1 + r2 + 1e-5 && dSum >= Math.abs(r1 - r2) - 1e-5) {
                const a = (r1 * r1 - r2 * r2 + dSum * dSum) / (2 * dSum);
                const hSq = r1 * r1 - a * a;
                const h = Math.sqrt(Math.max(0, hSq));
                const ux = dx / dSum;
                const uy = dy / dSum;
                const px = -uy;
                const py = ux;
                
                const p1 = { x: c1.center.x + a * ux + h * px, y: c1.center.y + a * uy + h * py };
                const p2 = { x: c1.center.x + a * ux - h * px, y: c1.center.y + a * uy - h * py };
                
                [p1, p2].forEach(p => {
                    // Check if on entA
                    if (entA.type === 'arc') {
                         const a1 = Math.atan2(p.y - c1.center.y, p.x - c1.center.x) * 180 / Math.PI;
                         if (!isAngleInArc(a1, (entA as ArcEntity).startAngle, (entA as ArcEntity).endAngle)) return;
                    }
                    // Check if on entB
                    if (entB.type === 'arc') {
                         const a2 = Math.atan2(p.y - c2.center.y, p.x - c2.center.x) * 180 / Math.PI;
                         if (!isAngleInArc(a2, (entB as ArcEntity).startAngle, (entB as ArcEntity).endAngle)) return;
                    }
                    if (!pts.some(existing => Math.hypot(existing.x - p.x, existing.y - p.y) < 1e-2)) {
                        pts.push(p);
                    }
                });
            }
        }
    }
    // rectangle and line / circle / arc
    else if (entA.type === 'rectangle' || entB.type === 'rectangle') {
        const rect = entA.type === 'rectangle' ? entA as RectEntity : entB as RectEntity;
        const other = entA.type === 'rectangle' ? entB : entA;
        
        const x1 = Math.min(rect.p1.x, rect.p2.x);
        const x2 = Math.max(rect.p1.x, rect.p2.x);
        const y1 = Math.min(rect.p1.y, rect.p2.y);
        const y2 = Math.max(rect.p1.y, rect.p2.y);
        
        const segs: LineEntity[] = [
            { id: 's1', type: 'line', start: { x: x1, y: y1 }, end: { x: x2, y: y1 }, color: '', lineWidth: 1, layer: '', mode: 'ink' },
            { id: 's2', type: 'line', start: { x: x2, y: y1 }, end: { x: x2, y: y2 }, color: '', lineWidth: 1, layer: '', mode: 'ink' },
            { id: 's3', type: 'line', start: { x: x2, y: y2 }, end: { x: x1, y: y2 }, color: '', lineWidth: 1, layer: '', mode: 'ink' },
            { id: 's4', type: 'line', start: { x: x1, y: y2 }, end: { x: x1, y: y1 }, color: '', lineWidth: 1, layer: '', mode: 'ink' }
        ];
        
        segs.forEach(seg => {
            const subPts = getIntersections(seg, other);
            subPts.forEach(pt => pts.push(pt));
        });
    }
    return pts;
  };

  const getTrimTargetAtPoint = (point: Point, customThreshold: number = 12): Entity | undefined => {
      const ent = getEntityAtPoint(point, customThreshold);
      return ent && (ent.type === 'line' || ent.type === 'circle' || ent.type === 'arc') ? ent : undefined;
  };

  const computeTrimSegments = (
    target: Entity,
    clickPoint: Point,
    allEntities: Entity[],
    mode: 'normal' | 'smart' = 'normal'
  ): {
    highlighted: { type: 'line' | 'arc'; start?: Point; end?: Point; center?: Point; radius?: number; startAngle?: number; endAngle?: number };
    keep: any[];
  } | null => {
    if (target.type === 'line') {
      const intersections: { t: number; p: Point; isReal?: boolean }[] = [];

      allEntities.forEach(ent => {
        if (ent.id === target.id) return;
        
        const pts = getIntersections(target, ent);
        pts.forEach(p => {
          const d = { x: target.end.x - target.start.x, y: target.end.y - target.start.y };
          const lenSq = d.x * d.x + d.y * d.y;
          if (lenSq !== 0) {
            const t = ((p.x - target.start.x) * d.x + (p.y - target.start.y) * d.y) / lenSq;
            if (t > -0.01 && t < 1.01) {
              intersections.push({ t, p, isReal: true });
            }
          }
        });
      });

      const uniqueIntersections: { t: number; p: Point; isReal: boolean }[] = [];
      uniqueIntersections.push({ t: 0, p: target.start, isReal: false });
      uniqueIntersections.push({ t: 1, p: target.end, isReal: false });

      intersections.forEach(item => {
        const existing = uniqueIntersections.find(ui => Math.abs(ui.t - item.t) < 1e-4);
        if (existing) {
          existing.isReal = true;
        } else {
          uniqueIntersections.push({ ...item, isReal: true });
        }
      });
      uniqueIntersections.sort((a, b) => a.t - b.t);

      const d = { x: target.end.x - target.start.x, y: target.end.y - target.start.y };
      const lenSq = d.x * d.x + d.y * d.y;
      let tClick = 0;
      if (lenSq !== 0) {
        tClick = ((clickPoint.x - target.start.x) * d.x + (clickPoint.y - target.start.y) * d.y) / lenSq;
        tClick = Math.max(0, Math.min(1, tClick));
      }

      let trimStart: Point | null = null;
      let trimEnd: Point | null = null;
      let clickedIndex = -1;

      for (let i = 0; i < uniqueIntersections.length - 1; i++) {
        if (tClick >= uniqueIntersections[i].t - 1e-4 && tClick <= uniqueIntersections[i + 1].t + 1e-4) {
          trimStart = uniqueIntersections[i].p;
          trimEnd = uniqueIntersections[i + 1].p;
          clickedIndex = i;
          break;
        }
      }

      if (trimStart && trimEnd) {
        const keep: any[] = [];
        const targetLine = target as LineEntity;

        const createKeptSegment = (t1: number, t2: number, startP: Point, endP: Point) => {
          let keptInkPoints = undefined;
          if (targetLine.inkPoints) {
            const dX = targetLine.end.x - targetLine.start.x;
            const dY = targetLine.end.y - targetLine.start.y;
            const lenSq = dX * dX + dY * dY;
            keptInkPoints = targetLine.inkPoints.filter(pt => {
              if (lenSq === 0) return true;
              const tP = ((pt.x - targetLine.start.x) * dX + (pt.y - targetLine.start.y) * dY) / lenSq;
              return tP >= t1 - 1e-3 && tP <= t2 + 1e-3;
            });

            if (keptInkPoints.length === 0) {
              keptInkPoints = [
                { x: startP.x, y: startP.y, width: 1.0, alpha: 1.0 },
                { x: endP.x, y: endP.y, width: 1.0, alpha: 1.0 }
              ];
            } else if (keptInkPoints.length === 1) {
              const single = keptInkPoints[0];
              keptInkPoints = [
                { ...single, x: startP.x, y: startP.y },
                { ...single, x: endP.x, y: endP.y }
              ];
            } else {
              keptInkPoints = [...keptInkPoints];
              keptInkPoints[0] = { ...keptInkPoints[0], x: startP.x, y: startP.y };
              keptInkPoints[keptInkPoints.length - 1] = { ...keptInkPoints[keptInkPoints.length - 1], x: endP.x, y: endP.y };
            }
          }
          return {
            ...target,
            start: startP,
            end: endP,
            inkPoints: keptInkPoints,
          };
        };

        // Keep everything before the clicked interval
        if (clickedIndex > 0) {
          const t1 = uniqueIntersections[0].t;
          const t2 = uniqueIntersections[clickedIndex].t;
          if (t2 - t1 > 0.001) {
            keep.push(createKeptSegment(t1, t2, uniqueIntersections[0].p, uniqueIntersections[clickedIndex].p));
          }
        }

        // Keep everything after the clicked interval
        if (clickedIndex < uniqueIntersections.length - 2) {
          const t1 = uniqueIntersections[clickedIndex + 1].t;
          const t2 = uniqueIntersections[uniqueIntersections.length - 1].t;
          if (t2 - t1 > 0.001) {
            keep.push(createKeptSegment(t1, t2, uniqueIntersections[clickedIndex + 1].p, uniqueIntersections[uniqueIntersections.length - 1].p));
          }
        }

        return {
          highlighted: { type: 'line', start: trimStart, end: trimEnd },
          keep,
        };
      }
    } else if (target.type === 'circle') {
      if (mode === 'smart') return null; // Circles have no free ends

      const ptsSet: Point[] = [];
      allEntities.forEach(ent => {
        if (ent.id === target.id) return;
        const pts = getIntersections(target, ent);
        pts.forEach(p => {
          if (!ptsSet.some(existing => Math.hypot(existing.x - p.x, existing.y - p.y) < 0.05)) {
            ptsSet.push(p);
          }
        });
      });

      const angles = ptsSet.map(p => {
        return normalizeAngle(Math.atan2(p.y - target.center.y, p.x - target.center.x) * 180 / Math.PI);
      });

      angles.sort((a, b) => a - b);

      if (angles.length === 0) return null;
      if (angles.length === 1) {
        const singleAngle = angles[0];
        const keptArc = {
          ...target,
          type: 'arc' as const,
          startAngle: singleAngle,
          endAngle: singleAngle,
        };
        return {
          highlighted: {
            type: 'arc',
            center: target.center,
            radius: target.radius,
            startAngle: singleAngle,
            endAngle: singleAngle + 360,
          },
          keep: [keptArc],
        };
      }
      const angleClick = normalizeAngle(Math.atan2(clickPoint.y - target.center.y, clickPoint.x - target.center.x) * 180 / Math.PI);

      let startAngleSegment = 0;
      let endAngleSegment = 0;
      let found = false;

      for (let i = 0; i < angles.length; i++) {
        const start = angles[i];
        const end = angles[(i + 1) % angles.length];
        
        if (start <= end) {
          if (angleClick >= start && angleClick <= end) {
            startAngleSegment = start;
            endAngleSegment = end;
            found = true;
            break;
          }
        } else {
          if (angleClick >= start || angleClick <= end) {
            startAngleSegment = start;
            endAngleSegment = end;
            found = true;
            break;
          }
        }
      }

      if (found) {
        const keptArc = {
          ...target,
          type: 'arc' as const,
          startAngle: endAngleSegment,
          endAngle: startAngleSegment,
        };

        return {
          highlighted: {
            type: 'arc',
            center: target.center,
            radius: target.radius,
            startAngle: startAngleSegment,
            endAngle: endAngleSegment,
          },
          keep: [keptArc],
        };
      }
      return null;
    } else if (target.type === 'arc') {
      const ptsSet: { p: Point; isReal: boolean }[] = [];
      allEntities.forEach(ent => {
        if (ent.id === target.id) return;
        const pts = getIntersections(target, ent);
        pts.forEach(p => {
          if (!ptsSet.some(existing => Math.hypot(existing.p.x - p.x, existing.p.y - p.y) < 0.05)) {
            ptsSet.push({ p, isReal: true });
          }
        });
      });

      const S = normalizeAngle(target.startAngle);
      const E = normalizeAngle(target.endAngle);
      
      const sequence: { t: number; isReal: boolean }[] = [
        { t: S, isReal: false },
        { t: E, isReal: false }
      ];

      ptsSet.forEach(item => {
        const a = normalizeAngle(Math.atan2(item.p.y - target.center.y, item.p.x - target.center.x) * 180 / Math.PI);
        if (isAngleInArc(a, target.startAngle, target.endAngle)) {
            const existing = sequence.find(s => Math.abs(normalizeAngle(s.t - a)) < 0.1);
            if (existing) {
                existing.isReal = true;
            } else {
                sequence.push({ t: a, isReal: true });
            }
        }
      });

      sequence.sort((a, b) => getClockwiseDistance(a.t, S) - getClockwiseDistance(b.t, S));

      const angleClick = normalizeAngle(Math.atan2(clickPoint.y - target.center.y, clickPoint.x - target.center.x) * 180 / Math.PI);

      let clickedIndex = -1;
      for (let i = 0; i < sequence.length - 1; i++) {
        const start = sequence[i].t;
        const end = sequence[i + 1].t;
        const distClick = getClockwiseDistance(angleClick, S);
        const d1 = getClockwiseDistance(start, S);
        const d2 = getClockwiseDistance(end, S);
        if (distClick >= d1 && distClick <= d2) {
          clickedIndex = i;
          break;
        }
      }

      if (clickedIndex !== -1) {
        const startAngleSegment = sequence[clickedIndex].t;
        const endAngleSegment = sequence[clickedIndex + 1].t;

        const keep: any[] = [];
        
        // Arc is from sequence[0] to sequence[clickedIndex]
        if (clickedIndex > 0) {
          keep.push({
            ...target,
            type: 'arc' as const,
            startAngle: sequence[0].t,
            endAngle: sequence[clickedIndex].t,
          });
        }
        
        // Arc is from sequence[clickedIndex + 1] to sequence[sequence.length - 1]
        if (clickedIndex < sequence.length - 2) {
          keep.push({
            ...target,
            type: 'arc' as const,
            startAngle: sequence[clickedIndex + 1].t,
            endAngle: sequence[sequence.length - 1].t,
          });
        }

        return {
          highlighted: {
            type: 'arc',
            center: target.center,
            radius: target.radius,
            startAngle: startAngleSegment,
            endAngle: endAngleSegment,
          },
          keep,
        };
      }
    }

    return null;
  };

  const isPointInsideBox = (p: Point, box: { minX: number; maxX: number; minY: number; maxY: number }) => {
    const eps = 1e-6;
    return p.x >= box.minX - eps && p.x <= box.maxX + eps && p.y >= box.minY - eps && p.y <= box.maxY + eps;
  };

  const getLineBoxIntersections = (p1: Point, p2: Point, box: { minX: number; maxX: number; minY: number; maxY: number }): Point[] => {
    const intersections: Point[] = [];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const eps = 1e-6;

    // Left border: x = minX
    if (dx !== 0) {
      const t = (box.minX - p1.x) / dx;
      if (t >= -eps && t <= 1 + eps) {
        const y = p1.y + t * dy;
        if (y >= box.minY - eps && y <= box.maxY + eps) {
          intersections.push({ x: box.minX, y: Math.max(box.minY, Math.min(box.maxY, y)) });
        }
      }
    }
    // Right border: x = maxX
    if (dx !== 0) {
      const t = (box.maxX - p1.x) / dx;
      if (t >= -eps && t <= 1 + eps) {
        const y = p1.y + t * dy;
        if (y >= box.minY - eps && y <= box.maxY + eps) {
          intersections.push({ x: box.maxX, y: Math.max(box.minY, Math.min(box.maxY, y)) });
        }
      }
    }
    // Top border: y = minY
    if (dy !== 0) {
      const t = (box.minY - p1.y) / dy;
      if (t >= -eps && t <= 1 + eps) {
        const x = p1.x + t * dx;
        if (x >= box.minX - eps && x <= box.maxX + eps) {
          intersections.push({ x: Math.max(box.minX, Math.min(box.maxX, x)), y: box.minY });
        }
      }
    }
    // Bottom border: y = maxY
    if (dy !== 0) {
      const t = (box.maxY - p1.y) / dy;
      if (t >= -eps && t <= 1 + eps) {
        const x = p1.x + t * dx;
        if (x >= box.minX - eps && x <= box.maxX + eps) {
          intersections.push({ x: Math.max(box.minX, Math.min(box.maxX, x)), y: box.maxY });
        }
      }
    }

    const uniquePts: Point[] = [];
    for (const pt of intersections) {
      if (!uniquePts.some(u => Math.sqrt((u.x - pt.x)**2 + (u.y - pt.y)**2) < 1e-6)) {
        uniquePts.push(pt);
      }
    }
    return uniquePts;
  };

  const trimLineWithBox = (line: LineEntity, box: { minX: number; maxX: number; minY: number; maxY: number }): Entity[] => {
    if (line.isFreehand && line.inkPoints && line.inkPoints.length > 0) {
        const result: Entity[] = [];
        let currentSegment: any[] = [];
        
        let inPrev = isPointInsideBox(line.inkPoints[0], box);

        for (let i = 0; i < line.inkPoints.length; i++) {
            const pt = line.inkPoints[i];
            const isInside = isPointInsideBox(pt, box);
            
            if (i > 0) {
                const prevPt = line.inkPoints[i-1];
                if (inPrev !== isInside) {
                    // Crossed boundary, find intersection
                    const intersects = getLineBoxIntersections(prevPt, pt, box);
                    if (intersects.length > 0) {
                        const q = intersects[0];
                        if (isInside) {
                            // Going outside -> inside, add intersection q to current outside segment
                            currentSegment.push(q);
                        } else {
                            // Going inside -> outside, start new outside segment from q
                            currentSegment.push(q);
                        }
                    }
                }
            }

            if (!isInside) {
                currentSegment.push(pt);
            } else {
                if (currentSegment.length > 1) {
                    result.push({
                        ...line,
                        id: line.id + "_trim_freehand_" + Math.random().toString(36).substr(2, 5),
                        start: { x: currentSegment[0].x, y: currentSegment[0].y },
                        end: { x: currentSegment[currentSegment.length - 1].x, y: currentSegment[currentSegment.length - 1].y },
                        inkPoints: [...currentSegment]
                    });
                }
                currentSegment = [];
            }
            inPrev = isInside;
        }
        
        if (currentSegment.length > 1) {
            result.push({
                ...line,
                id: line.id + "_trim_freehand_" + Math.random().toString(36).substr(2, 5),
                start: { x: currentSegment[0].x, y: currentSegment[0].y },
                end: { x: currentSegment[currentSegment.length - 1].x, y: currentSegment[currentSegment.length - 1].y },
                inkPoints: [...currentSegment]
            });
        }
        
        return result;
    }

    const p1 = line.start;
    const p2 = line.end;
    const p1In = isPointInsideBox(p1, box);
    const p2In = isPointInsideBox(p2, box);

    if (p1In && p2In) {
      return [];
    }

    const intersections = getLineBoxIntersections(p1, p2, box);

    // Filter unique intersections and sort them along the line
    const sortedIntersections = [...new Set(intersections.map(p => `${p.x.toFixed(6)},${p.y.toFixed(6)}`))]
      .map(s => { const [x, y] = s.split(',').map(Number); return { x, y }; })
      .sort((a, b) => {
        const distA = (a.x - p1.x) ** 2 + (a.y - p1.y) ** 2;
        const distB = (b.x - p1.x) ** 2 + (b.y - p1.y) ** 2;
        return distA - distB;
      });

    if (sortedIntersections.length === 0) {
      if (p1In || p2In) return []; // Should be caught by p1In && p2In, but safety
      return [{ ...line }];
    }

    const result: Entity[] = [];

    // Helper to clamp points to box
    const clampToBox = (p: Point) => ({
      x: Math.max(box.minX, Math.min(box.maxX, p.x)),
      y: Math.max(box.minY, Math.min(box.maxY, p.y))
    });

    // We can have 1 or 2 intersection points
    if (sortedIntersections.length === 1) {
        const q = sortedIntersections[0];
        if (p1In) {
            // Segment [p1, q] is inside, [q, p2] starts outside
            return [{ ...line, start: q, end: p2 }];
        } else if (p2In) {
            // Segment [p1, q] is outside, [q, p2] is inside
            return [{ ...line, start: p1, end: q }];
        } else {
            // Both outside, passes through (e.g. corner cut) - keep whole line or remove if inside? 
            // If sortedIntersections.length === 1, it probably didn't pass THROUGH the box.
            return [{ ...line }];
        }
    } else if (sortedIntersections.length >= 2) {
        // Line cuts through, keep [p1, q1] and [q2, p2]
        const q1 = sortedIntersections[0];
        const q2 = sortedIntersections[sortedIntersections.length - 1];
        
        const res: Entity[] = [];
        // Keep part before box
        if (!isPointInsideBox(p1, box) && !isPointInsideBox(q1, box)) {
            // Check if segment is outside. Midpoint check is usually safe.
            const mid = { x: (p1.x + q1.x) / 2, y: (p1.y + q1.y) / 2 };
            // If mid is outside (which it must be if P1, P2 outside and Q1 is intersection), keep it.
            res.push({ ...line, start: p1, end: q1 });
        }
        
        // Keep part after box
        if (!isPointInsideBox(q2, box) && !isPointInsideBox(p2, box)) {
            res.push({ ...line, start: q2, end: p2, id: line.id + "_trim_line_" + Math.random().toString(36).substr(2, 5) });
        }
        
        return res;
    }

    return [{ ...line }];
  };

  const getCircleBoxIntersections = (center: Point, radius: number, box: { minX: number; maxX: number; minY: number; maxY: number }): Point[] => {
    const intersections: Point[] = [];

    const xBorders = [box.minX, box.maxX];
    for (const xVal of xBorders) {
      const dSq = radius ** 2 - (xVal - center.x) ** 2;
      if (dSq >= 0) {
        const d = Math.sqrt(dSq);
        const y1 = center.y + d;
        const y2 = center.y - d;
        if (y1 >= box.minY && y1 <= box.maxY) {
          intersections.push({ x: xVal, y: y1 });
        }
        if (d > 0 && y2 >= box.minY && y2 <= box.maxY) {
          intersections.push({ x: xVal, y: y2 });
        }
      }
    }

    const yBorders = [box.minY, box.maxY];
    for (const yVal of yBorders) {
      const dSq = radius ** 2 - (yVal - center.y) ** 2;
      if (dSq >= 0) {
        const d = Math.sqrt(dSq);
        const x1 = center.x + d;
        const x2 = center.x - d;
        if (x1 >= box.minX && x1 <= box.maxX) {
          intersections.push({ x: x1, y: yVal });
        }
        if (d > 0 && x2 >= box.minX && x2 <= box.maxX) {
          intersections.push({ x: x2, y: yVal });
        }
      }
    }

    const uniquePts: Point[] = [];
    for (const pt of intersections) {
      if (!uniquePts.some(u => Math.sqrt((u.x - pt.x)**2 + (u.y - pt.y)**2) < 0.001)) {
        uniquePts.push(pt);
      }
    }
    return uniquePts;
  };

  const trimCircleWithBox = (circle: CircleEntity, box: { minX: number; maxX: number; minY: number; maxY: number }): Entity[] => {
    const { center, radius } = circle;
    const intersections = getCircleBoxIntersections(center, radius, box);

    if (intersections.length === 0) {
      if (isPointInsideBox(center, box)) {
        return [];
      }
      return [{ ...circle }];
    }

    const angles = intersections.map(pt => {
      let angle = Math.atan2(pt.y - center.y, pt.x - center.x) * 180 / Math.PI;
      return normalizeAngle(angle);
    });

    angles.sort((a, b) => a - b);

    const sectors: { start: number; end: number }[] = [];
    if (angles.length > 0) {
      for (let i = 0; i < angles.length; i++) {
        const start = angles[i];
        const end = angles[(i + 1) % angles.length];
        sectors.push({ start, end });
      }
    }

    const resultSegments: Entity[] = [];

    for (const sector of sectors) {
      let angleSpan = sector.end - sector.start;
      if (angleSpan < 0) angleSpan += 360;
      const midAngle = normalizeAngle(sector.start + angleSpan / 2);
      const midRad = midAngle * Math.PI / 180;
      const midPoint = {
        x: center.x + radius * Math.cos(midRad),
        y: center.y + radius * Math.sin(midRad)
      };

      if (!isPointInsideBox(midPoint, box)) {
        resultSegments.push({
          ...circle,
          type: 'arc',
          startAngle: sector.start,
          endAngle: sector.end,
          id: circle.id + "_trim_arc_" + Math.random().toString(36).substr(2, 5)
        } as ArcEntity);
      }
    }

    if (resultSegments.length > 0) {
      resultSegments[0].id = circle.id;
    }

    return resultSegments;
  };

  const trimArcWithBox = (arc: ArcEntity, box: { minX: number; maxX: number; minY: number; maxY: number }): Entity[] => {
    const { center, radius, startAngle, endAngle } = arc;
    const rawIntersections = getCircleBoxIntersections(center, radius, box);

    const validIntersections = rawIntersections.filter(pt => {
      const angle = normalizeAngle(Math.atan2(pt.y - center.y, pt.x - center.x) * 180 / Math.PI);
      return isAngleInArc(angle, startAngle, endAngle);
    });

    if (validIntersections.length === 0) {
      let span = endAngle - startAngle;
      while (span < 0) span += 360;
      const midAngle = normalizeAngle(startAngle + span / 2);
      const midRad = midAngle * Math.PI / 180;
      const midPoint = {
        x: center.x + radius * Math.cos(midRad),
        y: center.y + radius * Math.sin(midRad)
      };

      if (isPointInsideBox(midPoint, box)) {
        return [];
      }
      return [{ ...arc }];
    }

    const angles = validIntersections.map(pt => {
      return normalizeAngle(Math.atan2(pt.y - center.y, pt.x - center.x) * 180 / Math.PI);
    });

    angles.sort((a, b) => {
      return getClockwiseDistance(a, startAngle) - getClockwiseDistance(b, startAngle);
    });

    const intervals: { start: number; end: number }[] = [];
    let currentStart = startAngle;
    for (const angle of angles) {
      intervals.push({ start: currentStart, end: angle });
      currentStart = angle;
    }
    intervals.push({ start: currentStart, end: endAngle });

    const resultSegments: Entity[] = [];
    for (const interval of intervals) {
      let span = getClockwiseDistance(interval.end, interval.start);
      if (span < 0.01) continue;

      const midAngle = normalizeAngle(interval.start + span / 2);
      const midRad = midAngle * Math.PI / 180;
      const midPoint = {
        x: center.x + radius * Math.cos(midRad),
        y: center.y + radius * Math.sin(midRad)
      };

      if (!isPointInsideBox(midPoint, box)) {
        resultSegments.push({
          ...arc,
          startAngle: interval.start,
          endAngle: interval.end,
          id: arc.id + "_trim_arc_" + Math.random().toString(36).substr(2, 5)
        } as ArcEntity);
      }
    }

    if (resultSegments.length > 0) {
      resultSegments[0].id = arc.id;
    }

    return resultSegments;
  };

  const executeWindowTrim = (start: Point, current: Point) => {
    const minX = Math.min(start.x, current.x);
    const maxX = Math.max(start.x, current.x);
    const minY = Math.min(start.y, current.y);
    const maxY = Math.max(start.y, current.y);

    const box = { minX, maxX, minY, maxY };

    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    if (sizeX < 1e-3 || sizeY < 1e-3) return;

    setEntities(prev => {
      let changed = false;
      const newEntities = prev.flatMap(ent => {
        if (ent.type !== 'line' && ent.type !== 'circle' && ent.type !== 'arc') {
          return [ent];
        }

        const layer = layers.find(l => l.id === ent.layer);
        if (layer && (!layer.visible || layer.frozen)) {
          return [ent];
        }

        let trimmed: Entity[] = [];
        if (ent.type === 'line') {
          trimmed = trimLineWithBox(ent, box);
        } else if (ent.type === 'circle') {
          trimmed = trimCircleWithBox(ent, box);
        } else if (ent.type === 'arc') {
          trimmed = trimArcWithBox(ent, box);
        }

        let isEntityChanged = false;
        if (trimmed.length !== 1) {
          isEntityChanged = true;
        } else if (trimmed[0].id !== ent.id) {
          isEntityChanged = true;
        } else if (ent.type === 'line' && trimmed[0].type === 'line') {
          const t0 = trimmed[0] as LineEntity;
          if (t0.start.x !== ent.start.x || t0.start.y !== ent.start.y ||
              t0.end.x !== ent.end.x || t0.end.y !== ent.end.y) {
            isEntityChanged = true;
          }
        } else if (ent.type === 'arc' && trimmed[0].type === 'arc') {
          const t0 = trimmed[0] as ArcEntity;
          if (t0.startAngle !== ent.startAngle || t0.endAngle !== ent.endAngle) {
            isEntityChanged = true;
          }
        }

        if (isEntityChanged) {
          changed = true;
        }

        return trimmed;
      });

      if (changed) {
        onCommitHistory?.(newEntities);
        return newEntities;
      }
      return prev;
    });
  };

  const executeSmartTrim = (rawPoint: Point) => {
    const radius = (eraserRadius * 3.5) / view.zoom;
    const pointsToTrim = [rawPoint];
    if (liveMirrorAxis) {
        pointsToTrim.push(mirrorPoint(rawPoint, liveMirrorAxis.start, liveMirrorAxis.end));
    }

    setEntities(prev => {
        let changed = false;
        let currentEntities = [...prev];

        for (const pt of pointsToTrim) {
            const nextEntities: any[] = [];
            for (const ent of currentEntities) {
                // Skip mirrored copies, they will be regenerated by applyLiveMirror anyway
                if ((ent as any).isLiveMirrorCopy) {
                    nextEntities.push(ent);
                    continue;
                }

                if (ent.type === 'line' || ent.type === 'circle' || ent.type === 'arc') {
                    const threshold = radius; 
                    let isClose = false;
                    if (ent.type === 'line') {
                        isClose = distToSegment(pt, ent.start, ent.end) < threshold;
                    } else if (ent.type === 'circle' || ent.type === 'arc') {
                        const d = Math.sqrt((pt.x - ent.center.x)**2 + (pt.y - ent.center.y)**2);
                        isClose = Math.abs(d - (ent as any).radius) < threshold;
                    }

                    if (isClose) {
                        const result = computeTrimSegments(ent, pt, currentEntities, 'smart');
                        if (result && result.keep) {
                            changed = true;
                            result.keep.forEach((k: any, i: number) => {
                                nextEntities.push({
                                    ...ent,
                                    id: ent.id + `_smart_${i}_` + Math.random(),
                                    ...k
                                });
                            });
                            continue;
                        }
                    }
                }
                nextEntities.push(ent);
            }
            currentEntities = nextEntities;
        }

        if (changed) {
            onCommitHistory?.(currentEntities);
        }
        return changed ? currentEntities : prev;
    });
  };

  const executeTrim = (rawPoint: Point) => {
    let target = highlightedTrimLine || getTrimTargetAtPoint(rawPoint);
    if (!target) return;

    // Commit snapshot of state PRIOR to the change so Undo works perfectly!
    onCommitHistory?.(entitiesRef.current);

    let finalTarget = target;
    let finalClickPoint = rawPoint;
    if (liveMirrorAxis && (target as any).isLiveMirrorCopy && (target as any).liveMirrorSourceId) {
        const sourceTarget = entitiesRef.current.find(e => e.id === (target as any).liveMirrorSourceId);
        if (sourceTarget) {
            finalTarget = sourceTarget;
            finalClickPoint = mirrorPoint(rawPoint, liveMirrorAxis.start, liveMirrorAxis.end);
        }
    }

    setEntities(prev => {
        const freshTarget = prev.find(ent => ent.id === finalTarget.id);
        if (!freshTarget) return prev;

        const result = computeTrimSegments(freshTarget, finalClickPoint, prev, trimMode);
        if (!result) return prev;

        const newEntities = prev.flatMap(ent => {
            if (ent.id === freshTarget.id) {
                if (result.keep.length === 0) return [];
                return result.keep.map((seg, i) => ({
                    ...seg,
                    id: i === 0 ? ent.id : `${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`
                }));
            }
            return ent;
        });
        return newEntities;
    });

    setHighlightedTrimLine(null);
    setHighlightedTrimSegment(null);
  };

  const executeAllunga = (rawPointParam: Point) => {
    let target = getEntityAtPoint(rawPointParam, 15);
    if (!target || target.type !== 'line') return;

    let rawPoint = rawPointParam;
    if (liveMirrorAxis && (target as any).isLiveMirrorCopy && (target as any).liveMirrorSourceId) {
        const sourceTarget = entitiesRef.current.find(e => e.id === (target as any).liveMirrorSourceId);
        if (sourceTarget && sourceTarget.type === 'line') {
            target = sourceTarget;
            rawPoint = mirrorPoint(rawPointParam, liveMirrorAxis.start, liveMirrorAxis.end);
        }
    }

    const line = target as LineEntity;
    
    // --- ATOMIZATION AWARE EXECUTION ---
    const inters: Point[] = [];
    entitiesRef.current.forEach(other => {
        if (other.id === line.id) return;
        const pts = getIntersections(line, other);
        pts.forEach(p => {
            const dS = Math.hypot(p.x - line.start.x, p.y - line.start.y);
            const dE = Math.hypot(p.x - line.end.x, p.y - line.end.y);
            if (dS > 0.1 && dE > 0.1) inters.push(p);
        });
    });

    const dx_total = line.end.x - line.start.x;
    const dy_total = line.end.y - line.start.y;
    const L2_total = dx_total * dx_total + dy_total * dy_total;
    
    let currentSubSegment = { start: line.start, end: line.end };

    if (L2_total > 0.001) {
        const pointsWithT = [
            { t: 0, p: line.start },
            ...inters.map(p => ({
                t: ((p.x - line.start.x) * dx_total + (p.y - line.start.y) * dy_total) / L2_total,
                p
            })),
            { t: 1, p: line.end }
        ].sort((a, b) => a.t - b.t);

        const deduped: Point[] = [];
        for (let i = 0; i < pointsWithT.length; i++) {
            if (i === 0 || pointsWithT[i].t - pointsWithT[i-1].t > 0.001) {
                deduped.push(pointsWithT[i].p);
            }
        }

        for (let i = 0; i < deduped.length - 1; i++) {
            if (distToSegment(rawPoint, deduped[i], deduped[i+1]) < (15 / view.zoom)) {
                currentSubSegment = { start: deduped[i], end: deduped[i+1] };
                break;
            }
        }
    }

    const distStart = Math.hypot(rawPoint.x - currentSubSegment.start.x, rawPoint.y - currentSubSegment.start.y);
    const distEnd = Math.hypot(rawPoint.x - currentSubSegment.end.x, rawPoint.y - currentSubSegment.end.y);
    
    const endExtending = distStart < distEnd ? 'start' : 'end';
    let pivot = endExtending === 'start' ? currentSubSegment.end : currentSubSegment.start;
    const extPt = endExtending === 'start' ? currentSubSegment.start : currentSubSegment.end;
    
    if (line.isFreehand && line.inkPoints && line.inkPoints.length > 1) {
        if (endExtending === 'start') {
            pivot = line.inkPoints[1];
        } else {
            pivot = line.inkPoints[line.inkPoints.length - 2];
        }
    }
    
    const dx = extPt.x - pivot.x;
    const dy = extPt.y - pivot.y;
    const len = Math.hypot(dx, dy);
    
    if (len > 0.01) {
        const dirX = dx / len;
        const dirY = dy / len;
        
        const farX = extPt.x + dirX * 100000;
        const farY = extPt.y + dirY * 100000;
        const ray: LineEntity = { id: 'temp_ray', type: 'line', start: extPt, end: { x: farX, y: farY }, color: '', lineWidth: 1, layer: '', mode: 'CAD' };
        
        const intersections: { pt: Point; dist: number }[] = [];
        entitiesRef.current.forEach(other => {
            if (other.id === line.id) return;
            const layer = layers.find(l => l.id === other.layer);
            if (layer && !layer.visible) return;
            
            const pts = getIntersections(ray, other);
            pts.forEach(p => {
                const dist = Math.hypot(p.x - extPt.x, p.y - extPt.y);
                if (dist > 0.05) {
                    intersections.push({ pt: p, dist });
                }
            });
        });
        
        intersections.sort((a, b) => a.dist - b.dist);
        if (intersections.length > 0) {
            const nextPoint = intersections[0].pt;
            
            onCommitHistory?.(entitiesRef.current);
            
            setEntities(prev => {
                let updatedLine: LineEntity | null = null;
                const remaining: Entity[] = [];
                for (const item of prev) {
                    if (item.id === line.id) {
                        const totalDistStart = Math.hypot(extPt.x - line.start.x, extPt.y - line.start.y);
                        const totalDistEnd = Math.hypot(extPt.x - line.end.x, extPt.y - line.end.y);
                        const totalEndToUpdate = totalDistStart < totalDistEnd ? 'start' : 'end';

                        if (line.isFreehand && line.inkPoints) {
                            const newInkPoints = [...line.inkPoints];
                            if (totalEndToUpdate === 'start') {
                                const firstPt = line.inkPoints[0];
                                newInkPoints[0] = {
                                    ...firstPt,
                                    x: nextPoint.x,
                                    y: nextPoint.y,
                                    width: (firstPt as any)?.width ?? 1,
                                    alpha: (firstPt as any)?.alpha ?? 1
                                } as any;
                            } else {
                                const lastPt = line.inkPoints[line.inkPoints.length - 1];
                                newInkPoints[newInkPoints.length - 1] = {
                                    ...lastPt,
                                    x: nextPoint.x,
                                    y: nextPoint.y,
                                    width: (lastPt as any)?.width ?? 1,
                                    alpha: (lastPt as any)?.alpha ?? 1
                                } as any;
                            }
                            updatedLine = { ...line, start: newInkPoints[0], end: newInkPoints[newInkPoints.length - 1], inkPoints: newInkPoints };
                        } else {
                            if (totalEndToUpdate === 'start') {
                                updatedLine = { ...line, start: nextPoint };
                            } else {
                                updatedLine = { ...line, end: nextPoint };
                            }
                        }
                    } else {
                        remaining.push(item);
                    }
                }
                if (updatedLine && !updatedLine.isBIM && !(updatedLine as any).isFilo) {
                    return mergeLineSegments(remaining, updatedLine);
                }
                return updatedLine ? [...remaining, updatedLine] : prev;
            });
            setAllungaHover(null);
        }
    }
  };

  const captureSelection = (start: Point, end: Point) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Bounds in canvas space
    const x1 = Math.min(start.x, end.x);
    const y1 = Math.min(start.y, end.y);
    const x2 = Math.max(start.x, end.x);
    const y2 = Math.max(start.y, end.y);
    
    const w = x2 - x1;
    const h = y2 - y1;
    if (w < 0.1 || h < 0.1) return;
    
    // Convert canvas bounds to screen pixels (to extract from the DOM canvas)
    const pMin = canvasToScreen(x1, y1);
    const pMax = canvasToScreen(x2, y2);
    
    const sx = pMin.x;
    const sy = pMin.y;
    const sw = pMax.x - pMin.x;
    const sh = pMax.y - pMin.y;
    
    // Create temp canvas to extract
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sw;
    tempCanvas.height = sh;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    
    // Render the current canvas to the temp canvas (cropped)
    // IMPORTANT: Draw original canvas into the temp one.
    tempCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    
    const dataUrl = tempCanvas.toDataURL('image/png');
    
    // Create new image entity
    const newId = Date.now().toString() + "-captured-" + Math.floor(Math.random()*1000);
    const newEntity: ImageEntity = {
      id: newId,
      type: 'image',
      point: { x: x1, y: y1 },
      width: w,
      height: h,
      src: dataUrl,
      color: '#ffffff',
      lineWidth: 0,
      layer: activeLayerId,
      opacity: 1,
      aspectRatio: w / h
    };
    
    setEntities(prev => {
      onCommitHistory?.(prev);
      return [...prev, newEntity];
    });
    
    // Switch tool back to Select after capture
    setActiveTool?.('Select');
  };

   const handleMouseDown = (e: React.PointerEvent) => {
    if (selectedLine || quickEditEntityId || textDialog) {
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    if (activeTool === 'Copy' && copyPhase !== 'idle') {
        if (e.button === 0) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const unconstrainedRawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
            let rawPoint = unconstrainedRawPoint;
            const currentSnap = getSnappedPoint(unconstrainedRawPoint, entities, activeTool, null);
            if (currentSnap.snapped) {
                rawPoint = currentSnap.point;
            } else if (hoverSnap && hoverSnap.snapped) {
                rawPoint = { ...hoverSnap.point };
            }

            if (copyPhase === 'selectBasePoint') {
                const snap = getSnappedPoint(rawPoint, entities, activeTool, null);
                const basePt = snap.snapped ? snap.point : rawPoint;
                setCopyBasePoint(basePt);
                if (copySourceEntityIds.length > 0) {
                    initiateCloneAndDrag(copySourceEntityIds, basePt);
                }
                setCopyPhase('selectDestinationPoint');
                setStatusMessage("Clicca per incollare la copia (puoi trascinare o fare clic singoli). Premi Invio o Tasto Destro per concludere.");
                return;
            } else if (copyPhase === 'selectDestinationPoint' && copyBasePoint) {
                // Determine snap point or ortho snap point where they dropped
                const staticEntities = entities.filter(ent => !dragEntityIds.includes(ent.id));
                const snapRes = getSnappedPoint(rawPoint, staticEntities, activeTool, null);
                let snapPoint = snapRes.snapped ? snapRes.point : rawPoint;
                
                const effectiveOrthoMode = getEffectiveOrtho(e, true);
                if (effectiveOrthoMode && !snapRes.snapped) {
                    const dx = snapPoint.x - copyBasePoint.x;
                    const dy = snapPoint.y - copyBasePoint.y;
                    if (Math.abs(dx) > Math.abs(dy)) {
                        snapPoint.y = copyBasePoint.y;
                    } else {
                        snapPoint.x = copyBasePoint.x;
                    }
                }

                // Apply final precise shift to match destination snap (or preserve last-offset snap if already snapped to equal offset)
                const activePair = activeParallelPairRef.current;
                const refTargetOffset = getEffectiveLastParallelOffset(entitiesRef.current);
                const isAlreadyAtLastOffset =
                    !snapRes.snapped &&
                    activePair &&
                    dragEntityIds.includes(activePair.lineId) &&
                    refTargetOffset > 0.05 &&
                    Math.abs(activePair.currentDist - refTargetOffset) < 0.08;
                const finalDeltaX = isAlreadyAtLastOffset ? 0 : (snapPoint.x - previousMouseRef.current.x);
                const finalDeltaY = isAlreadyAtLastOffset ? 0 : (snapPoint.y - previousMouseRef.current.y);

                setEntities(prev => {
                    const updatedEntities = prev.map(ent => {
                        if (dragEntityIds.includes(ent.id)) {
                            const updated = fastCloneEntity(ent);
                            if (updated.type === 'line' || updated.type === 'dimension') {
                                updated.start.x += finalDeltaX;
                                updated.start.y += finalDeltaY;
                                updated.end.x += finalDeltaX;
                                updated.end.y += finalDeltaY;
                            } else if (updated.type === 'circle' || updated.type === 'arc') {
                                updated.center.x += finalDeltaX;
                                updated.center.y += finalDeltaY;
                            } else if (updated.type === 'rectangle') {
                                updated.p1.x += finalDeltaX;
                                updated.p1.y += finalDeltaY;
                                updated.p2.x += finalDeltaX;
                                updated.p2.y += finalDeltaY;
                            } else if (updated.type === 'point' || updated.type === 'text') {
                                updated.point.x += finalDeltaX;
                                updated.point.y += finalDeltaY;
                            } else if (updated.type === 'image') {
                                updated.point.x += finalDeltaX;
                                updated.point.y += finalDeltaY;
                            } else if ((updated.type as string) === 'polygon' || (updated.type as string) === 'path') {
                                (updated as any).points = (updated as any).points.map((p: Point) => ({ x: p.x + finalDeltaX, y: p.y + finalDeltaY }));
                                if ((updated as any).holes) {
                                    (updated as any).holes = (updated as any).holes.map((hole: Point[]) => hole.map((p: Point) => ({ x: p.x + finalDeltaX, y: p.y + finalDeltaY })));
                                }
                            }
                            return updated;
                        }
                        return ent;
                    });
                    const committedLine = updatedEntities.find(e => dragEntityIds.includes(e.id) && e.type === 'line') as LineEntity | undefined;
                    if (committedLine) {
                        recordParallelOffsetFromNewLine(committedLine, updatedEntities);
                    }
                    onCommitHistory?.(updatedEntities);
                    return updatedEntities;
                });

                // 1. Remove the current drag entity IDs from clonedEntityIds so they are committed
                const committedIds = [...dragEntityIds];
                setClonedEntityIds(prev => {
                    const next = new Set(prev);
                    committedIds.forEach(id => next.delete(id));
                    return next;
                });

                // 2. Clear current dragging registers
                setDragEntityId(null);
                dragEntityIdRef.current = null;
                setDragEntityIds([]);
                dragEntityIdsRef.current = [];
                setActiveMoveSnapPoint(null);

                // 4. Spawn a NEW clone of the originals at copyBasePoint to be dragged again
                const sourceIds = copySourceEntityIds.length > 0 
                    ? copySourceEntityIds 
                    : (selectedEntityIds.length > 0 ? selectedEntityIds : []);
                
                if (sourceIds.length > 0) {
                    initiateCloneAndDrag(sourceIds, copyBasePoint, snapPoint);
                } else {
                    setCopyPhase('idle');
                    setStatusMessage(null);
                    setCopySourceEntityIds([]);
                }
                return;
            }
        }
    }
    
    if (isZoomModeRef.current) {
        if (e.button === 0) {
            isDraggingZoomRef.current = true;
            lastScreenMouseRef.current = { x: e.clientX, y: e.clientY };
            if (canvasRef.current) canvasRef.current.style.cursor = 'zoom-in';
            return;
        } else if (e.button === 2) {
            isDraggingPanRef.current = true;
            lastScreenMouseRef.current = { x: e.clientX, y: e.clientY };
            if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
            return;
        }
    }

    if (e.button === 0 && hoveredTavolaPart) {
        if (hoveredTavolaPart.part === 'cartiglio' && onDoubleClickTavola) {
            onDoubleClickTavola(hoveredTavolaPart.id);
            setDrawing(null);
            return;
        } else if (hoveredTavolaPart.part === 'badge' && tavole) {
            const tav = tavole.find(t => t.id === hoveredTavolaPart.id);
            if (tav && containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const { w, h } = getTavolaDimensions(tav);
                
                const padding = 60; // Clean safety padding around the sheet
                const viewportW = rect.width - padding * 2;
                const viewportH = rect.height - padding * 2;
                
                if (w > 0 && h > 0 && viewportW > 0 && viewportH > 0) {
                    const zoomX = viewportW / w;
                    const zoomY = viewportH / h;
                    const targetZoom = Math.min(zoomX, zoomY);
                    
                    const sheetCenterX = tav.position.x + w / 2;
                    const sheetCenterY = tav.position.y + h / 2;
                    
                    const screenCenterX = rect.width / 2;
                    const screenCenterY = rect.height / 2;
                    
                    const targetPanX = screenCenterX - sheetCenterX * targetZoom;
                    const targetPanY = screenCenterY - sheetCenterY * targetZoom;
                    
                    const startZoom = view.zoom;
                    const startPan = { ...view.pan };
                    const duration = 850; // Deliberate sweet cinematic cadence 
                    const startTime = performance.now();
                    
                    const animateZoomToFit = (time: number) => {
                        const elapsed = time - startTime;
                        const progress = Math.min(elapsed / duration, 1);
                        
                        // Ease Out Quint
                        const ease = 1 - Math.pow(1 - progress, 5);
                        
                        const currentZoom = startZoom + (targetZoom - startZoom) * ease;
                        const currentPan = {
                            x: startPan.x + (targetPanX - startPan.x) * ease,
                            y: startPan.y + (targetPanY - startPan.y) * ease
                        };
                        
                        setView({ zoom: currentZoom, pan: currentPan });
                        
                        if (progress < 1) {
                            requestAnimationFrame(animateZoomToFit);
                        }
                    };
                    
                    requestAnimationFrame(animateZoomToFit);
                }
            }
            setDrawing(null);
            return;
        }
    }

    if (onActionStart) onActionStart();
    
    if (e.button === 0) { 
        // LEFT CLICK: Reposition Tecnigrafo if clicked on BROWN body
        if (tecnigrafoOrigin) {
            const canvas = canvasRef.current;
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const rawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
                
                const rulerLength = 5000 / view.zoom;
                const edgeWidth = 6 / view.zoom;
                const bodyWidth = 32 / view.zoom;
                const hOffset = 10 / view.zoom;

                // Check Horizontal Ruler BROWN BODY box
                const hHit = rawPoint.x >= tecnigrafoOrigin.x - hOffset && rawPoint.x <= tecnigrafoOrigin.x + rulerLength &&
                             rawPoint.y >= tecnigrafoOrigin.y + edgeWidth && rawPoint.y <= tecnigrafoOrigin.y + bodyWidth;
                
                // Check Vertical Ruler BROWN BODY box
                const vHit = rawPoint.x >= tecnigrafoOrigin.x - bodyWidth && rawPoint.x <= tecnigrafoOrigin.x - edgeWidth &&
                             rawPoint.y >= tecnigrafoOrigin.y - hOffset && rawPoint.y <= tecnigrafoOrigin.y + rulerLength;

                if (hHit || vHit) {
                    setIsMovingTecnigrafo(true);
                    movingTecnigrafoStartRef.current = { mouse: { ...rawPoint }, origin: { ...tecnigrafoOrigin } };
                    
                    // Force the tecnigrafo style (Line + No Ortho)
                    setActiveTool?.('Line');
                    setOrthoMode?.(false);
                    return; 
                }
            }
        }
    }

    if (e.button === 2) {
        // RIGHT CLICK (handled mostly by context menu)
        if (tecnigrafoOrigin && !drawing) {
            e.preventDefault();
            return;
        }
        // Let handleContextMenu take care of toggling if NOT in tecnigrafo mode OR if drawing
        return; 
    }

    if (e.button === 1) {
      e.preventDefault();
      isPanningRef.current = true;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      // Pan/Zoom handling via middle click
      const startX = e.clientX - view.pan.x;
      const startY = e.clientY - view.pan.y;

      const handlePointerMove = (me: PointerEvent | MouseEvent) => {
        setView(prev => ({
          ...prev,
          pan: { x: me.clientX - startX, y: me.clientY - startY }
        }));
      };

      const handlePointerUp = () => {
        isPanningRef.current = false;
        if (canvasRef.current) canvasRef.current.style.cursor = ''; // Reset inline style to allow parent cursor to work
        window.removeEventListener('mousemove', handlePointerMove);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('mouseup', handlePointerUp);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);
      window.addEventListener('pointerup', handlePointerUp);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const unconstrainedRawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
    let rawPoint = unconstrainedRawPoint;

    // Reset virtual cursor offset so subsequent hand/mouse movements are real-time
    virtualCursorOffsetRef.current = null;
    
    // --- STRICT SNAP PRIORITY ---
    const currentSnap = getSnappedPoint(unconstrainedRawPoint, entities, activeTool, drawing);
    if (currentSnap.snapped) {
        rawPoint = currentSnap.point;
    } else if (hoverSnap && hoverSnap.snapped) {
        rawPoint = { ...hoverSnap.point };
    }

    const screenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const canvasPoint = screenToCanvas(screenPos.x, screenPos.y);

    // QUICK EDIT BADGE / ENTITY CLICK CHECK
    if (e.button === 0 && activeTool === 'Select') {
        const found = getEntityAtPoint(rawPoint, 30);
        if (found) {
            onSelect(found.id, found, screenPos);
            return;
        }
    }

    // BUBBLE CLICK DETECTION
    if (isPrecisionActive) {
        let targetCanvasPos = actualMousePosRef.current;
        if (drawing) {
            targetCanvasPos = drawing.current;
        } else if (activeTool === 'Parallel' && selectedParallelLine) {
            const line = selectedParallelLine as LineEntity;
            const dxLine = line.end.x - line.start.x;
            const dyLine = line.end.y - line.start.y;
            const L = Math.sqrt(dxLine * dxLine + dyLine * dyLine);
            if (L > 0) {
                const normX = -dyLine / L;
                const normY = dxLine / L;
                const offset = parallelDistance * parallelSign;
                targetCanvasPos = {
                    x: (line.start.x + line.end.x) / 2 + normX * offset,
                    y: (line.start.y + line.end.y) / 2 + normY * offset
                };
            }
        }
        const tScreen = canvasToScreen(targetCanvasPos.x, targetCanvasPos.y);
        const bubbleCx = tScreen.x + 120;
        const bubbleCy = tScreen.y - 120;
    } else {
  
    }

    lastMouseRef.current = rawPoint;

    // --- CUSTOM DOUBLE CLICK DETECTION ---
    const now = Date.now();
    if (now - lastClickTimeRef.current < 300 && lastClickPosRef.current) {
        const dx = rawPoint.x - lastClickPosRef.current.x;
        const dy = rawPoint.y - lastClickPosRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) < 20 / view.zoom) {
            lastClickTimeRef.current = 0; // reset

            // 1. SNAP DOUBLE-CLICK TRIGGER - DISABLED AS REQUESTED
            if (hoverSnap && hoverSnap.snapped && (hoverSnap.subtype === 'endpoint' || hoverSnap.subtype === 'center')) {
                // Manual input overlay removed
                return;
            }

            const clickedText = getEntityAtPoint(rawPoint);
            if (clickedText && clickedText.isBIM && (clickedText.bimType === 'door' || clickedText.bimType === 'window' || clickedText.bimAreaType)) {
                setDragEntityId(null);
                dragEntityIdRef.current = null;
                setPulsingEntityId(clickedText.id);
                if (onDoubleClickBIMElement) {
                    onDoubleClickBIMElement(clickedText);
                }
                return;
            } else {
                setPulsingEntityId(null);
            }

            if (clickedText && clickedText.type === 'text') {
                setDragEntityId(null);
                dragEntityIdRef.current = null;
                setTextDialog({
                    id: clickedText.id,
                    point: clickedText.point,
                    text: clickedText.text,
                    fontFamily: clickedText.fontFamily || 'sans-serif',
                    fontSize: clickedText.fontSize || 14,
                    fontWeight: (clickedText.fontWeight || 'normal') as 'normal' | 'bold',
                    textAlign: (clickedText.textAlign || 'left') as 'left' | 'center' | 'right' | 'justify',
                    color: clickedText.color || '#000000',
                });
                return;
            }

            if (clickedText && clickedText.type === 'dimension') {
                setDragEntityId(null);
                dragEntityIdRef.current = null;
                if (onDoubleClickDimension) {
                    onDoubleClickDimension(clickedText as DimensionEntity);
                }
                return;
            }

            if (activeTool === 'Join') {
                confirmJoin();
                return;
            }
            
            if (activeTool === 'BIM_TracciaSegmento' && hoveredBIMSegments.length > 0) {
                const seg = hoveredBIMSegments[0];
                setManualRoomPoints(prev => {
                    if (prev.length === 0) {
                        // First segment: calculate initial sideSign
                        const dx = seg.end.x - seg.start.x;
                        const dy = seg.end.y - seg.start.y;
                        const apX = rawPoint.x - seg.start.x;
                        const apY = rawPoint.y - seg.start.y;
                        const cross = dx * apY - dy * apX;
                        setManualSideSign(cross >= 0 ? 1 : -1);
                        return [seg.start, seg.end];
                    } else {
                        const lastPt = prev[prev.length - 1];
                        const dStart = Math.hypot(seg.start.x - lastPt.x, seg.start.y - lastPt.y);
                        const dEnd = Math.hypot(seg.end.x - lastPt.x, seg.end.y - lastPt.y);
                        // Add the point that is NOT closest to the last point to extend the chain
                        if (dStart < dEnd) {
                            return [...prev, seg.end];
                        } else {
                            return [...prev, seg.start];
                        }
                    }
                });
                return;
            }
            
            if (activeTool === 'BIM_DisegnaLineare' || activeTool === 'BIM_DisegnaStanza') {
                if (manualRoomPoints.length >= 2) {
                    const snap = getSnappedPoint(rawPoint, entities, activeTool, null);
                    const finalPt = snap.snapped ? snap.point : rawPoint;
                    const pts = [...manualRoomPoints];
                    const lastPt = pts[pts.length - 1];
                    if (Math.hypot(finalPt.x - lastPt.x, finalPt.y - lastPt.y) > 10 / view.zoom) {
                        pts.push(finalPt);
                    }
                    if (onAreaDetected) {
                        onAreaDetected({ points: pts, isLinear: activeTool === 'BIM_DisegnaLineare', isJollyActive });
                        setManualRoomPoints([]);
                        setActiveTool?.('Select');
                    } else {
                        const isLinear = activeTool === 'BIM_DisegnaLineare';
                        const nextIdx = entities.filter(e => e.isBIM && e.bimType === 'room').length + 1;
                        const newRoom: Entity = {
                            id: Date.now().toString(),
                            type: 'hatch',
                            isBIM: true,
                            bimType: 'room',
                            bimName: isLinear ? 'Parete Lineare ' + nextIdx : 'Stanza ' + nextIdx,
                            bimHeight: 2.70,
                            color: isLinear ? 'rgba(16, 185, 129, 0.15)' : 'rgba(52, 211, 153, 0.15)',
                            points: pts,
                            pattern: 'SOLID',
                            scale: 1,
                            angle: 0,
                            lineWidth: 1,
                            mode: 'pencil',
                            layer: activeLayerId,
                            bimRenderMode: isLinear ? 'parete_verticale' : 'solid'
                        };
                        setEntities(prev => {
                            const next = [...prev, newRoom];
                            return next;
                        });
                        onSelect(newRoom.id);
                        setManualRoomPoints([]);
                        setActiveTool?.('Select');
                    }
                }
                return;
            }
            
        }
    }

    // Squadrette Interaction
    if (showSquadrette) {
        const pt = unconstrainedRawPoint;
        for (const sq of squadrette) {
            const verts = getSquadrettaVertices(sq);
            if (isPointInPolygon(pt, verts)) {
                setDragSquadrettaId(sq.id);
                setDragSquadrettaOffset({ x: pt.x - sq.pos.x, y: pt.y - sq.pos.y });
                setLastSquadrettaInteractionAt(Date.now());
                return;
            }
        }
    }

    // Tasto Magico Z: Copia gli oggetti e li sposta pure
    if ((isMagicCopyActive || isMagicCopyActiveRef.current) && !drawing) {
        if (dragEntityIdRef.current) {
            // Click drops/commits the copied entity at its new position
            const activePair = activeParallelPairRef.current;
            if (activePair && activePair.lineId === dragEntityIdRef.current && activePair.currentDist > 0.05) {
                lastParallelOffsetInfoRef.current = {
                    distance: activePair.currentDist,
                    lineId: activePair.lineId,
                    refLineId: activePair.refLineId,
                    nx: activePair.nx,
                    ny: activePair.ny,
                    dirSign: activePair.signedDist >= 0 ? -1 : 1,
                    timestamp: Date.now()
                };
                justOffsetLineIdRef.current = activePair.lineId;
                try {
                    localStorage.setItem('lastParallelDistance', activePair.currentDist.toString());
                } catch (err) {}
            }
            parallelOverrideLockedLineRef.current = null;
            setClonedEntityIds(new Set());
            setDragEntityId(null);
            dragEntityIdRef.current = null;
            setDragEntityIds([]);
            dragEntityIdsRef.current = [];
            setActiveMoveSnapPoint(null);
            dragHasMovedRef.current = false;
            setEntities(prev => {
                onCommitHistory?.(prev);
                return [...prev];
            });
            return;
        }
        const found = getEntityAtPoint(rawPoint, 30);
        if (found) {
            onCommitHistory?.(entitiesRef.current);
            const targetIds = resolveGroups([found.id], entities);
            initiateCloneAndDrag(targetIds, rawPoint);
            return;
        }
    }

    // Sposta Tutto (Jolly `< >` / `Tab`) or Move tool direct grab/drop (SOLO SPOSTA, NON COPIA)
    if ((isJollyActive || activeTool === 'Move') && !drawing) {
        if (dragEntityIdRef.current) {
            // Second click drops the moved entity and commits history
            const activePair = activeParallelPairRef.current;
            if (activePair && activePair.lineId === dragEntityIdRef.current && activePair.currentDist > 0.05) {
                lastParallelOffsetInfoRef.current = {
                    distance: activePair.currentDist,
                    lineId: activePair.lineId,
                    refLineId: activePair.refLineId,
                    nx: activePair.nx,
                    ny: activePair.ny,
                    dirSign: activePair.signedDist >= 0 ? -1 : 1,
                    timestamp: Date.now()
                };
                justOffsetLineIdRef.current = activePair.lineId;
                try {
                    localStorage.setItem('lastParallelDistance', activePair.currentDist.toString());
                } catch (err) {}
            }
            parallelOverrideLockedLineRef.current = null;
            setDragEntityId(null);
            dragEntityIdRef.current = null;
            setDragEntityIds([]);
            dragEntityIdsRef.current = [];
            setActiveMoveSnapPoint(null);
            setMoveBasePoint(null);
            setMovePhase('idle');
            setEntities(prev => {
                onCommitHistory?.(prev);
                return [...prev];
            });
            return;
        }
        const found = getEntityAtPoint(rawPoint, 30);
        if (found) {
            const targetIds = resolveGroups([found.id], entities);
            setDragEntityIds(targetIds);
            dragEntityIdsRef.current = targetIds;
            setDragEntityId(found.id);
            dragEntityIdRef.current = found.id;
            setDragOffset({ x: rawPoint.x, y: rawPoint.y });
            lastMouseRef.current = rawPoint;
            previousMouseRef.current = rawPoint;
            dragHasMovedRef.current = false;
            return;
        }
    }

    lastClickTimeRef.current = now;
    lastClickPosRef.current = rawPoint;


    const clickedText = getEntityAtPoint(rawPoint, 25);
    if (activeTool === 'Testo' && clickedText && clickedText.type === 'text' && !drawing) {
        if (dragEntityId === clickedText.id) {
            setDragEntityId(null);
            dragEntityIdRef.current = null;
            setActiveMoveSnapPoint(null);
            setEntities(prev => {
                onCommitHistory?.(prev);
                return [...prev];
            });
            return;
        } else {
            setDragEntityId(clickedText.id);
            dragEntityIdRef.current = clickedText.id;
            lastMouseRef.current = rawPoint;
            previousMouseRef.current = rawPoint;
            setActiveMoveSnapPoint(null);
            return;
        }
    }

    // --- TAVOLA GESTURE DRAG INTERCEPT ---
    let hitTavolaId: string | null = null;
    if (tavole) {
      for (const tav of tavole) {
        if (!tav.visible) continue;
        const { w, h } = getTavolaDimensions(tav);
        
        let scaleFactor = 1000;
        if (tav.unit === 'cm') scaleFactor = 10;
        if (tav.unit === 'mm') scaleFactor = 1;

        const nearEdge = 
          (Math.abs(rawPoint.x - tav.position.x) < 15 / view.zoom && rawPoint.y >= tav.position.y && rawPoint.y <= tav.position.y + h) ||
          (Math.abs(rawPoint.x - (tav.position.x + w)) < 15 / view.zoom && rawPoint.y >= tav.position.y && rawPoint.y <= tav.position.y + h) ||
          (Math.abs(rawPoint.y - tav.position.y) < 15 / view.zoom && rawPoint.x >= tav.position.x && rawPoint.x <= tav.position.x + w) ||
          (Math.abs(rawPoint.y - (tav.position.y + h)) < 15 / view.zoom && rawPoint.x >= tav.position.x && rawPoint.x <= tav.position.x + w);

        if (nearEdge) {
          hitTavolaId = tav.id;
          break;
        }
      }
    }

    if (hitTavolaId) {
      setDragTavolaId(hitTavolaId);
      dragTavolaIdRef.current = hitTavolaId;
      lastMouseRef.current = rawPoint;
      previousMouseRef.current = rawPoint;
      return; 
    }
    
    // --- LONG PRESS GESTURE (3 SECONDS) ---
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    
    const holdTarget = getEntityAtPoint(rawPoint);
    if (holdTarget) {
      holdStartPosRef.current = { x: e.clientX, y: e.clientY };
      isHoldFiredRef.current = false;

      holdTimerRef.current = setTimeout(() => {
        isHoldFiredRef.current = true;
        const isModifierPressed = e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || isShiftPressedRef.current;
        skipToolResetRef.current = true;

        if (isModifierPressed) {
          // ACTIVATE MOVE SHORTCUT (Blue)
          setActiveTool?.('Move');
          const targetIds = resolveGroups([holdTarget.id], entities);
          
          setDragEntityIds(targetIds);
          setDragEntityId(holdTarget.id);
          dragEntityIdRef.current = holdTarget.id;
          setSelectionWindow(null);
          lastMouseRef.current = rawPoint;
          previousMouseRef.current = rawPoint;
          setActiveMoveSnapPoint(null);
        } else {
          // ACTIVATE COPY GESTURE (Green mother, creates & drags clone)
          setActiveTool?.('Copy');
          
          const targetIds = resolveGroups([holdTarget.id], entities);
          setCopySourceEntityIds(targetIds);

          const originalEntitiesToClone = entities.filter(ent => targetIds.includes(ent.id));
          const idMap: { [oldId: string]: string } = {};
          let oldGroupId: string | undefined = undefined;
          originalEntitiesToClone.forEach(ent => {
              idMap[ent.id] = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5);
              if (ent.groupId) {
                  oldGroupId = ent.groupId;
              }
          });

          const newGroupId = oldGroupId ? 'g_cloned_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5) : undefined;

          const clones: Entity[] = originalEntitiesToClone.map(ent => {
              const cloned = fastCloneEntity(ent);
              cloned.id = idMap[ent.id];
              if (ent.groupId && newGroupId) {
                  cloned.groupId = newGroupId;
              }
              return cloned;
          });

          setEntities(prev => [...prev, ...clones]);

          const clonedIdsList = clones.map(c => c.id);
          setClonedEntityIds(prev => {
              const next = new Set(prev);
              clonedIdsList.forEach(id => next.add(id));
              return next;
          });

          setDragEntityIds(clonedIdsList);
          setDragEntityId(clonedIdsList[0]);
          dragEntityIdRef.current = clonedIdsList[0];
          setSelectionWindow(null);
          lastMouseRef.current = rawPoint;
          previousMouseRef.current = rawPoint;
          dragStartPosRef.current = rawPoint;
          setActiveMoveSnapPoint(null);
          isStickyCopyRef.current = true;
          dragHasMovedRef.current = false;
        }
      }, 3000);
    }
    
    if (positioningDimId) {
        setPositioningDimId(null);
        setEntities(prev => prev);
        return;
    }

    if (positioningGroupId) {
        setPositioningGroupId(null);
        setPositioningGroupStartPos(null);
        setEntities(prev => prev);
        onSelect(null);
        return;
    }

    if (positioningEntityId) {
        setPositioningEntityId(null);
        setPositioningEntityStartPos(null);
        setEntities(prev => prev);
        onSelect(null);
        return;
    }

    const isFreehandActive = activeTool === 'Line';
    const isTempOrtho = false;
    
    // We enable snapping in freehand mode so drawings can snap to points and become smart!
    const shouldSkipSnap = (!isSnapActive()) || isTempOrtho || (activeTool === 'Template' && !drawing) || (activeTool === 'Dimension' && selectionMode === 'object') || activeTool === 'Gomma';
    
    let snapped = shouldSkipSnap
        ? { point: rawPoint, snapped: false, type: 'CAD' as const, refPoint: undefined, constraintAxis: undefined, refPoint2: undefined, constraintAxis2: undefined, hasDoubleSmart: false }
        : getSnappedPoint(rawPoint, entities, activeTool, drawing as any);

    if (hoverSnap && hoverSnap.snapped && !shouldSkipSnap) {
        snapped = hoverSnap as any;
    }

    if (activeTool === 'CopiaVideo') {
        setSelectionWindow({ start: rawPoint, current: rawPoint });
        return;
    }

    if (activeTool === 'RotateScale') {
        const found = getEntityAtPoint(rawPoint);
        if (found) {
            onSelectForRotation?.(found.id);
        } else {
            onSelectForRotation?.(null);
        }
        return;
    }

    if (activeTool === 'Select') {
        const found = getEntityAtPoint(rawPoint);
        if (found) {
            const isBIMDoorWindow = found.isBIM && (found.bimType === 'door' || found.bimType === 'window');
            const isArredo = !!(found.templateId || (found.groupId && entities.find(e => e.groupId === found.groupId && e.templateId)));
            const isGrouped = !!found.groupId;

            if (found.raccordoMetadata && onEditRaccordo) {
                onEditRaccordo(found);
                return;
            }
            
            // If already selected and is BIM/Arredo, rotate relative to anchor point
            if (found.id === selectedEntityId && (isBIMDoorWindow || isArredo || isGrouped)) {
                // Determine anchor point
                let anchor: Point = rawPoint;
                if (isBIMDoorWindow && (found as any).start) {
                    anchor = (found as any).start;
                } else if (found.groupId) {
                    // For arredo groups, we try to use the first entity's start/center or group center as anchor
                    const gEnts = entities.filter(e => e.groupId === found.groupId);
                    if (gEnts.length > 0) {
                        const first = gEnts[0];
                        if (first.type === 'line') anchor = first.start;
                        else if (first.type === 'circle' || first.type === 'arc') anchor = first.center;
                        else if (first.type === 'rectangle') anchor = first.p1;
                        else if (first.type === 'point' || first.type === 'text') anchor = first.point;
                    }
                }

                const rotatePt = (p: Point): Point => ({
                    x: anchor.x - (p.y - anchor.y),
                    y: anchor.y + (p.x - anchor.x)
                });

                setEntities(prev => {
                    const next = prev.map(ent => {
                        const shouldRotate = (found.groupId && ent.groupId === found.groupId) || (ent.id === found.id);
                        if (shouldRotate) {
                            if (ent.type === 'line' || ent.type === 'dimension') {
                                return { ...ent, start: rotatePt(ent.start), end: rotatePt(ent.end) };
                            } else if (ent.type === 'circle' || ent.type === 'arc') {
                                const newCenter = rotatePt(ent.center);
                                if (ent.type === 'arc') {
                                    return { 
                                        ...ent, 
                                        center: newCenter, 
                                        startAngle: normalizeAngle((ent.startAngle || 0) + 90), 
                                        endAngle: normalizeAngle((ent.endAngle || 0) + 90) 
                                    };
                                }
                                return { ...ent, center: newCenter };
                            } else if (ent.type === 'rectangle') {
                                return { ...ent, p1: rotatePt(ent.p1), p2: rotatePt(ent.p2) };
                            } else if (ent.type === 'hatch') {
                                return { ...ent, points: (ent as any).points.map(rotatePt) } as any;
                            } else if (ent.type === 'text' || ent.type === 'point') {
                                return { ...ent, point: rotatePt(ent.point) };
                            }
                        }
                        return ent;
                    });
                    return next;
                });
                
                // Do not return here! We want it to activate movement below!
                // We just proceed to the next block which activates movement.
            }

            // Click activates movement for BIM/Arredo immediately
            onSelect(found.id, undefined, rawPoint);
            setPulsingEntityId(null); // Clear unique highlight when clicking another entity
            if (isBIMDoorWindow || isArredo || isGrouped) {
                if (found.groupId) {
                    setPositioningGroupId(found.groupId);
                    setPositioningGroupStartPos(rawPoint);
                } else {
                    setPositioningEntityId(found.id);
                    setPositioningEntityStartPos(rawPoint);
                }
            }
            return;
        } else {
            onSelect(null);
            setPulsingEntityId(null); // Clear pulsing highlight on empty click
            setSelectionWindow({ start: rawPoint, current: rawPoint });
        }
    } else if (activeTool === 'Specchio') {
        if (specchioState === 'axis_start') {
            const found = getEntityAtPoint(rawPoint);
            if (found && found.type === 'line') {
                setSpecchioFinalAxis({ start: found.start, end: found.end, isExisting: true, entityId: found.id });
                setSpecchioState('objects');
            } else {
                setSpecchioAxisPt1(rawPoint);
                setSpecchioState('axis_end');
            }
        } else if (specchioState === 'axis_end' && specchioAxisPt1) {
            const snapRes = getSnappedPoint(rawPoint, entities, activeTool, { type: 'line', start: specchioAxisPt1, current: rawPoint } as any);
            const isWhitelistedSnap = snapRes.snapped && (
                snapRes.subtype === 'endpoint' || 
                snapRes.subtype === 'midpoint' || 
                snapRes.subtype === 'perpendicular' || 
                snapRes.subtype === 'quadrant' || 
                snapRes.subtype === 'center' ||
                snapRes.subtype === 'intersection'
            );
            
            let finalPt2 = snapRes.snapped ? snapRes.point : rawPoint;
            const effectiveOrthoMode = getEffectiveOrtho(e, true);
            if (effectiveOrthoMode && !isWhitelistedSnap) {
               const dx = Math.abs(finalPt2.x - specchioAxisPt1.x);
               const dy = Math.abs(finalPt2.y - specchioAxisPt1.y);
               if (dx > dy) {
                   finalPt2.y = specchioAxisPt1.y;
               } else {
                   finalPt2.x = specchioAxisPt1.x;
               }
            }

            const newAxisId = Date.now().toString() + "-axis";
            const newAxis: LineEntity & { isSimmetryAxis?: boolean } = {
                id: newAxisId,
                type: 'line',
                start: specchioAxisPt1,
                end: finalPt2,
                color: '#10b981', 
                lineWidth: 1.5,
                dashed: true,
                mode: 'pencil',
                layer: activeLayerId,
                isSimmetryAxis: true
            };
            setEntities(prev => {
                const next = [...prev, newAxis];
                return next;
            });
            setSpecchioFinalAxis({ start: specchioAxisPt1, end: finalPt2, isExisting: false, entityId: newAxisId });
            setSpecchioState('objects');
        } else if (specchioState === 'objects') {
            const found = getEntityAtPoint(rawPoint);
            if (found && found.id !== specchioFinalAxis?.entityId) {
                setSpecchioSelectedIds(prev => prev.includes(found.id) ? prev.filter(id => id !== found.id) : [...prev, found.id]);
            } else {
                setSelectionWindow({ start: Math.abs(actualMousePosRef.current.x - rawPoint.x) > 2 ? rawPoint : actualMousePosRef.current, current: actualMousePosRef.current });
            }
        }
    } else if (activeTool === 'LiveMirror') {
        if (liveMirrorState === 'axis_start') {
            const found = getEntityAtPoint(rawPoint);
            if (found && found.type === 'line') {
                const line = found as LineEntity;
                const axis = { start: line.start, end: line.end };
                onUpdateLiveMirrorAxis?.(axis);
                saveAxisToLocalStorage(axis);
                setActiveTool?.('Select');
            } else {
                setLiveMirrorAxisPt1(rawPoint);
                setLiveMirrorState('axis_end');
            }
        } else if (liveMirrorState === 'axis_end' && liveMirrorAxisPt1) {
            const snapRes = getSnappedPoint(rawPoint, entities, activeTool, { type: 'line', start: liveMirrorAxisPt1, current: rawPoint } as any);
            let finalPt2 = snapRes.snapped ? snapRes.point : rawPoint;
            const effectiveOrthoMode = getEffectiveOrtho(e, true);
            if (effectiveOrthoMode) {
               const dx = Math.abs(finalPt2.x - liveMirrorAxisPt1.x);
               const dy = Math.abs(finalPt2.y - liveMirrorAxisPt1.y);
               if (dx > dy) {
                   finalPt2.y = liveMirrorAxisPt1.y;
               } else {
                   finalPt2.x = liveMirrorAxisPt1.x;
               }
            }
            const axis = { start: liveMirrorAxisPt1, end: finalPt2 };
            onUpdateLiveMirrorAxis?.(axis);
            saveAxisToLocalStorage(axis);
            setLiveMirrorState('axis_start');
            setLiveMirrorAxisPt1(null);
            setActiveTool?.('Select');
        }
    } else if (activeTool === 'Parallel') {
        const now = Date.now();
        if (now - lastParallelCommitTimeRef.current < 250) return;

        if (!selectedParallelLine) {
            const found = getLineAtPoint(rawPoint);
            if (found) {
                setSelectedParallelLine(found);
                setParallelMouse(rawPoint);

                let distToUse = 10;
                const parsedStr = parseFloat(parallelInputString);
                if (!isNaN(parsedStr) && parsedStr > 0) {
                    distToUse = parsedStr;
                } else if (parallelDistance > 0) {
                    distToUse = parallelDistance;
                } else {
                    try {
                        const saved = localStorage.getItem('lastParallelDistance');
                        if (saved && !isNaN(parseFloat(saved)) && parseFloat(saved) > 0) {
                            distToUse = parseFloat(saved);
                        }
                    } catch(e) {}
                }

                setParallelDistance(distToUse);
                setParallelInputString(distToUse.toString());
                
                onLastParameterChange?.({ type: 'offset', value: parseFloat(distToUse.toFixed(2)) });
                
                try {
                    localStorage.setItem('lastParallelDistance', distToUse.toString());
                } catch(e) {}
                setIsParallelWheelActive(true);

                const line = found as LineEntity;
                const dx = line.end.x - line.start.x;
                const dy = line.end.y - line.start.y;
                const L = Math.sqrt(dx * dx + dy * dy);
                if (L > 0) {
                    const nx = -dy / L;
                    const ny = dx / L;
                    const vec1 = { x: rawPoint.x - line.start.x, y: rawPoint.y - line.start.y };
                    setParallelSign((vec1.x * nx + vec1.y * ny) >= 0 ? 1 : -1);
                }
            }
        } else {
            commitParallel();
        }
    } else if (activeTool === 'Template' && selectedTemplateId) {
        // Magnetic behavior: if clicking on an existing mask (group), move it instead of placing new one
        const found = getEntityAtPoint(rawPoint);
        if (found && found.groupId) {
            setPositioningGroupId(found.groupId);
            setPositioningGroupStartPos(rawPoint);
            onSelect(found.id);
            return;
        }

        const template = TEMPLATES.find(t => t.id === selectedTemplateId);
        if (template) {
            const maskLayerId = layers.find(l => l.name === 'Maschere')?.id || activeLayerId;
            const groupId = 'group_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5);
            const newEntities: Entity[] = template.entities.map(te => {
                const baseProps = {
                    id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
                    color: defaultLineStyle.color,
                    lineWidth: defaultLineStyle.lineWidth,
                    layer: maskLayerId,
                    mode: defaultLineStyle.mode,
                    groupId,
                    templateId: template.id
                };
                
                if (te.type === 'line') {
                    return {
                        ...baseProps,
                        type: 'line',
                        start: { x: snapped.point.x + te.start.x, y: snapped.point.y + te.start.y },
                        end: { x: snapped.point.x + te.end.x, y: snapped.point.y + te.end.y },
                    } as LineEntity;
                } else if (te.type === 'circle') {
                    return {
                        ...baseProps,
                        type: 'circle',
                        center: { x: snapped.point.x + te.center.x, y: snapped.point.y + te.center.y },
                        radius: te.radius
                    } as CircleEntity;
                } else if (te.type === 'arc') {
                    return {
                        ...baseProps,
                        type: 'arc',
                        center: { x: snapped.point.x + te.center.x, y: snapped.point.y + te.center.y },
                        radius: te.radius,
                        startAngle: te.startAngle,
                        endAngle: te.endAngle
                    } as ArcEntity;
                }
                return null;
            }).filter(e => e !== null) as Entity[];

            setEntities(prev => {
                const next = [...prev, ...newEntities];
                onCommitHistory?.(next);
                return next;
            });
        }
    } else if (activeTool === 'Hatch' || activeTool === 'BIM_Finitura') {
        const isFinitura = activeTool === 'BIM_Finitura';
        const targetLayerName = isFinitura ? 'BIM_Finiture' : 'Hatch';
        const targetLayerId = layers.find(l => l.name === targetLayerName)?.id || (isFinitura ? 'BIM_Finiture' : activeLayerId);
        
        const clickedHatch = entities.find(ent => {
          if (ent.type !== 'hatch' || ent.layer !== targetLayerId || !(ent as any).points) return false;
          return isPointInFullPolygon(rawPoint, { points: (ent as any).points, holes: (ent as any).holes });
        });
        if (clickedHatch) {
            onSelect(clickedHatch.id);
        } else {
            const poly = findBoundaryPolygon(screenPos, entities, view, rect.width, rect.height, screenToCanvas, layers);
            if (poly) {
                const newHatch: Entity = {
                    id: Date.now().toString(),
                    type: 'hatch',
                    pattern: defaultHatchStyle?.pattern || 'ANSI31',
                    scale: defaultHatchStyle?.scale || 30,
                    angle: defaultHatchStyle?.angle || 0,
                    color: isFinitura ? (defaultHatchStyle?.color || '#ef4444') : (defaultHatchStyle?.color || defaultLineStyle.color || '#3b82f6'),
                    sfumatura: (defaultHatchStyle as any)?.sfumatura || 0,
                    mode: defaultLineStyle.mode,
                    points: poly.points,
                    holes: poly.holes,
                    layer: targetLayerId
                } as any;
                setEntities(prev => {
                    return [...prev, newHatch];
                });
                onSelect(newHatch.id);
            } else {
                // Diagnose why the boundary was not found to explain to the user and avoid confusing silent failures
                const clickCanvasPt = rawPoint;
                const physicalEntities = entities.filter(ent => {
                    if (ent.type === 'hatch' || ent.type === 'text' || ent.type === 'dimension') return false;
                    if (ent.isBIM && ent.bimType !== 'wall' && ent.bimType !== 'window' && ent.bimType !== 'door') return false;
                    const layer = layers.find(l => l.id === ent.layer);
                    return !(layer && (!layer.visible || layer.frozen));
                });

                if (physicalEntities.length === 0) {
                    alert(
                        "ATTENZIONE: DISEGNO VUOTO\n" +
                        "=========================================\n" +
                        "Non ci sono linee, cerchi o muri visibili sul foglio.\n\n" +
                        "Disegna o posiziona prima un contorno chiuso per poter inserire un retino (Hatch)."
                    );
                } else {
                    let nearestDist = Infinity;
                    physicalEntities.forEach(ent => {
                        if (ent.type === 'line' && ent.start && ent.end) {
                            let dist = 0;
                            if (ent.isFreehand && ent.inkPoints && ent.inkPoints.length > 0) {
                                dist = getClosestPointOnPolyline(clickCanvasPt, ent.inkPoints).dist;
                            } else {
                                const p = clickCanvasPt;
                                const s = ent.start;
                                const e = ent.end;
                                const l2 = (s.x - e.x) ** 2 + (s.y - e.y) ** 2;
                                if (l2 === 0) dist = Math.sqrt((p.x - s.x) ** 2 + (p.y - s.y) ** 2);
                                else {
                                    let t = ((p.x - s.x) * (e.x - s.x) + (p.y - s.y) * (e.y - s.y)) / l2;
                                    t = Math.max(0, Math.min(1, t));
                                    dist = Math.sqrt((p.x - (s.x + t * (e.x - s.x))) ** 2 + (p.y - (s.y + t * (e.y - s.y))) ** 2);
                                }
                            }
                            if (dist < nearestDist) nearestDist = dist;
                        } else if (ent.type === 'circle' && ent.center && ent.radius) {
                            const d = Math.abs(Math.sqrt((clickCanvasPt.x - ent.center.x) ** 2 + (clickCanvasPt.y - ent.center.y) ** 2) - ent.radius);
                            if (d < nearestDist) nearestDist = d;
                        }
                    });

                    if (nearestDist > 180) {
                        alert(
                            "ATTENZIONE: CLICK TROPPO LONTANO\n" +
                            "=========================================\n" +
                            "Hai cliccato in una zona vuota e troppo distante dalle figure (distanza minima: " + Math.round(nearestDist) + " cm).\n\n" +
                            "Clicca all'interno di un'area delimitata da linee o muri."
                        );
                    } else {
                        alert(
                            "IMPOSSIBILE APPLICARE IL RETINO (HATCH)\n" +
                            "=========================================\n" +
                            "L'area selezionata non è chiusa o presenta un varco d'apertura.\n\n" +
                            "Anche con la tolleranza automatica (fino a 32 pixel) che ricuce lievi imperfezioni " +
                            "e tratti scombinati, il riempimento fuggirebbe e si disperderebbe all'esterno.\n\n" +
                            "Suggerimenti pratici:\n" +
                            "1. Chiudi e raccorda le cime dei segmenti che delimitano l'area.\n" +
                            "2. Traccia piccoli tratti mancanti per garantire la tenuta stagna dell'angolo.\n" +
                            "3. Verifica che tutti i layer che compongono il confine siano visibili e non congelati."
                        );
                    }
                }
            }
        }
    } else if (activeTool === 'BIM_Symbol' && selectedBIMSymbolType) {
        const isElectrical = ['punto_luce', 'presa_standard', 'presa_schuko', 'presa_tv', 'presa_dati', 'interruttore', 'interruttore_bipolare', 'deviatore', 'invertitore', 'pulsante', 'pulsante_tirante', 'quadro', 'scatola_derivazione', 'suoneria', 'ronzatore', 'termostato', 'faretto', 'lampada_emergenza', 'applique', 'citofono', 'videocitofono'].includes(selectedBIMSymbolType);
        const targetLayerName = isElectrical ? 'BIM_Impianti_Elettrici' : 'BIM_Impianti_Idraulici';
        const targetLayerId = layers.find(l => l.name === targetLayerName)?.id || targetLayerName;
        const targetColor = '#334155'; // Using Slate 700 for a single, uniform thin color

        const geomList = getBIMSymbolEntities(selectedBIMSymbolType, bimSymbolScale || 1);
        const groupId = 'group_sym_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5);

        const newEntities: Entity[] = geomList.map(te => {
            const baseProps = {
                id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
                color: targetColor,
                lineWidth: 0.8,
                layer: targetLayerId,
                mode: 'ink' as const,
                groupId,
                isBIM: true as const,
                bimType: isElectrical ? 'electrical_symbol' as const : 'hydraulic_symbol' as const,
                bimName: selectedBIMSymbolType
            };

            if (te.type === 'line' && te.start && te.end) {
                return {
                    ...baseProps,
                    type: 'line',
                    start: { x: snapped.point.x + te.start.x, y: snapped.point.y + te.start.y },
                    end: { x: snapped.point.x + te.end.x, y: snapped.point.y + te.end.y },
                } as any;
            } else if (te.type === 'circle' && te.center && te.radius) {
                return {
                    ...baseProps,
                    type: 'circle',
                    center: { x: snapped.point.x + te.center.x, y: snapped.point.y + te.center.y },
                    radius: te.radius
                } as any;
            } else if (te.type === 'arc' && te.center && te.radius) {
                return {
                    ...baseProps,
                    type: 'arc',
                    center: { x: snapped.point.x + te.center.x, y: snapped.point.y + te.center.y },
                    radius: te.radius,
                    startAngle: te.startAngle,
                    endAngle: te.endAngle
                } as any;
            } else if (te.type === 'text' && te.center && te.text) {
                return {
                    ...baseProps,
                    type: 'text',
                    point: { x: snapped.point.x + te.center.x, y: snapped.point.y + te.center.y },
                    text: te.text,
                    fontFamily: 'Courier New',
                    fontSize: 8,
                    fontWeight: 'bold',
                    textAlign: 'center'
                } as any;
            }
            return null;
        }).filter(e => e !== null) as Entity[];

        if (newEntities.length > 0) {
            setEntities(prev => {
                const next = [...prev, ...newEntities];
                return next;
            });
        }
    } else if (activeTool === 'BIM_RilevaStanza') {
        const poly = findBoundaryPolygon(screenPos, entities, view, rect.width, rect.height, screenToCanvas, layers);
        if (poly && poly.points.length > 2) {
            if (onAreaDetected) {
                onAreaDetected({ ...poly, isJollyActive });
            } else {
                const nextIdx = entities.filter(e => e.isBIM && e.bimType === 'room').length + 1;
                const newRoom: Entity = {
                    id: Date.now().toString(),
                    type: 'hatch',
                    isBIM: true,
                    bimType: 'room',
                    bimName: 'Stanza ' + nextIdx,
                    bimHeight: 2.70,
                    color: 'rgba(52, 211, 153, 0.15)',
                    points: poly.points,
                    holes: poly.holes,
                    pattern: 'SOLID',
                    scale: 1,
                    angle: 0,
                    lineWidth: 1,
                    mode: 'pencil',
                    layer: activeLayerId
                };
                setEntities(prev => {
                    const next = [...prev, newRoom];
                    return next;
                });
                onSelect(newRoom.id, newRoom);
            }
        } else {
            alert(
                "IMPOSSIBILE RILEVARE AUTOMATICAMENTE LA STANZA\n" +
                "=================================================\n" +
                "I muri o confini di quest'area non formano un circuito chiuso continuo.\n\n" +
                "Il rilevatore intelligente ha provato a chiudere spazi vuoti fino a 32 pixel (tolleranza di giunzione), " +
                "ma i muri risultano comunque disconnessi o interrotti in qualche punto.\n\n" +
                "Soluzioni disponibili:\n" +
                "1. Chiudi i varchi rimasti aperti tra i muri.\n" +
                "2. Seleziona lo strumento 'Disegna Stanza' per segnare manualmente i vertici uno ad uno.\n" +
                "3. Controlla che le porte o finestre non interrompano completamente la continuità dei muri."
            );
        }
    } else if (activeTool === 'BIM_DisegnaStanza' || activeTool === 'BIM_DisegnaLineare') {
        const clickedPoint = snapped.point;
        
        if (activeTool === 'BIM_DisegnaLineare' && hoveredBIMSegments.length > 0) {
            // Clicked near a segment! Perform automated linear survey!
            const pts = chainSegmentsToPoints(hoveredBIMSegments);
            
            const firstSeg = hoveredBIMSegments[0];
            let sideSign = 1;
            if (firstSeg) {
                const abX = firstSeg.end.x - firstSeg.start.x;
                const abY = firstSeg.end.y - firstSeg.start.y;
                const apX = clickedPoint.x - firstSeg.start.x;
                const apY = clickedPoint.y - firstSeg.start.y;
                const cross = abX * apY - abY * apX;
                sideSign = cross >= 0 ? 1 : -1;
            }
            
            // Create permanent trace lines to leave a trace of the occurred insertion of a BIM object
            const traceLines: Entity[] = hoveredBIMSegments.map((seg, idx) => ({
                id: `trace_${Date.now()}_${idx}`,
                type: 'line',
                color: '#06b6d4',
                lineWidth: 2,
                lineType: 'dashed',
                layer: activeLayerId || '0',
                start: seg.start,
                end: seg.end,
                isBIM: false,
                name: 'Tracciato Rilievo'
            } as any));

            if (onAreaDetected) {
                // First insert the permanent trace lines
                setEntities(prev => [...prev, ...traceLines]);
                onAreaDetected({ points: pts, isLinear: true, isJollyActive, sideSign } as any);
                setManualRoomPoints([]);
                setHoveredBIMSegments([]);
                setActiveTool?.('Select');
            } else {
                const nextIdx = entities.filter(e => e.isBIM && e.bimType === 'room').length + 1;
                const newRoom: Entity = {
                    id: Date.now().toString(),
                    type: 'hatch',
                    isBIM: true,
                    bimType: 'room',
                    bimName: 'Parete Lineare ' + nextIdx,
                    bimHeight: 2.70,
                    color: 'rgba(16, 185, 129, 0.15)',
                    points: pts,
                    pattern: 'SOLID',
                    scale: 1,
                    angle: 0,
                    lineWidth: 1,
                    mode: 'pencil',
                    layer: activeLayerId,
                    bimRenderMode: 'parete_verticale'
                };
                setEntities(prev => [...prev, ...traceLines, newRoom]);
                onSelect(newRoom.id);
                setManualRoomPoints([]);
                setHoveredBIMSegments([]);
                setActiveTool?.('Select');
            }
            return;
        }

        if (manualRoomPoints.length > 2) {
            const firstPt = manualRoomPoints[0];
            const distToStart = Math.sqrt((clickedPoint.x - firstPt.x)**2 + (clickedPoint.y - firstPt.y)**2);
            if (distToStart < 15 / view.zoom) {
                if (onAreaDetected) {
                    onAreaDetected({ points: [...manualRoomPoints], isLinear: activeTool === 'BIM_DisegnaLineare', isJollyActive });
                    setManualRoomPoints([]);
                    setActiveTool?.('Select');
                } else {
                    const isLinear = activeTool === 'BIM_DisegnaLineare';
                    const nextIdx = entities.filter(e => e.isBIM && e.bimType === 'room').length + 1;
                    const newRoom: Entity = {
                        id: Date.now().toString(),
                        type: 'hatch',
                        isBIM: true,
                        bimType: 'room',
                        bimName: isLinear ? 'Parete Lineare ' + nextIdx : 'Stanza ' + nextIdx,
                        bimHeight: 2.70,
                        color: isLinear ? 'rgba(16, 185, 129, 0.15)' : 'rgba(52, 211, 153, 0.15)',
                        points: [...manualRoomPoints],
                        pattern: 'SOLID',
                        scale: 1,
                        angle: 0,
                        lineWidth: 1,
                        mode: 'pencil',
                        layer: activeLayerId,
                        bimRenderMode: isLinear ? 'parete_verticale' : 'solid'
                    };
                    setEntities(prev => {
                        const next = [...prev, newRoom];
                        return next;
                    });
                    onSelect(newRoom.id);
                    setManualRoomPoints([]);
                    setActiveTool?.('Select');
                }
                return;
            }
        }
        setManualRoomPoints(prev => [...prev, clickedPoint]);
    } else if (activeTool === 'BIM_Porta' || activeTool === 'BIM_Finestra' || activeTool === 'BIM_Muro' || activeTool === 'Muro') {
        const found = getEntityAtPoint(rawPoint);
        if (found && found.isBIM && (found.bimType === 'door' || found.bimType === 'window')) {
            // Seleziona se non lo è
            if (found.id !== selectedEntityId) {
                onSelect(found.id);
                if (drawing) setDrawing(null);
                
                // Entra in modalità spostamento (anche al primo click)
                setPositioningEntityId(found.id);
                setPositioningEntityStartPos(rawPoint);
                setActiveTool?.('Select'); // Convertiamo in strumento Select per facilitare la rotazione ai click successivi
                return;
            }

            // Se è già selezionato, RUOTA DI 90 GRADI
            const entAsAny = found as any;
            let anchor: Point = rawPoint;
            if (entAsAny.start && entAsAny.end) {
                anchor = { x: (entAsAny.start.x + entAsAny.end.x) / 2, y: (entAsAny.start.y + entAsAny.end.y) / 2 };
            }
            
            const rotatePt = (p: Point): Point => ({
                x: anchor.x - (p.y - anchor.y),
                y: anchor.y + (p.x - anchor.x)
            });

            setEntities(prev => {
                return prev.map(ent => {
                    if (ent.id === found.id) {
                        const eAny = ent as any;
                        const currentAngle = eAny.angle || 0;
                        return { 
                            ...ent, 
                            start: rotatePt(eAny.start), 
                            end: rotatePt(eAny.end),
                            angle: (currentAngle + 90) % 360
                        };
                    }
                    return ent;
                });
            });

            // E avvia lo spostamento automatico
            setPositioningEntityId(found.id);
            setPositioningEntityStartPos(rawPoint);
            setActiveTool?.('Select');
            if (drawing) setDrawing(null);
            return;
        }

        if (activeTool === 'BIM_Porta' || activeTool === 'BIM_Finestra') {
            const isDoor = activeTool === 'BIM_Porta';
            const w = isDoor ? lastDoorWidth : lastWindowWidth;
            const h = isDoor ? lastDoorHeight : lastWindowHeight;
            
            // Trova muro più vicino per allineamento
            let angle = isDoor ? 0 : parseFloat(localStorage.getItem('lastWindowRotation') || '0');
            let bestWall: any = null;
            let minDist = Infinity;
            for (const e of entities) {
                if (e.type === 'line' && e.isBIM && e.bimType === 'wall' && e.start && e.end) {
                    const dist = distanceToSegment(snapped.point, e.start, e.end);
                    if (dist < minDist && dist < 30 / view.zoom) {
                        minDist = dist;
                        bestWall = e;
                    }
                }
            }
            if (bestWall) {
                // Se c'è un muro, calcola l'angolo del muro e aggiungi la rotazione desiderata dell'infisso
                const wallAngle = Math.atan2(bestWall.end.y - bestWall.start.y, bestWall.end.x - bestWall.start.x);
                angle = (wallAngle * 180 / Math.PI) + (isDoor ? 0 : parseFloat(localStorage.getItem('lastWindowRotation') || '0'));
                angle = (angle * Math.PI / 180); // torna in radianti
            } else {
                angle = (angle * Math.PI / 180); // gradi da storage a radianti
            }

            const dx = Math.cos(angle) * (w / 2);
            const dy = Math.sin(angle) * (w / 2);

            const startPoint = { x: snapped.point.x - dx, y: snapped.point.y - dy };
            const endPoint = { x: snapped.point.x + dx, y: snapped.point.y + dy };

            const newElem = {
                id: Date.now().toString(),
                type: 'line',
                isBIM: true,
                bimType: isDoor ? 'door' : 'window',
                bimName: isDoor ? `Porta ${w}` : `Finestra ${w}x${h}`,
                bimWidth: w,
                bimWindowHeight: isDoor ? undefined : h,
                bimZElevation: isDoor ? undefined : lastWindowZElevation,
                bimWindowType: isDoor ? undefined : lastWindowType,
                bimFlipLeft: isDoor ? false : (lastWindowFlip), // Manteniamo flip Left/Right
                bimFlipSide: isDoor ? false : (localStorage.getItem('lastWindowFlipSide') === 'true'), // Inward/Outward
                angle: isDoor ? 0 : parseFloat(localStorage.getItem('lastWindowRotation') || '0'),
                start: startPoint,
                end: endPoint,
                color: isDoor ? '#dc2626' : '#2563eb',
                lineWidth: 2,
                mode: 'ink',
                layer: isDoor ? 'BIM_Porte' : 'BIM_Finestre'
            } as any;

            setEntities(prev => {
                const next = [...prev, newElem];
                onCommitHistory?.(next);
                return next;
            });
            return;
        }

        if (!drawing) {
            setDrawing({ start: snapped.point, current: snapped.point });
        } else {
            setHasUsedInputSnap(true);
            const isLineLikeTool = (activeTool as string) === 'Line' || (activeTool as string) === 'BIM_Muro' || (activeTool as string) === 'Muro';
            const effectiveOrthoMode = getEffectiveOrtho(e, isLineLikeTool);
            const isOrthoHorizontal = isLineLikeTool && effectiveOrthoMode && 
                  Math.abs(snapped.point.x - drawing.start.x) >= Math.abs(snapped.point.y - drawing.start.y);

            let endPoint = drawing.current || snapped.point;

            if (activeTool === 'BIM_Muro' || activeTool === 'Muro') {
                const thickness = bimWallThickness || 15;
                const newElem: Entity = {
                    id: Date.now().toString(),
                    type: 'line',
                    isBIM: true,
                    bimType: 'wall',
                    bimName: `Muro sp.${thickness} cm`,
                    bimWidth: thickness,
                    bimHeight: bimWallHeight,
                    bimRenderMode: lastWallRenderMode,
                    start: drawing.start,
                    end: endPoint,
                    color: '#4b5563',
                    lineWidth: 2,
                    mode: 'ink',
                    layer: 'BIM_Muri'
                } as any;
                const wallLen = Math.hypot(endPoint.x - drawing.start.x, endPoint.y - drawing.start.y);
                if (wallLen > 0.01) {
                    lastSegmentRef.current = { start: drawing.start, end: endPoint, length: wallLen, id: newElem.id };
                    onLastParameterChange?.({ type: 'length', value: parseFloat((wallLen / 100).toFixed(2)), isAutoFromDrawing: true });
                    recordParallelOffsetFromNewLine(newElem as LineEntity, entities);
                }
                setEntities(prev => {
                    const next = [...prev, newElem];
                    onCommitHistory?.(next);
                    return next;
                });
                setDrawing({
                    start: endPoint,
                    current: endPoint,
                    snapType: 'CAD',
                    startSnapped: true,
                    isVirtual: false
                });
            }
        }
    } else if (activeTool === 'Line' || (activeTool as string) === 'Filo' || activeTool === 'Circle' || activeTool === 'Rectangle' || activeTool === 'Point' || activeTool === 'Arc' || activeTool === 'Testo' || activeTool === 'Camera') {
      const wasLocked = isLocked;
      setIsLocked(false);
      
      const isTraditionalLineMode = activeTool === 'Line' && (defaultLineStyle.mode === 'ink' || defaultLineStyle.mode === 'pencil');

      if (drawing && !isTraditionalLineMode && (activeTool === 'Line' || (activeTool as string) === 'Filo' || activeTool === 'Rectangle' || activeTool === 'Arc' || activeTool === 'Camera')) {
          setHasUsedInputSnap(true);
          let snappedResult;

          if (drawing.wheelLength !== undefined) {
              snappedResult = {
                  point: drawing.current,
                  type: 'CAD' as const,
                  refPoint: undefined,
                  constraintAxis: undefined,
                  refPoint2: undefined,
                  constraintAxis2: undefined,
                  hasDoubleSmart: false
              };
          } else {
              const isTempOrtho = false;

              // Find snap status at rawPoint (without ortho constraint applied)
              let rawSnappedFromRawPoint: any = { point: rawPoint, snapped: false, type: 'CAD', refPoint: undefined, constraintAxis: undefined, refPoint2: undefined, constraintAxis2: undefined, hasDoubleSmart: false };
              if (hoverSnap && hoverSnap.snapped) {
                  rawSnappedFromRawPoint = hoverSnap;
              } else if (!isTempOrtho) {
                  rawSnappedFromRawPoint = getSnappedPoint(rawPoint, entities, activeTool, drawing as any);
              }

              const isLineLikeTool = (activeTool as string) === 'Line' || (activeTool as string) === 'Filo' || (activeTool as string) === 'BIM_Porta' || (activeTool as string) === 'BIM_Finestra';
              const effectiveOrthoMode = getEffectiveOrtho(e, isLineLikeTool);

              // Snaps always win over ortho constraints to maintain precision under all circumstances!
              // BUT if Ortho mode is active, we force strict orthogonal lines as requested by the user.
              const isBothSnappedException = rawSnappedFromRawPoint.snapped && !effectiveOrthoMode;

              const isOrthoHorizontal = isLineLikeTool && effectiveOrthoMode && 
                    Math.abs(rawPoint.x - drawing.start.x) >= Math.abs(rawPoint.y - drawing.start.y);

              let finalPoint = rawPoint;
              if (isLineLikeTool) {
                  if (isBothSnappedException) {
                      finalPoint = rawPoint;
                  } else if (effectiveOrthoMode) {
                      finalPoint = isOrthoHorizontal 
                        ? { x: finalPoint.x, y: drawing.start.y } 
                        : { x: drawing.start.x, y: finalPoint.y };
                  } else if (!e.shiftKey && !isTempOrtho && (activeTool === 'Line' || (activeTool as string) === 'Filo')) {
                      finalPoint = applyAngleSnapping(drawing.start, rawPoint);
                  }
              }

              let rawSnapped: any;
              if (isTempOrtho) {
                  rawSnapped = { point: finalPoint, snapped: false, type: 'CAD' };
              } else if (isBothSnappedException) {
                  rawSnapped = rawSnappedFromRawPoint;
              } else {
                  rawSnapped = getSnappedPoint(finalPoint, entities, activeTool, drawing as any);
              }
              
              if (isLineLikeTool && effectiveOrthoMode && !isBothSnappedException) {
                  rawSnapped.point = isOrthoHorizontal 
                    ? { x: rawSnapped.point.x, y: drawing.start.y } 
                    : { x: drawing.start.x, y: rawSnapped.point.y };
              }

              if (rawSnapped.snapped) {
                  snappedResult = rawSnapped;
              } else {
                  const dx = rawPoint.x - drawing.start.x;
                  const dy = rawPoint.y - drawing.start.y;
                  let currentLength = Math.sqrt(dx * dx + dy * dy);
                  if (currentLength < 0.1) currentLength = 0.1;

                  let ux = 1;
                  let uy = 0;
                  const isExtensionSnap = drawing.snapType === 'smart' && drawing.refEntityId;
                  let foundRefAngle = false;
                  
                  if (isExtensionSnap) {
                      const refEnt = entities.find(e => e.id === drawing.refEntityId);
                      if (refEnt && refEnt.type === 'line') {
                          const l = refEnt as LineEntity;
                          const dxL = l.end.x - l.start.x;
                          const dyL = l.end.y - l.start.y;
                          const L_ref = Math.sqrt(dxL*dxL + dyL*dyL);
                          if (L_ref > 0.001) {
                              ux = dxL / L_ref;
                              uy = dyL / L_ref;
                              const dot = dx * ux + dy * uy;
                              if (dot < 0) { ux = -ux; uy = -uy; }
                              foundRefAngle = true;
                          }
                      }
                  }
                  
                  if (!foundRefAngle && currentLength > 0.01) {
                      ux = dx / currentLength;
                      uy = dy / currentLength;
                  }

                  if (activeTool === 'Line' || (activeTool as string) === 'Filo') {
                      if (effectiveOrthoMode) {
                          const isOrthoHorizontal = Math.abs(dx) >= Math.abs(dy);
                          if (isOrthoHorizontal) {
                              ux = dx >= 0 ? 1 : -1;
                              uy = 0;
                          } else {
                              ux = 0;
                              uy = dy >= 0 ? 1 : -1;
                          }
                      } else if (!e.shiftKey) {
                          const snappedWithAngle = applyAngleSnapping(drawing.start, rawPoint);
                          const dxA = snappedWithAngle.x - drawing.start.x;
                          const dyA = snappedWithAngle.y - drawing.start.y;
                          const dALen = Math.sqrt(dxA * dxA + dyA * dyA);
                          if (dALen > 0.01) {
                              ux = dxA / dALen;
                              uy = dyA / dALen;
                          }
                      }
                  }

                  // Standard placement when not snapped
                  snappedResult = {
                      point: {
                          x: drawing.start.x + ux * currentLength,
                          y: drawing.start.y + uy * currentLength
                      },
                      type: 'CAD' as const,
                      refPoint: undefined,
                      constraintAxis: undefined,
                      refPoint2: undefined,
                      constraintAxis2: undefined,
                      hasDoubleSmart: false
                  };
              }
          }
          
          let newEntity: Entity | null = null;
          if (activeTool === 'Line' || (activeTool as string) === 'Filo') {
              newEntity = {
                id: Date.now().toString(),
                type: 'line',
                color: (activeTool as string) === 'Filo' ? (defaultFiloColor || '#ff5500') : defaultLineStyle.color,
                lineWidth: (activeTool as string) === 'Filo' ? 1.5 : defaultLineStyle.lineWidth,
                dashed: (activeTool as string) === 'Filo' ? false : defaultLineStyle.dashed,
                lineType: (activeTool as string) === 'Filo' ? 'continuous' : defaultLineStyle.lineType,
                mode: (activeTool as string) === 'Filo' ? 'CAD' : defaultLineStyle.mode,
                start: drawing.start,
                end: snappedResult.point,
                layer: (activeTool as string) === 'Filo' ? 'Fili' : activeLayerId,
                isFilo: (activeTool as string) === 'Filo',
                isFreehand: false,
                inkPoints: undefined
               };
          } else if (activeTool === 'Circle') {
              let radius = Math.sqrt(Math.pow(drawing.current.x - drawing.start.x, 2) + Math.pow(drawing.current.y - drawing.start.y, 2));
              if (circleRadiusInputStringRef.current) {
                  const parsed = parseFloat(circleRadiusInputStringRef.current.replace(',', '.'));
                  if (!isNaN(parsed) && parsed > 0) {
                      radius = parsed;
                  }
              }
              newEntity = {
                id: Date.now().toString(),
                type: 'circle',
                color: defaultLineStyle.color,
                lineWidth: defaultLineStyle.lineWidth,
                dashed: defaultLineStyle.dashed,
                mode: defaultLineStyle.mode,
                center: drawing.start,
                radius: radius,
                layer: activeLayerId
              };
              setCircleRadiusInputString('');
              circleRadiusInputStringRef.current = '';
          } else if (activeTool === 'Rectangle') {
              newEntity = {
                id: Date.now().toString(),
                type: 'rectangle',
                color: defaultLineStyle.color,
                lineWidth: defaultLineStyle.lineWidth,
                dashed: defaultLineStyle.dashed,
                mode: defaultLineStyle.mode,
                p1: drawing.start,
                p2: snappedResult.point,
                layer: activeLayerId
              };
          } else if (activeTool === 'Arc') {
              if (!drawing.arcStartPoint) {
                  // Click 2: Anchor the first angle and radius
                  setDrawing({
                      ...drawing,
                      arcStartPoint: snappedResult.point,
                      current: snappedResult.point,
                      snapType: undefined,
                      refPoint: undefined,
                  });
                  return; // Don't finalize entity yet
              } else {
                  // Click 3: Finalize arc
                  const radius = Math.sqrt(Math.pow(drawing.arcStartPoint.x - drawing.start.x, 2) + Math.pow(drawing.arcStartPoint.y - drawing.start.y, 2));
                  let startAngle = Math.atan2(drawing.arcStartPoint.y - drawing.start.y, drawing.arcStartPoint.x - drawing.start.x) * 180 / Math.PI;
                  let endAngle = Math.atan2(snappedResult.point.y - drawing.start.y, snappedResult.point.x - drawing.start.x) * 180 / Math.PI;
                  
                  startAngle = (startAngle + 360) % 360;
                  endAngle = (endAngle + 360) % 360;

                  // Sweep direction behavior
                  // Assume we draw counter-clockwise from start to end by default.
                  if (isShiftPressedRef.current) {
                      // Swap to draw the other way
                      const temp = startAngle;
                      startAngle = endAngle;
                      endAngle = temp;
                  }

                  newEntity = {
                      id: Date.now().toString(),
                      type: 'arc',
                      color: defaultLineStyle.color,
                      lineWidth: defaultLineStyle.lineWidth,
                      dashed: defaultLineStyle.dashed,
                      mode: defaultLineStyle.mode,
                      center: drawing.start,
                      radius: radius,
                      startAngle: startAngle,
                      endAngle: endAngle,
                      layer: activeLayerId
                  };
              }
          }
          if (newEntity && !drawing.isVirtual) {
              if (newEntity.type === 'line') {
                  const lineEnt = newEntity as LineEntity;
                  const segLen = Math.hypot(lineEnt.end.x - lineEnt.start.x, lineEnt.end.y - lineEnt.start.y);
                  if (segLen > 0.01) {
                      lastSegmentRef.current = { start: lineEnt.start, end: lineEnt.end, length: segLen, id: lineEnt.id };
                      onLastParameterChange?.({ type: 'length', value: parseFloat((segLen / 100).toFixed(2)), isAutoFromDrawing: true });
                      recordParallelOffsetFromNewLine(lineEnt, entities);
                  }
              } else if (newEntity.type === 'circle' || newEntity.type === 'arc') {
                  const r = (newEntity as CircleEntity | ArcEntity).radius;
                  if (r > 0.01) {
                      lastCircleRadiusRef.current = r;
                      onLastParameterChange?.({ type: 'radius', value: parseFloat((r / 100).toFixed(2)), isAutoFromDrawing: true });
                      try { localStorage.setItem('lastCircleRadius', r.toString()); } catch(e){}
                  }
              }
              setEntities(prev => {
                  onCommitHistory?.(prev);
                  if (newEntity!.type === 'line' && !newEntity!.isBIM && !(newEntity as any).isFilo) {
                      return mergeLineSegments(prev, newEntity! as LineEntity);
                  }
                  return [...prev, newEntity!];
              });
          }
          
          if (activeTool === 'Line' || (activeTool as string) === 'Filo') {
              const isFreehandMode = false;
              setDrawing({ 
                start: snappedResult.point, 
                current: snappedResult.point, 
                snapType: 'CAD', 
                startSnapped: true,
                isVirtual: false,
                isFreehand: isFreehandMode
              });

          } else {
              setDrawing(null);

          }
          return;
      }

      const isFreehandMode = false;
      const isTempOrthoStart = false;

      if (activeTool === 'Circle') {
          const hasCenterSnap = snapped.snapped && snapped.subtype === 'center';
          if (hasCenterSnap) {
              // If we are snapping to a center, strictly bypass tangent mode and clear any partial selections because center dominates!
              setCircleTangentLine1(null);
              setCircleTangentClickPt1(null);
          } else {
              if (!circleTangentLine1) {
                  const clickedLine = getLineAtPoint(rawPoint);
                  if (clickedLine && clickedLine.type === 'line') {
                      setCircleTangentLine1(clickedLine as LineEntity);
                      setCircleTangentClickPt1(rawPoint);
                      setStatusMessage("1ª retta selezionata per il cerchio tangente. Clicca sulla 2ª retta.");
                      return;
                  }
              } else {
                  const clickedLine2 = getLineAtPoint(rawPoint);
                  if (clickedLine2 && clickedLine2.type === 'line' && clickedLine2.id !== circleTangentLine1.id) {
                      const tangentResult = computeCircleTangentTo2Lines(
                          circleTangentLine1,
                          clickedLine2 as LineEntity,
                          circleTangentClickPt1 || rawPoint,
                          rawPoint
                      );

                      if (tangentResult && tangentResult.radius > 0.01) {
                          const newCircle: CircleEntity = {
                              id: Date.now().toString(),
                              type: 'circle',
                              color: defaultLineStyle.color,
                              lineWidth: defaultLineStyle.lineWidth,
                              dashed: defaultLineStyle.dashed,
                              mode: defaultLineStyle.mode,
                              center: tangentResult.center,
                              radius: tangentResult.radius,
                              layer: activeLayerId
                          };
                          setEntities(prev => {
                              onCommitHistory?.(prev);
                              return [...prev, newCircle];
                          });
                          setCircleTangentLine1(null);
                          setCircleTangentClickPt1(null);
                          setStatusMessage(null);
                          return;
                      }
                  }
                  setCircleTangentLine1(null);
                  setCircleTangentClickPt1(null);
                  setStatusMessage(null);
              }
          }
      }

      // Se clicco direttamente su un segmento esistente (senza snap ad un estremo per iniziare una nuova linea),
      // seleziono il segmento così compare la sua lunghezza L = ... cm
      const clickedLine = getLineAtPoint(rawPoint);
      if (clickedLine && (!snapped.snapped || snapped.subtype === 'nearest')) {
        onSelect(clickedLine.id);
        if (!isTraditionalLineMode && activeTool === 'Line') {
          // In modalità CAD, un click sul corpo del segmento ne mostra la lunghezza senza far partire una linea indesiderata
          return;
        }
      } else {
        onSelect(null);
      }

      setDrawing({ 
        start: snapped.point, 
        current: snapped.point, 
        maxPoint: snapped.point,
        maxLength: 0,
        lockedDir: undefined,
        retraceMinProj: undefined,
        isTraditionalSegment: isTraditionalLineMode,
        snapType: snapped.type, 
        startSnapped: snapped.snapped,
        refPoint: snapped.refPoint,
        constraintAxis: snapped.constraintAxis,
        refPoint2: snapped.refPoint2,
        constraintAxis2: snapped.constraintAxis2,
        hasDoubleSmart: snapped.hasDoubleSmart,
        activeConstraint: undefined,
        isVirtual: false,
        isFreehand: isFreehandMode,
        freehandPoints: isFreehandMode ? [snapped.point] : undefined
      });
      if (activeTool === 'Point') {
        const newEntity: Entity = {
          id: Date.now().toString(),
          type: 'point',
          color: defaultLineStyle.color,
          lineWidth: defaultLineStyle.lineWidth,
          mode: defaultLineStyle.mode,
          point: snapped.point,
          layer: activeLayerId
        };
        setEntities(prev => [...prev, newEntity]);
        setDrawing(null);
        return;
      } else if (activeTool === 'Testo') {
        setTextDialog({
          point: snapped.point,
          text: "",
          fontFamily: defaultTextStyle?.fontFamily || 'sans-serif',
          fontSize: defaultTextStyle?.fontSize || 14,
          fontWeight: (defaultTextStyle?.fontWeight || 'normal') as 'normal' | 'bold',
          textAlign: (defaultTextStyle?.textAlign || 'left') as 'left' | 'center' | 'right' | 'justify',
          color: defaultLineStyle.color || '#000000',
        });
        setDrawing(null);
        return;
      } else if (activeTool === 'Camera') {
        setDrawing({ type: 'camera', start: snapped.point, current: snapped.point });
        return;
      }
    } else if (activeTool === 'Move') {
        if (movePhase === 'selectBasePoint') {
            const snap = getSnappedPoint(rawPoint, entities, activeTool, null);
            const basePt = snap.snapped ? snap.point : rawPoint;
            setMoveBasePoint(basePt);
            
            const sourceIds = moveSourceEntityIds.length > 0 
                ? moveSourceEntityIds 
                : (selectedEntityIds.length > 0 ? selectedEntityIds : []);
            
            if (sourceIds.length > 0) {
                setDragEntityIds(sourceIds);
                dragEntityIdsRef.current = sourceIds;
                setDragEntityId(sourceIds[0]);
                dragEntityIdRef.current = sourceIds[0];
                previousMouseRef.current = basePt;
                dragHasMovedRef.current = false;
                setMovePhase('selectDestinationPoint');
                setStatusMessage("Clicca per confermare lo spostamento. Premi Invio o Tasto Destro per concludere.");
            } else {
                setStatusMessage("Nessun oggetto selezionato.");
                setMovePhase('idle');
            }
            return;
        } else if (movePhase === 'selectDestinationPoint') {
            const staticEntities = entities.filter(ent => !dragEntityIds.includes(ent.id));
            const snapRes = getSnappedPoint(rawPoint, staticEntities, activeTool, null);
            let snapPoint = snapRes.snapped ? snapRes.point : rawPoint;
            
            const effectiveOrthoMode = getEffectiveOrtho(e, true);
            if (effectiveOrthoMode && !snapRes.snapped && moveBasePoint) {
                const dx = snapPoint.x - moveBasePoint.x;
                const dy = snapPoint.y - moveBasePoint.y;
                if (Math.abs(dx) > Math.abs(dy)) {
                    snapPoint.y = moveBasePoint.y;
                } else {
                    snapPoint.x = moveBasePoint.x;
                }
            }
            
            const activePair = activeParallelPairRef.current;
            const refTargetOffset = getEffectiveLastParallelOffset(entitiesRef.current);
            const isAlreadyAtLastOffset =
                !snapRes.snapped &&
                activePair &&
                dragEntityIds.includes(activePair.lineId) &&
                refTargetOffset > 0.05 &&
                Math.abs(activePair.currentDist - refTargetOffset) < 0.08;
            const finalDeltaX = isAlreadyAtLastOffset ? 0 : (snapPoint.x - previousMouseRef.current.x);
            const finalDeltaY = isAlreadyAtLastOffset ? 0 : (snapPoint.y - previousMouseRef.current.y);
            
            setEntities(prev => {
                const updatedEntities = prev.map(ent => {
                    if (dragEntityIds.includes(ent.id)) {
                        return shiftEntityByDelta(ent, finalDeltaX, finalDeltaY);
                    }
                    return ent;
                });
                const movedLine = updatedEntities.find(e => dragEntityIds.includes(e.id) && e.type === 'line') as LineEntity | undefined;
                if (movedLine) {
                    recordParallelOffsetFromNewLine(movedLine, updatedEntities);
                }
                onCommitHistory?.(updatedEntities);
                return updatedEntities;
            });

            setDragEntityId(null);
            dragEntityIdRef.current = null;
            setActiveMoveSnapPoint(null);
            setMoveBasePoint(null);
            setMovePhase('selectBasePoint');
            setStatusMessage("Oggetto spostato. Clicca un nuovo punto base per spostarlo ancora, o premi Invio/Tasto Destro per concludere.");
            setDragEntityIds([]);
            dragEntityIdsRef.current = [];
            return;
        }

        if (movePhase === 'idle') {
            const snap = getSnappedPoint(rawPoint, entities, activeTool, null);
            const found = getEntityAtPoint(snap.snapped ? snap.point : rawPoint) || getEntityAtPoint(rawPoint);

            if (found) {
                const targetIds = resolveGroups([found.id], entities);
                setFlashIds(targetIds);
                setMoveSourceEntityIds(prev => {
                    const exists = targetIds.every(id => prev.includes(id));
                    let next: string[];
                    if (exists) {
                        next = prev.filter(id => !targetIds.includes(id));
                    } else {
                        next = Array.from(new Set([...prev, ...targetIds]));
                    }
                    return next;
                });
            } else {
                setSelectionWindow({ start: rawPoint, current: rawPoint });
                lastMouseRef.current = rawPoint;
                previousMouseRef.current = rawPoint;
                setActiveMoveSnapPoint(null);
            }
        }
    } else if (activeTool === 'Copy') {
        if (copyPhase === 'selectBasePoint') {
            const snap = getSnappedPoint(rawPoint, entities, activeTool, null);
            const basePt = snap.snapped ? snap.point : rawPoint;
            setCopyBasePoint(basePt);
            
            const sourceIds = copySourceEntityIds.length > 0 
                ? copySourceEntityIds 
                : (selectedEntityIds.length > 0 ? selectedEntityIds : []);
            
            if (sourceIds.length > 0) {
                initiateCloneAndDrag(sourceIds, basePt);
                setCopyPhase('selectDestinationPoint');
                setStatusMessage("Clicca per incollare la copia (puoi trascinare o fare clic singoli). Premi Invio o Tasto Destro per concludere.");
            } else {
                setStatusMessage("Nessun oggetto selezionato.");
                setCopyPhase('idle');
            }
            return;
        } else if (copyPhase === 'selectDestinationPoint') {
            setCopyPhase('idle');
            setStatusMessage(null);
            setCopySourceEntityIds([]);
            setDragEntityId(null);
            dragEntityIdRef.current = null;
            setDragEntityIds([]);
            dragEntityIdsRef.current = [];
            setActiveMoveSnapPoint(null);
            setEntities(prev => { onCommitHistory?.(prev); return [...prev]; });
            return;
        }

        if (dragEntityId) {
            // Already dragging (a clone or moved item) -> Drop it!
            setDragEntityId(null);
            dragEntityIdRef.current = null;
            setActiveMoveSnapPoint(null);
            setEntities(prev => { onCommitHistory?.(prev); return [...prev]; });
            return;
        }

        if (copyPhase === 'idle') {
            const snap = getSnappedPoint(rawPoint, entities, activeTool, null);
            const target = getEntityAtPoint(snap.snapped ? snap.point : rawPoint) || getEntityAtPoint(rawPoint);

            if (target) {
                const targetIds = resolveGroups([target.id], entities);
                setFlashIds(targetIds);
                setCopySourceEntityIds(prev => {
                    const exists = targetIds.every(id => prev.includes(id));
                    let next: string[];
                    if (exists) {
                        // Deselect
                        next = prev.filter(id => !targetIds.includes(id));
                    } else {
                        // Select
                        next = Array.from(new Set([...prev, ...targetIds]));
                    }
                    return next;
                });
            } else {
                // Clicked empty space -> Start selection window
                setSelectionWindow({ start: rawPoint, current: rawPoint });
                lastMouseRef.current = rawPoint;
                previousMouseRef.current = rawPoint;
                setActiveMoveSnapPoint(null);
            }
        }
    } else if (activeTool === 'Join') {
        const found = getEntityAtPoint(rawPoint);
        if (found) {
            setDragEntityIds(prev => {
                const targetIds = resolveGroups([found.id], entities);
                const alreadySelected = targetIds.every(id => prev.includes(id));
                const newIds = alreadySelected 
                    ? prev.filter(id => !targetIds.includes(id)) 
                    : Array.from(new Set([...prev, ...targetIds]));
                return newIds;
            });
        } else {
            setSelectionWindow({ start: rawPoint, current: rawPoint });
        }
    } else if (activeTool === 'Raccordo') {
        const potentialRaccordo = getEntityAtPoint(rawPoint);
        if (potentialRaccordo && potentialRaccordo.raccordoMetadata && onEditRaccordo) {
            onEditRaccordo(potentialRaccordo);
            return;
        }
        const found = getLineAtPoint(rawPoint);
        if (found) {
            if (selectedRaccordoLineIds.includes(found.id)) {
                setSelectedRaccordoLineIds(prev => prev.filter(id => id !== found.id));
                setSelectedRaccordoClickPoints(prev => prev.filter((_, idx) => {
                    const foundIdx = selectedRaccordoLineIds.indexOf(found.id);
                    return idx !== foundIdx;
                }));
            } else {
                const nextLineIds = [...selectedRaccordoLineIds, found.id];
                const nextClickPoints = [...selectedRaccordoClickPoints, rawPoint];
                setSelectedRaccordoLineIds(nextLineIds);
                setSelectedRaccordoClickPoints(nextClickPoints);
                
                if (nextLineIds.length === 2) {
                    applyRaccordo(nextLineIds[0], nextLineIds[1], nextClickPoints[0], nextClickPoints[1]);
                    setSelectedRaccordoLineIds([]);
                    setSelectedRaccordoClickPoints([]);
                }
            }
        }
    } else if (activeTool === 'Dimension') {
        const clickedEntity = getEntityAtPoint(rawPoint);
        
        if (clickedEntity && clickedEntity.type === 'dimension' && !drawing) {
            setPositioningDimId(clickedEntity.id);
            return;
        }
        
        if (selectionMode === 'object') {
            if (clickedEntity) {
                let startPoint: Point | null = null;
                let endPoint: Point | null = null;
                
                if (clickedEntity.type === 'line') {
                    startPoint = clickedEntity.start;
                    endPoint = clickedEntity.end;
                } else if (clickedEntity.type === 'rectangle') {
                    const r = clickedEntity as any;
                    const A = { x: r.x, y: r.y };
                    const B = { x: r.x + r.width, y: r.y };
                    const C = { x: r.x + r.width, y: r.y + r.height };
                    const D = { x: r.x, y: r.y + r.height };
                    
                    const segments = [
                        { s: A, e: B },
                        { s: B, e: C },
                        { s: C, e: D },
                        { s: D, e: A }
                    ];
                    
                    let minD = Infinity;
                    let bestSeg = segments[0];
                    for (const seg of segments) {
                        const dist = distanceToSegment(rawPoint, seg.s, seg.e);
                        if (dist < minD) {
                            minD = dist;
                            bestSeg = seg;
                        }
                    }
                    startPoint = bestSeg.s;
                    endPoint = bestSeg.e;
                }
                
                if (startPoint && endPoint) {
                    const newDim: Entity = {
                        id: Date.now().toString(),
                        type: 'dimension',
                        color: defaultLineStyle.color || '#3b82f6',
                        lineWidth: 1,
                        mode: 'ink',
                        start: startPoint!,
                        end: endPoint!,
                        offset: 20 * (dimensionScale || 1),
                        style: mapStyleStringToNum(dimensionStyle),
                        layer: 'Misure'
                    };
                    
                    setEntities(prev => {
                        onCommitHistory?.(prev);
                        return [...prev, newDim];
                    });
                    
                    // Immediately allow interactive offset drag placement
                    setPositioningDimId(newDim.id);
                    return;
                }
            }
        } else {
            // SelectionMode === 'manual' - double points & chain logic
            if (clickedEntity && clickedEntity.type === 'dimension' && !drawing) {
                setPositioningDimId(clickedEntity.id);
            } else {
                if (!drawing) {
                    // First Point Click
                    if (!snapped.snapped) {
                        return; // Only allow placing on known snap points/notable points
                    }
                    if (snapped.refEntityId) {
                        setFlashIds([snapped.refEntityId]);
                        setTimeout(() => setFlashIds([]), 400);
                    }
                    setDrawing({
                        start: snapped.point,
                        current: snapped.point,
                        snapType: snapped.type,
                        startSnapped: snapped.snapped,
                        refPoint: snapped.refPoint,
                        constraintAxis: snapped.constraintAxis,
                        refPoint2: snapped.refPoint2,
                        constraintAxis2: snapped.constraintAxis2,
                        hasDoubleSmart: snapped.hasDoubleSmart,
                        activeConstraint: undefined,
                        isVirtual: false
                    });
                } else {
                    // Second Point Click
                    const snappedResult = getSnappedPoint(rawPoint, entities, activeTool, drawing as any);
                    if (!snappedResult.snapped) {
                        return; // Only allow placing on known snap points/notable points
                    }
                    if (snappedResult.refEntityId) {
                        setFlashIds([snappedResult.refEntityId]);
                        setTimeout(() => setFlashIds([]), 400);
                    }
                    let finalEndPoint = snappedResult.point;

                    const isChainMode = dimensionMode === 'chain';
                    
                    const newDim: Entity = {
                        id: Date.now().toString(),
                        type: 'dimension',
                        color: defaultLineStyle.color || '#3b82f6',
                        lineWidth: 1,
                        mode: 'ink',
                        start: drawing.start,
                        end: finalEndPoint,
                        offset: 20 * (dimensionScale || 1),
                        style: mapStyleStringToNum(dimensionStyle),
                        layer: 'Misure'
                    };
                    
                    setEntities(prev => {
                        onCommitHistory?.(prev);
                        return [...prev, newDim];
                    });

                    if (isChainMode) {
                        // For chain mode, align measurements side-by-side: automatically place offset
                        // and continue drawing from the endpoint
                        setDrawing(prev => ({
                            ...(prev as any),
                            start: finalEndPoint,
                            current: finalEndPoint
                        }));
                    } else {
                        // Two points mode: allow interactive drag-offset positioning
                        setPositioningDimId(newDim.id);
                        setDrawing(null);
                    }
                }
            }
        }
    } else if (activeTool === 'Gomma') {
        const rawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
        setEraserPos(rawPoint);
        executeEraser(rawPoint, true);
    } else if (activeTool === 'Trim') {
        const rawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
        const target = getTrimTargetAtPoint(rawPoint);
        if (target) {
            executeTrim(rawPoint);
        } else {
            setSelectionWindow({ start: rawPoint, current: rawPoint });
        }
    } else if (activeTool === 'Allunga') {
        const rawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
        executeAllunga(rawPoint);
    } else if (activeTool === 'Cancella') {
        const rawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
        const found = getEntityAtPoint(rawPoint);
        if (found) {
            const idsToDelete = resolveGroups([found.id], entities);
            setEntities(prev => {
                onCommitHistory?.(prev);
                return prev.filter(ent => !idsToDelete.includes(ent.id));
            });
        } else {
            setSelectionWindow({ start: rawPoint, current: rawPoint });
        }
    }

  };

  const applyAngleSnapping = (start: Point, current: Point): Point => {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length < 5) return current; // Don't snap if too close

    const effectiveOrthoMode = getEffectiveOrtho(undefined, true);
    if (effectiveOrthoMode) {
        let angle = (Math.atan2(dy, dx) * 180 / Math.PI);
        // Normalize to 0-360
        angle = (angle + 360) % 360;

        // Find nearest orthogonal angle: 0, 90, 180, or 270
        const orthoAngles = [0, 90, 180, 270];
        let nearestAngle = 0;
        let minDiff = Infinity;
        for (const snapAngle of orthoAngles) {
            let diff = Math.abs(angle - snapAngle);
            if (diff > 180) diff = 360 - diff;
            if (diff < minDiff) {
                minDiff = diff;
                nearestAngle = snapAngle;
            }
        }
        const radians = nearestAngle * Math.PI / 180;
        return {
            x: start.x + Math.cos(radians) * length,
            y: start.y + Math.sin(radians) * length
        };
    }

    // When Ortho/bloc fn is not active, return the current point directly to allow 100% free movement
    return current;
  };

  const handleMouseMove = (e: React.PointerEvent) => {
    if (holdTimerRef.current && holdStartPosRef.current) {
        const dx = e.clientX - holdStartPosRef.current.x;
        const dy = e.clientY - holdStartPosRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    if (selectedLine || quickEditEntityId || textDialog) {
        // Dialogue or editing is active, cursor is neutral and free
        setHoverSnap(null);
        setHoveredEntityId(null);
        setHoveredLineId(null);
        setHoveredBIMSegments([]);
        setHoveredDimensionEntityId(null);
        setHoverTavolaEdge(false);
        mouseScreenPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        const rawCanvasPos = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
        actualMousePosRef.current = rawCanvasPos;
        lastMouseRef.current = rawCanvasPos;
        renderRef.current?.();
        return;
    }

    if (isZoomModeRef.current && isDraggingZoomRef.current) {
        const dx = e.clientX - lastScreenMouseRef.current.x;
        const zoomFactor = 1 + dx * 0.002;
        const focus = screenToCanvas(rect.width / 2, rect.height / 2);
        
        setView(prev => {
            const newZoom = Math.max(0.01, prev.zoom * zoomFactor);
            const newPan = {
                x: prev.pan.x + (focus.x * (prev.zoom - newZoom)),
                y: prev.pan.y + (focus.y * (prev.zoom - newZoom))
            };
            return { zoom: newZoom, pan: newPan };
        });
        lastScreenMouseRef.current = { x: e.clientX, y: e.clientY };
        return;
    }
    if (isZoomModeRef.current && isDraggingPanRef.current) {
        const dx = e.clientX - lastScreenMouseRef.current.x;
        const dy = e.clientY - lastScreenMouseRef.current.y;
        setView(prev => ({
            ...prev,
            pan: { x: prev.pan.x + dx / prev.zoom, y: prev.pan.y + dy / prev.zoom }
        }));
        lastScreenMouseRef.current = { x: e.clientX, y: e.clientY };
        return;
    }
    mouseScreenPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const unconstrainedRawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
    let rawPoint = unconstrainedRawPoint;
    actualMousePosRef.current = unconstrainedRawPoint;

    // Detect hardware CapsLock (Bloc Maiusc / Bloc Fn) toggle even if OS/browser did not fire keydown
    if (e && typeof (e as any).getModifierState === 'function') {
        const currentCaps = !!(e as any).getModifierState('CapsLock');
        if (lastCapsLockStateRef.current !== null && currentCaps !== lastCapsLockStateRef.current) {
            lastCapsLockStateRef.current = currentCaps;
            if (!isJollyActive && !isMagicCopyActiveRef.current && !dragEntityIdRef.current && activeTool !== 'Line') {
                setDrawing(null);
                setSelectedParallelLine(null);
                setHighlightedTrimLine(null);
                setHighlightedTrimSegment(null);
                setMovePhase('idle');
                setCopyPhase('idle');
                setActiveTool?.('Line');
                setStatusMessage("Pennino (Linea) attivo");
            }
        } else if (lastCapsLockStateRef.current === null) {
            lastCapsLockStateRef.current = currentCaps;
        }
    }

    // --- PRIORITIZE SNAPPING ---
    // Disable snapping for Trim tool as requested
    const currentSnap = activeTool === 'Trim' ? null : getSnappedPoint(unconstrainedRawPoint, entities, activeTool, drawing);
    if (currentSnap && currentSnap.snapped) {
        rawPoint = currentSnap.point;
        actualMousePosRef.current = rawPoint;
        setHoverSnap(currentSnap);
    } else {
        setHoverSnap(null);
    }

    const currentHoverPart = getHoveredTavolaPart(rawPoint);
    if (currentHoverPart?.id !== hoveredTavolaPart?.id || currentHoverPart?.part !== hoveredTavolaPart?.part) {
      setHoveredTavolaPart(currentHoverPart);
    }

    const hoveredEnt = getEntityAtPoint(rawPoint, 20);
    if (hoveredEnt) {
        if (hoveredEntityIdPending !== hoveredEnt.id) {
            setHoveredEntityIdPending(hoveredEnt.id);
        }
        if (hoveredEnt.type === 'line' && hoveredLineIdPending !== hoveredEnt.id) {
            setHoveredLineIdPending(hoveredEnt.id);
        } else if (hoveredEnt.type !== 'line' && hoveredLineIdPending !== null) {
            setHoveredLineIdPending(null);
        }
        if (hoveredEnt.type === 'circle' && hoveredCircleId !== hoveredEnt.id) {
            setHoveredCircleId(hoveredEnt.id);
        } else if (hoveredEnt.type !== 'circle' && hoveredCircleId !== null) {
            setHoveredCircleId(null);
        }
    } else {
        if (hoveredEntityIdPending !== null) setHoveredEntityIdPending(null);
        if (hoveredLineIdPending !== null) setHoveredLineIdPending(null);
    }

    // TECNIGRAFO HOVER DETECTION (for symbols)
    if (tecnigrafoOrigin && !showSquadrette) {
        const rulerLength = 5000 / view.zoom;
        const edgeWidth = 6 / view.zoom;
        const bodyWidth = 32 / view.zoom;
        const hOffset = 10 / view.zoom;

        const hHit = rawPoint.x >= tecnigrafoOrigin.x - hOffset && rawPoint.x <= tecnigrafoOrigin.x + rulerLength &&
                     rawPoint.y >= tecnigrafoOrigin.y + edgeWidth && rawPoint.y <= tecnigrafoOrigin.y + bodyWidth;
        
        const vHit = rawPoint.x >= tecnigrafoOrigin.x - bodyWidth && rawPoint.x <= tecnigrafoOrigin.x - edgeWidth &&
                     rawPoint.y >= tecnigrafoOrigin.y - hOffset && rawPoint.y <= tecnigrafoOrigin.y + rulerLength;

        if (hHit || vHit) {
            if (!hoverMoveTecnigrafo) {
                setHoverMoveTecnigrafo(true);
                renderRef.current?.();
            }
        } else {
            if (hoverMoveTecnigrafo) {
                setHoverMoveTecnigrafo(false);
                renderRef.current?.();
            }
        }
    }

    if (dragSquadrettaId) {
        const pt = unconstrainedRawPoint;
        const newPos = { x: pt.x - dragSquadrettaOffset.x, y: pt.y - dragSquadrettaOffset.y };
        setSquadrette(prev => {
            const others = prev.filter(s => s.id !== dragSquadrettaId);
            const current = prev.find(s => s.id === dragSquadrettaId);
            if (!current) return prev;

            let finalPos = newPos;
            const updated = { ...current, pos: newPos };
            const other = others[0];
            if (other) {
                // Snapping between squadrette edges and vertices
                const v1 = getSquadrettaVertices(updated);
                const v2 = getSquadrettaVertices(other);
                let snapped = false;
                
                // Snap vertices to vertices
                for (const p1 of v1) {
                    for (const p2 of v2) {
                        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
                        if (d < 20 / view.zoom) {
                            finalPos = { x: newPos.x + (p2.x - p1.x), y: newPos.y + (p2.y - p1.y) };
                            snapped = true;
                            break;
                        }
                    }
                    if (snapped) break;
                }

                // Snap vertices to edges
                if (!snapped) {
                    const edges2 = [[v2[0], v2[1]], [v2[1], v2[2]], [v2[2], v2[0]]];
                    for (const p1 of v1) {
                        for (const edge of edges2) {
                            const d = distToSegment(p1, edge[0], edge[1]);
                            if (d < 10 / view.zoom) {
                                // Project p1 onto edge
                                const dx = edge[1].x - edge[0].x;
                                const dy = edge[1].y - edge[0].y;
                                const l2 = dx*dx + dy*dy;
                                let t = ((p1.x - edge[0].x) * dx + (p1.y - edge[0].y) * dy) / l2;
                                t = Math.max(0, Math.min(1, t));
                                const proj = { x: edge[0].x + t * dx, y: edge[0].y + t * dy };
                                finalPos = { x: newPos.x + (proj.x - p1.x), y: newPos.y + (proj.y - p1.y) };
                                snapped = true;
                                break;
                            }
                        }
                        if (snapped) break;
                    }
                }
            }

            return prev.map(sq => sq.id === dragSquadrettaId ? { ...sq, pos: finalPos } : sq);
        });
        renderRef.current?.();
        return;
    }

    if (isMovingTecnigrafo && movingTecnigrafoStartRef.current) {
        const dx = rawPoint.x - movingTecnigrafoStartRef.current.mouse.x;
        const dy = rawPoint.y - movingTecnigrafoStartRef.current.mouse.y;
        setTecnigrafoOrigin({
            x: movingTecnigrafoStartRef.current.origin.x + dx,
            y: movingTecnigrafoStartRef.current.origin.y + dy
        });
        setLockedFocalPoint({
            x: movingTecnigrafoStartRef.current.origin.x + dx,
            y: movingTecnigrafoStartRef.current.origin.y + dy
        });
        renderRef.current?.();
        return;
    }

    // TECNIGRAFO LOCK (Drafting Machine Effect)
    if (tecnigrafoOrigin && !currentSnap.snapped) {
        const rawCanvasPos = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);

        // Costanti per determinare la prossimità ai righelli
        const edgeTolerance = 30 / view.zoom;
        const snapMargin = 10 / view.zoom;

        const distX = Math.abs(rawCanvasPos.y - tecnigrafoOrigin.y);
        const distY = Math.abs(rawCanvasPos.x - tecnigrafoOrigin.x);
        
        // Verifica se il mouse è vicino al bordo di disegno dei righelli
        // (supponendo che il righello orizzontale sia disegnato verso destra e quello verticale verso l'alto/basso,
        // ma la tolleranza `edgeTolerance` funge da area di attivazione)
        const onHorizontalRuler = rawCanvasPos.y <= (tecnigrafoOrigin.y + snapMargin) && distX <= edgeTolerance;
        const onVerticalRuler = rawCanvasPos.x >= (tecnigrafoOrigin.x - snapMargin) && distY <= edgeTolerance;

        if (onHorizontalRuler && !onVerticalRuler) {
            setTecnigrafoLock('x');
            rawPoint = { x: rawCanvasPos.x, y: tecnigrafoOrigin.y };
        } else if (onVerticalRuler && !onHorizontalRuler) {
            setTecnigrafoLock('y');
            rawPoint = { x: tecnigrafoOrigin.x, y: rawCanvasPos.y };
        } else if (onHorizontalRuler && onVerticalRuler) {
            // Se nell'angolo, scegli l'asse più vicino
            if (distX < distY) {
                setTecnigrafoLock('x');
                rawPoint = { x: rawCanvasPos.x, y: tecnigrafoOrigin.y };
            } else {
                setTecnigrafoLock('y');
                rawPoint = { x: tecnigrafoOrigin.x, y: rawCanvasPos.y };
            }
        } else {
            // Fuori dai righelli: si disegna liberamente!
            setTecnigrafoLock(null);
            rawPoint = { x: rawCanvasPos.x, y: rawCanvasPos.y };
        }
    }

    onMouseMovePosition?.(rawPoint);

    if (activeTool === 'BIM_DisegnaLineare' || activeTool === 'BIM_TracciaSegmento') {
        const candidates: { start: Point, end: Point, entity: Entity, distance: number, isSubElement?: boolean }[] = [];
        const segmentThreshold = 60 / view.zoom;

        entities.forEach(ent => {
            const isBimOrWall = ent.isBIM || ent.type === 'line' || (ent as any).type === 'muro' || (ent as any).type === 'BIM_Muro';
            if (activeTool === 'BIM_TracciaSegmento' && !ent.isBIM) return;
            if (!isBimOrWall) return;

            if (ent.type === 'line' && ent.start && ent.end) {
                const d = distanceToSegment(rawPoint, ent.start, ent.end);
                // Prioritize doors/windows/symbols as they represent exact base boundaries
                const isSub = ent.isBIM && (ent.bimType === 'door' || ent.bimType === 'window' || ent.bimType === 'electrical_symbol' || ent.bimType === 'hydraulic_symbol');
                candidates.push({ start: ent.start, end: ent.end, entity: ent, distance: d, isSubElement: isSub });
            } else if (ent.type === 'hatch' && ent.points && ent.points.length > 1) {
                const pts = ent.points;
                const isClosed = !ent.isLinear && ent.bimRenderMode !== 'parete_verticale' && ent.bimRenderMode !== 'parete_orizzontale';
                const limit = isClosed ? pts.length : pts.length - 1;
                for (let i = 0; i < limit; i++) {
                    const p1 = pts[i];
                    const p2 = pts[(i + 1) % pts.length];
                    const d = distanceToSegment(rawPoint, p1, p2);
                    candidates.push({ start: p1, end: p2, entity: ent, distance: d });
                }
            }
        });

        const validCandidates = candidates.filter(c => c.distance < segmentThreshold);
        let best: typeof candidates[0] | null = null;
        if (validCandidates.length > 0) {
            validCandidates.sort((a, b) => {
                const getPriorityScore = (c: typeof candidates[0]) => {
                    const ent = c.entity;
                    if (ent.isBIM) {
                        const bt = (ent as any).bimType;
                        // Doors and windows represent base opening limits - absolute priority!
                        if (bt === 'door' || bt === 'window') return 100;

                        // Check if it is a coating/finish (intonaco, pittura, rivestimento, cappotto, tinteggiatura, etc.)
                        const nameLower = (ent.bimName || (ent as any).name || '').toLowerCase();
                        const familyLower = ((ent as any).bimFamily || (ent as any).bimAreaType || (ent as any).bimFamilyId || '').toLowerCase();
                        const isCoating = familyLower.includes('intonac') || 
                                          familyLower.includes('rivest') ||
                                          familyLower.includes('pittur') ||
                                          familyLower.includes('tinteg') ||
                                          familyLower.includes('isolam') ||
                                          familyLower.includes('cappott') ||
                                          familyLower.includes('finitur') ||
                                          familyLower.includes('plaster') ||
                                          nameLower.includes('intonac') ||
                                          nameLower.includes('rivest') ||
                                          nameLower.includes('pittur') ||
                                          nameLower.includes('tinteg') ||
                                          nameLower.includes('cappott') ||
                                          nameLower.includes('isolam');

                        if (isCoating) return 95; // Higher priority than walls (90) when we are close, so we can snap to plaster/coatings first!
                        if (bt === 'wall' || bt === 'element') return 90;
                        if (bt === 'room') return 80;
                        return 70;
                    }
                    // regular lines or construction lines
                    return 0;
                };
                
                const scoreA = getPriorityScore(a);
                const scoreB = getPriorityScore(b);
                
                if (activeTool === 'BIM_TracciaSegmento') {
                    // For TracciaSegmento, we want the absolute closest BIM object first
                    if (Math.abs(a.distance - b.distance) > 1.0 / view.zoom) {
                        return a.distance - b.distance;
                    }
                    // If distances are very similar, use priority
                    return scoreB - scoreA;
                }

                if (scoreA !== scoreB) {
                    return scoreB - scoreA; // higher score first (BIM objects have maximum priority!)
                }
                // Within the same category, pick the closest one to the cursor
                return a.distance - b.distance;
            });
            best = validCandidates[0];
        }

        if (best) {
            const list: typeof candidates = [best];
            
            let hardwareCaps = false;
            let scrollLock = false;
            let numLock = false;
            if (e && (e as any).getModifierState) {
                hardwareCaps = !!(e as any).getModifierState('CapsLock');
                scrollLock = !!(e as any).getModifierState('ScrollLock');
                numLock = !!(e as any).getModifierState('NumLock');
            }
            const isJollyNow = (hardwareCaps || scrollLock || numLock || (e && e.shiftKey)) && activeTool !== 'BIM_TracciaSegmento';

            if (isJollyNow) {
                if (best.entity.type === 'hatch' && best.entity.points) {
                    const pts = best.entity.points;
                    const isClosed = !best.entity.isLinear && best.entity.bimRenderMode !== 'parete_verticale' && best.entity.bimRenderMode !== 'parete_orizzontale';
                    const limit = isClosed ? pts.length : pts.length - 1;
                    list.length = 0;
                    for (let i = 0; i < limit; i++) {
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % pts.length];
                        list.push({ start: p1, end: p2, entity: best.entity, distance: best.distance });
                    }
                } else if (best.entity.type === 'line') {
                    const chain = [best];
                    const visited = new Set<string>([best.entity.id]);
                    let foundMore = true;
                    while (foundMore) {
                        foundMore = false;
                        for (const ent of entities) {
                            if (ent.type === 'line' && !visited.has(ent.id)) {
                                const isBimOrWall = ent.isBIM || ent.type === 'line' || (ent as any).type === 'muro' || (ent as any).type === 'BIM_Muro';
                                if (!isBimOrWall) continue;
                                for (const item of chain) {
                                    const d_ss = Math.hypot(ent.start.x - item.start.x, ent.start.y - item.start.y);
                                    const d_se = Math.hypot(ent.start.x - item.end.x, ent.start.y - item.end.y);
                                    const d_es = Math.hypot(ent.end.x - item.start.x, ent.end.y - item.start.y);
                                    const d_ee = Math.hypot(ent.end.x - item.end.x, ent.end.y - item.end.y);
                                    const tolerance = 0.15;
                                    if (d_ss < tolerance || d_se < tolerance || d_es < tolerance || d_ee < tolerance) {
                                        chain.push({ start: ent.start, end: ent.end, entity: ent, distance: 0 });
                                        visited.add(ent.id);
                                        foundMore = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    list.length = 0;
                    list.push(...chain);
                }
            }
            setHoveredBIMSegments(list);
        } else {
            setHoveredBIMSegments([]);
        }
    } else {
        if (hoveredBIMSegments.length > 0) {
            setHoveredBIMSegments([]);
        }
    }

    if (activeTool === 'Dimension' && selectionMode === 'object') {
        const ent = getEntityAtPoint(rawPoint);
        if (ent && (ent.type === 'line' || ent.type === 'rectangle')) {
            setHoveredDimensionEntityId(ent.id);
        } else {
            setHoveredDimensionEntityId(null);
        }
    } else {
        if (hoveredDimensionEntityId) {
            setHoveredDimensionEntityId(null);
        }
    }

    let isNearEdge = false;
    if (tavole && !dragTavolaIdRef.current) {
        for (const tav of tavole) {
            if (!tav.visible) continue;
            const { w, h } = getTavolaDimensions(tav);
            const near = 
              (Math.abs(rawPoint.x - tav.position.x) < 15 / view.zoom && rawPoint.y >= tav.position.y && rawPoint.y <= tav.position.y + h) ||
              (Math.abs(rawPoint.x - (tav.position.x + w)) < 15 / view.zoom && rawPoint.y >= tav.position.y && rawPoint.y <= tav.position.y + h) ||
              (Math.abs(rawPoint.y - tav.position.y) < 15 / view.zoom && rawPoint.x >= tav.position.x && rawPoint.x <= tav.position.x + w) ||
              (Math.abs(rawPoint.y - (tav.position.y + h)) < 15 / view.zoom && rawPoint.x >= tav.position.x && rawPoint.x <= tav.position.x + w);
            if (near) {
                isNearEdge = true;
                break;
            }
        }
    }
    setHoverTavolaEdge(isNearEdge);

    // --- TAVOLA GESTURE DRAG UPDATE ---
    if (dragTavolaIdRef.current && onUpdateTavole && tavole) {
      const deltaX = rawPoint.x - previousMouseRef.current.x;
      const deltaY = rawPoint.y - previousMouseRef.current.y;
      
      const newTavole = tavole.map(tav => {
        if (tav.id === dragTavolaIdRef.current) {
          return {
            ...tav,
            position: {
              x: tav.position.x + deltaX,
              y: tav.position.y + deltaY
            }
          };
        }
        return tav;
      });
      onUpdateTavole(newTavole);
      previousMouseRef.current = rawPoint;
      lastMouseRef.current = rawPoint;
      return;
    }

    if (selectionWindow) {
        setSelectionWindow({ ...selectionWindow, current: rawPoint });
        return;
    }

    if (positioningDimId) {
        const updater = (prev: Entity[]) => {
            let targetOffset = 20;
            const refDim = prev.find(e => e.id === positioningDimId && e.type === 'dimension') as DimensionEntity | undefined;
            if (refDim) {
                const origDx = refDim.end.x - refDim.start.x;
                const origDy = refDim.end.y - refDim.start.y;
                let styleToUse = refDim.style || 1;
                if (styleToUse === 1 || styleToUse === 5) {
                    styleToUse = Math.abs(origDx) > Math.abs(origDy) ? 3 : 4;
                }

                if (styleToUse === 3) {
                    targetOffset = rawPoint.y - refDim.start.y;
                } else if (styleToUse === 4) {
                    targetOffset = rawPoint.x - refDim.start.x;
                } else {
                    const L = Math.sqrt(origDx * origDx + origDy * origDy);
                    if (L > 0) {
                        const nx = -origDy / L;
                        const ny = origDx / L;
                        const mx = rawPoint.x - refDim.start.x;
                        const my = rawPoint.y - refDim.start.y;
                        targetOffset = mx * nx + my * ny;
                    }
                }
            }
            return prev.map(ent => {
                if (ent.id === positioningDimId && ent.type === 'dimension') {
                    return { ...ent, offset: targetOffset };
                }
                return ent;
            });
        };
        if (setEntitiesSilent) setEntitiesSilent(updater);
        else setEntities(updater);
        return;
    }

    if ((positioningGroupId && positioningGroupStartPos) || (positioningEntityId && positioningEntityStartPos)) {
        const isGroup = !!positioningGroupId;
        const startPos = isGroup ? positioningGroupStartPos! : positioningEntityStartPos!;
        let dx = rawPoint.x - startPos.x;
        let dy = rawPoint.y - startPos.y;
        
        if (isGroup) {
            setPositioningGroupStartPos(rawPoint);
        } else {
            setPositioningEntityStartPos(rawPoint);
        }

        const targetIds = isGroup 
            ? entities.filter(e => e.groupId === positioningGroupId).map(e => e.id)
            : [positioningEntityId!];

        // Snapping logic (Smart Snap during Move)
        const threshold = 15 / view.zoom;
        const movedEntities = entities.filter(e => targetIds.includes(e.id));
        const staticEntities = entities.filter(e => !targetIds.includes(e.id));
        const bgSnaps = getSnapPoints(rawPoint, staticEntities, 'Move', null).filter(s => s.type === 'CAD');

        let bestAdj = { x: 0, y: 0 };
        let minSnapSq = Infinity;
        let snapFound: Point | null = null;

        for (const ent of movedEntities) {
            const kps = getEntityKeyPoints(ent);
            for (const kp of kps) {
                const translatedKp = { x: kp.x + dx, y: kp.y + dy };
                for (const snap of bgSnaps) {
                    const distSq = (translatedKp.x - snap.point.x) ** 2 + (translatedKp.y - snap.point.y) ** 2;
                    if (distSq < threshold * threshold && distSq < minSnapSq) {
                        minSnapSq = distSq;
                        bestAdj = { x: snap.point.x - translatedKp.x, y: snap.point.y - translatedKp.y };
                        snapFound = snap.point;
                    }
                }
            }
        }

        dx += bestAdj.x;
        dy += bestAdj.y;
        setActiveMoveSnapPoint(snapFound);

        const updater = (prev: Entity[]) => prev.map(ent => {
            if (targetIds.includes(ent.id)) {
                if (ent.type === 'line' || ent.type === 'dimension') {
                    return {
                        ...ent,
                        start: { x: ent.start.x + dx, y: ent.start.y + dy },
                        end: { x: ent.end.x + dx, y: ent.end.y + dy }
                    };
                } else if (ent.type === 'circle' || ent.type === 'arc') {
                    return {
                        ...ent,
                        center: { x: ent.center.x + dx, y: ent.center.y + dy }
                    };
                } else if (ent.type === 'rectangle') {
                    return {
                        ...ent,
                        p1: { x: ent.p1.x + dx, y: ent.p1.y + dy },
                        p2: { x: ent.p2.x + dx, y: ent.p2.y + dy }
                    };
                } else if (ent.type === 'hatch') {
                    const h = ent as any;
                    return {
                        ...ent,
                        points: h.points ? h.points.map((p: Point) => ({ x: p.x + dx, y: p.y + dy })) : []
                    };
                } else if (ent.type === 'point' || ent.type === 'text' || ent.type === 'image') {
                    return {
                        ...ent,
                        point: { x: ent.point.x + dx, y: ent.point.y + dy }
                    };
                }
            }
            return ent;
        });
        
        if (setEntitiesSilent) setEntitiesSilent(updater);
        else setEntities(updater);
        return;
    }

    if (drawing) {
      if (isLocked) return;

      // Traditional China / Matita physical stroke behavior:
      // 1) Writes ONLY while the left mouse button is pressed ("se non premo più il tasto e sposto il mouse il pennino non scrive più")
      // 2) Once the stroke starts, its direction is locked and the drawn segment remains permanently on the paper ("una volta che scrivo un segmento rimane là non devo poter muovere il segmento fatto")
      // 3) Moving backwards along the segment keeps it drawn and re-traces/darkens it ("se poi torno indietro con il pennino il segmento rimane disegnato come nella realtà al massimo lo ricalco")
      const isTraditionalStroke = activeTool === 'Line' && (drawing.isTraditionalSegment || defaultLineStyle.mode === 'ink' || defaultLineStyle.mode === 'pencil');
      if (isTraditionalStroke) {
          const isButtonHeld = (e.buttons & 1) === 1 || e.pointerType === 'touch' || e.pointerType === 'pen';
          if (!isButtonHeld) {
              // Mouse button is not pressed -> immediately lift the pen and finalize any drawn segment
              const finalEnd = drawing.maxPoint || drawing.current;
              const segLen = finalEnd ? Math.hypot(finalEnd.x - drawing.start.x, finalEnd.y - drawing.start.y) : 0;
              if (finalEnd && segLen > 0.05 && !drawing.isVirtual) {
                  let retraceStartPt: Point | undefined = undefined;
                  let retraceEndPt: Point | undefined = undefined;
                  if (drawing.retraceMinProj !== undefined && drawing.lockedDir && segLen - drawing.retraceMinProj > 0.05) {
                      retraceStartPt = {
                          x: drawing.start.x + drawing.lockedDir.x * drawing.retraceMinProj,
                          y: drawing.start.y + drawing.lockedDir.y * drawing.retraceMinProj
                      };
                      retraceEndPt = finalEnd;
                  }
                  const newEntity: LineEntity = {
                      id: Date.now().toString(),
                      type: 'line',
                      color: defaultLineStyle.color,
                      lineWidth: defaultLineStyle.lineWidth,
                      dashed: defaultLineStyle.dashed,
                      lineType: defaultLineStyle.lineType,
                      mode: defaultLineStyle.mode,
                      start: drawing.start,
                      end: finalEnd,
                      layer: activeLayerId,
                      isFreehand: false,
                      ...(retraceStartPt && retraceEndPt ? { retraceStart: retraceStartPt, retraceEnd: retraceEndPt } : {})
                  } as any;
                  lastSegmentRef.current = { start: drawing.start, end: finalEnd, length: segLen, id: newEntity.id };
                  onLastParameterChange?.({ type: 'length', value: parseFloat((segLen / 100).toFixed(2)), isAutoFromDrawing: true });
                  recordParallelOffsetFromNewLine(newEntity, entitiesRef.current);
                  setEntities(prev => {
                      onCommitHistory?.(prev);
                      if (!newEntity.isBIM && !(newEntity as any).isFilo) {
                          return mergeLineSegments(prev, newEntity);
                      }
                      return [...prev, newEntity];
                  });
              }
              setDrawing(null);
              return;
          }

          // Mouse button IS pressed: compute target point with Snap / Ortho / Angle rules
          const snapRes = getSnappedPoint(rawPoint, entities, activeTool, drawing as any);
          const effectiveOrthoMode = getEffectiveOrtho(e, true);
          const isEssentialFiveSnap = snapRes.snapped && (
              snapRes.subtype === 'endpoint' ||
              snapRes.subtype === 'midpoint' ||
              snapRes.subtype === 'center' ||
              snapRes.subtype === 'tangent' ||
              snapRes.subtype === 'quadrant' ||
              snapRes.subtype === 'intersection' ||
              snapRes.subtype === 'parallel_offset' ||
              snapRes.subtype === 'parallel_offset_end'
          );

          let candidatePt = rawPoint;
          if (isEssentialFiveSnap || (snapRes.snapped && !effectiveOrthoMode)) {
              candidatePt = snapRes.point;
              setHoverSnap(snapRes);
          } else if (effectiveOrthoMode) {
              const isHoriz = Math.abs(rawPoint.x - drawing.start.x) >= Math.abs(rawPoint.y - drawing.start.y);
              const orthoPt = isHoriz ? { x: rawPoint.x, y: drawing.start.y } : { x: drawing.start.x, y: rawPoint.y };
              const orthoSnap = getSnappedPoint(orthoPt, entities, activeTool, drawing as any);
              if (orthoSnap.snapped) {
                  setHoverSnap(orthoSnap);
              }
              candidatePt = isHoriz
                  ? { x: orthoSnap.point.x, y: drawing.start.y }
                  : { x: drawing.start.x, y: orthoSnap.point.y };
          } else if (!e.shiftKey) {
              candidatePt = applyAngleSnapping(drawing.start, snapRes.point);
          }

          let effectiveDrawingStart = drawing.start;
          if ((snapRes.subtype === 'parallel_offset' || snapRes.subtype === 'parallel_offset_end') && snapRes.refEntityId) {
              const refEnt = entities.find(el => el.id === snapRes.refEntityId);
              if (refEnt && refEnt.type === 'line') {
                  const rLine = refEnt as LineEntity;
                  const rdx = rLine.end.x - rLine.start.x;
                  const rdy = rLine.end.y - rLine.start.y;
                  const rLen = Math.hypot(rdx, rdy);
                  const refD = (snapRes as any).refLength || getEffectiveLastParallelOffset(entities);
                  if (rLen > 0.5 && refD > 0.05) {
                      const rtx = rdx / rLen;
                      const rty = rdy / rLen;
                      const rnx = -rty;
                      const rny = rtx;
                      const startSD = (drawing.start.x - rLine.start.x) * rnx + (drawing.start.y - rLine.start.y) * rny;
                      const startPD = Math.abs(startSD);
                      if (Math.abs(startPD - refD) < 18 / view.zoom) {
                          const sideSign = startSD >= 0 ? 1 : -1;
                          const startProj = (drawing.start.x - rLine.start.x) * rtx + (drawing.start.y - rLine.start.y) * rty;
                          effectiveDrawingStart = {
                              x: rLine.start.x + rtx * startProj + rnx * sideSign * refD,
                              y: rLine.start.y + rty * startProj + rny * sideSign * refD
                          };
                      }
                  }
              }
          }

          const dx = candidatePt.x - effectiveDrawingStart.x;
          const dy = candidatePt.y - effectiveDrawingStart.y;
          const dist = Math.hypot(dx, dy);
          const lockThreshold = Math.max(0.35, 3.5 / view.zoom);

          if (!drawing.lockedDir) {
              // Direction not locked yet: lock it as soon as the nib moves past lockThreshold
              if (dist >= lockThreshold) {
                  const lockedDir = { x: dx / dist, y: dy / dist };
                  setDrawing({
                      ...drawing,
                      start: effectiveDrawingStart,
                      isTraditionalSegment: true,
                      lockedDir,
                      current: candidatePt,
                      maxPoint: candidatePt,
                      maxLength: dist,
                      retraceMinProj: undefined,
                      snapType: snapRes.snapped ? (snapRes.type as any) : undefined,
                      snapSubtype: (snapRes as any).subtype
                  });
              } else {
                  setDrawing({
                      ...drawing,
                      start: effectiveDrawingStart,
                      isTraditionalSegment: true,
                      current: candidatePt,
                      maxPoint: candidatePt,
                      maxLength: dist,
                      snapType: snapRes.snapped ? (snapRes.type as any) : undefined,
                      snapSubtype: (snapRes as any).subtype
                  });
              }
              return;
          } else {
              // Direction IS locked: the drawn segment CANNOT be rotated or moved!
              // Project cursor movement strictly along the locked segment direction.
              const ux = drawing.lockedDir.x;
              const uy = drawing.lockedDir.y;
              let proj = (rawPoint.x - drawing.start.x) * ux + (rawPoint.y - drawing.start.y) * uy;

              // If a valid snap point lies near the locked ray, allow snapping the length to it
              if (snapRes.snapped) {
                  const sdx = snapRes.point.x - drawing.start.x;
                  const sdy = snapRes.point.y - drawing.start.y;
                  const perpDist = Math.abs(sdx * (-uy) + sdy * ux);
                  if (perpDist < 14 / view.zoom) {
                      proj = sdx * ux + sdy * uy;
                  }
              }

              // Clamp to the segment ray starting at drawing.start
              proj = Math.max(0, proj);

              const nibPt = {
                  x: drawing.start.x + ux * proj,
                  y: drawing.start.y + uy * proj
              };
              const prevMaxLen = drawing.maxLength ?? 0;
              const newMaxLen = Math.max(prevMaxLen, proj);
              const newMaxPt = {
                  x: drawing.start.x + ux * newMaxLen,
                  y: drawing.start.y + uy * newMaxLen
              };

              // Detect backtracking ("torno indietro con il pennino -> ricalco")
              let nextRetraceMinProj = drawing.retraceMinProj;
              const backtrackTolerance = Math.max(0.15, 1.5 / view.zoom);
              if (proj < newMaxLen - backtrackTolerance) {
                  nextRetraceMinProj = Math.min(drawing.retraceMinProj ?? newMaxLen, proj);
              }

              setDrawing({
                  ...drawing,
                  isTraditionalSegment: true,
                  current: nibPt,
                  maxPoint: newMaxPt,
                  maxLength: newMaxLen,
                  retraceMinProj: nextRetraceMinProj,
                  snapType: snapRes.snapped ? (snapRes.type as any) : undefined,
                  snapSubtype: (snapRes as any).subtype
              });
              return;
          }
      }

      if (activeTool === 'Line' && (e.buttons === 1 || e.pointerType === 'touch' || e.pointerType === 'pen') && drawing.isFreehand) {
          const prevPoints = drawing.freehandPoints || [drawing.start];
          const lastPt = prevPoints[prevPoints.length - 1];
          const distToLast = Math.sqrt(Math.pow(rawPoint.x - lastPt.x, 2) + Math.pow(rawPoint.y - lastPt.y, 2));
          let nextPoints = prevPoints;
          let newPt = rawPoint;
          let snapType = undefined;
          let refPoint = undefined;
          let constraintAxis = undefined;
          let refPoint2 = undefined;
          let constraintAxis2 = undefined;
          let hasDoubleSmart = false;
          
          if (isSnapActive()) {
              const snap = getSnappedPoint(rawPoint, entities, activeTool, drawing as any);
              if (snap.snapped) {
                  newPt = snap.point;
                  snapType = snap.type;
                  refPoint = snap.refPoint;
                  constraintAxis = snap.constraintAxis;
                  refPoint2 = snap.refPoint2;
                  constraintAxis2 = snap.constraintAxis2;
                  hasDoubleSmart = snap.hasDoubleSmart || false;
              }
          }
          
          const effectiveOrtho = getEffectiveOrtho(e, true);
          if (effectiveOrtho) {
              if (!freehandOrthoAnchorRef.current) {
                  freehandOrthoAnchorRef.current = lastPt;
              }
              const anchor = freehandOrthoAnchorRef.current;
              const dx = Math.abs(rawPoint.x - anchor.x);
              const dy = Math.abs(rawPoint.y - anchor.y);
              if (dx > dy) {
                  newPt = { x: rawPoint.x, y: anchor.y };
              } else {
                  newPt = { x: anchor.x, y: rawPoint.y };
              }
          } else {
              freehandOrthoAnchorRef.current = null;
          }

          // Use pixel distance to capture points more efficiently
          const distInPixels = distToLast * view.zoom;
          if (distInPixels > 1.5) { 
              // Check if the user is backtracking/reinforcing the stroke
              // Find the closest point in prevPoints to newPt
              let closestIdx = -1;
              let minDistance = Infinity;
              for (let i = 0; i < prevPoints.length; i++) {
                  const pt = prevPoints[i];
                  const dist = Math.sqrt(Math.pow(newPt.x - pt.x, 2) + Math.pow(newPt.y - pt.y, 2));
                  if (dist < minDistance) {
                      minDistance = dist;
                      closestIdx = i;
                  }
              }

              const minDistanceInPixels = minDistance * view.zoom;
              // If the closest point is NOT the last point (i.e. it is an earlier point along the path),
              // and the pointer is close to that point (within 12 pixels), the user is backtracking.
              const isBacktracking = closestIdx < prevPoints.length - 1 && minDistanceInPixels < 12;

              if (!isBacktracking) {
                  nextPoints = [...prevPoints, newPt];
              }
          }
          setDrawing({
              ...drawing,
              current: newPt,
              freehandPoints: nextPoints,
              isFreehand: true,
              snapType: snapType,
              refPoint: refPoint,
              constraintAxis: constraintAxis,
              refPoint2: refPoint2,
              constraintAxis2: constraintAxis2,
              hasDoubleSmart: hasDoubleSmart
          });
          return;
      }
      
      if (drawing.wheelLength !== undefined) {
          if (activeTool === 'Circle') {
              const dx = rawPoint.x - drawing.start.x;
              const dy = rawPoint.y - drawing.start.y;
              const len = Math.hypot(dx, dy);
              const ux = len > 1e-6 ? dx / len : (drawing.lockedDir?.x ?? 1);
              const uy = len > 1e-6 ? dy / len : (drawing.lockedDir?.y ?? 0);
              const radius = drawing.wheelLength;
              setDrawing({
                  ...drawing,
                  current: { x: drawing.start.x + ux * radius, y: drawing.start.y + uy * radius }
              });
              return;
          }

          let ux = drawing.lockedDir?.x ?? 1;
          let uy = drawing.lockedDir?.y ?? 0;
          
          if (!fnAnchorCanvasPosRef.current) {
              fnAnchorCanvasPosRef.current = rawPoint;
          }
          
          const dX = rawPoint.x - (fnAnchorCanvasPosRef.current?.x ?? rawPoint.x);
          const dY = rawPoint.y - (fnAnchorCanvasPosRef.current?.y ?? rawPoint.y);
          const deltaProj = dX * ux + dY * uy;
          
          let hardwareCaps = false;
          let scrollLock = false;
          let numLock = false;
          if (e && (e as any).getModifierState) {
              hardwareCaps = !!(e as any).getModifierState('CapsLock');
              scrollLock = !!(e as any).getModifierState('ScrollLock');
              numLock = !!(e as any).getModifierState('NumLock');
          }
          const isDecimalActive = hardwareCaps || scrollLock || numLock || (e && (e as any).shiftKey);
          
          // Re-anchor when mode toggles to prevent jumps (do NOT touch isJollyActive!)
          if (isDecimalActive !== isWheelDecimalRef.current) {
              fnAnchorCanvasPosRef.current = rawPoint;
              fnStepValueRef.current = drawing.wheelLength ?? 1.0;
              isWheelDecimalRef.current = isDecimalActive;
          }
          
          // SENSITIVITY: Extremely dampened for "stepped" wheel feeling
          const sens = isDecimalActive ? 0.002 : 0.04; 
          const baseValue = fnStepValueRef.current ?? drawing.startWheelLength ?? drawing.wheelLength ?? 1.0;
          let targetValue = baseValue + deltaProj * sens;
          
          if (isDecimalActive) {
              targetValue = Math.round(targetValue * 100) / 100; 
          } else {
              targetValue = Math.round(targetValue); 
          }
          
          if (targetValue < 0.1) targetValue = 0.1;
          
          const snappedPoint = {
              x: drawing.start.x + ux * targetValue,
              y: drawing.start.y + uy * targetValue
          };
          setDrawing({ 
              ...drawing, 
              wheelLength: targetValue,
              current: snappedPoint, 
              snapType: undefined, 
              refPoint: undefined,
              constraintAxis: undefined,
              refPoint2: undefined,
              constraintAxis2: undefined,
              hasDoubleSmart: false,
              activeConstraint: undefined
          });
      } else {
          // 1. Check for Snaps around raw mouse position
          let snapRes = getSnappedPoint(rawPoint, entities, activeTool, drawing as any);
          
          const isOrthoTool = (activeTool as string) === 'Line' || (activeTool as string) === 'Filo' || (activeTool as string) === 'BIM_Porta' || (activeTool as string) === 'BIM_Finestra' || (activeTool as string) === 'BIM_Muro' || (activeTool as string) === 'Muro' || (activeTool as string) === 'Rectangle' || (activeTool as string) === 'Circle' || (activeTool as string) === 'Arc' || (activeTool as string) === 'Parallel' || (activeTool as string) === 'Specchio' || (activeTool as string) === 'Move' || (activeTool as string) === 'Copy';
          const effectiveOrthoMode = getEffectiveOrtho(e, isOrthoTool);

          // 2. Essential CAD snaps (estremi, medio, centro, tangente, 4 punti del cerchio, incroci, offset parallelo) ALWAYS win even when Bloc Fn / Ortho is held!
          const isEssentialFiveSnap = snapRes.snapped && (
              snapRes.subtype === 'endpoint' ||
              snapRes.subtype === 'midpoint' ||
              snapRes.subtype === 'center' ||
              snapRes.subtype === 'tangent' ||
              snapRes.subtype === 'quadrant' ||
              snapRes.subtype === 'intersection' ||
              snapRes.subtype === 'parallel_offset' ||
              snapRes.subtype === 'parallel_offset_end'
          );
          const isWhitelistedSnap = isEssentialFiveSnap || (!effectiveOrthoMode && snapRes.snapped && (
              snapRes.subtype === 'perpendicular' || 
              snapRes.subtype === 'intersection' ||
              snapRes.subtype === 'equal_length' ||
              snapRes.subtype === 'equal_radius' ||
              snapRes.subtype === 'input'
          ));

          if (isWhitelistedSnap || (snapRes.snapped && !effectiveOrthoMode)) {
                let effectiveStart = drawing.start;
                if ((snapRes.subtype === 'parallel_offset' || snapRes.subtype === 'parallel_offset_end') && snapRes.refEntityId) {
                    const refEnt = entities.find(el => el.id === snapRes.refEntityId);
                    if (refEnt && refEnt.type === 'line') {
                        const rLine = refEnt as LineEntity;
                        const rdx = rLine.end.x - rLine.start.x;
                        const rdy = rLine.end.y - rLine.start.y;
                        const rLen = Math.hypot(rdx, rdy);
                        const refD = (snapRes as any).refLength || getEffectiveLastParallelOffset(entities);
                        if (rLen > 0.5 && refD > 0.05) {
                            const rtx = rdx / rLen;
                            const rty = rdy / rLen;
                            const rnx = -rty;
                            const rny = rtx;
                            const startSD = (drawing.start.x - rLine.start.x) * rnx + (drawing.start.y - rLine.start.y) * rny;
                            const startPD = Math.abs(startSD);
                            if (Math.abs(startPD - refD) < 18 / view.zoom) {
                                const sideSign = startSD >= 0 ? 1 : -1;
                                const startProj = (drawing.start.x - rLine.start.x) * rtx + (drawing.start.y - rLine.start.y) * rty;
                                effectiveStart = {
                                    x: rLine.start.x + rtx * startProj + rnx * sideSign * refD,
                                    y: rLine.start.y + rty * startProj + rny * sideSign * refD
                                };
                            }
                        }
                    }
                }
                setHoverSnap(snapRes);
                setDrawing({ 
                    ...drawing, 
                    start: effectiveStart,
                    current: snapRes.point, 
                    snapType: snapRes.type, 
                    snapSubtype: (snapRes as any).subtype,
                    refSegment: (snapRes as any).refSegment,
                    refLength: (snapRes as any).refLength,
                    refRadius: (snapRes as any).refRadius,
                    refPoint: (snapRes as any).refPoint,
                    refEntityId: (snapRes as any).refEntityId,
                    constraintAxis: (snapRes as any).constraintAxis,
                    refPoint2: (snapRes as any).refPoint2,
                    constraintAxis2: (snapRes as any).constraintAxis2,
                    hasDoubleSmart: (snapRes as any).hasDoubleSmart || false,
                    activeConstraint: undefined
                });
            } else {
                // 3. Otherwise, apply Ortho logic
                if (effectiveOrthoMode) {
                    const isOrthoHorizontal = isOrthoTool && 
                          Math.abs(rawPoint.x - drawing.start.x) >= Math.abs(rawPoint.y - drawing.start.y);

                    let orthoPoint = rawPoint;
                    if (activeTool === 'Rectangle') {
                        const side = Math.max(Math.abs(rawPoint.x - drawing.start.x), Math.abs(rawPoint.y - drawing.start.y));
                        const signX = rawPoint.x >= drawing.start.x ? 1 : -1;
                        const signY = rawPoint.y >= drawing.start.y ? 1 : -1;
                        orthoPoint = { x: drawing.start.x + side * signX, y: drawing.start.y + side * signY };
                    } else {
                        orthoPoint = isOrthoHorizontal 
                          ? { x: rawPoint.x, y: drawing.start.y } 
                          : { x: drawing.start.x, y: rawPoint.y };
                    }
                    
                    // 4. Try to snap the Ortho point
                    let orthoSnap = getSnappedPoint(orthoPoint, entities, activeTool, drawing as any);
                    if (orthoSnap.snapped) {
                        setHoverSnap(orthoSnap);
                    } else {
                        setHoverSnap(null);
                    }
                    let finalPoint = orthoSnap.point;
                    if (activeTool === 'Rectangle' && orthoSnap.snapped) {
                         const side = Math.max(Math.abs(finalPoint.x - drawing.start.x), Math.abs(finalPoint.y - drawing.start.y));
                         const signX = finalPoint.x >= drawing.start.x ? 1 : -1;
                         const signY = finalPoint.y >= drawing.start.y ? 1 : -1;
                         finalPoint = { x: drawing.start.x + side * signX, y: drawing.start.y + side * signY };
                    } else if (effectiveOrthoMode) {
                        // Re-enforce ortho after snapping if needed
                        finalPoint = isOrthoHorizontal 
                          ? { x: finalPoint.x, y: drawing.start.y } 
                          : { x: drawing.start.x, y: finalPoint.y };
                    }
                    
                    setDrawing({
                        ...drawing,
                        current: finalPoint,
                        snapType: orthoSnap.snapped ? (orthoSnap.type as any) : undefined,
                        snapSubtype: (orthoSnap as any).subtype,
                        refSegment: (orthoSnap as any).refSegment,
                        refLength: (orthoSnap as any).refLength,
                        refPoint: (orthoSnap as any).refPoint,
                        refEntityId: (orthoSnap as any).refEntityId,
                        activeConstraint: undefined
                    });
                } else {
                    // 5. Normal snapping (Smart snaps, extension, etc.)
                    // We already have snapRes from rawPoint
                    let finalPoint = snapRes.point;
                    if (!snapRes.snapped && drawing.activeConstraint) {
                        if (drawing.activeConstraint.axis === 'x') finalPoint.x = drawing.activeConstraint.value;
                        else finalPoint.y = drawing.activeConstraint.value;
                    }
                    
                    if ((activeTool === 'Line' || activeTool === 'Parallel') && !snapRes.snapped) {
                        if (!e.shiftKey) {
                            finalPoint = applyAngleSnapping(drawing.start, finalPoint);
                        }
                    }

                    setDrawing({ 
                        ...drawing, 
                        current: finalPoint, 
                        snapType: snapRes.snapped ? (snapRes.type as any) : undefined, 
                        snapSubtype: (snapRes as any).subtype,
                        refSegment: (snapRes as any).refSegment,
                        refLength: (snapRes as any).refLength,
                        refPoint: (snapRes as any).refPoint,
                        refEntityId: (snapRes as any).refEntityId,
                        constraintAxis: (snapRes as any).constraintAxis,
                        refPoint2: (snapRes as any).refPoint2,
                        constraintAxis2: (snapRes as any).constraintAxis2,
                        hasDoubleSmart: (snapRes as any).hasDoubleSmart || false,
                        activeConstraint: undefined,
                        isVirtual: drawing.isVirtual
                    });
                }
            }
        }
    } else if ((activeTool === 'Move' || activeTool === 'Copy' || activeTool === 'Testo' || isJollyActive || isMagicCopyActive || isMagicCopyActiveRef.current) && dragEntityIdRef.current) {
        lastDragMousePosRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            shiftKey: e.shiftKey,
            buttons: e.buttons
        };
        
        if (!dragFrameRequestedRef.current) {
            dragFrameRequestedRef.current = true;
            requestAnimationFrame(() => {
                dragFrameRequestedRef.current = false;
                if (!lastDragMousePosRef.current) return;
                
                const { clientX, clientY, shiftKey, buttons } = lastDragMousePosRef.current;
                const canvasEl = canvasRef.current;
                if (!canvasEl) return;
                const canvasRect = canvasEl.getBoundingClientRect();
                const currentRawPoint = getDampenedCoordinate(
                    screenToCanvas(clientX - canvasRect.left, clientY - canvasRect.top)
                );
                
                let targetIds = dragEntityIdsRef.current.length > 0 ? [...dragEntityIdsRef.current] : [dragEntityIdRef.current!];
                
                let deltaX = 0;
                let deltaY = 0;
                let snapFound: Point | null = null;
                let snapPointUsed = currentRawPoint;

                const activeBasePoint = activeTool === 'Copy' ? copyBasePoint : moveBasePoint;

                if (activeBasePoint !== null) {
                    const staticEntities = entities.filter(e => !targetIds.includes(e.id));
                    const snapRes = getSnappedPoint(currentRawPoint, staticEntities, activeTool, null);
                    let snapPoint = snapRes.snapped ? snapRes.point : currentRawPoint;
                    
                    if (snapRes.snapped) {
                        snapFound = snapRes.point;
                        setHoverSnap(snapRes);
                    } else {
                        setHoverSnap(null);
                    }

                    const effectiveOrthoMode = getEffectiveOrtho(e, true);
                    if (effectiveOrthoMode && !snapRes.snapped) {
                        const dx = snapPoint.x - activeBasePoint.x;
                        const dy = snapPoint.y - activeBasePoint.y;
                        if (Math.abs(dx) > Math.abs(dy)) {
                            snapPoint.y = activeBasePoint.y;
                        } else {
                            snapPoint.x = activeBasePoint.x;
                        }
                    }

                    snapPointUsed = snapPoint;
                    deltaX = snapPoint.x - previousMouseRef.current.x;
                    deltaY = snapPoint.y - previousMouseRef.current.y;
                    
                    if (Math.abs(deltaX) > 1e-4 || Math.abs(deltaY) > 1e-4) {
                        dragHasMovedRef.current = true;
                    }
                } else {
                    // 1. Nominal movement from cursor
                    deltaX = currentRawPoint.x - previousMouseRef.current.x;
                    deltaY = currentRawPoint.y - previousMouseRef.current.y;

                    if (Math.abs(deltaX) > 1e-4 || Math.abs(deltaY) > 1e-4) {
                        dragHasMovedRef.current = true;
                    }

                    // 2. Multi-point Snap Challenge
                    const threshold = 15 / view.zoom;
                    const movedEntities = entities.filter(e => targetIds.includes(e.id));
                    const staticEntities = entities.filter(e => !targetIds.includes(e.id));
                    const bgSnaps = getSnapPoints(currentRawPoint, staticEntities, 'Move', null).filter(s => s.type === 'CAD');

                    let bestAdj = { x: 0, y: 0 };
                    let minSnapSq = Infinity;
                    let bestSubtype: string | undefined = undefined;

                    // Optimization: if dragging/copying many objects, only calculate snappings for primary focused object to save temporary memory and CPU
                    const entitiesToSnap = movedEntities.length > 5
                        ? movedEntities.filter(e => e.id === dragEntityIdRef.current || e.id === (targetIds[0] || ''))
                        : movedEntities;

                    for (const ent of entitiesToSnap) {
                        const kps = getEntityKeyPoints(ent);
                        for (const kp of kps) {
                            const translatedKp = { x: kp.x + deltaX, y: kp.y + deltaY };
                            for (const snap of bgSnaps) {
                                const distSq = (translatedKp.x - snap.point.x) ** 2 + (translatedKp.y - snap.point.y) ** 2;
                                if (distSq < threshold * threshold && distSq < minSnapSq) {
                                    minSnapSq = distSq;
                                    bestAdj = { x: snap.point.x - translatedKp.x, y: snap.point.y - translatedKp.y };
                                    snapFound = snap.point;
                                    bestSubtype = snap.subtype;
                                }
                            }
                        }
                    }

                    deltaX += bestAdj.x;
                    deltaY += bestAdj.y;

                    const effectiveOrthoMode = getEffectiveOrtho(e, true) || isShiftPressedRef.current || shiftKey;
                    const isWhitelistedSnap = snapFound && (
                        bestSubtype === 'endpoint' || 
                        bestSubtype === 'midpoint' || 
                        bestSubtype === 'perpendicular' || 
                        bestSubtype === 'quadrant' || 
                        bestSubtype === 'center' ||
                        bestSubtype === 'intersection'
                    );

                    const isOrthoForMoveCopy = (activeTool === 'Copy' || activeTool === 'Move' || isJollyActive || isMagicCopyActive || isMagicCopyActiveRef.current) && effectiveOrthoMode && !isWhitelistedSnap;
                    
                    if (isOrthoForMoveCopy) {
                      // If moving a single line or dimension, preserve its initial linearity (move strictly orthogonal/parallel to its orientation)
                      const primaryMoved = movedEntities.find(ent => ent.id === dragEntityIdRef.current) || movedEntities[0];
                      if (primaryMoved && (primaryMoved.type === 'line' || primaryMoved.type === 'dimension')) {
                          const ldx = primaryMoved.end.x - primaryMoved.start.x;
                          const ldy = primaryMoved.end.y - primaryMoved.start.y;
                          const lLen = Math.hypot(ldx, ldy);
                          if (lLen > 0.01) {
                              const nx = -ldy / lLen;
                              const ny = ldx / lLen;
                              // Project delta onto the normal vector so the segment/measure shifts strictly parallel to itself
                              const projN = deltaX * nx + deltaY * ny;
                              deltaX = nx * projN;
                              deltaY = ny * projN;
                              snapPointUsed = {
                                  x: previousMouseRef.current.x + deltaX,
                                  y: previousMouseRef.current.y + deltaY
                              };
                          }
                      } else {
                          if (Math.abs(deltaX) > Math.abs(deltaY)) {
                              deltaY = 0;
                          } else {
                              deltaX = 0;
                          }
                          snapPointUsed = {
                              x: previousMouseRef.current.x + deltaX,
                              y: previousMouseRef.current.y + deltaY
                          };
                      }
                    }
                }
                setActiveMoveSnapPoint(snapFound);

                // Se la linea è stata appena posizionata con un offset numerico da tastiera:
                // - Ignora piccoli movimenti accidentali del mouse (< 12 px) così non perde l'offset impostato
                // - Se siamo in modalità Copia (Z / Copy) o Aiuto Offset e l'utente sposta il mouse per fare il successivo, clona la linea lasciando quella corrente come riferimento!
                const lockedInfo = parallelOverrideLockedLineRef.current;
                if (lockedInfo && targetIds.includes(lockedInfo.lineId)) {
                    const distFromLock = Math.hypot(
                        currentRawPoint.x - lockedInfo.mousePosAtLock.x,
                        currentRawPoint.y - lockedInfo.mousePosAtLock.y
                    );
                    const elapsedSinceDigit = Date.now() - lockedInfo.timestamp;
                    if (distFromLock < 12 / view.zoom || elapsedSinceDigit < 450) {
                        previousMouseRef.current = currentRawPoint;
                        return;
                    } else {
                        parallelOverrideLockedLineRef.current = null;
                        justOffsetLineIdRef.current = null;
                        setLiveNumericOverride(null);
                        if (isMagicCopyActiveRef.current || activeTool === 'Copy' || (isOffsetAidActiveRef.current && !isJollyActiveRef.current && activeTool !== 'Move')) {
                            const lockedEnt = entitiesRef.current.find(el => el.id === lockedInfo.lineId);
                            if (lockedEnt) {
                                const cloned = fastCloneEntity(lockedEnt);
                                cloned.id = Date.now().toString() + '_offset_' + Math.random().toString(36).substr(2, 5);
                                setEntities(prev => [...prev, cloned]);
                                setClonedEntityIds(prev => {
                                    const next = new Set(prev);
                                    next.add(cloned.id);
                                    return next;
                                });
                                setDragEntityIds([cloned.id]);
                                dragEntityIdsRef.current = [cloned.id];
                                setDragEntityId(cloned.id);
                                dragEntityIdRef.current = cloned.id;
                                previousMouseRef.current = currentRawPoint;
                                return;
                            }
                        }
                    }
                }

                // Aggancio magnetico automatico alla linea di riferimento dell'ultimo offset usato
                // (Attivo quando si usa Offset, Sposta o Copia)
                const targetOffset = isMoveCopyOrOffsetAidActive() ? getEffectiveLastParallelOffset(entitiesRef.current) : 0;
                if (targetOffset > 0.05 && !snapFound) {
                    const currentEntitiesList = entitiesRef.current;
                    const primaryMoved = currentEntitiesList.find(ent => ent.id === dragEntityIdRef.current || targetIds.includes(ent.id));
                    if (primaryMoved && primaryMoved.type === 'line') {
                        const mLine = primaryMoved as LineEntity;
                        const mdx = mLine.end.x - mLine.start.x;
                        const mdy = mLine.end.y - mLine.start.y;
                        const mLen = Math.hypot(mdx, mdy);
                        if (mLen > 0.1) {
                            const mnx = -mdy / mLen;
                            const mny = mdx / mLen;
                            const nextStartX = mLine.start.x + deltaX;
                            const nextStartY = mLine.start.y + deltaY;

                            let nearestParallelRef: LineEntity | null = null;
                            let minPDist = Infinity;
                            let bestSignedD = 0;

                            for (const other of currentEntitiesList) {
                                if (other.id !== mLine.id && !targetIds.includes(other.id) && other.type === 'line') {
                                    const oLine = other as LineEntity;
                                    const odx = oLine.end.x - oLine.start.x;
                                    const ody = oLine.end.y - oLine.start.y;
                                    const oLen = Math.hypot(odx, ody);
                                    if (oLen > 0.1) {
                                        const onx = -ody / oLen;
                                        const ony = odx / oLen;
                                        if (Math.abs(mnx * onx + mny * ony) > 0.992) {
                                            const sD = (oLine.start.x - nextStartX) * mnx + (oLine.start.y - nextStartY) * mny;
                                            const d = Math.abs(sD);
                                            if (d > 0.05 && d < minPDist) {
                                                minPDist = d;
                                                bestSignedD = sD;
                                                nearestParallelRef = oLine;
                                            }
                                        }
                                    }
                                }
                            }

                            if (nearestParallelRef) {
                                const diffToEqualOffset = Math.abs(minPDist - targetOffset);
                                const offsetSnapThresh = 14 / view.zoom;
                                if (diffToEqualOffset < offsetSnapThresh) {
                                    const sideSign = bestSignedD >= 0 ? 1 : -1;
                                    const correctionAlongNormal = bestSignedD - sideSign * targetOffset;
                                    deltaX += mnx * correctionAlongNormal;
                                    deltaY += mny * correctionAlongNormal;
                                    snapPointUsed = {
                                        x: previousMouseRef.current.x + deltaX,
                                        y: previousMouseRef.current.y + deltaY
                                    };
                                }
                            }
                        }
                    }
                }

                if (Math.abs(deltaX) > 1e-6 || Math.abs(deltaY) > 1e-6) {
                    const updater = (prev: Entity[]) => prev.map(ent => {
                        if (targetIds.includes(ent.id)) {
                            return shiftEntityByDelta(ent, deltaX, deltaY);
                        }
                        return ent;
                    });
                    if (setEntitiesSilent) setEntitiesSilent(updater);
                    else setEntities(updater);
                    
                    previousMouseRef.current = snapPointUsed;
                }
            });
        }
        return;
} else if (activeTool === 'Parallel' && selectedParallelLine) {
        setParallelMouse(rawPoint);
        const line = selectedParallelLine as LineEntity;
        const p1 = line.start;
        const p2 = line.end;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const L = Math.sqrt(dx * dx + dy * dy);
        if (L > 0) {
            const nx = -dy / L;
            const ny = dx / L;
            const vec1 = { x: rawPoint.x - p1.x, y: rawPoint.y - p1.y };
            
            const distVal = vec1.x * nx + vec1.y * ny;
            const sign = distVal >= 0 ? 1 : -1;
            setParallelSign(sign);

            const rawDist = Math.abs(distVal);
            let dist = rawDist;

            // Smart magnetic snapping to previous offset distance first, then perpendicular ruler graduations
            if (!e.altKey) {
                const refPrevD = getEffectiveLastParallelOffset(entitiesRef.current);
                const prevOffsetSnapThresh = 16 / view.zoom;
                if (refPrevD > 0.05 && Math.abs(rawDist - refPrevD) < prevOffsetSnapThresh) {
                    dist = refPrevD;
                } else {
                    const rulerTicks = [
                        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50,
                        60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200, 220, 250, 300, 350, 400, 500
                    ];
                    const snapThresh = 11 / view.zoom;
                    let closestTick: number | null = null;
                    let minDiff = Infinity;
                    for (const tick of rulerTicks) {
                        const diff = Math.abs(rawDist - tick);
                        if (diff < snapThresh && diff < minDiff) {
                            minDiff = diff;
                            closestTick = tick;
                        }
                    }
                    if (closestTick !== null) {
                        dist = closestTick;
                    } else {
                        dist = Math.round(rawDist * 10) / 10;
                    }
                }
            } else {
                dist = Math.round(rawDist * 100) / 100;
            }

            dist = Math.max(0.1, dist);
            setParallelDistance(dist);
            setParallelInputString(dist.toString());
        }
    } else if (activeTool === 'Gomma') {
        const rawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
        setEraserPos(rawPoint);
        setHighlightedTrimLine(null);
        setHighlightedTrimSegment(null);
        if (e.buttons === 1 || e.pointerType === 'touch' || e.pointerType === 'pen') {
            executeEraser(rawPoint, false);
        }
    } else if (activeTool === 'Trim') {
        const rawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
        const target = getTrimTargetAtPoint(rawPoint);
        setHighlightedTrimLine(target || null);
        
        if (target) {
            const result = computeTrimSegments(target, rawPoint, entitiesRef.current, trimMode);
            if (result) {
                setHighlightedTrimSegment(result.highlighted);
                
                // BRUSH BEHAVIOR for Smart Trim (Gomma Smart) - Only when dragging
                if (trimMode === 'smart' && (e.buttons === 1 || e.pointerType === 'touch' || e.pointerType === 'pen')) {
                    const now = Date.now();
                    if (now - lastEraserExecutionTime.current > 20) { 
                        lastEraserExecutionTime.current = now;
                        executeSmartTrim(rawPoint);
                    }
                }
            } else {
                setHighlightedTrimSegment(null);
            }
        } else {
            setHighlightedTrimSegment(null);
        }
    } else if (activeTool === 'Allunga') {
        const rawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
        const target = getEntityAtPoint(rawPoint, 15);
        setHighlightedTrimLine(target || null);
        if (target && target.type === 'line') {
            const line = target as LineEntity;
            
            // --- ATOMIZATION AWARE HIGHLIGHTING ---
            const inters: Point[] = [];
            entitiesRef.current.forEach(other => {
                if (other.id === line.id) return;
                const pts = getIntersections(line, other);
                pts.forEach(p => {
                    const dS = Math.hypot(p.x - line.start.x, p.y - line.start.y);
                    const dE = Math.hypot(p.x - line.end.x, p.y - line.end.y);
                    if (dS > 0.1 && dE > 0.1) inters.push(p);
                });
            });

            const dx_total = line.end.x - line.start.x;
            const dy_total = line.end.y - line.start.y;
            const L2 = dx_total * dx_total + dy_total * dy_total;
            
            let currentSubSegment = { start: line.start, end: line.end };

            if (L2 > 0.001) {
                const pointsWithT = [
                    { t: 0, p: line.start },
                    ...inters.map(p => ({
                        t: ((p.x - line.start.x) * dx_total + (p.y - line.start.y) * dy_total) / L2,
                        p
                    })),
                    { t: 1, p: line.end }
                ].sort((a, b) => a.t - b.t);

                const deduped: Point[] = [];
                for (let i = 0; i < pointsWithT.length; i++) {
                    if (i === 0 || pointsWithT[i].t - pointsWithT[i-1].t > 0.001) {
                        deduped.push(pointsWithT[i].p);
                    }
                }

                for (let i = 0; i < deduped.length - 1; i++) {
                    if (distToSegment(rawPoint, deduped[i], deduped[i+1]) < (15 / view.zoom)) {
                        currentSubSegment = { start: deduped[i], end: deduped[i+1] };
                        break;
                    }
                }
            }

            const distStart = Math.hypot(rawPoint.x - currentSubSegment.start.x, rawPoint.y - currentSubSegment.start.y);
            const distEnd = Math.hypot(rawPoint.x - currentSubSegment.end.x, rawPoint.y - currentSubSegment.end.y);
            
            const endExtending = distStart < distEnd ? 'start' : 'end';
            let pivot = endExtending === 'start' ? currentSubSegment.end : currentSubSegment.start;
            const extPt = endExtending === 'start' ? currentSubSegment.start : currentSubSegment.end;
            
            // Highlight the sub-segment
            setHighlightedTrimSegment({
                type: 'line',
                start: currentSubSegment.start,
                end: currentSubSegment.end
            });

            if (line.isFreehand && line.inkPoints && line.inkPoints.length > 1) {
                if (endExtending === 'start') {
                    pivot = line.inkPoints[1];
                } else {
                    pivot = line.inkPoints[line.inkPoints.length - 2];
                }
            }
            
            const dx = extPt.x - pivot.x;
            const dy = extPt.y - pivot.y;
            const len = Math.hypot(dx, dy);
            
            if (len > 0.01) {
                const dirX = dx / len;
                const dirY = dy / len;
                
                const farX = extPt.x + dirX * 100000;
                const farY = extPt.y + dirY * 100000;
                const ray: LineEntity = { id: 'temp_ray', type: 'line', start: extPt, end: { x: farX, y: farY }, color: '', lineWidth: 1, layer: '', mode: 'CAD' };
                
                const intersections: { pt: Point; dist: number }[] = [];
                entitiesRef.current.forEach(other => {
                    if (other.id === line.id) return;
                    const layer = layers.find(l => l.id === other.layer);
                    if (layer && !layer.visible) return;
                    
                    const pts = getIntersections(ray, other);
                    pts.forEach(p => {
                        const dist = Math.hypot(p.x - extPt.x, p.y - extPt.y);
                        if (dist > 0.05) {
                            intersections.push({ pt: p, dist });
                        }
                    });
                });
                
                intersections.sort((a, b) => a.dist - b.dist);
                if (intersections.length > 0) {
                    setAllungaHover({
                        lineId: line.id,
                        endExtending: distStart < distEnd ? 'start' : 'end', // use relative to original line for execution
                        originalPt: extPt,
                        targetPt: intersections[0].pt,
                        pivotPt: pivot
                    });
                } else {
                    setAllungaHover(null);
                }
            } else {
                setAllungaHover(null);
            }
        } else {
            setAllungaHover(null);
            setHighlightedTrimSegment(null);
        }
    } else if (activeTool === 'Cancella') {
        setHighlightedTrimLine(getEntityAtPoint(rawPoint) || null);
        setHighlightedTrimSegment(null);
    } else if (activeTool === 'Specchio') {
        if (specchioState === 'axis_start') {
            const target = getEntityAtPoint(rawPoint);
            if (target && target.type === 'line') {
                setSpecchioHoverAxisLine(target);
            } else {
                setSpecchioHoverAxisLine(null);
            }
        } else {
            setSpecchioHoverAxisLine(null);
        }
    }

    actualMousePosRef.current = rawPoint;
    lastMouseRef.current = rawPoint;
    setTooltipMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    renderRef.current?.();
  };

   const handleMouseUp = (e: React.PointerEvent) => {
    if (selectedLine || quickEditEntityId || textDialog) {
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    if (dragSquadrettaId) {
        const now = Date.now();
        if (now - lastSquadrettaInteractionAt < 250) {
            // Click to rotate 90 deg clockwise
            setSquadrette(prev => prev.map(sq => 
                sq.id === dragSquadrettaId ? { ...sq, rotation: (sq.rotation + 90) % 360 } : sq
            ));
        }
        setDragSquadrettaId(null);
        renderRef.current?.();
        return;
    }

    if (dragEntityId && (isJollyActive || isMagicCopyActive || isMagicCopyActiveRef.current || activeTool === 'Move' || activeTool === 'Testo') && dragHasMovedRef.current) {
        const activePair = activeParallelPairRef.current;
        if (activePair && activePair.lineId === dragEntityId && activePair.currentDist > 0.05) {
            lastParallelOffsetInfoRef.current = {
                distance: activePair.currentDist,
                lineId: activePair.lineId,
                refLineId: activePair.refLineId,
                nx: activePair.nx,
                ny: activePair.ny,
                dirSign: activePair.signedDist >= 0 ? -1 : 1,
                timestamp: Date.now()
            };
            justOffsetLineIdRef.current = activePair.lineId;
        }
        parallelOverrideLockedLineRef.current = null;
        setClonedEntityIds(new Set());
        setDragEntityId(null);
        dragEntityIdRef.current = null;
        setDragEntityIds([]);
        dragEntityIdsRef.current = [];
        setActiveMoveSnapPoint(null);
        setMoveBasePoint(null);
        setMovePhase('idle');
        dragHasMovedRef.current = false;
        setEntities(prev => {
            onCommitHistory?.(prev);
            return [...prev];
        });
        renderRef.current?.();
        return;
    }

    isDraggingZoomRef.current = false;
    isDraggingPanRef.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = '';
    if (isMovingTecnigrafo) {
        setIsMovingTecnigrafo(false);
        movingTecnigrafoStartRef.current = null;
        return;
    }
    freehandOrthoAnchorRef.current = null;
    
    // If we're drawing a circle, commit the circle on mouseup (click-and-drag rule)
    if (activeTool === 'Circle' && drawing) {
        let radius = Math.sqrt(Math.pow(drawing.current.x - drawing.start.x, 2) + Math.pow(drawing.current.y - drawing.start.y, 2));
        if (circleRadiusInputStringRef.current) {
            const parsed = parseFloat(circleRadiusInputStringRef.current.replace(',', '.'));
            if (!isNaN(parsed) && parsed > 0) {
                radius = parsed;
            }
        }
        
        if (radius > 0.01) {
            const newCircle: CircleEntity = {
                id: Date.now().toString(),
                type: 'circle',
                color: defaultLineStyle.color,
                lineWidth: defaultLineStyle.lineWidth,
                dashed: defaultLineStyle.dashed,
                mode: defaultLineStyle.mode,
                center: drawing.start,
                radius: radius,
                layer: activeLayerId
            };
            
            lastCircleRadiusRef.current = radius;
            onLastParameterChange?.({ type: 'radius', value: parseFloat((radius / 100).toFixed(2)), isAutoFromDrawing: true });
            try { localStorage.setItem('lastCircleRadius', radius.toString()); } catch(err){}
            setEntities(prev => {
                onCommitHistory?.(prev);
                return [...prev, newCircle];
            });
            setCircleRadiusInputString('');
            circleRadiusInputStringRef.current = '';
            setDrawing(null);
            return;
        }
    }
    
    // Traditional China / Matita segment: releasing the mouse button lifts the pen off the paper and commits the permanent segment
    if (activeTool === 'Line' && drawing && (drawing.isTraditionalSegment || defaultLineStyle.mode === 'ink' || defaultLineStyle.mode === 'pencil')) {
        const finalEnd = drawing.maxPoint || drawing.current;
        const segLen = finalEnd ? Math.hypot(finalEnd.x - drawing.start.x, finalEnd.y - drawing.start.y) : 0;
        if (finalEnd && segLen > 0.5 && !drawing.isVirtual) {
            onSelect(null);
            let retraceStartPt: Point | undefined = undefined;
            let retraceEndPt: Point | undefined = undefined;
            if (drawing.retraceMinProj !== undefined && drawing.lockedDir && segLen - drawing.retraceMinProj > 0.05) {
                retraceStartPt = {
                    x: drawing.start.x + drawing.lockedDir.x * drawing.retraceMinProj,
                    y: drawing.start.y + drawing.lockedDir.y * drawing.retraceMinProj
                };
                retraceEndPt = finalEnd;
            }
            const newEntity: LineEntity = {
                id: Date.now().toString(),
                type: 'line',
                color: defaultLineStyle.color,
                lineWidth: defaultLineStyle.lineWidth,
                dashed: defaultLineStyle.dashed,
                lineType: defaultLineStyle.lineType,
                mode: defaultLineStyle.mode,
                start: drawing.start,
                end: finalEnd,
                layer: activeLayerId,
                isFreehand: false,
                ...(retraceStartPt && retraceEndPt ? { retraceStart: retraceStartPt, retraceEnd: retraceEndPt } : {})
            } as any;
            lastSegmentRef.current = { start: drawing.start, end: finalEnd, length: segLen, id: newEntity.id };
            onLastParameterChange?.({ type: 'length', value: parseFloat((segLen / 100).toFixed(2)), isAutoFromDrawing: true });
            recordParallelOffsetFromNewLine(newEntity, entitiesRef.current);
            setEntities(prev => {
                onCommitHistory?.(prev);
                if (!newEntity.isBIM && !(newEntity as any).isFilo) {
                    return mergeLineSegments(prev, newEntity);
                }
                return [...prev, newEntity];
            });
        }
        setLiveNumericOverride(null);
        setDrawing(null);
        return;
    }

    // If we're freehand drawing, commit the stroke on mouseup
    if (activeTool === 'Line' && drawing && drawing.isFreehand && drawing.freehandPoints && drawing.freehandPoints.length > 1) {
        let pts = [...drawing.freehandPoints];
        if (isSnapActive() && pts.length > 0) {
            const lastRaw = pts[pts.length - 1];
            const snap = getSnappedPoint(lastRaw, entities, activeTool, drawing as any);
            if (snap.snapped) {
                pts[pts.length - 1] = snap.point;
            }
        }
        const isCad = defaultLineStyle.mode === 'CAD';
        const newEntity: Entity = {
            id: Date.now().toString(),
            type: 'line',
            color: defaultLineStyle.color,
            lineWidth: defaultLineStyle.lineWidth,
            dashed: defaultLineStyle.dashed,
            lineType: defaultLineStyle.lineType,
            mode: defaultLineStyle.mode,
            start: pts[0],
            end: pts[pts.length - 1],
            isFreehand: !isCad,
            inkPoints: isCad ? undefined : pts.map((p, i) => {
                const style = computeRealisticInkPoint(pts, i, defaultLineStyle.mode === 'ink' ? 'ink' : 'pencil', view.zoom);
                return {
                    x: p.x,
                    y: p.y,
                    width: style.width,
                    alpha: style.alpha
                };
            }),
            layer: activeLayerId
        };
        setEntities(prev => {
            if (newEntity.type === 'line' && !newEntity.isBIM && !(newEntity as any).isFilo) {
                return mergeLineSegments(prev, newEntity as LineEntity);
            }
            return [...prev, newEntity];
        });
        setDrawing(null);
        return;
    }

    if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
    }
    if (isHoldFiredRef.current) {
        isHoldFiredRef.current = false;
        return;
    }
    if (selectionWindow) {
        if (activeTool === 'CopiaVideo') {
            const start = selectionWindow.start;
            const end = selectionWindow.current;
            setSelectionWindow(null);
            // Forza render immediato per togliere la cornice gialla prima dello screenshot
            renderRef.current?.();
            captureSelection(start, end);
            return;
        }
        const rawIds = getEntitiesInWindow(selectionWindow.start, selectionWindow.current, entities);
        const ids = resolveGroups(rawIds, entities);
        if (activeTool === 'Trim') {
            executeWindowTrim(selectionWindow.start, selectionWindow.current);
        } else if (activeTool === 'Cancella' && ids.length > 0) {
            setEntities(prev => {
                return prev.filter(ent => !ids.includes(ent.id));
            });
        } else if (activeTool === 'Move' || activeTool === 'Copy') {
            if (activeTool === 'Move') {
                setMoveSourceEntityIds(prev => Array.from(new Set([...prev, ...ids])));
            } else {
                setCopySourceEntityIds(prev => Array.from(new Set([...prev, ...ids])));
            }
        } else if (activeTool === 'Join') {
            setDragEntityIds(prev => Array.from(new Set([...prev, ...ids])));
        } else if (activeTool === 'Specchio' && specchioState === 'objects') {
            setSpecchioSelectedIds(prev => {
                const newIds = ids.filter(id => id !== specchioFinalAxis?.entityId);
                return Array.from(new Set([...prev, ...newIds]));
            });
        }
        if (ids.length > 0 && activeTool === 'Select' && onSelectionComplete) {
            setFlashIds(ids);
            onSelectionComplete(ids, { x: e.clientX, y: e.clientY });
        }
        setSelectionWindow(null);
        return;
    }

    if ((activeTool === 'Move' || activeTool === 'Copy' || activeTool === 'Testo') && dragEntityIdRef.current) {
        if (activeTool === 'Copy' || activeTool === 'Move') {
            // In Copy and Move mode, dropping is handled entirely by clicking (mousedown).
            // On mouseup, we must not clear the dragging to support standard sticky move/copy.
            return;
        }
        setDragEntityId(null);
        dragEntityIdRef.current = null;
        setActiveMoveSnapPoint(null);
        setEntities(prev => prev);
        return;
    }

    if (activeTool === 'Camera' && drawing && drawing.type === 'camera') {
        const dx = drawing.current!.x - drawing.start.x;
        const dy = drawing.current!.y - drawing.start.y;
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (dx === 0 && dy === 0) angle = 0; // Default angle if just clicked
        const newEntity: CameraEntity = {
            id: `camera-${Date.now()}`,
            type: 'camera',
            point: drawing.start,
            angle: angle,
            color: defaultLineStyle.color,
            lineWidth: defaultLineStyle.lineWidth,
            layer: activeLayerId
        };
        setEntities(prev => [...prev, newEntity]);
        setDrawing(null);
        if (!isContinuousMode) setActiveTool?.('Select');
        return;
    }

    if (activeTool === 'Gomma') {
        setEntities(prev => prev);
    } else if (positioningDimId) {
        setPositioningDimId(null);
        setEntities(prev => prev);
    }
  };

  const confirmJoin = () => {
    if (activeTool === 'Join' && dragEntityIds.length > 0) {
        let joinedSuccessfully = false;
        setEntities(prev => {
            const selectedLines = prev.filter(e => dragEntityIds.includes(e.id) && e.type === 'line') as LineEntity[];
            const otherEntities = prev.filter(e => !dragEntityIds.includes(e.id) || e.type !== 'line');
            
            const mergedLines: LineEntity[] = [];
            const processed = new Set<string>();
            const eps = 2.0;
            const dist = (p1: Point, p2: Point) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
            
            const isCollinear = (l1: LineEntity, l2: LineEntity) => {
                const v1 = { x: l1.end.x - l1.start.x, y: l1.end.y - l1.start.y };
                const v2 = { x: l2.end.x - l2.start.x, y: l2.end.y - l2.start.y };
                const len1 = Math.hypot(v1.x, v1.y);
                const len2 = Math.hypot(v2.x, v2.y);
                if (len1 < 1e-5 || len2 < 1e-5) return false;
                const u1 = { x: v1.x / len1, y: v1.y / len1 };
                const u2 = { x: v2.x / len2, y: v2.y / len2 };
                const cross = Math.abs(u1.x * u2.y - u1.y * u2.x);
                return cross < 0.05;
            };

            if (selectedLines.length > 0) {
                let remaining = [...selectedLines];
                
                while (remaining.length > 0) {
                    let currentChain: LineEntity[] = [remaining[0]];
                    processed.add(remaining[0].id);
                    remaining.splice(0, 1);
                    
                    let changed = true;
                    while (changed && remaining.length > 0) {
                        changed = false;
                        for (let i = 0; i < remaining.length; i++) {
                            const candidate = remaining[i];
                            if (processed.has(candidate.id)) continue;

                            const first = currentChain[0];
                            const last = currentChain[currentChain.length - 1];

                            if (isCollinear(first, candidate)) {
                                if (dist(first.start, candidate.end) < eps) {
                                    currentChain.unshift(candidate);
                                    processed.add(candidate.id);
                                    remaining.splice(i, 1);
                                    changed = true;
                                    break;
                                } else if (dist(first.start, candidate.start) < eps) {
                                    const revCandidate = { ...candidate, start: candidate.end, end: candidate.start };
                                    currentChain.unshift(revCandidate);
                                    processed.add(candidate.id);
                                    remaining.splice(i, 1);
                                    changed = true;
                                    break;
                                }
                            }
                            if (isCollinear(last, candidate)) {
                                if (dist(last.end, candidate.start) < eps) {
                                    currentChain.push(candidate);
                                    processed.add(candidate.id);
                                    remaining.splice(i, 1);
                                    changed = true;
                                    break;
                                } else if (dist(last.end, candidate.end) < eps) {
                                    const revCandidate = { ...candidate, start: candidate.end, end: candidate.start };
                                    currentChain.push(revCandidate);
                                    processed.add(candidate.id);
                                    remaining.splice(i, 1);
                                    changed = true;
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (currentChain.length > 1) {
                        const newJoinedLine: LineEntity = {
                            id: Date.now().toString() + Math.random().toString(36).substring(2,9),
                            type: 'line',
                            start: currentChain[0].start,
                            end: currentChain[currentChain.length - 1].end,
                            color: currentChain[0].color,
                            lineWidth: currentChain[0].lineWidth,
                            layer: currentChain[0].layer,
                            dashed: currentChain[0].dashed,
                            lineType: currentChain[0].lineType
                        };
                        mergedLines.push(newJoinedLine);
                        joinedSuccessfully = true;
                    } else {
                        mergedLines.push(currentChain[0]);
                    }
                }
            }
            
            // Trova tutti gli oggetti che facevano parte della selezione 
            // e che non sono stati uniti in una singola linea, più le nuove linee unite.
            const newGroupId = Date.now().toString();
            const flashList: string[] = [];
            
            const finalEntities = prev.map(ent => {
                // Se l'entità era tra quelle selezionate
                if (dragEntityIds.includes(ent.id) && ent.type !== 'line') {
                    flashList.push(ent.id);
                    return { ...ent, groupId: newGroupId };
                }
                return ent;
            }).filter(e => !dragEntityIds.includes(e.id) || e.type !== 'line');
            
            // Aggiungi le linee unite (o non unite) con il nuovo groupId
            mergedLines.forEach(l => {
                flashList.push(l.id);
                // Assign group ID if we didn't perfectly merge all of them into one single item, 
                // or if we did but there are other objects as well.
                // Actually, just group them anyway! It does no harm.
                finalEntities.push({ ...l, groupId: newGroupId });
            });
            
            setFlashIds(flashList);

            return finalEntities;
        });

        setDragEntityIds([]);
        return true;
    }
    return false;
  };

  useEffect(() => {
    if (selectedEntityId) {
      const ent = entities.find(e => e.id === selectedEntityId);
      if (ent && ent.type === 'hatch') {
        setFlashIds([selectedEntityId]);
      }
    }
  }, [selectedEntityId, entities]);

  useEffect(() => {
    if (flashIds.length === 0) {
        setFlashIntensity(0);
        return;
    }

    let start: number | null = null;
    const duration = 1500; // 3 pulses of 500ms
    let animationFrame: number;

    const animate = (time: number) => {
        if (!start) start = time;
        const elapsed = time - start;
        
        if (elapsed < duration) {
            // Standard sine wave for pulses, shifted to [0, 1]
            // We want 3 pulses in 1500ms -> frequency should result in 3 peaks.
            // sin(x) has period 2*pi. In 1500ms we want 3 periods -> 1 period per 500ms.
            const phase = (elapsed / 500) * 2 * Math.PI;
            const intensity = (Math.sin(phase - Math.PI / 2) + 1) / 2;
            setFlashIntensity(intensity);
            animationFrame = requestAnimationFrame(animate);
        } else {
            setFlashIntensity(0);
            setFlashIds([]);
        }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [flashIds]);

  const initiateCloneAndDrag = (sourceIdsToClone: string[], startPoint?: Point, destinationHoverPoint?: Point) => {
      const originalEntitiesToClone = entities.filter(ent => sourceIdsToClone.includes(ent.id));
      const idMap: { [oldId: string]: string } = {};
      let oldGroupId: string | undefined = undefined;
      originalEntitiesToClone.forEach(ent => {
          idMap[ent.id] = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5);
          if (ent.groupId) oldGroupId = ent.groupId;
      });
      const newGroupId = oldGroupId ? 'g_cloned_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5) : undefined;
      
      const deltaX = (destinationHoverPoint && startPoint) ? (destinationHoverPoint.x - startPoint.x) : 0;
      const deltaY = (destinationHoverPoint && startPoint) ? (destinationHoverPoint.y - startPoint.y) : 0;

      const clones: Entity[] = originalEntitiesToClone.map(ent => {
          const cloned = fastCloneEntity(ent);
          cloned.id = idMap[ent.id];
          if (ent.groupId && newGroupId) cloned.groupId = newGroupId;
          
          if (Math.abs(deltaX) > 1e-6 || Math.abs(deltaY) > 1e-6) {
              if (cloned.type === 'line') {
                  cloned.start.x += deltaX;
                  cloned.start.y += deltaY;
                  cloned.end.x += deltaX;
                  cloned.end.y += deltaY;
                  if (cloned.isFreehand && (cloned as any).inkPoints) {
                      (cloned as any).inkPoints = (cloned as any).inkPoints.map((p: any) => ({ ...p, x: p.x + deltaX, y: p.y + deltaY }));
                  }
              } else if (cloned.type === 'circle') {
                  cloned.center.x += deltaX;
                  cloned.center.y += deltaY;
              } else if (cloned.type === 'rectangle') {
                  cloned.p1.x += deltaX;
                  cloned.p1.y += deltaY;
                  cloned.p2.x += deltaX;
                  cloned.p2.y += deltaY;
              } else if (cloned.type === 'hatch') {
                  const h = cloned as any;
                  if (h.points) {
                      h.points = h.points.map((p: Point) => ({ x: p.x + deltaX, y: p.y + deltaY }));
                  }
              } else if (cloned.type === 'point' || cloned.type === 'text' || cloned.type === 'image') {
                  cloned.point.x += deltaX;
                  cloned.point.y += deltaY;
              } else if (cloned.type === 'arc') {
                  cloned.center.x += deltaX;
                  cloned.center.y += deltaY;
              } else if (cloned.type === 'dimension') {
                  cloned.start.x += deltaX;
                  cloned.start.y += deltaY;
                  cloned.end.x += deltaX;
                  cloned.end.y += deltaY;
              }

              // Generic check for points, bimPoints and holes
              if ((cloned as any).bimPoints) {
                  (cloned as any).bimPoints = (cloned as any).bimPoints.map((p: Point) => ({ x: p.x + deltaX, y: p.y + deltaY }));
              }
              if ((cloned as any).points && cloned.type !== 'hatch') {
                  (cloned as any).points = (cloned as any).points.map((p: Point) => ({ x: p.x + deltaX, y: p.y + deltaY }));
              }
              if ((cloned as any).holes) {
                  (cloned as any).holes = (cloned as any).holes.map((hole: Point[]) => hole.map((p: Point) => ({ x: p.x + deltaX, y: p.y + deltaY })));
              }
          }
          
          return cloned;
      });

      setEntities(prev => [...prev, ...clones]);

      const clonedIdsList = clones.map(c => c.id);
      setClonedEntityIds(prev => {
          const next = new Set(prev);
          clonedIdsList.forEach(id => next.add(id));
          return next;
      });
      setDragEntityIds(clonedIdsList);
      dragEntityIdsRef.current = clonedIdsList;
      setDragEntityId(clonedIdsList[0]);
      dragEntityIdRef.current = clonedIdsList[0];
      setSelectionWindow(null);
      const pt = destinationHoverPoint || startPoint || lastMouseRef.current;
      lastMouseRef.current = pt;
      previousMouseRef.current = pt;
      setActiveMoveSnapPoint(null);
      isStickyCopyRef.current = true;
      dragHasMovedRef.current = false;
  };

  const handleCopyToolAction = () => {
      const sourceIds = copySourceEntityIds.length > 0 
          ? copySourceEntityIds 
          : (selectedEntityIds.length > 0 ? selectedEntityIds : []);

      if (copyPhase === 'idle') {
          if (sourceIds.length > 0) {
              setCopySourceEntityIds(sourceIds);
              setCopyPhase('selectBasePoint');
              setStatusMessage("Ora clicca sul punto base.");
          } else {
              setStatusMessage("Nessun oggetto selezionato. Seleziona gli oggetti da copiare, poi premi destro o invio.");
          }
      } else if (copyPhase === 'selectBasePoint') {
          const snap = getSnappedPoint(lastMouseRef.current, entities, activeTool, null);
          const basePt = snap.snapped ? snap.point : lastMouseRef.current;
          setCopyBasePoint(basePt);
          if (sourceIds.length > 0) {
              initiateCloneAndDrag(sourceIds, basePt);
          }
          setCopyPhase('selectDestinationPoint');
          setStatusMessage("Clicca per incollare la copia (puoi trascinare o fare clic singoli). Premi Invio o Tasto Destro per concludere.");
      } else if (copyPhase === 'selectDestinationPoint' && copyBasePoint) {
          // Filter out the active, unplaced floating clones currently being dragged from the final entities state
          setEntities(prev => {
              const updated = prev.filter(ent => !clonedEntityIds.has(ent.id));
              return updated;
          });
          setClonedEntityIds(new Set());
          setCopyPhase('idle');
          setStatusMessage(null);
          setCopySourceEntityIds([]);
          setDragEntityId(null);
          dragEntityIdRef.current = null;
          setDragEntityIds([]);
          dragEntityIdsRef.current = [];
          setActiveMoveSnapPoint(null);
      }
  };

  const handleMoveToolAction = () => {
      const sourceIds = moveSourceEntityIds.length > 0 
          ? moveSourceEntityIds 
          : (selectedEntityIds.length > 0 ? selectedEntityIds : []);

      if (movePhase === 'idle') {
          if (sourceIds.length > 0) {
              setMoveSourceEntityIds(sourceIds);
              setMovePhase('selectBasePoint');
              setStatusMessage("Ora clicca sul punto base di spostamento.");
          } else {
              setStatusMessage("Nessun oggetto selezionato. Seleziona gli oggetti da spostare, poi premi destro o invio.");
          }
      } else if (movePhase === 'selectBasePoint') {
          // If the user right-clicks or presses enter while prompted for a base point,
          // they want to finish/cancel the move operation.
          setMovePhase('idle');
          setStatusMessage(null);
          setMoveSourceEntityIds([]);
          setDragEntityId(null);
          dragEntityIdRef.current = null;
          setDragEntityIds([]);
          dragEntityIdsRef.current = [];
          setActiveMoveSnapPoint(null);
          setMoveBasePoint(null);
      } else if (movePhase === 'selectDestinationPoint') {
          // Confirm movement at current position
          setEntities(prev => {
              onCommitHistory?.(prev);
              return [...prev];
          });
          setMovePhase('idle');
          setStatusMessage(null);
          setMoveSourceEntityIds([]);
          setDragEntityId(null);
          dragEntityIdRef.current = null;
          setDragEntityIds([]);
          dragEntityIdsRef.current = [];
          setActiveMoveSnapPoint(null);
          setMoveBasePoint(null);
      }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    virtualCursorOffsetRef.current = null;

    // Se siamo in modalità Trim, il tasto destro alterna tra Trim normale e Smart Trim
    if (activeTool === 'Trim') {
        setTrimMode(prev => prev === 'normal' ? 'smart' : 'normal');
        setHighlightedTrimLine(null);
        setHighlightedTrimSegment(null);
        setStatusMessage(trimMode === 'normal' ? "MODALITÀ SMART ACTIVATED (Pulisci Eccedenze)" : "MODALITÀ TRIM ACTIVATED (Forbici)");
        return;
    }

    // Se siamo in modalità Gomma, il clic col tasto destro cambia tipo di gomma
    if (activeTool === 'Gomma' && setEraserType) {
        setEraserType(prev => prev === 'pencil' ? 'all' : (prev === 'all' ? 'lametta' : 'pencil'));
        return;
    }



    // Se c'è il dialogo del testo aperto, il tasto destro conferma (OK)
    if (textDialog) {
        handleCommitText();
        setTextDialog(null);
        return;
    }

    // Se siamo nello stato di selezione oggetti per lo specchio, il tasto destro conferma
    if (activeTool === 'Specchio' && specchioState === 'objects' && specchioSelectedIds.length > 0) {
        confirmSpecchio(specchioMode);
        return;
    }

    // Se siamo nello stato di selezione oggetti per Copia, il testo destro conferma
    if (activeTool === 'Copy') {
        handleCopyToolAction();
        return;
    }

    // Se siamo nello stato di selezione oggetti per Sposta (Move), il tasto destro conferma
    if (activeTool === 'Move') {
        handleMoveToolAction();
        return;
    }

    // Comportamento Invio / Conferma (Enter) per altri stati (es. Join)
    if (activeTool === 'Join' && dragEntityIds.length > 1) {
        const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
        window.dispatchEvent(ev);
        return;
    }

    // Tasto destro = ESC (Annulla operazioni correnti o termina segmenti)
    if (drawing) {
        setDrawing(null);
        return;
    }

    // --- TECNIGRAFO SPECIAL MENU ---
    if (tecnigrafoOrigin) {
        return;
    }

    // ESC (Azzera selezioni e stati)
    onSelect(null);
    onContextMenu?.(e);
    setPositioningEntityId(null);
    setPositioningGroupId(null);
    setDragEntityIds([]);
    setDragEntityId(null);
    setSelectionWindow(null);
    
    setIsLocked(false);
    setLockedFocalPoint(null);
    setHighlightedTrimSegment(null);
    setSelectedParallelLine(null);
    setActiveMoveSnapPoint(null);

    setSelectedRaccordoLineIds([]);
    setSelectedRaccordoClickPoints([]);
    setSpecchioAxisPt1(null);
    setSpecchioHoverAxisLine(null);
    setSpecchioState('axis_start');
    setSpecchioSelectedIds([]);
    setCopySourceEntityIds([]);
    setClonedEntityIds(new Set());
    isStickyCopyRef.current = false;
    
    // Propaga anche l'evento per listener globali
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (dragTavolaIdRef.current) {
        setDragTavolaId(null);
        dragTavolaIdRef.current = null;
      }
      if (dragEntityIdRef.current && (isJollyActive || isMagicCopyActive || isMagicCopyActiveRef.current || activeTool === 'Move') && dragHasMovedRef.current) {
        setClonedEntityIds(new Set());
        setDragEntityId(null);
        dragEntityIdRef.current = null;
        setDragEntityIds([]);
        dragEntityIdsRef.current = [];
        setActiveMoveSnapPoint(null);
        setMoveBasePoint(null);
        setMovePhase('idle');
        dragHasMovedRef.current = false;
        setEntities(prev => { 
          onCommitHistory?.(prev); 
          return [...prev]; 
        });
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('pointerup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('pointerup', handleGlobalMouseUp);
    };
  }, [dragEntityId, activeTool, isJollyActive, isMagicCopyActive, onCommitHistory, dragTavolaId]);

  useEffect(() => {
    const isSpostaTuttoKey = (e: KeyboardEvent) => {
        return e.key === '<' || e.key === '>' || e.code === 'IntlBackslash' || e.key === 'Tab';
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        // 1. SPOSTA TUTTO: Tasto < > (a destra di Bloc Fn / Shift) o Tab — SOLO SPOSTA L'OGGETTO
        if (isSpostaTuttoKey(e)) {
            e.preventDefault();
            if (!isJollyActiveRef.current) {
                setDrawing(null);
                setIsJollyActive(true);
                isJollyActiveRef.current = true;
                // Se il mouse è già sopra un oggetto (o c'è un oggetto selezionato), inizia subito a spostarlo col movimento del mouse!
                if (!dragEntityIdRef.current) {
                    const hovered = getEntityAtPoint(actualMousePosRef.current, 30);
                    const targetIds = hovered
                        ? resolveGroups([hovered.id], entitiesRef.current)
                        : (selectedEntityIds.length > 0
                            ? resolveGroups(selectedEntityIds, entitiesRef.current)
                            : (selectedEntityId ? resolveGroups([selectedEntityId], entitiesRef.current) : []));
                    if (targetIds.length > 0) {
                        const primaryId = hovered ? hovered.id : targetIds[0];
                        setDragEntityIds(targetIds);
                        dragEntityIdsRef.current = targetIds;
                        setDragEntityId(primaryId);
                        dragEntityIdRef.current = primaryId;
                        setDragOffset({ x: actualMousePosRef.current.x, y: actualMousePosRef.current.y });
                        lastMouseRef.current = actualMousePosRef.current;
                        previousMouseRef.current = actualMousePosRef.current;
                        dragHasMovedRef.current = false;
                    }
                }
                renderRef.current?.();
            }
            return;
        }

        // 1b. TASTO MAGICO Z: Copia gli oggetti e li sposta pure!
        if (e.key.toLowerCase() === 'z' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (!isMagicCopyActiveRef.current) {
                setDrawing(null);
                setIsMagicCopyActive(true);
                isMagicCopyActiveRef.current = true;
                // Se il mouse è già sopra un oggetto (o c'è un oggetto selezionato), lo clona subito e inizia a spostare la copia col movimento del mouse!
                if (!dragEntityIdRef.current) {
                    const hovered = getEntityAtPoint(actualMousePosRef.current, 30);
                    const targetIds = hovered
                        ? resolveGroups([hovered.id], entitiesRef.current)
                        : (selectedEntityIds.length > 0
                            ? resolveGroups(selectedEntityIds, entitiesRef.current)
                            : (selectedEntityId ? resolveGroups([selectedEntityId], entitiesRef.current) : []));
                    if (targetIds.length > 0) {
                        onCommitHistory?.(entitiesRef.current);
                        initiateCloneAndDrag(targetIds, actualMousePosRef.current);
                    }
                }
                renderRef.current?.();
            }
            return;
        }

        // 2. FORBICE (Trim): Tasto Ctrl - immediato, certo e stabile
        if (e.key === 'Control' && !e.repeat) {
            setDrawing(null);
            setIsJollyActive(false);
            setIsMagicCopyActive(false);
            isMagicCopyActiveRef.current = false;
            setDragEntityId(null);
            dragEntityIdRef.current = null;
            setDragEntityIds([]);
            dragEntityIdsRef.current = [];
            if (activeTool !== 'Trim') {
                setActiveTool?.('Trim');
                setStatusMessage("Forbice (Taglia) attiva");
                renderRef.current?.();
            }
            return;
        }

        // 3. BLOC FN (Shift / CapsLock / Bloc Maiusc / Fn / F):
        // - Se premuto insieme a Sposta Tutto (< >) o Copia Magica (Z) o mentre si trascina un oggetto, attiva il vincolo ORTOGONALE / PARALLELO
        // - Se premuto da solo (anche in modalità Forbice / Trim!), va SEMPRE immediatamente in modalità Pennino (Line) oltre ad attivare Orto e Snap essenziali!
        const keyLower = (e.key || '').toLowerCase();
        const isBlocFnKey =
            e.key === 'Shift' ||
            e.code === 'ShiftLeft' ||
            e.code === 'ShiftRight' ||
            e.key === 'CapsLock' ||
            e.code === 'CapsLock' ||
            e.keyCode === 20 ||
            (e as any).which === 20 ||
            e.key === 'Fn' ||
            e.code === 'Fn' ||
            e.key === 'FnLock' ||
            e.code === 'FnLock' ||
            e.key === 'ShiftLock' ||
            keyLower === 'f';
        if (isBlocFnKey) {
            setIsShiftPressed(true);
            isShiftPressedRef.current = true;
            if (!isJollyActive && !isMagicCopyActiveRef.current && !dragEntityIdRef.current) {
                if (activeTool !== 'Line') {
                    setDrawing(null);
                    setSelectedParallelLine(null);
                    setHighlightedTrimLine(null);
                    setHighlightedTrimSegment(null);
                    setMovePhase('idle');
                    setCopyPhase('idle');
                    setActiveTool?.('Line');
                    setStatusMessage("Pennino (Linea) attivo");
                }
                // Immediately compute essential snaps (inclusi incroci!) at current mouse position when Bloc Fn is pressed
                if (actualMousePosRef.current) {
                    const immediateSnap = getSnappedPoint(actualMousePosRef.current, entitiesRef.current, 'Line', drawing);
                    setHoverSnap(immediateSnap && immediateSnap.snapped ? immediateSnap : null);
                }
                renderRef.current?.();
                return;
            }
        }

        if (e.repeat) return;

        // Lettera C per attivare il Cerchio
        if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
            setDrawing(null);
            setActiveTool?.('Circle');
            setStatusMessage("Strumento Cerchio attivato");
            return;
        }

        // Tasto Invio come conferma (come tasto destro)
        if (e.key === 'Enter') {
            if (activeTool === 'Copy') {
                handleCopyToolAction();
                return;
            } else if (activeTool === 'Move') {
                handleMoveToolAction();
                return;
            }
        }
        
        // Frecce per muovere il punto
        if ((activeTool === 'Line' || activeTool === 'Filo') && drawing) {
            const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
            if (keys.includes(e.key)) {
                const step = isJollyActive ? 0.1 : 1;
                let change = { x: 0, y: 0 };
                if (e.key === 'ArrowRight') change = { x: step, y: 0 };
                else if (e.key === 'ArrowLeft') change = { x: -step, y: 0 };
                else if (e.key === 'ArrowDown') change = { x: 0, y: step };
                else if (e.key === 'ArrowUp') change = { x: 0, y: -step };
                
                if (change.x !== 0 || change.y !== 0) {
                    e.preventDefault();
                    setDrawing(prev => {
                        if (!prev) return null;
                        
                        const effectiveOrtho = getEffectiveOrtho(e, true);
                        
                        let nextX = prev.current.x + change.x;
                        let nextY = prev.current.y + change.y;
                        
                        if (effectiveOrtho) {
                            const dxPrevious = prev.current.x - prev.start.x;
                            const dyPrevious = prev.current.y - prev.start.y;
                            const dist = Math.sqrt(dxPrevious * dxPrevious + dyPrevious * dyPrevious);

                            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                                if (Math.abs(dyPrevious) > Math.abs(dxPrevious) && dist > 0) {
                                    nextX = prev.start.x + (e.key === 'ArrowRight' ? dist : -dist);
                                }
                                nextY = prev.start.y;
                            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                if (Math.abs(dxPrevious) > Math.abs(dyPrevious) && dist > 0) {
                                    nextY = prev.start.y + (e.key === 'ArrowDown' ? dist : -dist);
                                }
                                nextX = prev.start.x;
                            }
                        }
                        
                        return { ...prev, current: { x: nextX, y: nextY } };
                    });
                    return;
                }
            }
        }

        if (e.key === 'Escape') {
            virtualCursorOffsetRef.current = null;
            setDrawing(null);
            setLiveNumericOverride(null);
            setManualRoomPoints([]);
            setIsLocked(false);
            setLockedFocalPoint(null);
            setTecnigrafoLock(null);
            setTecnigrafoOrigin(null);
            setHighlightedTrimSegment(null);
            setSelectedParallelLine(null);
            setActiveMoveSnapPoint(null);
            setDragEntityIds([]);
            dragEntityIdsRef.current = [];
            setDragEntityId(null);
            dragEntityIdRef.current = null;
            setIsJollyActive(false);

            setIsParallelWheelActive(false);
            if (activeTool === 'Copy') {
                if (clonedEntityIds.size > 0) {
                    setEntities(prev => prev.filter(ent => !clonedEntityIds.has(ent.id)));
                    setClonedEntityIds(new Set());
                }
                setCopyPhase('idle');
                setCopySourceEntityIds([]);
            }
            if (activeTool === 'Move') {
                setMovePhase('idle');
                setMoveSourceEntityIds([]);
                setMoveBasePoint(null);
                setStatusMessage(null);
            }
            if (activeTool === 'Specchio') {
                setSpecchioState('axis_start');
                setSpecchioAxisPt1(null);
                setSpecchioFinalAxis(null);
                setSpecchioHoverAxisLine(null);
                setSpecchioSelectedIds([]);
                setSpecchioMode('copy');
                setShowSpecchioDialog(false);
            }
        } else if (e.key.toLowerCase() === 'q') {
            // MAGIC KEY: Activates Drafting Machine (Tecnigrafo)
            if (!tecnigrafoOrigin) {
                const origin = activeMoveSnapPoint || hoverSnap?.point || actualMousePosRef.current;
                setTecnigrafoOrigin({ ...origin });
                setLockedFocalPoint({ ...origin });
                setTecnigrafoLock(null); 
                
                // Show Squadrette and hide L-rulers
                setShowSquadrette(true);
                setSquadrette([
                    { id: 'sq1', type: '45', pos: { x: origin.x - 150, y: origin.y - 150 }, rotation: 0 },
                    { id: 'sq2', type: '3060', pos: { x: origin.x + 50, y: origin.y - 150 }, rotation: 0 }
                ]);

                // Automatic setup: Line tool with NO Ortho
                setActiveTool?.('Line');
                setOrthoMode?.(false);
            }
        } else if (e.key === 'Enter' && (liveNumericOverrideRef.current?.kind === 'parallel_dist' || liveNumericOverrideRef.current?.kind === 'line_length')) {
            e.preventDefault();
            onCommitHistory?.(entitiesRef.current);
            setLiveNumericOverride(null);
            if (dragEntityIdRef.current) {
                setDragEntityId(null);
                dragEntityIdRef.current = null;
                setDragEntityIds([]);
                dragEntityIdsRef.current = [];
            }
        } else if (e.key === 'Enter') {
            if (activeTool === 'Join') {
                confirmJoin();
            } else if ((activeTool === 'Line' || activeTool === 'Filo') && drawing) {
                e.preventDefault();
                setLiveNumericOverride(null);
                const isTrad = activeTool === 'Line' && (drawing.isTraditionalSegment || defaultLineStyle.mode === 'ink' || defaultLineStyle.mode === 'pencil');
                const finalPoint = isTrad ? (drawing.maxPoint || drawing.current) : drawing.current;
                const newEntity: Entity = {
                    id: Date.now().toString(),
                    type: 'line',
                    color: activeTool === 'Filo' ? (defaultFiloColor || '#ff5500') : defaultLineStyle.color,
                    lineWidth: activeTool === 'Filo' ? 1.5 : defaultLineStyle.lineWidth,
                    dashed: activeTool === 'Filo' ? false : defaultLineStyle.dashed,
                    lineType: activeTool === 'Filo' ? 'continuous' : defaultLineStyle.lineType,
                    mode: activeTool === 'Filo' ? 'CAD' : defaultLineStyle.mode,
                    start: drawing.start,
                    end: finalPoint,
                    layer: activeTool === 'Filo' ? 'Fili' : activeLayerId,
                    isFilo: activeTool === 'Filo',
                    isFreehand: false,
                } as any;
                
                const segLen = Math.hypot(finalPoint.x - drawing.start.x, finalPoint.y - drawing.start.y);
                if (segLen > 0.01) {
                    lastSegmentRef.current = { start: drawing.start, end: finalPoint, length: segLen, id: newEntity.id };
                    onLastParameterChange?.({ type: 'length', value: parseFloat((segLen / 100).toFixed(2)), isAutoFromDrawing: true });
                }
                
                setEntities(prev => {
                    onCommitHistory?.(prev);
                    if (newEntity.type === 'line' && !newEntity.isBIM && !(newEntity as any).isFilo) {
                        return mergeLineSegments(prev, newEntity as LineEntity);
                    }
                    return [...prev, newEntity];
                });
                
                if (isTrad) {
                    // In China / Matita mode, confirming lifts the pen off the paper
                    setDrawing(null);
                } else {
                    // In CAD mode, start next chained segment
                    setDrawing({ 
                        start: finalPoint, 
                        current: finalPoint, 
                        snapType: undefined, 
                        startSnapped: true,
                        isVirtual: false,
                        isFreehand: false
                    });
                }

            }
        } else {
            let typedChar: string | null = null;
            if (/^[0-9\.,]$/.test(e.key)) {
                typedChar = e.key === ',' ? '.' : e.key;
            } else if (e.code.startsWith('Digit')) {
                typedChar = e.code.replace('Digit', '');
            } else if (e.code.startsWith('Numpad') && !isNaN(Number(e.code.replace('Numpad', '')))) {
                typedChar = e.code.replace('Numpad', '');
            } else if (e.code === 'Period' || e.code === 'Comma' || e.code === 'NumpadDecimal' || e.code === 'NumpadComma') {
                typedChar = '.';
            }

            const isBackspace = e.key === 'Backspace';
            const now = Date.now();

            // 1. DIRECT KEYBOARD NUMERIC OVERRIDE FOR PARALLEL DISTANCE BADGE
            const activePair = activeParallelPairRef.current;
            const existingParallelOverride =
                liveNumericOverrideRef.current?.kind === 'parallel_dist' &&
                (now - liveNumericOverrideRef.current.timestamp < 4000)
                    ? liveNumericOverrideRef.current
                    : null;

            if ((typedChar !== null || isBackspace) && !drawing && (activePair || existingParallelOverride)) {
                e.preventDefault();
                const targetLineId = activePair?.lineId || existingParallelOverride!.lineId!;
                const refLineId = activePair?.refLineId || existingParallelOverride!.refLineId!;
                const nx = activePair ? activePair.nx : existingParallelOverride!.nx!;
                const ny = activePair ? activePair.ny : existingParallelOverride!.ny!;
                const dirFromRefToLine = existingParallelOverride?.dirFromRefToLine !== undefined
                    ? existingParallelOverride.dirFromRefToLine
                    : (activePair && activePair.signedDist >= 0 ? -1 : 1);

                const prevText = (existingParallelOverride && existingParallelOverride.lineId === targetLineId && (now - existingParallelOverride.timestamp < 2500))
                    ? existingParallelOverride.text
                    : '';
                const nextText = isBackspace ? prevText.slice(0, -1) : (prevText + (typedChar || ''));

                setLiveNumericOverride({
                    kind: 'parallel_dist',
                    text: nextText,
                    lineId: targetLineId,
                    refLineId,
                    nx,
                    ny,
                    dirFromRefToLine,
                    timestamp: now
                });

                const parsedDist = parseFloat(nextText.replace(',', '.'));
                if (!isNaN(parsedDist) && parsedDist >= 0) {
                    if (parsedDist > 0) {
                        dragHasMovedRef.current = true;
                        lastParallelOffsetInfoRef.current = {
                            distance: parsedDist,
                            lineId: targetLineId,
                            refLineId,
                            nx,
                            ny,
                            dirSign: dirFromRefToLine,
                            timestamp: now
                        };
                        justOffsetLineIdRef.current = targetLineId;
                        parallelOverrideLockedLineRef.current = {
                            lineId: targetLineId,
                            mousePosAtLock: { ...actualMousePosRef.current },
                            timestamp: now
                        };
                        try {
                            localStorage.setItem('lastParallelDistance', parsedDist.toString());
                        } catch (err) {}
                    }
                    setEntities(prev => {
                        const movingLine = prev.find(el => el.id === targetLineId && el.type === 'line') as LineEntity | undefined;
                        const refLine = prev.find(el => el.id === refLineId && el.type === 'line') as LineEntity | undefined;
                        if (!movingLine || !refLine) return prev;

                        // Signed distance along (nx, ny) from movingLine to refLine:
                        const currentSignedD = (refLine.start.x - movingLine.start.x) * nx + (refLine.start.y - movingLine.start.y) * ny;
                        const currentDist = Math.abs(currentSignedD);
                        // Move movingLine along normal so distance to refLine becomes parsedDist on the same side
                        const sideSign = currentSignedD >= 0 ? 1 : -1;
                        const deltaAlongNormal = currentSignedD - sideSign * parsedDist;
                        const shiftX = nx * deltaAlongNormal;
                        const shiftY = ny * deltaAlongNormal;

                        if (Math.abs(currentDist - parsedDist) < 1e-6) return prev;

                        const idsToMove = dragEntityIdsRef.current.includes(targetLineId) && dragEntityIdsRef.current.length > 0
                            ? dragEntityIdsRef.current
                            : [targetLineId];

                        return prev.map(ent => {
                            if (!idsToMove.includes(ent.id)) return ent;
                            if (ent.type === 'line') {
                                return {
                                    ...ent,
                                    start: { x: ent.start.x + shiftX, y: ent.start.y + shiftY },
                                    end: { x: ent.end.x + shiftX, y: ent.end.y + shiftY },
                                    inkPoints: ent.inkPoints?.map(pt => ({ ...pt, x: pt.x + shiftX, y: pt.y + shiftY }))
                                };
                            }
                            return ent;
                        });
                    });
                }
                return;
            }

            // 2. DIRECT KEYBOARD NUMERIC OVERRIDE WHILE DRAWING A LINE (L = ...)
            if ((typedChar !== null || isBackspace) && drawing && (activeTool === 'Line' || (activeTool as string) === 'Filo' || activeTool === 'Dimension')) {
                e.preventDefault();
                const existingLineOverride =
                    liveNumericOverrideRef.current?.kind === 'drawing_line' &&
                    (now - liveNumericOverrideRef.current.timestamp < 3500)
                        ? liveNumericOverrideRef.current
                        : null;
                const prevText = existingLineOverride ? existingLineOverride.text : '';
                const nextText = isBackspace ? prevText.slice(0, -1) : (prevText + (typedChar || ''));

                if (!nextText) {
                    setLiveNumericOverride(null);
                    setDrawing(prev => prev ? { ...prev, wheelLength: undefined } : null);
                    return;
                }

                setLiveNumericOverride({
                    kind: 'drawing_line',
                    text: nextText,
                    timestamp: now
                });

                const parsedLen = parseFloat(nextText.replace(',', '.'));
                if (!isNaN(parsedLen) && parsedLen > 0) {
                    setDrawing(prev => {
                        if (!prev) return null;
                        const refPt = prev.maxPoint || prev.current;
                        const dx = refPt.x - prev.start.x;
                        const dy = refPt.y - prev.start.y;
                        const curLen = Math.hypot(dx, dy);
                        const ux = prev.lockedDir ? prev.lockedDir.x : (curLen > 0.0001 ? dx / curLen : 1);
                        const uy = prev.lockedDir ? prev.lockedDir.y : (curLen > 0.0001 ? dy / curLen : 0);
                        const targetPt = {
                            x: prev.start.x + ux * parsedLen,
                            y: prev.start.y + uy * parsedLen
                        };
                        return {
                            ...prev,
                            wheelLength: parsedLen,
                            current: targetPt,
                            maxPoint: prev.isTraditionalSegment ? targetPt : prev.maxPoint,
                            maxLength: prev.isTraditionalSegment ? parsedLen : prev.maxLength
                        };
                    });
                }
                return;
            }

            // 3. PARALLEL TOOL DIRECT NUMERIC INPUT
            if ((typedChar !== null || isBackspace) && activeTool === 'Parallel') {
                e.preventDefault();
                if (!selectedParallelLine && hoveredLineId) {
                    const hLine = entities.find(el => el.id === hoveredLineId && el.type === 'line') as LineEntity | undefined;
                    if (hLine) setSelectedParallelLine(hLine);
                }
                if (isBackspace) {
                    setParallelInputString(prev => {
                        const next = prev.slice(0, -1);
                        const parsed = parseFloat(next);
                        if (!isNaN(parsed) && parsed > 0) {
                            setParallelDistance(parsed);
                        }
                        return next;
                    });
                    setIsParallelWheelActive(true);
                } else if (typedChar) {
                    setParallelInputString(prev => {
                        const next = (prev === '0' || prev === '') ? typedChar : prev + typedChar;
                        const parsed = parseFloat(next);
                        if (!isNaN(parsed) && parsed > 0) {
                            setParallelDistance(parsed);
                        }
                        return next;
                    });
                    setIsParallelWheelActive(true);
                }
                return;
            }

            // 4. DIRECT MANUAL CORRECTION OF SELECTED SEGMENT LENGTH (L = ...)
            const targetLenLineId = selectedEntityId;
            const existingLenOverride =
                liveNumericOverrideRef.current?.kind === 'line_length' &&
                (now - liveNumericOverrideRef.current.timestamp < 4000)
                    ? liveNumericOverrideRef.current
                    : null;

            if (!quickEditEntityId && (targetLenLineId || existingLenOverride) && !drawing && (typedChar !== null || isBackspace)) {
                const lineIdToEdit = targetLenLineId || existingLenOverride!.lineId!;
                const line = entities.find(el => el.id === lineIdToEdit && el.type === 'line') as LineEntity | undefined;
                if (line) {
                    e.preventDefault();
                    const prevText = (existingLenOverride && existingLenOverride.lineId === lineIdToEdit && (now - existingLenOverride.timestamp < 2500))
                        ? existingLenOverride.text
                        : '';
                    const nextText = isBackspace ? prevText.slice(0, -1) : (prevText + (typedChar || ''));

                    setLiveNumericOverride({
                        kind: 'line_length',
                        text: nextText,
                        lineId: lineIdToEdit,
                        timestamp: now
                    });

                    const parsedLen = parseFloat(nextText.replace(',', '.'));
                    if (!isNaN(parsedLen) && parsedLen > 0) {
                        setEntities(prev => prev.map(ent => {
                            if (ent.id !== lineIdToEdit || ent.type !== 'line') return ent;
                            const l = ent as LineEntity;
                            const dx = l.end.x - l.start.x;
                            const dy = l.end.y - l.start.y;
                            const curL = Math.hypot(dx, dy);
                            if (curL < 0.0001) return ent;
                            const ux = dx / curL;
                            const uy = dy / curL;
                            return {
                                ...l,
                                end: {
                                    x: l.start.x + ux * parsedLen,
                                    y: l.start.y + uy * parsedLen
                                }
                            };
                        }));
                    }
                }
            }
        }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
        if (isSpostaTuttoKey(e)) {
            setIsJollyActive(false);
            isJollyActiveRef.current = false;
            if (dragEntityIdRef.current) {
                const moved = dragHasMovedRef.current;
                const activePair = activeParallelPairRef.current;
                if (moved && activePair && activePair.lineId === dragEntityIdRef.current && activePair.currentDist > 0.05) {
                    lastParallelOffsetInfoRef.current = {
                        distance: activePair.currentDist,
                        lineId: activePair.lineId,
                        refLineId: activePair.refLineId,
                        nx: activePair.nx,
                        ny: activePair.ny,
                        dirSign: activePair.signedDist >= 0 ? -1 : 1,
                        timestamp: Date.now()
                    };
                    justOffsetLineIdRef.current = activePair.lineId;
                    try {
                        localStorage.setItem('lastParallelDistance', activePair.currentDist.toString());
                    } catch (err) {}
                }
                parallelOverrideLockedLineRef.current = null;
                setDragEntityId(null);
                dragEntityIdRef.current = null;
                setDragEntityIds([]);
                dragEntityIdsRef.current = [];
                setActiveMoveSnapPoint(null);
                setMoveBasePoint(null);
                setMovePhase('idle');
                dragHasMovedRef.current = false;
                if (moved) {
                    setEntities(prev => {
                        onCommitHistory?.(prev);
                        return [...prev];
                    });
                }
            }
            renderRef.current?.();
        }

        if (e.key.toLowerCase() === 'z') {
            setIsMagicCopyActive(false);
            isMagicCopyActiveRef.current = false;
            if (dragEntityIdRef.current) {
                const moved = dragHasMovedRef.current;
                const activePair = activeParallelPairRef.current;
                if (moved && activePair && activePair.lineId === dragEntityIdRef.current && activePair.currentDist > 0.05) {
                    lastParallelOffsetInfoRef.current = {
                        distance: activePair.currentDist,
                        lineId: activePair.lineId,
                        refLineId: activePair.refLineId,
                        nx: activePair.nx,
                        ny: activePair.ny,
                        dirSign: activePair.signedDist >= 0 ? -1 : 1,
                        timestamp: Date.now()
                    };
                    justOffsetLineIdRef.current = activePair.lineId;
                    try {
                        localStorage.setItem('lastParallelDistance', activePair.currentDist.toString());
                    } catch (err) {}
                }
                parallelOverrideLockedLineRef.current = null;
                setDragEntityId(null);
                dragEntityIdRef.current = null;
                setDragEntityIds([]);
                dragEntityIdsRef.current = [];
                setActiveMoveSnapPoint(null);
                dragHasMovedRef.current = false;
                if (moved) {
                    setClonedEntityIds(new Set());
                    setEntities(prev => {
                        onCommitHistory?.(prev);
                        return [...prev];
                    });
                } else {
                    // Se il tasto Z è stato rilasciato senza muovere la copia, rimuoviamo il clone rimasto sovrapposto
                    setEntities(prev => prev.filter(ent => !clonedEntityIds.has(ent.id)));
                    setClonedEntityIds(new Set());
                }
            }
            renderRef.current?.();
        }

        const keyUpLower = (e.key || '').toLowerCase();
        const isBlocFnKey =
            e.key === 'Shift' ||
            e.code === 'ShiftLeft' ||
            e.code === 'ShiftRight' ||
            e.key === 'CapsLock' ||
            e.code === 'CapsLock' ||
            e.keyCode === 20 ||
            (e as any).which === 20 ||
            e.key === 'Fn' ||
            e.code === 'Fn' ||
            e.key === 'FnLock' ||
            e.code === 'FnLock' ||
            e.key === 'ShiftLock' ||
            keyUpLower === 'f';
        if (isBlocFnKey) {
            setIsShiftPressed(false);
            isShiftPressedRef.current = false;
            if (
                !isJollyActive &&
                !isMagicCopyActiveRef.current &&
                !dragEntityIdRef.current &&
                activeTool !== 'Line'
            ) {
                setDrawing(null);
                setSelectedParallelLine(null);
                setHighlightedTrimLine(null);
                setHighlightedTrimSegment(null);
                setMovePhase('idle');
                setCopyPhase('idle');
                setActiveTool?.('Line');
                setStatusMessage("Pennino (Linea) attivo");
            }
            if (!snapEnabled) {
                setHoverSnap(null);
            } else if (actualMousePosRef.current) {
                const updatedSnap = getSnappedPoint(actualMousePosRef.current, entitiesRef.current, 'Line', drawing);
                setHoverSnap(updatedSnap && updatedSnap.snapped ? updatedSnap : null);
            }
            renderRef.current?.();
        }

        if (e.key.toLowerCase() === 'q') {
            setTecnigrafoLock(null);
            setTecnigrafoOrigin(null);
            setLockedFocalPoint(null);
            setShowSquadrette(false);
            setSquadrette([]);
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeTool, isJollyActive, isMagicCopyActive, clonedEntityIds, dragEntityIds, entities, selectedParallelLine, orthoMode, setOrthoMode, tecnigrafoOrigin, lockedFocalPoint, activeMoveSnapPoint, hoverSnap, tecnigrafoLock, specchioMode, specchioSelectedIds, defaultLineStyle, setDefaultLineStyle, setActiveTool, copyPhase, copySourceEntityIds, selectedEntityIds, selectedEntityId, quickEditEntityId, copyBasePoint, movePhase, moveSourceEntityIds, moveBasePoint]);

    const moveLineParallel = (line: LineEntity, length: number, rawPoint: Point) => {
        const dxLine = line.end.x - line.start.x;
        const dyLine = line.end.y - line.start.y;
        const L = Math.sqrt(dxLine * dxLine + dyLine * dyLine);
        if (L > 0) {
            const normX = -dyLine / L;
            const normY = dxLine / L;
            
            const vecMouse = { x: rawPoint.x - line.start.x, y: rawPoint.y - line.start.y };
            const dir = (vecMouse.x * normX + vecMouse.y * normY) >= 0 ? 1 : -1;
            
            const offsetX = normX * length * dir;
            const offsetY = normY * length * dir;
            
            setEntities(prev => {
                const next = prev.map(ent => {
                    if (ent.id === line.id && ent.type === 'line') {
                        const l = ent as LineEntity;
                        return { 
                            ...l, 
                            start: { x: l.start.x + offsetX, y: l.start.y + offsetY },
                            end: { x: l.end.x + offsetX, y: l.end.y + offsetY }
                        };
                    }
                    return ent;
                });
                onCommitHistory?.(next); 
                return next;
            });
            return true;
        }
        return false;
    };



  const tecnigrafoSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><rect x="38" y="108" width="90" height="16" fill="rgba(212,163,115,0.7)" stroke="#8b5a2b" stroke-width="1"/><rect x="38" y="108" width="90" height="6" fill="rgba(255,255,255,0.7)" stroke="#8b5a2b" stroke-width="0.5"/><line x1="40" y1="108" x2="40" y2="112" stroke="black" stroke-width="1"/><line x1="50" y1="108" x2="50" y2="114" stroke="black" stroke-width="1.5"/><line x1="60" y1="108" x2="60" y2="112" stroke="black" stroke-width="1"/><line x1="70" y1="108" x2="70" y2="112" stroke="black" stroke-width="1"/><line x1="80" y1="108" x2="80" y2="114" stroke="black" stroke-width="1.5"/><line x1="90" y1="108" x2="90" y2="112" stroke="black" stroke-width="1"/><line x1="100" y1="108" x2="100" y2="112" stroke="black" stroke-width="1"/><line x1="110" y1="108" x2="110" y2="114" stroke="black" stroke-width="1.5"/><line x1="120" y1="108" x2="120" y2="112" stroke="black" stroke-width="1"/><rect x="4" y="0" width="16" height="90" fill="rgba(212,163,115,0.7)" stroke="#8b5a2b" stroke-width="1"/><rect x="14" y="0" width="6" height="90" fill="rgba(255,255,255,0.7)" stroke="#8b5a2b" stroke-width="0.5"/><line x1="20" y1="88" x2="16" y2="88" stroke="black" stroke-width="1"/><line x1="20" y1="78" x2="14" y2="78" stroke="black" stroke-width="1.5"/><line x1="20" y1="68" x2="16" y2="68" stroke="black" stroke-width="1"/><line x1="20" y1="58" x2="16" y2="58" stroke="black" stroke-width="1"/><line x1="20" y1="48" x2="14" y2="48" stroke="black" stroke-width="1.5"/><line x1="20" y1="38" x2="16" y2="38" stroke="black" stroke-width="1"/><line x1="20" y1="28" x2="16" y2="28" stroke="black" stroke-width="1"/><line x1="20" y1="18" x2="14" y2="18" stroke="black" stroke-width="1.5"/><line x1="20" y1="8" x2="16" y2="8" stroke="black" stroke-width="1"/><circle cx="20" cy="108" r="18" fill="transparent" stroke="rgba(50,50,50,0.6)" stroke-width="1"/></svg>`);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const templateId = e.dataTransfer.getData('text/plain');
    if (!templateId) return;

    const template = TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const dropPoint = screenToCanvas(mouseX, mouseY);

    const maskLayerId = layers.find(l => l.name === 'Maschere')?.id || activeLayerId;
    const groupId = 'group_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5);
    const newEntities: Entity[] = template.entities.map(te => {
        const baseProps = {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
            color: defaultLineStyle.color,
            lineWidth: defaultLineStyle.lineWidth,
            layer: maskLayerId,
            mode: defaultLineStyle.mode,
            groupId,
            templateId: template.id
        };
        
        if (te.type === 'line') {
            return {
                ...baseProps,
                type: 'line',
                start: { x: dropPoint.x + te.start.x, y: dropPoint.y + te.start.y },
                end: { x: dropPoint.x + te.end.x, y: dropPoint.y + te.end.y },
            };
        } else if (te.type === 'circle') {
            return {
                ...baseProps,
                type: 'circle',
                center: { x: dropPoint.x + te.center.x, y: dropPoint.y + te.center.y },
                radius: te.radius
            };
        } else if (te.type === 'arc') {
            return {
                ...baseProps,
                type: 'arc',
                center: { x: dropPoint.x + te.center.x, y: dropPoint.y + te.center.y },
                radius: te.radius,
                startAngle: te.startAngle,
                endAngle: te.endAngle
            };
        }
        return null;
    }).filter(e => e !== null) as Entity[];

    setEntities(prev => {
        const next = [...prev, ...newEntities];
        onCommitHistory?.(next);
        return next;
    });
  };

  const handleCommitText = () => {
    if (!textDialog) return;
    if (textDialog.text.trim()) {
        setDefaultTextStyle?.({
            fontFamily: textDialog.fontFamily,
            fontSize: textDialog.fontSize,
            fontWeight: textDialog.fontWeight,
            textAlign: textDialog.textAlign,
        });
        if (textDialog.id) {
            // Modifica testo esistente
            setEntities(prev => {
                const next = prev.map(ent => {
                    if (ent.id === textDialog.id) {
                        return {
                            ...ent,
                            text: textDialog.text,
                            fontFamily: textDialog.fontFamily,
                            fontSize: textDialog.fontSize,
                            fontWeight: textDialog.fontWeight,
                            textAlign: textDialog.textAlign,
                            color: textDialog.color,
                        } as Entity;
                    }
                    return ent;
                });
                onCommitHistory?.(next);
                return next;
            });
        } else {
            // Inserisci nuovo testo
            const newId = Date.now().toString();
            const newEntity: Entity = {
                id: newId,
                type: 'text',
                color: textDialog.color,
                lineWidth: defaultLineStyle.lineWidth,
                mode: defaultLineStyle.mode,
                point: textDialog.point,
                layer: activeLayerId,
                text: textDialog.text,
                fontFamily: textDialog.fontFamily,
                fontSize: textDialog.fontSize,
                fontWeight: textDialog.fontWeight,
                textAlign: textDialog.textAlign,
            };
            setEntities(prev => {
                const next = [...prev, newEntity];
                onCommitHistory?.(next);
                return next;
            });
            // Immediately start dragging the newly created text entity!
            setDragEntityId(newId);
            dragEntityIdRef.current = newId;
            if (actualMousePosRef.current) {
                lastMouseRef.current = actualMousePosRef.current;
                previousMouseRef.current = actualMousePosRef.current;
            }
        }
    }
    setTextDialog(null);
  };

  const confirmSpecchio = (action: 'copy' | 'move') => {
      if (!specchioFinalAxis || specchioSelectedIds.length === 0) return;
      
      setEntities(prev => {
          let next = [...prev];
          const newEntities: Entity[] = [];
          
          if (action === 'move') {
              next = next.filter(e => !specchioSelectedIds.includes(e.id));
          }
           
          specchioSelectedIds.forEach(id => {
              const ent = prev.find(e => e.id === id);
              if (ent) {
                  newEntities.push(mirrorEntity(ent, specchioFinalAxis.start, specchioFinalAxis.end));
              }
          });
          
          next = [...next, ...newEntities];
          onCommitHistory?.(next);
          return next;
      });
      
      setSpecchioState('axis_start');
      setSpecchioAxisPt1(null);
      setSpecchioFinalAxis(null);
      setSpecchioHoverAxisLine(null);
      setSpecchioSelectedIds([]);
      setSpecchioMode('copy');
      setShowSpecchioDialog(false);
      setActiveTool('Select');
  };

  const scissorsSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="7.5" r="3" stroke="#64748b" stroke-width="1.5"/><circle cx="5" cy="16.5" r="3" stroke="#64748b" stroke-width="1.5"/><path d="M7.5 9L12 12L22 9" stroke="#64748b" stroke-width="1.5" stroke-linecap="round"/><path d="M7.5 15L12 12L22 15" stroke="#64748b" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="1.2" fill="#475569"/></svg>`);
  const smartScissorsSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="7.5" r="3" stroke="#10b981" stroke-width="2"/><circle cx="5" cy="16.5" r="3" stroke="#10b981" stroke-width="2"/><path d="M7.5 9L12 12L22 9" stroke="#10b981" stroke-width="2" stroke-linecap="round"/><path d="M7.5 15L12 12L22 15" stroke="#10b981" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.5" fill="#10b981"/></svg>`);
  
  const getPencilCursor = (label: string) => {
    const leadColor = label === '2B' ? '#1e2229' : label === '2H' ? '#64748b' : '#334155';
    const svg = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(4, 60) rotate(-45)">
        <polygon points="0,0 10,-2.6 10,2.6" fill="${leadColor}" stroke="#0f172a" stroke-width="0.6" />
        <polygon points="10,-2.6 22,-5.8 22,5.8 10,2.6" fill="#fde68a" stroke="#92400e" stroke-width="0.9" />
        <rect x="22" y="-5.8" width="36" height="11.6" rx="1.5" fill="#1d4ed8" stroke="#1e3a8a" stroke-width="1" />
        <rect x="22" y="-2.2" width="36" height="4.4" fill="#3b82f6" />
        <rect x="52" y="-5.8" width="3.5" height="11.6" fill="#f8fafc" />
      </g>
    </svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 4 60, crosshair`;
  };

  const getKinaCursor = (_label: string) => {
    const svg = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(4, 60) rotate(-45)">
        <circle cx="0" cy="0" r="2.1" fill="#030508" />
        <line x1="0" y1="0" x2="9" y2="0" stroke="#ffffff" stroke-width="2.4" />
        <line x1="0" y1="0" x2="9" y2="0" stroke="#334155" stroke-width="1.4" />
        <rect x="9" y="-2.4" width="7" height="4.8" fill="#f1f5f9" stroke="#1e293b" stroke-width="0.9" />
        <polygon points="16,-2.4 24,-5.4 24,5.4 16,2.4" fill="#94a3b8" stroke="#1e293b" stroke-width="0.9" />
        <rect x="24" y="-5.6" width="5.5" height="11.2" fill="#dc2626" stroke="#7f1d1d" stroke-width="0.9" />
        <rect x="29.5" y="-5.6" width="30" height="11.2" rx="2" fill="#0f172a" stroke="#1e293b" stroke-width="1" />
        <line x1="32.5" y1="-5" x2="32.5" y2="5" stroke="#475569" stroke-width="0.9" />
        <line x1="35" y1="-5" x2="35" y2="5" stroke="#475569" stroke-width="0.9" />
      </g>
    </svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 4 60, crosshair`;
  };

  const pencilSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M0,0 L3,1 L1,3 Z" fill="#1e293b"/><path d="M3,1 L7,3 L3,7 L1,3 Z" fill="#fed7aa"/><path d="M7,3 L21,17 L17,21 L3,7 Z" fill="#4f46e5"/><path d="M7,3 L21,17 L19,19 L5,5 Z" fill="#6366f1"/><path d="M21,17 L24,20 L20,24 L17,21 Z" fill="#94a3b8"/><path d="M24,20 L28,24 L24,28 L20,24 Z" fill="#fda4af"/></svg>`);
  const kinaSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M0,0 L4,2 L2,4 Z" fill="#000000"/><path d="M4,2 L8,4 L4,8 L2,4 Z" fill="#94a3b8"/><path d="M8,4 L22,18 L18,22 L4,8 Z" fill="#334155"/><path d="M22,18 L26,22 L22,26 L18,22 Z" fill="#1e293b"/><rect x="22" y="22" width="6" height="6" fill="#1e293b" transform="rotate(45 25 25)"/></svg>`);

  const crosshairSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
    <line x1="0" y1="48" x2="96" y2="48" stroke="rgba(0,0,0,0.5)" stroke-width="1"/>
    <line x1="48" y1="0" x2="48" y2="96" stroke="rgba(0,0,0,0.5)" stroke-width="1"/>
    <rect x="44" y="44" width="8" height="8" fill="none" stroke="black" stroke-width="1"/>
  </svg>`);

  const kinaLabel = defaultLineStyle.mode === 'ink' ? defaultLineStyle.lineWidth.toString() : '';
  const pencilLabel = defaultLineStyle.color === '#bbbbbb' ? '2H' : (defaultLineStyle.color === '#444444' ? 'HB' : '2B');

  let helpContent = null;
  let helpTitle = activeTool;

  if (activeTool === 'BIM_TracciaSegmento' || activeTool === 'BIM_DisegnaLineare') {
      helpTitle = activeTool === 'BIM_TracciaSegmento' ? "Traccia Segmento" : "Tracciato Perimetro";
      helpContent = (
          <div className="flex flex-col gap-3">
             <div className="text-xs font-medium text-neutral-200">
                <strong className="text-emerald-400 block mb-1">
                  {activeTool === 'BIM_TracciaSegmento' ? "Rilevamento Segmento BIM" : "Rilievo Perimetrale"}
                </strong>
                {activeTool === 'BIM_TracciaSegmento' 
                  ? "Seleziona uno o più segmenti degli oggetti BIM esistenti per tracciare il perimetro."
                  : "Clicca i punti per definire il perimetro. Torna al punto iniziale per chiudere."}
                {manualRoomPoints.length > 0 && (
                  <p className="mt-2 text-emerald-300 font-bold">
                    Punti raccolti: {manualRoomPoints.length}. Clicca "CONFERMA" per finire.
                  </p>
                )}
             </div>
             {manualRoomPoints.length > 0 && (
                <div className="flex items-center gap-2 bg-white/10 rounded-xl p-2 pl-3" onPointerDown={e => e.stopPropagation()}>
                   <button 
                     onClick={(e) => { 
                        e.stopPropagation();
                        if (onAreaDetected) {
                            onAreaDetected({ 
                                points: [...manualRoomPoints], 
                                isLinear: true, 
                                isJollyActive: false, 
                                sideSign: manualSideSign,
                                isFaceAligned: activeTool === 'BIM_TracciaSegmento'
                            } as any);
                            setManualRoomPoints([]);
                            setActiveTool?.('Select');
                        }
                     }}
                     className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-transform active:scale-95 shadow-lg flex items-center gap-2"
                   >
                     <Check size={14} />
                     CONFERMA
                   </button>
                   <button 
                     onClick={(e) => { 
                        e.stopPropagation();
                        setManualRoomPoints([]);
                        setActiveTool?.('Select');
                     }}
                     className="bg-white/10 hover:bg-white/20 text-neutral-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
                   >
                     <X size={14} />
                     ANNULLA
                   </button>
                </div>
             )}
          </div>
      );
  }

  if (activeTool === 'Circle' && circleTangentLine1) {
      helpContent = (
          <div className="flex flex-col gap-2">
             <div className="text-xs font-medium text-neutral-200">
                <strong className="text-emerald-400 block mb-1">Cerchio Tangente a 2 Rette</strong>
                1ª retta selezionata. Clicca sulla seconda retta per creare il cerchio tangente.
             </div>
             <div className="flex items-center gap-2 bg-white/10 rounded-xl p-2 pl-3" onPointerDown={e => e.stopPropagation()}>
                <button 
                  onClick={(e) => { 
                     e.stopPropagation();
                     setCircleTangentLine1(null);
                     setCircleTangentClickPt1(null);
                     setStatusMessage(null);
                  }}
                  className="bg-white/10 hover:bg-white/20 text-neutral-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  <X size={14} />
                  ANNULLA TANGENTE
                </button>
             </div>
          </div>
      );
  }

  if (activeTool === 'Specchio') {
      helpContent = (
          <div className="flex flex-col gap-3">
             <div className="text-xs font-medium text-neutral-200">
                <strong className="text-emerald-400 block mb-1">Mirror: Specchia gli oggetti</strong>
                Traccia un asse di simmetria come fai per una linea, quindi seleziona gli oggetti.
                <p className="mt-2">
                 {specchioState === 'axis_start' ? "1. Crea un asse di simmetria come un normale segmento..." :
                  specchioState === 'axis_end' ? "2. Clicca per stabilire il secondo punto dell'asse." :
                  "3. Ora seleziona gli oggetti da specchiare e conferma."}
                </p>
             </div>
             {specchioState === 'objects' && specchioSelectedIds.length > 0 && (
                 <div className="flex items-center gap-2 bg-white/10 rounded-xl p-2 pl-3" onPointerDown={e => e.stopPropagation()}>
                    <span className="text-xs font-medium text-neutral-300 mr-1">{specchioSelectedIds.length} elem.</span>
                    <button 
                      onClick={() => setSpecchioMode('copy')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${specchioMode === 'copy' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-transparent text-neutral-400 hover:text-white hover:bg-white/5'}`}
                    >
                      Copia
                    </button>
                    <button 
                      onClick={() => setSpecchioMode('move')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${specchioMode === 'move' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-transparent text-neutral-400 hover:text-white hover:bg-white/5'}`}
                    >
                      Sposta
                    </button>
                    <div className="w-px h-4 bg-white/20 mx-1"></div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); confirmSpecchio(specchioMode); }}
                      className="bg-white text-zinc-900 hover:bg-neutral-200 px-3 py-1 rounded-lg text-xs font-black uppercase transition-transform active:scale-95 shadow-lg"
                    >
                      OK
                    </button>
                 </div>
             )}
          </div>
      );
  }


  const handleDoubleClick = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - view.pan.x) / view.zoom;
    const y = (e.clientY - rect.top - view.pan.y) / view.zoom;
    const pt = { x, y };

    const clickedEntity = getEntityAtPoint(pt, 25);
    if (clickedEntity) {
      if (clickedEntity.type === 'line') {
        const line = clickedEntity as LineEntity;
        const dx = line.end.x - line.start.x;
        const dy = line.end.y - line.start.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        let minParallelDist = Infinity;
        if (len > 0.1) {
            const nx = -dy / len;
            const ny = dx / len;
            entities.forEach(other => {
                if (other.id !== line.id && other.type === 'line') {
                    const oLine = other as LineEntity;
                    const odx = oLine.end.x - oLine.start.x;
                    const ody = oLine.end.y - oLine.start.y;
                    const olen = Math.sqrt(odx * odx + ody * ody);
                    if (olen > 0.1) {
                        const onx = -ody / olen;
                        const ony = odx / olen;
                        const dot = Math.abs(nx * onx + ny * ony);
                        if (dot > 0.99) {
                            const dist = Math.abs((oLine.start.x - line.start.x) * nx + (oLine.start.y - line.start.y) * ny);
                            if (dist > 0.5 && dist < minParallelDist) {
                                minParallelDist = dist;
                            }
                        }
                    }
                }
            });
        }
        const detectedOffset = minParallelDist !== Infinity ? minParallelDist.toFixed(1) : '0';

        const zoomDec = view.zoom >= 1.2 ? 3 : (view.zoom >= 0.45 ? 2 : (view.zoom >= 0.20 ? 1 : 0));
        setQuickEditEntityId(line.id);
        setQuickEditValue(zoomDec === 0 ? `${Math.round(len)}` : len.toFixed(zoomDec));
        setQuickEditOffset(detectedOffset);
        setQuickEditReferenceId(minParallelDist !== Infinity ? (entities.find(other => {
            if (other.id === line.id || other.type !== 'line') return false;
            const oLine = other as LineEntity;
            const dx = line.end.x - line.start.x;
            const dy = line.end.y - line.start.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 0.1) return false;
            const nx = -dy / len;
            const ny = dx / len;
            const dist = Math.abs((oLine.start.x - line.start.x) * nx + (oLine.start.y - line.start.y) * ny);
            return Math.abs(dist - minParallelDist) < 0.1;
        })?.id || null) : null);
        setQuickEditPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        return;
      } else if (clickedEntity.type === 'circle') {
        const circ = clickedEntity as any;
        setQuickEditEntityId(circ.id);
        setQuickEditValue(circ.radius.toFixed(1));
        setQuickEditOffset('0');
        setQuickEditPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        return;
      } else if (clickedEntity.type === 'rectangle') {
        const rectEnt = clickedEntity as any;
        const w = Math.abs(rectEnt.p2.x - rectEnt.p1.x);
        setQuickEditEntityId(rectEnt.id);
        setQuickEditValue(w.toFixed(1));
        setQuickEditOffset('0');
        setQuickEditPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        return;
      } else if (clickedEntity.isBIM) {
        setBimFlashIds([clickedEntity.id]);
        setTimeout(() => {
          setBimFlashIds([]);
        }, 5000);
        return;
      }
    }

    // Tecnigrafo head double click to toggle Squadrette
    if (tecnigrafoOrigin) {
        const dist = Math.hypot(pt.x - tecnigrafoOrigin.x, pt.y - tecnigrafoOrigin.y);
        if (dist < 25 / view.zoom) {
            if (showSquadrette) {
                setShowSquadrette(false);
                setSquadrette([]);
            } else {
                setShowSquadrette(true);
                setSquadrette([
                    { id: 'sq1', type: '45', pos: { x: pt.x - 150, y: pt.y - 150 }, rotation: 0 },
                    { id: 'sq2', type: '3060', pos: { x: pt.x + 50, y: pt.y - 150 }, rotation: 0 }
                ]);
            }
            renderRef.current?.();
            return;
        }
    } else if (rulerStyle === 'tecnigrafo') {
        // If tecnigrafo is not yet placed, a double-click on background places it and activates squadrette
        setTecnigrafoOrigin(pt);
        setShowSquadrette(true);
        setSquadrette([
            { id: 'sq1', type: '45', pos: { x: pt.x - 150, y: pt.y - 150 }, rotation: 0 },
            { id: 'sq2', type: '3060', pos: { x: pt.x + 50, y: pt.y - 150 }, rotation: 0 }
        ]);
        renderRef.current?.();
        return;
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full relative overflow-hidden" 
      style={{ touchAction: 'none', cursor: isSKeyPressedRef.current ? 'none' : hoveredTavolaPart ? 'pointer' : (actualMousePosRef.current && getEntityAtPoint(actualMousePosRef.current, 25)?.type === 'text') ? 'grab' : activeTool === 'Testo' ? 'text' : activeTool === 'Gomma' ? 'none' : activeTool === 'Trim' ? (trimMode === 'smart' ? `url("${smartScissorsSvg}") 16 16, crosshair` : `url("${scissorsSvg}") 16 16, crosshair`) : isMagicCopyActive ? (dragEntityId ? 'copy' : 'grab') : isJollyActive ? (dragEntityId ? 'grabbing' : 'grab') : isMovingTecnigrafo ? 'grabbing' : hoverMoveTecnigrafo ? 'grab' : dragTavolaId ? 'grabbing' : hoverTavolaEdge ? 'grab' : activeTool === 'Select' ? `url("${crosshairSvg}") 48 48, crosshair` : (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Arc' || activeTool === 'Rectangle' || activeTool === 'Parallel') ? 'none' : 'crosshair' }}
      onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
      onWheel={handleWheel} 
      onPointerDown={handleMouseDown} 
      onPointerMove={handleMouseMove} 
      onPointerUp={handleMouseUp} 
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPointerLeave={() => { setHoveredTavolaPart(null); setTooltipMousePos(null); }}
    >
      <canvas ref={canvasRef} />
      
      {/* Multimedia Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ 
          transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`,
          transformOrigin: '0 0'
        }}
      >
        {entities.map(ent => {
          if (ent.type !== 'image') return null;

          const layer = layers.find(l => l.id === ent.layer);
          if (layer && !layer.visible) return null;

          const isSelected = selectedEntityId === ent.id || dragEntityIds.includes(ent.id) || highlightedSketchId === ent.id;
          const isInteractive = activeTool === 'Select';

          return (
            <React.Fragment key={ent.id}>
              {ent.mediaType && ent.mediaType !== 'image' && (
                <div 
                  style={{
                    position: 'absolute',
                    left: ent.point.x,
                    top: ent.point.y,
                    width: ent.width,
                    height: ent.height,
                    pointerEvents: isInteractive ? 'auto' : 'none',
                    outline: isSelected ? `${2 / view.zoom}px dashed blue` : 'none',
                    opacity: ent.opacity ?? 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: ent.mediaType === 'audio' ? 'rgba(255,255,255,0.5)' : 'transparent',
                    borderRadius: ent.mediaType === 'audio' ? `${8/view.zoom}px` : '0',
                    transform: ent.angle ? `rotate(${ent.angle}deg)` : 'none',
                    transformOrigin: '50% 50%',
                    userSelect: 'none'
                  }}
                >
                   {ent.mediaType === 'video' && <video src={ent.src} controls className="w-full h-full object-contain bg-black/10" />}
                   {ent.mediaType === 'audio' && <audio src={ent.src} controls className="w-full h-full" />}
                   {ent.mediaType === 'pdf' && <PdfRenderer dataUri={ent.src} width={ent.width} height={ent.height} className="rounded-md" />}
                </div>
              )}
              {isSelected && isInteractive && (!ent.mediaType || ent.mediaType === 'image' || ent.mediaType === 'pdf') && (
                  <ImageEditorOverlay
                      entity={ent as ImageEntity}
                      zoom={view.zoom}
                      pan={view.pan}
                      onUpdate={(id, updates) => {
                          setEntities(prev => prev.map(e => e.id === id ? ({ ...e, ...updates } as Entity) : e));
                      }}
                      isActive={true}
                  />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {isZoomActive && (
        <div className="absolute top-4 left-4 bg-white/90 p-4 rounded shadow-lg border border-gray-200 pointer-events-none z-10">
          <h3 className="font-bold mb-2">Modalità Zoom/Pan (Tasto Z premuto)</h3>
          <p className="text-sm text-gray-700">Tasto Sinistro: Zoom</p>
          <p className="text-sm text-gray-700">Tasto Destro: Pan</p>
        </div>
      )}

      {helpContent && activeTool !== 'Select' && (
        <div 
          onPointerDown={onHelpPointerDown}
          onPointerMove={onHelpPointerMove}
          onPointerUp={onHelpPointerUp}
          className="absolute z-50 bg-zinc-950/95 text-white border border-neutral-700 rounded-xl shadow-2xl flex flex-col pointer-events-auto cursor-move select-none animate-fade-in"
          style={{ 
              bottom: 40, 
              left: '50%',
              transform: `translateX(-50%) translate(${helpPanelOffset?.x || 0}px, ${helpPanelOffset?.y || 0}px)`,
              touchAction: 'none'
          }}
        >
          <div className="flex items-center px-4 py-2 bg-white/5 border-b border-white/10 rounded-t-xl gap-2 text-neutral-400">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
                <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
             </svg>
             <span className="text-xs font-bold uppercase tracking-wider">{helpTitle}</span>
          </div>
          <div className="p-4 py-3 flex flex-col gap-3">
             {helpContent}
          </div>
        </div>
      )}

      {textDialog && (
        <div 
          className="fixed inset-0 bg-black/5 flex items-center justify-center z-50 animate-fade-in"
          onClick={(e) => {
            e.stopPropagation();
            setTextDialog(null);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div 
            className="bg-white border border-neutral-200 rounded-xl shadow-2xl p-6 flex flex-col gap-4 w-96 max-w-[90vw] animate-scale-up"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-neutral-100 pb-3">
              <h3 className="text-xs font-black uppercase text-neutral-800 tracking-wider font-mono">
                {textDialog.id ? "Modifica Testo" : "Inserisci Nuovo Testo"}
              </h3>
              <button 
                onClick={() => setTextDialog(null)}
                className="text-neutral-400 hover:text-neutral-600 font-mono text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">
                Contenuto Testo
              </label>
              <textarea
                className="w-full bg-neutral-50 hover:bg-neutral-100 focus:bg-white text-xs p-2.5 rounded-lg border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition-colors"
                rows={3}
                placeholder="Scrivi qui il testo..."
                value={textDialog.text}
                onChange={(e) => setTextDialog({ ...textDialog, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleCommitText();
                  }
                }}
                autoFocus
              />
              <p className="text-[9px] text-neutral-400 font-mono text-right mt-0.5">
                Premi Invio per nuova riga • Ctrl+Invio per confermare
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">
                  Tipo Carattere
                </label>
                <select
                  className="w-full bg-neutral-50 hover:bg-neutral-100 border border-neutral-300 text-xs rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 font-semibold"
                  value={textDialog.fontFamily}
                  onChange={(e) => setTextDialog({ ...textDialog, fontFamily: e.target.value })}
                >
                  <option value="sans-serif">Sans Serif</option>
                  <option value="serif">Serif (Classico)</option>
                  <option value="monospace">Monospace (Dati)</option>
                  <option value="Courier New">Courier New</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Arial">Arial</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">
                  Grandezza (px)
                </label>
                <input
                  type="number"
                  min="6"
                  max="144"
                  className="w-full bg-neutral-50 hover:bg-neutral-100 border border-neutral-300 text-xs rounded-lg p-2 font-bold text-center focus:ring-2 focus:ring-indigo-500"
                  value={textDialog.fontSize}
                  onChange={(e) => setTextDialog({ ...textDialog, fontSize: parseInt(e.target.value) || 12 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">
                  Allineamento
                </label>
                <select
                  className="w-full bg-neutral-50 hover:bg-neutral-100 border border-neutral-300 text-xs rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 font-semibold"
                  value={textDialog.textAlign}
                  onChange={(e) => setTextDialog({ ...textDialog, textAlign: e.target.value as any })}
                >
                  <option value="left">Sinistra</option>
                  <option value="center">Centro</option>
                  <option value="right">Destra</option>
                  <option value="justify">Giustificato</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">
                  Formato
                </label>
                <div className="grid grid-cols-2 gap-2 h-full">
                  <button
                    type="button"
                    className={`text-xs py-1.5 rounded-lg border font-bold transition-colors ${textDialog.fontWeight === 'bold' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-neutral-50 hover:bg-neutral-100 border-neutral-300 text-neutral-700'}`}
                    onClick={() => setTextDialog({ ...textDialog, fontWeight: textDialog.fontWeight === 'bold' ? 'normal' : 'bold' })}
                  >
                    Grassetto
                  </button>
                  <span className="text-[10px] text-neutral-400 self-center text-center font-mono select-none uppercase">
                    {textDialog.fontWeight === 'bold' ? 'BOLD' : 'REGULAR'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">
                Colore Testo
              </label>
              <div className="grid grid-cols-5 gap-2">
                {['#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#64748b'].map((c) => {
                  const isSelected = textDialog.color === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setTextDialog({ ...textDialog, color: c })}
                      className="h-6 w-full rounded border-2 transition-transform hover:scale-110 active:scale-95 shadow-sm"
                      style={{ 
                        backgroundColor: c,
                        borderColor: isSelected ? '#4f46e5' : 'transparent',
                      }}
                      title={c}
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3 mt-1">
              <button
                type="button"
                className="px-4 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 text-neutral-700 text-xs font-semibold tracking-wide font-sans transition-colors"
                onClick={() => setTextDialog(null)}
              >
                Annulla
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold tracking-wide font-sans shadow-md transition-colors"
                onClick={handleCommitText}
              >
                {textDialog.id ? "Salva Modifiche" : "Inserisci"}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Rimosso il popup HTML sovrapposto al passaggio del mouse per lasciare il disegno completamente libero */}

      {drawing && activeTool === 'Circle' && tooltipMousePos && (
          <div 
              className="absolute bg-slate-900/90 text-emerald-400 border border-emerald-500/60 font-mono text-[12px] font-bold px-3 py-1.5 rounded-xl shadow-2xl pointer-events-none z-[99999] select-none animate-in fade-in duration-75 backdrop-blur-md flex flex-col gap-1"
              style={{
                  left: `${tooltipMousePos.x + 24}px`,
                  top: `${tooltipMousePos.y - 24}px`,
              }}
          >
              <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                  <span>
                      Raggio R: <strong className="text-white font-extrabold">{circleRadiusInputString || Math.hypot(drawing.current.x - drawing.start.x, drawing.current.y - drawing.start.y).toFixed(view.zoom >= 0.45 ? 2 : (view.zoom >= 0.20 ? 1 : 0)).replace('.', ',')} cm</strong>
                  </span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-300">
                  <span>
                      Area: <strong className="text-white font-extrabold">{(Math.PI * Math.pow(parseFloat(circleRadiusInputString || String(Math.hypot(drawing.current.x - drawing.start.x, drawing.current.y - drawing.start.y))) || 0, 2)).toFixed(view.zoom >= 0.45 ? 2 : (view.zoom >= 0.20 ? 1 : 0)).replace('.', ',')} cm²</strong>
                  </span>
              </div>
              <div className="text-[10px] text-emerald-300/80 font-sans tracking-wide mt-0.5">
                  [Premi INVIO per confermare • ESC per annullare]
              </div>
          </div>
      )}

       {activeTool === 'Parallel' && (
          <motion.div
              drag
              dragMomentum={false}
              dragElastic={0}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-950/95 text-white border-2 border-cyan-500/80 shadow-2xl p-3.5 px-4 rounded-2xl z-[99999] flex flex-col gap-2.5 backdrop-blur-xl select-none min-w-[420px] max-w-[95vw] cursor-grab active:cursor-grabbing ring-1 ring-cyan-500/30"
          >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                      <GripHorizontal size={15} className="text-slate-500" />
                      <ParallelIcon size={16} className="text-cyan-400" />
                      <span>Offset Tecnigrafo • Righello Perpendicolare</span>
                  </div>
                  <div className="flex items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
                      <button
                          type="button"
                          onClick={() => setParallelSign(s => -s)}
                          className="bg-slate-800/90 hover:bg-slate-700 text-cyan-300 text-[11px] px-2.5 py-1 rounded-lg border border-slate-700 flex items-center gap-1 font-semibold transition-colors shadow-sm"
                          title="Inverti lato della parallela (Tasto F)"
                      >
                          <RefreshCw size={11} /> Flip {parallelSign > 0 ? '+ (Destra)' : '- (Sinistra)'}
                      </button>
                      {selectedParallelLine && (
                          <button
                              type="button"
                              onClick={() => {
                                  setSelectedParallelLine(null);
                                  setParallelMouse(null);
                              }}
                              className="bg-slate-800/80 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 text-[11px] px-2 py-1 rounded-lg border border-slate-700/80 transition-colors"
                              title="Deseleziona per scegliere un'altra linea (Esc)"
                          >
                              Altra Linea
                          </button>
                      )}
                  </div>
              </div>

              {!selectedParallelLine ? (
                  <div className="flex items-center gap-2 py-1 text-xs text-amber-300 font-medium">
                      <MousePointer2 size={16} className="text-amber-400 animate-pulse shrink-0" />
                      <span>Clicca su qualsiasi linea nel disegno per agganciare il righello perpendicolare.</span>
                  </div>
              ) : (
                  <>
                      <div className="flex items-center gap-2.5 flex-wrap" onPointerDown={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border-2 border-cyan-500/80 shadow-inner">
                              <span className="text-xs font-bold text-slate-400">Offset:</span>
                              <input
                                  type="text"
                                  value={parallelInputString}
                                  onChange={(e) => {
                                      const val = e.target.value;
                                      setParallelInputString(val);
                                      const parsed = parseFloat(val.replace(',', '.'));
                                      if (!isNaN(parsed) && parsed > 0) {
                                          setParallelDistance(parsed);
                                          try {
                                              localStorage.setItem('lastParallelDistance', parsed.toString());
                                          } catch(err) {}
                                      }
                                  }}
                                  onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                          e.preventDefault();
                                          commitParallel();
                                      }
                                  }}
                                  placeholder="10"
                                  className="w-20 bg-transparent text-right font-mono text-base font-black text-cyan-300 outline-none"
                              />
                              <span className="text-xs text-cyan-500 font-mono font-bold">cm</span>
                          </div>

                          {/* Preset Quick Chips */}
                          <div className="flex items-center gap-1 flex-wrap">
                              {[5, 10, 15, 20, 25, 30, 40, 50, 100, 200].map(pVal => (
                                  <button
                                      key={pVal}
                                      type="button"
                                      onClick={() => {
                                          setParallelDistance(pVal);
                                          setParallelInputString(pVal.toString());
                                          try {
                                              localStorage.setItem('lastParallelDistance', pVal.toString());
                                          } catch(err) {}
                                      }}
                                      className={`text-xs font-mono font-bold px-2 py-1 rounded-lg transition-all ${
                                          Math.abs(parallelDistance - pVal) < 0.1
                                              ? 'bg-cyan-500 text-slate-950 font-black shadow-md scale-105'
                                              : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 hover:text-white'
                                      }`}
                                  >
                                      {pVal}
                                  </button>
                              ))}
                          </div>

                          <button
                              type="button"
                              onClick={() => commitParallel()}
                              className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 cursor-pointer transition-all ml-auto shrink-0"
                          >
                              <Check size={14} /> Fissa Linea
                          </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium pt-1 border-t border-slate-800/80" onPointerDown={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5 text-cyan-300/90">
                              <Sparkles size={13} className="text-amber-400 shrink-0" />
                              <span>Muovi il mouse lungo il righello: scatta sui cm. Clicca sul foglio per fissare!</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">[Invio = Fissa • F = Inverti • Esc = Annulla]</span>
                      </div>
                  </>
              )}
          </motion.div>
       )}

      {quickEditEntityId && (
          <div 
              onPointerDown={e => e.stopPropagation()}
              className="absolute bg-slate-900 text-white border-2 border-amber-400 shadow-2xl p-5 rounded-2xl z-[99999] flex flex-col gap-3.5 min-w-[300px] animate-in fade-in zoom-in-95 duration-150"
              style={quickEditPos ? {
                  left: `${quickEditPos.x + 12}px`,
                  top: `${quickEditPos.y - 40}px`,
              } : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
          >
              <div className="flex items-center justify-between border-b border-slate-700 pb-2.5">
                  <div className="text-xs uppercase font-black tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Sparkles size={15} className="animate-spin-slow" />
                      Correzione Manuale Misura
                  </div>
                  <button 
                      type="button" 
                      onClick={() => setQuickEditEntityId(null)}
                      className="text-slate-400 hover:text-white text-sm font-bold px-1.5"
                  >
                      ✕
                  </button>
              </div>
              
              {(() => {
                  const ent = entities.find(el => el.id === quickEditEntityId);
                  if (!ent) return null;
                  let label = "Valore attuale";
                  let val = 0;
                  if (ent.type === 'line') {
                      const dx = ent.end.x - ent.start.x;
                      const dy = ent.end.y - ent.start.y;
                      val = Math.sqrt(dx * dx + dy * dy);
                      label = "Lunghezza Segmento";
                  } else if (ent.type === 'circle') {
                      val = ent.radius;
                      label = "Raggio attuale";
                  } else if (ent.type === 'rectangle') {
                      val = Math.abs((ent as any).p2.x - (ent as any).p1.x);
                      label = "Larghezza attuale";
                  }
                  return (
                      <div className="bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-center text-sm text-slate-200 font-mono">
                          {label}: <span className="text-amber-300 font-black text-lg">{val.toFixed(2).replace('.', ',')} cm</span>
                      </div>
                  );
              })()}

              <form 
                  onSubmit={(e) => {
                      e.preventDefault();
                      handleQuickEditCommit(quickEditValue, quickEditOffset);
                  }}
                  className="flex flex-col gap-3.5"
              >
                  <div className="flex items-center gap-2.5">
                      <span className="w-20 text-slate-300 font-mono text-sm font-bold">
                          {entities.find(el => el.id === quickEditEntityId)?.type === 'circle' ? 'Raggio:' : entities.find(el => el.id === quickEditEntityId)?.type === 'rectangle' ? 'Larg:' : 'Lunghezza:'}
                      </span>
                      <input 
                          type="text"
                          autoFocus
                          onFocus={e => e.target.select()}
                          placeholder="Nuova misura (cm)..."
                          value={quickEditValue}
                          onChange={e => setQuickEditValue(e.target.value)}
                          className="flex-1 bg-slate-950 border-2 border-amber-400/80 px-3 py-2 rounded-xl text-right font-mono text-xl font-black text-white outline-none focus:border-emerald-400"
                      />
                      <span className="text-sm font-mono font-bold text-amber-400">cm</span>
                      <button
                          type="button"
                          title="Apri pannello Penne (stile, colore, spessore)"
                          onClick={() => {
                              if (quickEditEntityId) {
                                  onSelect(quickEditEntityId);
                                  onOpenPenneSidebar?.();
                              }
                          }}
                          className="p-2.5 rounded-xl transition-colors flex items-center justify-center border bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                      >
                          <Pen size={15} />
                      </button>
                  </div>
                  <div className="flex items-center gap-2.5">
                      <span className="w-20 text-slate-300 font-mono text-sm font-bold">Parallela:</span>
                      <input 
                          type="text"
                          onFocus={e => e.target.select()}
                          placeholder="Distanza (cm)..."
                          value={quickEditOffset}
                          onChange={e => setQuickEditOffset(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-600 px-3 py-2 rounded-xl text-right font-mono text-lg font-bold text-cyan-300 outline-none focus:border-cyan-400"
                      />
                      <span className="text-sm font-mono font-bold text-cyan-400">cm</span>
                  </div>
                  <div className="flex gap-2.5 pt-1">
                      <button 
                          type="submit" 
                          className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-2.5 rounded-xl text-sm transition-colors shadow-lg"
                      >
                          ✓ Applica Misura (Invio)
                      </button>
                      <button 
                          type="button" 
                          onClick={() => setQuickEditEntityId(null)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
                      >
                          Annulla
                      </button>
                  </div>
              </form>
              </div>
          )}

      {statusMessage && showFloatingManual && (
        <div 
          className="absolute bg-white/95 text-slate-800 border-2 border-emerald-400/80 shadow-[0_12px_32px_rgba(0,0,0,0.12),_0_8px_20px_rgba(16,185,129,0.08)] px-4 py-3 rounded-xl text-xs font-semibold tracking-wide font-sans z-50 pointer-events-none flex flex-col items-center text-center gap-2 max-w-[280px] backdrop-blur-sm transition-all duration-75 border-solid"
          style={
            tooltipMousePos
              ? {
                  left: `${tooltipMousePos.x + 24}px`,
                  top: `${tooltipMousePos.y - 24}px`,
                  transform: 'translate(0, -100%)',
                }
              : {
                  left: '40px',
                  top: '40px',
                }
          }
        >
          <div className="flex items-center gap-2 justify-center bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/50">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse flex-shrink-0" />
            <span className="text-[10px] uppercase tracking-widest text-emerald-700 font-extrabold font-sans">Suggerimento</span>
          </div>
          <div className="text-slate-700 leading-relaxed font-semibold text-center text-[12px] px-1">
            {statusMessage}
          </div>
        </div>
      )}

    </div>
  );
});

export default CADCanvas;
