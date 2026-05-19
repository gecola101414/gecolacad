import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Entity, Point } from '../types';

interface CADCanvasProps {
  entities: Entity[];
  activeTool: string;
  setEntities: React.Dispatch<React.SetStateAction<Entity[]>>;
  onSelect: (id: string | null) => void;
  onMouseMovePosition: (pos: Point) => void;
}

export interface CADCanvasAPI {
  getCurrentMousePosition: () => Point;
}

interface CADCanvasProps {
  entities: Entity[];
  activeTool: string;
  setEntities: React.Dispatch<React.SetStateAction<Entity[]>>;
  onSelect: (id: string | null) => void;
}

export const CADCanvas = React.forwardRef<CADCanvasAPI, CADCanvasProps>(({ entities, activeTool, setEntities, onSelect }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ zoom: 1, pan: { x: 0, y: 0 } });
  const [drawing, setDrawing] = useState<{start: Point, current: Point} | null>(null);
  const [selectedParallelLine, setSelectedParallelLine] = useState<Entity | null>(null);
  const [parallelDistance, setParallelDistance] = useState<number>(0);
  const [parallelMouse, setParallelMouse] = useState<Point | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const lastMouseRef = useRef<Point>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'it-IT';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

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

  const getSnapPoints = (entities: Entity[]): Point[] => {
    const points: Point[] = [];
    entities.forEach(entity => {
      if (entity.type === 'line') {
        points.push(entity.start);
        points.push(entity.end);
        points.push({ x: (entity.start.x + entity.end.x) / 2, y: (entity.start.y + entity.end.y) / 2 });
      } else if (entity.type === 'circle') {
        points.push(entity.center);
      } else if (entity.type === 'rectangle') {
        points.push(entity.p1);
        points.push(entity.p2);
        points.push({ x: entity.p1.x, y: entity.p2.y });
        points.push({ x: entity.p2.x, y: entity.p1.y });
      }
    });
    return points;
  };

  const getSnappedPoint = (point: Point, entities: Entity[]): { point: Point; snapped: boolean } => {
    const snaps = getSnapPoints(entities);
    const threshold = 15 / view.zoom;
    for (const snap of snaps) {
      const dist = Math.sqrt((point.x - snap.x) ** 2 + (point.y - snap.y) ** 2);
      if (dist < threshold) {
        return { point: snap, snapped: true };
      }
    }
    return { point, snapped: false };
  };

  const getLineAtPoint = (point: Point): Entity | undefined => {
    for (const ent of entities) {
        if (ent.type === 'line') {
            const dist = Math.abs((ent.end.y - ent.start.y) * point.x - (ent.end.x - ent.start.x) * point.y + ent.end.x * ent.start.y - ent.end.y * ent.start.x) / 
                         Math.sqrt((ent.end.y - ent.start.y) ** 2 + (ent.end.x - ent.start.x) ** 2);
            if (dist < 10 / view.zoom) {
                return ent;
            }
        }
    }
    return undefined;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear and draw based on view state
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(view.pan.x, view.pan.y);
      ctx.scale(view.zoom, view.zoom);

      // Draw existing entities
      entities.forEach(entity => {
        ctx.strokeStyle = entity.color;
        ctx.lineWidth = entity.lineWidth / view.zoom;
        if (entity.id === selectedParallelLine?.id && blink) {
          ctx.strokeStyle = 'yellow';
          ctx.lineWidth = (entity.lineWidth + 4) / view.zoom;
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
        } else if (entity.type === 'circle') {
          ctx.arc(entity.center.x, entity.center.y, entity.radius, 0, Math.PI * 2);
        } else if (entity.type === 'rectangle') {
          const width = entity.p2.x - entity.p1.x;
          const height = entity.p2.y - entity.p1.y;
          ctx.rect(entity.p1.x, entity.p1.y, width, height);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Draw current drawing preview
      if (drawing && activeTool === 'Line') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2 / view.zoom;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(drawing.start.x, drawing.start.y);
        ctx.lineTo(drawing.current.x, drawing.current.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Render snap indicator
        ctx.strokeStyle = 'cyan';
        ctx.lineWidth = 2 / view.zoom;
        ctx.beginPath();
        ctx.rect(drawing.current.x - 5/view.zoom, drawing.current.y - 5/view.zoom, 10/view.zoom, 10/view.zoom);
        ctx.stroke();
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

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        canvas.width = entry.contentRect.width;
        canvas.height = entry.contentRect.height;
        render();
      }
    });
    resizeObserver.observe(container);

    render(); // Initial render

    return () => resizeObserver.disconnect();
  }, [entities, view, drawing, activeTool, selectedParallelLine, blink, parallelMouse]);

  // Basic pan/zoom handling
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setView(prev => ({
      ...prev,
      zoom: Math.max(0.1, prev.zoom * zoomFactor)
    }));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawPoint = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
    lastMouseRef.current = rawPoint;
    const snapped = getSnappedPoint(rawPoint, entities);

    if (activeTool === 'Select') {
        onSelect(null);
    } else if (activeTool === 'Line') {
      setIsLocked(false);
      setDrawing({ start: snapped.point, current: snapped.point });
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
             console.error('Failed to start recognition', e);
        }
      }
    } else if (activeTool === 'Parallel') {
      const found = getLineAtPoint(rawPoint);
      if (found) {
          setSelectedParallelLine(found);
          if (recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {
                 console.error('Failed to start recognition', e);
            }
          }
      }
    } else {
      // Pan/Zoom handling
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

    if (drawing) {
      if (isLocked) return;
      let finalPoint = rawPoint;

      if (!e.altKey) {
        finalPoint = applyAngleSnapping(drawing.start, rawPoint);
      }

      const snapped = getSnappedPoint(finalPoint, entities);
      setDrawing({ ...drawing, current: snapped.point });
    } else if (activeTool === 'Parallel' && selectedParallelLine) {
        setParallelMouse(rawPoint);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (drawing && activeTool === 'Line') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const rawPoint = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
      
      let finalPoint = rawPoint;
      if (isLocked) {
        finalPoint = drawing.current;
      } else {
          // Apply angle snapping if ALT is not pressed
          if (!e.altKey) {
            finalPoint = applyAngleSnapping(drawing.start, rawPoint);
          }
      }

      const snapped = getSnappedPoint(finalPoint, entities);

      const newLine = {
        id: Date.now().toString(),
        type: 'line',
        color: 'white',
        lineWidth: 2,
        start: drawing.start,
        end: snapped.point,
        layer: 'Layer 0'
      };

      setEntities(prev => [...prev, newLine]);
      setDrawing(null);
      setIsLocked(false);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeTool !== 'Select') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawPoint = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);

    const found = getLineAtPoint(rawPoint);
    onSelect(found ? found.id : null);
  };

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
            <span>L: {Math.sqrt(Math.pow(drawing.current.x - drawing.start.x, 2) + Math.pow(drawing.current.y - drawing.start.y, 2)).toFixed(2)}</span>
            <span>A: {((Math.atan2(drawing.current.y - drawing.start.y, drawing.current.x - drawing.start.x) * 180 / Math.PI + 360) % 360).toFixed(1)}°</span>
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
                return Math.abs(vecMouse.x * normX + vecMouse.y * normY).toFixed(2);
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
