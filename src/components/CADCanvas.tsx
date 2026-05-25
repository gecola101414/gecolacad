import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Entity, Point, Layer } from '../types';

export interface CADCanvasAPI {
  getCurrentMousePosition: () => Point;
}

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
}

export const CADCanvas = React.forwardRef<CADCanvasAPI, CADCanvasProps>(({ entities, activeTool, setEntities, setEntitiesSilent, onCommitHistory, onSelect, onContextMenu, activeLayerId, layers, defaultLineStyle, eraserRadius, setEraserRadius, onMouseMovePosition }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const [drawing, setDrawing] = useState<{start: Point, current: Point, snapType?: 'standard' | 'smart', refPoint?: Point, activeConstraint?: { axis: 'x' | 'y', value: number }} | null>(null);
  const [selectedParallelLine, setSelectedParallelLine] = useState<Entity | null>(null);
  const [highlightedTrimLine, setHighlightedTrimLine] = useState<Entity | null>(null);
  const [highlightedTrimSegment, setHighlightedTrimSegment] = useState<{start: Point, end: Point} | null>(null);
  const [hoverSnap, setHoverSnap] = useState<{ point: Point; snapped: boolean; type: 'standard' | 'smart'; refPoint?: Point; constraintAxis?: 'x' | 'y' } | null>(null);
  const [dragEntityId, setDragEntityId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({x: 0, y: 0});
  const [eraserPos, setEraserPos] = useState({x: 0, y: 0});
  const [parallelDistance, setParallelDistance] = useState<number>(0);
  const [parallelMouse, setParallelMouse] = useState<Point | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [positioningDimId, setPositioningDimId] = useState<string | null>(null);
  const lastMouseRef = useRef<Point>({ x: 0, y: 0 });
  const lastEraserExecutionTime = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
     setDrawing(null);
     setSelectedParallelLine(null);
     setHighlightedTrimLine(null);
     setHighlightedTrimSegment(null);
     setDragEntityId(null);
     setPositioningDimId(null);
     setParallelMouse(null);
  }, [activeTool]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'it-IT';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
          setIsListening(false);
          // Auto-restart if we are still in a drawing action that needs it
          if (drawingRef.current || (activeToolRef.current === 'Parallel' && selectedParallelLineRef.current)) {
              try { recognition.start(); } catch(e) {}
          }
      };
      recognition.onerror = (event: any) => {
          setIsListening(false);
          if (event.error !== 'aborted' && (drawingRef.current || (activeToolRef.current === 'Parallel' && selectedParallelLineRef.current))) {
              try { recognition.start(); } catch(e) {}
          }
      };

      recognition.onresult = (event: any) => {
        // Need to access latest `drawing` state... might need a ref for `drawing` itself too.
        // Actually, for simplicity in React, I can use a ref for `drawingRef` that's always in sync.
      };
      recognitionRef.current = recognition;
    }
  }, []); // Only on mount

  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setBlink(prev => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Sync drawing to a ref too
  const drawingRef = useRef(drawing);
  const activeToolRef = useRef(activeTool);
  const selectedParallelLineRef = useRef(selectedParallelLine);
  useEffect(() => {
    drawingRef.current = drawing;
    activeToolRef.current = activeTool;
    selectedParallelLineRef.current = selectedParallelLine;
  }, [drawing, activeTool, selectedParallelLine]);
  
  // Re-define recognition.onresult to use drawingRef
  useEffect(() => {
    const itNumberWords: Record<string, number> = {
        'uno': 1, 'due': 2, 'tre': 3, 'quattro': 4, 'cinque': 5, 'sei': 6, 'sette': 7, 'otto': 8, 'nove': 9, 'dieci': 10,
        'venti': 20, 'trenta': 30, 'quaranta': 40, 'cinquanta': 50, 'sessanta': 60, 'settanta': 70, 'ottanta': 80, 'novanta': 90,
        'cento': 100
    };

    if (recognitionRef.current) {
        recognitionRef.current.onresult = (event: any) => {
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript.toLowerCase();
                console.log('Transcript:', transcript);
                if (event.results[i].isFinal) {
                    let length = NaN;
                    // Try matching digits
                    const normalizedTranscript = transcript.replace(',', '.');
                    const digitMatch = normalizedTranscript.match(/\d+(\.\d+)?/);
                    if (digitMatch) {
                        length = parseFloat(digitMatch[0]);
                    } else {
                        // Try matching words
                        for (const [word, val] of Object.entries(itNumberWords)) {
                            if (transcript.includes(word)) {
                                length = val;
                                break;
                            }
                        }
                    }

                    if (!isNaN(length)) {
                        console.log('Detected length/distance:', length);
                        if (activeToolRef.current === 'Line' && drawingRef.current) {
                            const dx = drawingRef.current.current.x - drawingRef.current.start.x;
                            const dy = drawingRef.current.current.y - drawingRef.current.start.y;
                            const currentLength = Math.sqrt(dx * dx + dy * dy);
                            if (currentLength > 0) {
                                const ratio = length / currentLength;
                                const newEnd = {
                                    x: drawingRef.current.start.x + dx * ratio,
                                    y: drawingRef.current.start.y + dy * ratio
                                };
                                setDrawing(prev => prev ? { ...prev, current: newEnd } : null);
                                setIsLocked(true);
                            }
                        } else if (activeToolRef.current === 'Parallel' && selectedParallelLineRef.current) {
                            const line = selectedParallelLineRef.current;
                            // Normal vector
                            const dx = line.end.x - line.start.x;
                            const dy = line.end.y - line.start.y;
                            const L = Math.sqrt(dx * dx + dy * dy);
                            if (L > 0) {
                                const normX = -dy / L;
                                const normY = dx / L;

                                // Direction vector relative to start point
                                const vecMouse = { x: lastMouseRef.current.x - line.start.x, y: lastMouseRef.current.y - line.start.y };
                                const dot = vecMouse.x * normX + vecMouse.y * normY;
                                
                                const dir = dot > 0 ? 1 : -1;
                                
                                const offsetX = normX * length * dir;
                                const offsetY = normY * length * dir;
                                
                                const newLine = {
                                    id: Date.now().toString(),
                                    type: 'line',
                                    color: 'white',
                                    lineWidth: 2,
                                    start: { x: line.start.x + offsetX, y: line.start.y + offsetY },
                                    end: { x: line.end.x + offsetX, y: line.end.y + offsetY },
                                    layer: 'Layer 0'
                                };
                                setEntities(prev => [...prev, newLine]);
                                onSelect(null);
                                setSelectedParallelLine(null);
                                if (recognitionRef.current) {
                                    try { recognitionRef.current.stop(); } catch(e) {}
                                }
                            }
                        }
                    }
                }
            }
        };
    }
  }, [setDrawing]);

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
        keyPoints.push(entity.start); keyPoints.push(entity.end);
        snaps.push({point: { x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2 }, type: 'standard', refPoint: { x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2 }});
      } else if (entity.type === 'circle') {
        snaps.push({point: entity.center, type: 'standard', refPoint: entity.center});
        keyPoints.push(entity.center);
      } else if (entity.type === 'rectangle') {
        snaps.push({point: entity.p1, type: 'standard', refPoint: entity.p1});
        snaps.push({point: entity.p2, type: 'standard', refPoint: entity.p2});
        keyPoints.push(entity.p1); keyPoints.push(entity.p2);
        const p3 = { x: entity.p1.x, y: entity.p2.y };
        const p4 = { x: entity.p2.x, y: entity.p1.y };
        snaps.push({point: p3, type: 'standard', refPoint: p3});
        snaps.push({point: p4, type: 'standard', refPoint: p4});
        keyPoints.push(p3); keyPoints.push(p4);
      }
    });

    // Intersection points
    const lines = visibleEntities.filter(ent => ent.type === 'line');
    for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
            const l1 = lines[i] as any;
            const l2 = lines[j] as any;
            const denom = (l2.end.y - l2.start.y) * (l1.end.x - l1.start.x) - (l2.end.x - l2.start.x) * (l1.end.y - l1.start.y);
            if (denom !== 0) {
                const ua = ((l2.end.x - l2.start.x) * (l1.start.y - l2.start.y) - (l2.end.y - l2.start.y) * (l1.start.x - l2.start.x)) / denom;
                const ub = ((l1.end.x - l1.start.x) * (l1.start.y - l2.start.y) - (l1.end.y - l1.start.y) * (l1.start.x - l2.start.x)) / denom;
                if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
                    const intersection = { x: l1.start.x + ua * (l1.end.x - l1.start.x), y: l1.start.y + ua * (l1.end.y - l1.start.y) };
                    snaps.push({point: intersection, type: 'standard'});
                }
            }
        }
    }

    if (activeTool === 'Line' && drawing) {
        keyPoints.forEach(kp => {
            snaps.push({point: { x: drawing.start.x, y: kp.y }, type: 'smart', refPoint: kp, constraintAxis: 'y'});
            snaps.push({point: { x: kp.x, y: drawing.start.y }, type: 'smart', refPoint: kp, constraintAxis: 'x'});
        });

        const connectedLines = visibleEntities.filter(ent => ent.type === 'line' && (
            (Math.abs(ent.start.x - drawing.start.x) < 1 && Math.abs(ent.start.y - drawing.start.y) < 1) ||
            (Math.abs(ent.end.x - drawing.start.x) < 1 && Math.abs(ent.end.y - drawing.start.y) < 1)
        ));
        
        connectedLines.forEach(lineEnt => {
            const line = lineEnt as Extract<Entity, { type: 'line' }>;
            const dx = line.end.x - line.start.x;
            const dy = line.end.y - line.start.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            const ux = dx/len;
            const uy = dy/len;
            const px = -uy;
            const py = ux;
            
            snaps.push({point: { x: drawing.start.x + px*len, y: drawing.start.y + py*len }, type: 'smart', refPoint: drawing.start});
        });
    }
    
    return snaps;
  };

  const getSnappedPoint = (point: Point, entities: Entity[], activeTool: string, drawing: {start: Point, current: Point} | null): { point: Point; snapped: boolean; type: 'standard' | 'smart'; refPoint?: Point; constraintAxis?: 'x' | 'y' } => {
    const snaps = getSnapPoints(point, entities, activeTool, drawing);
    const threshold = 15 / view.zoom;
    
    let closestSnap = null;
    let minDistance = Infinity;

    for (const snap of snaps) {
      const dist = Math.sqrt((point.x - snap.point.x) ** 2 + (point.y - snap.point.y) ** 2);
      if (dist < threshold && dist < minDistance) {
        minDistance = dist;
        closestSnap = snap;
      }
    }

    if (closestSnap) {
      return { point: closestSnap.point, snapped: true, type: closestSnap.type, refPoint: closestSnap.refPoint, constraintAxis: closestSnap.constraintAxis };
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
        } else if (activeTool === 'Eraser' && highlightedTrimSegment && entity.id === highlightedTrimLine?.id) {
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

        if (activeTool === 'Eraser' && highlightedTrimSegment && entity.id === highlightedTrimLine?.id) {
             // Draw yellow highlight
             ctx.strokeStyle = 'cyan'; // Changed highlight color for Eraser
             ctx.lineWidth = (entity.lineWidth + 4) / view.zoom;
             ctx.beginPath();
             ctx.moveTo(highlightedTrimSegment.start.x, highlightedTrimSegment.start.y);
             ctx.lineTo(highlightedTrimSegment.end.x, highlightedTrimSegment.end.y);
             ctx.stroke();
        }
        ctx.setLineDash([]);
      });

      // Eraser cursor
      if (activeTool === 'Eraser') {
          ctx.strokeStyle = '#000000'; // Black circle
          ctx.lineWidth = 1 / view.zoom;
          ctx.beginPath();
          ctx.arc(eraserPos.x, eraserPos.y, eraserRadius / view.zoom, 0, Math.PI * 2);
          ctx.stroke();
      }

      // Draw current drawing preview
      if (drawing && (activeTool === 'Line' || activeTool === 'Circle' || activeTool === 'Rectangle')) {
        ctx.strokeStyle = (defaultLineStyle.mode === 'pencil') ? 'rgba(136, 136, 136, 0.5)' : 'rgba(0, 0, 0, 1.0)';
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
        
        // Render snap indicator
        ctx.strokeStyle = drawing.snapType === 'smart' ? 'yellow' : 'cyan';
        ctx.lineWidth = 2 / view.zoom;
        ctx.beginPath();
        ctx.rect(drawing.current.x - 5/view.zoom, drawing.current.y - 5/view.zoom, 10/view.zoom, 10/view.zoom);
        ctx.stroke();
        
        if (drawing.snapType === 'smart' && drawing.refPoint) {
            ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 1 / view.zoom;
            ctx.beginPath();
            ctx.moveTo(drawing.current.x, drawing.current.y);
            ctx.lineTo(drawing.refPoint.x, drawing.refPoint.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
      }

      // Render hover snap indicator
      if (!drawing && hoverSnap && hoverSnap.snapped) {
        ctx.strokeStyle = hoverSnap.type === 'smart' ? 'yellow' : 'cyan';
        ctx.lineWidth = 2 / view.zoom;
        ctx.beginPath();
        ctx.rect(hoverSnap.point.x - 5/view.zoom, hoverSnap.point.y - 5/view.zoom, 10/view.zoom, 10/view.zoom);
        ctx.stroke();

        if (hoverSnap.type === 'smart' && hoverSnap.refPoint) {
            ctx.setLineDash([5 / view.zoom, 5 / view.zoom]);
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 1 / view.zoom;
            ctx.beginPath();
            ctx.moveTo(hoverSnap.point.x, hoverSnap.point.y);
            ctx.lineTo(hoverSnap.refPoint.x, hoverSnap.refPoint.y);
            ctx.stroke();
            ctx.setLineDash([]);
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
                    const dist = Math.sqrt((rawPoint.x - ent.center.x)**2 + (rawPoint.y - ent.center.y)**2);
                    if (dist <= radius) hit = true;
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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) return; // Let onContextMenu handle right clicks
    if (e.button === 1) {
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
      
      if (drawing && activeTool === 'Line') {
          const finalPoint = wasLocked ? drawing.current : (e.altKey ? rawPoint : applyAngleSnapping(drawing.start, rawPoint));
          const snappedForLine = wasLocked ? { point: finalPoint, type: 'standard' as const, refPoint: undefined } : getSnappedPoint(finalPoint, entities, activeTool, drawing);
          
          const newEntity: Entity = {
            id: Date.now().toString(),
            type: 'line',
            color: defaultLineStyle.color,
            lineWidth: defaultLineStyle.lineWidth,
            dashed: defaultLineStyle.dashed,
            mode: defaultLineStyle.mode,
            start: drawing.start,
            end: snappedForLine.point,
            layer: defaultLineStyle.lineWidth > 1 ? 'Spessori' : activeLayerId
          };
          setEntities(prev => [...prev, newEntity]);
          
          // Start next segment
          setDrawing({ 
            start: snappedForLine.point, 
            current: snappedForLine.point, 
            snapType: snappedForLine.type, 
            refPoint: snappedForLine.refPoint,
            activeConstraint: undefined
          });
          if (recognitionRef.current && !isListening) {
            try { recognitionRef.current.start(); } catch(e) {}
          }
          return;
      }

      setDrawing({ 
        start: snapped.point, 
        current: snapped.point, 
        snapType: snapped.type, 
        refPoint: snapped.refPoint,
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
      if (recognitionRef.current && !isListening) {
        try {
          recognitionRef.current.start();
        } catch (e) {
             console.error('Failed to start recognition', e);
        }
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
      if (found) {
          setSelectedParallelLine(found);
          if (recognitionRef.current && !isListening) {
            try {
              recognitionRef.current.start();
            } catch (e) {
                 console.error('Failed to start recognition', e);
            }
          }
      }
    } else if (activeTool === 'Dimension') {
        const clickedEntity = getEntityAtPoint(rawPoint);
        if (clickedEntity && clickedEntity.type === 'dimension') {
            setPositioningDimId(clickedEntity.id);
        } else {
            const found = getLineAtPoint(rawPoint);
            if (found && found.type === 'line') {
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
    } else if (activeTool === 'Eraser') {
        const rawPoint = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
        setEraserPos(rawPoint);
        executeEraser(rawPoint, true);
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
      let finalPoint = rawPoint;
      
      // Apply constraint enforcement
      if (drawing.activeConstraint) {
          if (drawing.activeConstraint.axis === 'x') finalPoint.x = drawing.activeConstraint.value;
          else finalPoint.y = drawing.activeConstraint.value;
      }
      
      // Angle snapping only makes sense for lines
      if (activeTool === 'Line' && !e.altKey) {
        finalPoint = applyAngleSnapping(drawing.start, rawPoint);
      }

      const snapped = getSnappedPoint(finalPoint, entities, activeTool, drawing);
      setDrawing({ 
          ...drawing, 
          current: snapped.point, 
          snapType: snapped.type, 
          refPoint: snapped.refPoint,
          activeConstraint: undefined
      });
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

        const line = getLineAtPoint(rawPoint);
        setHighlightedTrimLine(line || null);
        
        if (e.buttons === 1) {
             executeEraser(rawPoint, false);
        }
        
        if (line && line.type === 'line') {
             // Calculate intersection to define highlighted segment
             const getIntersection = (l1: any, l2: any): Point | null => {
                const x1 = l1.start.x, y1 = l1.start.y, x2 = l1.end.x, y2 = l1.end.y;
                const x3 = l2.start.x, y3 = l2.start.y, x4 = l2.end.x, y4 = l2.end.y;
                const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
                if (denom === 0) return null;
                const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
                const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
                if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
                    return { x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1) };
                }
                return null;
            };

            let closestIntersection: Point | null = null;
            let minDistance = Infinity;

            entities.forEach(ent => {
                if (ent.id !== line.id && ent.type === 'line') {
                    const intersection = getIntersection(line, ent);
                    if (intersection) {
                        const dist = Math.sqrt((rawPoint.x - intersection.x)**2 + (rawPoint.y - intersection.y)**2);
                        if (dist < minDistance) {
                            minDistance = dist;
                            closestIntersection = intersection;
                        }
                    }
                }
            });

            if (closestIntersection) {
                const distStart = Math.sqrt((rawPoint.x - line.start.x)**2 + (rawPoint.y - line.start.y)**2);
                const distEnd = Math.sqrt((rawPoint.x - line.end.x)**2 + (rawPoint.y - line.end.y)**2);
                
                setHighlightedTrimSegment({
                    start: distStart < distEnd ? line.start : closestIntersection,
                    end: distStart < distEnd ? closestIntersection : line.end
                });
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
    if (drawing && (activeTool === 'Circle' || activeTool === 'Rectangle')) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const rawPoint = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
      
      let finalPoint = rawPoint;
      if (isLocked) {
        finalPoint = drawing.current;
      }

      const snapped = getSnappedPoint(finalPoint, entities, activeTool, drawing);
      
      let newEntity: Entity;

      if (activeTool === 'Circle') {
        const radius = Math.sqrt(Math.pow(snapped.point.x - drawing.start.x, 2) + Math.pow(snapped.point.y - drawing.start.y, 2));
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
      } else if (activeTool === 'Point') {
          newEntity = {
            id: Date.now().toString(),
            type: 'point',
            color: defaultLineStyle.color,
            lineWidth: defaultLineStyle.lineWidth,
            mode: defaultLineStyle.mode,
            point: snapped.point,
            layer: defaultLineStyle.lineWidth > 1 ? 'Spessori' : activeLayerId
          };
      } else {
        newEntity = {
          id: Date.now().toString(),
          type: 'rectangle',
          color: defaultLineStyle.color,
          lineWidth: defaultLineStyle.lineWidth,
          dashed: defaultLineStyle.dashed,
          mode: defaultLineStyle.mode,
          p1: drawing.start,
          p2: snapped.point,
          layer: defaultLineStyle.lineWidth > 1 ? 'Spessori' : activeLayerId
        };
      }

      setEntities(prev => [...prev, newEntity]);
      setDrawing(null);
      setIsLocked(false);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
      }
    } else if (activeTool === 'Move') {
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
            if (recognitionRef.current) {
               try { recognitionRef.current.stop(); } catch(e) {}
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full cursor-crosshair relative" onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onContextMenu={handleContextMenu}>
      <canvas ref={canvasRef} />
      
      {/* Visual Overlay: Angle preview for 'Line' tool */}
      {drawing && activeTool === 'Line' && (
        <div style={{
            position: 'absolute',
            left: canvasToScreen(drawing.current.x, drawing.current.y).x + 10 + 'px',
            top: canvasToScreen(drawing.current.x, drawing.current.y).y + 10 + 'px',
        }} className="bg-slate-800 text-white p-2 rounded text-sm pointer-events-none flex flex-col gap-1">
            {(() => {
                const L = Math.sqrt(Math.pow(drawing.current.x - drawing.start.x, 2) + Math.pow(drawing.current.y - drawing.start.y, 2));
                const numValue = Math.round(L * 100) / 100;
                const valueStr = Number.isInteger(numValue) ? numValue.toString() : numValue.toFixed(2).replace('.', ',');
                return <span>L: {valueStr}</span>;
            })()}
            {(() => {
                const A = (Math.atan2(drawing.current.y - drawing.start.y, drawing.current.x - drawing.start.x) * 180 / Math.PI + 360) % 360;
                const aNum = Math.round(A * 10) / 10;
                const aStr = Number.isInteger(aNum) ? aNum.toString() : aNum.toFixed(1).replace('.', ',');
                return <span>A: {aStr}°</span>;
            })()}
        </div>
      )}

      {/* Visual Overlay: Distance preview for 'Parallel' tool */}
      {selectedParallelLine && activeTool === 'Parallel' && (
        <div style={{
            position: 'absolute',
            left: canvasToScreen(lastMouseRef.current.x, lastMouseRef.current.y).x + 10 + 'px',
            top: canvasToScreen(lastMouseRef.current.x, lastMouseRef.current.y).y + 10 + 'px',
        }} className="bg-slate-800 text-cyan-400 p-2 rounded text-sm pointer-events-none">
             Dist: {(() => {
                const line = selectedParallelLine;
                const dxLine = line.end.x - line.start.x;
                const dyLine = line.end.y - line.start.y;
                const L = Math.sqrt(dxLine * dxLine + dyLine * dyLine);
                const normX = -dyLine / L;
                const normY = dxLine / L;
                const vecMouse = { x: lastMouseRef.current.x - line.start.x, y: lastMouseRef.current.y - line.start.y };
                const numValue = Math.round(Math.abs(vecMouse.x * normX + vecMouse.y * normY) * 100) / 100;
                return Number.isInteger(numValue) ? numValue.toString() : numValue.toFixed(2).replace('.', ',');
             })()}
        </div>
      )}
      {isListening && (
        <div className="absolute top-2 left-2 bg-red-500 text-white p-2 rounded text-sm animate-pulse">
            Ascolto...
        </div>
      )}
    </div>
  );
});
