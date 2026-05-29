import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Entity, Point, Layer, LineEntity, CircleEntity, ArcEntity, RectEntity, InkPoint, Tavola, DimensionEntity, PointEntity } from '../types';
import { ManualInputOverlay } from './ManualInputOverlay';
import { TEMPLATES, Template } from '../data/templates';

export interface CADCanvasAPI {
  getCurrentMousePosition: () => Point;
  rotateMaskAtPoint: (e: React.MouseEvent) => boolean;
}

const normalizeAngle = (a: number) => {
  let deg = a % 360;
  if (deg < 0) deg += 360;
  return deg;
};

const getIntersection = (a: Point, b: Point, c: Point, d: Point): Point | null => {
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
  defaultLineStyle: { color: string, lineWidth: number, dashed: boolean, mode: 'ink' | 'pencil' };
  setDefaultLineStyle: React.Dispatch<React.SetStateAction<{ color: string, lineWidth: number, dashed: boolean, mode: 'ink' | 'pencil' }>>;
  eraserRadius: number;
  setEraserRadius: React.Dispatch<React.SetStateAction<number>>;
  onMouseMovePosition?: (pos: Point) => void;
  rulerStyle?: 'tecnigrafo' | 'crosshair';
  orthoMode?: boolean;
  tavole?: Tavola[];
  onUpdateTavole?: (tavole: Tavola[]) => void;
  onDoubleClickTavola?: (id: string) => void;
  selectedTemplateId?: string | null;
  selectedEntityId?: string | null;
}

export const CADCanvas = React.forwardRef<CADCanvasAPI, CADCanvasProps>(({ entities, activeTool, setActiveTool, setEntities, setEntitiesSilent, onCommitHistory, onSelect, onContextMenu, activeLayerId, layers, defaultLineStyle, setDefaultLineStyle, eraserRadius, setEraserRadius, onMouseMovePosition, rulerStyle = 'tecnigrafo', orthoMode = false, tavole, onUpdateTavole, onDoubleClickTavola, selectedTemplateId, selectedEntityId }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ zoom: 0.15, pan: { x: window.innerWidth > 0 ? (window.innerWidth / 2) - 150 : 250, y: window.innerHeight > 0 ? (window.innerHeight / 2) - 220 : 80 } });
  const [dragTavolaId, setDragTavolaId] = useState<string | null>(null);
  const [hoverTavolaEdge, setHoverTavolaEdge] = useState(false);
  const dragTavolaIdRef = useRef<string | null>(null);
  useEffect(() => { dragTavolaIdRef.current = dragTavolaId; }, [dragTavolaId]);

  const [copySourceEntityIds, setCopySourceEntityIds] = useState<string[]>([]);
  const [clonedEntityIds, setClonedEntityIds] = useState<Set<string>>(new Set());
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastClickTimeRef = useRef<number>(0);
  const lastClickPosRef = useRef<{ x: number, y: number } | null>(null);
  const isHoldFiredRef = useRef<boolean>(false);
  const skipToolResetRef = useRef<boolean>(false);
  const isStickyCopyRef = useRef<boolean>(false);
  const dragHasMovedRef = useRef<boolean>(false);
  const [drawing, setDrawing] = useState<{
    start: Point;
    current: Point;
    snapType?: 'standard' | 'smart';
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
  } | null>(null);
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
    type: 'standard' | 'smart';
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
  const [activeMoveSnapPoint, setActiveMoveSnapPoint] = useState<Point | null>(null);
  const [selectionWindow, setSelectionWindow] = useState<{ start: Point; current: Point } | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({x: 0, y: 0});
  const [eraserPos, setEraserPos] = useState({x: 0, y: 0});
  const [parallelDistance, setParallelDistance] = useState<number>(0);
  const [parallelDistanceHistory, setParallelDistanceHistory] = useState<number[]>([]);
  const [parallelMouse, setParallelMouse] = useState<Point | null>(null);
  const [isParallelWheelActive, setIsParallelWheelActive] = useState(false);
  const [isJollyActive, setIsJollyActive] = useState(false);
  const [parallelSign, setParallelSign] = useState<number>(1);
  const lastControlledPointRef = useRef<Point>({ x: 0, y: 0 });
  const actualMousePosRef = useRef<Point>({ x: 0, y: 0 });
  const mouseScreenPosRef = useRef<Point>({ x: 0, y: 0 });
  const [isLocked, setIsLocked] = useState(false);
  const [positioningDimId, setPositioningDimId] = useState<string | null>(null);
  const [positioningGroupId, setPositioningGroupId] = useState<string | null>(null);
  const [positioningGroupStartPos, setPositioningGroupStartPos] = useState<Point | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [bubblePosition, setBubblePosition] = useState<Point | null>(null);
  const lastMouseRef = useRef<Point>({ x: 0, y: 0 });
  const previousMouseRef = useRef<Point>({ x: 0, y: 0 });
  const lastEraserExecutionTime = useRef(0);
  const lastEraseTimeByEntityId = useRef<Record<string, number>>({});
  const lastEraseTimeByPoint = useRef<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const fnStepValueRef = useRef<number>(0);
  const fnAnchorCanvasPosRef = useRef<Point | null>(null);

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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
        isShiftPressedRef.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
        isShiftPressedRef.current = false;
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

  const getSnapPoints = (point: Point, entities: Entity[], activeTool: string, drawing: {start: Point, current: Point} | null): {point: Point, type: 'standard' | 'smart', refPoint?: Point, refEntityId?: string, constraintAxis?: 'x' | 'y'}[] => {
    const snaps: {point: Point, type: 'standard' | 'smart', refPoint?: Point, refEntityId?: string, constraintAxis?: 'x' | 'y'}[] = [];
    const keyPoints: Point[] = [];
    
    // Only snap to visible and non-frozen layers
    const visibleEntities = entities.filter(ent => {
        const layer = layers.find(l => l.id === ent.layer);
        return !(layer && (!layer.visible || layer.frozen));
    });

    visibleEntities.forEach(entity => {
      if (entity.type === 'line') {
        snaps.push({point: entity.start, type: 'standard', refPoint: entity.start});
        snaps.push({point: entity.end, type: 'standard', refPoint: entity.end});
        const midPoint = {x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2};
        snaps.push({point: midPoint, type: 'standard', refPoint: midPoint});
        keyPoints.push(entity.start);
        keyPoints.push(entity.end);
        keyPoints.push(midPoint);
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

    // Add intersection points for lines
    for (let i = 0; i < visibleEntities.length; i++) {
        for (let j = i + 1; j < visibleEntities.length; j++) {
            const ent1 = visibleEntities[i];
            const ent2 = visibleEntities[j];

            if (ent1.type === 'line' && ent2.type === 'line') {
                const intersection = getIntersection(ent1.start, ent1.end, ent2.start, ent2.end);
                if (intersection) {
                    snaps.push({ point: intersection, type: 'standard', refPoint: intersection });
                }
            }
        }
    }

    const isDrawingTool = ['Line', 'Circle', 'Arc', 'Rectangle', 'Point', 'Dimension'].includes(activeTool);
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
        // DISABLE extension snaps if orthoMode is on, to keep everything horizontal/vertical
        if (!orthoMode) {
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
    }
    
    return snaps;
  };

  const getSnappedPoint = (point: Point, entities: Entity[], activeTool: string, drawing: {start: Point, current: Point} | null): {
    point: Point;
    snapped: boolean;
    type: 'standard' | 'smart';
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
      if (snap.type === 'standard') {
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
        type: 'standard', 
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
      if (layer && (!layer.visible || layer.frozen)) continue;

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
    }
    return points;
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
        
        const isFlashing = flashIds.includes(entity.id);

        ctx.strokeStyle = (entity.mode === 'ink') ? '#555555' : '#000000';
        ctx.lineWidth = Math.max(0.8, entity.lineWidth / view.zoom); // Ensure visibility
        ctx.globalAlpha = entity.opacity !== undefined ? entity.opacity : 1.0;
        if (layer && layer.frozen) {
            ctx.globalAlpha *= 0.4;
        }
        ctx.shadowBlur = 0; // Remove blur for sharp lines

        if (isFlashing) {
            // Pulse between black and soft green
            const r = Math.round(0 + (34 - 0) * flashIntensity);
            const g = Math.round(0 + (197 - 0) * flashIntensity);
            const b = Math.round(0 + (94 - 0) * flashIntensity);
            ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.lineWidth = (entity.lineWidth + 2 + 3 * flashIntensity) / view.zoom;
            ctx.shadowColor = `rgba(34, 197, 94, ${0.6 * flashIntensity})`;
            ctx.shadowBlur = 10 * flashIntensity;
        }

        if ((entity.id === selectedParallelLine?.id && blink) || (selectedEntityId === entity.id) || (positioningGroupId && entity.groupId === positioningGroupId)) {
          ctx.strokeStyle = '#fbbf24'; // Amber highlight
          ctx.lineWidth = (entity.lineWidth + 2) / view.zoom;
        } else if ((dragEntityIds.includes(entity.id) || entity.id === highlightedTrimLine?.id) && (activeTool === 'Move' || activeTool === 'Cancella' || activeTool === 'Join' || activeTool === 'Copy')) {
            ctx.strokeStyle = activeTool === 'Cancella' ? '#ef4444' : activeTool === 'Join' ? '#22c55e' : '#3b82f6';
            ctx.lineWidth = (entity.lineWidth + 4) / view.zoom;
        } else if (copySourceEntityIds.includes(entity.id) && activeTool === 'Copy') {
            ctx.strokeStyle = '#22c55e'; // Green highlight for original mother object(s)
            ctx.lineWidth = (entity.lineWidth + 4) / view.zoom;
        } else if (activeTool === 'Trim' && highlightedTrimSegment && entity.id === highlightedTrimLine?.id) {
            // Eraser highlight only
        }
        
        let isHighlighted = false;
        let highlightColor = ctx.strokeStyle;
        if (isFlashing) {
             isHighlighted = true;
        } else if ((entity.id === selectedParallelLine?.id && blink) || (selectedEntityId === entity.id) || (positioningGroupId && entity.groupId === positioningGroupId)) {
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
          if (entity.mode === 'ink') {
              if (entity.inkPoints) {
                  let lastX = entity.start.x;
                  let lastY = entity.start.y;
                  for(let i=0; i<entity.inkPoints.length; i++) {
                      const pt = entity.inkPoints[i];
                      const t = i / (entity.inkPoints.length - 1);
                      const bx = entity.start.x + (entity.end.x - entity.start.x) * t;
                      const by = entity.start.y + (entity.end.y - entity.start.y) * t;
                      
                      const px = entity.isFreehand ? pt.x : bx + pt.x * (1.0 / view.zoom);
                      const py = entity.isFreehand ? pt.y : by + pt.y * (1.0 / view.zoom);
     
                      ctx.beginPath();
                      ctx.lineWidth = Math.max(0.2, pt.width * (entity.lineWidth / view.zoom));
                      ctx.strokeStyle = isHighlighted ? highlightColor : `rgba(85, 85, 85, ${pt.alpha})`;
                      ctx.moveTo(lastX, lastY);
                      ctx.lineTo(px, py);
                      ctx.stroke();
                      
                      lastX = px;
                      lastY = py;
                  }
              } else {
                  // Fallback for existing ink lines
                  const steps = 20;
                  const dx = entity.end.x - entity.start.x;
                  const dy = entity.end.y - entity.start.y;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  const nx = len > 0 ? -dy / len : 0;
                  const ny = len > 0 ? dx / len : 0;
                  let lastX = entity.start.x;
                  let lastY = entity.start.y;
                  for(let i=1; i<=steps; i++) {
                      const t = i/steps;
                      const bx = entity.start.x + dx * t;
                      const by = entity.start.y + dy * t;
                      const wave = Math.sin(t * Math.PI * 4) * (0.6 / view.zoom);
                      const px = bx + nx * wave;
                      const py = by + ny * wave;

                      ctx.beginPath();
                      ctx.lineWidth = Math.max(0.2, (0.5 + Math.random() * 0.5) * (entity.lineWidth / view.zoom));
                      ctx.strokeStyle = isHighlighted ? highlightColor : `rgba(85, 85, 85, ${0.3 + Math.random() * 0.4})`;
                      ctx.moveTo(lastX, lastY);
                      ctx.lineTo(px, py);
                      ctx.stroke();
                      
                      lastX = px;
                      lastY = py;
                  }
              }
          } else {
              ctx.moveTo(entity.start.x, entity.start.y);
              ctx.lineTo(entity.end.x, entity.end.y);
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

          if (defaultLineStyle.mode === 'ink') {
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
                ctx.lineWidth = Math.max(0.4, widthSeed * (defaultLineStyle.lineWidth / view.zoom));
                ctx.strokeStyle = `rgba(85, 85, 85, ${alphaSeed})`;
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
                    : ((defaultLineStyle.mode === 'pencil') ? 'rgba(136, 136, 136, 0.5)' : (defaultLineStyle.mode === 'ink' ? '#555555' : 'rgba(0, 0, 0, 1.0)')));
            ctx.lineWidth = (drawing.wheelLength !== undefined ? 4 : 2) / view.zoom;
            ctx.setLineDash([5, 5]);
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
                        ctx.strokeStyle = `rgba(85, 85, 85, ${0.3 + Math.random() * 0.4})`;
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
            } else {
                const width = drawing.current.x - drawing.start.x;
                const height = drawing.current.y - drawing.start.y;
                ctx.rect(drawing.start.x, drawing.start.y, width, height);
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
                ctx.strokeStyle = (defaultLineStyle.mode === 'ink') ? '#555555' : '#000000';
                ctx.lineWidth = defaultLineStyle.lineWidth / view.zoom;
                ctx.globalAlpha = 0.5;
                
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

        ctx.strokeStyle = drawing.snapType === 'smart' ? '#9ca3af' : '#fbbf24';
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

      const isFreehandMode = activeTool === 'Line' && defaultLineStyle.mode === 'ink' && !orthoMode;

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
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillRect(cartX, cartY, cartiglioW, cartiglioH);
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 1.2 / view.zoom;
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
          ctx.fillStyle = 'rgba(37, 99, 235, 0.9)';
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

          // Standard selection colors (blue for window, green for crossing)
          const isCrossing = selectionWindow.current.x < selectionWindow.start.x;
          
          if (isCrossing) {
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

      // LENTE INGRANDIMENTO HUD FOR PRECISION MODE (Right click activated)
      const isPrecisionModeActive = (drawing && drawing.wheelLength !== undefined) || 
                                    (activeTool === 'Parallel' && selectedParallelLine && isParallelWheelActive);
      
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

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setView(prev => ({
        ...prev,
        zoom: Math.max(0.1, prev.zoom * zoomFactor)
    }));
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
                if (ent.isFreehand && ent.inkPoints) {
                    // Freehand sketch lines - fade individual points inside the eraser circle!
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
            if (activeTool === 'Join') {
                confirmJoin();
                return;
            } else if (tavole && onDoubleClickTavola) {
                for (let i = tavole.length - 1; i >= 0; i--) {
                  const tav = tavole[i];
                  if (!tav.visible) continue;
                  const { w, h } = getTavolaDimensions(tav);
                  if (rawPoint.x >= tav.position.x && rawPoint.x <= tav.position.x + w &&
                      rawPoint.y >= tav.position.y && rawPoint.y <= tav.position.y + h) {
                    onDoubleClickTavola(tav.id);
                    setDrawing(null);
                    return; 
                  }
                }
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

    const isFreehandActive = activeTool === 'Line' && defaultLineStyle.mode === 'ink' && !orthoMode;
    const snapped = (isFreehandActive || (activeTool === 'Template' && !drawing))
        ? { point: rawPoint, snapped: false, type: 'standard' as const, refPoint: undefined, constraintAxis: undefined, refPoint2: undefined, constraintAxis2: undefined, hasDoubleSmart: false }
        : getSnappedPoint(rawPoint, entities, activeTool, drawing);

    if (activeTool === 'Select') {
        const found = getEntityAtPoint(rawPoint);
        if (found) {
            onSelect(found.id);
            if (found.type === 'dimension') {
                setPositioningDimId(found.id);
            } else if (found.groupId) {
                // Seleziona tutto il gruppo e attiva lo spostamento "appiccicoso"
                setPositioningGroupId(found.groupId);
                setPositioningGroupStartPos(rawPoint);
            }
        } else {
            onSelect(null);
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
                    groupId
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
    } else if (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Rectangle' || activeTool === 'Point' || activeTool === 'Arc') {
      const wasLocked = isLocked;
      setIsLocked(false);
      
      if (drawing && (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Rectangle')) {
          let snappedResult;

          if (drawing.wheelLength !== undefined) {
              snappedResult = {
                  point: drawing.current,
                  type: 'standard' as const,
                  refPoint: undefined,
                  constraintAxis: undefined,
                  refPoint2: undefined,
                  constraintAxis2: undefined,
                  hasDoubleSmart: false
              };
          } else {
              const rawSnapped = getSnappedPoint(rawPoint, entities, activeTool, drawing);
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
                      if (orthoMode) {
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
                      type: 'standard' as const,
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
                inkPoints: defaultLineStyle.mode === 'ink' ? (() => {
                  const points: InkPoint[] = [];
                  const steps = 20;
                  const dx = snappedResult.point.x - drawing.start.x;
                  const dy = snappedResult.point.y - drawing.start.y;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  const nx = len > 0 ? -dy / len : 0;
                  const ny = len > 0 ? dx / len : 0;
                  for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    const wave = Math.sin(t * Math.PI * 4);
                    points.push({ 
                       x: nx * wave * 0.6, 
                       y: ny * wave * 0.6, 
                       width: 0.5 + Math.random() * 0.5,
                       alpha: 0.3 + Math.random() * 0.4
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
          }
          if (newEntity && !drawing.isVirtual) {
              setEntities(prev => {
                if (newEntity!.type === 'line') {
                    const newE = newEntity as LineEntity;
                    
                    // Look for any line that can be merged with this one
                    const mergeTargetIndex = prev.findIndex(ent => {
                        if (ent.type === 'line' && ent.layer === newE.layer && ent.mode === newE.mode) {
                            const entL = ent as LineEntity;
                            // Check if ends match start or vice versa
                            const connected = (Math.abs(entL.end.x - newE.start.x) < 0.1 && Math.abs(entL.end.y - newE.start.y) < 0.1) ||
                                              (Math.abs(entL.start.x - newE.end.x) < 0.1 && Math.abs(entL.start.y - newE.end.y) < 0.1);
                            if (!connected) return false;
                            
                            const dx1 = entL.end.x - entL.start.x;
                            const dy1 = entL.end.y - entL.start.y;
                            const dx2 = newE.end.x - newE.start.x;
                            const dy2 = newE.end.y - newE.start.y;
                            const collinear = Math.abs(dx1 * dy2 - dy1 * dx2) < 2.0;

                            return collinear;
                        }
                        return false;
                    });
                    
                    if (mergeTargetIndex !== -1) {
                         const target = prev[mergeTargetIndex] as LineEntity;
                         const updated = [...prev];
                         
                         // Determine new endpoints
                         let start = target.start;
                         let end = target.end;
                         
                         if (Math.abs(target.end.x - newE.start.x) < 0.1 && Math.abs(target.end.y - newE.start.y) < 0.1) {
                             end = newE.end;
                         } else {
                             start = newE.start;
                         }
                         
                         updated[mergeTargetIndex] = {
                             ...target,
                             start,
                             end,
                             inkPoints: target.inkPoints && newE.inkPoints ? [...target.inkPoints, ...newE.inkPoints] : undefined
                         };
                         return updated;
                    }
                }
                return [...prev, newEntity!];
              });
          }
          
          if (activeTool === 'Line') {
              // Start next segment
              const isFreehandMode = defaultLineStyle.mode === 'ink' && !orthoMode;
              setDrawing({ 
                start: snappedResult.point, 
                current: snappedResult.point, 
                snapType: snappedResult.type, 
                refPoint: snappedResult.refPoint,
                constraintAxis: snappedResult.constraintAxis,
                refPoint2: snappedResult.refPoint2,
                constraintAxis2: snappedResult.constraintAxis2,
                hasDoubleSmart: snappedResult.hasDoubleSmart,
                activeConstraint: undefined,
                isVirtual: isShiftPressed, // Check if the NEXT one should be virtual
                isFreehand: isFreehandMode,
                freehandPoints: isFreehandMode ? [snappedResult.point] : undefined
              });
          } else {
              setDrawing(null);
          }
          return;
      }

      const isFreehandMode = activeTool === 'Line' && defaultLineStyle.mode === 'ink' && !orthoMode;
      setDrawing({ 
        start: snapped.point, 
        current: snapped.point, 
        snapType: snapped.type, 
        refPoint: snapped.refPoint,
        constraintAxis: snapped.constraintAxis,
        refPoint2: snapped.refPoint2,
        constraintAxis2: snapped.constraintAxis2,
        hasDoubleSmart: snapped.hasDoubleSmart,
        activeConstraint: undefined,
        isVirtual: isShiftPressed, // Marking the start as virtual if Shift is held
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
    } else if (activeTool === 'Parallel') {
        // Reset (Duplicate removed)
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
        executeTrim(rawPoint);
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
    mouseScreenPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const rawPoint = getDampenedCoordinate(screenToCanvas(e.clientX - rect.left, e.clientY - rect.top), e);
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

      if (activeTool === 'Line' && defaultLineStyle.mode === 'ink' && !orthoMode && e.buttons === 1 && drawing.isFreehand) {
          const prevPoints = drawing.freehandPoints || [drawing.start];
          const lastPt = prevPoints[prevPoints.length - 1];
          const distToLast = Math.sqrt(Math.pow(rawPoint.x - lastPt.x, 2) + Math.pow(rawPoint.y - lastPt.y, 2));
          let nextPoints = prevPoints;
          if (distToLast > 0.5) { // 0.5 in canvas units
              nextPoints = [...prevPoints, rawPoint];
          }
          setDrawing({
              ...drawing,
              current: rawPoint,
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
              } else if (!e.shiftKey) {
                finalPoint = applyAngleSnapping(drawing.start, rawPoint);
              }
            }

            const snapped = getSnappedPoint(finalPoint, entities, activeTool, drawing);
            let snappedPoint = snapped.point;
            if (activeTool === 'Line' && orthoMode && !snapped.snapped) {
              // absolute rigidity of Ortho line: project snapping back onto orthogonal coordinate
              snappedPoint = isOrthoHorizontal ? { x: snappedPoint.x, y: drawing.start.y } : { x: drawing.start.x, y: snappedPoint.y };
            }
            // If it's a smart snap while in ortho mode, ensure it stays orthogonal if it's alignment-based
            if (activeTool === 'Line' && orthoMode && snapped.snapped && snapped.type === 'smart') {
                snappedPoint = isOrthoHorizontal ? { x: snappedPoint.x, y: drawing.start.y } : { x: drawing.start.x, y: snappedPoint.y };
            }

            setDrawing({ 
                ...drawing, 
                current: snappedPoint, 
                snapType: snapped.snapped ? snapped.type : undefined, 
                refPoint: snapped.refPoint,
                refEntityId: snapped.refEntityId,
                constraintAxis: snapped.constraintAxis,
                refPoint2: snapped.refPoint2,
                constraintAxis2: snapped.constraintAxis2,
                hasDoubleSmart: snapped.hasDoubleSmart,
                activeConstraint: undefined,
                isVirtual: drawing.isVirtual // Preserve virtual status during move
            });
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
    const bgSnaps = getSnapPoints(rawPoint, staticEntities, 'Move', null).filter(s => s.type === 'standard');

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
                if (ent.type === 'line') return { ...ent, start: { x: ent.start.x + deltaX, y: ent.start.y + deltaY }, end: { x: ent.end.x + deltaX, y: ent.end.y + deltaY } };
                if (ent.type === 'circle') return { ...ent, center: { x: ent.center.x + deltaX, y: ent.center.y + deltaY } };
                if (ent.type === 'rectangle') return { ...ent, p1: { x: ent.p1.x + deltaX, y: ent.p1.y + deltaY }, p2: { x: ent.p2.x + deltaX, y: ent.p2.y + deltaY } };
                if (ent.type === 'point') return { ...ent, point: { x: ent.point.x + deltaX, y: ent.point.y + deltaY } };
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
    }

    const isFreehandMode = activeTool === 'Line' && defaultLineStyle.mode === 'ink' && !orthoMode;
    if (!drawing && !isFreehandMode && (activeTool === 'Line' || activeTool === 'Rectangle' || activeTool === 'Circle' || activeTool === 'Arc' || activeTool === 'Dimension' || activeTool === 'Move' || activeTool === 'Copy')) {
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
    if (activeTool === 'Line' && defaultLineStyle.mode === 'ink' && !orthoMode && drawing && drawing.isFreehand && drawing.freehandPoints && drawing.freehandPoints.length > 2) {
        const pts = drawing.freehandPoints;
        const newEntity: Entity = {
            id: Date.now().toString(),
            type: 'line',
            color: defaultLineStyle.color,
            lineWidth: defaultLineStyle.lineWidth,
            dashed: defaultLineStyle.dashed,
            mode: 'ink',
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
        if (activeTool === 'Cancella' && ids.length > 0) {
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
    
    // Toggle style if in drawing mode and NOT yet drawing the first point
    const isDrawingTool = ['Line', 'Circle', 'Arc', 'Rectangle', 'Point', 'Dimension'].includes(activeTool);
    if (isDrawingTool && !drawing) {
        setDefaultLineStyle(prev => ({ ...prev, mode: prev.mode === 'ink' ? 'pencil' : 'ink' }));
        return;
    }

    // Right click as ESC
    const escAction = () => {
        setDrawing(null);
        setIsLocked(false);
        setHighlightedTrimSegment(null);
        setSelectedParallelLine(null);
        setActiveMoveSnapPoint(null);
        setDragEntityIds([]);
        setDragEntityId(null);
        setShowManualInput(false);
        setIsParallelWheelActive(false);
    };

    escAction();
    onContextMenu?.(e);
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
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        updateJolly(e);
        if (e.key === 'Escape') {
            setDrawing(null);
            setIsLocked(false);
            setHighlightedTrimSegment(null);
            setSelectedParallelLine(null);
            setActiveMoveSnapPoint(null);
            setDragEntityIds([]);
            setShowManualInput(false);
            setIsParallelWheelActive(false);
        } else if (e.key === 'Enter') {
            if (activeTool === 'Join') confirmJoin();
        } else if (!showManualInput && /^[0-9\.\-]$/.test(e.key)) {
            if ((drawing && !drawing.isFreehand && (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Rectangle')) ||
                (activeTool === 'Parallel' && selectedParallelLine)) {
                setShowManualInput(true);
            }
        }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
        updateJolly(e);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeTool, dragEntityIds, entities, drawing, selectedParallelLine, showManualInput]);

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
            layer: activeLayerId
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

  const tecnigrafoSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><rect x="38" y="108" width="90" height="16" fill="rgba(212,163,115,0.7)" stroke="#8b5a2b" stroke-width="1"/><rect x="38" y="108" width="90" height="6" fill="rgba(255,255,255,0.7)" stroke="#8b5a2b" stroke-width="0.5"/><line x1="40" y1="108" x2="40" y2="112" stroke="black" stroke-width="1"/><line x1="50" y1="108" x2="50" y2="114" stroke="black" stroke-width="1.5"/><line x1="60" y1="108" x2="60" y2="112" stroke="black" stroke-width="1"/><line x1="70" y1="108" x2="70" y2="112" stroke="black" stroke-width="1"/><line x1="80" y1="108" x2="80" y2="114" stroke="black" stroke-width="1.5"/><line x1="90" y1="108" x2="90" y2="112" stroke="black" stroke-width="1"/><line x1="100" y1="108" x2="100" y2="112" stroke="black" stroke-width="1"/><line x1="110" y1="108" x2="110" y2="114" stroke="black" stroke-width="1.5"/><line x1="120" y1="108" x2="120" y2="112" stroke="black" stroke-width="1"/><rect x="4" y="0" width="16" height="90" fill="rgba(212,163,115,0.7)" stroke="#8b5a2b" stroke-width="1"/><rect x="14" y="0" width="6" height="90" fill="rgba(255,255,255,0.7)" stroke="#8b5a2b" stroke-width="0.5"/><line x1="20" y1="88" x2="16" y2="88" stroke="black" stroke-width="1"/><line x1="20" y1="78" x2="14" y2="78" stroke="black" stroke-width="1.5"/><line x1="20" y1="68" x2="16" y2="68" stroke="black" stroke-width="1"/><line x1="20" y1="58" x2="16" y2="58" stroke="black" stroke-width="1"/><line x1="20" y1="48" x2="14" y2="48" stroke="black" stroke-width="1.5"/><line x1="20" y1="38" x2="16" y2="38" stroke="black" stroke-width="1"/><line x1="20" y1="28" x2="16" y2="28" stroke="black" stroke-width="1"/><line x1="20" y1="18" x2="14" y2="18" stroke="black" stroke-width="1.5"/><line x1="20" y1="8" x2="16" y2="8" stroke="black" stroke-width="1"/><circle cx="20" cy="108" r="18" fill="transparent" stroke="rgba(50,50,50,0.6)" stroke-width="1"/><line x1="8" y1="108" x2="32" y2="108" stroke="rgba(255,0,0,0.8)" stroke-width="1"/><line x1="20" y1="96" x2="20" y2="120" stroke="rgba(255,0,0,0.8)" stroke-width="1"/></svg>`);

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
            groupId
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

  const scissorsSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="7.5" r="3" stroke="#64748b" stroke-width="1.5"/><circle cx="5" cy="16.5" r="3" stroke="#64748b" stroke-width="1.5"/><path d="M7.5 9L12 12L22 9" stroke="#64748b" stroke-width="1.5" stroke-linecap="round"/><path d="M7.5 15L12 12L22 15" stroke="#64748b" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="1.2" fill="#475569"/></svg>`);
  
  const pencilSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M0,0 L3,1 L1,3 Z" fill="#1e293b"/><path d="M3,1 L7,3 L3,7 L1,3 Z" fill="#fed7aa"/><path d="M7,3 L21,17 L17,21 L3,7 Z" fill="#4f46e5"/><path d="M7,3 L21,17 L19,19 L5,5 Z" fill="#6366f1"/><path d="M21,17 L24,20 L20,24 L17,21 Z" fill="#94a3b8"/><path d="M24,20 L28,24 L24,28 L20,24 Z" fill="#fda4af"/></svg>`);

  const crosshairSvg = `data:image/svg+xml;utf8,` + encodeURIComponent(`<svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="48" x2="96" y2="48" stroke="rgba(255,40,40,0.85)" stroke-width="1.5"/><line x1="48" y1="0" x2="48" y2="96" stroke="rgba(255,40,40,0.85)" stroke-width="1.5"/><circle cx="48" cy="48" r="4" fill="transparent" stroke="rgba(0,0,0,0.6)" stroke-width="1"/></svg>`);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full relative" 
      style={{ cursor: dragTavolaId ? 'grabbing' : hoverTavolaEdge ? 'grab' : (activeTool === 'Eraser' || (activeTool === 'Parallel' && selectedParallelLine)) ? 'none' : activeTool === 'Trim' ? `url("${scissorsSvg}") 16 16, crosshair` : defaultLineStyle.mode === 'ink' ? `url("${pencilSvg}") 0 0, crosshair` : rulerStyle === 'crosshair' ? `url("${crosshairSvg}") 48 48, crosshair` : `url("${tecnigrafoSvg}") 20 108, crosshair` }}
      onWheel={handleWheel} 
      onMouseDown={handleMouseDown} 
      onMouseMove={handleMouseMove} 
      onMouseUp={handleMouseUp} 
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <canvas ref={canvasRef} />
      
      {/* Precision Lens Manual Input */}
      {isPrecisionActive && showManualInput && bubblePosition && (
          <ManualInputOverlay
              type={activeTool === "Parallel" ? "parallel" : (activeTool.toLowerCase() as any)}
              drawing={drawing || undefined}
              parallelLine={activeTool === "Parallel" ? { 
                  start: (selectedParallelLine as LineEntity).start, 
                  end: (selectedParallelLine as LineEntity).end, 
                  mouse: actualMousePosRef.current,
                  distance: parallelDistance
              } : undefined}
              canvasToScreen={canvasToScreen}
              onCommit={(data) => { 
                  setShowManualInput(false); 
                  setBubblePosition(null);
                  handleManualCommit(activeTool, data); 
              }}
              isOpen={showManualInput}
              onClose={() => {
                  setShowManualInput(false);
                  setBubblePosition(null);
              }}
              position={bubblePosition}
          />
      )}

      {drawing && !drawing.isFreehand && (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Rectangle') && drawing.wheelLength === undefined && (
        <ManualInputOverlay
            type={activeTool.toLowerCase() as any}
            drawing={drawing}
            canvasToScreen={canvasToScreen}
            onCommit={(data) => { setShowManualInput(false); handleManualCommit(activeTool, data); }}
            isOpen={showManualInput}
            onClose={() => setShowManualInput(false)}
        />
      )}
      {activeTool === 'Parallel' && selectedParallelLine && parallelMouse && !isParallelWheelActive && (
        <ManualInputOverlay
            type="parallel"
            parallelLine={{ 
                start: (selectedParallelLine as LineEntity).start, 
                end: (selectedParallelLine as LineEntity).end, 
                mouse: parallelMouse,
                distance: parallelDistance
            }}
            canvasToScreen={canvasToScreen}
            onCommit={(data) => { setShowManualInput(false); handleManualCommit(activeTool, data); }}
            isOpen={showManualInput}
            onClose={() => setShowManualInput(false)}
        />
      )}
      {/* ManualInputOverlay for other tools if needed */}
    </div>
  );
});
