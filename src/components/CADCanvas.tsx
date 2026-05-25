import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Entity, Point, Layer, LineEntity, CircleEntity, ArcEntity, RectEntity } from '../types';
import { ManualInputOverlay } from './ManualInputOverlay';

export interface CADCanvasAPI {
  getCurrentMousePosition: () => Point;
}

const normalizeAngle = (a: number) => {
  let deg = a % 360;
  if (deg < 0) deg += 360;
  return deg;
};

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

const getArcSubsegmentsOutsideEraser = (
  center: Point,
  radiusC: number,
  startAngle: number,
  endAngle: number,
  isCircle: boolean,
  eraserCenter: Point,
  eraserRadius: number
): { startAngle: number; endAngle: number }[] | null => {
  const d = Math.sqrt((center.x - eraserCenter.x) ** 2 + (center.y - eraserCenter.y) ** 2);
  
  if (d > radiusC + eraserRadius) {
      return null;
  }
  if (d + radiusC <= eraserRadius) {
      return [];
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
  for (let i = 0; i < splits.length - 1; i++) {
      const s = splits[i];
      const e = splits[i + 1];
      if (e - s < epsilon) continue;
      
      const mid = (s + e) / 2;
      const angleMid = normalizeAngle(A + mid);
      
      if (!isAngleInArc(angleMid, I1, I2)) {
          keptIntervals.push({ start: s, end: e });
      }
  }
  
  if (keptIntervals.length === 0) {
      return [];
  }
  if (keptIntervals.length === 1 && Math.abs((keptIntervals[0].end - keptIntervals[0].start) - L) < epsilon) {
      return null;
  }
  
  if (isCircle && keptIntervals.length > 1) {
      const first = keptIntervals[0];
      const last = keptIntervals[keptIntervals.length - 1];
      if (Math.abs(first.start - 0) < epsilon && Math.abs(last.end - 360) < epsilon) {
          const merged = { start: last.start, end: first.end + 360 };
          const middle = keptIntervals.slice(1, keptIntervals.length - 1);
          const finalIntervals = [...middle, merged];
          return finalIntervals.map(interval => ({
              startAngle: normalizeAngle(A + interval.start),
              endAngle: normalizeAngle(A + interval.end)
          }));
      }
  }
  
  return keptIntervals.map(interval => ({
      startAngle: normalizeAngle(A + interval.start),
      endAngle: normalizeAngle(A + interval.end)
  }));
};

interface CADCanvasProps {
  entities: Entity[];
  activeTool: string;
  setEntities: React.Dispatch<React.SetStateAction<Entity[]>>;
  setEntitiesSilent?: React.Dispatch<React.SetStateAction<Entity[]>>;
  onCommitHistory?: (entities: Entity[]) => void;
  onSelect: (id: string | null) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  activeLayerId: string;
  layers: Layer[];
  defaultLineStyle: { color: string, lineWidth: number, dashed: boolean, mode: 'ink' | 'pencil' };
  eraserRadius: number;
  setEraserRadius: React.Dispatch<React.SetStateAction<number>>;
  onMouseMovePosition?: (pos: Point) => void;
  rulerStyle?: 'tecnigrafo' | 'crosshair';
  orthoMode?: boolean;
}

export const CADCanvas = React.forwardRef<CADCanvasAPI, CADCanvasProps>(({ entities, activeTool, setEntities, setEntitiesSilent, onCommitHistory, onSelect, onContextMenu, activeLayerId, layers, defaultLineStyle, eraserRadius, setEraserRadius, onMouseMovePosition, rulerStyle = 'tecnigrafo', orthoMode = false }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const [drawing, setDrawing] = useState<{
    start: Point;
    current: Point;
    snapType?: 'standard' | 'smart';
    refPoint?: Point;
    constraintAxis?: 'x' | 'y';
    refPoint2?: Point;
    constraintAxis2?: 'x' | 'y';
    hasDoubleSmart?: boolean;
    activeConstraint?: { axis: 'x' | 'y'; value: number };
  } | null>(null);
  const [selectedParallelLine, setSelectedParallelLine] = useState<Entity | null>(null);
  const [highlightedTrimLine, setHighlightedTrimLine] = useState<Entity | null>(null);
  const [highlightedTrimSegment, setHighlightedTrimSegment] = useState<{ type: 'line' | 'arc'; start?: Point; end?: Point; center?: Point; radius?: number; startAngle?: number; endAngle?: number } | null>(null);
  const [hoverSnap, setHoverSnap] = useState<{
    point: Point;
    snapped: boolean;
    type: 'standard' | 'smart';
    refPoint?: Point;
    constraintAxis?: 'x' | 'y';
    refPoint2?: Point;
    constraintAxis2?: 'x' | 'y';
    hasDoubleSmart?: boolean;
  } | null>(null);
  const [dragEntityId, setDragEntityId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({x: 0, y: 0});
  const [eraserPos, setEraserPos] = useState({x: 0, y: 0});
  const [parallelDistance, setParallelDistance] = useState<number>(0);
  const [parallelMouse, setParallelMouse] = useState<Point | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [positioningDimId, setPositioningDimId] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const lastMouseRef = useRef<Point>({ x: 0, y: 0 });
  const lastEraserExecutionTime = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const isCtrlPressedRef = useRef(false);
  const isPanningRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setIsCtrlPressed(true);
        isCtrlPressedRef.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setIsCtrlPressed(false);
        isCtrlPressedRef.current = false;
      }
    };
    const handleBlur = () => {
      setIsCtrlPressed(false);
      isCtrlPressedRef.current = false;
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
     setDrawing(null);
     setSelectedParallelLine(null);
     setHighlightedTrimLine(null);
     setHighlightedTrimSegment(null);
     setDragEntityId(null);
     setPositioningDimId(null);
     setParallelMouse(null);
  }, [activeTool]);

  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(prev => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useImperativeHandle(ref, () => ({
    getCurrentMousePosition: () => lastMouseRef.current
  }));

  const screenToCanvas = (x: number, y: number): Point => {
    return {
      x: (x - view.pan.x) / view.zoom,
      y: (y - view.pan.y) / view.zoom
    };
  };

  const canvasToScreen = (x: number, y: number): Point => {
    return {
      x: x * view.zoom + view.pan.x,
      y: y * view.zoom + view.pan.y
    };
  };

  const getSnapPoints = (point: Point, entities: Entity[], activeTool: string, drawing: {start: Point, current: Point} | null): {point: Point, type: 'standard' | 'smart', refPoint?: Point, constraintAxis?: 'x' | 'y'}[] => {
    const snaps: {point: Point, type: 'standard' | 'smart', refPoint?: Point, constraintAxis?: 'x' | 'y'}[] = [];
    const keyPoints: Point[] = [];
    
    // Only snap to visible layers
    const visibleEntities = entities.filter(ent => {
        const layer = layers.find(l => l.id === ent.layer);
        return !(layer && !layer.visible);
    });

    visibleEntities.forEach(entity => {
      if (entity.type === 'line') {
        snaps.push({point: entity.start, type: 'standard', refPoint: entity.start});
        snaps.push({point: entity.end, type: 'standard', refPoint: entity.end});
        keyPoints.push(entity.start);
        keyPoints.push(entity.end);
      } else if (entity.type === 'circle') {
        snaps.push({point: entity.center, type: 'standard', refPoint: entity.center});
        keyPoints.push(entity.center);
      } else if (entity.type === 'rectangle') {
        snaps.push({point: entity.p1, type: 'standard', refPoint: entity.p1});
        snaps.push({point: entity.p2, type: 'standard', refPoint: entity.p2});
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
        snaps.push({point: pStart, type: 'standard', refPoint: pStart});
        snaps.push({point: pEnd, type: 'standard', refPoint: pEnd});
        keyPoints.push(pStart);
        keyPoints.push(pEnd);
      } else if (entity.type === 'point') {
        const p = entity.point || (entity as any).position;
        if (p) {
          snaps.push({point: p, type: 'standard', refPoint: p});
          keyPoints.push(p);
        }
      }
    });

    const isDrawingTool = ['Line', 'Circle', 'Arc', 'Rectangle', 'Point', 'Dimension'].includes(activeTool);
    if (isDrawingTool && (drawing ? true : isCtrlPressedRef.current)) {
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

        // Smart alignments: only 0 (horiz) and 90 (vert) degrees to intercept distant known orthogonal points
        const angles = [0, 90];
        uniqueKeyPoints.forEach(kp => {
            // If currently drawing, avoid snapping to the active start point itself to prevent self-lock
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
    
    return snaps;
  };

  const getSnappedPoint = (point: Point, entities: Entity[], activeTool: string, drawing: {start: Point, current: Point} | null): {
    point: Point;
    snapped: boolean;
    type: 'standard' | 'smart';
    refPoint?: Point;
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
      if (snap.type === 'standard') {
        const dist = Math.sqrt((point.x - snap.point.x) ** 2 + (point.y - snap.point.y) ** 2);
        if (dist < threshold && dist < minStandardDist) {
          minStandardDist = dist;
          closestStandard = snap;
        }
      }
    }

    if (closestStandard) {
      return { point: closestStandard.point, snapped: true, type: 'standard', refPoint: closestStandard.refPoint, constraintAxis: closestStandard.constraintAxis };
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
        constraintAxis: bestSmart.constraintAxis
      };
    }
    
    return { point, snapped: false, type: 'standard' };
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
      if (layer && !layer.visible) continue;

      let hit = false;
      if (ent.type === 'line') {
        const dist = distanceToSegment(point, ent.start, ent.end);
        if (dist < 10 / view.zoom) hit = true;
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
  
  const getLineAtPoint = (point: Point): Entity | undefined => {
      const ent = getEntityAtPoint(point);
      return ent && ent.type === 'line' ? ent : undefined;
  };
  const renderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        canvas.width = entry.contentRect.width;
        canvas.height = entry.contentRect.height;
        renderRef.current?.();
      }
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

      // Clear and draw based on view state
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#EFECE5'; // Vellum look (tracing paper)
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(view.pan.x, view.pan.y);
      ctx.scale(view.zoom, view.zoom);
      
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Draw existing entities
      entities.forEach(entity => {
        const layer = layers.find(l => l.id === entity.layer);
        if (layer && !layer.visible) return;
        
        ctx.strokeStyle = '#000000'; // ALL lines black, as requested
        ctx.lineWidth = Math.max(0.8, entity.lineWidth / view.zoom); // Ensure visibility
        ctx.globalAlpha = 1.0; // Force opaque
        ctx.shadowBlur = 0; // Remove blur for sharp lines
        if ((entity.id === selectedParallelLine?.id && blink)) {
          ctx.strokeStyle = 'cyan'; // Selection color, different from ink
          ctx.lineWidth = (entity.lineWidth + 4) / view.zoom;
        } else if (activeTool === 'Trim' && highlightedTrimSegment && entity.id === highlightedTrimLine?.id) {
            // Eraser highlight only
        }
        
        if (entity.dashed) {
          ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        if (entity.type === 'line') {
          ctx.moveTo(entity.start.x, entity.start.y);
          ctx.lineTo(entity.end.x, entity.end.y);
        } else if (entity.type === 'dimension') {
            const dx = entity.end.x - entity.start.x;
            const dy = entity.end.y - entity.start.y;
            const L = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / L;
            const ny = dx / L;

            const p1 = { x: entity.start.x + nx * entity.offset, y: entity.start.y + ny * entity.offset };
            const p2 = { x: entity.end.x + nx * entity.offset, y: entity.end.y + ny * entity.offset };
            
            // Thinner line for dimensions
            ctx.lineWidth = 0.5 / view.zoom;
            
            // Dimension line
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);

            // Extension lines (gampette)
            const legBehind = 20;
            const legAhead = 8;
            const offsetDir = entity.offset >= 0 ? 1 : -1;
            
            ctx.moveTo(p1.x - nx * legBehind * offsetDir, p1.y - ny * legBehind * offsetDir);
            ctx.lineTo(p1.x + nx * legAhead * offsetDir, p1.y + ny * legAhead * offsetDir);

            ctx.moveTo(p2.x - nx * legBehind * offsetDir, p2.y - ny * legBehind * offsetDir);
            ctx.lineTo(p2.x + nx * legAhead * offsetDir, p2.y + ny * legAhead * offsetDir);

            // Inclined intersection slashes
            const slashSize = 5;
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
            ctx.font = `12px sans-serif`;
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
            ctx.translate(0, -3); // Offset slightly above the dimension line
            
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
        ctx.setLineDash([]);
      });

      // Eraser cursor
      if (activeTool === 'Eraser') {
          ctx.strokeStyle = 'rgba(234, 179, 8, 0.9)'; // Spesso giallo
          ctx.lineWidth = 3.5 / view.zoom;
          ctx.fillStyle = 'rgba(254, 240, 138, 0.35)'; // Giallo tenue trasparente all'interno
          ctx.beginPath();
          ctx.arc(eraserPos.x, eraserPos.y, eraserRadius / view.zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
      }

      // Draw current drawing preview
      if (drawing && (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Rectangle')) {
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

        ctx.strokeStyle = isKnownAngle 
            ? '#22c55e' 
            : ((defaultLineStyle.mode === 'pencil') ? 'rgba(136, 136, 136, 0.5)' : 'rgba(0, 0, 0, 1.0)');
        ctx.lineWidth = 2 / view.zoom;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        if (activeTool === 'Line') {
            ctx.moveTo(drawing.start.x, drawing.start.y);
            ctx.lineTo(drawing.current.x, drawing.current.y);
        } else if (activeTool === 'Circle') {
            const radius = Math.sqrt(Math.pow(drawing.current.x - drawing.start.x, 2) + Math.pow(drawing.current.y - drawing.start.y, 2));
            ctx.arc(drawing.start.x, drawing.start.y, radius, 0, Math.PI * 2);
        } else {
            const width = drawing.current.x - drawing.start.x;
            const height = drawing.current.y - drawing.start.y;
            ctx.rect(drawing.start.x, drawing.start.y, width, height);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        
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

        // Render snap indicator
        ctx.strokeStyle = drawing.snapType === 'smart' ? '#22c55e' : 'cyan';
        ctx.lineWidth = 2 / view.zoom;
        ctx.beginPath();
        ctx.rect(drawing.current.x - 5/view.zoom, drawing.current.y - 5/view.zoom, 10/view.zoom, 10/view.zoom);
        ctx.stroke();
        
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
                ctx.strokeStyle = '#22c55e';
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

      // Render hover snap indicator
      if (!drawing && hoverSnap && hoverSnap.snapped) {
        ctx.strokeStyle = hoverSnap.type === 'smart' ? '#22c55e' : 'cyan';
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

      ctx.restore();
      
      // Draw Parallel preview
      if (activeTool === 'Parallel' && selectedParallelLine && parallelMouse) {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.save();
          ctx.translate(view.pan.x, view.pan.y);
          ctx.scale(view.zoom, view.zoom);
          ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
          ctx.strokeStyle = 'cyan';
          ctx.lineWidth = 1 / view.zoom;
          ctx.beginPath();
          ctx.moveTo(parallelMouse.x, parallelMouse.y);
          
          const line = selectedParallelLine;
          const dxLine = line.end.x - line.start.x;
          const dyLine = line.end.y - line.start.y;
          const L = Math.sqrt(dxLine * dxLine + dyLine * dyLine);
          const normX = -dyLine / L;
          const normY = dxLine / L;
          const vecMouse = { x: parallelMouse.x - line.start.x, y: parallelMouse.y - line.start.y };
          const dist = vecMouse.x * normX + vecMouse.y * normY;
          
          const projX = parallelMouse.x - normX * dist;
          const projY = parallelMouse.y - normY * dist;
          
          ctx.lineTo(projX, projY);
          ctx.stroke();
          ctx.restore();
          ctx.setLineDash([]);
      }
    };

    renderRef.current = render;
    render(); // Initial render for this effect run
  });

  // Basic pan/zoom handling
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (isPanningRef.current) return; // Prevent zooming while middle-click panning!
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setView(prev => ({
        ...prev,
        zoom: Math.max(0.1, prev.zoom * zoomFactor)
    }));
  };

  const executeEraser = (rawPoint: Point, force: boolean = false) => {
       if (!force) {
           if (Date.now() - lastEraserExecutionTime.current < 30) return;
       }
       lastEraserExecutionTime.current = Date.now();
       const radius = eraserRadius / view.zoom;
       
       const getLineSubsegmentsOutsideCircle = (start: Point, end: Point, center: Point, radius: number): Point[][] | null => {
           const v = { x: start.x - center.x, y: start.y - center.y };
           const d = { x: end.x - start.x, y: end.y - start.y };
           
           const a = d.x * d.x + d.y * d.y;
           const b = 2 * (v.x * d.x + v.y * d.y);
           const c = (v.x * v.x + v.y * v.y) - radius * radius;
           
           const startDist = Math.sqrt(v.x*v.x + v.y*v.y);
           if (a === 0) { // Point-like line
              return startDist <= radius ? [] : null;
           }
           
           const discriminant = b * b - 4 * a * c;
           
           if (discriminant < 0) {
               return startDist <= radius ? [] : null;
           }
           
           const sqrtD = Math.sqrt(discriminant);
           const t1 = (-b - sqrtD) / (2 * a);
           const t2 = (-b + sqrtD) / (2 * a);
           
           if ((t1 <= 0 || t1 >= 1) && (t2 <= 0 || t2 >= 1)) {
               return startDist <= radius ? [] : null;
           }
           
           const segments: Point[][] = [];
           
           const points: { t: number, p: Point }[] = [{t: 0, p: start}, {t: 1, p: end}];
           if (t1 > 0 && t1 < 1) points.push({t: t1, p: { x: start.x + t1*d.x, y: start.y + t1*d.y }});
           if (t2 > 0 && t2 < 1) points.push({t: t2, p: { x: start.x + t2*d.x, y: start.y + t2*d.y }});
           
           points.sort((a,b) => a.t - b.t);
           
           let changed = false;
           for (let i = 0; i < points.length - 1; i++) {
               const mid = {
                   x: (points[i].p.x + points[i+1].p.x) / 2,
                   y: (points[i].p.y + points[i+1].p.y) / 2
               };
               
               const dist = Math.sqrt((mid.x - center.x)**2 + (mid.y - center.y)**2);
               const segDist = Math.sqrt((points[i].p.x - points[i+1].p.x)**2 + (points[i].p.y - points[i+1].p.y)**2);
               
               if (dist > radius - 0.001) {
                   if (segDist > 0.001) {
                       segments.push([points[i].p, points[i+1].p]);
                   } else {
                       changed = true; // remove tiny artifacts
                   }
               } else {
                   changed = true;
               }
           }
           
           return changed ? segments : null;
        };

        let changed = false;
        const newEntities = entities.flatMap(ent => {
            if (ent.type === 'line') {
                const segments = getLineSubsegmentsOutsideCircle(ent.start, ent.end, rawPoint, radius);
                if (segments) {
                    changed = true;
                    return segments.map((seg, i) => ({
                        ...ent,
                        id: i === 0 ? ent.id : Date.now().toString() + i + Math.random(),
                        start: seg[0],
                        end: seg[1]
                    }));
                }
            } else {
                let hit = false;
                if (ent.type === 'circle') {
                    const arcSegments = getArcSubsegmentsOutsideEraser(ent.center, ent.radius, 0, 360, true, rawPoint, radius);
                    if (arcSegments) {
                        changed = true;
                        return arcSegments.map((seg, i) => ({
                            ...ent,
                            id: i === 0 ? ent.id : Date.now().toString() + i + Math.random(),
                            type: 'arc' as const,
                            startAngle: seg.startAngle,
                            endAngle: seg.endAngle
                        }));
                    }
                } else if (ent.type === 'arc') {
                    const arcSegments = getArcSubsegmentsOutsideEraser(ent.center, ent.radius, ent.startAngle, ent.endAngle, false, rawPoint, radius);
                    if (arcSegments) {
                        changed = true;
                        return arcSegments.map((seg, i) => ({
                            ...ent,
                            id: i === 0 ? ent.id : Date.now().toString() + i + Math.random(),
                            startAngle: seg.startAngle,
                            endAngle: seg.endAngle
                        }));
                    }
                } else if (false) {
                    const distToCenter = Math.sqrt((rawPoint.x - ent.center.x)**2 + (rawPoint.y - ent.center.y)**2);
                    if (Math.abs(distToCenter - ent.radius) <= radius) hit = true;
                } else if (ent.type === 'rectangle') {
                    if (distanceToSegment(rawPoint, ent.p1, {x: ent.p2.x, y: ent.p1.y}) < radius ||
                        distanceToSegment(rawPoint, {x: ent.p2.x, y: ent.p1.y}, ent.p2) < radius ||
                        distanceToSegment(rawPoint, ent.p2, {x: ent.p1.x, y: ent.p2.y}) < radius ||
                        distanceToSegment(rawPoint, {x: ent.p1.x, y: ent.p2.y}, ent.p1) < radius) hit = true;
                } else if (ent.type === 'dimension') {
                   const dx = ent.end.x - ent.start.x;
                   const dy = ent.end.y - ent.start.y;
                   const L = Math.sqrt(dx * dx + dy * dy);
                   const nx = -dy / L;
                   const ny = dx / L;

                   const p1 = { x: ent.start.x + nx * ent.offset, y: ent.start.y + ny * ent.offset };
                   const p2 = { x: ent.end.x + nx * ent.offset, y: ent.end.y + ny * ent.offset };
                   if (distanceToSegment(rawPoint, p1, p2) < radius) hit = true;
                } else if (ent.type === 'point') {
                    const p = ent.point || (ent as any).position;
                    const dist = p ? Math.sqrt((rawPoint.x - p.x)**2 + (rawPoint.y - p.y)**2) : Infinity;
                    if (dist <= radius) hit = true;
                } else if (ent.type === 'arc') {
                    const dist = Math.sqrt((rawPoint.x - ent.center.x)**2 + (rawPoint.y - ent.center.y)**2);
                    if (dist <= radius) hit = true;
                }
                
                if (hit) {
                    changed = true;
                    return [];
                }
            }
            return [ent];
        });
        
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
    if (e.button === 2) return; // Let onContextMenu handle right clicks
    if (e.button === 1) {
      e.preventDefault();
      isPanningRef.current = true;
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
    const rawPoint = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
    lastMouseRef.current = rawPoint;
    
    if (positioningDimId) {
        setPositioningDimId(null);
        setEntities(prev => { onCommitHistory?.(prev); return prev; });
        return;
    }

    const snapped = getSnappedPoint(rawPoint, entities, activeTool, drawing);

    if (activeTool === 'Select') {
        const found = getEntityAtPoint(rawPoint);
        if (found) {
            onSelect(found.id);
            if (found.type === 'dimension') {
                setPositioningDimId(found.id);
            }
        } else {
            onSelect(null);
        }
    } else if (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Rectangle' || activeTool === 'Point' || activeTool === 'Arc') {
      const wasLocked = isLocked;
      setIsLocked(false);
      
      if (drawing && (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Rectangle')) {
          const rawSnapped = getSnappedPoint(rawPoint, entities, activeTool, drawing);
          let snappedResult;

          if (rawSnapped.snapped && rawSnapped.type === 'standard') {
              snappedResult = rawSnapped;
          } else {
              let finalPoint = rawPoint;
              const isOrthoHorizontal = activeTool === 'Line' && orthoMode && Math.abs(rawPoint.x - drawing.start.x) >= Math.abs(rawPoint.y - drawing.start.y);

              // Standard Ortho or Angle Snapping logic
              if (activeTool === 'Line') {
                  if (orthoMode) {
                      finalPoint = isOrthoHorizontal ? { x: finalPoint.x, y: drawing.start.y } : { x: drawing.start.x, y: finalPoint.y };
                  } else {
                      finalPoint = wasLocked ? drawing.current : ((e.altKey && activeTool === 'Line') ? rawPoint : applyAngleSnapping(drawing.start, rawPoint));
                  }
              } else {
                  finalPoint = wasLocked ? drawing.current : rawPoint;
              }

              const snapped: ReturnType<typeof getSnappedPoint> = wasLocked 
                  ? { point: finalPoint, snapped: true, type: 'standard', refPoint: undefined, constraintAxis: undefined, refPoint2: undefined, constraintAxis2: undefined, hasDoubleSmart: false } 
                  : getSnappedPoint(finalPoint, entities, activeTool, drawing);
              let snappedPoint = snapped.point;

              if (activeTool === 'Line' && orthoMode) {
                  // Keep absolute rigidity: project snapping point back onto the orthogonal axes
                  snappedPoint = isOrthoHorizontal ? { x: snappedPoint.x, y: drawing.start.y } : { x: drawing.start.x, y: snappedPoint.y };
              }
              
              snappedResult = {
                  point: snappedPoint,
                  type: snapped.type,
                  refPoint: snapped.refPoint,
                  constraintAxis: snapped.constraintAxis,
                  refPoint2: snapped.refPoint2,
                  constraintAxis2: snapped.constraintAxis2,
                  hasDoubleSmart: snapped.hasDoubleSmart
              };
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
                layer: defaultLineStyle.lineWidth > 1 ? 'Spessori' : activeLayerId
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
                layer: defaultLineStyle.lineWidth > 1 ? 'Spessori' : activeLayerId
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
                layer: defaultLineStyle.lineWidth > 1 ? 'Spessori' : activeLayerId
              };
          }
          if (newEntity) {
              setEntities(prev => [...prev, newEntity!]);
          }
          
          if (activeTool === 'Line') {
              // Start next segment
              setDrawing({ 
                start: snappedResult.point, 
                current: snappedResult.point, 
                snapType: snappedResult.type, 
                refPoint: snappedResult.refPoint,
                constraintAxis: snappedResult.constraintAxis,
                refPoint2: snappedResult.refPoint2,
                constraintAxis2: snappedResult.constraintAxis2,
                hasDoubleSmart: snappedResult.hasDoubleSmart,
                activeConstraint: undefined
              });
          } else {
              setDrawing(null);
          }
          return;
      }

      setDrawing({ 
        start: snapped.point, 
        current: snapped.point, 
        snapType: snapped.type, 
        refPoint: snapped.refPoint,
        constraintAxis: snapped.constraintAxis,
        refPoint2: snapped.refPoint2,
        constraintAxis2: snapped.constraintAxis2,
        hasDoubleSmart: snapped.hasDoubleSmart,
        activeConstraint: undefined
      });
      if (activeTool === 'Point') {
        const newEntity: Entity = {
          id: Date.now().toString(),
          type: 'point',
          color: defaultLineStyle.color,
          lineWidth: defaultLineStyle.lineWidth,
          mode: defaultLineStyle.mode,
          point: snapped.point,
          layer: defaultLineStyle.lineWidth > 1 ? 'Spessori' : activeLayerId
        };
        setEntities(prev => [...prev, newEntity]);
        setDrawing(null);
        return;
      }
    } else if (activeTool === 'Move') {
        const found = getEntityAtPoint(rawPoint);
        if (found) {
            setDragEntityId(found.id);
            let anchor = {x: 0, y: 0};
            if (found.type === 'line' || found.type === 'dimension') anchor = found.start;
            else if (found.type === 'circle') anchor = found.center;
            else if (found.type === 'rectangle') anchor = found.p1;
            setDragOffset({ x: rawPoint.x - anchor.x, y: rawPoint.y - anchor.y });
        }
    } else if (activeTool === 'Parallel') {
      const found = getLineAtPoint(rawPoint);
      if (found && found.id !== selectedParallelLine?.id) {
          setSelectedParallelLine(found);
      } else if (selectedParallelLine && parallelDistance > 0) {
          const line = selectedParallelLine;
          const length = parallelDistance;
          
          const dxLine = line.end.x - line.start.x;
          const dyLine = line.end.y - line.start.y;
          const L = Math.sqrt(dxLine * dxLine + dyLine * dyLine);
          const normX = -dyLine / L;
          const normY = dxLine / L;
          
          const vecMouse = { x: rawPoint.x - line.start.x, y: rawPoint.y - line.start.y };
          const dir = (vecMouse.x * normX + vecMouse.y * normY) >= 0 ? 1 : -1;
          
          const offsetX = normX * length * dir;
          const offsetY = normY * length * dir;
          
          const newEntity: Entity = {
              id: Date.now().toString(),
              type: 'line',
              color: defaultLineStyle.color,
              lineWidth: defaultLineStyle.lineWidth,
              dashed: defaultLineStyle.dashed,
              mode: defaultLineStyle.mode,
              start: { x: line.start.x + offsetX, y: line.start.y + offsetY },
              end: { x: line.end.x + offsetX, y: line.end.y + offsetY },
              layer: defaultLineStyle.lineWidth > 1 ? 'Spessori' : activeLayerId
          };
          setEntities(prev => { onCommitHistory?.(prev); return [...prev, newEntity]; });
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
        const rawPoint = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
        setEraserPos(rawPoint);
        executeEraser(rawPoint, true);
    } else if (activeTool === 'Trim') {
        const rawPoint = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
        executeTrim(rawPoint);
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawPoint = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
    lastMouseRef.current = rawPoint;
    onMouseMovePosition?.(rawPoint);

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

    if (drawing) {
      if (isLocked) return;
      
      const rawSnapped = getSnappedPoint(rawPoint, entities, activeTool, drawing);
      if (rawSnapped.snapped && rawSnapped.type === 'standard') {
        setDrawing({ 
            ...drawing, 
            current: rawSnapped.point, 
            snapType: rawSnapped.type, 
            refPoint: undefined,
            constraintAxis: undefined,
            refPoint2: undefined,
            constraintAxis2: undefined,
            hasDoubleSmart: false,
            activeConstraint: undefined
        });
      } else {
        let finalPoint = rawPoint;
        const isOrthoHorizontal = activeTool === 'Line' && orthoMode && Math.abs(rawPoint.x - drawing.start.x) >= Math.abs(rawPoint.y - drawing.start.y);

        // Apply constraint enforcement
        if (drawing.activeConstraint) {
            if (drawing.activeConstraint.axis === 'x') finalPoint.x = drawing.activeConstraint.value;
            else finalPoint.y = drawing.activeConstraint.value;
        }
        
        if (activeTool === 'Line') {
          if (orthoMode) {
            finalPoint = isOrthoHorizontal ? { x: finalPoint.x, y: drawing.start.y } : { x: drawing.start.x, y: finalPoint.y };
          } else if (!e.altKey) {
            finalPoint = applyAngleSnapping(drawing.start, rawPoint);
          }
        }

        const snapped = getSnappedPoint(finalPoint, entities, activeTool, drawing);
        let snappedPoint = snapped.point;
        if (activeTool === 'Line' && orthoMode) {
          // absolute rigidity of Ortho line: project snapping back onto orthogonal coordinate
          snappedPoint = isOrthoHorizontal ? { x: snappedPoint.x, y: drawing.start.y } : { x: drawing.start.x, y: snappedPoint.y };
        }

        setDrawing({ 
            ...drawing, 
            current: snappedPoint, 
            snapType: snapped.snapped ? snapped.type : undefined, 
            refPoint: snapped.refPoint,
            constraintAxis: snapped.constraintAxis,
            refPoint2: snapped.refPoint2,
            constraintAxis2: snapped.constraintAxis2,
            hasDoubleSmart: snapped.hasDoubleSmart,
            activeConstraint: undefined
        });
      }
    } else if (activeTool === 'Move' && dragEntityId) {
        const updater = (prev: Entity[]) => prev.map(ent => {
            if (ent.id === dragEntityId) {
                const targetAnchor = { x: rawPoint.x - dragOffset.x, y: rawPoint.y - dragOffset.y };                
                let oldAnchor: Point;
                if (ent.type === 'line' || ent.type === 'dimension') oldAnchor = ent.start;
                else if (ent.type === 'circle' || ent.type === 'arc') oldAnchor = ent.center;
                else if (ent.type === 'rectangle') oldAnchor = ent.p1;
                else if (ent.type === 'point') oldAnchor = ent.point || (ent as any).position;
                else oldAnchor = {x: 0, y: 0};
                
                const dx = targetAnchor.x - oldAnchor.x;
                const dy = targetAnchor.y - oldAnchor.y;
                
                if (ent.type === 'line') return { ...ent, start: { x: ent.start.x + dx, y: ent.start.y + dy }, end: { x: ent.end.x + dx, y: ent.end.y + dy } };
                if (ent.type === 'circle') return { ...ent, center: { x: ent.center.x + dx, y: ent.center.y + dy } };
                if (ent.type === 'rectangle') return { ...ent, p1: { x: ent.p1.x + dx, y: ent.p1.y + dy }, p2: { x: ent.p2.x + dx, y: ent.p2.y + dy } };
                if (ent.type === 'point') return { ...ent, point: { x: oldAnchor.x + dx, y: oldAnchor.y + dy } };
                if (ent.type === 'arc') return { ...ent, center: { x: ent.center.x + dx, y: ent.center.y + dy } };
                if (ent.type === 'dimension') {
                    // Decompose movement into parallel and perpendicular components
                    const dxLine = ent.end.x - ent.start.x;
                    const dyLine = ent.end.y - ent.start.y;
                    const L = Math.sqrt(dxLine * dxLine + dyLine * dyLine);
                    const nx = -dyLine / L;
                    const ny = dxLine / L;
                    
                    const dotNormal = dx * nx + dy * ny; // This is the perpendicular change (offset change)
                    const dotParallel = dx * (dxLine/L) + dy * (dyLine/L); // Parallel change (shift along line)
                    
                    return { 
                        ...ent, 
                        start: { x: ent.start.x + dotParallel * (dxLine/L), y: ent.start.y + dotParallel * (dyLine/L) }, 
                        end: { x: ent.end.x + dotParallel * (dxLine/L), y: ent.end.y + dotParallel * (dyLine/L) },
                        offset: ent.offset + dotNormal
                    };
                }
            }
            return ent;
        });
        if (setEntitiesSilent) setEntitiesSilent(updater);
        else setEntities(updater);
    } else if (activeTool === 'Parallel' && selectedParallelLine) {
        setParallelMouse(rawPoint);
    } else if (activeTool === 'Eraser') {
        const rawPoint = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
        setEraserPos(rawPoint);
        setHighlightedTrimLine(null);
        setHighlightedTrimSegment(null);
        if (e.buttons === 1) {
            executeEraser(rawPoint, false);
        }
    } else if (activeTool === 'Trim') {
        const rawPoint = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
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
    }

    if (!drawing && (activeTool === 'Line' || activeTool === 'Rectangle' || activeTool === 'Circle' || activeTool === 'Arc' || activeTool === 'Dimension' || activeTool === 'Move')) {
        const snapped = getSnappedPoint(rawPoint, entities, activeTool, null);
        if (snapped.snapped) {
            setHoverSnap(snapped);
        } else {
            setHoverSnap(null);
        }
    } else {
        setHoverSnap(null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (activeTool === 'Move') {
        setDragEntityId(null);
        setEntities(prev => { onCommitHistory?.(prev); return prev; });
    } else if (activeTool === 'Eraser') {
        setEntities(prev => { onCommitHistory?.(prev); return prev; });
    } else if (positioningDimId) {
        setPositioningDimId(null);
        setEntities(prev => { onCommitHistory?.(prev); return prev; });
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (drawing && (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Rectangle')) {
        setShowManualInput(true);
        return;
    }
    if (activeTool === 'Parallel' && selectedParallelLine) {
        setShowManualInput(true);
        return;
    }
    if (drawing) {
        setDrawing(null);
        return;
    }
    onContextMenu?.(e);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            setDrawing(null);
            setIsLocked(false);
            setHighlightedTrimSegment(null);
            setSelectedParallelLine(null);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleManualCommit = (tool: string, data: any) => {
    if (tool === 'Line' && drawing) {
        const L = data.val1;
        const A = data.val2;
        const finalPoint = {
            x: drawing.start.x + L * Math.cos(A * Math.PI / 180),
            y: drawing.start.y + L * Math.sin(A * Math.PI / 180)
        };
        const newEntity: Entity = {
            id: Date.now().toString(),
            type: 'line',
            color: defaultLineStyle.color,
            lineWidth: defaultLineStyle.lineWidth,
            dashed: defaultLineStyle.dashed,
            mode: defaultLineStyle.mode,
            start: drawing.start,
            end: finalPoint,
            layer: defaultLineStyle.lineWidth > 1 ? 'Spessori' : activeLayerId
        };
        setEntities(prev => { onCommitHistory?.(prev); return [...prev, newEntity]; });
        setDrawing({ start: finalPoint, current: finalPoint, snapType: 'standard' });
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
            layer: defaultLineStyle.lineWidth > 1 ? 'Spessori' : activeLayerId
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
            layer: defaultLineStyle.lineWidth > 1 ? 'Spessori' : activeLayerId
        };
        setEntities(prev => { onCommitHistory?.(prev); return [...prev, newEntity]; });
        setDrawing(null);
    } else if (tool === 'Parallel' && selectedParallelLine) {
        const line = selectedParallelLine;
        const length = data.val1;
        
        const dxLine = line.end.x - line.start.x;
        const dyLine = line.end.y - line.start.y;
        const L = Math.sqrt(dxLine * dxLine + dyLine * dyLine);
        const normX = -dyLine / L;
        const normY = dxLine / L;
        
        const vecMouse = { x: lastMouseRef.current.x - line.start.x, y: lastMouseRef.current.y - line.start.y };
        const dir = (vecMouse.x * normX + vecMouse.y * normY) >= 0 ? 1 : -1;
        
        const offsetX = normX * length * dir;
        const offsetY = normY * length * dir;
        
        const newEntity: Entity = {
            id: Date.now().toString(),
            type: 'line',
            color: defaultLineStyle.color,
            lineWidth: defaultLineStyle.lineWidth,
            dashed: defaultLineStyle.dashed,
            mode: defaultLineStyle.mode,
            start: { x: line.start.x + offsetX, y: line.start.y + offsetY },
            end: { x: line.end.x + offsetX, y: line.end.y + offsetY },
            layer: defaultLineStyle.lineWidth > 1 ? 'Spessori' : activeLayerId
        };
        setEntities(prev => { onCommitHistory?.(prev); return [...prev, newEntity]; });
        setParallelDistance(length);
        // Do not clear selectedParallelLine, allowing the user to create multiple parallel lines to the same segment.
    }
  };

  const tecnigrafoSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><rect x="38" y="108" width="90" height="16" fill="rgba(212,163,115,0.7)" stroke="#8b5a2b" stroke-width="1"/><rect x="38" y="108" width="90" height="6" fill="rgba(255,255,255,0.7)" stroke="#8b5a2b" stroke-width="0.5"/><line x1="40" y1="108" x2="40" y2="112" stroke="black" stroke-width="1"/><line x1="50" y1="108" x2="50" y2="114" stroke="black" stroke-width="1.5"/><line x1="60" y1="108" x2="60" y2="112" stroke="black" stroke-width="1"/><line x1="70" y1="108" x2="70" y2="112" stroke="black" stroke-width="1"/><line x1="80" y1="108" x2="80" y2="114" stroke="black" stroke-width="1.5"/><line x1="90" y1="108" x2="90" y2="112" stroke="black" stroke-width="1"/><line x1="100" y1="108" x2="100" y2="112" stroke="black" stroke-width="1"/><line x1="110" y1="108" x2="110" y2="114" stroke="black" stroke-width="1.5"/><line x1="120" y1="108" x2="120" y2="112" stroke="black" stroke-width="1"/><rect x="4" y="0" width="16" height="90" fill="rgba(212,163,115,0.7)" stroke="#8b5a2b" stroke-width="1"/><rect x="14" y="0" width="6" height="90" fill="rgba(255,255,255,0.7)" stroke="#8b5a2b" stroke-width="0.5"/><line x1="20" y1="88" x2="16" y2="88" stroke="black" stroke-width="1"/><line x1="20" y1="78" x2="14" y2="78" stroke="black" stroke-width="1.5"/><line x1="20" y1="68" x2="16" y2="68" stroke="black" stroke-width="1"/><line x1="20" y1="58" x2="16" y2="58" stroke="black" stroke-width="1"/><line x1="20" y1="48" x2="14" y2="48" stroke="black" stroke-width="1.5"/><line x1="20" y1="38" x2="16" y2="38" stroke="black" stroke-width="1"/><line x1="20" y1="28" x2="16" y2="28" stroke="black" stroke-width="1"/><line x1="20" y1="18" x2="14" y2="18" stroke="black" stroke-width="1.5"/><line x1="20" y1="8" x2="16" y2="8" stroke="black" stroke-width="1"/><circle cx="20" cy="108" r="18" fill="transparent" stroke="rgba(50,50,50,0.6)" stroke-width="1"/><line x1="8" y1="108" x2="32" y2="108" stroke="rgba(255,0,0,0.8)" stroke-width="1"/><line x1="20" y1="96" x2="20" y2="120" stroke="rgba(255,0,0,0.8)" stroke-width="1"/></svg>`);

  const scissorsSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="7.5" r="3" stroke="#64748b" stroke-width="1.5"/><circle cx="5" cy="16.5" r="3" stroke="#64748b" stroke-width="1.5"/><path d="M7.5 9L12 12L22 9" stroke="#64748b" stroke-width="1.5" stroke-linecap="round"/><path d="M7.5 15L12 12L22 15" stroke="#64748b" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="1.2" fill="#475569"/></svg>`);

  const crosshairSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="48" x2="96" y2="48" stroke="rgba(255,40,40,0.85)" stroke-width="1.5"/><line x1="48" y1="0" x2="48" y2="96" stroke="rgba(255,40,40,0.85)" stroke-width="1.5"/><circle cx="48" cy="48" r="4" fill="transparent" stroke="rgba(0,0,0,0.6)" stroke-width="1"/></svg>`);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full relative" 
      style={{ cursor: activeTool === 'Eraser' ? 'none' : activeTool === 'Trim' ? `url("${scissorsSvg}") 16 16, crosshair` : rulerStyle === 'crosshair' ? `url("${crosshairSvg}") 48 48, crosshair` : `url("${tecnigrafoSvg}") 20 108, crosshair` }}
      onWheel={handleWheel} 
      onMouseDown={handleMouseDown} 
      onMouseMove={handleMouseMove} 
      onMouseUp={handleMouseUp} 
      onContextMenu={handleContextMenu}
    >
      <canvas ref={canvasRef} />
      
      {drawing && (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Rectangle') && (
        <ManualInputOverlay
            type={activeTool.toLowerCase() as any}
            drawing={drawing}
            canvasToScreen={canvasToScreen}
            onCommit={(data) => { setShowManualInput(false); handleManualCommit(activeTool, data); }}
            isOpen={showManualInput}
            onClose={() => setShowManualInput(false)}
        />
      )}

      {selectedParallelLine && activeTool === 'Parallel' && (
        <ManualInputOverlay
            type="parallel"
            parallelLine={{ start: selectedParallelLine.start, end: selectedParallelLine.end, mouse: lastMouseRef.current }}
            canvasToScreen={canvasToScreen}
            onCommit={(data) => { setShowManualInput(false); handleManualCommit('Parallel', data); }}
            isOpen={showManualInput}
            onClose={() => setShowManualInput(false)}
        />
      )}
    </div>
  );
});
