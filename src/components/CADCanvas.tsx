import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Entity, Point, Layer, LineEntity, CircleEntity, ArcEntity, RectEntity, InkPoint, Tavola, DimensionEntity, PointEntity } from '../types';
import { ManualInputOverlay } from './ManualInputOverlay';
import { TEMPLATES, Template } from '../data/templates';

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

export interface CADCanvasAPI {
  getCurrentMousePosition: () => Point;
  rotateMaskAtPoint: (e: React.MouseEvent) => boolean;
  editRaccordo: (
    id1: string,
    id2: string,
    clickPt1: Point,
    clickPt2: Point,
    existingRaccordoId: string,
    config: { type: 'curvo' | 'rettilineo'; value: number },
    originalLine1: any,
    originalLine2: any
  ) => void;
  autoScanBIM: () => void;
  setBIMDefaults: (width: number, height: number | undefined, type: 'door' | 'window' | 'wall') => void;
}

export type DrawingState = {
  start: Point;
  current?: Point;
  arcStartPoint?: Point;
  arcDirection?: number;
  snapType?: 'CAD' | 'smart';
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
};

const normalizeAngle = (a: number) => {
  let deg = a % 360;
  if (deg < 0) deg += 360;
  return deg;
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

const getWallCorners = (l: LineEntity, entities: Entity[]): Point[] => {
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

  const startConns = entities.filter(e => e.type === 'line' && e.isBIM && e.bimType === 'wall' && e.id !== l.id) as LineEntity[];
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

  const endConns = entities.filter(e => e.type === 'line' && e.isBIM && e.bimType === 'wall' && e.id !== l.id) as LineEntity[];
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

const distanceToSegmentPt = (p: Point, s: Point, e: Point): number => {
  const l2 = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
  if (l2 === 0) return Math.sqrt((p.x - s.x) ** 2 + (p.y - s.y) ** 2);
  let t = ((p.x - s.x) * (e.x - s.x) + (p.y - s.y) * (e.y - s.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((p.x - (s.x + t * (e.x - s.x))) ** 2 + (p.y - (s.y + t * (e.y - s.y))) ** 2);
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
  const { pattern, scale, angle, color, points, sfumatura = 0 } = entity;
  if (!points || points.length < 3) return;

  ctx.save();
  
  // Set clipping path to the closed shape boundary
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.clip();

  // If solid fill, draw solid color or radial gradient and return
  if (pattern?.toLowerCase() === 'solid') {
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
    } else {
      ctx.fillStyle = color || 'rgba(99, 102, 241, 0.45)';
    }
    ctx.fill();
    ctx.restore();
    return;
  }

  // Draw optional light background coloring for beautiful hatch readability on technical papers
  ctx.fillStyle = 'rgba(0, 0, 0, 0.015)';
  ctx.fill();

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
  ctx.lineWidth = Math.max(0.7, 1.2 / zoom);
  ctx.fillStyle = color || '#3b82f6';
  ctx.setLineDash([]);

  const step = Math.max(2, scale || 14);
  const pat = (pattern || 'ansi31').toLowerCase();

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
  } else if (pat === 'honey') {
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
  width: number,
  height: number,
  screenToCanvas: (x: number, y: number) => Point,
  layers: Layer[]
): Point[] | null => {
  const offCanvas = document.createElement('canvas');
  offCanvas.width = width;
  offCanvas.height = height;
  const oCtx = offCanvas.getContext('2d');
  if (!oCtx) return null;

  oCtx.fillStyle = '#ffffff';
  oCtx.fillRect(0, 0, width, height);

  oCtx.save();
  oCtx.translate(view.pan.x, view.pan.y);
  oCtx.scale(view.zoom, view.zoom);

  oCtx.strokeStyle = '#000000';
  oCtx.lineWidth = Math.max(3.0, 3.5 / view.zoom);
  oCtx.lineJoin = 'round';
  oCtx.lineCap = 'round';

  entities.forEach(ent => {
    const layer = layers.find(l => l.id === ent.layer);
    if (layer && (!layer.visible || layer.frozen)) return;
    // Exclude annotations, dimensions, hatches, and any furniture templates/BIM blocks
    // so that rooms are scanned purely on architectural structural lines (walls)
    if (
      ent.type === 'dimension' ||
      ent.type === 'text' ||
      ent.type === 'point' ||
      ent.type === 'hatch' ||
      ent.groupId ||
      ent.templateId
    ) {
      return;
    }

    if (ent.isBIM) {
      // Allow doors and windows to seal the boundary envelope, but exclude rooms or other annotations
      if (ent.bimType !== 'door' && ent.bimType !== 'window') {
        return;
      }
    }

    oCtx.beginPath();
    if (ent.type === 'line') {
      if (ent.inkPoints && ent.inkPoints.length > 0) {
        // Handle freehand/pencil strokes by following all their intermediate points
        oCtx.moveTo(ent.inkPoints[0].x, ent.inkPoints[0].y);
        for (let i = 1; i < ent.inkPoints.length; i++) {
          oCtx.lineTo(ent.inkPoints[i].x, ent.inkPoints[i].y);
        }
      } else {
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
  });
  oCtx.restore();

  const startX = Math.round(clickPoint.x);
  const startY = Math.round(clickPoint.y);

  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return null;
  }

  const imgData = oCtx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const isWhite = (x: number, y: number): boolean => {
    const idx = (y * width + x) * 4;
    return data[idx] > 220 && data[idx + 1] > 220 && data[idx + 2] > 220;
  };

  if (!isWhite(startX, startY)) {
    return null;
  }

  const filled = Array.from({ length: height }, () => new Uint8Array(width));
  const queue: [number, number][] = [[startX, startY]];
  filled[startY][startX] = 1;

  let head = 0;
  let touchesBorder = false;
  const maxPixels = width * height * 0.90;
  let pixelCount = 0;

  while (head < queue.length) {
    const [cx, cy] = queue[head++];
    pixelCount++;

    if (pixelCount > maxPixels) {
      touchesBorder = true;
      break;
    }

    if (cx === 0 || cx === width - 1 || cy === 0 || cy === height - 1) {
      touchesBorder = true;
      break;
    }

    const neighbors = [
      [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (!filled[ny][nx] && isWhite(nx, ny)) {
          filled[ny][nx] = 1;
          queue.push([nx, ny]);
        }
      }
    }
  }

  if (touchesBorder) {
    return null;
  }

  let foundStart = false;
  let bX = 0, bY = 0;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (filled[y][x]) {
        bX = x;
        bY = y;
        foundStart = true;
        break outer;
      }
    }
  }

  if (!foundStart) return null;

  const grid = Array.from({ length: height }, () => new Array(width).fill(false));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (filled[y][x]) grid[y][x] = true;
    }
  }

  const rawContour = traceContour(grid, bX, bY);
  if (rawContour.length < 3) return null;

  const downsampled: Point[] = [];
  const step = Math.max(1, Math.floor(rawContour.length / 1000));
  for (let i = 0; i < rawContour.length; i += step) {
    downsampled.push(rawContour[i]);
  }
  if (downsampled.length > 0) {
    downsampled.push(downsampled[0]);
  }

  const simplifiedScreen = simplifyPolygon(downsampled, 0.05);
  if (simplifiedScreen.length > 1) {
    const p1 = simplifiedScreen[0];
    const pE = simplifiedScreen[simplifiedScreen.length - 1];
    const dist = Math.sqrt((p1.x - pE.x)**2 + (p1.y - pE.y)**2);
    if (dist < 1e-3) {
      simplifiedScreen.pop();
    }
  }

  const expandedScreen = expandPolygon(simplifiedScreen, 1.2);
  const canvasPoints = expandedScreen.map(pt => screenToCanvas(pt.x, pt.y));

  // Snap the detected polygon vertices to the exact CAD geometry features for precise areas (e.g., 25.00 mq)
  const snappedPoints = snapPolygonToGeometry(canvasPoints, entities, layers);
  const cleanedPoints = cleanSnappedPolygon(snappedPoints);

  return cleanedPoints;
};

function snapPolygonToGeometry(polyPoints: Point[], entities: Entity[], layers: Layer[]): Point[] {
  if (polyPoints.length < 3) return polyPoints;

  const landmarks: Point[] = [];
  
  // Exclude BIM elements, hatches, texts, and dimensions since they are not physical wall lines
  const physicalEntities = entities.filter(ent => {
    if (ent.isBIM || ent.type === 'hatch' || ent.type === 'text' || ent.type === 'dimension') return false;
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

    physicalEntities.forEach(ent => {
      if (ent.type === 'line') {
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
          }
        }
      }
    });

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

const isAngleInArc = (angle: number, startAngle: number, endAngle: number) => {
  const normAngle = normalizeAngle(angle);
  const normStart = normalizeAngle(startAngle);
  const normEnd = normalizeAngle(endAngle);
  if (normStart <= normEnd) {
      return normAngle >= normStart && normAngle <= normEnd;
  } else {
      return normAngle >= normStart || normAngle <= normEnd;
  }
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

const getBIMSymbolEntities = (type: string): { type: 'line' | 'circle' | 'arc' | 'text'; start?: Point; end?: Point; center?: Point; radius?: number; startAngle?: number; endAngle?: number; text?: string; color?: string }[] => {
  switch (type) {
    case 'punto_luce':
      return [
        { type: 'circle', center: { x: 0, y: 0 }, radius: 10 },
        { type: 'line', start: { x: -7, y: -7 }, end: { x: 7, y: 7 } },
        { type: 'line', start: { x: -7, y: 7 }, end: { x: 7, y: -7 } }
      ];
    case 'presa_standard':
      return [
        { type: 'arc', center: { x: 0, y: 0 }, radius: 8, startAngle: 180, endAngle: 360 },
        { type: 'line', start: { x: -8, y: 0 }, end: { x: 8, y: 0 } },
        { type: 'line', start: { x: -3, y: 0 }, end: { x: -3, y: -6 } },
        { type: 'line', start: { x: 0, y: 0 }, end: { x: 0, y: -6 } },
        { type: 'line', start: { x: 3, y: 0 }, end: { x: 3, y: -6 } }
      ];
    case 'interruttore':
      return [
        { type: 'line', start: { x: 0, y: 0 }, end: { x: 8, y: -8 } },
        { type: 'line', start: { x: 8, y: -8 }, end: { x: 11, y: -5 } }
      ];
    case 'deviatore':
      return [
        { type: 'line', start: { x: 0, y: 0 }, end: { x: 8, y: -8 } },
        { type: 'line', start: { x: 8, y: -8 }, end: { x: 11, y: -5 } },
        { type: 'line', start: { x: 0, y: 0 }, end: { x: -3, y: -3 } }
      ];
    case 'quadro':
      return [
        { type: 'line', start: { x: -10, y: -10 }, end: { x: 10, y: -10 } },
        { type: 'line', start: { x: 10, y: -10 }, end: { x: 10, y: 10 } },
        { type: 'line', start: { x: 10, y: 10 }, end: { x: -10, y: 10 } },
        { type: 'line', start: { x: -10, y: 10 }, end: { x: -10, y: -10 } },
        { type: 'line', start: { x: -10, y: -10 }, end: { x: 10, y: 10 } }
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

interface CADCanvasProps {
  entities: Entity[];
  activeTool: string;
  setActiveTool?: (tool: string) => void;
  setEntities: React.Dispatch<React.SetStateAction<Entity[]>>;
  setEntitiesSilent?: React.Dispatch<React.SetStateAction<Entity[]>>;
  onCommitHistory?: (entities: Entity[]) => void;
  onSelect: (id: string | null) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  activeLayerId: string;
  layers: Layer[];
  defaultLineStyle: { color: string, lineWidth: number, dashed: boolean, mode: 'ink' | 'pencil' | 'CAD' };
  setDefaultLineStyle: React.Dispatch<React.SetStateAction<{ color: string, lineWidth: number, dashed: boolean, mode: 'ink' | 'pencil' | 'CAD' }>>;
  eraserRadius: number;
  setEraserRadius: React.Dispatch<React.SetStateAction<number>>;
  onMouseMovePosition?: (pos: Point) => void;
  rulerStyle?: 'tecnigrafo' | 'crosshair';
  orthoMode?: boolean;
  setOrthoMode?: (val: boolean) => void;
  isContinuousMode?: boolean;
  cancelTrigger?: number;
  tavole?: Tavola[];
  onUpdateTavole?: (tavole: Tavola[]) => void;
  onDoubleClickTavola?: (id: string) => void;
  selectedTemplateId?: string | null;
  selectedEntityId?: string | null;
  selectedBIMSymbolType?: string | null;
  setSelectedBIMSymbolType?: (val: string | null) => void;
  defaultTextStyle?: { fontFamily: string, fontSize: number, fontWeight: string, textAlign: 'left' | 'center' | 'right' | 'justify' };
  raccordoConfig?: { type: 'curvo' | 'rettilineo'; value: number };
  onEditRaccordo?: (raccordoEntity: Entity) => void;
  onActionStart?: () => void;
  defaultHatchStyle?: {
    pattern: string;
    scale: number;
    angle: number;
    color: string;
  };
}

export const CADCanvas = React.forwardRef<CADCanvasAPI, CADCanvasProps>(({ entities, activeTool, setActiveTool, setEntities, setEntitiesSilent, onCommitHistory, onSelect, onContextMenu, activeLayerId, layers, defaultLineStyle, setDefaultLineStyle, defaultHatchStyle, defaultTextStyle = { fontFamily: 'sans-serif', fontSize: 14, fontWeight: 'normal', textAlign: 'left' }, eraserRadius, setEraserRadius, onMouseMovePosition, rulerStyle = 'tecnigrafo', orthoMode = false, setOrthoMode, isContinuousMode = false, cancelTrigger = 0, tavole, onUpdateTavole, onDoubleClickTavola, selectedTemplateId, selectedEntityId, selectedBIMSymbolType, setSelectedBIMSymbolType, raccordoConfig, onEditRaccordo, onActionStart }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ zoom: 0.15, pan: { x: window.innerWidth > 0 ? (window.innerWidth / 2) - 150 : 250, y: window.innerHeight > 0 ? (window.innerHeight / 2) - 220 : 80 } });
  const [dragTavolaId, setDragTavolaId] = useState<string | null>(null);
  const [hoverTavolaEdge, setHoverTavolaEdge] = useState(false);
  const dragTavolaIdRef = useRef<string | null>(null);
  useEffect(() => { dragTavolaIdRef.current = dragTavolaId; }, [dragTavolaId]);

  const [hoveredTavolaPart, setHoveredTavolaPart] = useState<{ id: string; part: 'cartiglio' | 'badge' } | null>(null);
  const [manualRoomPoints, setManualRoomPoints] = useState<Point[]>([]);

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
  }, [activeTool]);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastClickTimeRef = useRef<number>(0);
  const lastClickPosRef = useRef<{ x: number, y: number } | null>(null);
  const isHoldFiredRef = useRef<boolean>(false);
  const skipToolResetRef = useRef<boolean>(false);
  const isStickyCopyRef = useRef<boolean>(false);
  const dragHasMovedRef = useRef<boolean>(false);
  const [drawing, setDrawing] = useState<DrawingState | null>(null);
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
  const [highlightedTrimSegment, setHighlightedTrimSegment] = useState<{ type: 'line' | 'arc'; start?: Point; end?: Point; center?: Point; radius?: number; startAngle?: number; endAngle?: number } | null>(null);
  const [hoverSnap, setHoverSnap] = useState<{
    point: Point;
    snapped: boolean;
    type: 'CAD' | 'smart';
    refPoint?: Point;
    refEntityId?: string;
    constraintAxis?: 'x' | 'y';
    refPoint2?: Point;
    constraintAxis2?: 'x' | 'y';
    hasDoubleSmart?: boolean;
  } | null>(null);
  const [dragEntityId, setDragEntityId] = useState<string | null>(null);
  const dragEntityIdRef = useRef<string | null>(null);
  useEffect(() => { dragEntityIdRef.current = dragEntityId; }, [dragEntityId]);
  const [dragEntityIds, setDragEntityIds] = useState<string[]>([]);
  const [lockedFocalPoint, setLockedFocalPoint] = useState<Point | null>(null);
  const [tecnigrafoLock, setTecnigrafoLock] = useState<'x' | 'y' | null>(null);
  const [tecnigrafoOrigin, setTecnigrafoOrigin] = useState<Point | null>(null);
  const [activeMoveSnapPoint, setActiveMoveSnapPoint] = useState<Point | null>(null);
  const [selectionWindow, setSelectionWindow] = useState<{ start: Point; current: Point } | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({x: 0, y: 0});
  const [eraserPos, setEraserPos] = useState({x: 0, y: 0});
  const [parallelDistance, setParallelDistance] = useState<number>(() => {
    try {
        const saved = localStorage.getItem('lastParallelDistance');
        return saved ? parseFloat(saved) : 10;
    } catch(e) {
        return 10;
    }
  });
  const [parallelDistanceHistory, setParallelDistanceHistory] = useState<number[]>([]);
  const [parallelMouse, setParallelMouse] = useState<Point | null>(null);
  const [isParallelWheelActive, setIsParallelWheelActive] = useState(false);
  useEffect(() => {
    if (cancelTrigger > 0) {
      setDrawing(null);
    }
  }, [cancelTrigger]);

  const [isJollyActive, setIsJollyActive] = useState(false);
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
  const [positioningGroupId, setPositioningGroupId] = useState<string | null>(null);
  const [positioningGroupStartPos, setPositioningGroupStartPos] = useState<Point | null>(null);
  const [positioningEntityId, setPositioningEntityId] = useState<string | null>(null);
  const [positioningEntityStartPos, setPositioningEntityStartPos] = useState<Point | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [lastWallThickness, setLastWallThickness] = useState(() => parseFloat(localStorage.getItem('lastWallThickness') || '15'));
  const [lastDoorWidth, setLastDoorWidth] = useState(() => parseFloat(localStorage.getItem('lastDoorWidth') || '80'));
  const [lastDoorHeight, setLastDoorHeight] = useState(() => parseFloat(localStorage.getItem('lastDoorHeight') || '210'));
  const [lastWindowWidth, setLastWindowWidth] = useState(() => parseFloat(localStorage.getItem('lastWindowWidth') || '120'));
  const [lastWindowHeight, setLastWindowHeight] = useState(() => parseFloat(localStorage.getItem('lastWindowHeight') || '140'));
  const [bubblePosition, setBubblePosition] = useState<Point | null>(null);

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
  const lastEraseTimeByEntityId = useRef<Record<string, number>>({});
  const lastEraseTimeByPoint = useRef<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const fnStepValueRef = useRef<number>(0);
  const fnAnchorCanvasPosRef = useRef<Point | null>(null);
  const freehandOrthoAnchorRef = useRef<Point | null>(null);

  useEffect(() => {
    if (!drawing?.wheelLength && !isParallelWheelActive) {
        fnAnchorCanvasPosRef.current = null;
        fnStepValueRef.current = 0;
        setIsJollyActive(false);
    }
  }, [drawing?.wheelLength, isParallelWheelActive]);

  const isPrecisionActive = (drawing && drawing.wheelLength !== undefined) || 
                            (activeTool === 'Parallel' && selectedParallelLine && isParallelWheelActive);

  const resolveGroups = (ids: string[], currentEntities: Entity[]): string[] => {
    const groupIds = new Set<string>();
    currentEntities.forEach(ent => {
        if (ids.includes(ent.id) && ent.groupId) {
            groupIds.add(ent.groupId);
        }
    });
    
    if (groupIds.size === 0) return ids;
    
    const allIds = new Set(ids);
    currentEntities.forEach(ent => {
        if (ent.groupId && groupIds.has(ent.groupId)) {
            allIds.add(ent.id);
        }
    });
    return Array.from(allIds);
  };

  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const isShiftPressedRef = useRef(false);
  const isPanningRef = useRef(false);
  const [isZoomActive, setIsZoomActive] = useState(false);
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
        isShiftPressedRef.current = false;
      }
      if (e.key.toLowerCase() === 'z') {
        isZoomModeRef.current = false;
        setIsZoomActive(false);
        zoomFocusRef.current = null;
      }
    };

    const handleArrowsLine = (e: KeyboardEvent) => {
      if (activeTool !== 'Line' || showManualInput) return;
      
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!keys.includes(e.key)) return;

      e.preventDefault();
      
      // Get current snap point as start if not already drawing
      let currentStart = drawing?.start;
      if (!currentStart) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const rawMouse = screenToCanvas(mouseScreenPosRef.current.x - rect.left, mouseScreenPosRef.current.y - rect.top);
        const snapped = getSnappedPoint(rawMouse, entities, activeTool, null);
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
      setBubblePosition(screenPos);
      setShowManualInput(true);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      handleArrowsLine(e);
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
        isShiftPressedRef.current = true;
      }
      if (e.key.toLowerCase() === 'z') {
        isZoomModeRef.current = true;
        setIsZoomActive(true);
        zoomFocusRef.current = lastMouseRef.current;
      }
    };
    const handleBlur = () => {
      setIsShiftPressed(false);
      isShiftPressedRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown, { passive: true });
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

     if (activeTool === 'Parallel') {
        setShowManualInput(true);
        setBubblePosition(null); // Center screen
     }
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
    getCurrentMousePosition: () => lastMouseRef.current,
    rotateMaskAtPoint: (e: React.MouseEvent) => {
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
      config: { type: 'curvo' | 'rettilineo'; value: number },
      originalLine1: any,
      originalLine2: any
    ) => {
      applyRaccordo(id1, id2, clickPt1, clickPt2, existingRaccordoId, config, { originalLine1, originalLine2 });
    },
    setBIMDefaults: (width: number, height: number | undefined, type: 'door' | 'window' | 'wall') => {
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

      const detectedPolygons: Point[][] = [];

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

      // Loop through our screen search grid
      for (let c = 1; c < gridCols; c++) {
        for (let r = 1; r < gridRows; r++) {
          const x = c * stepX;
          const y = r * stepY;
          const screenPt = { x, y };

          const poly = findBoundaryPolygon(screenPt, entities, view, width, height, screenToCanvas, layers);
          if (poly && poly.length > 2) {
            const centroid = getCentroid(poly);
            const area = getArea(poly);
            const areaMq = area / 10000;

            // Rooms usually are between 1.0 mq and 150.0 mq
            if (areaMq < 1.0 || areaMq > 150) continue;

            // Check if duplicate of an existing detected polygon
            let isDuplicate = false;
            for (const existing of detectedPolygons) {
              const exCentroid = getCentroid(existing);
              const dist = Math.sqrt((centroid.x - exCentroid.x)**2 + (centroid.y - exCentroid.y)**2);
              const exArea = getArea(existing);
              const areaDiff = Math.abs(area - exArea) / exArea;

              // If centroid is extremely close or area is almost identical, it's the exact same Room!
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
        const areaMq = getArea(poly) / 10000;
        
        // Count templates located inside this boundary
        const furnitureInside = groupCentroids.filter(gc => isPointInPolygon(gc.center, poly));

        // Skip tiny "fictional" spaces (like window recesses, framing artifacts, door swings)
        // that do not contain any physical furniture or fixtures
        if (areaMq < 3.0 && furnitureInside.length === 0) {
          return;
        }

        // Also check bounding box of the polygon to reject long, narrow sills/recesses
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        poly.forEach(pt => {
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
          points: poly,
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

  const screenToCanvas = (x: number, y: number): Point => {
    return {
      x: (x - view.pan.x) / view.zoom,
      y: (y - view.pan.y) / view.zoom
    };
  };

  const getDampenedCoordinate = (actualRawPoint: Point, e?: React.MouseEvent | MouseEvent | KeyboardEvent): Point => {
    actualMousePosRef.current = actualRawPoint;
    lastControlledPointRef.current = actualRawPoint;
    return actualRawPoint;
  };

  const canvasToScreen = (x: number, y: number): Point => {
    return {
      x: x * view.zoom + view.pan.x,
      y: y * view.zoom + view.pan.y
    };
  };

  const getSnapPoints = (point: Point, entities: Entity[], activeTool: string, drawing: {start: Point, current: Point} | null): {point: Point, type: 'CAD' | 'smart', refPoint?: Point, refEntityId?: string, constraintAxis?: 'x' | 'y'}[] => {
    const snaps: {point: Point, type: 'CAD' | 'smart', refPoint?: Point, refEntityId?: string, constraintAxis?: 'x' | 'y'}[] = [];
    const keyPoints: Point[] = [];
    
    // Only snap to visible and non-frozen layers
    const visibleEntities = entities.filter(ent => {
        const layer = layers.find(l => l.id === ent.layer);
        // Exclude BIM doors and windows from snap references to avoid interference as requested
        const isBIMDoorWindow = ent.isBIM && (ent.bimType === 'door' || ent.bimType === 'window');
        return !(layer && (!layer.visible || layer.frozen)) && !isBIMDoorWindow;
    });

    visibleEntities.forEach(entity => {
      if (entity.type === 'line') {
        const line = entity as LineEntity;
        if (line.isBIM && line.bimType === 'wall') {
            const corners = getWallCorners(line, visibleEntities);
            corners.forEach(cp => {
                snaps.push({ point: cp, type: 'CAD', refPoint: cp, refEntityId: line.id });
                keyPoints.push(cp);
            });
        }
        snaps.push({point: entity.start, type: 'CAD', refPoint: entity.start});
        snaps.push({point: entity.end, type: 'CAD', refPoint: entity.end});
        const midPoint = {x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2};
        snaps.push({point: midPoint, type: 'CAD', refPoint: midPoint});
        keyPoints.push(entity.start);
        keyPoints.push(entity.end);
        keyPoints.push(midPoint);
      } else if (entity.type === 'circle') {
        snaps.push({point: entity.center, type: 'CAD', refPoint: entity.center});
        keyPoints.push(entity.center);
      } else if (entity.type === 'rectangle') {
        snaps.push({point: entity.p1, type: 'CAD', refPoint: entity.p1});
        snaps.push({point: entity.p2, type: 'CAD', refPoint: entity.p2});
        keyPoints.push(entity.p1);
        keyPoints.push(entity.p2);
      } else if (entity.type === 'arc') {
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
        snaps.push({point: pStart, type: 'CAD', refPoint: pStart});
        snaps.push({point: pEnd, type: 'CAD', refPoint: pEnd});
        keyPoints.push(pStart);
        keyPoints.push(pEnd);
      } else if (entity.type === 'point') {
        const p = entity.point || (entity as any).position;
        if (p) {
          snaps.push({point: p, type: 'CAD', refPoint: p});
          keyPoints.push(p);
        }
      } else if (entity.type === 'text') {
        snaps.push({point: entity.point, type: 'CAD', refPoint: entity.point});
        keyPoints.push(entity.point);
      }
    });

    // Add intersection points for lines
    for (let i = 0; i < visibleEntities.length; i++) {
        for (let j = i + 1; j < visibleEntities.length; j++) {
            const ent1 = visibleEntities[i];
            const ent2 = visibleEntities[j];

            if (ent1.type === 'line' && ent2.type === 'line') {
                const intersection = getIntersection(ent1.start, ent1.end, ent2.start, ent2.end);
                if (intersection) {
                    snaps.push({ point: intersection, type: 'CAD', refPoint: intersection });
                }
            }
        }
    }

    const isDrawingTool = ['Line', 'Circle', 'Arc', 'Rectangle', 'Hatch', 'Dimension', 'BIM_Muro', 'BIM_Porta', 'BIM_Finestra', 'BIM_Symbol', 'BIM_DisegnaStanza'].includes(activeTool);
    if (isDrawingTool && (drawing ? true : isShiftPressedRef.current)) {
        const threshold = 12 / view.zoom;
        const uniqueKeyPoints: Point[] = [];
        const seen = new Set<string>();
        keyPoints.forEach(kp => {
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

        // 2. Line Extension Snaps (Specific to inclined lines or existing orientations)
        visibleEntities.forEach(entity => {
            if (entity.type === 'line') {
                const line = entity as LineEntity;
                const dx = line.end.x - line.start.x;
                const dy = line.end.y - line.start.y;
                const L = Math.sqrt(dx * dx + dy * dy);
                if (L < 0.1) return;

                const nx = -dy / L;
                const ny = dx / L;
                
                const dist = (point.x - line.start.x) * nx + (point.y - line.start.y) * ny;
                if (Math.abs(dist) < threshold) {
                    const snapPt = { x: point.x - nx * dist, y: point.y - ny * dist };
                    const dStart = Math.sqrt((snapPt.x - line.start.x) ** 2 + (snapPt.y - line.end.x) ** 2);
                    const dEnd = Math.sqrt((snapPt.x - line.end.x) ** 2 + (snapPt.y - line.end.y) ** 2);
                    const refPoint = dStart < dEnd ? line.start : line.end;

                    const ang = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 180;
                    if (Math.abs(ang - 0) > 0.5 && Math.abs(ang - 90) > 0.5 && Math.abs(ang - 180) > 0.5) {
                        snaps.push({
                            point: snapPt,
                            type: 'smart',
                            refPoint: refPoint,
                            refEntityId: line.id
                        });
                    }
                }
            }
        });
    }
    
    return snaps;
  };

  const getSnappedPoint = (point: Point, entities: Entity[], activeTool: string, drawing: {start: Point, current: Point} | null): {
    point: Point;
    snapped: boolean;
    type: 'CAD' | 'smart';
    refPoint?: Point;
    refEntityId?: string;
    constraintAxis?: 'x' | 'y';
    refPoint2?: Point;
    constraintAxis2?: 'x' | 'y';
    hasDoubleSmart?: boolean;
  } => {
    const snaps = getSnapPoints(point, entities, activeTool, drawing);
    const threshold = 15 / view.zoom;
    
    let closestStandard = null;
    let minStandardDist = Infinity;

    for (const snap of snaps) {
      if (snap.type === 'CAD') {
        const dist = Math.sqrt((point.x - snap.point.x) ** 2 + (point.y - snap.point.y) ** 2);
        if (dist < threshold && dist < minStandardDist) {
          minStandardDist = dist;
          closestStandard = snap;
        }
      }
    }

    if (closestStandard) {
      return { 
        point: closestStandard.point, 
        snapped: true, 
        type: 'CAD', 
        refPoint: closestStandard.refPoint, 
        refEntityId: closestStandard.refEntityId,
        constraintAxis: closestStandard.constraintAxis 
      };
    }

    // Check for smart snaps only if standard snaps are not active
    const candidateSmartSnaps = snaps.filter(s => s.type === 'smart').map(s => {
      const dist = Math.sqrt((point.x - s.point.x) ** 2 + (point.y - s.point.y) ** 2);
      return { snap: s, dist };
    }).filter(item => item.dist < threshold);

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

  const getEntityAtPoint = (point: Point): Entity | undefined => {
    let bestEntity: Entity | undefined;
    let maxLineWidth = -1;

    for (const ent of entities) {
      const layer = layers.find(l => l.id === ent.layer);
      if (layer && (!layer.visible || layer.frozen)) continue;

      let hit = false;
      if (ent.type === 'line') {
        const dist = distanceToSegment(point, ent.start, ent.end);
        if (dist < 10 / view.zoom) hit = true;
        
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
                if (leafDist < 10 / view.zoom) hit = true;
                
                // Optional: check arc hit
                if (!hit) {
                    const distToCenter = Math.sqrt((point.x - ent.start.x) ** 2 + (point.y - ent.start.y) ** 2);
                    if (Math.abs(distToCenter - len) < 10 / view.zoom) {
                        const baseAngle = Math.atan2(ent.end.y - ent.start.y, ent.end.x - ent.start.x) * 180 / Math.PI;
                        const leafAngle = Math.atan2(leafEnd.y - ent.start.y, leafEnd.x - ent.start.x) * 180 / Math.PI;
                        const clickAngle = Math.atan2(point.y - ent.start.y, point.x - ent.start.x) * 180 / Math.PI;
                        
                        // We check if angle is between baseAngle and leafAngle
                        if (isAngleInArc(clickAngle, (ent as any).bimFlip ? leafAngle : baseAngle, (ent as any).bimFlip ? baseAngle : leafAngle)) {
                            hit = true;
                        }
                    }
                }
            }
        }
      } else if (ent.type === 'circle') {
        const dist = Math.sqrt((point.x - ent.center.x) ** 2 + (point.y - ent.center.y) ** 2);
        if (Math.abs(dist - ent.radius) < 10 / view.zoom) hit = true;
      } else if (ent.type === 'rectangle') {
        const minX = Math.min(ent.p1.x, ent.p2.x);
        const maxX = Math.max(ent.p1.x, ent.p2.x);
        const minY = Math.min(ent.p1.y, ent.p2.y);
        const maxY = Math.max(ent.p1.y, ent.p2.y);
        if (point.x >= minX - 5/view.zoom && point.x <= maxX + 5/view.zoom && point.y >= minY - 5/view.zoom && point.y <= maxY + 5/view.zoom) hit = true;
      } else if (ent.type === 'point') {
        const p = ent.point || (ent as any).position;
        if (p) {
            const dist = Math.sqrt((point.x - p.x) ** 2 + (point.y - p.y) ** 2);
            if (dist < 10 / view.zoom) hit = true;
        }
      } else if (ent.type === 'arc') {
         const dist = Math.sqrt((point.x - ent.center.x) ** 2 + (point.y - ent.center.y) ** 2);
         if (Math.abs(dist - ent.radius) < 10 / view.zoom) hit = true;
      } else if (ent.type === 'hatch') {
         const h = ent as any;
         if (h.points && isPointInPolygon(point, h.points)) hit = true;
      } else if (ent.type === 'dimension') {
        const dx = ent.end.x - ent.start.x;
        const dy = ent.end.y - ent.start.y;
        const L = Math.sqrt(dx * dx + dy * dy);
        if (L > 0) {
            const nx = -dy / L;
            const ny = dx / L;

            const p1 = { x: ent.start.x + nx * ent.offset, y: ent.start.y + ny * ent.offset };
            const p2 = { x: ent.end.x + nx * ent.offset, y: ent.end.y + ny * ent.offset };

            const dist = distanceToSegment(point, p1, p2);
            if (dist < 10 / view.zoom) hit = true;
        }
      } else if (ent.type === 'text') {
        const lines = ent.text.split('\n');
        const fontSize = ent.fontSize || 14;
        const maxLen = Math.max(...lines.map(l => l.length), 1);
        const w = (maxLen * fontSize * 0.55) / view.zoom;
        const h = (lines.length * fontSize * 1.25) / view.zoom;
        
        let offsetX = 0;
        if (ent.textAlign === 'center') offsetX = -w / 2;
        else if (ent.textAlign === 'right') offsetX = -w;
        
        const tx = ent.point.x + offsetX;
        const ty = ent.point.y;
        
        const pad = 6 / view.zoom;
        if (point.x >= tx - pad && point.x <= tx + w + pad &&
            point.y >= ty - pad && point.y <= ty + h + pad) {
            hit = true;
        }
      } else if (ent.type === 'hatch') {
        const h = ent as any;
        if (h.points && isPointInPolygon(point, h.points)) {
          hit = true;
        }
      } else if (ent.type === 'image') {
        const minX = ent.point.x;
        const maxX = ent.point.x + ent.width;
        const minY = ent.point.y;
        const maxY = ent.point.y + ent.height;
        if (point.x >= minX - 5/view.zoom && point.x <= maxX + 5/view.zoom && point.y >= minY - 5/view.zoom && point.y <= maxY + 5/view.zoom) {
          hit = true;
        }
      }
      
      if (hit) {
          const lw = ent.lineWidth || 1;
          if (lw > maxLineWidth) {
              maxLineWidth = lw;
              bestEntity = ent;
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
    overrideConfig?: { type: 'curvo' | 'rettilineo'; value: number },
    forceOriginalLines?: { originalLine1: LineEntity; originalLine2: LineEntity }
  ) => {
    const line1 = (forceOriginalLines ? forceOriginalLines.originalLine1 : entities.find(e => e.id === id1)) as LineEntity | undefined;
    const line2 = (forceOriginalLines ? forceOriginalLines.originalLine2 : entities.find(e => e.id === id2)) as LineEntity | undefined;
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

    // 2. Determine ray directions V1 and V2 starting from I towards click points
    let len1 = Math.sqrt((clickPt1.x - I.x) ** 2 + (clickPt1.y - I.y) ** 2);
    let V1 = { x: 0, y: 0 };
    if (len1 > 1e-3) {
      V1 = { x: (clickPt1.x - I.x) / len1, y: (clickPt1.y - I.y) / len1 };
    } else {
      let d1 = Math.sqrt((x1 - I.x) ** 2 + (y1 - I.y) ** 2);
      let d2 = Math.sqrt((x2 - I.x) ** 2 + (y2 - I.y) ** 2);
      let farPt = d1 > d2 ? line1.start : line1.end;
      let lenFar = Math.sqrt((farPt.x - I.x) ** 2 + (farPt.y - I.y) ** 2);
      if (lenFar > 1e-3) {
        V1 = { x: (farPt.x - I.x) / lenFar, y: (farPt.y - I.y) / lenFar };
      } else {
        if (!existingRaccordoId) {
          alert("Geometria del primo segmento non valida.");
        }
        return;
      }
    }

    let len2 = Math.sqrt((clickPt2.x - I.x) ** 2 + (clickPt2.y - I.y) ** 2);
    let V2 = { x: 0, y: 0 };
    if (len2 > 1e-3) {
      V2 = { x: (clickPt2.x - I.x) / len2, y: (clickPt2.y - I.y) / len2 };
    } else {
      let d3 = Math.sqrt((x3 - I.x) ** 2 + (y3 - I.y) ** 2);
      let d4 = Math.sqrt((x4 - I.x) ** 2 + (y4 - I.y) ** 2);
      let farPt = d3 > d4 ? line2.start : line2.end;
      let lenFar = Math.sqrt((farPt.x - I.x) ** 2 + (farPt.y - I.y) ** 2);
      if (lenFar > 1e-3) {
        V2 = { x: (farPt.x - I.x) / lenFar, y: (farPt.y - I.y) / lenFar };
      } else {
        if (!existingRaccordoId) {
          alert("Geometria del secondo segmento non valida.");
        }
        return;
      }
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

    // 4. Determine endpoints that lie on the rays pointing away from I
    const dot1 = (x1 - I.x) * V1.x + (y1 - I.y) * V1.y;
    const dot2 = (x2 - I.x) * V1.x + (y2 - I.y) * V1.y;
    const farEndpoint1 = dot1 > dot2 ? line1.start : line1.end;
    const maxLen1 = Math.max(dot1, dot2);

    const dot3 = (x3 - I.x) * V2.x + (y3 - I.y) * V2.y;
    const dot4 = (x4 - I.x) * V2.x + (y4 - I.y) * V2.y;
    const farEndpoint2 = dot3 > dot4 ? line2.start : line2.end;
    const maxLen2 = Math.max(dot3, dot4);

    // Check if configuration parameter is too large
    if (T > maxLen1 || T > maxLen2) {
      if (!existingRaccordoId) {
        alert(`Il parametro inserito (${pVal} cm - offset ${T.toFixed(1)} cm) è troppo grande rispetto alla lunghezza di una delle due linee.`);
      }
      return;
    }

    // 5. New clipped endpoints on both segments
    const C1 = { x: I.x + T * V1.x, y: I.y + T * V1.y };
    const C2 = { x: I.x + T * V2.x, y: I.y + T * V2.y };

    // Commit history
    onCommitHistory?.(entities);

    // Prepare modified lines
    const updatedLine1: LineEntity = {
      ...line1,
      start: farEndpoint1,
      end: C1
    };

    const updatedLine2: LineEntity = {
      ...line2,
      start: farEndpoint2,
      end: C2
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
      config: { type: config.type, value: config.value }
    };

    let newConnector: Entity;

    if (config.type === 'curvo') {
      // 6a. Arc-fillet construction
      const alpha = theta / 2;
      const V_bisect = { x: V1.x + V2.x, y: V1.y + V2.y };
      const lenBisect = Math.sqrt(V_bisect.x * V_bisect.x + V_bisect.y * V_bisect.y);
      if (lenBisect < 1e-4) return;
      V_bisect.x /= lenBisect;
      V_bisect.y /= lenBisect;

      const dist_bisect = pVal / Math.sin(alpha);
      const O = { x: I.x + dist_bisect * V_bisect.x, y: I.y + dist_bisect * V_bisect.y };

      const U1 = { x: C1.x - O.x, y: C1.y - O.y };
      const U2 = { x: C2.x - O.x, y: C2.y - O.y };

      const a1 = Math.atan2(U1.y, U1.x) * 180 / Math.PI;
      const a2 = Math.atan2(U2.y, U2.x) * 180 / Math.PI;

      // center O points to bisect of Ray 1 and Ray 2. The arc midpoint faces corner/I
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

    setEntities(prev => {
      let filtered = prev;
      if (existingRaccordoId) {
        filtered = filtered.filter(ent => ent.id !== existingRaccordoId);
      }
      const updated = filtered.map(ent => {
        if (ent.id === id1) return updatedLine1;
        if (ent.id === id2) return updatedLine2;
        return ent;
      });
      return isBothWalls ? updated : updated.concat(newConnector);
    });

    // Smooth cinematic camera transition to the focal point of the raccordo
    const canvas = canvasRef.current;
    if (canvas) {
      // Calculate a target zoom that puts the intersection point comfortably in view
      // We aim for a zoom level that feels like a "macro" shot of the detail
      const targetZoom = Math.min(2.5, 1.2); 
      const targetPan = {
          x: (canvas.width / 2) - I.x * targetZoom,
          y: (canvas.height / 2) - I.y * targetZoom
      };
      
      const startZoom = view.zoom;
      const startPan = { ...view.pan };
      const duration = 850; // Elegant, deliberate transition
      const startTime = performance.now();
      
      const animate = (time: number) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Cinematic Ease Out Quint for smooth landing
        const ease = 1 - Math.pow(1 - progress, 5);
        
        const currentZoom = startZoom + (targetZoom - startZoom) * ease;
        const currentPan = {
          x: startPan.x + (targetPan.x - startPan.x) * ease,
          y: startPan.y + (targetPan.y - startPan.y) * ease
        };
        
        setView({ zoom: currentZoom, pan: currentPan });
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      requestAnimationFrame(animate);
    }

    // Automatically trigger edit if it's a new raccordo or has onEditRaccordo
    if (onEditRaccordo) {
        onEditRaccordo(newConnector);
    }
  };
  const renderRef = useRef<(() => void) | null>(null);

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
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;

      // Always reset global state to prevent carry-over from previous frame (like semi-transparency)
      ctx.globalAlpha = 1.0;
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // Clear and draw based on view state
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#EFECE5'; // Vellum look (tracing paper)
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

      // Draw existing entities
      [...entities].sort((a, b) => {
        if (a.type === 'hatch' && b.type !== 'hatch') return -1;
        if (a.type !== 'hatch' && b.type === 'hatch') return 1;
        return 0;
      }).forEach(entity => {
        const layer = layers.find(l => l.id === entity.layer);
        if (layer && !layer.visible) return;
        
        const isFlashing = flashIds.includes(entity.id);

        ctx.strokeStyle = entity.color || ((entity.mode === 'pencil') ? '#bbbbbb' : (entity.mode === 'ink' ? '#000000' : '#000000'));
        ctx.lineWidth = getEffectiveCADRenderWidth(entity.lineWidth, entity.mode, view.zoom);
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
            ctx.lineWidth = getEffectiveCADRenderWidth(entity.lineWidth, entity.mode, view.zoom) + (2 + 3 * flashIntensity) / view.zoom;
            ctx.shadowColor = `rgba(34, 197, 94, ${0.6 * flashIntensity})`;
            ctx.shadowBlur = 10 * flashIntensity;
        }

        if ((entity.id === selectedParallelLine?.id && blink) || (selectedEntityId === entity.id) || (positioningGroupId && entity.groupId === positioningGroupId) || (positioningEntityId && entity.id === positioningEntityId) || selectedRaccordoLineIds.includes(entity.id)) {
          if (isFlashing) {
            // Let the flashing styles take precedence for initial attention blink
          } else if (entity.type === 'hatch') {
            ctx.strokeStyle = '#22c55e'; // Green highlight for selected hatch
            ctx.lineWidth = getEffectiveCADRenderWidth(entity.lineWidth, entity.mode, view.zoom) + 3 / view.zoom;
          } else {
            ctx.strokeStyle = '#fbbf24'; // Amber highlight
            ctx.lineWidth = getEffectiveCADRenderWidth(entity.lineWidth, entity.mode, view.zoom) + 2 / view.zoom;
          }
        } else if ((dragEntityIds.includes(entity.id) || entity.id === highlightedTrimLine?.id) && (activeTool === 'Move' || activeTool === 'Cancella' || activeTool === 'Join' || activeTool === 'Copy')) {
            ctx.strokeStyle = activeTool === 'Cancella' ? '#ef4444' : activeTool === 'Join' ? '#22c55e' : '#3b82f6';
            ctx.lineWidth = getEffectiveCADRenderWidth(entity.lineWidth, entity.mode, view.zoom) + 4 / view.zoom;
        } else if (copySourceEntityIds.includes(entity.id) && activeTool === 'Copy') {
            ctx.strokeStyle = '#22c55e'; // Green highlight for original mother object(s)
            ctx.lineWidth = getEffectiveCADRenderWidth(entity.lineWidth, entity.mode, view.zoom) + 4 / view.zoom;
        } else if (activeTool === 'Trim' && highlightedTrimSegment && entity.id === highlightedTrimLine?.id) {
            // Eraser highlight only
        }
        
        let isHighlighted = false;
        let highlightColor = ctx.strokeStyle;
        if (isFlashing) {
             isHighlighted = true;
        } else if ((entity.id === selectedParallelLine?.id && blink) || (selectedEntityId === entity.id) || (positioningGroupId && entity.groupId === positioningGroupId) || (positioningEntityId && entity.id === positioningEntityId) || selectedRaccordoLineIds.includes(entity.id)) {
             isHighlighted = true;
        } else if ((dragEntityIds.includes(entity.id) || entity.id === highlightedTrimLine?.id) && (activeTool === 'Move' || activeTool === 'Cancella' || activeTool === 'Join' || activeTool === 'Copy')) {
             isHighlighted = true;
        } else if (copySourceEntityIds.includes(entity.id) && activeTool === 'Copy') {
             isHighlighted = true;
        }

        if (entity.dashed) {
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
                  const startConns = entities.filter(e => e.type === 'line' && e.isBIM && e.bimType === 'wall' && e.id !== l.id) as LineEntity[];
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

                  const endConns = entities.filter(e => e.type === 'line' && e.isBIM && e.bimType === 'wall' && e.id !== l.id) as LineEntity[];
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
          } else if ((l.mode === 'ink' || l.mode === 'pencil') && l.isFreehand) {
              if (l.inkPoints) {
                  let lastX = l.start.x;
                  let lastY = l.start.y;
                  for(let i=0; i<l.inkPoints.length; i++) {
                      const pt = l.inkPoints[i];
                      const px = pt.x;
                      const py = pt.y;
     
                      ctx.beginPath();
                      // Per i pennini Kina usiamo lo spessore pieno in modo più netto, calcolato con la nuova logica
                      ctx.lineWidth = l.mode === 'ink' 
                          ? getEffectiveCADRenderWidth(l.lineWidth, l.mode, view.zoom) * (0.8 + pt.width * 0.4)
                          : Math.max(0.1, pt.width * (l.lineWidth / view.zoom));
                      ctx.strokeStyle = isHighlighted ? highlightColor : (l.mode === 'ink' ? '#000000' : getAlphaColor(l.color, pt.alpha));
                      ctx.moveTo(lastX, lastY);
                      ctx.lineTo(px, py);
                      ctx.stroke();
                      
                      lastX = px;
                      lastY = py;
                  }
              } else {
                  // Fallback for existing ink lines
                  const steps = 20;
                  const dx = l.end.x - l.start.x;
                  const dy = l.end.y - l.start.y;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  const nx = len > 0 ? -dy / len : 0;
                  const ny = len > 0 ? dx / len : 0;
                  let lastX = l.start.x;
                  let lastY = l.start.y;
                  for(let i=1; i<=steps; i++) {
                      const t = i/steps;
                      const bx = l.start.x + dx * t;
                      const by = l.start.y + dy * t;
                      const wave = Math.sin(t * Math.PI * 4) * (0.6 / view.zoom);
                      const px = bx + nx * wave;
                      const py = by + ny * wave;

                      ctx.beginPath();
                      ctx.lineWidth = l.mode === 'ink'
                          ? getEffectiveCADRenderWidth(l.lineWidth, l.mode, view.zoom)
                          : Math.max(0.2, (0.5 + Math.random() * 0.5) * (l.lineWidth / view.zoom));
                      ctx.strokeStyle = isHighlighted ? highlightColor : (l.mode === 'ink' ? '#000000' : getAlphaColor(l.color, 0.3 + Math.random() * 0.4));
                      ctx.moveTo(lastX, lastY);
                      ctx.lineTo(px, py);
                      ctx.stroke();
                      
                      lastX = px;
                      lastY = py;
                  }
              }
          } else if (l.mode === 'pencil' && l.isFreehand) {
              // Realistic pencil rendering
              const dx = l.end.x - l.start.x;
              const dy = l.end.y - l.start.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              if (len > 0.1) {
                  const steps = Math.max(10, Math.floor(len * 2));
                  let lastX = l.start.x;
                  let lastY = l.start.y;
                  ctx.strokeStyle = isHighlighted ? highlightColor : getAlphaColor(l.color, 0.4);
                  ctx.lineWidth = Math.max(0.1, 0.4 * (l.lineWidth / view.zoom));
                  for(let i=1; i<=steps; i++) {
                      const t = i/steps;
                      const px = l.start.x + dx * t + (Math.random() - 0.5) * (0.1 / view.zoom);
                      const py = l.start.y + dy * t + (Math.random() - 0.5) * (0.1 / view.zoom);
                      ctx.beginPath();
                      ctx.moveTo(lastX, lastY);
                      ctx.lineTo(px, py);
                      ctx.stroke();
                      lastX = px;
                      lastY = py;
                  }
              } else {
                  ctx.moveTo(l.start.x, l.start.y);
                  ctx.lineTo(l.end.x, l.end.y);
                  ctx.stroke();
              }
          } else {
              ctx.moveTo(l.start.x, l.start.y);
              ctx.lineTo(l.end.x, l.end.y);
              ctx.stroke();
          }
        } else if (entity.type === 'dimension') {
            const dx = entity.end.x - entity.start.x;
            const dy = entity.end.y - entity.start.y;
            const L = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / L;
            const ny = dx / L;

            const p1 = { x: entity.start.x + nx * entity.offset, y: entity.start.y + ny * entity.offset };
            const p2 = { x: entity.end.x + nx * entity.offset, y: entity.end.y + ny * entity.offset };
            
            // Define a fixed scale factor equivalent to a 200 unit length dimension
            const scaleFactor = 2.0;

            // Thinner line for dimensions
            ctx.lineWidth = (0.5 / view.zoom) * (Math.max(1, scaleFactor * 0.5));
            
            // Dimension line
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);

            // Extension lines (gampette) proportional to length
            const legBehind = 20 * scaleFactor;
            const legAhead = 8 * scaleFactor;
            const offsetDir = entity.offset >= 0 ? 1 : -1;
            
            ctx.moveTo(p1.x - nx * legBehind * offsetDir, p1.y - ny * legBehind * offsetDir);
            ctx.lineTo(p1.x + nx * legAhead * offsetDir, p1.y + ny * legAhead * offsetDir);

            ctx.moveTo(p2.x - nx * legBehind * offsetDir, p2.y - ny * legBehind * offsetDir);
            ctx.lineTo(p2.x + nx * legAhead * offsetDir, p2.y + ny * legAhead * offsetDir);

            // Inclined intersection slashes proportional to length
            const slashSize = 5 * scaleFactor;
            // Slash at p1
            ctx.moveTo(p1.x - nx * slashSize - ny * slashSize, p1.y - ny * slashSize + nx * slashSize);
            ctx.lineTo(p1.x + nx * slashSize + ny * slashSize, p1.y + ny * slashSize - nx * slashSize);
            // Slash at p2
            ctx.moveTo(p2.x - nx * slashSize - ny * slashSize, p2.y - ny * slashSize + nx * slashSize);
            ctx.lineTo(p2.x + nx * slashSize + ny * slashSize, p2.y + ny * slashSize - nx * slashSize);

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
            
            const numValue = Math.round(L * 100) / 100; // Round to max 2 decimal places to prevent float issues
            const valueStr = Number.isInteger(numValue) ? numValue.toString() : numValue.toFixed(2).replace('.', ',');
            ctx.fillText(entity.customText || valueStr, 0, 0);
            ctx.restore();
        } else if (entity.type === 'circle') {
          ctx.arc(entity.center.x, entity.center.y, entity.radius, 0, Math.PI * 2);
        } else if (entity.type === 'arc') {
          ctx.arc(entity.center.x, entity.center.y, entity.radius, entity.startAngle * Math.PI / 180, entity.endAngle * Math.PI / 180);
        } else if (entity.type === 'point') {
          ctx.beginPath();
          ctx.arc(entity.point.x, entity.point.y, 2 / view.zoom, 0, Math.PI * 2);
          ctx.fillStyle = '#000000'; // Force black points
          ctx.fill();
        } else if (entity.type === 'rectangle') {
          const width = entity.p2.x - entity.p1.x;
          const height = entity.p2.y - entity.p1.y;
          ctx.rect(entity.p1.x, entity.p1.y, width, height);
        } else if (entity.type === 'text') {
          ctx.font = `${entity.fontWeight || 'normal'} ${entity.fontSize / view.zoom}px ${entity.fontFamily || 'sans-serif'}`;
          ctx.fillStyle = entity.color || '#000000';
          ctx.textAlign = entity.textAlign || 'left';
          ctx.textBaseline = 'top';

          const lines = entity.text.split('\n');
          const lineHeight = (entity.fontSize * 1.25) / view.zoom;
          lines.forEach((line, idx) => {
            ctx.fillText(line, entity.point.x, entity.point.y + idx * lineHeight);
          });

          if (isHighlighted) {
            ctx.strokeStyle = highlightColor;
            ctx.lineWidth = 1 / view.zoom;
            // Draw a precise box around all lines of text
            const maxW = Math.max(...lines.map(line => ctx.measureText(line).width));
            const h = lines.length * lineHeight;
            let offsetX = 0;
            if (ctx.textAlign === 'center') offsetX = -maxW / 2;
            else if (ctx.textAlign === 'right') offsetX = -maxW;
            ctx.strokeRect(entity.point.x + offsetX - 4/view.zoom, entity.point.y - 4/view.zoom, maxW + 8/view.zoom, h + 8/view.zoom);
          }
        } else if (entity.type === 'hatch') {
          drawHatchPattern(ctx, entity, view.zoom);
          ctx.beginPath();
          if ((selectedEntityId === entity.id || isFlashing) && entity.points && entity.points.length >= 3) {
            ctx.moveTo(entity.points[0].x, entity.points[0].y);
            for (let i = 1; i < entity.points.length; i++) {
              ctx.lineTo(entity.points[i].x, entity.points[i].y);
            }
            ctx.closePath();
          }
        } else if (entity.type === 'image') {
          const img = entity as any;
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
        }
        ctx.stroke();

        if (activeTool === 'Trim' && highlightedTrimSegment && entity.id === highlightedTrimLine?.id) {
             // Draw red highlight for Trim
             ctx.strokeStyle = 'rgba(255,50,50,0.8)';
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
                 const lineHeight = (entity.fontSize * 1.25) / view.zoom;
                 const maxW = Math.max(...lines.map(line => ctx.measureText(line).width));
                 const h = lines.length * lineHeight;
                 let offsetX = 0;
                 if (ctx.textAlign === 'center') offsetX = -maxW / 2;
                 else if (ctx.textAlign === 'right') offsetX = -maxW;
                 ctx.rect(entity.point.x + offsetX - 4/view.zoom, entity.point.y - 4/view.zoom, maxW + 8/view.zoom, h + 8/view.zoom);
             }
             ctx.stroke();
        }
        ctx.setLineDash([]);
      });

      ctx.globalAlpha = 1.0;

      // Eraser cursor
      if (activeTool === 'Eraser') {
          ctx.save();
          
          // 1. Draw target indicator (semi-transparent dashed circular boundary for precision CAD work)
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
          ctx.lineWidth = 1 / view.zoom;
          ctx.setLineDash([4 / view.zoom, 4 / view.zoom]);
          ctx.beginPath();
          ctx.arc(eraserPos.x, eraserPos.y, eraserRadius / view.zoom, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]); // clear dash

          // 2. Draw classic red & blue pencil eraser cursor OR standard classic yellow technical eraser
          ctx.translate(eraserPos.x, eraserPos.y);
          ctx.rotate(-Math.PI / 8); // nice natural hand tilt

          const w = 15 / view.zoom;
          const h = 7 / view.zoom;

          if (defaultLineStyle.mode === 'pencil') {
              // Red/pink half (standard pencil graphite eraser face)
              ctx.fillStyle = '#e57373'; // Matte pinkish red
              ctx.beginPath();
              ctx.moveTo(-w, -h * 0.8);
              ctx.lineTo(-w, h * 0.8);
              ctx.quadraticCurveTo(-w - 2/view.zoom, 0, -w, -h * 0.8); // slight round tip
              ctx.lineTo(0, h);
              ctx.lineTo(0, -h);
              ctx.closePath();
              ctx.fill();
              
              // Red detail highlight/shadow
              ctx.strokeStyle = '#c62828';
              ctx.lineWidth = 1 / view.zoom;
              ctx.beginPath();
              ctx.moveTo(-w, -h * 0.8);
              ctx.lineTo(0, -h);
              ctx.stroke();

              // Blue half (hard ink eraser face)
              ctx.fillStyle = '#1e88e5'; // Blue color
              ctx.beginPath();
              ctx.moveTo(0, -h);
              ctx.lineTo(0, h);
              ctx.lineTo(w - 2/view.zoom, h);
              ctx.lineTo(w, -h * 0.5); // chisel angled edge
              ctx.lineTo(w - 2/view.zoom, -h);
              ctx.closePath();
              ctx.fill();

              // Blue detail shadow
              ctx.strokeStyle = '#1565c0';
              ctx.lineWidth = 1 / view.zoom;
              ctx.beginPath();
              ctx.moveTo(0, -h);
              ctx.lineTo(w - 2/view.zoom, -h);
              ctx.lineTo(w, -h * 0.5);
              ctx.stroke();

              // White separation line in the middle
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
              ctx.lineWidth = 1.5 / view.zoom;
              ctx.beginPath();
              ctx.moveTo(0, -h);
              ctx.lineTo(0, h);
              ctx.stroke();
          } else {
              // Classic yellow technical ink eraser block (Rotring/Koh-I-Noor style)
              ctx.fillStyle = '#ffcc00'; // Technical drawing yellow
              ctx.beginPath();
              ctx.moveTo(-w, -h);
              ctx.lineTo(-w, h);
              ctx.lineTo(w - 2/view.zoom, h);
              ctx.lineTo(w, h * 0.4); // chisel wedge look
              ctx.lineTo(w, -h * 0.4);
              ctx.lineTo(w - 2/view.zoom, -h);
              ctx.closePath();
              ctx.fill();

              // Orange shadow highlight for high-quality definition
              ctx.strokeStyle = '#d97706';
              ctx.lineWidth = 1 / view.zoom;
              ctx.beginPath();
              ctx.moveTo(-w, -h);
              ctx.lineTo(w - 2/view.zoom, -h);
              ctx.lineTo(w, -h * 0.4);
              ctx.moveTo(w - 2/view.zoom, h);
              ctx.lineTo(w, h * 0.4);
              ctx.stroke();
              
              // Outer paper/cardboard wrap sleeves (classic Koh-I-Noor yellow erasers have a nice white paper sleeve)
              ctx.fillStyle = '#ffffff'; // Pristine white cover
              ctx.beginPath();
              ctx.moveTo(-w * 0.7, -h * 1.05);
              ctx.lineTo(-w * 0.7, h * 1.05);
              ctx.lineTo(w * 0.1, h * 1.05);
              ctx.lineTo(w * 0.1, -h * 1.05);
              ctx.closePath();
              ctx.fill();

              // Brand logo stripe/details on paper sleeve (e.g., orange thin stripe and black technical text bar)
              ctx.fillStyle = '#374151'; // Dark graphite brand text bar
              ctx.beginPath();
              ctx.moveTo(-w * 0.45, -h * 1.05);
              ctx.lineTo(-w * 0.45, h * 1.05);
              ctx.lineTo(-w * 0.25, h * 1.05);
              ctx.lineTo(-w * 0.25, -h * 1.05);
              ctx.closePath();
              ctx.fill();

              // Orange accent dot on the sleeve
              ctx.fillStyle = '#ea580c';
              ctx.beginPath();
              ctx.arc(-w * 0.1, 0, 1.5 / view.zoom, 0, Math.PI * 2);
              ctx.fill();
          }

          ctx.restore();
      }

      // Draw Tecnigrafo "Squadretta" (Drafting Machine Effect)
      // We draw this before the drawing preview so the "pen" appears to write on top of it.
      if (tecnigrafoOrigin) {
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
      }

      // Draw Tecnigrafo measurement label while drawing
      if (drawing && tecnigrafoOrigin && (activeTool === 'Line' || activeTool === 'Mano Libera' || activeTool === 'Pencil')) {
          const dist = Math.sqrt(Math.pow(actualMousePosRef.current.x - drawing.start.x, 2) + Math.pow(actualMousePosRef.current.y - drawing.start.y, 2));
          if (dist > 0.1) {
              ctx.save();
              const labelX = actualMousePosRef.current.x + 15 / view.zoom;
              const labelY = actualMousePosRef.current.y - 15 / view.zoom;
              
              const text = dist.toFixed(1);
              ctx.font = `${12 / view.zoom}px Inter, sans-serif`;
              const metrics = ctx.measureText(text);
              const padding = 4 / view.zoom;
              
              ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'; 
              ctx.beginPath();
              ctx.roundRect(labelX - padding, labelY - 12/view.zoom - padding, metrics.width + padding*2, 14/view.zoom + padding*2, 4/view.zoom);
              ctx.fill();
              
              ctx.fillStyle = '#ffffff';
              ctx.fillText(text + (defaultLineStyle.mode === 'ink' ? ' (HB)' : ''), labelX, labelY);
              ctx.restore();
          }
      }

      // --- BIM LIVE PREVIEWS (STARTS) ---
      if (activeTool === 'BIM_DisegnaStanza' && manualRoomPoints.length > 0) {
        ctx.save();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5 / view.zoom;
        ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
        ctx.beginPath();
        ctx.moveTo(manualRoomPoints[0].x, manualRoomPoints[0].y);
        for (let i = 1; i < manualRoomPoints.length; i++) {
          ctx.lineTo(manualRoomPoints[i].x, manualRoomPoints[i].y);
        }
        // Draw to current mouse pos
        ctx.lineTo(actualMousePosRef.current.x, actualMousePosRef.current.y);
        ctx.stroke();
        ctx.fill();

        // Draw circles at corners
        manualRoomPoints.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4 / view.zoom, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();
        });
        ctx.restore();
      }

      if (drawing && (activeTool === 'BIM_Porta' || activeTool === 'BIM_Finestra' || activeTool === 'BIM_Muro')) {
        ctx.save();
        const start = drawing.start;
        const end = drawing.current || actualMousePosRef.current;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.sqrt(dx * dx + dy * dy);

        if (activeTool === 'BIM_Muro' && len > 0.1) {
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

        if (activeTool === 'BIM_Porta' && len > 0.1) {
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
      if (drawing && (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Rectangle' || activeTool === 'Arc')) {
        let isKnownAngle = false;
        let matchedAngle = 0;
        if (activeTool === 'Line') {
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
            ctx.setLineDash([]);
            let lastPt = drawing.freehandPoints[0];
            for (let i = 1; i < drawing.freehandPoints.length; i++) {
                const pt = drawing.freehandPoints[i];
                // Pseudo-random but stable stroke thickness & opacity based on index
                const widthSeed = (0.5 + ((i % 5) * 0.1)); // values from 0.5 to 0.9
                const alphaSeed = (0.5 + ((i % 3) * 0.1)); // values from 0.5 to 0.7
                ctx.beginPath();
                ctx.lineWidth = defaultLineStyle.mode === 'ink'
                    ? getEffectiveCADRenderWidth(defaultLineStyle.lineWidth, defaultLineStyle.mode, view.zoom) * (0.8 + widthSeed * 0.2)
                    : Math.max(0.4, widthSeed * (defaultLineStyle.lineWidth / view.zoom));
                ctx.strokeStyle = defaultLineStyle.mode === 'ink' 
                    ? '#000000' 
                    : getAlphaColor(defaultLineStyle.color, alphaSeed);
                ctx.moveTo(lastPt.x, lastPt.y);
                ctx.lineTo(pt.x, pt.y);
                ctx.stroke();
                lastPt = pt;
            }
            ctx.restore();
        } else {
            ctx.strokeStyle = drawing.isVirtual
                ? '#9ca3af' // Gray for virtual
                : (isKnownAngle 
                    ? '#22c55e' 
                    : (defaultLineStyle.color || ((defaultLineStyle.mode === 'pencil') ? 'rgba(187, 187, 187, 0.5)' : (defaultLineStyle.mode === 'ink' ? '#000000' : 'rgba(0, 0, 0, 1.0)'))));
            ctx.lineWidth = drawing.wheelLength !== undefined 
                ? 4 / view.zoom 
                : (defaultLineStyle.mode === 'ink' 
                    ? getEffectiveCADRenderWidth(defaultLineStyle.lineWidth, defaultLineStyle.mode, view.zoom) 
                    : (defaultLineStyle.mode === 'CAD' ? defaultLineStyle.lineWidth / view.zoom : 2 / view.zoom));
            ctx.setLineDash((defaultLineStyle.mode === 'CAD') ? [] : [5, 5]);
            ctx.beginPath();
            if (activeTool === 'Line') {
                if (drawing.wheelLength !== undefined) {
                    const steps = 20;
                    const dx = drawing.current.x - drawing.start.x;
                    const dy = drawing.current.y - drawing.start.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const nx = -dy / len;
                    const ny = dx / len;
                    
                    let lastX = drawing.start.x;
                    let lastY = drawing.start.y;
                    for(let i=1; i<=steps; i++) {
                        const t = i/steps;
                        const bx = drawing.start.x + dx * t;
                        const by = drawing.start.y + dy * t;
                        const wave = Math.sin(t * Math.PI * 4) * (0.6 / view.zoom);
                        const px = bx + nx * wave;
                        const py = by + ny * wave;

                        ctx.beginPath();
                        ctx.lineWidth = Math.max(0.2, (0.5 + Math.random() * 0.5) * (2 / view.zoom));
                        ctx.strokeStyle = getAlphaColor(defaultLineStyle.color, 0.3 + Math.random() * 0.4);
                        ctx.moveTo(lastX, lastY);
                        ctx.lineTo(px, py);
                        ctx.stroke();
                        
                        lastX = px;
                        lastY = py;
                    }
                } else {
                    const progress = drawingProgressRef.current;
                    const endX = drawing.start.x + (drawing.current.x - drawing.start.x) * progress;
                    const endY = drawing.start.y + (drawing.current.y - drawing.start.y) * progress;
                    ctx.moveTo(drawing.start.x, drawing.start.y);
                    ctx.lineTo(endX, endY);
                }
            } else if (activeTool === 'Circle') {
                const radius = Math.sqrt(Math.pow(drawing.current.x - drawing.start.x, 2) + Math.pow(drawing.current.y - drawing.start.y, 2));
                ctx.arc(drawing.start.x, drawing.start.y, radius, 0, Math.PI * 2);
            } else if (activeTool === 'Rectangle') {
                const width = drawing.current.x - drawing.start.x;
                const height = drawing.current.y - drawing.start.y;
                ctx.rect(drawing.start.x, drawing.start.y, width, height);
            } else if (activeTool === 'Arc') {
                if (!drawing.arcStartPoint) {
                    // Previewing radius line
                    const radius = Math.sqrt(Math.pow(drawing.current.x - drawing.start.x, 2) + Math.pow(drawing.current.y - drawing.start.y, 2));
                    ctx.arc(drawing.start.x, drawing.start.y, radius, 0, Math.PI * 2);
                    ctx.moveTo(drawing.start.x, drawing.start.y);
                    ctx.lineTo(drawing.current.x, drawing.current.y);
                } else {
                    // Previewing arc angle
                    const radius = Math.sqrt(Math.pow(drawing.arcStartPoint.x - drawing.start.x, 2) + Math.pow(drawing.arcStartPoint.y - drawing.start.y, 2));
                    let startAngle = Math.atan2(drawing.arcStartPoint.y - drawing.start.y, drawing.arcStartPoint.x - drawing.start.x) * 180 / Math.PI;
                    let endAngle = Math.atan2(drawing.current.y - drawing.start.y, drawing.current.x - drawing.start.x) * 180 / Math.PI;
                    
                    startAngle = (startAngle + 360) % 360;
                    endAngle = (endAngle + 360) % 360;

                    const diff = endAngle - startAngle;
                    if (isShiftPressedRef.current) {
                        const temp = startAngle;
                        startAngle = endAngle;
                        endAngle = temp;
                    }

                    ctx.arc(drawing.start.x, drawing.start.y, radius, startAngle * Math.PI / 180, endAngle * Math.PI / 180);
                    
                    // Draw indicator line to cursor
                    ctx.moveTo(drawing.start.x, drawing.start.y);
                    ctx.lineTo(drawing.current.x, drawing.current.y);
                }
            }
            ctx.stroke();
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

        if (!drawing.isFreehand) {
            // Real-time measurement tooltip with emerald color indicator when wheel is tuning
            const tooltipDx = drawing.current.x - drawing.start.x;
            const tooltipDy = drawing.current.y - drawing.start.y;
            const tooltipLength = Math.sqrt(tooltipDx * tooltipDx + tooltipDy * tooltipDy);
            
            ctx.save();
            ctx.font = `bold ${11 / view.zoom}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
        
        const formatPrecision = (val: number) => {
            if (Number.isInteger(val)) return val.toString();
            const roundedVal = Math.round(val * 100) / 100;
            return roundedVal.toString().replace('.', ',');
        };

        let label = '';
        if (activeTool === 'Line') {
            label = `L = ${formatPrecision(tooltipLength)}`;
        } else if (activeTool === 'Circle') {
            label = `R = ${formatPrecision(tooltipLength)}`;
        } else if (activeTool === 'Arc') {
            if (!drawing.arcStartPoint) {
                label = `R = ${formatPrecision(tooltipLength)}`;
            } else {
                let currentAngle = Math.atan2(drawing.current.y - drawing.start.y, drawing.current.x - drawing.start.x) * 180 / Math.PI;
                currentAngle = (currentAngle + 360) % 360;
                label = `A = ${formatPrecision(currentAngle)}°`;
            }
        } else if (activeTool === 'Rectangle') {
            const w = Math.abs(tooltipDx);
            const h = Math.abs(tooltipDy);
            label = `W: ${formatPrecision(w)}  H: ${formatPrecision(h)}`;
        }

        if (label) {
            const tooltipX = drawing.current.x + 12 / view.zoom;
            const tooltipY = drawing.current.y + 12 / view.zoom;
            
            const metrics = ctx.measureText(label);
            const padW = 6 / view.zoom;
            const padH = 4 / view.zoom;
            const bgW = metrics.width + padW * 2;
            const bgH = 15 / view.zoom;
            
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.beginPath();
            ctx.roundRect(tooltipX, tooltipY, bgW, bgH, 4 / view.zoom);
            ctx.fill();
            
            ctx.strokeStyle = drawing.wheelLength !== undefined ? '#10b981' : '#64748b';
            ctx.lineWidth = 1 / view.zoom;
            ctx.stroke();
            
            ctx.fillStyle = drawing.wheelLength !== undefined ? '#34d399' : '#f8fafc';
            ctx.fillText(label, tooltipX + padW, tooltipY + 2 / view.zoom);
        }
        ctx.restore();
        
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
        if (activeTool === 'Template' && selectedTemplateId && hoverSnap) {
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
        if (activeTool === 'BIM_Symbol' && selectedBIMSymbolType && hoverSnap) {
            const isElectrical = ['punto_luce', 'presa_standard', 'interruttore', 'deviatore', 'quadro'].includes(selectedBIMSymbolType);
            const targetColor = isElectrical ? '#fbbf24' : '#60a5fa';
            
            ctx.save();
            ctx.strokeStyle = targetColor;
            ctx.lineWidth = 1.5 / view.zoom;
            ctx.globalAlpha = 0.65;
            
            const basePos = hoverSnap.point;
            const geomList = getBIMSymbolEntities(selectedBIMSymbolType);
            
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

        // Render snap indicator
        if (drawing.snapType === 'smart') {
            const currentSnaps = getSnapPoints(drawing.current, entities, activeTool, drawing);
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
            ctx.strokeStyle = drawing.snapType === 'smart' ? '#22c55e' : '#fbbf24';
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
                ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
                ctx.strokeStyle = '#9ca3af';
                ctx.lineWidth = 1 / view.zoom;
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
        }
      }

      const isFreehandMode = activeTool === 'Line' && (defaultLineStyle.mode === 'pencil' || defaultLineStyle.mode === 'ink') && !orthoMode;

      // Render hover snap indicator
      if (!drawing && !isFreehandMode && hoverSnap && hoverSnap.snapped) {
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

        ctx.strokeStyle = hoverSnap.type === 'smart' ? '#22c55e' : '#fbbf24';
        ctx.lineWidth = 2 / view.zoom;
        ctx.beginPath();
        ctx.rect(hoverSnap.point.x - 5/view.zoom, hoverSnap.point.y - 5/view.zoom, 10/view.zoom, 10/view.zoom);
        ctx.stroke();

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
                ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 1 / view.zoom;
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

      // Draw visible Tavole (Sheet templates) in CAD model units
      if (tavole) {
        tavole.forEach(tav => {
          if (!tav.visible) return;
          
          ctx.save();
          
          const { w, h } = getTavolaDimensions(tav);
          
          // Draw thin dashed sheet outline
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 1.5 / view.zoom;
          ctx.setLineDash([5 / view.zoom, 4 / view.zoom]);
          ctx.strokeRect(tav.position.x, tav.position.y, w, h);
          
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
          let pString = tav.datiCartiglio?.progetto || "GECOLA CAD";
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

        // Draw Room
        if (entity.bimType === 'room') {
          const roomPoints = (entity as any).bimPoints || (entity as any).points;
          if (roomPoints && roomPoints.length > 2) {
            ctx.save();
            // Solid transparent fill
            ctx.fillStyle = entity.color || 'rgba(16, 185, 129, 0.12)';
            ctx.beginPath();
            ctx.moveTo(roomPoints[0].x, roomPoints[0].y);
            for (let i = 1; i < roomPoints.length; i++) {
              ctx.lineTo(roomPoints[i].x, roomPoints[i].y);
            }
            ctx.closePath();
            ctx.fill();

            // Outline
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
            ctx.lineWidth = 1.5 / view.zoom;
            ctx.stroke();

            // Calculate Centroid (average points)
            let cx = 0, cy = 0;
            roomPoints.forEach((p: Point) => {
              cx += p.x;
              cy += p.y;
            });
            cx /= roomPoints.length;
            cy /= roomPoints.length;

            // Compute Area using shoelace formula
            let area = 0;
            const len = roomPoints.length;
            for (let i = 0; i < len; i++) {
              const p1 = roomPoints[i];
              const p2 = roomPoints[(i + 1) % len];
              area += p1.x * p2.y - p2.x * p1.y;
            }
            area = Math.abs(area) / 2;

            const areaMq = area / 10000;
            const perimeterM = roomPoints.reduce((acc: number, p: Point, idx: number) => {
              const nextP = roomPoints[(idx + 1) % len];
              const dist = Math.sqrt((nextP.x - p.x)**2 + (nextP.y - p.y)**2);
              return acc + dist;
            }, 0) / 100; // Assuming 1 unit = 1 cm

            const textSz = Math.max(8, Math.min(13, 11 / view.zoom));
            const padding = 6 / view.zoom;

            ctx.font = `bold ${textSz}px sans-serif`;
            const nameLabel = `${entity.bimName || 'Stanza'}`;
            const areaLabel = `${areaMq.toFixed(2)} mq`;
            const perimeterLabel = `P: ${perimeterM.toFixed(2)} m`;
            const volLabel = entity.bimHeight ? `V: ${(areaMq * entity.bimHeight).toFixed(1)} mc` : '';

            const nameW = ctx.measureText(nameLabel).width;
            const areaW = ctx.measureText(areaLabel).width;
            const perW = ctx.measureText(perimeterLabel).width;
            const maxW = Math.max(nameW, areaW, perW);
            
            const lineCount = entity.bimHeight ? 4 : 3;
            const boxH = lineCount * textSz + 2 * padding;
            const boxW = maxW + 2 * padding;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 1 / view.zoom;
            
            ctx.fillRect(cx - boxW/2, cy - boxH/2, boxW, boxH);
            ctx.strokeRect(cx - boxW/2, cy - boxH/2, boxW, boxH);

            ctx.fillStyle = '#065f46';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            
            ctx.fillText(nameLabel, cx, cy - boxH/2 + padding);
            ctx.fillStyle = '#111827';
            ctx.font = `${textSz * 0.9}px sans-serif`;
            ctx.fillText(areaLabel, cx, cy - boxH/2 + padding + textSz * 1.1);
            ctx.fillStyle = '#4b5563';
            ctx.fillText(perimeterLabel, cx, cy - boxH/2 + padding + textSz * 2.1);
            if (entity.bimHeight) {
              ctx.fillText(volLabel, cx, cy - boxH/2 + padding + textSz * 3.1);
            }
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

            ctx.fillStyle = '#dc2626';
            ctx.font = `bold ${9 / view.zoom}px sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            const labelOffset = (entity as any).bimFlip ? -10 : 10;
            ctx.fillText(`P. ${entity.bimWidth || Math.round(len)}`, (start.x + end.x)/2 + px * labelOffset / view.zoom, (start.y + end.y)/2 + py * labelOffset / view.zoom);
            ctx.restore();
          }
        }

        // Draw Window
        if (entity.bimType === 'window') {
          const start = (entity as any).start;
          const end = (entity as any).end;
          if (start && end) {
            ctx.save();
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = len > 0 ? -dy / len : 0;
            const ny = len > 0 ? dx / len : 0;
            const wWidth = 10;

            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 1.5 / view.zoom;
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.moveTo(start.x + nx * wWidth/2, start.y + ny * wWidth/2);
            ctx.lineTo(end.x + nx * wWidth/2, end.y + ny * wWidth/2);
            ctx.moveTo(start.x - nx * wWidth/2, start.y - ny * wWidth/2);
            ctx.lineTo(end.x - nx * wWidth/2, end.y - ny * wWidth/2);
            ctx.moveTo(start.x - nx * wWidth/2, start.y - ny * wWidth/2);
            ctx.lineTo(start.x + nx * wWidth/2, start.y + ny * wWidth/2);
            ctx.moveTo(end.x - nx * wWidth/2, end.y - ny * wWidth/2);
            ctx.lineTo(end.x + nx * wWidth/2, end.y + ny * wWidth/2);
            ctx.stroke();

            ctx.fillStyle = '#2563eb';
            ctx.font = `bold ${9 / view.zoom}px sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            const hText = entity.bimWindowHeight ? `x${entity.bimWindowHeight}` : '';
            ctx.fillText(`F. ${entity.bimWidth || Math.round(len)}${hText}`, (start.x + end.x)/2 + nx * 12 / view.zoom, (start.y + end.y)/2 + ny * 12 / view.zoom);
            ctx.restore();
          }
        }
      });
      // --- BIM OVERLAY RENDERING PASS (ENDS) ---

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
              ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
              ctx.strokeStyle = '#f97316';
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
        ctx.arc(activeMoveSnapPoint.x, activeMoveSnapPoint.y, 4 / view.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw current drawing preview

      // Draw Parallel distance history
      // Draw Parallel preview
      if (activeTool === 'Parallel' && selectedParallelLine && parallelMouse) {
          ctx.save();
          ctx.translate(view.pan.x, view.pan.y);
          ctx.scale(view.zoom, view.zoom);
          ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
          ctx.strokeStyle = '#f59e0b'; // Amber 500
          ctx.lineWidth = 1.5 / view.zoom;
          
          const line = selectedParallelLine as LineEntity;
          const dxLine = line.end.x - line.start.x;
          const dyLine = line.end.y - line.start.y;
          const L = Math.sqrt(dxLine * dxLine + dyLine * dyLine);
          if (L > 0) {
              const normX = -dyLine / L;
              const normY = dxLine / L;
              
              const vecMouse = { x: parallelMouse.x - line.start.x, y: parallelMouse.y - line.start.y };
              const sign = isParallelWheelActive ? parallelSign : ((vecMouse.x * normX + vecMouse.y * normY) >= 0 ? 1 : -1);
              const offset = parallelDistance * sign;
              
              ctx.beginPath();
              ctx.moveTo(line.start.x + normX * offset, line.start.y + normY * offset);
              ctx.lineTo(line.end.x + normX * offset, line.end.y + normY * offset);
              ctx.stroke();

              // Draw distance indicator lines (perpendicular connectors)
              ctx.save();
              ctx.setLineDash([2 / view.zoom, 4 / view.zoom]);
              ctx.strokeStyle = '#f59e0b99'; // Semi-transparent amber
              
              // Connector at start
              ctx.beginPath();
              ctx.moveTo(line.start.x, line.start.y);
              ctx.lineTo(line.start.x + normX * offset, line.start.y + normY * offset);
              ctx.stroke();

              // Connector at end
              ctx.beginPath();
              ctx.moveTo(line.end.x, line.end.y);
              ctx.lineTo(line.end.x + normX * offset, line.end.y + normY * offset);
              ctx.stroke();
              ctx.restore();
              
              // Display current distance
              const distLabel = `Dist: ${parallelDistance.toFixed(1)}`;
              ctx.font = `bold ${12/view.zoom}px sans-serif`;
              const metrics = ctx.measureText(distLabel);
              const pad = 6 / view.zoom;
              const bgW = metrics.width + pad * 2;
              const bgH = 18 / view.zoom;
              const posX = parallelMouse.x + 12/view.zoom;
              const posY = parallelMouse.y + 12/view.zoom;
              
              ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
              ctx.beginPath();
              ctx.roundRect(posX, posY, bgW, bgH, 4 / view.zoom);
              ctx.fill();
              
              ctx.strokeStyle = isParallelWheelActive ? '#10b981' : '#f59e0b';
              ctx.lineWidth = 1 / view.zoom;
              ctx.stroke();
              
              ctx.fillStyle = isParallelWheelActive ? '#34d399' : '#ffffff';
              ctx.fillText(distLabel, posX + pad, posY + 13 / view.zoom);
          }
          ctx.restore();
          ctx.setLineDash([]);
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
              const snappedPoint = getSnappedPoint(rawPoint, entities, activeTool, { type: 'line', start: specchioAxisPt1, current: rawPoint } as any).snapped ? getSnappedPoint(rawPoint, entities, activeTool, { type: 'line', start: specchioAxisPt1, current: rawPoint } as any).point : rawPoint;
              let finalPt2 = snappedPoint;
              if (orthoMode) {
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

      // LENTE INGRANDIMENTO HUD FOR PRECISION MODE (Right click activated)
      const isPrecisionModeActive = (drawing && drawing.wheelLength !== undefined);
      
      if (isPrecisionModeActive) {
          // Identify the exact physical point in canvas units of the object being drawn / matched
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
                  // Midpoint of the offsets
                  targetCanvasPos = {
                      x: (line.start.x + line.end.x) / 2 + normX * offset,
                      y: (line.start.y + line.end.y) / 2 + normY * offset
                  };
              }
          }

          const targetScreenPoint = canvasToScreen(targetCanvasPos.x, targetCanvasPos.y);
          
          ctx.save();
          // Reset current canvas transform to identity to render in absolute screen pixels
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          
          const bubbleRadius = 85; // Slightly larger for better readability
          // Offset the bubble up & right from the target spot so it doesn't obstruct target view
          const bubbleCx = targetScreenPoint.x + 120;
          const bubbleCy = targetScreenPoint.y - 120;
          
          // Draw target point accent dot
          ctx.beginPath();
          ctx.arc(targetScreenPoint.x, targetScreenPoint.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // TANGET CONE - "due segmenti tangenti alla circonferenza così da impressione del ingrandimento"
          const dxP = targetScreenPoint.x - bubbleCx;
          const dyP = targetScreenPoint.y - bubbleCy;
          const dP = Math.sqrt(dxP * dxP + dyP * dyP);
          
          if (dP > bubbleRadius) {
              const alpha = Math.atan2(dyP, dxP);
              const theta = Math.acos(bubbleRadius / dP);
              
              const t1X = bubbleCx + bubbleRadius * Math.cos(alpha + theta);
              const t1Y = bubbleCy + bubbleRadius * Math.sin(alpha + theta);
              
              const t2X = bubbleCx + bubbleRadius * Math.cos(alpha - theta);
              const t2Y = bubbleCy + bubbleRadius * Math.sin(alpha - theta);
              
              // Shadow/Fill for cone
              ctx.beginPath();
              ctx.moveTo(targetScreenPoint.x, targetScreenPoint.y);
              ctx.lineTo(t1X, t1Y);
              ctx.arc(bubbleCx, bubbleCy, bubbleRadius, alpha + theta, alpha - theta, true);
              ctx.closePath();
              const coneGrad = ctx.createLinearGradient(targetScreenPoint.x, targetScreenPoint.y, bubbleCx, bubbleCy);
              coneGrad.addColorStop(0, 'rgba(16, 185, 129, 0)');
              coneGrad.addColorStop(1, 'rgba(16, 185, 129, 0.15)');
              ctx.fillStyle = coneGrad;
              ctx.fill();
              
              // Tangent lines
              ctx.beginPath();
              ctx.moveTo(targetScreenPoint.x, targetScreenPoint.y);
              ctx.lineTo(t1X, t1Y);
              ctx.moveTo(targetScreenPoint.x, targetScreenPoint.y);
              ctx.lineTo(t2X, t2Y);
              ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
              ctx.lineWidth = 1;
              ctx.setLineDash([5, 5]);
              ctx.stroke();
              ctx.setLineDash([]);
          }

          // Drop shadow for the magnifier glass HUD bubble
          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetX = 5;
          ctx.shadowOffsetY = 10;
          
          // Bubble frame backdrop
          ctx.beginPath();
          ctx.arc(bubbleCx, bubbleCy, bubbleRadius, 0, Math.PI * 2);
          ctx.fillStyle = '#0f172a'; // Deep slate
          ctx.fill();
          
          // Disable shadow for internal
          ctx.shadowColor = 'transparent';
          
          // Radial gradient inside the lens
          const glassGrad = ctx.createRadialGradient(bubbleCx - 30, bubbleCy - 30, 10, bubbleCx, bubbleCy, bubbleRadius);
          glassGrad.addColorStop(0, '#1e293b');
          glassGrad.addColorStop(1, '#0f172a');
          ctx.fillStyle = glassGrad;
          ctx.beginPath();
          ctx.arc(bubbleCx, bubbleCy, bubbleRadius - 2, 0, Math.PI * 2);
          ctx.fill();
          
          // Reflection line
          ctx.save();
          ctx.beginPath();
          ctx.arc(bubbleCx, bubbleCy, bubbleRadius - 4, 0, Math.PI * 2);
          ctx.clip();
          ctx.beginPath();
          ctx.moveTo(bubbleCx - bubbleRadius, bubbleCy - bubbleRadius);
          ctx.lineTo(bubbleCx + bubbleRadius, bubbleCy + bubbleRadius);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.lineWidth = bubbleRadius;
          ctx.stroke();
          ctx.restore();
          
          // Outer bezel
          ctx.beginPath();
          ctx.arc(bubbleCx, bubbleCy, bubbleRadius, 0, Math.PI * 2);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 5;
          ctx.stroke();
          
          // Internal highlights
          ctx.beginPath();
          ctx.arc(bubbleCx, bubbleCy, bubbleRadius - 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1;
          ctx.stroke();
          
          // Content Label inside the glass
          let valueText = '';
          let subText = 'MISURA';
          
          if (activeTool === 'Parallel' && selectedParallelLine) {
              const formatPrecisionVal = (val: number) => {
                  if (Number.isInteger(val)) return val.toString();
                  const roundedVal = Math.round(val * 100) / 100;
                  return roundedVal.toString().replace('.', ',');
              };
              valueText = formatPrecisionVal(parallelDistance);
              subText = 'OFF-SET';
          } else if (drawing) {
              const tooltipDx = drawing.current.x - drawing.start.x;
              const tooltipDy = drawing.current.y - drawing.start.y;
              const tooltipLength = Math.sqrt(tooltipDx * tooltipDx + tooltipDy * tooltipDy);
              
              const formatPrecisionVal = (val: number) => {
                  if (Number.isInteger(val)) return val.toString();
                  const roundedVal = Math.round(val * 100) / 100;
                  return roundedVal.toString().replace('.', ',');
              };
              
              valueText = formatPrecisionVal(tooltipLength);
              if (activeTool === 'Line') subText = 'Distanza';
              else if (activeTool === 'Circle') subText = 'Raggio';
              else if (activeTool === 'Rectangle') {
                  const rx = Math.abs(tooltipDx);
                  const ry = Math.abs(tooltipDy);
                  valueText = `${formatPrecisionVal(rx)} × ${formatPrecisionVal(ry)}`;
                  subText = 'Rettangolo';
              }
          }
          
          // Header
          ctx.fillStyle = '#34d399';
          ctx.font = 'bold 11px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(subText.toUpperCase(), bubbleCx, bubbleCy - 30);
          
          // HUGE Numbers
          ctx.fillStyle = '#ffffff';
          const fontSz = valueText.length > 8 ? 'bold 18px system-ui' : 'bold 32px system-ui';
          ctx.font = fontSz;
          ctx.fillText(valueText, bubbleCx, bubbleCy + 5);
          
          // Modalità
          ctx.fillStyle = isJollyActive ? '#34d399' : '#94a3b8';
          ctx.font = 'bold 10px system-ui';
          ctx.fillText(isJollyActive ? 'MODALITÀ: DECIMALI' : 'MODALITÀ: INTERI', bubbleCx, bubbleCy + 32);

          // Click to Edit hint
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.font = '500 8px system-ui';
          ctx.fillText('CLICCA PER INSERIRE MISURA', bubbleCx, bubbleCy + 48);
          
          ctx.restore();
      }
    };

    renderRef.current = render;
    render(); // Initial render for this effect run
  });

  // Basic pan/zoom handling
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (isPanningRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Calculate the ideal center based on existing entities
    const getIdealCenter = () => {
        if (entities.length === 0) return { x: 0, y: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        entities.forEach(ent => {
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
                 minX = Math.min(minX, ent.start.x, ent.end.x);
                 maxX = Math.max(maxX, ent.start.x, ent.end.x);
                 minY = Math.min(minY, ent.start.y, ent.end.y);
                 maxY = Math.max(maxY, ent.start.y, ent.end.y);
             }
        });

        if (minX === Infinity) return { x: 0, y: 0 };
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    };

    const rect = canvas.getBoundingClientRect();
    const zoomSensitivity = 0.0015;
    const zoomFactor = Math.pow(0.95, e.deltaY * zoomSensitivity);

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
    
    if (activeTool === 'Parallel' && selectedParallelLine) {
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
            return Math.round(newVal * 100) / 100;
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
            if (Date.now() - lastEraserExecutionTime.current < 30) return;
        }
        lastEraserExecutionTime.current = Date.now();
        const radius = eraserRadius / view.zoom;
        const now = Date.now();
        
        let changed = false;
        const newEntities: Entity[] = [];

        for (const ent of entities) {
            if (ent.type === 'line') {
                if (ent.inkPoints) {
                    // ANY line with inkPoints (freehand or straight with wave effect)
                    // fade individual points inside the eraser circle!
                    let pointHit = false;
                    const updatedPoints = ent.inkPoints.map((pt, i) => {
                        const dist = Math.sqrt((rawPoint.x - pt.x)**2 + (rawPoint.y - pt.y)**2);
                        if (dist <= radius) {
                            const pointKey = `${ent.id}_${i}`;
                            const lastErase = lastEraseTimeByPoint.current[pointKey] || 0;
                            if (now - lastErase > 450) {
                                lastEraseTimeByPoint.current[pointKey] = now;
                                pointHit = true;
                                // Decrease opacity (alpha) of this freehand step by 0.35!
                                const nextAlpha = Math.max(0, pt.alpha - 0.25);
                                return { ...pt, alpha: nextAlpha };
                            }
                        }
                        return pt;
                    });
                    
                    if (pointHit) {
                        changed = true;
                        // Filter out sequences of consecutive points that are completely invisible
                        const allTransparent = updatedPoints.every(pt => pt.alpha <= 0.05);
                        if (!allTransparent) {
                            newEntities.push({
                                ...ent,
                                inkPoints: updatedPoints
                            });
                        }
                    } else {
                        newEntities.push(ent);
                    }
                } else {
                    // Standard CAD line segment
                    const splitResult = splitLineSegmentWithCircle(ent.start, ent.end, rawPoint, radius);
                    if (splitResult.inside.length > 0) {
                        changed = true;
                        // Keep outside segments completely untouched (original opacity maintained!)
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
                            const currentOpacity = ent.opacity !== undefined ? ent.opacity : 1.0;
                            const nextOpacity = currentOpacity - 0.35;
                            if (nextOpacity > 0.1) {
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
                const splitRes = getArcSubsegmentsInsideAndOutsideEraser(ent.center, ent.radius, startAngle, endAngle, isCircle, rawPoint, radius);
                
                if (splitRes) {
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
                    // Inside parts are kept and faded by 0.35!
                    splitRes.inside.forEach((interval, i) => {
                        const currentOpacity = ent.opacity !== undefined ? ent.opacity : 1.0;
                        const nextOpacity = currentOpacity - 0.35;
                        if (nextOpacity > 0.1) {
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
                    const splitResult = splitLineSegmentWithCircle(edge.start, edge.end, rawPoint, radius);
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
                            const currentOpacity = ent.opacity !== undefined ? ent.opacity : 1.0;
                            const nextOpacity = currentOpacity - 0.35;
                            if (nextOpacity > 0.1) {
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
                    changed = true;
                    newEntities.push(...hitLinesResult);
                } else {
                    newEntities.push(ent);
                }
            } else if (ent.type === 'dimension') {
                const dx = ent.end.x - ent.start.x;
                const dy = ent.end.y - ent.start.y;
                const L = Math.sqrt(dx * dx + dy * dy);
                let hitDimension = false;
                if (L > 0.001) {
                    const nx = -dy / L;
                    const ny = dx / L;
                    const p1 = { x: ent.start.x + nx * ent.offset, y: ent.start.y + ny * ent.offset };
                    const p2 = { x: ent.end.x + nx * ent.offset, y: ent.end.y + ny * ent.offset };
                    hitDimension = distanceToSegment(rawPoint, p1, p2) < radius;
                }
                
                if (hitDimension) {
                    const lastErase = lastEraseTimeByEntityId.current[ent.id] || 0;
                    if (now - lastErase > 450) {
                        lastEraseTimeByEntityId.current[ent.id] = now;
                        changed = true;
                        const currentOpacity = ent.opacity !== undefined ? ent.opacity : 1.0;
                        const nextOpacity = currentOpacity - 0.35;
                        if (nextOpacity > 0.1) {
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
                    hitHatch = h.points.some((p: Point) => Math.sqrt((rawPoint.x - p.x)**2 + (rawPoint.y - p.y)**2) <= radius) || isPointInPolygon(rawPoint, h.points);
                }
                if (hitHatch) {
                    const lastErase = lastEraseTimeByEntityId.current[ent.id] || 0;
                    if (now - lastErase > 450) {
                        lastEraseTimeByEntityId.current[ent.id] = now;
                        changed = true;
                        const currentOpacity = ent.opacity !== undefined ? ent.opacity : 1.0;
                        const nextOpacity = currentOpacity - 0.35;
                        if (nextOpacity > 0.1) {
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
                    const dist = Math.sqrt((rawPoint.x - p.x)**2 + (rawPoint.y - p.y)**2);
                    hitPoint = dist <= radius;
                }
                if (hitPoint) {
                    const lastErase = lastEraseTimeByEntityId.current[ent.id] || 0;
                    if (now - lastErase > 450) {
                        lastEraseTimeByEntityId.current[ent.id] = now;
                        changed = true;
                        const currentOpacity = ent.opacity !== undefined ? ent.opacity : 1.0;
                        const nextOpacity = currentOpacity - 0.35;
                        if (nextOpacity > 0.1) {
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
        
        if (changed) {
            if (setEntitiesSilent) setEntitiesSilent(newEntities);
            else setEntities(newEntities);
        }
  };

  const getIntersections = (entA: Entity, entB: Entity): Point[] => {
    const pts: Point[] = [];
    if (entA.id === entB.id) return pts;

    // Both are lines
    if (entA.type === 'line' && entB.type === 'line') {
        const x1 = entA.start.x, y1 = entA.start.y, x2 = entA.end.x, y2 = entA.end.y;
        const x3 = entB.start.x, y3 = entB.start.y, x4 = entB.end.x, y4 = entB.end.y;
        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (denom !== 0) {
            const t = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
            const u = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
            if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
                pts.push({ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) });
            }
        }
    }
    // line and circle / arc
    else if ((entA.type === 'line' && (entB.type === 'circle' || entB.type === 'arc')) ||
             ((entA.type === 'circle' || entA.type === 'arc') && entB.type === 'line')) {
        const line = entA.type === 'line' ? entA : entB as LineEntity;
        const circle = entA.type === 'line' ? entB as (CircleEntity | ArcEntity) : entA as (CircleEntity | ArcEntity);
        
        const d = { x: line.end.x - line.start.x, y: line.end.y - line.start.y };
        const v = { x: line.start.x - circle.center.x, y: line.start.y - circle.center.y };
        const a = d.x * d.x + d.y * d.y;
        const b = 2 * (v.x * d.x + v.y * d.y);
        const c = (v.x * v.x + v.y * v.y) - circle.radius * circle.radius;
        if (a !== 0) {
            const discriminant = b * b - 4 * a * c;
            if (discriminant >= 0) {
                const sqrtD = Math.sqrt(discriminant);
                const t1 = (-b - sqrtD) / (2 * a);
                const t2 = (-b + sqrtD) / (2 * a);
                [t1, t2].forEach(t => {
                    if (t >= 0 && t <= 1) {
                        const p = { x: line.start.x + t * d.x, y: line.start.y + t * d.y };
                        // If it's an arc, check if angle is inside
                        if (circle.type === 'arc') {
                            const angle = Math.atan2(p.y - circle.center.y, p.x - circle.center.x) * 180 / Math.PI;
                            if (isAngleInArc(angle, circle.startAngle, circle.endAngle)) {
                                pts.push(p);
                            }
                        } else {
                            pts.push(p);
                        }
                    }
                });
            }
        }
    }
    // two circles / arcs
    else if ((entA.type === 'circle' || entA.type === 'arc') && (entB.type === 'circle' || entB.type === 'arc')) {
        const c1 = entA as (CircleEntity | ArcEntity);
        const c2 = entB as (CircleEntity | ArcEntity);
        const dx = c2.center.x - c1.center.x;
        const dy = c2.center.y - c1.center.y;
        const dSum = Math.sqrt(dx * dx + dy * dy);
        if (dSum > 0.001 && dSum <= c1.radius + c2.radius && dSum >= Math.abs(c1.radius - c2.radius)) {
            const a = (c1.radius * c1.radius - c2.radius * c2.radius + dSum * dSum) / (2 * dSum);
            const hSq = c1.radius * c1.radius - a * a;
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
                pts.push(p);
            });
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

  const getTrimTargetAtPoint = (point: Point): Entity | undefined => {
      const ent = getEntityAtPoint(point);
      return ent && (ent.type === 'line' || ent.type === 'circle' || ent.type === 'arc') ? ent : undefined;
  };

  const computeTrimSegments = (
    target: Entity,
    clickPoint: Point,
    allEntities: Entity[]
  ): {
    highlighted: { type: 'line' | 'arc'; start?: Point; end?: Point; center?: Point; radius?: number; startAngle?: number; endAngle?: number };
    keep: any[];
  } | null => {
    if (target.type === 'line') {
      const intersections: { t: number; p: Point }[] = [];
      intersections.push({ t: 0, p: target.start });
      intersections.push({ t: 1, p: target.end });

      allEntities.forEach(ent => {
        if (ent.id === target.id) return;
        
        const pts = getIntersections(target, ent);
        pts.forEach(p => {
          const d = { x: target.end.x - target.start.x, y: target.end.y - target.start.y };
          const lenSq = d.x * d.x + d.y * d.y;
          if (lenSq !== 0) {
            const t = ((p.x - target.start.x) * d.x + (p.y - target.start.y) * d.y) / lenSq;
            if (t > 0 && t < 1) {
              intersections.push({ t, p });
            }
          }
        });
      });

      intersections.sort((a, b) => a.t - b.t);
      const d = { x: target.end.x - target.start.x, y: target.end.y - target.start.y };
      const lenSq = d.x * d.x + d.y * d.y;
      let tClick = 0;
      if (lenSq !== 0) {
        tClick = ((clickPoint.x - target.start.x) * d.x + (clickPoint.y - target.start.y) * d.y) / lenSq;
      }

      let trimStart: Point | null = null;
      let trimEnd: Point | null = null;
      let clickedIndex = -1;

      for (let i = 0; i < intersections.length - 1; i++) {
        if (tClick >= intersections[i].t && tClick <= intersections[i + 1].t) {
          trimStart = intersections[i].p;
          trimEnd = intersections[i + 1].p;
          clickedIndex = i;
          break;
        }
      }

      if (trimStart && trimEnd) {
        const keep: any[] = [];
        for (let i = 0; i < intersections.length - 1; i++) {
          if (i !== clickedIndex) {
            if (intersections[i + 1].t - intersections[i].t > 0.001) {
              keep.push({
                ...target,
                start: intersections[i].p,
                end: intersections[i + 1].p,
              });
            }
          }
        }
        return {
          highlighted: { type: 'line', start: trimStart, end: trimEnd },
          keep,
        };
      }
    } else if (target.type === 'circle') {
      const ptsSet: Point[] = [];
      allEntities.forEach(ent => {
        if (ent.id === target.id) return;
        const pts = getIntersections(target, ent);
        pts.forEach(p => {
          if (!ptsSet.some(existing => Math.sqrt((existing.x - p.x)**2 + (existing.y - p.y)**2) < 0.001)) {
            ptsSet.push(p);
          }
        });
      });

      const angles = ptsSet.map(p => {
        return normalizeAngle(Math.atan2(p.y - target.center.y, p.x - target.center.x) * 180 / Math.PI);
      });

      angles.sort((a, b) => a - b);

      if (angles.length < 2) {
        return {
          highlighted: { type: 'arc', center: target.center, radius: target.radius, startAngle: 0, endAngle: 360 },
          keep: [],
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
    } else if (target.type === 'arc') {
      const ptsSet: Point[] = [];
      allEntities.forEach(ent => {
        if (ent.id === target.id) return;
        const pts = getIntersections(target, ent);
        pts.forEach(p => {
          if (!ptsSet.some(existing => Math.sqrt((existing.x - p.x)**2 + (existing.y - p.y)**2) < 0.001)) {
            ptsSet.push(p);
          }
        });
      });

      const angles = ptsSet.map(p => {
        return normalizeAngle(Math.atan2(p.y - target.center.y, p.x - target.center.x) * 180 / Math.PI);
      });

      const validAngles = angles.filter(a => isAngleInArc(a, target.startAngle, target.endAngle));

      validAngles.sort((a, b) => getClockwiseDistance(a, target.startAngle) - getClockwiseDistance(b, target.startAngle));

      const S = normalizeAngle(target.startAngle);
      const E = normalizeAngle(target.endAngle);
      
      const sequence: number[] = [S];
      validAngles.forEach(a => {
        if (Math.abs(a - S) > 0.001 && Math.abs(a - E) > 0.001) {
          sequence.push(a);
        }
      });
      sequence.push(E);

      const angleClick = normalizeAngle(Math.atan2(clickPoint.y - target.center.y, clickPoint.x - target.center.x) * 180 / Math.PI);

      let clickedIndex = -1;
      for (let i = 0; i < sequence.length - 1; i++) {
        const start = sequence[i];
        const end = sequence[i + 1];
        const distClick = getClockwiseDistance(angleClick, S);
        const d1 = getClockwiseDistance(start, S);
        const d2 = getClockwiseDistance(end, S);
        if (distClick >= d1 && distClick <= d2) {
          clickedIndex = i;
          break;
        }
      }

      if (clickedIndex !== -1) {
        const startAngleSegment = sequence[clickedIndex];
        const endAngleSegment = sequence[clickedIndex + 1];

        const keep: any[] = [];
        for (let i = 0; i < sequence.length - 1; i++) {
          if (i !== clickedIndex) {
            const s = sequence[i];
            const e = sequence[i + 1];
            if (getClockwiseDistance(e, s) > 0.1) {
              keep.push({
                ...target,
                type: 'arc' as const,
                startAngle: s,
                endAngle: e,
              });
            }
          }
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

  const executeTrim = (rawPoint: Point) => {
    const target = getTrimTargetAtPoint(rawPoint);
    if (!target) return;

    const result = computeTrimSegments(target, rawPoint, entities);
    if (!result) return;

    setEntities(prev => {
        const newEntities = prev.flatMap(ent => {
            if (ent.id === target.id) {
                if (result.keep.length === 0) return [];
                return result.keep.map((seg, i) => ({
                    ...seg,
                    id: i === 0 ? ent.id : Date.now().toString() + i + Math.random()
                }));
            }
            return ent;
        });
        onCommitHistory?.(newEntities);
        return newEntities;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
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
                    
                    // Force the tecnigrafo style (Line + Ink + No Ortho)
                    setActiveTool?.('Line');
                    setDefaultLineStyle(prev => ({ ...prev, mode: 'ink' }));
                    setOrthoMode?.(false);
                    return; 
                }
            }
        }
    }

    if (e.button === 2) {
        // RIGHT CLICK: Toggle between Pencil and Ink mode when tecnigrafo is active
        if (tecnigrafoOrigin && !drawing) {
            e.preventDefault();
            setDefaultLineStyle(prev => ({
                ...prev,
                mode: prev.mode === 'pencil' ? 'ink' : (prev.mode === 'ink' ? 'CAD' : 'pencil')
            }));
            renderRef.current?.();
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

      const handleMouseMove = (me: MouseEvent) => {
        setView(prev => ({
          ...prev,
          pan: { x: me.clientX - startX, y: me.clientY - startY }
        }));
      };

      const handleMouseUp = () => {
        isPanningRef.current = false;
        if (canvasRef.current) canvasRef.current.style.cursor = ''; // Reset inline style to allow parent cursor to work
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
    const screenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const canvasPoint = screenToCanvas(screenPos.x, screenPos.y);

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
        const distB = Math.sqrt((screenPos.x - bubbleCx) ** 2 + (screenPos.y - bubbleCy) ** 2);
        if (distB < 85) {
            setBubblePosition({ x: bubbleCx, y: bubbleCy });
            setShowManualInput(true);
            return;
        }
    } else {
        setBubblePosition(null);
    }

    lastMouseRef.current = rawPoint;

    // --- CUSTOM DOUBLE CLICK DETECTION ---
    const now = Date.now();
    if (now - lastClickTimeRef.current < 300 && lastClickPosRef.current) {
        const dx = rawPoint.x - lastClickPosRef.current.x;
        const dy = rawPoint.y - lastClickPosRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) < 20 / view.zoom) {
            lastClickTimeRef.current = 0; // reset

            const clickedText = getEntityAtPoint(rawPoint);
            if (clickedText && clickedText.type === 'text') {
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

            if (activeTool === 'Join') {
                confirmJoin();
                return;
            }
            
        }
    }
    lastClickTimeRef.current = now;
    lastClickPosRef.current = rawPoint;

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
              const cloned = JSON.parse(JSON.stringify(ent)) as Entity;
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
          setActiveMoveSnapPoint(null);
          isStickyCopyRef.current = true;
          dragHasMovedRef.current = false;
        }
      }, 3000);
    }
    
    if (positioningDimId) {
        setPositioningDimId(null);
        setEntities(prev => { onCommitHistory?.(prev); return prev; });
        return;
    }

    if (positioningGroupId) {
        setPositioningGroupId(null);
        setPositioningGroupStartPos(null);
        setEntities(prev => { onCommitHistory?.(prev); return prev; });
        onSelect(null);
        return;
    }

    if (positioningEntityId) {
        setPositioningEntityId(null);
        setPositioningEntityStartPos(null);
        setEntities(prev => { onCommitHistory?.(prev); return prev; });
        onSelect(null);
        return;
    }

    const isFreehandActive = activeTool === 'Line' && (defaultLineStyle.mode === 'pencil' || defaultLineStyle.mode === 'ink') && !orthoMode;
    const isTempOrtho = false;
    
    // We disable snapping for freehand mode, or for tempOrtho
    const shouldSkipSnap = isFreehandActive || isTempOrtho || (activeTool === 'Template' && !drawing);
    
    const snapped = shouldSkipSnap
        ? { point: rawPoint, snapped: false, type: 'CAD' as const, refPoint: undefined, constraintAxis: undefined, refPoint2: undefined, constraintAxis2: undefined, hasDoubleSmart: false }
        : getSnappedPoint(rawPoint, entities, activeTool, drawing);

    if (activeTool === 'Select') {
        const found = getEntityAtPoint(rawPoint);
        if (found) {
            const isBIMDoorWindow = found.isBIM && (found.bimType === 'door' || found.bimType === 'window');
            const isArredo = !!(found.templateId || (found.groupId && entities.find(e => e.groupId === found.groupId && e.templateId)));

            if (found.raccordoMetadata && onEditRaccordo) {
                onEditRaccordo(found);
                return;
            }
            
            // If already selected and is BIM/Arredo, rotate relative to anchor point
            if (found.id === selectedEntityId && (isBIMDoorWindow || isArredo)) {
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
                    onCommitHistory?.(next);
                    return next;
                });
                return;
            }

            // Click activates movement for BIM/Arredo immediately (always movable)
            onSelect(found.id);
            if (found.groupId) {
                setPositioningGroupId(found.groupId);
                setPositioningGroupStartPos(rawPoint);
            } else {
                setPositioningEntityId(found.id);
                setPositioningEntityStartPos(rawPoint);
            }
            return;
        } else {
            onSelect(null);
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
            const snappedPoint = getSnappedPoint(rawPoint, entities, activeTool, { type: 'line', start: specchioAxisPt1, current: rawPoint } as any).snapped 
                ? getSnappedPoint(rawPoint, entities, activeTool, { type: 'line', start: specchioAxisPt1, current: rawPoint } as any).point 
                : rawPoint;
            
            let finalPt2 = snappedPoint;
            if (orthoMode) {
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
                onCommitHistory?.(next);
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
    } else if (activeTool === 'Parallel') {
        if (!selectedParallelLine) {
            const found = getLineAtPoint(rawPoint);
            if (found) {
                setSelectedParallelLine(found);
                setParallelMouse(rawPoint);
                if (parallelDistanceHistory.length > 0 && parallelDistanceHistory[0] > 0) {
                    const mem = parallelDistanceHistory[0];
                    setParallelDistance(mem);
                    setIsParallelWheelActive(true);
                    const line = found as LineEntity;
                    const dx = line.end.x - line.start.x;
                    const dy = line.end.y - line.start.y;
                    const L = Math.sqrt(dx * dx + dy * dy);
                    if (L > 0) {
                        const nx = -dy / L;
                        const ny = dx / L;
                        const vec1 = { x: rawPoint.x - line.start.x, y: rawPoint.y - line.start.y };
                        const distVal = vec1.x * nx + vec1.y * ny;
                        setParallelSign(distVal >= 0 ? 1 : -1);
                    }
                } else {
                    setParallelDistance(0);
                    setIsParallelWheelActive(false);
                }
            }
        } else {
            const snap = getSnappedPoint(rawPoint, entities, activeTool, null);
            const isSnapped = snap.snapped;

            if (isParallelWheelActive || isSnapped) {
                // Commit the parallel line
                const line = selectedParallelLine as LineEntity;
                const p1 = line.start;
                const p2 = line.end;
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const L = Math.sqrt(dx * dx + dy * dy);
                if (L > 0) {
                  const nx = -dy / L;
                  const ny = dx / L;

                  const commitPoint = isSnapped ? snap.point : rawPoint;
                  const vec1 = { x: commitPoint.x - p1.x, y: commitPoint.y - p1.y };
                  const dist = vec1.x * nx + vec1.y * ny;

                  const commitDistance = isParallelWheelActive ? parallelDistance : Math.abs(dist);
                  const sign = isParallelWheelActive ? parallelSign : (dist >= 0 ? 1 : -1);
                  const offset = sign * commitDistance;

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
                      layer: line.layer
                  };

                  // Create a visible dimension line showing the confirmed parallel distance
                  const newDim: DimensionEntity = {
                      id: (Date.now() + 1).toString() + Math.floor(Math.random() * 1000).toString(),
                      type: 'dimension',
                      color: '#f59e0b', // Amber for prominent parallel commitment dimension
                      lineWidth: 1,
                      mode: 'ink',
                      start: { x: p1.x, y: p1.y },
                      end: { x: p1.x + nx * offset, y: p1.y + ny * offset },
                      offset: 0,
                      style: 1,
                      layer: 'Misure'
                  };
                  
                  setEntities(prev => {
                      onCommitHistory?.(prev);
                      return [...prev, newLine, newDim];
                  });
                  
                  setParallelDistanceHistory(hist => {
                        const newHist = Array.from(new Set([commitDistance, ...hist]));
                        return newHist.slice(0, 5);
                  });

                  // Set the newly created line as the selected reference line for subsequent parallel chains
                  setSelectedParallelLine(newLine);
                  
                  // Lock the measurement and preserve the parallel distance for subsequent clicks in the chain
                  setParallelDistance(commitDistance);
                  setIsParallelWheelActive(true);
                }
            } else {
                // Activate precision lens mode!
                let hardwareCaps = false;
                let scrollLock = false;
                let numLock = false;
                if (e && (e as any).getModifierState) {
                    hardwareCaps = !!(e as any).getModifierState('CapsLock');
                    scrollLock = !!(e as any).getModifierState('ScrollLock');
                    numLock = !!(e as any).getModifierState('NumLock');
                }
                const isDecimalActive = hardwareCaps || scrollLock || numLock || (e && (e as any).shiftKey);

                if (isDecimalActive) {
                    setIsParallelWheelActive(true);
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
                        const val = Math.round(Math.abs(distVal) * 100) / 100;
                        setParallelSign(sign);
                        setParallelDistance(val);
                        fnStepValueRef.current = val;
                        fnAnchorCanvasPosRef.current = rawPoint;
                        setIsJollyActive(true);
                    }
                    return;
                }
            }
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
        
        const clickedHatch = entities.find(ent => ent.type === 'hatch' && ent.layer === targetLayerId && (ent as any).points && isPointInPolygon(rawPoint, (ent as any).points));
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
                    points: poly,
                    layer: targetLayerId
                } as any;
                setEntities(prev => {
                    onCommitHistory?.(prev);
                    return [...prev, newHatch];
                });
                onSelect(newHatch.id);
            }
        }
    } else if (activeTool === 'BIM_Symbol' && selectedBIMSymbolType) {
        const isElectrical = ['punto_luce', 'presa_standard', 'interruttore', 'deviatore', 'quadro'].includes(selectedBIMSymbolType);
        const targetLayerName = isElectrical ? 'BIM_Impianti_Elettrici' : 'BIM_Impianti_Idraulici';
        const targetLayerId = layers.find(l => l.name === targetLayerName)?.id || targetLayerName;
        const targetColor = isElectrical ? '#fbbf24' : '#60a5fa';

        const geomList = getBIMSymbolEntities(selectedBIMSymbolType);
        const groupId = 'group_sym_' + Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5);

        const newEntities: Entity[] = geomList.map(te => {
            const baseProps = {
                id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 5),
                color: te.color || targetColor,
                lineWidth: 1.5,
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
                onCommitHistory?.(next);
                return next;
            });
            onSelect(newEntities[0].id);
        }
    } else if (activeTool === 'BIM_RilevaStanza') {
        const poly = findBoundaryPolygon(screenPos, entities, view, rect.width, rect.height, screenToCanvas, layers);
        if (poly && poly.length > 2) {
            const nextIdx = entities.filter(e => e.isBIM && e.bimType === 'room').length + 1;
            const newRoom: Entity = {
                id: Date.now().toString(),
                type: 'hatch',
                isBIM: true,
                bimType: 'room',
                bimName: 'Stanza ' + nextIdx,
                bimHeight: 2.70,
                color: 'rgba(52, 211, 153, 0.15)',
                points: poly,
                pattern: 'SOLID',
                scale: 1,
                angle: 0,
                lineWidth: 1,
                mode: 'pencil',
                layer: activeLayerId
            } as any;
            setEntities(prev => {
                const next = [...prev, newRoom];
                onCommitHistory?.(next);
                return next;
            });
            onSelect(newRoom.id);
        }
    } else if (activeTool === 'BIM_DisegnaStanza') {
        const clickedPoint = snapped.point;
        if (manualRoomPoints.length > 2) {
            const firstPt = manualRoomPoints[0];
            const distToStart = Math.sqrt((clickedPoint.x - firstPt.x)**2 + (clickedPoint.y - firstPt.y)**2);
            if (distToStart < 15 / view.zoom) {
                const nextIdx = entities.filter(e => e.isBIM && e.bimType === 'room').length + 1;
                const newRoom: Entity = {
                    id: Date.now().toString(),
                    type: 'hatch',
                    isBIM: true,
                    bimType: 'room',
                    bimName: 'Stanza ' + nextIdx,
                    bimHeight: 2.70,
                    color: 'rgba(52, 211, 153, 0.15)',
                    points: [...manualRoomPoints],
                    pattern: 'SOLID',
                    scale: 1,
                    angle: 0,
                    lineWidth: 1,
                    mode: 'pencil',
                    layer: activeLayerId
                } as any;
                setEntities(prev => {
                    const next = [...prev, newRoom];
                    onCommitHistory?.(next);
                    return next;
                });
                onSelect(newRoom.id);
                setManualRoomPoints([]);
                return;
            }
        }
        setManualRoomPoints(prev => [...prev, clickedPoint]);
    } else if (activeTool === 'BIM_Porta' || activeTool === 'BIM_Finestra' || activeTool === 'BIM_Muro') {
        const found = getEntityAtPoint(rawPoint);
        if (found && found.isBIM && (found.bimType === 'door' || found.bimType === 'window')) {
            onSelect(found.id);
            if (drawing) setDrawing(null);
            return;
        }

        if (!drawing) {
            setDrawing({ start: snapped.point, current: snapped.point });
        } else {
            const isLineLikeTool = activeTool === 'Line' || activeTool === 'BIM_Porta' || activeTool === 'BIM_Finestra' || activeTool === 'BIM_Muro';
            const effectiveOrthoMode = isLineLikeTool && (orthoMode ? !isShiftPressedRef.current : isShiftPressedRef.current);
            const isOrthoHorizontal = isLineLikeTool && effectiveOrthoMode && 
                  Math.abs(snapped.point.x - drawing.start.x) >= Math.abs(snapped.point.y - drawing.start.y);

            let endPoint = drawing.current || snapped.point;

            if (activeTool === 'BIM_Muro') {
                const thickness = lastWallThickness || 15;
                const newElem: Entity = {
                    id: Date.now().toString(),
                    type: 'line',
                    isBIM: true,
                    bimType: 'wall',
                    bimName: `Muro sp.${thickness} cm`,
                    bimWidth: thickness,
                    start: drawing.start,
                    end: endPoint,
                    color: '#4b5563',
                    lineWidth: 2,
                    mode: 'ink',
                    layer: 'BIM_Muri'
                } as any;
                setEntities(prev => {
                    const next = [...prev, newElem];
                    onCommitHistory?.(next);
                    return next;
                });
                // Make wall segments continuous, exactly like the continuous line tool!
                setDrawing({
                    start: endPoint,
                    current: endPoint,
                    snapType: 'CAD',
                    startSnapped: true,
                    isVirtual: false
                });
            } else {
                const doorWidth = Math.round(Math.sqrt((endPoint.x - drawing.start.x)**2 + (endPoint.y - drawing.start.y)**2));
                const isDoor = activeTool === 'BIM_Porta';
                const h = isDoor ? lastDoorHeight : lastWindowHeight;
                const newElem: Entity = {
                    id: Date.now().toString(),
                    type: 'line',
                    isBIM: true,
                    bimType: isDoor ? 'door' : 'window',
                    bimName: isDoor ? `Porta ${doorWidth}` : `Finestra ${doorWidth}x${h}`,
                    bimWidth: doorWidth,
                    bimWindowHeight: isDoor ? undefined : h,
                    start: drawing.start,
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
                setDrawing(null);
            }
        }
    } else if (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Rectangle' || activeTool === 'Point' || activeTool === 'Arc' || activeTool === 'Testo') {
      const wasLocked = isLocked;
      setIsLocked(false);
      
      if (drawing && (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Rectangle' || activeTool === 'Arc')) {
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
              if (!isTempOrtho) {
                  rawSnappedFromRawPoint = getSnappedPoint(rawPoint, entities, activeTool, drawing);
              }

              const isBothSnappedException = false;

              const isLineLikeTool = activeTool === 'Line' || activeTool === 'BIM_Porta' || activeTool === 'BIM_Finestra';
              const effectiveOrthoMode = isLineLikeTool && (orthoMode ? !isShiftPressedRef.current : isShiftPressedRef.current);

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
                  } else if (!e.shiftKey && !isTempOrtho && activeTool === 'Line') {
                      finalPoint = applyAngleSnapping(drawing.start, rawPoint);
                  }
              }

              let rawSnapped: any;
              if (isTempOrtho) {
                  rawSnapped = { point: finalPoint, snapped: false, type: 'CAD' };
              } else if (isBothSnappedException) {
                  rawSnapped = rawSnappedFromRawPoint;
              } else {
                  rawSnapped = getSnappedPoint(finalPoint, entities, activeTool, drawing);
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

                  if (activeTool === 'Line') {
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

                  const initialLength = Math.round(currentLength * 100) / 100;

                  // Jolly Check - only enter precision if Jolly/Fn is held
                  let hardwareCaps = false;
                  let scrollLock = false;
                  let numLock = false;
                  if (e && (e as any).getModifierState) {
                      hardwareCaps = !!(e as any).getModifierState('CapsLock');
                      scrollLock = !!(e as any).getModifierState('ScrollLock');
                      numLock = !!(e as any).getModifierState('NumLock');
                  }
                  const isDecimalActive = hardwareCaps || scrollLock || numLock || (e && (e as any).shiftKey);

                  if (isDecimalActive) {
                      fnAnchorCanvasPosRef.current = rawPoint;
                      fnStepValueRef.current = initialLength;
                      setDrawing(prev => {
                          if (!prev) return null;
                          return {
                              ...prev,
                              wheelLength: initialLength,
                              lockedDir: { x: ux, y: uy },
                              current: {
                                  x: prev.start.x + ux * initialLength,
                                  y: prev.start.y + uy * initialLength
                              }
                          };
                      });
                      setIsJollyActive(true);
                      return;
                  }

                  // Fallback for standard placement when not snapped and not entering precision mode
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
          if (activeTool === 'Line') {
              newEntity = {
                id: Date.now().toString(),
                type: 'line',
                color: defaultLineStyle.color,
                lineWidth: defaultLineStyle.lineWidth,
                dashed: defaultLineStyle.dashed,
                mode: defaultLineStyle.mode,
                start: drawing.start,
                end: snappedResult.point,
                 layer: activeLayerId,
                 isFreehand: (defaultLineStyle.mode === 'pencil' || defaultLineStyle.mode === 'ink'), // Crucial for eraser and consistent drawing
                 inkPoints: (defaultLineStyle.mode === 'pencil' || defaultLineStyle.mode === 'ink') ? (() => {
                   const points: InkPoint[] = [];
                   const steps = 80; // Higher density for realistic ink
                   const dx = snappedResult.point.x - drawing.start.x;
                   const dy = snappedResult.point.y - drawing.start.y;
                   const len = Math.sqrt(dx * dx + dy * dy);
                   const nx = len > 0 ? -dy / len : 0;
                   const ny = len > 0 ? dx / len : 0;
                   for (let i = 0; i <= steps; i++) {
                     const t = i / steps;
                     // More complex wave for "organic" feel
                     const wave = Math.sin(t * Math.PI * 8) * 0.1 + Math.sin(t * Math.PI * 2) * 0.2;
                     
                     // Adding some "ink blobs" (sbavature)
                     const blobFactor = Math.random() > 0.92 ? 1.5 : 1.0;
                     const px = drawing.start.x + dx * t + nx * wave * (0.4 / view.zoom) + (Math.random() - 0.5) * (0.1 / view.zoom);
                     const py = drawing.start.y + dy * t + ny * wave * (0.4 / view.zoom) + (Math.random() - 0.5) * (0.1 / view.zoom);
                     
                     points.push({ 
                        x: px, 
                        y: py, 
                        width: (0.5 + Math.random() * 0.5) * blobFactor,
                        alpha: (0.4 + Math.random() * 0.5) * (blobFactor > 1 ? 0.8 : 1.0)
                     });
                   }
                   return points;
                 })() : undefined
               };
          } else if (activeTool === 'Circle') {
              const radius = Math.sqrt(Math.pow(snappedResult.point.x - drawing.start.x, 2) + Math.pow(snappedResult.point.y - drawing.start.y, 2));
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
              setEntities(prev => {
                  onCommitHistory?.(prev);
                  return [...prev, newEntity!];
              });
          }
          
          if (activeTool === 'Line' && isContinuousMode) {
              const isFreehandMode = (defaultLineStyle.mode === 'ink' || defaultLineStyle.mode === 'pencil') && !orthoMode;
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

      const isFreehandMode = activeTool === 'Line' && (defaultLineStyle.mode === 'pencil' || defaultLineStyle.mode === 'ink') && !orthoMode;
      const isTempOrthoStart = false;
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
      }
    } else if (activeTool === 'Move') {
        if (dragEntityId) {
            // Already moving (sticky or deliberate click-to-drop)
            setDragEntityId(null);
            dragEntityIdRef.current = null;
            setActiveMoveSnapPoint(null);
            setEntities(prev => { onCommitHistory?.(prev); return [...prev]; });
            return;
        }

        const snap = getSnappedPoint(rawPoint, entities, activeTool, null);
        const found = getEntityAtPoint(rawPoint);
        const snappedFound = snap.snapped ? getEntityAtPoint(snap.point) : null;
        
        let target = found || snappedFound;

        if (target) {
            // Case 1: Clicked on an entity or its snap point
            const targetIds = resolveGroups([target.id], entities);
            if (!dragEntityIds.some(id => targetIds.includes(id))) {
                setDragEntityIds(targetIds);
            }
            setDragEntityId(target.id);
            dragEntityIdRef.current = target.id;
            setSelectionWindow(null);
            lastMouseRef.current = snap.snapped ? snap.point : rawPoint;
            previousMouseRef.current = snap.snapped ? snap.point : rawPoint;
            setActiveMoveSnapPoint(null);
        } else if (dragEntityIds.length > 0) {
            // Case 2: Something is selected, click ANYWHERE (snap or raw) to start move
            setDragEntityId(dragEntityIds[0]); // Using first id as flag for handleMouseMove
            dragEntityIdRef.current = dragEntityIds[0];
            setSelectionWindow(null);
            lastMouseRef.current = snap.snapped ? snap.point : rawPoint;
            previousMouseRef.current = snap.snapped ? snap.point : rawPoint;
            setActiveMoveSnapPoint(null);
        } else {
            // Case 3: Nothing selected and clicked empty space -> Start selection window
            setDragEntityIds([]);
            setSelectionWindow({ start: rawPoint, current: rawPoint });
            lastMouseRef.current = rawPoint;
            previousMouseRef.current = rawPoint;
            setActiveMoveSnapPoint(null);
        }
    } else if (activeTool === 'Copy') {
        if (dragEntityId) {
            // Already dragging (a clone or moved item) -> Drop it!
            setDragEntityId(null);
            dragEntityIdRef.current = null;
            setActiveMoveSnapPoint(null);
            setEntities(prev => { onCommitHistory?.(prev); return [...prev]; });
            return;
        }

        const snap = getSnappedPoint(rawPoint, entities, activeTool, null);
        const found = getEntityAtPoint(rawPoint);
        const snappedFound = snap.snapped ? getEntityAtPoint(snap.point) : null;
        let target = found || snappedFound;

        if (target) {
            // Check if target is part of the green mother
            const targetIds = resolveGroups([target.id], entities);
            const isClickingMother = copySourceEntityIds.length > 0 && targetIds.some(id => copySourceEntityIds.includes(id));

            if (isClickingMother) {
                // CLONE ALL ENTITIES in the green mother group
                const originalEntitiesToClone = entities.filter(ent => copySourceEntityIds.includes(ent.id));
                
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
                    const cloned = JSON.parse(JSON.stringify(ent)) as Entity;
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
                lastMouseRef.current = snap.snapped ? snap.point : rawPoint;
                previousMouseRef.current = snap.snapped ? snap.point : rawPoint;
                setActiveMoveSnapPoint(null);
                isStickyCopyRef.current = true;
                dragHasMovedRef.current = false;
            } else if (clonedEntityIds.has(target.id)) {
                // CLICKED ON A CLONE -> Moves like move, does not clone!
                setDragEntityIds(targetIds);
                setDragEntityId(target.id);
                dragEntityIdRef.current = target.id;
                setSelectionWindow(null);
                lastMouseRef.current = snap.snapped ? snap.point : rawPoint;
                previousMouseRef.current = snap.snapped ? snap.point : rawPoint;
                setActiveMoveSnapPoint(null);
                isStickyCopyRef.current = true;
                dragHasMovedRef.current = false;
            } else {
                // CLICKED A DIFFERENT OBJECT -> It becomes the brand new green mother!
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
                    const cloned = JSON.parse(JSON.stringify(ent)) as Entity;
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
                lastMouseRef.current = snap.snapped ? snap.point : rawPoint;
                previousMouseRef.current = snap.snapped ? snap.point : rawPoint;
                setActiveMoveSnapPoint(null);
                isStickyCopyRef.current = true;
                dragHasMovedRef.current = false;
            }
        } else {
            // Clicked empty space
            if (dragEntityIds.length > 0) {
                setDragEntityId(dragEntityIds[0]);
                dragEntityIdRef.current = dragEntityIds[0];
                setSelectionWindow(null);
                lastMouseRef.current = snap.snapped ? snap.point : rawPoint;
                previousMouseRef.current = snap.snapped ? snap.point : rawPoint;
                setActiveMoveSnapPoint(null);
            } else {
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
    } else if (activeTool === 'Parallel') {
        const found = getLineAtPoint(rawPoint);
        if (found) {
            setSelectedParallelLine(found);
        }
    } else if (activeTool === 'Dimension') {
        const clickedEntity = getEntityAtPoint(rawPoint);
        if (clickedEntity && clickedEntity.type === 'dimension') {
            setPositioningDimId(clickedEntity.id);
        } else {
            const found = getLineAtPoint(rawPoint);
            if (found && found.type === 'line') {
                const existingDim = entities.find(e => 
                    e.type === 'dimension' && 
                    ((e.start.x === found.start.x && e.start.y === found.start.y && e.end.x === found.end.x && e.end.y === found.end.y) ||
                     (e.start.x === found.end.x && e.start.y === found.end.y && e.end.x === found.start.x && e.end.y === found.start.y))
                );

                if (existingDim) {
                    setPositioningDimId(existingDim.id);
                } else {
                    const newDim: Entity = {
                        id: Date.now().toString(),
                        type: 'dimension',
                        color: found.color || defaultLineStyle.color,
                        lineWidth: 1,
                        mode: 'ink',
                        start: found.start,
                        end: found.end,
                        offset: 0,
                        style: 1,
                        layer: 'Misure'
                    };
                    setEntities(prev => [...prev, newDim]);
                    setPositioningDimId(newDim.id);
                }
            }
        }
    } else if (activeTool === 'Eraser') {
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

    let angle = (Math.atan2(dy, dx) * 180 / Math.PI);
    // Normalize to 0-360
    angle = (angle + 360) % 360;

    if (orthoMode) {
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

    const snapAngles = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
    const threshold = 5;

    for (const snapAngle of snapAngles) {
        if (Math.abs(angle - snapAngle) < threshold) {
            const radians = snapAngle * Math.PI / 180;
            return {
                x: start.x + Math.cos(radians) * length,
                y: start.y + Math.sin(radians) * length
            };
        }
    }
    return current;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (holdTimerRef.current && holdStartPosRef.current) {
        const dx = e.clientX - holdStartPosRef.current.x;
        const dy = e.clientY - holdStartPosRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 10) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
    }
    console.log("handleMouseMove: entered, tool:", activeTool, "dragId:", dragEntityIdRef.current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
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
    let rawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);

    const currentHoverPart = getHoveredTavolaPart(rawPoint);
    if (currentHoverPart?.id !== hoveredTavolaPart?.id || currentHoverPart?.part !== hoveredTavolaPart?.part) {
      setHoveredTavolaPart(currentHoverPart);
    }

    // TECNIGRAFO HOVER DETECTION (for symbols)
    if (tecnigrafoOrigin) {
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
    if (tecnigrafoOrigin) {
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
        const updater = (prev: Entity[]) => prev.map(ent => {
            if (ent.id === positioningDimId && ent.type === 'dimension') {
                const dx = ent.end.x - ent.start.x;
                const dy = ent.end.y - ent.start.y;
                const L = Math.sqrt(dx * dx + dy * dy);
                if (L > 0) {
                    const nx = -dy / L;
                    const ny = dx / L;
                    const mx = rawPoint.x - ent.start.x;
                    const my = rawPoint.y - ent.start.y;
                    const offset = mx * nx + my * ny;
                    return { ...ent, offset };
                }
            }
            return ent;
        });
        if (setEntitiesSilent) setEntitiesSilent(updater);
        else setEntities(updater);
        return;
    }

    if (positioningGroupId && positioningGroupStartPos) {
        const dx = rawPoint.x - positioningGroupStartPos.x;
        const dy = rawPoint.y - positioningGroupStartPos.y;
        setPositioningGroupStartPos(rawPoint);

        const updater = (prev: Entity[]) => prev.map(ent => {
            if (ent.groupId === positioningGroupId) {
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
                } else if (ent.type === 'point') {
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

    if (positioningEntityId && positioningEntityStartPos) {
        const dx = rawPoint.x - positioningEntityStartPos.x;
        const dy = rawPoint.y - positioningEntityStartPos.y;
        setPositioningEntityStartPos(rawPoint);

        const updater = (prev: Entity[]) => prev.map(ent => {
            if (ent.id === positioningEntityId) {
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
                } else if (ent.type === 'point') {
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

      if (activeTool === 'Line' && (defaultLineStyle.mode === 'pencil' || defaultLineStyle.mode === 'ink') && !orthoMode && e.buttons === 1 && drawing.isFreehand) {
          const prevPoints = drawing.freehandPoints || [drawing.start];
          const lastPt = prevPoints[prevPoints.length - 1];
          const distToLast = Math.sqrt(Math.pow(rawPoint.x - lastPt.x, 2) + Math.pow(rawPoint.y - lastPt.y, 2));
          let nextPoints = prevPoints;
          let newPt = rawPoint;
          
          if (isShiftPressedRef.current) {
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

          if (distToLast > 0.5) { // 0.5 in canvas units
              nextPoints = [...prevPoints, newPt];
          }
          setDrawing({
              ...drawing,
              current: newPt,
              freehandPoints: nextPoints,
              isFreehand: true
          });
          return;
      }
      
      if (drawing.wheelLength !== undefined) {
          const ux = drawing.lockedDir?.x ?? 1;
          const uy = drawing.lockedDir?.y ?? 0;
          
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
          
          // Re-anchor when mode toggles to prevent jumps
          if (isDecimalActive !== isJollyActive) {
              fnAnchorCanvasPosRef.current = rawPoint;
              fnStepValueRef.current = drawing.wheelLength ?? 1.0;
              setIsJollyActive(isDecimalActive);
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
          const isTempOrtho = false;
          
          let rawSnapped = getSnappedPoint(rawPoint, entities, activeTool, drawing);
          if (isTempOrtho) {
              rawSnapped = { point: rawPoint, snapped: false, type: 'CAD' as const };
          }

          const isBothSnappedException = false;

          if (isBothSnappedException) {
            setDrawing({ 
                ...drawing, 
                current: rawSnapped.point, 
                snapType: rawSnapped.type, 
                refPoint: rawSnapped.refPoint,
                refEntityId: rawSnapped.refEntityId,
                constraintAxis: rawSnapped.constraintAxis,
                refPoint2: rawSnapped.refPoint2,
                constraintAxis2: rawSnapped.constraintAxis2,
                hasDoubleSmart: rawSnapped.hasDoubleSmart || false,
                activeConstraint: undefined,
                isVirtual: drawing.isVirtual
            });
          } else {
            // 1. Check for Snaps around raw mouse position
            let snapRes = getSnappedPoint(rawPoint, entities, activeTool, drawing);
            
            const isOrthoTool = activeTool === 'Line' || activeTool === 'BIM_Porta' || activeTool === 'BIM_Finestra' || activeTool === 'BIM_Muro' || activeTool === 'Rectangle' || activeTool === 'Circle' || activeTool === 'Arc' || activeTool === 'Dimension' || activeTool === 'Parallel';
            const effectiveOrthoMode = isOrthoTool && (orthoMode ? !isShiftPressedRef.current : isShiftPressedRef.current);

            // 2. If we have a standard strong snap (Endpoint, Midpoint, etc.), it WINS over Ortho
            if (snapRes.snapped && snapRes.type === 'CAD') {
                setDrawing({ 
                    ...drawing, 
                    current: snapRes.point, 
                    snapType: snapRes.type, 
                    refPoint: undefined,
                    constraintAxis: undefined,
                    refPoint2: undefined,
                    constraintAxis2: undefined,
                    hasDoubleSmart: false,
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
                    let orthoSnap = getSnappedPoint(orthoPoint, entities, activeTool, drawing);
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
                    
                    if (activeTool === 'Line' || activeTool === 'Parallel') {
                        if (!e.shiftKey && !isTempOrtho) {
                            finalPoint = applyAngleSnapping(drawing.start, finalPoint);
                        }
                    }

                    setDrawing({ 
                        ...drawing, 
                        current: finalPoint, 
                        snapType: snapRes.snapped ? (snapRes.type as any) : undefined, 
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
    }
} else if ((activeTool === 'Move' || activeTool === 'Copy') && dragEntityIdRef.current) {
    const targetIds = dragEntityIds.length > 0 ? dragEntityIds : [dragEntityIdRef.current!];
    
    // 1. Nominal movement from cursor
    let deltaX = rawPoint.x - previousMouseRef.current.x;
    let deltaY = rawPoint.y - previousMouseRef.current.y;
    if (Math.abs(deltaX) > 1e-4 || Math.abs(deltaY) > 1e-4) {
        dragHasMovedRef.current = true;
    }
    console.log("Move debug: delta", deltaX, deltaY, "previousMouse", previousMouseRef.current, "rawPoint", rawPoint);

    // 2. Multi-point Snap Challenge
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
            const translatedKp = { x: kp.x + deltaX, y: kp.y + deltaY };
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

    deltaX += bestAdj.x;
    deltaY += bestAdj.y;
    setActiveMoveSnapPoint(snapFound);

    if (Math.abs(deltaX) > 1e-6 || Math.abs(deltaY) > 1e-6) {
        const updater = (prev: Entity[]) => prev.map(ent => {
            if (targetIds.includes(ent.id)) {
                if (ent.type === 'line') {
                    const movedEntity = { 
                        ...ent, 
                        start: { x: ent.start.x + deltaX, y: ent.start.y + deltaY }, 
                        end: { x: ent.end.x + deltaX, y: ent.end.y + deltaY } 
                    };
                    if (ent.isFreehand && ent.inkPoints) {
                        movedEntity.inkPoints = ent.inkPoints.map(p => ({ ...p, x: p.x + deltaX, y: p.y + deltaY }));
                    }
                    return movedEntity;
                }
                if (ent.type === 'circle') return { ...ent, center: { x: ent.center.x + deltaX, y: ent.center.y + deltaY } };
                if (ent.type === 'rectangle') return { ...ent, p1: { x: ent.p1.x + deltaX, y: ent.p1.y + deltaY }, p2: { x: ent.p2.x + deltaX, y: ent.p2.y + deltaY } };
                if (ent.type === 'hatch') {
                    const h = ent as any;
                    return { ...ent, points: h.points ? h.points.map((p: Point) => ({ x: p.x + deltaX, y: p.y + deltaY })) : [] };
                }
                if (ent.type === 'point') return { ...ent, point: { x: ent.point.x + deltaX, y: ent.point.y + deltaY } };
                if (ent.type === 'text') return { ...ent, point: { x: ent.point.x + deltaX, y: ent.point.y + deltaY } };
                if (ent.type === 'image') return { ...ent, point: { x: ent.point.x + deltaX, y: ent.point.y + deltaY } };
                if (ent.type === 'arc') return { ...ent, center: { x: ent.center.x + deltaX, y: ent.center.y + deltaY } };
                if (ent.type === 'dimension') {
                    return { 
                        ...ent, 
                        start: { x: ent.start.x + deltaX, y: ent.start.y + deltaY }, 
                        end: { x: ent.end.x + deltaX, y: ent.end.y + deltaY } 
                    };
                }
            }
            return ent;
        });
        if (setEntitiesSilent) setEntitiesSilent(updater);
        else setEntities(updater);
        
        previousMouseRef.current = rawPoint;
        return; 
    }
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
            
            const actualDist = Math.abs(vec1.x * nx + vec1.y * ny);
            const distVal = vec1.x * nx + vec1.y * ny;
            const sign = distVal >= 0 ? 1 : -1;
            setParallelSign(sign);

            let hardwareCaps = false;
            let scrollLock = false;
            let numLock = false;
            if (e && (e as any).getModifierState) {
                hardwareCaps = !!(e as any).getModifierState('CapsLock');
                scrollLock = !!(e as any).getModifierState('ScrollLock');
                numLock = !!(e as any).getModifierState('NumLock');
            }
            const isDecimalActive = hardwareCaps || scrollLock || numLock || (e && (e as any).shiftKey);
            
            // Re-anchor Parallel when mode toggles
            if (isDecimalActive !== isJollyActive) {
                fnAnchorCanvasPosRef.current = rawPoint;
                fnStepValueRef.current = parallelDistance;
                setIsJollyActive(isDecimalActive);
            }
            
            if (isParallelWheelActive) {
                const ux = -dy / L;
                const uy = dx / L;
                const dX = rawPoint.x - (fnAnchorCanvasPosRef.current?.x ?? rawPoint.x);
                const dY = rawPoint.y - (fnAnchorCanvasPosRef.current?.y ?? rawPoint.y);
                const deltaProj = (dX * ux + dY * uy) * parallelSign;

                // SENSITIVITY: Extremely dampened for "stepped" wheel feeling
                const sens = isDecimalActive ? 0.002 : 0.04;
                const baseValue = fnStepValueRef.current ?? parallelDistance ?? 1.0;
                let dist = baseValue + deltaProj * sens;
                
                if (isDecimalActive) {
                    dist = Math.round(dist * 100) / 100;
                } else {
                    dist = Math.round(dist);
                }
                
                if (dist < 0.1) dist = 0.1;
                setParallelDistance(dist);
            } else {
                let dist = actualDist;
                if (isDecimalActive) {
                    dist = Math.round(dist * 10) / 10;
                } else {
                    dist = Math.round(dist);
                }
                if (dist < 0.1) dist = 0.1;

                // Maintain the memory snapping feature
                if (parallelDistanceHistory.length > 0 && parallelDistanceHistory[0] > 0) {
                    const mem = parallelDistanceHistory[0];
                    if (Math.abs(dist - mem) < (20 / view.zoom)) {
                        dist = mem;
                        setIsParallelWheelActive(true);
                        fnStepValueRef.current = mem;
                    }
                }

                setParallelDistance(dist);
            }
        }
    } else if (activeTool === 'Eraser') {
        const rawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
        setEraserPos(rawPoint);
        setHighlightedTrimLine(null);
        setHighlightedTrimSegment(null);
        if (e.buttons === 1) {
            executeEraser(rawPoint, false);
        }
    } else if (activeTool === 'Trim') {
        const rawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
        const target = getTrimTargetAtPoint(rawPoint);
        setHighlightedTrimLine(target || null);
        
        if (target) {
            const result = computeTrimSegments(target, rawPoint, entities);
            if (result) {
                setHighlightedTrimSegment(result.highlighted);
            } else {
                setHighlightedTrimSegment(null);
            }
        } else {
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

    const isFreehandMode = activeTool === 'Line' && (defaultLineStyle.mode === 'ink' || defaultLineStyle.mode === 'pencil') && !orthoMode;
    const isTempOrthoHover = false;
    
    if (!drawing && !isFreehandMode && !isTempOrthoHover && (
        activeTool === 'Line' || 
        activeTool === 'Rectangle' || 
        activeTool === 'Circle' || 
        activeTool === 'Arc' || 
        activeTool === 'Dimension' || 
        activeTool === 'Move' || 
        activeTool === 'Copy' ||
        activeTool === 'BIM_Muro' ||
        activeTool === 'BIM_Porta' ||
        activeTool === 'BIM_Finestra' ||
        activeTool === 'BIM_Symbol' ||
        activeTool === 'BIM_DisegnaStanza'
    )) {
        const snapped = getSnappedPoint(rawPoint, entities, activeTool, null);
        if (snapped.snapped) {
            setHoverSnap(snapped);
        } else {
            setHoverSnap(null);
        }
    } else {
        setHoverSnap(null);
    }
    lastMouseRef.current = rawPoint;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    isDraggingZoomRef.current = false;
    isDraggingPanRef.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = '';
    if (isMovingTecnigrafo) {
        setIsMovingTecnigrafo(false);
        movingTecnigrafoStartRef.current = null;
        return;
    }
    freehandOrthoAnchorRef.current = null;
    
    // If we're freehand drawing, commit the stroke on mouseup
    if (activeTool === 'Line' && (defaultLineStyle.mode === 'ink' || defaultLineStyle.mode === 'pencil') && !orthoMode && drawing && drawing.isFreehand && drawing.freehandPoints && drawing.freehandPoints.length > 1) {
        const pts = drawing.freehandPoints;
        const newEntity: Entity = {
            id: Date.now().toString(),
            type: 'line',
            color: defaultLineStyle.color,
            lineWidth: defaultLineStyle.lineWidth,
            dashed: defaultLineStyle.dashed,
            mode: defaultLineStyle.mode === 'ink' ? 'ink' : 'pencil',
            start: pts[0],
            end: pts[pts.length - 1],
            isFreehand: true,
            inkPoints: pts.map(p => ({
                x: p.x,
                y: p.y,
                width: 0.5 + Math.random() * 0.5,
                alpha: 0.4 + Math.random() * 0.4
            })),
            layer: activeLayerId
        };
        setEntities(prev => {
            onCommitHistory?.(prev);
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
        const rawIds = getEntitiesInWindow(selectionWindow.start, selectionWindow.current, entities);
        const ids = resolveGroups(rawIds, entities);
        if (activeTool === 'Trim') {
            executeWindowTrim(selectionWindow.start, selectionWindow.current);
        } else if (activeTool === 'Cancella' && ids.length > 0) {
            setEntities(prev => {
                onCommitHistory?.(prev);
                return prev.filter(ent => !ids.includes(ent.id));
            });
        } else if (activeTool === 'Move' || activeTool === 'Copy') {
            setDragEntityIds(ids);
            if (activeTool === 'Copy') {
                setCopySourceEntityIds(ids);
            }
        } else if (activeTool === 'Join') {
            setDragEntityIds(prev => Array.from(new Set([...prev, ...ids])));
        } else if (activeTool === 'Specchio' && specchioState === 'objects') {
            setSpecchioSelectedIds(prev => {
                const newIds = ids.filter(id => id !== specchioFinalAxis?.entityId);
                return Array.from(new Set([...prev, ...newIds]));
            });
        }
        setSelectionWindow(null);
        return;
    }

    if ((activeTool === 'Move' || activeTool === 'Copy') && dragEntityIdRef.current) {
        if (activeTool === 'Copy' && isStickyCopyRef.current) {
            if (!dragHasMovedRef.current) {
                isStickyCopyRef.current = false;
                return;
            }
        }
        setDragEntityId(null);
        dragEntityIdRef.current = null;
        setActiveMoveSnapPoint(null);
        setEntities(prev => { onCommitHistory?.(prev); return [...prev]; });
        return;
    }

    if (activeTool === 'Eraser') {
        setEntities(prev => { onCommitHistory?.(prev); return prev; });
    } else if (positioningDimId) {
        setPositioningDimId(null);
        setEntities(prev => { onCommitHistory?.(prev); return prev; });
    }
  };

  const [flashIds, setFlashIds] = useState<string[]>([]);
  const [flashIntensity, setFlashIntensity] = useState(0);

  const confirmJoin = () => {
    if (activeTool === 'Join' && dragEntityIds.length > 1) {
        const newGroupId = Date.now().toString();
        const joinedIds = [...dragEntityIds];
        setEntities(prev => {
            onCommitHistory?.(prev);
            return prev.map(ent => {
                if (joinedIds.includes(ent.id)) {
                    return { ...ent, groupId: newGroupId };
                }
                return ent;
            });
        });
        
        // Trigger pulses
        setFlashIds(joinedIds);
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



  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();

    // Comportamento Invio / Conferma (Enter)
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

    // --- TECNIGRAFO SPECIAL TOGGLE ---
    if (tecnigrafoOrigin) {
        setDefaultLineStyle(prev => {
            const nextMode = prev.mode === 'pencil' ? 'ink' : (prev.mode === 'ink' ? 'CAD' : 'pencil');
            return { ...prev, mode: nextMode 
            };
        });
        return;
    }

    // ESC (Azzera selezioni e stati)
    onSelect(null);
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
    setShowManualInput(false);
    setIsParallelWheelActive(false);
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
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    window.dispatchEvent(ev);
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
      if (dragEntityId && (activeTool === 'Move' || activeTool === 'Copy')) {
        if (activeTool === 'Copy' && isStickyCopyRef.current) {
          if (!dragHasMovedRef.current) {
            isStickyCopyRef.current = false;
            return;
          }
        }
        setDragEntityId(null);
        setActiveMoveSnapPoint(null);
        setEntities(prev => { 
          onCommitHistory?.(prev); 
          return [...prev]; 
        });
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [dragEntityId, activeTool, onCommitHistory, dragTavolaId]);

  useEffect(() => {
    const updateJolly = (e: KeyboardEvent) => {
        let hardwareCaps = false;
        let scrollLock = false;
        let numLock = false;
        if (e.getModifierState) {
            hardwareCaps = !!e.getModifierState('CapsLock');
            scrollLock = !!e.getModifierState('ScrollLock');
            numLock = !!e.getModifierState('NumLock');
        }
        const isActive = hardwareCaps || scrollLock || numLock || e.shiftKey;
        setIsJollyActive(isActive);
        return isActive;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        const isJollyNow = updateJolly(e);
        
        // Frecce per muovere il punto
        if (activeTool === 'Line' && drawing) {
            const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
            if (keys.includes(e.key)) {
                // Avanzamento: 0.1 se Jolly (decimali), 1 se normale (unità intere)
                const step = isJollyNow ? 0.1 : 1;
                let change = { x: 0, y: 0 };
                if (e.key === 'ArrowRight') change = { x: step, y: 0 };
                else if (e.key === 'ArrowLeft') change = { x: -step, y: 0 };
                else if (e.key === 'ArrowDown') change = { x: 0, y: step };
                else if (e.key === 'ArrowUp') change = { x: 0, y: -step };
                
                if (change.x !== 0 || change.y !== 0) {
                    e.preventDefault();
                    setDrawing(prev => {
                        if (!prev) return null;
                        
                        // Determina se siamo in modalità orto effettiva
                        const effectiveOrtho = orthoMode ? !isShiftPressedRef.current : isShiftPressedRef.current;
                        
                        let nextX = prev.current.x + change.x;
                        let nextY = prev.current.y + change.y;
                        
                        if (effectiveOrtho) {
                            // Se orto è attivo, implementiamo il mantenimento della distanza quando si cambia asse
                            const dxPrevious = prev.current.x - prev.start.x;
                            const dyPrevious = prev.current.y - prev.start.y;
                            const dist = Math.sqrt(dxPrevious * dxPrevious + dyPrevious * dyPrevious);

                            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                                // Se eravamo prevalentemente verticali, saltiamo sulla linea orizzontale mantenendo la distanza
                                if (Math.abs(dyPrevious) > Math.abs(dxPrevious) && dist > 0) {
                                    nextX = prev.start.x + (e.key === 'ArrowRight' ? dist : -dist);
                                }
                                nextY = prev.start.y;
                            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                // Se eravamo prevalentemente orizzontali, saltiamo sulla linea verticale mantenendo la distanza
                                if (Math.abs(dxPrevious) > Math.abs(dyPrevious) && dist > 0) {
                                    nextY = prev.start.y + (e.key === 'ArrowDown' ? dist : -dist);
                                }
                                nextX = prev.start.x;
                            }
                        }
                        
                        // NOTA: Abbiamo rimosso Math.round per mantenere la parte decimale esistente come richiesto
                        
                        return { ...prev, current: { x: nextX, y: nextY } };
                    });
                    return;
                }
            }
        }

        if (e.key === 'Escape') {
            setDrawing(null);
            setManualRoomPoints([]);
            setIsLocked(false);
            setLockedFocalPoint(null);
            setTecnigrafoLock(null);
            setTecnigrafoOrigin(null);
            setHighlightedTrimSegment(null);
            setSelectedParallelLine(null);
            setActiveMoveSnapPoint(null);
            setDragEntityIds([]);
            setShowManualInput(false);
            setIsParallelWheelActive(false);
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

                // Automatic setup: Line tool with Ink mode and NO Ortho
                setActiveTool?.('Line');
                setDefaultLineStyle(prev => ({ ...prev, mode: 'ink' }));
                setOrthoMode?.(false);
            }
        } else if (e.key === 'Enter') {
            if (activeTool === 'Join') {
                confirmJoin();
            } else if (activeTool === 'Line' && drawing) {
                e.preventDefault();
                const finalPoint = drawing.current;
                const newEntity: Entity = {
                    id: Date.now().toString(),
                    type: 'line',
                    color: defaultLineStyle.color,
                    lineWidth: defaultLineStyle.lineWidth,
                    dashed: defaultLineStyle.dashed,
                    mode: defaultLineStyle.mode,
                    start: drawing.start,
                    end: finalPoint,
                    layer: activeLayerId,
                };
                
                setEntities(prev => {
                    onCommitHistory?.(prev);
                    return [...prev, newEntity];
                });
                
                // Start next segment
                const isFreehandMode = (defaultLineStyle.mode === 'pencil' || defaultLineStyle.mode === 'ink') && !orthoMode;
                setDrawing({ 
                    start: finalPoint, 
                    current: finalPoint, 
                    snapType: undefined, 
                    startSnapped: true,
                    isVirtual: false,
                    isFreehand: isFreehandMode,
                    freehandPoints: isFreehandMode ? [finalPoint] : undefined
                });
            }
        } else if (!showManualInput && /^[0-9\.\-]$/.test(e.key)) {
            if ((drawing && !drawing.isFreehand && (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Rectangle' || activeTool === 'BIM_Porta' || activeTool === 'BIM_Finestra' || activeTool === 'BIM_Muro')) ||
                (activeTool === 'Parallel' && selectedParallelLine)) {
                setShowManualInput(true);
            }
        }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
        updateJolly(e);

        if (e.key.toLowerCase() === 'q') {
            setTecnigrafoLock(null);
            setTecnigrafoOrigin(null);
            setLockedFocalPoint(null);
            // Tool settings (Tool, Mode, Ortho) are NOT restored, they persist as requested.
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeTool, dragEntityIds, entities, drawing, selectedParallelLine, showManualInput, orthoMode, setOrthoMode, tecnigrafoOrigin, lockedFocalPoint, activeMoveSnapPoint, hoverSnap, tecnigrafoLock, specchioMode, specchioSelectedIds, defaultLineStyle, setDefaultLineStyle, setActiveTool]);

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
                    if (ent.id === line.id) {
                        return { 
                            ...ent, 
                            start: { x: ent.start.x + offsetX, y: ent.start.y + offsetY },
                            end: { x: ent.end.x + offsetX, y: ent.end.y + offsetY }
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

  const handleManualCommit = (tool: string, data: any) => {
    if (tool === 'Parallel') {
        const dist = data.val1;
        setParallelDistance(dist);
        localStorage.setItem('lastParallelDistance', dist.toString());
        setParallelDistanceHistory(prev => [dist, ...prev.slice(0, 4)]);
        
        if (selectedParallelLine) {
            moveLineParallel(selectedParallelLine as LineEntity, dist, parallelMouse || {x: (selectedParallelLine as LineEntity).start.x, y: (selectedParallelLine as LineEntity).start.y + dist});
        }
        setShowManualInput(false);
        return;
    }
    if (tool === 'Line' && drawing) {
        const L = data.val1;
        let finalPoint: Point;
        
        if (drawing.lockedDir) {
            finalPoint = {
                x: drawing.start.x + L * drawing.lockedDir.x,
                y: drawing.start.y + L * drawing.lockedDir.y
            };
        } else {
            const A = data.val2;
            finalPoint = {
                x: drawing.start.x + L * Math.cos(A * Math.PI / 180),
                y: drawing.start.y + L * Math.sin(A * Math.PI / 180)
            };
        }
        
        const isFreehandMode = (defaultLineStyle.mode === 'ink' || defaultLineStyle.mode === 'pencil') && !orthoMode;
        const newEntity: Entity = {
            id: Date.now().toString(),
            type: 'line',
            color: defaultLineStyle.color,
            lineWidth: defaultLineStyle.lineWidth,
            dashed: defaultLineStyle.dashed,
            mode: defaultLineStyle.mode,
            isFreehand: false, // Precision lines from keyboard are NEVER freehand wavy
            start: drawing.start,
            end: finalPoint,
            layer: activeLayerId
        };
        setEntities(prev => { onCommitHistory?.(prev); return [...prev, newEntity]; });
        
        // After committing current segment, start next one
        const updatedEntities = [...entities, newEntity];
        const snapRes = getSnappedPoint(actualMousePosRef.current, updatedEntities, activeTool, { start: finalPoint } as any);

        setDrawing({ 
            start: finalPoint, 
            current: snapRes.point, 
            snapType: snapRes.snapped ? snapRes.type as any : undefined, 
            startSnapped: true,
            isFreehand: false // Force straight line for the NEXT segment after manual input
        });
    } else if (tool === 'Circle' && drawing) {
        const R = data.val1;
        const newEntity: Entity = {
            id: Date.now().toString(),
            type: 'circle',
            color: defaultLineStyle.color,
            lineWidth: defaultLineStyle.lineWidth,
            dashed: defaultLineStyle.dashed,
            mode: defaultLineStyle.mode,
            center: drawing.start,
            radius: R,
            layer: activeLayerId
        };
        setEntities(prev => { onCommitHistory?.(prev); return [...prev, newEntity]; });
        setDrawing(null);
    } else if (tool === 'Rectangle' && drawing) {
        const finalPoint = { x: drawing.start.x + data.val1, y: drawing.start.y + data.val2 };
        const newEntity: Entity = {
            id: Date.now().toString(),
            type: 'rectangle',
            color: defaultLineStyle.color,
            lineWidth: defaultLineStyle.lineWidth,
            dashed: defaultLineStyle.dashed,
            mode: defaultLineStyle.mode,
            p1: drawing.start,
            p2: finalPoint,
            layer: activeLayerId
        };
        setEntities(prev => { onCommitHistory?.(prev); return [...prev, newEntity]; });
        setDrawing(null);
    } else if ((tool === 'BIM_Porta' || tool === 'BIM_Finestra' || tool === 'BIM_Muro') && drawing) {
        const L = data.val1;
        const H = data.val2 || 0;
        let finalPoint: Point;
        
        const dx = drawing.current.x - drawing.start.x;
        const dy = drawing.current.y - drawing.start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 0.1) {
            finalPoint = {
                x: drawing.start.x + (dx / dist) * L,
                y: drawing.start.y + (dy / dist) * L
            };
        } else {
            finalPoint = {
                x: drawing.start.x + L,
                y: drawing.start.y
            };
        }

        let newEntity: Entity;
        if (tool === 'BIM_Muro') {
            const thickness = lastWallThickness || 15;
            newEntity = {
                id: Date.now().toString(),
                type: 'line',
                isBIM: true,
                bimType: 'wall',
                bimName: `Muro sp.${thickness} cm`,
                bimWidth: thickness,
                start: drawing.start,
                end: finalPoint,
                color: '#4b5563',
                lineWidth: 2,
                mode: 'ink',
                layer: 'BIM_Muri'
            } as any;
            setLastWallThickness(thickness);
            localStorage.setItem('lastWallThickness', thickness.toString());
        } else {
            const isDoor = tool === 'BIM_Porta';
            newEntity = {
                id: Date.now().toString(),
                type: 'line',
                isBIM: true,
                bimType: isDoor ? 'door' : 'window',
                bimName: isDoor ? `Porta ${L}` : `Finestra ${L}x${H}`,
                bimWidth: L,
                bimWindowHeight: isDoor ? undefined : H,
                start: drawing.start,
                end: finalPoint,
                color: isDoor ? '#dc2626' : '#2563eb',
                lineWidth: 2,
                mode: 'ink',
                layer: isDoor ? 'BIM_Porte' : 'BIM_Finestre'
            } as any;

            if (isDoor) {
                setLastDoorWidth(L);
                setLastDoorHeight(H);
                localStorage.setItem('lastDoorWidth', L.toString());
                localStorage.setItem('lastDoorHeight', H.toString());
            } else {
                setLastWindowWidth(L);
                setLastWindowHeight(H);
                localStorage.setItem('lastWindowWidth', L.toString());
                localStorage.setItem('lastWindowHeight', H.toString());
            }
        }

        setEntities(prev => { onCommitHistory?.(prev); return [...prev, newEntity]; });
        
        if (tool === 'BIM_Muro') {
            setDrawing({
                start: finalPoint,
                current: finalPoint,
                snapType: 'CAD',
                startSnapped: true,
                isVirtual: false
            });
        } else {
            setDrawing(null);
        }
    } else if (tool === 'Parallel' && selectedParallelLine && lastMouseRef.current) {
        const line = selectedParallelLine as LineEntity;
        const length = data.val1;
        
        const dxLine = line.end.x - line.start.x;
        const dyLine = line.end.y - line.start.y;
        const L = Math.sqrt(dxLine * dxLine + dyLine * dyLine);
        const normX = -dyLine / L;
        const normY = dxLine / L;
        
        const vecMouse = { x: parallelMouse!.x - line.start.x, y: parallelMouse!.y - line.start.y };
        const dir = (vecMouse.x * normX + vecMouse.y * normY) >= 0 ? 1 : -1;
        
        const offsetX = normX * length * dir;
        const offsetY = normY * length * dir;
        
        const newEntity: Entity = {
            id: Date.now().toString(),
            type: 'line',
            color: line.color,
            lineWidth: line.lineWidth,
            dashed: line.dashed,
            mode: line.mode,
            start: { x: line.start.x + offsetX, y: line.start.y + offsetY },
            end: { x: line.end.x + offsetX, y: line.end.y + offsetY },
            layer: line.layer
        };
        setEntities(prev => { onCommitHistory?.(prev); return [...prev, newEntity]; });
        setParallelDistance(length);
        setParallelDistanceHistory(hist => {
            const newHist = Array.from(new Set([length, ...hist]));
            return newHist.slice(0, 5);
        });
        setSelectedParallelLine(newEntity);
    }
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
            const newEntity: Entity = {
                id: Date.now().toString(),
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
  
  const getPencilCursor = (label: string) => {
    const svg = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(4, 60) rotate(-45)">
        <polygon points="0,0 8,-2 8,2" fill="#333333" />
        <polygon points="8,-2 20,-6 20,6 8,2" fill="#fcd34d" />
        <polygon points="20,-6 56,-6 56,6 20,6" fill="#fbbf24" stroke="#d97706" stroke-width="0.5"/>
        <line x1="20" y1="-2" x2="56" y2="-2" stroke="#f59e0b" stroke-width="1" />
        <line x1="20" y1="2" x2="56" y2="2" stroke="#f59e0b" stroke-width="1" />
        <text x="38" y="3" font-family="sans-serif" font-size="10" font-weight="900" fill="#451a03" text-anchor="middle" transform="rotate(0)">${label}</text>
      </g>
    </svg>`;
    return `url("data:image/svg+xml;base64,${btoa(svg)}") 4 60, crosshair`;
  };

  const getKinaCursor = (label: string) => {
    const svg = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(4, 60) rotate(-45)">
        <rect x="0" y="-1" width="12" height="2" fill="#94a3b8" />
        <polygon points="12,-1 20,-5 20,5 12,1" fill="#475569" />
        <rect x="20" y="-5" width="4" height="10" fill="#64748b" />
        <rect x="24" y="-5" width="36" height="10" fill="#0f172a" />
        <line x1="24" y1="-2" x2="60" y2="-2" stroke="#334155" stroke-width="1" />
        <text x="42" y="3.5" font-family="monospace" font-size="10" font-weight="900" fill="white" text-anchor="middle">${label}</text>
      </g>
    </svg>`;
    return `url("data:image/svg+xml;base64,${btoa(svg)}") 4 60, crosshair`;
  };

  const pencilSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M0,0 L3,1 L1,3 Z" fill="#1e293b"/><path d="M3,1 L7,3 L3,7 L1,3 Z" fill="#fed7aa"/><path d="M7,3 L21,17 L17,21 L3,7 Z" fill="#4f46e5"/><path d="M7,3 L21,17 L19,19 L5,5 Z" fill="#6366f1"/><path d="M21,17 L24,20 L20,24 L17,21 Z" fill="#94a3b8"/><path d="M24,20 L28,24 L24,28 L20,24 Z" fill="#fda4af"/></svg>`);
  const kinaSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M0,0 L4,2 L2,4 Z" fill="#000000"/><path d="M4,2 L8,4 L4,8 L2,4 Z" fill="#94a3b8"/><path d="M8,4 L22,18 L18,22 L4,8 Z" fill="#334155"/><path d="M22,18 L26,22 L22,26 L18,22 Z" fill="#1e293b"/><rect x="22" y="22" width="6" height="6" fill="#1e293b" transform="rotate(45 25 25)"/></svg>`);

  const crosshairSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"><circle cx="48" cy="48" r="4" fill="transparent" stroke="rgba(0,0,0,0.6)" stroke-width="1"/></svg>`);

  const kinaLabel = defaultLineStyle.mode === 'ink' ? defaultLineStyle.lineWidth.toString() : '';
  const pencilLabel = defaultLineStyle.color === '#bbbbbb' ? '2H' : (defaultLineStyle.color === '#444444' ? 'HB' : '2B');

  let helpContent = null;
  let helpTitle = activeTool;

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


  return (
    <div 
      ref={containerRef} 
      className="w-full h-full relative" 
      style={{ cursor: hoveredTavolaPart ? 'pointer' : isMovingTecnigrafo ? 'grabbing' : hoverMoveTecnigrafo ? 'grab' : dragTavolaId ? 'grabbing' : hoverTavolaEdge ? 'grab' : activeTool === 'Testo' ? 'text' : (activeTool === 'Eraser' || (activeTool === 'Parallel' && selectedParallelLine)) ? 'none' : activeTool === 'Trim' ? `url("${scissorsSvg}") 16 16, crosshair` : defaultLineStyle.mode === 'CAD' ? 'crosshair' : defaultLineStyle.mode === 'ink' ? getKinaCursor(kinaLabel) : defaultLineStyle.mode === 'pencil' ? getPencilCursor(pencilLabel) : rulerStyle === 'crosshair' ? `url("${crosshairSvg}") 48 48, crosshair` : `url("${tecnigrafoSvg}") 20 108, crosshair` }}
      onWheel={handleWheel} 
      onMouseDown={handleMouseDown} 
      onMouseMove={handleMouseMove} 
      onMouseUp={handleMouseUp} 
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseLeave={() => setHoveredTavolaPart(null)}
    >
      <canvas ref={canvasRef} />
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
          onClick={() => setTextDialog(null)}
        >
          <div 
            className="bg-white border select-none border-neutral-200 rounded-xl shadow-2xl p-6 flex flex-col gap-4 w-96 max-w-[90vw] animate-scale-up"
            onClick={(e) => e.stopPropagation()}
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
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCommitText();
                  }
                }}
                autoFocus
              />
              <p className="text-[9px] text-neutral-400 font-mono text-right mt-0.5">
                Premi Invio per confermare • Shift+Invio per nuova riga
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

            {showManualInput && (
          <ManualInputOverlay
              type={activeTool === "Parallel" ? "parallel" : (activeTool.toLowerCase() as any)}
              drawing={drawing || undefined}
              parallelLine={activeTool === "Parallel" ? { 
                  start: selectedParallelLine?.type === 'line' ? (selectedParallelLine as LineEntity).start : { x: 0, y: 0 }, 
                  end: selectedParallelLine?.type === 'line' ? (selectedParallelLine as LineEntity).end : { x: 0, y: 0 }, 
                  mouse: parallelMouse || lastMouseRef.current,
                  distance: parallelDistance
              } : undefined}
              canvasToScreen={canvasToScreen}
              onCommit={(data) => { 
                  handleManualCommit(activeTool, data); 
                  setShowManualInput(false); 
                  setBubblePosition(null);
              }}
              isOpen={showManualInput}
              onClose={() => {
                  setShowManualInput(false);
                  setBubblePosition(null);
              }}
              position={bubblePosition}
          />
      )}
    </div>
  );
});
